"""
Pipeline Service - Orchestrates end-to-end test execution of research streams

This service coordinates:
1. Retrieval: Execute broad search queries from PubMed
2. Deduplication (query-level): Find duplicates within each query
3. Semantic Filtering: Apply AI-powered relevance filters per query
4. Deduplication (global): Find duplicates across all filtered results
5. Categorization: Assign articles to presentation categories using LLM
6. Summary Generation: Generate executive summary and per-category summaries using LLM
7. Report Generation: Save results to reports and report_article_associations tables

All intermediate results are stored in wip_articles table for audit trail and debugging.

Retrieval Strategy:
- Broad Search: 1-3 simple, wide-net queries optimized for weekly monitoring
- Note: Concept-based retrieval is not supported
"""

from typing import AsyncGenerator, Dict, List, Optional, Tuple, Any, Callable, Coroutine
from dataclasses import dataclass, field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import and_, or_
from datetime import date, datetime
import asyncio
import json
import uuid
import logging

logger = logging.getLogger(__name__)

# Type alias for progress callbacks
ProgressCallback = Callable[[int, int], Coroutine[Any, Any, None]]

from models import (
    ResearchStream,
    Report,
    ReportArticleAssociation,
    Article,
    WipArticle,
    InformationSource,
    RunType,
    PipelineExecution,
)
from schemas.research_stream import RetrievalConfig, PresentationConfig
from services.pubmed_service import PubMedService
from services.ai_evaluation_service import get_ai_evaluation_service
from agents.prompts.llm import ModelConfig, LLMOptions
from services.article_categorization_service import ArticleCategorizationService
from services.research_stream_service import ResearchStreamService
from services.report_summary_service import ReportSummaryService
from services.wip_article_service import WipArticleService
from services.report_service import ReportService
from services.report_article_association_service import ReportArticleAssociationService


@dataclass
class PipelineContext:
    """
    Context object passed between pipeline stages.

    Immutable fields are set during config loading.
    Mutable fields are updated as stages execute.
    """

    # === Immutable (set during config loading) ===
    execution_id: str
    execution: "PipelineExecution"
    stream: "ResearchStream"
    research_stream_id: int
    user_id: int
    start_date: Optional[str]
    end_date: Optional[str]
    report_name: Optional[str]
    queries: List[Any]  # List of BroadSearchQuery from retrieval_config
    categories: List[Dict]  # From presentation_config (for LLM prompts)
    presentation_config: Any  # Full PresentationConfig object
    enrichment_config: Optional[Dict]  # Custom prompts configuration (snapshot)
    llm_config: Optional[Dict]  # LLM configuration (snapshot)

    # === Mutable (accumulated during execution) ===
    total_retrieved: int = 0
    filter_stats: Dict[str, Dict[str, int]] = field(default_factory=dict)
    global_duplicates: int = 0
    included_count: int = 0
    categorized_count: int = 0
    categorize_errors: int = 0
    executive_summary: str = ""
    category_summaries: Dict[str, str] = field(default_factory=dict)
    report: Optional["Report"] = None

    def final_metrics(self) -> Dict[str, Any]:
        """Build metrics dict for completion status."""
        return {
            "report_id": self.report.report_id if self.report else None,
            "total_retrieved": self.total_retrieved,
            "final_article_count": (
                len(self.report.article_associations) if self.report else 0
            ),
            "filter_stats": self.filter_stats,
            "global_duplicates": self.global_duplicates,
            "included_count": self.included_count,
            "categorized_count": self.categorized_count,
        }


class PipelineStatus:
    """Status update yielded during pipeline execution"""

    def __init__(self, stage: str, message: str, data: Optional[Dict] = None):
        self.stage = stage
        self.message = message
        self.data = data or {}
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self):
        return {
            "stage": self.stage,
            "message": self.message,
            "data": self.data,
            "timestamp": self.timestamp,
        }


