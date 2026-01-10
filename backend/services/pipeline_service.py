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

from typing import AsyncGenerator, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, datetime
import asyncio
import json
import uuid
import logging

logger = logging.getLogger(__name__)

from models import (
    ResearchStream, Report, ReportArticleAssociation, Article,
    WipArticle, InformationSource, RunType, PipelineExecution
)
from schemas.research_stream import RetrievalConfig, PresentationConfig
from services.pubmed_service import PubMedService
from services.ai_evaluation_service import get_ai_evaluation_service
from services.article_categorization_service import ArticleCategorizationService
from services.research_stream_service import ResearchStreamService
from services.report_summary_service import ReportSummaryService
from services.wip_article_service import WipArticleService
from services.report_service import ReportService


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
            "timestamp": self.timestamp
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
        self.pubmed_service = PubMedService()
        self.eval_service = get_ai_evaluation_service()
        self.categorization_service = ArticleCategorizationService()
        self.summary_service = ReportSummaryService()

    async def run_pipeline(
        self,
        execution_id: str
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        ALL configuration is read from the PipelineExecution record:
        - stream_id, user_id, run_type
        - start_date, end_date, report_name
        - retrieval_config (snapshot from when execution was created)

        Pipeline stages:
        1. Load execution and configuration
        2. Execute retrieval for each broad search query
        3. Apply semantic filters per query
        4. Deduplicate globally
        5. Categorize articles
        6. Generate executive summaries (overall + per category)
        7. Generate report

        Args:
            execution_id: The PipelineExecution ID - ALL config is read from this record

        Yields:
            PipelineStatus: Status updates at each stage

        Raises:
            ValueError: If execution not found or invalid configuration
        """
        try:
            # === STAGE 1: Load Execution and Configuration ===
            yield PipelineStatus("init", "Loading execution configuration...")

            # Load execution record - single source of truth for this run
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == execution_id
            ).first()

            if not execution:
                raise ValueError(f"Pipeline execution {execution_id} not found")

            # Extract configuration from execution
            research_stream_id = execution.stream_id
            user_id = execution.user_id
            run_type = execution.run_type
            start_date = execution.start_date
            end_date = execution.end_date
            report_name = execution.report_name

            logger.info(f"Starting pipeline for execution_id={execution_id}, stream_id={research_stream_id}, run_type={run_type}")

            # Get stream for presentation_config (retrieval_config comes from execution snapshot)
            stream = self.research_stream_service.get_research_stream(
                stream_id=research_stream_id,
                user_id=user_id
            )

            # Use retrieval_config from execution (snapshot), not current stream config
            # This ensures we use the exact config that was set when the execution was created
            retrieval_config_dict = execution.retrieval_config or {}

            # Parse the retrieval config snapshot
            from schemas.research_stream import RetrievalConfig
            if retrieval_config_dict:
                retrieval_config = RetrievalConfig.model_validate(retrieval_config_dict)
            else:
                # Fallback to current stream config if no snapshot (shouldn't happen for new executions)
                retrieval_config = stream.retrieval_config
                logger.warning(f"No retrieval_config snapshot in execution {execution_id}, using current stream config")

            presentation_config = stream.presentation_config

            # Check for unsupported concept-based retrieval strategy
            if retrieval_config.concepts and len(retrieval_config.concepts) > 0:
                raise ValueError(
                    "Concept-based retrieval is not supported. "
                    "Please use broad search retrieval strategy instead."
                )

            # Validate broad search configuration exists
            if not retrieval_config.broad_search or not retrieval_config.broad_search.queries:
                raise ValueError("No broad search queries configured for this research stream")

            queries = retrieval_config.broad_search.queries
            query_count = len(queries)

            yield PipelineStatus(
                "init",
                "Configuration loaded",
                {
                    "execution_id": execution_id,
                    "stream_name": stream.stream_name,
                    "retrieval_strategy": "broad_search",
                    "num_queries": query_count,
                    "num_categories": len(presentation_config.categories),
                    "date_range": f"{start_date} to {end_date}"
                }
            )

            yield PipelineStatus("cleanup", "Ready to begin retrieval (keeping historical WIP data)")

            # === STAGE 3: Execute Retrieval ===
            # Using broad search retrieval strategy
            total_retrieved = 0

            for broad_query in queries:
                yield PipelineStatus(
                    "retrieval",
                    f"Starting retrieval for broad query: {broad_query.search_terms}",
                    {"query_id": broad_query.query_id, "search_terms": broad_query.search_terms}
                )

                # Check if we've hit limits
                if total_retrieved >= self.MAX_TOTAL_ARTICLES:
                    yield PipelineStatus(
                        "retrieval",
                        f"Hit MAX_TOTAL_ARTICLES limit ({self.MAX_TOTAL_ARTICLES}), stopping retrieval",
                        {"limit_reached": True}
                    )
                    break

                yield PipelineStatus(
                    "retrieval",
                    f"Executing broad query on PubMed",
                    {
                        "query_id": broad_query.query_id,
                        "query_expression": broad_query.query_expression
                    }
                )

                # Execute retrieval on PubMed
                articles_retrieved_count = await self._fetch_and_store_articles(
                    research_stream_id=research_stream_id,
                    execution_id=execution_id,
                    retrieval_unit_id=broad_query.query_id,
                    source_id="pubmed",
                    query_expression=broad_query.query_expression,
                    start_date=start_date,
                    end_date=end_date
                )

                total_retrieved += articles_retrieved_count

                yield PipelineStatus(
                    "retrieval",
                    f"Retrieved {articles_retrieved_count} articles",
                    {
                        "query_id": broad_query.query_id,
                        "count": articles_retrieved_count,
                        "total_retrieved": total_retrieved
                    }
                )

            yield PipelineStatus(
                "retrieval",
                f"Retrieval complete: {total_retrieved} total articles",
                {"total_retrieved": total_retrieved}
            )

            # === STAGE 4: Apply Semantic Filters ===
            yield PipelineStatus("filter", "Applying semantic filters...")

            filter_stats = {}

            for broad_query in queries:
                if not broad_query.semantic_filter.enabled:
                    yield PipelineStatus(
                        "filter",
                        f"Semantic filter disabled for query, keeping all articles",
                        {"query_id": broad_query.query_id, "filtered": False}
                    )
                    continue

                # Use asyncio.Queue to stream progress from callback
                progress_queue = asyncio.Queue()

                async def progress_with_queue(completed: int, total: int):
                    # Only report every 5 items or at boundaries to avoid overwhelming
                    if completed == 1 or completed == total or completed % 5 == 0:
                        await progress_queue.put((completed, total))

                # Start the filter in background and drain queue for progress
                filter_task = asyncio.create_task(
                    self._apply_semantic_filter(
                        execution_id=execution_id,
                        retrieval_unit_id=broad_query.query_id,
                        filter_criteria=broad_query.semantic_filter.criteria,
                        threshold=broad_query.semantic_filter.threshold,
                        on_progress=progress_with_queue
                    )
                )

                # Yield progress updates as they come in
                while not filter_task.done():
                    try:
                        # Wait for progress with timeout (acts as heartbeat)
                        completed, total = await asyncio.wait_for(progress_queue.get(), timeout=3.0)
                        yield PipelineStatus(
                            "filter",
                            f"Filtering articles: {completed}/{total}",
                            {"query_id": broad_query.query_id, "completed": completed, "total": total}
                        )
                    except asyncio.TimeoutError:
                        # No progress yet, yield heartbeat to keep connection alive
                        yield PipelineStatus(
                            "filter",
                            "Processing...",
                            {"query_id": broad_query.query_id, "heartbeat": True}
                        )

                # Get final result
                passed, rejected = await filter_task

                # Drain any remaining progress updates
                while not progress_queue.empty():
                    try:
                        progress_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break

                filter_stats[broad_query.query_id] = {"passed": passed, "rejected": rejected}

                yield PipelineStatus(
                    "filter",
                    f"Filtered query: {passed} passed, {rejected} rejected",
                    {
                        "query_id": broad_query.query_id,
                        "passed": passed,
                        "rejected": rejected
                    }
                )

            # === STAGE 5: Deduplicate Globally ===
            yield PipelineStatus("dedup_global", "Deduplicating across all groups...")

            global_dupes = await self._deduplicate_globally(research_stream_id, execution_id)

            yield PipelineStatus(
                "dedup_global",
                f"Found {global_dupes} duplicates across groups",
                {"duplicates": global_dupes}
            )

            # Mark articles for report inclusion (not duplicates, passed filter or no filter)
            included_count = await self._mark_articles_for_report(execution_id)

            yield PipelineStatus(
                "dedup_global",
                f"Marked {included_count} articles for report inclusion",
                {"included": included_count}
            )

            # === STAGE 6: Categorize Articles ===
            yield PipelineStatus("categorize", "Categorizing articles into presentation categories...")

            # Use asyncio.Queue to stream progress from callback
            categorize_progress_queue = asyncio.Queue()

            async def categorize_progress_callback(completed: int, total: int):
                # Report every 5 items or at boundaries
                if completed == 1 or completed == total or completed % 5 == 0:
                    await categorize_progress_queue.put((completed, total))

            # Start categorization in background
            categorize_task = asyncio.create_task(
                self._categorize_articles(
                    research_stream_id=research_stream_id,
                    execution_id=execution_id,
                    presentation_config=presentation_config,
                    on_progress=categorize_progress_callback
                )
            )

            # Yield progress updates as they come in
            while not categorize_task.done():
                try:
                    completed, total = await asyncio.wait_for(categorize_progress_queue.get(), timeout=3.0)
                    yield PipelineStatus(
                        "categorize",
                        f"Categorizing articles: {completed}/{total}",
                        {"completed": completed, "total": total}
                    )
                except asyncio.TimeoutError:
                    # Heartbeat to keep connection alive
                    yield PipelineStatus(
                        "categorize",
                        "Processing...",
                        {"heartbeat": True}
                    )

            # Get final result
            categorized_count = await categorize_task

            # Drain any remaining progress updates
            while not categorize_progress_queue.empty():
                try:
                    categorize_progress_queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

            yield PipelineStatus(
                "categorize",
                f"Categorized {categorized_count} articles",
                {"categorized": categorized_count}
            )

            # === STAGE 7: Generate Summaries ===
            yield PipelineStatus("summary", "Generating executive summaries...")

            # Run summary generation in background with heartbeat
            summary_task = asyncio.create_task(
                self._generate_summaries(
                    research_stream_id=research_stream_id,
                    execution_id=execution_id,
                    stream=stream,
                    presentation_config=presentation_config
                )
            )

            # Emit heartbeat while waiting for summaries
            num_categories = len(presentation_config.categories)
            while not summary_task.done():
                try:
                    # Wait up to 5 seconds for task to complete
                    await asyncio.wait_for(asyncio.shield(summary_task), timeout=5.0)
                except asyncio.TimeoutError:
                    # Task still running, emit heartbeat
                    yield PipelineStatus(
                        "summary",
                        f"Generating summaries for {num_categories} categories...",
                        {"heartbeat": True, "num_categories": num_categories}
                    )

            executive_summary, category_summaries = await summary_task

            yield PipelineStatus(
                "summary",
                f"Generated executive summary and {len(category_summaries)} category summaries",
                {"categories": len(category_summaries)}
            )

            # === STAGE 8: Generate Report ===
            yield PipelineStatus("report", "Generating report...")

            report = await self._generate_report(
                execution_id=execution_id,
                stream=stream,
                executive_summary=executive_summary,
                category_summaries=category_summaries,
                metrics={
                    "total_retrieved": total_retrieved,
                    "filter_stats": filter_stats,
                    "global_duplicates": global_dupes,
                    "included_in_report": included_count,
                    "categorized": categorized_count
                },
                report_name=report_name
            )

            yield PipelineStatus(
                "report",
                f"Report created successfully",
                {
                    "report_id": report.report_id,
                    "article_count": len(report.article_associations)
                }
            )

            # === COMPLETE ===
            yield PipelineStatus(
                "complete",
                "Pipeline execution complete",
                {
                    "report_id": report.report_id,
                    "total_retrieved": total_retrieved,
                    "final_article_count": len(report.article_associations)
                }
            )

        except Exception as e:
            logger.error(f"Pipeline failed for execution_id={execution_id}: {type(e).__name__}: {str(e)}", exc_info=True)
            yield PipelineStatus(
                "error",
                f"Pipeline failed: {str(e)}",
                {"error": str(e), "error_type": type(e).__name__}
            )
            raise

    async def _fetch_and_store_articles(
        self,
        research_stream_id: int,
        execution_id: str,
        retrieval_unit_id: str,
        source_id: str,
        query_expression: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
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
        source = self.db.query(InformationSource).filter(
            InformationSource.source_name == source_id
        ).first()

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
                sort_by="relevance"  # Most relevant first
            )
        else:
            # Other sources not yet implemented
            pass

        # Store results in wip_articles using WipArticleService
        # Articles are CanonicalResearchArticle objects (Pydantic models)
        logger.info(f"[DEBUG] Storing {len(articles)} articles with execution_id={execution_id}")

        # Verify execution exists before creating articles (debug)
        exec_check = self.db.query(PipelineExecution).filter(
            PipelineExecution.id == execution_id
        ).first()
        if exec_check:
            logger.info(f"[DEBUG] Pre-insert check: execution {execution_id} exists, status={exec_check.status}")
        else:
            logger.error(f"[DEBUG] Pre-insert check FAILED: execution {execution_id} NOT FOUND!")
            raise ValueError(f"Cannot store articles: execution {execution_id} not found in database")

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
                pmid=article.pmid or (article.id if article.source == 'pubmed' else None),
                doi=article.doi,
                journal=article.journal,
                year=int(article.publication_year) if article.publication_year else None,
                source_specific_id=article.id
            )

        try:
            self.wip_article_service.commit()
        except Exception as e:
            logger.error(f"[DEBUG] Failed to commit wip_articles with execution_id={execution_id}: {e}")
            logger.error(f"[DEBUG] Attempted to insert {len(articles)} articles for stream_id={research_stream_id}")
            raise
        return len(articles)

    async def _apply_semantic_filter(
        self,
        execution_id: str,
        retrieval_unit_id: str,
        filter_criteria: str,
        threshold: float,
        on_progress: Optional[callable] = None
    ) -> Tuple[int, int]:
        """
        Apply semantic filter to articles in a retrieval unit (concept or broad query) using LLM in parallel batches.

        Args:
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (query_id)
            filter_criteria: Natural language filter criteria
            threshold: Minimum score (0-1) for article to pass
            on_progress: Optional async callback(completed, total) for progress updates

        Returns:
            Tuple of (passed_count, rejected_count)
        """
        # Get all non-duplicate articles for this unit that haven't been filtered yet
        articles = self.wip_article_service.get_for_filtering(execution_id, retrieval_unit_id)

        if not articles:
            logger.info(f"No articles to filter for execution_id={execution_id}, retrieval_unit_id={retrieval_unit_id}")
            return 0, 0

        logger.info(f"Filtering {len(articles)} articles for retrieval_unit_id={retrieval_unit_id}, threshold={threshold}")

        # Convert WipArticle objects to dicts for evaluation
        items = []
        article_map = {}  # Map from id to WipArticle for result matching
        for article in articles:
            article_id = str(article.id)  # Use database primary key
            article_map[article_id] = article
            items.append({
                "id": article_id,
                "title": article.title or "",
                "abstract": article.abstract or "",
                "pmid": article.pmid,
                "journal": article.journal,
                "authors": article.authors
            })

        # Use AIEvaluationService score_batch to get relevance scores
        results = await self.eval_service.score_batch(
            items=items,
            criteria=filter_criteria,
            id_field="id",
            min_value=0.0,
            max_value=1.0,
            include_reasoning=True,
            include_source_data=True,  # Include full article data for LLM context
            max_concurrent=50,
            on_progress=on_progress
        )

        # Update database with results using WipArticleService
        passed = 0
        rejected = 0

        for result in results:
            article = article_map.get(result.item_id)
            if not article:
                continue

            score = result.value if result.value is not None else 0.0
            is_relevant = score >= threshold
            reasoning = result.reasoning or result.error or ""

            self.wip_article_service.update_filter_result(
                article=article,
                passed=is_relevant,
                score=score,
                rejection_reason=reasoning if not is_relevant else None
            )
            if is_relevant:
                passed += 1
            else:
                rejected += 1

        self.wip_article_service.commit()
        logger.info(f"Filtering complete: {passed} passed, {rejected} rejected out of {len(articles)} total")
        return passed, rejected

    async def _deduplicate_globally(self, research_stream_id: int, execution_id: str) -> int:
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
                    self.wip_article_service.mark_as_duplicate(article, seen_dois[doi_normalized])
                    duplicates_found += 1
                else:
                    seen_dois[doi_normalized] = article.pmid or str(article.id)

            # Check title-based deduplication
            elif article.title:
                title_normalized = article.title.lower().strip()
                if title_normalized in seen_titles:
                    self.wip_article_service.mark_as_duplicate(article, seen_titles[title_normalized])
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
        research_stream_id: int,
        execution_id: str,
        presentation_config: PresentationConfig,
        on_progress: Optional[callable] = None
    ) -> int:
        """
        Use LLM to categorize each unique article into presentation categories in parallel batches.

        Args:
            research_stream_id: Stream ID
            execution_id: Current pipeline execution ID
            presentation_config: Presentation configuration with categories
            on_progress: Optional async callback(completed, total) for progress updates

        Returns:
            Number of articles categorized
        """
        # Get all articles marked for report inclusion (to categorize them)
        articles = self.wip_article_service.get_included_articles(execution_id)

        if not articles:
            logger.info(f"No articles to categorize for execution_id={execution_id}")
            return 0

        logger.info(f"Categorizing {len(articles)} articles into {len(presentation_config.categories)} categories")

        # Prepare category descriptions for LLM
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )

        # Use centralized batch categorization from ArticleCategorizationService
        results = await self.categorization_service.categorize_wip_articles_batch(
            articles=articles,
            categories=categories_desc,
            max_concurrent=50,
            on_progress=on_progress
        )

        # Update database with results using WipArticleService
        categorized = self.wip_article_service.bulk_update_categories(results)
        self.wip_article_service.commit()
        logger.info(f"Categorization complete: {categorized} articles categorized")
        return categorized

    async def _generate_summaries(
        self,
        research_stream_id: int,
        execution_id: str,
        stream: ResearchStream,
        presentation_config: PresentationConfig
    ) -> Tuple[str, Dict[str, str]]:
        """
        Generate executive summary and per-category summaries.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of pipeline execution
            stream: ResearchStream object
            presentation_config: Presentation configuration

        Returns:
            Tuple of (executive_summary, category_summaries_dict)
        """
        # Get all articles marked for report inclusion
        wip_articles = self.wip_article_service.get_included_articles(execution_id)

        if not wip_articles:
            return "No articles in this report.", {}

        # Get enrichment_config if available (for custom prompts)
        enrichment_config = None
        if hasattr(stream, 'enrichment_config') and stream.enrichment_config:
            enrichment_config = stream.enrichment_config.dict() if hasattr(stream.enrichment_config, 'dict') else stream.enrichment_config

        logger.info(f"Generating summaries for {len(wip_articles)} articles across {len(presentation_config.categories)} categories")

        # Generate category summaries in parallel
        async def generate_single_category_summary(category):
            """Generate summary for a single category"""
            try:
                # Get articles in this category
                category_articles = [
                    article for article in wip_articles
                    if article.presentation_categories and category.id in article.presentation_categories
                ]

                if not category_articles:
                    return category.id, "No articles in this category."

                # Build category description
                category_description = f"{category.name}. "
                if category.specific_inclusions:
                    category_description += "Includes: " + ", ".join(category.specific_inclusions)

                # Generate summary for this category
                summary = await self.summary_service.generate_category_summary(
                    category_name=category.name,
                    category_description=category_description,
                    wip_articles=category_articles,
                    stream_purpose=stream.purpose,
                    stream_name=stream.stream_name,
                    category_topics=category.topics,
                    enrichment_config=enrichment_config
                )
                return category.id, summary
            except Exception as e:
                logger.error(f"Failed to generate summary for category {category.id}: {type(e).__name__}: {e}")
                return category.id, f"Error generating summary: {str(e)}"

        # Run all category summaries in parallel with exception handling
        category_results = await asyncio.gather(
            *[generate_single_category_summary(cat) for cat in presentation_config.categories],
            return_exceptions=True
        )

        # Process results, handling any exceptions
        category_summaries = {}
        for i, result in enumerate(category_results):
            if isinstance(result, Exception):
                cat_id = presentation_config.categories[i].id
                logger.error(f"Category summary task failed for {cat_id}: {type(result).__name__}: {result}")
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
                enrichment_config=enrichment_config
            )
        except Exception as e:
            logger.error(f"Failed to generate executive summary: {type(e).__name__}: {e}", exc_info=True)
            executive_summary = f"Error generating executive summary: {str(e)}"

        logger.info(f"Summary generation complete: executive summary + {len(category_summaries)} category summaries")
        return executive_summary, category_summaries

    async def _generate_report(
        self,
        execution_id: str,
        stream: ResearchStream,
        executive_summary: str,
        category_summaries: Dict[str, str],
        metrics: Dict,
        report_name: Optional[str] = None
    ) -> Report:
        """
        Generate a report from the pipeline results.
        Creates Report and ReportArticleAssociation records.

        Input configuration (run_type, dates, retrieval_config) is stored in the
        PipelineExecution record, not in the Report. Access via report.execution.

        Args:
            execution_id: UUID of pipeline execution (links to wip_articles and stores all config)
            stream: ResearchStream object (for user_id and stream_id)
            executive_summary: Overall executive summary
            category_summaries: Dict mapping category_id to summary text
            metrics: Pipeline execution metrics
            report_name: Custom name for the report (defaults to YYYY.MM.DD)

        Returns:
            The created Report object
        """
        # Build enrichments (LLM-generated content)
        enrichments = {
            "executive_summary": executive_summary,
            "category_summaries": category_summaries
        }

        # Create report using ReportService
        report_date_obj = date.today()
        # Use provided report_name or default to YYYY.MM.DD format
        final_report_name = report_name if report_name else report_date_obj.strftime("%Y.%m.%d")

        report = self.report_service.create_report(
            user_id=stream.user_id,
            research_stream_id=stream.stream_id,
            report_date=report_date_obj,
            title=final_report_name,
            pipeline_execution_id=execution_id,
            executive_summary=executive_summary,
            enrichments=enrichments
        )
        # Set additional fields not in the service method
        report.pipeline_metrics = metrics
        report.is_read = False

        # Get all articles marked for report inclusion
        wip_articles = self.wip_article_service.get_included_articles(execution_id)

        # Create or get Article records, then create associations
        for idx, wip_article in enumerate(wip_articles):
            # Check if article already exists in articles table
            existing_article = None
            if wip_article.doi:
                existing_article = self.db.query(Article).filter(
                    Article.doi == wip_article.doi
                ).first()

            if not existing_article and wip_article.pmid:
                existing_article = self.db.query(Article).filter(
                    Article.pmid == wip_article.pmid
                ).first()

            if existing_article:
                article = existing_article
            else:
                # Create new article
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
                    fetch_count=1
                )
                self.db.add(article)
                self.db.flush()  # Get article_id

            # Create association
            association = ReportArticleAssociation(
                report_id=report.report_id,
                article_id=article.article_id,
                ranking=idx + 1,
                presentation_categories=wip_article.presentation_categories,
                is_read=False,
                is_starred=False
            )
            self.db.add(association)

        self.db.commit()
        return report
