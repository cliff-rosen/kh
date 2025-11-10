"""
Pipeline Service - Orchestrates end-to-end test execution of research streams

This service coordinates:
1. Retrieval: Execute queries for each retrieval group from configured sources
2. Deduplication (group-level): Find duplicates within each retrieval group
3. Semantic Filtering: Apply AI-powered relevance filters per group
4. Deduplication (global): Find duplicates across all filtered results
5. Categorization: Assign articles to presentation categories using LLM
6. Report Generation: Save results to reports and report_article_associations tables

All intermediate results are stored in wip_articles table for audit trail and debugging.
"""

from typing import AsyncGenerator, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, datetime
import json

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

    async def run_pipeline(
        self,
        research_stream_id: int,
        user_id: int,
        run_type: RunType = RunType.TEST
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        Pipeline stages:
        1. Load configuration
        2. Clear previous WIP data
        3. Execute retrieval for each group
        4. Deduplicate within groups
        5. Apply semantic filters
        6. Deduplicate globally
        7. Categorize articles
        8. Generate report

        Args:
            research_stream_id: ID of the research stream to execute
            user_id: ID of the user executing the pipeline (for authorization)
            run_type: Type of run (TEST, SCHEDULED, MANUAL)

        Yields:
            PipelineStatus: Status updates at each stage
        """
        try:
            # === STAGE 1: Load Configuration ===
            yield PipelineStatus("init", "Loading research stream configuration...")

            # Use research_stream_service to get stream (handles authorization)
            stream = self.research_stream_service.get_research_stream(
                stream_id=research_stream_id,
                user_id=user_id
            )

            semantic_space = SemanticSpace(**stream.semantic_space)
            retrieval_config = RetrievalConfig(**stream.retrieval_config)
            presentation_config = PresentationConfig(**stream.presentation_config)

            yield PipelineStatus(
                "init",
                "Configuration loaded",
                {
                    "stream_name": stream.stream_name,
                    "num_groups": len(retrieval_config.retrieval_groups),
                    "num_categories": len(presentation_config.categories)
                }
            )

            # === STAGE 2: Clear Previous WIP Data ===
            yield PipelineStatus("cleanup", "Clearing previous WIP data...")

            deleted_count = self.db.query(WipArticle).filter(
                WipArticle.research_stream_id == research_stream_id
            ).delete()
            self.db.commit()

            yield PipelineStatus(
                "cleanup",
                f"Cleared {deleted_count} previous WIP articles"
            )

            # === STAGE 3: Execute Retrieval ===
            total_retrieved = 0

            for group in retrieval_config.retrieval_groups:
                yield PipelineStatus(
                    "retrieval",
                    f"Starting retrieval for group: {group.name}",
                    {"group_id": group.group_id, "group_name": group.name}
                )

                # Execute queries for each source in this group
                for source_id, source_query in group.source_queries.items():
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
                        f"Executing query for source '{source_id}' in group '{group.name}'",
                        {
                            "group_id": group.group_id,
                            "source_id": source_id,
                            "query": source_query.query_expression
                        }
                    )

                    # Execute retrieval
                    articles_retrieved = await self._execute_source_query(
                        research_stream_id=research_stream_id,
                        group_id=group.group_id,
                        source_id=source_id,
                        query_expression=source_query.query_expression
                    )

                    total_retrieved += articles_retrieved

                    yield PipelineStatus(
                        "retrieval",
                        f"Retrieved {articles_retrieved} articles from {source_id}",
                        {
                            "group_id": group.group_id,
                            "source_id": source_id,
                            "count": articles_retrieved,
                            "total_retrieved": total_retrieved
                        }
                    )

            yield PipelineStatus(
                "retrieval",
                f"Retrieval complete: {total_retrieved} total articles",
                {"total_retrieved": total_retrieved}
            )

            # === STAGE 4: Deduplicate Within Groups ===
            yield PipelineStatus("dedup_group", "Deduplicating within retrieval groups...")

            group_dedup_stats = {}
            for group in retrieval_config.retrieval_groups:
                dupes_found = await self._deduplicate_within_group(
                    research_stream_id=research_stream_id,
                    group_id=group.group_id
                )
                group_dedup_stats[group.group_id] = dupes_found

                yield PipelineStatus(
                    "dedup_group",
                    f"Found {dupes_found} duplicates in group '{group.name}'",
                    {"group_id": group.group_id, "duplicates": dupes_found}
                )

            # === STAGE 5: Apply Semantic Filters ===
            yield PipelineStatus("filter", "Applying semantic filters...")

            filter_stats = {}
            for group in retrieval_config.retrieval_groups:
                if not group.semantic_filter.enabled:
                    yield PipelineStatus(
                        "filter",
                        f"Semantic filter disabled for group '{group.name}', keeping all articles",
                        {"group_id": group.group_id, "filtered": False}
                    )
                    continue

                passed, rejected = await self._apply_semantic_filter(
                    research_stream_id=research_stream_id,
                    group_id=group.group_id,
                    filter_criteria=group.semantic_filter.criteria,
                    threshold=group.semantic_filter.threshold
                )

                filter_stats[group.group_id] = {"passed": passed, "rejected": rejected}

                yield PipelineStatus(
                    "filter",
                    f"Filtered group '{group.name}': {passed} passed, {rejected} rejected",
                    {
                        "group_id": group.group_id,
                        "passed": passed,
                        "rejected": rejected
                    }
                )

            # === STAGE 6: Deduplicate Globally ===
            yield PipelineStatus("dedup_global", "Deduplicating across all groups...")

            global_dupes = await self._deduplicate_globally(research_stream_id)

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

            # === STAGE 8: Generate Report ===
            yield PipelineStatus("report", "Generating report...")

            report = await self._generate_report(
                research_stream_id=research_stream_id,
                stream=stream,
                run_type=run_type,
                metrics={
                    "total_retrieved": total_retrieved,
                    "group_dedup_stats": group_dedup_stats,
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
        group_id: str,
        source_id: str,
        query_expression: str
    ) -> int:
        """
        Execute a query for a specific source and store results in wip_articles.

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
                max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50)
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
                retrieval_group_id=group_id,
                source_id=source.source_id,
                title=article.title,
                url=article.url,
                authors=article.authors or [],
                publication_date=pub_date,
                abstract=article.abstract,
                summary=article.summary,
                pmid=article.pmid or article.id if article.source == 'pubmed' else None,
                doi=article.doi,
                journal=article.journal,
                year=str(article.publication_year) if article.publication_year else None,
                article_metadata={},
                is_duplicate=False,
                passed_semantic_filter=None,  # Not yet filtered
                included_in_report=False
            )
            self.db.add(wip_article)

        self.db.commit()
        return len(articles)

    async def _deduplicate_within_group(
        self,
        research_stream_id: int,
        group_id: str
    ) -> int:
        """
        Find and mark duplicates within a retrieval group.
        Duplicates are identified by DOI or title similarity.

        Returns:
            Number of duplicates found
        """
        # Get all non-duplicate articles for this group
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
                WipArticle.retrieval_group_id == group_id,
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
        group_id: str,
        filter_criteria: str,
        threshold: float
    ) -> Tuple[int, int]:
        """
        Apply semantic filter to articles in a group using LLM.

        Returns:
            Tuple of (passed_count, rejected_count)
        """
        # Get all non-duplicate articles for this group that haven't been filtered yet
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
                WipArticle.retrieval_group_id == group_id,
                WipArticle.is_duplicate == False,
                WipArticle.passed_semantic_filter == None
            )
        ).all()

        passed = 0
        rejected = 0

        for article in articles:
            # Use LLM to evaluate relevance
            is_relevant, reasoning = await self._evaluate_article_relevance(
                article=article,
                filter_criteria=filter_criteria,
                threshold=threshold
            )

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

    async def _deduplicate_globally(self, research_stream_id: int) -> int:
        """
        Find and mark duplicates across all groups (after filtering).
        Only considers articles that passed semantic filter and aren't already marked as dupes.

        Returns:
            Number of duplicates found
        """
        # Get all articles that passed filtering and aren't already marked as duplicates
        articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
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
        Use LLM to categorize each unique article into presentation categories.

        Returns:
            Number of articles categorized
        """
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

        # Prepare category descriptions for LLM
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )

        categorized = 0
        for article in articles:
            # Use LLM to assign categories
            assigned_categories = await self._assign_categories_to_article(
                article=article,
                categories=categories_desc
            )

            article.presentation_categories = assigned_categories
            article.included_in_report = len(assigned_categories) > 0
            categorized += 1

        self.db.commit()
        return categorized

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

    async def _generate_report(
        self,
        research_stream_id: int,
        stream: ResearchStream,
        run_type: RunType,
        metrics: Dict
    ) -> Report:
        """
        Generate a report from the pipeline results.
        Creates Report and ReportArticleAssociation records.

        Returns:
            The created Report object
        """
        # Create report
        report = Report(
            user_id=stream.user_id,
            research_stream_id=research_stream_id,
            report_date=date.today(),
            run_type=run_type,
            pipeline_metrics=metrics,
            is_read=False
        )
        self.db.add(report)
        self.db.flush()  # Get report_id

        # Get all articles to include (unique, passed filters, assigned to categories)
        wip_articles = self.db.query(WipArticle).filter(
            and_(
                WipArticle.research_stream_id == research_stream_id,
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
