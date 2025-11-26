"""
Pipeline Service - Orchestrates end-to-end test execution of research streams

This service coordinates:
1. Retrieval: Execute queries for each retrieval unit (concept or broad query) from configured sources
2. Deduplication (unit-level): Find duplicates within each retrieval unit
3. Semantic Filtering: Apply AI-powered relevance filters per unit
4. Deduplication (global): Find duplicates across all filtered results
5. Categorization: Assign articles to presentation categories using LLM
6. Summary Generation: Generate executive summary and per-category summaries using LLM
7. Report Generation: Save results to reports and report_article_associations tables

All intermediate results are stored in wip_articles table for audit trail and debugging.

Supports two retrieval strategies:
- Concept-based: Multiple narrow, specific entity-relationship patterns
- Broad Search: 1-3 simple, wide-net queries optimized for weekly monitoring
"""

from typing import AsyncGenerator, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, datetime
import json
import uuid

from models import (
    ResearchStream, Report, ReportArticleAssociation, Article,
    WipArticle, InformationSource, RunType
)
from schemas.semantic_space import SemanticSpace
from schemas.research_stream import RetrievalConfig, PresentationConfig
from services.pubmed_service import PubMedService
from services.semantic_filter_service import SemanticFilterService
from services.article_categorization_service import ArticleCategorizationService
from services.research_stream_service import ResearchStreamService
from services.report_summary_service import ReportSummaryService


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
    MAX_ARTICLES_PER_SOURCE = 50
    MAX_TOTAL_ARTICLES = 200

    def __init__(self, db: Session):
        self.db = db
        self.research_stream_service = ResearchStreamService(db)
        self.pubmed_service = PubMedService()
        self.filter_service = SemanticFilterService()
        self.categorization_service = ArticleCategorizationService()
        self.summary_service = ReportSummaryService()

    async def run_pipeline(
        self,
        research_stream_id: int,
        user_id: int,
        run_type: RunType = RunType.TEST,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        Pipeline stages:
        1. Load configuration and determine retrieval strategy
        2. Clear previous WIP data
        3. Execute retrieval for each unit (concept or broad query)
        4. Deduplicate within units
        5. Apply semantic filters per unit
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

        Yields:
            PipelineStatus: Status updates at each stage
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
            semantic_space = stream.semantic_space
            retrieval_config = stream.retrieval_config
            presentation_config = stream.presentation_config

            # Determine retrieval strategy
            retrieval_strategy = None
            retrieval_unit_count = 0
            if retrieval_config.concepts and len(retrieval_config.concepts) > 0:
                retrieval_strategy = "concepts"
                retrieval_unit_count = len(retrieval_config.concepts)
            elif retrieval_config.broad_search and retrieval_config.broad_search.queries:
                retrieval_strategy = "broad_search"
                retrieval_unit_count = len(retrieval_config.broad_search.queries)
            else:
                raise ValueError("No retrieval configuration found (concepts or broad_search)")

            yield PipelineStatus(
                "init",
                "Configuration loaded",
                {
                    "stream_name": stream.stream_name,
                    "retrieval_strategy": retrieval_strategy,
                    "num_retrieval_units": retrieval_unit_count,
                    "num_categories": len(presentation_config.categories)
                }
            )

            # === STAGE 1.5: Generate Pipeline Execution ID ===
            execution_id = str(uuid.uuid4())

            yield PipelineStatus(
                "init",
                f"Generated execution ID: {execution_id}",
                {"execution_id": execution_id}
            )

            # === STAGE 2: Clear Previous WIP Data ===
            # Note: We don't clear old data - each execution is independent
            # Old wip_articles remain for historical analysis
            yield PipelineStatus("cleanup", "Ready to begin retrieval (keeping historical WIP data)")

            # === STAGE 3: Execute Retrieval ===
            total_retrieved = 0

            if retrieval_strategy == "concepts":
                # === CONCEPT-BASED RETRIEVAL ===
                for concept in retrieval_config.concepts:
                    yield PipelineStatus(
                        "retrieval",
                        f"Starting retrieval for concept: {concept.name}",
                        {"concept_id": concept.concept_id, "concept_name": concept.name}
                    )

                    # Execute queries for each source in this concept
                    for source_id, source_query in concept.source_queries.items():
                        if not source_query or not source_query.enabled:
                            continue

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
                            f"Executing query for source '{source_id}' in concept '{concept.name}'",
                            {
                                "concept_id": concept.concept_id,
                                "source_id": source_id,
                                "query": source_query.query_expression
                            }
                        )

                        # Execute retrieval
                        articles_retrieved = await self._execute_source_query(
                            research_stream_id=research_stream_id,
                            execution_id=execution_id,
                            retrieval_unit_id=concept.concept_id,  # Store concept_id in retrieval_group_id field
                            source_id=source_id,
                            query_expression=source_query.query_expression,
                            start_date=start_date,
                            end_date=end_date
                        )

                        total_retrieved += articles_retrieved

                        yield PipelineStatus(
                            "retrieval",
                            f"Retrieved {articles_retrieved} articles from {source_id}",
                            {
                                "concept_id": concept.concept_id,
                                "source_id": source_id,
                                "count": articles_retrieved,
                                "total_retrieved": total_retrieved
                            }
                        )

            elif retrieval_strategy == "broad_search":
                # === BROAD SEARCH RETRIEVAL ===
                for broad_query in retrieval_config.broad_search.queries:
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

                    # Execute retrieval on PubMed (broad queries use query_expression directly)
                    articles_retrieved = await self._execute_source_query(
                        research_stream_id=research_stream_id,
                        execution_id=execution_id,
                        retrieval_unit_id=broad_query.query_id,  # Store query_id in retrieval_group_id field
                        source_id="pubmed",  # Broad queries always use PubMed for now
                        query_expression=broad_query.query_expression,
                        start_date=start_date,
                        end_date=end_date
                    )

                    total_retrieved += articles_retrieved

                    yield PipelineStatus(
                        "retrieval",
                        f"Retrieved {articles_retrieved} articles",
                        {
                            "query_id": broad_query.query_id,
                            "count": articles_retrieved,
                            "total_retrieved": total_retrieved
                        }
                    )

            yield PipelineStatus(
                "retrieval",
                f"Retrieval complete: {total_retrieved} total articles",
                {"total_retrieved": total_retrieved}
            )

            # === STAGE 4: Deduplicate Within Retrieval Units ===
            yield PipelineStatus("dedup_group", "Deduplicating within retrieval units...")

            unit_dedup_stats = {}

            if retrieval_strategy == "concepts":
                for concept in retrieval_config.concepts:
                    dupes_found = await self._deduplicate_within_unit(
                        research_stream_id=research_stream_id,
                        execution_id=execution_id,
                        retrieval_unit_id=concept.concept_id
                    )
                    unit_dedup_stats[concept.concept_id] = dupes_found

                    yield PipelineStatus(
                        "dedup_group",
                        f"Found {dupes_found} duplicates in concept '{concept.name}'",
                        {"concept_id": concept.concept_id, "duplicates": dupes_found}
                    )

            elif retrieval_strategy == "broad_search":
                for broad_query in retrieval_config.broad_search.queries:
                    dupes_found = await self._deduplicate_within_unit(
                        research_stream_id=research_stream_id,
                        execution_id=execution_id,
                        retrieval_unit_id=broad_query.query_id
                    )
                    unit_dedup_stats[broad_query.query_id] = dupes_found

                    yield PipelineStatus(
                        "dedup_group",
                        f"Found {dupes_found} duplicates in broad query",
                        {"query_id": broad_query.query_id, "duplicates": dupes_found}
                    )

            # === STAGE 5: Apply Semantic Filters ===
            yield PipelineStatus("filter", "Applying semantic filters...")

            filter_stats = {}

            if retrieval_strategy == "concepts":
                for concept in retrieval_config.concepts:
                    if not concept.semantic_filter.enabled:
                        yield PipelineStatus(
                            "filter",
                            f"Semantic filter disabled for concept '{concept.name}', keeping all articles",
                            {"concept_id": concept.concept_id, "filtered": False}
                        )
                        continue

                    passed, rejected = await self._apply_semantic_filter(
                        research_stream_id=research_stream_id,
                        retrieval_unit_id=concept.concept_id,
                        filter_criteria=concept.semantic_filter.criteria,
                        threshold=concept.semantic_filter.threshold
                    )

                    filter_stats[concept.concept_id] = {"passed": passed, "rejected": rejected}

                    yield PipelineStatus(
                        "filter",
                        f"Filtered concept '{concept.name}': {passed} passed, {rejected} rejected",
                        {
                            "concept_id": concept.concept_id,
                            "passed": passed,
                            "rejected": rejected
                        }
                    )

            elif retrieval_strategy == "broad_search":
                for broad_query in retrieval_config.broad_search.queries:
                    if not broad_query.semantic_filter.enabled:
                        yield PipelineStatus(
                            "filter",
                            f"Semantic filter disabled for broad query, keeping all articles",
                            {"query_id": broad_query.query_id, "filtered": False}
                        )
                        continue

                    passed, rejected = await self._apply_semantic_filter(
                        research_stream_id=research_stream_id,
                        retrieval_unit_id=broad_query.query_id,
                        filter_criteria=broad_query.semantic_filter.criteria,
                        threshold=broad_query.semantic_filter.threshold
                    )

                    filter_stats[broad_query.query_id] = {"passed": passed, "rejected": rejected}

                    yield PipelineStatus(
                        "filter",
                        f"Filtered broad query: {passed} passed, {rejected} rejected",
                        {
                            "query_id": broad_query.query_id,
                            "passed": passed,
                            "rejected": rejected
                        }
                    )

            # === STAGE 6: Deduplicate Globally ===
            yield PipelineStatus("dedup_global", "Deduplicating across all groups...")

            global_dupes = await self._deduplicate_globally(research_stream_id, execution_id)

            yield PipelineStatus(
                "dedup_global",
                f"Found {global_dupes} duplicates across groups",
                {"duplicates": global_dupes}
            )

            # === STAGE 7: Categorize Articles ===
            yield PipelineStatus("categorize", "Categorizing articles into presentation categories...")

            categorized_count = await self._categorize_articles(
                research_stream_id=research_stream_id,
                presentation_config=presentation_config
            )

            yield PipelineStatus(
                "categorize",
                f"Categorized {categorized_count} articles",
                {"categorized": categorized_count}
            )

            # === STAGE 8: Generate Summaries ===
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

            # === STAGE 9: Generate Report ===
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
                    "unit_dedup_stats": unit_dedup_stats,
                    "filter_stats": filter_stats,
                    "global_duplicates": global_dupes,
                    "categorized": categorized_count
                }
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

    async def _execute_source_query(
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
        Execute a query for a specific source and store results in wip_articles.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (concept_id or query_id)
            source_id: Source identifier
            query_expression: Query to execute
            start_date: Start date for retrieval (YYYY/MM/DD format)
            end_date: End date for retrieval (YYYY/MM/DD format)

        Returns:
            Number of articles retrieved
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
                max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50),
                start_date=start_date,
                end_date=end_date,
                date_type="entry",  # Use entry date for weekly reports
                sort_by="relevance"  # Most relevant first
            )
        else:
            # Other sources not yet implemented
            pass

        # Store results in wip_articles
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

            wip_article = WipArticle(
                research_stream_id=research_stream_id,
                pipeline_execution_id=execution_id,
                retrieval_group_id=retrieval_unit_id,  # Store concept_id or query_id
                source_id=source.source_id,
                title=article.title,
                url=article.url,
                authors=article.authors or [],
                publication_date=pub_date,
                abstract=article.abstract,
                summary=article.snippet,  # Use snippet as summary
                pmid=article.pmid or (article.id if article.source == 'pubmed' else None),
                doi=article.doi,
                journal=article.journal,
                year=str(article.publication_year) if article.publication_year else None,
                article_metadata=article.metadata or {},
                is_duplicate=False,
                passed_semantic_filter=None,  # Not yet filtered
                included_in_report=False
            )
            self.db.add(wip_article)

        self.db.commit()
        return len(articles)

    async def _deduplicate_within_unit(
        self,
        research_stream_id: int,
        execution_id: str,
        retrieval_unit_id: str
    ) -> int:
        """
        Find and mark duplicates within a retrieval unit (concept or broad query) for this execution.
        Duplicates are identified by DOI or title similarity.

        Args:
            research_stream_id: Stream ID (for context, not used in query)
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (concept_id or query_id)

        Returns:
            Number of duplicates found
        """
        # Get all non-duplicate articles for this unit in THIS execution only
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.retrieval_group_id == retrieval_unit_id,
                WipArticle.is_duplicate == False
            )
        ).all()

        duplicates_found = 0
        seen_dois = {}
        seen_titles = {}

        for article in articles:
            # Check DOI-based deduplication
            if article.doi and article.doi.strip():
                doi_normalized = article.doi.lower().strip()
                if doi_normalized in seen_dois:
                    # Mark as duplicate
                    article.is_duplicate = True
                    article.duplicate_of_id = seen_dois[doi_normalized]
                    duplicates_found += 1
                else:
                    seen_dois[doi_normalized] = article.id

            # Check title-based deduplication (exact match, case-insensitive)
            elif article.title:
                title_normalized = article.title.lower().strip()
                if title_normalized in seen_titles:
                    article.is_duplicate = True
                    article.duplicate_of_id = seen_titles[title_normalized]
                    duplicates_found += 1
                else:
                    seen_titles[title_normalized] = article.id

        self.db.commit()
        return duplicates_found

    async def _apply_semantic_filter(
        self,
        research_stream_id: int,
        retrieval_unit_id: str,
        filter_criteria: str,
        threshold: float
    ) -> Tuple[int, int]:
        """
        Apply semantic filter to articles in a retrieval unit (concept or broad query) using LLM in parallel batches.

        Returns:
            Tuple of (passed_count, rejected_count)
        """
        import asyncio

        # Get all non-duplicate articles for this unit that haven't been filtered yet
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
                WipArticle.retrieval_group_id == retrieval_unit_id,
                WipArticle.is_duplicate == False,
                WipArticle.passed_semantic_filter == None
            )
        ).all()

        if not articles:
            return 0, 0

        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(10)  # Limit to 10 concurrent filter evaluations

        async def evaluate_article(article: WipArticle) -> Tuple[int, bool, str]:
            """Evaluate a single article with rate limiting"""
            async with semaphore:
                try:
                    is_relevant, reasoning = await self._evaluate_article_relevance(
                        article=article,
                        filter_criteria=filter_criteria,
                        threshold=threshold
                    )
                    return article.id, is_relevant, reasoning
                except Exception as e:
                    # On error, reject the article with error message
                    return article.id, False, f"Evaluation failed: {str(e)}"

        # Execute all evaluations in parallel
        results = await asyncio.gather(
            *[evaluate_article(article) for article in articles],
            return_exceptions=False
        )

        # Update database with results
        passed = 0
        rejected = 0
        article_map = {a.id: a for a in articles}

        for article_id, is_relevant, reasoning in results:
            article = article_map[article_id]
            if is_relevant:
                article.passed_semantic_filter = True
                passed += 1
            else:
                article.passed_semantic_filter = False
                article.filter_rejection_reason = reasoning
                rejected += 1

        self.db.commit()
        return passed, rejected

    async def _evaluate_article_relevance(
        self,
        article: WipArticle,
        filter_criteria: str,
        threshold: float
    ) -> Tuple[bool, str]:
        """
        Use LLM to evaluate if an article meets the semantic filter criteria.

        Returns:
            Tuple of (is_relevant, reasoning)
        """
        # Delegate to semantic filter service
        is_relevant, score, reasoning = await self.filter_service.evaluate_wip_article(
            article=article,
            filter_criteria=filter_criteria,
            threshold=threshold
        )
        return is_relevant, reasoning

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
        # Get all articles that passed filtering and aren't already marked as duplicates in THIS execution
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.is_duplicate == False,
                or_(
                    WipArticle.passed_semantic_filter == True,
                    WipArticle.passed_semantic_filter == None  # Groups without filters
                )
            )
        ).all()

        duplicates_found = 0
        seen_dois = {}
        seen_titles = {}

        for article in articles:
            # Check DOI-based deduplication
            if article.doi and article.doi.strip():
                doi_normalized = article.doi.lower().strip()
                if doi_normalized in seen_dois:
                    article.is_duplicate = True
                    article.duplicate_of_id = seen_dois[doi_normalized]
                    duplicates_found += 1
                else:
                    seen_dois[doi_normalized] = article.id

            # Check title-based deduplication
            elif article.title:
                title_normalized = article.title.lower().strip()
                if title_normalized in seen_titles:
                    article.is_duplicate = True
                    article.duplicate_of_id = seen_titles[title_normalized]
                    duplicates_found += 1
                else:
                    seen_titles[title_normalized] = article.id

        self.db.commit()
        return duplicates_found

    async def _categorize_articles(
        self,
        research_stream_id: int,
        presentation_config: PresentationConfig
    ) -> int:
        """
        Use LLM to categorize each unique article into presentation categories in parallel batches.

        Returns:
            Number of articles categorized
        """
        import asyncio

        # Get all unique articles (not duplicates, passed filters)
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
                WipArticle.is_duplicate == False,
                or_(
                    WipArticle.passed_semantic_filter == True,
                    WipArticle.passed_semantic_filter == None
                )
            )
        ).all()

        if not articles:
            return 0

        # Prepare category descriptions for LLM
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )

        # Create semaphore to limit concurrent LLM calls
        semaphore = asyncio.Semaphore(10)  # Limit to 10 concurrent categorizations

        async def categorize_article(article: WipArticle) -> Tuple[int, List[str]]:
            """Categorize a single article with rate limiting"""
            async with semaphore:
                try:
                    assigned_categories = await self._assign_categories_to_article(
                        article=article,
                        categories=categories_desc
                    )
                    return article.id, assigned_categories
                except Exception as e:
                    # On error, return empty category list
                    return article.id, []

        # Execute all categorizations in parallel
        results = await asyncio.gather(
            *[categorize_article(article) for article in articles],
            return_exceptions=False
        )

        # Update database with results
        article_map = {a.id: a for a in articles}
        for article_id, assigned_categories in results:
            article = article_map[article_id]
            article.presentation_categories = assigned_categories
            article.included_in_report = len(assigned_categories) > 0

        self.db.commit()
        return len(articles)

    async def _assign_categories_to_article(
        self,
        article: WipArticle,
        categories: List[Dict]
    ) -> List[str]:
        """
        Use LLM to assign presentation categories to an article.

        Returns:
            List of category IDs that apply to this article
        """
        # Delegate to categorization service
        return await self.categorization_service.categorize_wip_article(
            article=article,
            categories=categories
        )

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
        # Get all articles to include in report (unique, passed filters, included)
        wip_articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.included_in_report == True
            )
        ).all()

        if not wip_articles:
            return "No articles in this report.", {}

        # Generate category summaries
        category_summaries = {}
        for category in presentation_config.categories:
            # Get articles in this category
            category_articles = [
                article for article in wip_articles
                if category.id in article.presentation_categories
            ]

            if not category_articles:
                category_summaries[category.id] = "No articles in this category."
                continue

            # Build category description
            category_description = f"{category.name}. "
            if category.specific_inclusions:
                category_description += "Includes: " + ", ".join(category.specific_inclusions)

            # Generate summary for this category
            summary = await self.summary_service.generate_category_summary(
                category_name=category.name,
                category_description=category_description,
                wip_articles=category_articles,
                stream_purpose=stream.purpose
            )
            category_summaries[category.id] = summary

        # Generate executive summary using category summaries
        executive_summary = await self.summary_service.generate_executive_summary(
            wip_articles=wip_articles,
            stream_purpose=stream.purpose,
            category_summaries=category_summaries
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
        metrics: Dict
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

        Returns:
            The created Report object
        """
        # Add category summaries to metrics
        enriched_metrics = {
            **metrics,
            "category_summaries": category_summaries
        }

        # Create report
        report_date = date.today()
        report_name = report_date.strftime("%Y.%m.%d")  # Default format: YYYY.MM.DD

        report = Report(
            user_id=stream.user_id,
            research_stream_id=research_stream_id,
            report_name=report_name,
            report_date=report_date,
            run_type=run_type,
            executive_summary=executive_summary,
            pipeline_metrics=enriched_metrics,
            pipeline_execution_id=execution_id,  # Link to this execution's WIP data
            is_read=False
        )
        self.db.add(report)
        self.db.flush()  # Get report_id

        # Get all articles to include (from THIS execution, unique, passed filters)
        wip_articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.included_in_report == True
            )
        ).all()

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
