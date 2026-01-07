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

from models import (
    ResearchStream, Report, ReportArticleAssociation, Article,
    WipArticle, InformationSource, RunType
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
        research_stream_id: int,
        user_id: int,
        run_type: RunType = RunType.MANUAL,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        report_name: Optional[str] = None
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        Pipeline stages:
        1. Load configuration and validate broad search strategy
        2. Generate execution ID for tracking
        3. Execute retrieval for each broad search query
        4. Deduplicate within queries
        5. Apply semantic filters per query
        6. Deduplicate globally
        7. Categorize articles
        8. Generate executive summaries (overall + per category)
        9. Generate report

        Args:
            research_stream_id: ID of the research stream to execute
            user_id: ID of the user executing the pipeline (for authorization)
            run_type: Type of run (TEST, SCHEDULED, MANUAL)
            start_date: Start date for retrieval (YYYY/MM/DD format)
            end_date: End date for retrieval (YYYY/MM/DD format)
            report_name: Custom name for the generated report (defaults to YYYY.MM.DD)

        Yields:
            PipelineStatus: Status updates at each stage

        Raises:
            ValueError: If the research stream uses concept-based retrieval (not supported)
        """
        try:
            # === STAGE 1: Load Configuration ===
            yield PipelineStatus("init", "Loading research stream configuration...")

            # Use research_stream_service to get stream (handles authorization)
            # Returns Pydantic schema with all nested objects already parsed
            stream = self.research_stream_service.get_research_stream(
                stream_id=research_stream_id,
                user_id=user_id
            )

            # All configs are already parsed Pydantic objects
            retrieval_config = stream.retrieval_config
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
                    "stream_name": stream.stream_name,
                    "retrieval_strategy": "broad_search",
                    "num_queries": query_count,
                    "num_categories": len(presentation_config.categories)
                }
            )

            # === STAGE 2: Generate Pipeline Execution ID ===
            execution_id = str(uuid.uuid4())

            yield PipelineStatus(
                "init",
                f"Generated execution ID: {execution_id}",
                {"execution_id": execution_id}
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

                passed, rejected = await self._apply_semantic_filter(
                    execution_id=execution_id,
                    retrieval_unit_id=broad_query.query_id,
                    filter_criteria=broad_query.semantic_filter.criteria,
                    threshold=broad_query.semantic_filter.threshold
                )

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

            categorized_count = await self._categorize_articles(
                research_stream_id=research_stream_id,
                execution_id=execution_id,
                presentation_config=presentation_config
            )

            yield PipelineStatus(
                "categorize",
                f"Categorized {categorized_count} articles",
                {"categorized": categorized_count}
            )

            # === STAGE 7: Generate Summaries ===
            yield PipelineStatus("summary", "Generating executive summaries...")

            executive_summary, category_summaries = await self._generate_summaries(
                research_stream_id=research_stream_id,
                execution_id=execution_id,
                stream=stream,
                presentation_config=presentation_config
            )

            yield PipelineStatus(
                "summary",
                f"Generated executive summary and {len(category_summaries)} category summaries",
                {"categories": len(category_summaries)}
            )

            # === STAGE 8: Generate Report ===
            yield PipelineStatus("report", "Generating report...")

            report = await self._generate_report(
                research_stream_id=research_stream_id,
                execution_id=execution_id,
                stream=stream,
                run_type=run_type,
                executive_summary=executive_summary,
                category_summaries=category_summaries,
                metrics={
                    "total_retrieved": total_retrieved,
                    "filter_stats": filter_stats,
                    "global_duplicates": global_dupes,
                    "included_in_report": included_count,
                    "categorized": categorized_count
                },
                start_date=start_date,
                end_date=end_date,
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
            articles, metadata = self.pubmed_service.search_articles(
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

        self.wip_article_service.commit()
        return len(articles)

    async def _apply_semantic_filter(
        self,
        execution_id: str,
        retrieval_unit_id: str,
        filter_criteria: str,
        threshold: float
    ) -> Tuple[int, int]:
        """
        Apply semantic filter to articles in a retrieval unit (concept or broad query) using LLM in parallel batches.

        Args:
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (query_id)
            filter_criteria: Natural language filter criteria
            threshold: Minimum score (0-1) for article to pass

        Returns:
            Tuple of (passed_count, rejected_count)
        """
        # Get all non-duplicate articles for this unit that haven't been filtered yet
        articles = self.wip_article_service.get_for_filtering(execution_id, retrieval_unit_id)

        if not articles:
            return 0, 0

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
            max_concurrent=50
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
        presentation_config: PresentationConfig
    ) -> int:
        """
        Use LLM to categorize each unique article into presentation categories in parallel batches.

        Args:
            research_stream_id: Stream ID
            execution_id: Current pipeline execution ID
            presentation_config: Presentation configuration with categories

        Returns:
            Number of articles categorized
        """
        # Get all articles marked for report inclusion (to categorize them)
        articles = self.wip_article_service.get_included_articles(execution_id)

        if not articles:
            return 0

        # Prepare category descriptions for LLM
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )

        # Use centralized batch categorization from ArticleCategorizationService
        results = await self.categorization_service.categorize_wip_articles_batch(
            articles=articles,
            categories=categories_desc,
            max_concurrent=50
        )

        # Update database with results using WipArticleService
        categorized = self.wip_article_service.bulk_update_categories(results)
        self.wip_article_service.commit()
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

        # Generate category summaries in parallel
        async def generate_single_category_summary(category):
            """Generate summary for a single category"""
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

        # Run all category summaries in parallel
        category_results = await asyncio.gather(
            *[generate_single_category_summary(cat) for cat in presentation_config.categories]
        )
        category_summaries = dict(category_results)

        # Generate executive summary using category summaries
        executive_summary = await self.summary_service.generate_executive_summary(
            wip_articles=wip_articles,
            stream_purpose=stream.purpose,
            category_summaries=category_summaries,
            stream_name=stream.stream_name,
            enrichment_config=enrichment_config
        )

        return executive_summary, category_summaries

    async def _generate_report(
        self,
        research_stream_id: int,
        execution_id: str,
        stream: ResearchStream,
        run_type: RunType,
        executive_summary: str,
        category_summaries: Dict[str, str],
        metrics: Dict,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        report_name: Optional[str] = None
    ) -> Report:
        """
        Generate a report from the pipeline results.
        Creates Report and ReportArticleAssociation records.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of pipeline execution (links to wip_articles)
            stream: ResearchStream object
            run_type: Type of run
            executive_summary: Overall executive summary
            category_summaries: Dict mapping category_id to summary text
            metrics: Pipeline execution metrics
            start_date: Start date for retrieval (YYYY/MM/DD format)
            end_date: End date for retrieval (YYYY/MM/DD format)
            report_name: Custom name for the report (defaults to YYYY.MM.DD)

        Returns:
            The created Report object
        """
        # Build execution configuration snapshot (full config used for this report)
        retrieval_params = {
            # Date range
            "start_date": start_date,
            "end_date": end_date,

            # Full configuration snapshot (mode='json' ensures datetime objects are serialized as strings)
            "retrieval_config": stream.retrieval_config.model_dump(mode='json') if stream.retrieval_config else None,
            "presentation_config": stream.presentation_config.model_dump(mode='json') if stream.presentation_config else None,
            "semantic_space": stream.semantic_space.model_dump(mode='json') if stream.semantic_space else None,
        }

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
            research_stream_id=research_stream_id,
            report_date=report_date_obj,
            title=final_report_name,
            pipeline_execution_id=execution_id,
            executive_summary=executive_summary,
            enrichments=enrichments
        )
        # Set additional fields not in the service method
        report.run_type = run_type
        report.retrieval_params = retrieval_params
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