class PipelineService:
    """Orchestrates end-to-end pipeline execution for research streams"""

    # Hard limits to prevent runaway execution
    MAX_ARTICLES_PER_SOURCE = 1000
    MAX_TOTAL_ARTICLES = 1000

    def __init__(self, db: Session):
        self.db = db
        self.research_stream_service = ResearchStreamService(db)
        self.wip_article_service = WipArticleService(db)
        self.report_service = ReportService(db)
        self.association_service = ReportArticleAssociationService(db)
        self.pubmed_service = PubMedService()
        self.eval_service = get_ai_evaluation_service()
        self.categorization_service = ArticleCategorizationService()
        self.summary_service = ReportSummaryService()

    # =========================================================================
    # ENTITY LOOKUPS
    # =========================================================================

    def get_execution_by_id(self, execution_id: str) -> PipelineExecution:
        """
        Get a pipeline execution by ID, raising ValueError if not found.

        Args:
            execution_id: The execution ID (UUID string)

        Returns:
            PipelineExecution model instance

        Raises:
            ValueError: if execution not found
        """
        execution = (
            self.db.query(PipelineExecution)
            .filter(PipelineExecution.id == execution_id)
            .first()
        )
        if not execution:
            raise ValueError(f"Pipeline execution {execution_id} not found")
        return execution

    # =========================================================================
    # MODEL CONFIGURATION HELPERS
    # =========================================================================

    # Default model configuration for each stage
    DEFAULT_MODEL_CONFIG = {
        "semantic_filter": {"model": "gpt-4.1", "temperature": 0.0},
        "categorization": {"model": "gpt-4.1", "temperature": 0.0},
        "article_summary": {"model": "gpt-4.1", "temperature": 0.0},
        "category_summary": {"model": "gpt-4.1", "temperature": 0.0},
        "executive_summary": {"model": "gpt-4.1", "temperature": 0.0},
    }

    def _get_stage_llm_config(
        self, ctx: "PipelineContext", stage: str
    ) -> Dict[str, Any]:
        """
        Get LLM configuration for a specific pipeline stage.

        Args:
            ctx: Pipeline context with llm_config snapshot
            stage: One of: semantic_filter, categorization, article_summary,
                   category_summary, executive_summary

        Returns:
            Dict with 'model' and either 'temperature' or 'reasoning_effort'
        """
        if ctx.llm_config and stage in ctx.llm_config:
            stage_config = ctx.llm_config[stage]
            # Merge with defaults to ensure all required keys exist
            return {**self.DEFAULT_MODEL_CONFIG.get(stage, {}), **stage_config}
        return self.DEFAULT_MODEL_CONFIG.get(
            stage, {"model": "gpt-4.1", "temperature": 0.3}
        )

    # =========================================================================
    # PIPELINE ORCHESTRATION
    # =========================================================================

    async def _stream_with_progress(
        self,
        task_coro: Coroutine,
        stage: str,
        progress_msg_template: str = "Processing: {completed}/{total}",
        heartbeat_msg: str = "Processing...",
        extra_data: Optional[Dict] = None,
        progress_interval: int = 5,
        heartbeat_timeout: float = 3.0,
    ) -> AsyncGenerator[Tuple[PipelineStatus, Any], None]:
        """
        Run a long-running task while yielding progress updates.

        The task should accept an `on_progress` callback as a keyword argument.
        Yields (status, None) during progress, then (final_status, result) at end.

        Args:
            task_coro: Coroutine that accepts on_progress callback
            stage: Stage name for status messages
            progress_msg_template: Message template with {completed} and {total}
            heartbeat_msg: Message for heartbeat status
            extra_data: Extra data to include in all status messages
            progress_interval: Report progress every N items
            heartbeat_timeout: Seconds to wait before yielding heartbeat
        """
        progress_queue: asyncio.Queue[Tuple[int, int]] = asyncio.Queue()
        extra = extra_data or {}

        async def progress_callback(completed: int, total: int):
            if (
                completed == 1
                or completed == total
                or completed % progress_interval == 0
            ):
                await progress_queue.put((completed, total))

        # Start the task - inject the progress callback
        task = asyncio.create_task(task_coro(on_progress=progress_callback))

        # Yield progress updates while task runs
        while not task.done():
            try:
                completed, total = await asyncio.wait_for(
                    progress_queue.get(), timeout=heartbeat_timeout
                )
                yield PipelineStatus(
                    stage,
                    progress_msg_template.format(completed=completed, total=total),
                    {"completed": completed, "total": total, **extra},
                ), None
            except asyncio.TimeoutError:
                yield PipelineStatus(
                    stage, heartbeat_msg, {"heartbeat": True, **extra}
                ), None

        # Drain remaining progress
        while not progress_queue.empty():
            try:
                progress_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Get result and yield final status with it
        result = await task
        yield PipelineStatus(stage, "Complete", extra), result

    async def _load_execution_context(self, execution_id: str) -> PipelineContext:
        """
        Load execution record and build PipelineContext.

        Raises ValueError if execution not found or configuration invalid.
        """
        # Load execution record (single source of truth)
        execution = self.get_execution_by_id(execution_id)

        # Load stream for context (name, purpose, etc.)
        stream = self.research_stream_service.get_stream_by_id(execution.stream_id)

        # Parse retrieval config from execution snapshot
        retrieval_config = RetrievalConfig.model_validate(execution.retrieval_config)

        # Validate retrieval strategy
        if retrieval_config.concepts and len(retrieval_config.concepts) > 0:
            raise ValueError(
                "Concept-based retrieval is not supported in pipeline execution"
            )

        if (
            not retrieval_config.broad_search
            or not retrieval_config.broad_search.queries
        ):
            raise ValueError("No broad search queries configured")

        # Parse presentation config
        presentation_config = PresentationConfig.model_validate(
            execution.presentation_config
        )

        # Prepare categories for categorization
        categories = []
        if presentation_config.categories:
            categories = [
                {
                    "id": cat.id,
                    "name": cat.name,
                    "topics": cat.topics,
                    "specific_inclusions": cat.specific_inclusions,
                }
                for cat in presentation_config.categories
            ]

        # Get enrichment_config and llm_config from execution snapshot
        enrichment_config = execution.enrichment_config
        llm_config = execution.llm_config

        return PipelineContext(
            execution_id=execution_id,
            execution=execution,
            stream=stream,
            research_stream_id=execution.stream_id,
            user_id=execution.user_id,
            start_date=execution.start_date,
            end_date=execution.end_date,
            report_name=execution.report_name,
            queries=retrieval_config.broad_search.queries,
            categories=categories,
            presentation_config=presentation_config,
            enrichment_config=enrichment_config,
            llm_config=llm_config,
        )

    async def run_pipeline(
        self, execution_id: str
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        ALL configuration is read from the PipelineExecution record.
        Each stage is independently testable and owns its commit.

        Args:
            execution_id: The PipelineExecution ID - ALL config is read from this record

        Yields:
            PipelineStatus: Status updates at each stage
        """
        try:
            # Load configuration
            yield PipelineStatus("init", "Loading execution configuration...")
            ctx = await self._load_execution_context(execution_id)
            logger.info(
                f"Starting pipeline for execution_id={execution_id}, stream_id={ctx.research_stream_id}"
            )

            yield PipelineStatus(
                "init",
                "Configuration loaded",
                {
                    "execution_id": execution_id,
                    "stream_name": ctx.stream.stream_name,
                    "num_queries": len(ctx.queries),
                    "num_categories": len(ctx.categories),
                    "date_range": f"{ctx.start_date} to {ctx.end_date}",
                },
            )

            # Execute pipeline stages
            async for status in self._stage_retrieval(ctx):
                yield status
            async for status in self._stage_semantic_filter(ctx):
                yield status
            async for status in self._stage_deduplicate(ctx):
                yield status
            async for status in self._stage_generate_report(ctx):
                yield status  # Creates bare associations
            async for status in self._stage_categorize(ctx):
                yield status  # Writes categories to associations
            async for status in self._stage_generate_article_summaries(ctx):
                yield status  # Writes ai_summary to associations
            async for status in self._stage_generate_summaries(ctx):
                yield status  # Executive/category summaries

            # Complete
            yield PipelineStatus(
                "complete", "Pipeline execution complete", ctx.final_metrics()
            )

        except Exception as e:
            logger.error(
                f"Pipeline failed for execution_id={execution_id}: {type(e).__name__}: {str(e)}",
                exc_info=True,
            )
            yield PipelineStatus(
                "error",
                f"Pipeline failed: {str(e)}",
                {"error": str(e), "error_type": type(e).__name__},
            )
            raise

    # =========================================================================
    # PIPELINE STAGES
    # =========================================================================

    async def _stage_retrieval(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Execute retrieval for each broad search query.
        Commits: WipArticle records for all retrieved articles.
        """
        yield PipelineStatus(
            "retrieval",
            f"Starting retrieval for {len(ctx.queries)} queries",
            {"num_queries": len(ctx.queries)},
        )

        for query in ctx.queries:
            # Check limits
            if ctx.total_retrieved >= self.MAX_TOTAL_ARTICLES:
                yield PipelineStatus(
                    "retrieval",
                    f"Hit MAX_TOTAL_ARTICLES limit ({self.MAX_TOTAL_ARTICLES})",
                    {"limit_reached": True},
                )
                break

            yield PipelineStatus(
                "retrieval",
                f"Fetching: {query.search_terms}",
                {
                    "query_id": query.query_id,
                    "query_expression": query.query_expression,
                },
            )

            count = await self._fetch_and_store_articles(
                research_stream_id=ctx.research_stream_id,
                execution_id=ctx.execution_id,
                retrieval_unit_id=query.query_id,
                source_id="pubmed",
                query_expression=query.query_expression,
                start_date=ctx.start_date,
                end_date=ctx.end_date,
            )

            ctx.total_retrieved += count

            yield PipelineStatus(
                "retrieval",
                f"Retrieved {count} articles",
                {
                    "query_id": query.query_id,
                    "count": count,
                    "total": ctx.total_retrieved,
                },
            )

        # Stage commit
        self.wip_article_service.commit()

        yield PipelineStatus(
            "retrieval",
            f"Retrieval complete: {ctx.total_retrieved} articles",
            {"total_retrieved": ctx.total_retrieved},
        )

    async def _stage_semantic_filter(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Apply semantic filters to retrieved articles.
        Commits: Filter scores and pass/fail decisions on WipArticles.
        """
        yield PipelineStatus("filter", "Applying semantic filters...")

        # Get model configuration for semantic filter stage
        filter_model_cfg = self._get_stage_llm_config(ctx, "semantic_filter")
        filter_model = filter_model_cfg.get("model")
        filter_temp = filter_model_cfg.get("temperature")
        filter_reasoning = filter_model_cfg.get("reasoning_effort")

        for query in ctx.queries:
            if not query.semantic_filter.enabled:
                yield PipelineStatus(
                    "filter",
                    "Filter disabled for query",
                    {"query_id": query.query_id, "filtered": False},
                )
                continue

            # Capture query-specific values for lambda closure
            q = query  # Avoid closure over loop variable

            # Stream progress while filtering
            result = None
            async for status, res in self._stream_with_progress(
                task_coro=lambda on_progress, q=q: self._apply_semantic_filter(
                    execution_id=ctx.execution_id,
                    retrieval_unit_id=q.query_id,
                    filter_criteria=q.semantic_filter.criteria,
                    threshold=q.semantic_filter.threshold,
                    on_progress=on_progress,
                    model=filter_model,
                    temperature=filter_temp,
                    reasoning_effort=filter_reasoning,
                ),
                stage="filter",
                progress_msg_template="Filtering: {completed}/{total}",
                heartbeat_msg="Processing...",
                extra_data={"query_id": query.query_id},
            ):
                if res is not None:
                    result = res
                else:
                    yield status

            passed, rejected, errors = result
            ctx.filter_stats[query.query_id] = {"passed": passed, "rejected": rejected, "errors": errors}

            yield PipelineStatus(
                "filter",
                f"Filtered: {passed} passed, {rejected} rejected",
                {"query_id": query.query_id, "passed": passed, "rejected": rejected},
            )

        # Stage commit
        self.wip_article_service.commit()

        yield PipelineStatus(
            "filter", "Semantic filtering complete", {"stats": ctx.filter_stats}
        )

    async def _stage_deduplicate(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Deduplicate globally and mark articles for inclusion.
        Commits: Duplicate flags and included_in_report flags.
        """
        yield PipelineStatus("dedup_global", "Deduplicating across all groups...")

        ctx.global_duplicates = await self._deduplicate_globally(
            ctx.research_stream_id, ctx.execution_id
        )

        yield PipelineStatus(
            "dedup_global",
            f"Found {ctx.global_duplicates} cross-query duplicates",
            {"duplicates": ctx.global_duplicates},
        )

        # Mark articles for inclusion
        ctx.included_count = await self._mark_articles_for_report(ctx.execution_id)

        # Stage commit
        self.wip_article_service.commit()

        yield PipelineStatus(
            "dedup_global",
            f"Marked {ctx.included_count} articles for report inclusion",
            {"included": ctx.included_count},
        )

    async def _stage_categorize(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Categorize articles into presentation categories.
        Commits: presentation_categories on ReportArticleAssociations.

        Requires: Report must already exist (ctx.report populated).
        """
        yield PipelineStatus("categorize", "Categorizing articles...")

        # Get LLM config for categorization
        model_cfg = self._get_stage_llm_config(ctx, "categorization")

        # Stream progress while categorizing
        result = None
        async for status, res in self._stream_with_progress(
            task_coro=lambda on_progress: self._categorize_articles(
                report_id=ctx.report.report_id,
                presentation_config=ctx.presentation_config,
                model=model_cfg.get("model"),
                temperature=model_cfg.get("temperature"),
                on_progress=on_progress,
            ),
            stage="categorize",
            progress_msg_template="Categorizing: {completed}/{total}",
            heartbeat_msg="Processing...",
        ):
            if res is not None:
                result = res
            else:
                yield status

        ctx.categorized_count, ctx.categorize_errors = result

        if ctx.categorize_errors > 0:
            yield PipelineStatus(
                "categorize",
                f"Categorized {ctx.categorized_count} articles ({ctx.categorize_errors} failed)",
                {"categorized": ctx.categorized_count, "errors": ctx.categorize_errors},
            )
        else:
            yield PipelineStatus(
                "categorize",
                f"Categorized {ctx.categorized_count} articles",
                {"categorized": ctx.categorized_count},
            )

    async def _stage_generate_article_summaries(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate AI summaries for individual articles.
        Commits: ai_summary written to ReportArticleAssociation.
        """
        # Use enrichment_config from execution snapshot
        enrichment_config = ctx.enrichment_config

        # Get LLM config for article summaries
        model_cfg = self._get_stage_llm_config(ctx, "article_summary")

        yield PipelineStatus("article_summaries", "Generating article summaries...")

        # Stream progress while generating
        result = None
        async for status, res in self._stream_with_progress(
            task_coro=lambda on_progress: self._generate_article_summaries(
                report_id=ctx.report.report_id,
                stream=ctx.stream,
                enrichment_config=enrichment_config,
                model=model_cfg.get("model"),
                temperature=model_cfg.get("temperature"),
                on_progress=on_progress,
            ),
            stage="article_summaries",
            progress_msg_template="Summarizing: {completed}/{total}",
            heartbeat_msg="Generating summaries...",
        ):
            if res is not None:
                result = res
            else:
                yield status

        # Stage commit
        self.db.commit()

        yield PipelineStatus(
            "article_summaries",
            f"Generated {result} article summaries",
            {"generated": result},
        )

    async def _generate_article_summaries(
        self,
        report_id: int,
        stream: Any,
        enrichment_config: Dict[str, Any],
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        on_progress: Optional[callable] = None,
    ) -> int:
        """
        Generate AI summaries for articles in a report.

        Returns:
            Number of summaries generated
        """
        # Get associations - assoc.article gives us the Article with abstract
        associations = self.association_service.get_visible_for_report(report_id)

        # Filter to associations with articles that have abstracts
        articles_to_summarize = [
            assoc for assoc in associations if assoc.article and assoc.article.abstract
        ]

        if not articles_to_summarize:
            return 0

        # Generate summaries - create wrapper objects that include filter_score_reason from WipArticle
        class ArticleWithFilterReason:
            """Wrapper to combine Article data with WipArticle's filter_score_reason"""
            def __init__(self, article, wip_article):
                self._article = article
                self._wip_article = wip_article

            def __getattr__(self, name):
                if name == 'filter_score_reason':
                    return self._wip_article.filter_score_reason if self._wip_article else None
                return getattr(self._article, name)

        articles = [
            ArticleWithFilterReason(assoc.article, assoc.wip_article)
            for assoc in articles_to_summarize
        ]
        article_summaries = await self.summary_service.generate_article_summaries_batch(
            articles=articles,
            stream_purpose=stream.purpose,
            stream_name=stream.stream_name,
            enrichment_config=enrichment_config,
            max_concurrency=5,
            on_progress=on_progress,
            model=model,
            temperature=temperature,
        )

        # Build results for bulk update (wrapper objects proxy article_id from underlying Article)
        article_id_to_summary = {
            wrapper.article_id: summary for wrapper, summary in article_summaries
        }
        association_updates = [
            (assoc, article_id_to_summary[assoc.article.article_id])
            for assoc in articles_to_summarize
            if article_id_to_summary.get(assoc.article.article_id)
        ]

        # Write to associations
        if association_updates:
            return self.association_service.bulk_set_ai_summary_from_pipeline(
                association_updates
            )
        return 0

    async def _stage_generate_summaries(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate executive summary and category summaries.
        Commits: None (summaries stored in ctx only).
        """
        yield PipelineStatus("summary", "Generating summaries...")

        # Get LLM configs for summary stages
        category_summary_cfg = self._get_stage_llm_config(ctx, "category_summary")
        executive_summary_cfg = self._get_stage_llm_config(ctx, "executive_summary")

        # Run summary generation with heartbeat
        summary_task = asyncio.create_task(
            self._generate_summaries(
                research_stream_id=ctx.research_stream_id,
                execution_id=ctx.execution_id,
                report_id=ctx.report.report_id,
                stream=ctx.stream,
                presentation_config=ctx.presentation_config,
                enrichment_config=ctx.enrichment_config,
                category_summary_model_cfg=category_summary_cfg,
                executive_summary_model_cfg=executive_summary_cfg,
            )
        )

        while not summary_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(summary_task), timeout=5.0)
            except asyncio.TimeoutError:
                yield PipelineStatus(
                    "summary",
                    f"Generating summaries for {len(ctx.categories)} categories...",
                    {"heartbeat": True, "num_categories": len(ctx.categories)},
                )

        ctx.executive_summary, ctx.category_summaries = await summary_task

        # Update the report with the generated summaries
        if ctx.report:
            self.db.refresh(ctx.report)
            ctx.report.enrichments = {
                "executive_summary": ctx.executive_summary,
                "category_summaries": ctx.category_summaries,
            }
            flag_modified(ctx.report, "enrichments")
            ctx.report.original_enrichments = ctx.report.enrichments.copy()
            flag_modified(ctx.report, "original_enrichments")
            self.db.commit()
            logger.info(f"Saved executive summary and {len(ctx.category_summaries)} category summaries to report {ctx.report.report_id}")

        yield PipelineStatus(
            "summary",
            f"Generated executive summary and {len(ctx.category_summaries)} category summaries",
            {"categories": len(ctx.category_summaries)},
        )

    async def _stage_generate_report(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate final report with article associations.
        Commits: Report, execution.report_id, Articles, ReportArticleAssociations.

        CRITICAL: This stage sets execution.report_id and commits it properly.
        """
        yield PipelineStatus("report", "Generating report...")

        ctx.report = await self._create_report(
            ctx=ctx,
            executive_summary=ctx.executive_summary,
            category_summaries=ctx.category_summaries,
            metrics={
                "total_retrieved": ctx.total_retrieved,
                "filter_stats": ctx.filter_stats,
                "global_duplicates": ctx.global_duplicates,
                "included_in_report": ctx.included_count,
                "categorized": ctx.categorized_count,
            },
        )

        yield PipelineStatus(
            "report",
            f"Report created successfully",
            {
                "report_id": ctx.report.report_id,
                "article_count": len(ctx.report.article_associations),
            },
        )

    async def _create_report(
        self,
        ctx: PipelineContext,
        executive_summary: str,
        category_summaries: Dict[str, str],
        metrics: Dict,
    ) -> Report:
        """
        Create report with proper execution.report_id linkage.

        Only promotes articles with included_in_report=True from WipArticle.
        WipArticle remains the source of truth for all pipeline decisions.
        See docs/_specs/article-curation-flow.md for full documentation.

        CRITICAL: This method sets ctx.execution.report_id and commits everything
        in a single transaction to ensure the link is persisted.
        """
        # Build enrichments
        enrichments = {
            "executive_summary": executive_summary,
            "category_summaries": category_summaries,
        }

        # Create report
        report_date_obj = date.today()
        final_report_name = (
            ctx.report_name if ctx.report_name else report_date_obj.strftime("%Y.%m.%d")
        )

        report = self.report_service.create_report(
            user_id=ctx.user_id,
            research_stream_id=ctx.research_stream_id,
            report_date=report_date_obj,
            title=final_report_name,
            pipeline_execution_id=ctx.execution_id,
            executive_summary=executive_summary,
            enrichments=enrichments,
        )

        report.pipeline_metrics = metrics
        report.is_read = False

        # Store original values for curation comparison
        report.original_report_name = final_report_name
        report.original_enrichments = enrichments.copy()

        # Get only INCLUDED articles (included_in_report=True)
        wip_articles = self.wip_article_service.get_included_articles(ctx.execution_id)

        # Create Article records and associations for included articles only
        for idx, wip_article in enumerate(wip_articles):
            # Check for existing article
            existing_article = None
            if wip_article.doi:
                existing_article = (
                    self.db.query(Article)
                    .filter(Article.doi == wip_article.doi)
                    .first()
                )

            if not existing_article and wip_article.pmid:
                existing_article = (
                    self.db.query(Article)
                    .filter(Article.pmid == wip_article.pmid)
                    .first()
                )

            if existing_article:
                article = existing_article
            else:
                article = Article(
                    source_id=wip_article.source_id,
                    title=wip_article.title,
                    url=wip_article.url,
                    authors=wip_article.authors,
                    publication_date=wip_article.publication_date,
                    summary=wip_article.summary,
                    abstract=wip_article.abstract,
                    full_text=wip_article.full_text,
                    pmid=wip_article.pmid,
                    doi=wip_article.doi,
                    journal=wip_article.journal,
                    volume=wip_article.volume,
                    issue=wip_article.issue,
                    pages=wip_article.pages,
                    year=wip_article.year,
                    article_metadata=wip_article.article_metadata,
                    fetch_count=1,
                )
                self.db.add(article)
                self.db.flush()

            # Create bare association - categories and summaries populated in later stages
            association = ReportArticleAssociation(
                report_id=report.report_id,
                article_id=article.article_id,
                wip_article_id=wip_article.id,  # Link back to pipeline data
                ranking=idx + 1,
                is_read=False,
                is_starred=False,
                original_ranking=idx + 1,
            )
            self.db.add(association)

        # Set bidirectional link: execution -> report
        # This MUST be set before commit to persist the link
        ctx.execution.report_id = report.report_id

        # Commit everything: Report, Articles, Associations, and execution.report_id
        self.db.commit()

        return report

    # =========================================================================
    # STAGE HELPER METHODS
    # =========================================================================

    async def _fetch_and_store_articles(
        self,
        research_stream_id: int,
        execution_id: str,
        retrieval_unit_id: str,
        source_id: str,
        query_expression: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> int:
        """
        Fetch articles from a source and store all results in wip_articles table.

        IMPORTANT: This method has a critical side effect - it persists ALL retrieved
        articles to the wip_articles table for the entire pipeline to process.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (concept_id or query_id)
            source_id: Source identifier
            query_expression: Query to execute
            start_date: Start date for retrieval (YYYY/MM/DD format)
            end_date: End date for retrieval (YYYY/MM/DD format)

        Returns:
            Number of articles retrieved and stored
        """
        # Get source from database
        source = (
            self.db.query(InformationSource)
            .filter(InformationSource.source_name == source_id)
            .first()
        )

        if not source:
            raise ValueError(f"Source '{source_id}' not found")

        # Execute query based on source type
        articles = []
        if source_id.lower() == "pubmed":
            # Use PubMed service to execute query (returns tuple of articles and metadata)
            # Run in thread pool to avoid blocking the event loop (requests is synchronous)
            articles, metadata = await asyncio.to_thread(
                self.pubmed_service.search_articles,
                query=query_expression,
                max_results=self.MAX_ARTICLES_PER_SOURCE,
                start_date=start_date,
                end_date=end_date,
                date_type="publication",  # Use publication date for filtering
                sort_by="relevance",  # Most relevant first
            )
        else:
            # Other sources not yet implemented
            pass

        # Store results in wip_articles using WipArticleService
        # Articles are CanonicalResearchArticle objects (Pydantic models)
        logger.info(f"Storing {len(articles)} articles for execution_id={execution_id}")

        for article in articles:
            # Parse publication_date string to date object if present
            pub_date = None
            if article.publication_date:
                try:
                    from datetime import datetime as dt

                    pub_date = dt.fromisoformat(article.publication_date).date()
                except (ValueError, AttributeError):
                    pass  # Skip invalid dates

            self.wip_article_service.create_wip_article(
                research_stream_id=research_stream_id,
                pipeline_execution_id=execution_id,
                retrieval_group_id=retrieval_unit_id,
                source_id=source.source_id,
                title=article.title,
                url=article.url,
                authors=article.authors or [],
                publication_date=pub_date,
                abstract=article.abstract,
                pmid=article.pmid
                or (article.id if article.source == "pubmed" else None),
                doi=article.doi,
                journal=article.journal,
                year=(
                    int(article.publication_year) if article.publication_year else None
                ),
                source_specific_id=article.id,
            )

        self.wip_article_service.commit()
        return len(articles)

    async def _apply_semantic_filter(
        self,
        execution_id: str,
        retrieval_unit_id: str,
        filter_criteria: str,
        threshold: float,
        on_progress: Optional[callable] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        reasoning_effort: Optional[str] = None,
    ) -> Tuple[int, int, int]:
        """
        Apply semantic filter to articles in a retrieval unit (concept or broad query) using LLM in parallel batches.

        Args:
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (query_id)
            filter_criteria: Natural language filter criteria
            threshold: Minimum score (0-1) for article to pass
            on_progress: Optional async callback(completed, total) for progress updates
            model: Optional LLM model to use (e.g., 'o4-mini', 'gpt-4.1')
            temperature: Optional temperature for chat models
            reasoning_effort: Optional reasoning effort for reasoning models

        Returns:
            Tuple of (passed_count, rejected_count, error_count)
        """
        # Get all non-duplicate articles for this unit that haven't been filtered yet
        articles = self.wip_article_service.get_for_filtering(
            execution_id, retrieval_unit_id
        )

        if not articles:
            logger.info(
                f"No articles to filter for execution_id={execution_id}, retrieval_unit_id={retrieval_unit_id}"
            )
            return 0, 0, 0

        logger.info(
            f"Filtering {len(articles)} articles for retrieval_unit_id={retrieval_unit_id}, threshold={threshold}"
        )

        # Convert WipArticle objects to dicts for evaluation
        items = []
        article_map = {}  # Map from id to WipArticle for result matching
        for article in articles:
            article_id = str(article.id)  # Use database primary key
            article_map[article_id] = article
            items.append(
                {
                    "id": article_id,
                    "title": article.title or "",
                    "abstract": article.abstract or "",
                    "pmid": article.pmid,
                    "journal": article.journal,
                    "authors": article.authors,
                }
            )

        # Use AIEvaluationService score to get relevance scores
        results = await self.eval_service.score(
            items=items,
            criteria=filter_criteria,
            min_value=0.0,
            max_value=1.0,
            include_reasoning=True,
            include_source_data=True,  # Include full article data for LLM context
            model_config=ModelConfig(
                model=model or "gpt-4.1",
                temperature=temperature or 0.0,
                reasoning_effort=reasoning_effort,
            ),
            options=LLMOptions(
                max_concurrent=50,
                on_progress=on_progress,
            ),
        )

        # Update database with results using WipArticleService
        passed = 0
        rejected = 0
        errors = 0

        for result in results:
            article = article_map.get(result.input["id"])
            if not article:
                continue

            if not result.ok:
                # Error occurred - record it but leave passed_semantic_filter as None (unprocessed)
                # so it can be retried. Store error in filter_score_reason for visibility.
                errors += 1
                article.filter_score = None
                article.filter_score_reason = f"ERROR: {result.error}"
                # Don't set passed_semantic_filter - leave as None
                continue

            score = result.data.get("value", 0.0) if result.data else 0.0
            reasoning = result.data.get("reasoning", "") if result.data else ""
            is_relevant = score >= threshold

            self.wip_article_service.update_filter_result(
                article=article,
                passed=is_relevant,
                score=score,
                score_reason=reasoning,
            )
            if is_relevant:
                passed += 1
            else:
                rejected += 1

        self.wip_article_service.commit()
        logger.info(
            f"Filtering complete: {passed} passed, {rejected} rejected, {errors} errors out of {len(articles)} total"
        )
        return passed, rejected, errors

    async def _deduplicate_globally(
        self, research_stream_id: int, execution_id: str
    ) -> int:
        """
        Find and mark duplicates across all groups (after filtering) for this execution.
        Only considers articles that passed semantic filter and aren't already marked as dupes.

        Args:
            research_stream_id: Stream ID (for context, not used in query)
            execution_id: UUID of this pipeline execution

        Returns:
            Number of duplicates found
        """
        # Get all articles that passed filtering and aren't already marked as duplicates
        articles = self.wip_article_service.get_for_deduplication(execution_id)

        duplicates_found = 0
        seen_dois = {}
        seen_titles = {}

        for article in articles:
            # Check DOI-based deduplication
            if article.doi and article.doi.strip():
                doi_normalized = article.doi.lower().strip()
                if doi_normalized in seen_dois:
                    self.wip_article_service.mark_as_duplicate(
                        article, seen_dois[doi_normalized]
                    )
                    duplicates_found += 1
                else:
                    seen_dois[doi_normalized] = article.pmid or str(article.id)

            # Check title-based deduplication
            elif article.title:
                title_normalized = article.title.lower().strip()
                if title_normalized in seen_titles:
                    self.wip_article_service.mark_as_duplicate(
                        article, seen_titles[title_normalized]
                    )
                    duplicates_found += 1
                else:
                    seen_titles[title_normalized] = article.pmid or str(article.id)

        self.wip_article_service.commit()
        return duplicates_found

    async def _mark_articles_for_report(self, execution_id: str) -> int:
        """
        Mark articles that should be included in the final report.

        An article is included if:
        - NOT a duplicate
        - Passed semantic filter OR no filter was applied

        Args:
            execution_id: UUID of this pipeline execution

        Returns:
            Number of articles marked for inclusion
        """
        articles = self.wip_article_service.get_for_inclusion(execution_id)
        self.wip_article_service.mark_all_for_inclusion(articles)
        self.wip_article_service.commit()
        return len(articles)

    async def _categorize_articles(
        self,
        report_id: int,
        presentation_config: PresentationConfig,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        on_progress: Optional[callable] = None,
    ) -> Tuple[int, int]:
        """
        Use LLM to categorize report articles and write directly to associations.

        Args:
            report_id: Report ID (report must already exist)
            presentation_config: Presentation configuration with categories
            model: Optional model override
            temperature: Optional temperature override
            on_progress: Optional async callback(completed, total) for progress updates

        Returns:
            Tuple of (categorized_count, error_count)
        """
        # Get visible associations with their articles
        associations = self.association_service.get_visible_for_report(report_id)

        if not associations:
            logger.info(f"No articles to categorize for report_id={report_id}")
            return 0, 0

        logger.info(
            f"Categorizing {len(associations)} articles into {len(presentation_config.categories)} categories"
        )

        # Prepare category descriptions for LLM
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )

        # Build mapping from article to association
        article_to_association = {assoc.article_id: assoc for assoc in associations}
        articles = [assoc.article for assoc in associations]

        # Use centralized batch categorization (works with any article-like object)
        results, error_count = (
            await self.categorization_service.categorize_articles_batch(
                articles=articles,
                categories=categories_desc,
                max_concurrent=50,
                on_progress=on_progress,
                model=model,
                temperature=temperature,
            )
        )

        # Map results back to associations: (Article, category_id) -> (Association, category_id)
        association_results = [
            (article_to_association[article.article_id], category_id)
            for article, category_id in results
        ]

        # Update associations with results
        categorized = self.association_service.bulk_set_categories_from_pipeline(
            association_results
        )
        self.db.commit()
        logger.info(
            f"Categorization complete: {categorized} articles categorized, {error_count} errors"
        )
        return categorized, error_count

    async def _generate_summaries(
        self,
        research_stream_id: int,
        execution_id: str,
        report_id: int,
        stream: ResearchStream,
        presentation_config: PresentationConfig,
        enrichment_config: Optional[Dict[str, Any]] = None,
        category_summary_model_cfg: Optional[Dict[str, Any]] = None,
        executive_summary_model_cfg: Optional[Dict[str, Any]] = None,
    ) -> Tuple[str, Dict[str, str]]:
        """
        Generate executive summary and per-category summaries.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of pipeline execution
            report_id: Report ID (needed to get categories from associations)
            stream: ResearchStream object
            presentation_config: Presentation configuration
            enrichment_config: Custom prompts configuration
            category_summary_model_cfg: Model config for category summaries
            executive_summary_model_cfg: Model config for executive summary

        Returns:
            Tuple of (executive_summary, category_summaries_dict)
        """
        # Get all articles marked for report inclusion
        wip_articles = self.wip_article_service.get_included_articles(execution_id)

        if not wip_articles:
            return "No articles in this report.", {}

        # Get associations to read categories (categories are now on ReportArticleAssociation)
        associations = self.association_service.get_visible_for_report(report_id)
        wip_to_categories: Dict[int, List[str]] = {}
        wip_to_summary: Dict[int, str] = {}
        for assoc in associations:
            if assoc.wip_article_id:
                wip_to_categories[assoc.wip_article_id] = (
                    assoc.presentation_categories or []
                )
                wip_to_summary[assoc.wip_article_id] = assoc.ai_summary or ""

        logger.info(
            f"Generating summaries for {len(wip_articles)} articles across {len(presentation_config.categories)} categories"
        )

        # Generate category summaries in parallel
        async def generate_single_category_summary(category):
            """Generate summary for a single category"""
            try:
                # Get articles in this category (categories are now on association)
                category_articles = [
                    article
                    for article in wip_articles
                    if article.id in wip_to_categories
                    and category.id in wip_to_categories[article.id]
                ]

                if not category_articles:
                    return category.id, "No articles in this category."

                # Build category description
                category_description = f"{category.name}. "
                if category.specific_inclusions:
                    category_description += "Includes: " + ", ".join(
                        category.specific_inclusions
                    )

                # Gather article summaries for this category (if available)
                article_summaries = [
                    wip_to_summary.get(article.id, "")
                    for article in category_articles
                    if wip_to_summary.get(article.id)
                ]

                # Generate summary for this category
                summary = await self.summary_service.generate_category_summary(
                    category_name=category.name,
                    category_description=category_description,
                    wip_articles=category_articles,
                    stream_purpose=stream.purpose,
                    stream_name=stream.stream_name,
                    category_topics=category.topics,
                    enrichment_config=enrichment_config,
                    article_summaries=article_summaries,
                    model=(
                        category_summary_model_cfg.get("model")
                        if category_summary_model_cfg
                        else None
                    ),
                    temperature=(
                        category_summary_model_cfg.get("temperature")
                        if category_summary_model_cfg
                        else None
                    ),
                )
                return category.id, summary
            except Exception as e:
                logger.error(
                    f"Failed to generate summary for category {category.id}: {type(e).__name__}: {e}"
                )
                return category.id, f"Error generating summary: {str(e)}"

        # Run all category summaries in parallel with exception handling
        category_results = await asyncio.gather(
            *[
                generate_single_category_summary(cat)
                for cat in presentation_config.categories
            ],
            return_exceptions=True,
        )

        # Process results, handling any exceptions
        category_summaries = {}
        for i, result in enumerate(category_results):
            if isinstance(result, Exception):
                cat_id = presentation_config.categories[i].id
                logger.error(
                    f"Category summary task failed for {cat_id}: {type(result).__name__}: {result}"
                )
                category_summaries[cat_id] = f"Error generating summary: {str(result)}"
            else:
                cat_id, summary = result
                category_summaries[cat_id] = summary

        # Generate executive summary using category summaries
        try:
            executive_summary = await self.summary_service.generate_executive_summary(
                wip_articles=wip_articles,
                stream_purpose=stream.purpose,
                category_summaries=category_summaries,
                stream_name=stream.stream_name,
                enrichment_config=enrichment_config,
                model=(
                    executive_summary_model_cfg.get("model")
                    if executive_summary_model_cfg
                    else None
                ),
                temperature=(
                    executive_summary_model_cfg.get("temperature")
                    if executive_summary_model_cfg
                    else None
                ),
            )
        except Exception as e:
            logger.error(
                f"Failed to generate executive summary: {type(e).__name__}: {e}",
                exc_info=True,
            )
            executive_summary = f"Error generating executive summary: {str(e)}"

        logger.info(
            f"Summary generation complete: executive summary + {len(category_summaries)} category summaries"
        )
        return executive_summary, category_summaries
