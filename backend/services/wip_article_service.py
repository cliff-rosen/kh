"""
WIP Article Service - Single source of truth for WipArticle operations

This service is the ONLY place that should write to the WipArticle table.
All other services should use this service for WipArticle operations.
"""

import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select
from fastapi import HTTPException, status, Depends

from models import WipArticle, InformationSource
from schemas.canonical_types import CanonicalResearchArticle
from database import get_async_db

logger = logging.getLogger(__name__)


class WipArticleService:
    """
    Service for all WipArticle operations.

    This is the single source of truth for WipArticle table access.
    Only this service should write to the WipArticle table.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CREATE Operations
    # =========================================================================

    def create_wip_article(
        self,
        research_stream_id: int,
        pipeline_execution_id: str,
        retrieval_group_id: str,
        source_id: int,
        title: str,
        abstract: Optional[str] = None,
        authors: Optional[List[str]] = None,
        journal: Optional[str] = None,
        year: Optional[int] = None,
        publication_date: Optional[Any] = None,
        pmid: Optional[str] = None,
        doi: Optional[str] = None,
        url: Optional[str] = None,
        source_specific_id: Optional[str] = None,
    ) -> WipArticle:
        """
        Create a new WipArticle record.

        Args:
            research_stream_id: ID of the research stream
            pipeline_execution_id: ID of the pipeline execution
            retrieval_group_id: ID of the retrieval group (concept_id or query_id)
            source_id: ID of the information source
            title: Article title
            abstract: Article abstract
            authors: List of author names
            journal: Journal name
            year: Publication year
            publication_date: Full publication date
            pmid: PubMed ID
            doi: Digital Object Identifier
            url: Article URL
            source_specific_id: Source-specific identifier

        Returns:
            Created WipArticle instance
        """
        wip_article = WipArticle(
            research_stream_id=research_stream_id,
            pipeline_execution_id=pipeline_execution_id,
            retrieval_group_id=retrieval_group_id,
            source_id=source_id,
            title=title,
            abstract=abstract,
            authors=authors or [],
            journal=journal,
            year=year,
            publication_date=publication_date,
            pmid=pmid,
            doi=doi,
            url=url,
            source_specific_id=source_specific_id,
            # Defaults
            is_duplicate=False,
            passed_semantic_filter=None,
            included_in_report=False,
        )
        self.db.add(wip_article)
        return wip_article

    async def create_wip_articles(
        self,
        research_stream_id: int,
        execution_id: str,
        retrieval_group_id: str,
        source_id: int,
        articles: List[CanonicalResearchArticle],
    ) -> int:
        """
        Create WipArticle records from canonical articles and commit.

        Maps CanonicalResearchArticle objects to WipArticle records and persists them
        in a single transaction.

        Args:
            research_stream_id: ID of the research stream
            execution_id: ID of the pipeline execution
            retrieval_group_id: ID of the retrieval group (query_id)
            source_id: ID of the information source
            articles: List of CanonicalResearchArticle objects from the source

        Returns:
            Number of articles created

        Raises:
            Exception: If database commit fails
        """
        logger.debug(
            f"Creating {len(articles)} WipArticles: "
            f"execution_id={execution_id}, retrieval_group_id={retrieval_group_id}"
        )

        date_parse_failures = 0
        for article in articles:
            # Parse publication_date string to date object if present
            pub_date = None
            if article.publication_date:
                try:
                    pub_date = datetime.fromisoformat(article.publication_date).date()
                except (ValueError, AttributeError):
                    date_parse_failures += 1

            wip_article = WipArticle(
                research_stream_id=research_stream_id,
                pipeline_execution_id=execution_id,
                retrieval_group_id=retrieval_group_id,
                source_id=source_id,
                title=article.title,
                url=article.url,
                authors=article.authors or [],
                publication_date=pub_date,
                abstract=article.abstract,
                pmid=article.pmid or (article.id if article.source == "pubmed" else None),
                doi=article.doi,
                journal=article.journal,
                year=int(article.publication_year) if article.publication_year else None,
                source_specific_id=article.id,
                is_duplicate=False,
                passed_semantic_filter=None,
                included_in_report=False,
            )
            self.db.add(wip_article)

        if date_parse_failures > 0:
            logger.warning(
                f"Failed to parse publication_date for {date_parse_failures}/{len(articles)} articles"
            )

        await self.db.commit()
        logger.info(
            f"Created {len(articles)} WipArticles for execution_id={execution_id}"
        )
        return len(articles)

    def bulk_create_wip_articles(self, articles: List[WipArticle]) -> None:
        """
        Bulk add WipArticle records.

        Args:
            articles: List of WipArticle instances to add
        """
        self.db.add_all(articles)

    # =========================================================================
    # UPDATE Operations (in-memory only - no DB queries)
    # =========================================================================

    def mark_as_duplicate(self, article: WipArticle, duplicate_of_pmid: str) -> None:
        """
        Mark an article as a duplicate.

        Args:
            article: WipArticle to mark
            duplicate_of_pmid: PMID of the article this is a duplicate of
        """
        article.is_duplicate = True
        article.duplicate_of_pmid = duplicate_of_pmid

    def update_filter_result(
        self,
        article: WipArticle,
        passed: bool,
        score: Optional[float] = None,
        score_reason: Optional[str] = None,
    ) -> None:
        """
        Update semantic filter results for an article.

        Args:
            article: WipArticle to update
            passed: Whether the article passed the filter
            score: Filter score (0-1)
            score_reason: AI reasoning for the score (captured for all articles)
        """
        article.passed_semantic_filter = passed
        if score is not None:
            article.filter_score = score
        if score_reason:
            article.filter_score_reason = score_reason

    def mark_for_inclusion(self, article: WipArticle) -> None:
        """
        Mark an article for inclusion in the report.

        Args:
            article: WipArticle to mark
        """
        article.included_in_report = True

    def mark_all_for_inclusion(self, articles: List[WipArticle]) -> None:
        """
        Mark multiple articles for inclusion in the report.

        Args:
            articles: List of WipArticle instances to mark
        """
        for article in articles:
            article.included_in_report = True

    def update_presentation_category(
        self, article: WipArticle, category_id: Optional[str]
    ) -> None:
        """
        Update the presentation category for an article.

        Args:
            article: WipArticle to update
            category_id: Category ID to assign (or None)
        """
        if category_id:
            article.presentation_categories = [category_id]
        else:
            article.presentation_categories = []

    def bulk_update_categories(self, categorization_results: List[tuple]) -> int:
        """
        Bulk update presentation categories from categorization results.

        Args:
            categorization_results: List of (WipArticle, category_id) tuples

        Returns:
            Number of articles categorized
        """
        categorized_count = 0
        for article, category_id in categorization_results:
            if category_id:
                article.presentation_categories = [category_id]
                categorized_count += 1
        return categorized_count

    # =========================================================================
    # CURATION Operations
    # =========================================================================

    def set_curator_included(
        self, article: WipArticle, user_id: int, notes: Optional[str] = None
    ) -> None:
        """
        Mark an article as curator-included.

        Used when curator adds a filtered article to the report.

        Args:
            article: WipArticle to update
            user_id: ID of the curator
            notes: Optional curation notes
        """
        from datetime import datetime

        article.curator_included = True
        article.curator_excluded = False  # Clear any exclude flag
        article.included_in_report = True
        article.curated_by = user_id
        article.curated_at = datetime.utcnow()
        if notes is not None:
            article.curation_notes = notes

    def set_curator_excluded(
        self, article: WipArticle, user_id: int, notes: Optional[str] = None
    ) -> None:
        """
        Mark an article as curator-excluded.

        Used when curator excludes an article from the report.

        Args:
            article: WipArticle to update
            user_id: ID of the curator
            notes: Optional curation notes
        """
        from datetime import datetime

        article.curator_excluded = True
        article.curator_included = False  # Clear any include flag
        article.included_in_report = False
        article.curated_by = user_id
        article.curated_at = datetime.utcnow()
        if notes is not None:
            article.curation_notes = notes

    def clear_curator_included(self, article: WipArticle) -> None:
        """
        Clear curator_included flag, restoring article to pipeline's filtered state.

        Used when undoing a curator add (removing a curator-added article from the report).
        This restores the article to its original pipeline decision (filtered out).
        """
        article.curator_included = False
        article.included_in_report = (
            False  # Restore to pipeline's decision (was filtered)
        )

    def clear_curation_flags(self, article: WipArticle, user_id: int) -> bool:
        """
        Clear curator override flags, restoring to pipeline decision.

        Args:
            article: WipArticle to update
            user_id: ID of the curator

        Returns:
            The pipeline's original decision for included_in_report
        """
        from datetime import datetime

        # Determine pipeline's original decision
        pipeline_would_include = (
            article.passed_semantic_filter is True and not article.is_duplicate
        )

        article.curator_included = False
        article.curator_excluded = False
        article.included_in_report = pipeline_would_include
        article.curated_by = user_id
        article.curated_at = datetime.utcnow()

        return pipeline_would_include

    # =========================================================================
    # ASYNC Operations
    # =========================================================================

    async def get_articles_with_curation_notes_by_stream(
        self, stream_id: int
    ) -> List[WipArticle]:
        """
        Get all WipArticles with curation notes for a stream (across all executions) - async version.

        Args:
            stream_id: Research stream ID

        Returns:
            List of WipArticle instances with curation notes, ordered by curated_at desc
        """
        from sqlalchemy.orm import selectinload

        stmt = (
            select(WipArticle)
            .options(
                selectinload(WipArticle.curator), selectinload(WipArticle.execution)
            )
            .where(
                and_(
                    WipArticle.research_stream_id == stream_id,
                    WipArticle.curation_notes != None,
                    WipArticle.curation_notes != "",
                )
            )
            .order_by(WipArticle.curated_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, wip_article_id: int) -> WipArticle:
        """Get a WipArticle by ID (async), raising ValueError if not found."""
        result = await self.db.execute(
            select(WipArticle).where(WipArticle.id == wip_article_id)
        )
        article = result.scalars().first()
        if not article:
            raise ValueError(f"WipArticle {wip_article_id} not found")
        return article

    async def get_by_id_or_404(self, wip_article_id: int) -> WipArticle:
        """Get a WipArticle by ID (async), raising HTTPException 404 if not found."""
        try:
            return await self.get_by_id(wip_article_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="WIP article not found"
            )

    async def get_by_execution_id(
        self, execution_id: str, included_only: bool = False
    ) -> List[WipArticle]:
        """Get all WipArticles for a pipeline execution (async)."""
        if included_only:
            result = await self.db.execute(
                select(WipArticle).where(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.included_in_report == True,
                )
            )
        else:
            result = await self.db.execute(
                select(WipArticle).where(
                    WipArticle.pipeline_execution_id == execution_id
                )
            )
        return list(result.scalars().all())

    async def get_for_filtering(
        self, execution_id: str, retrieval_group_id: str
    ) -> List[WipArticle]:
        """Get articles ready for semantic filtering (async)."""
        result = await self.db.execute(
            select(WipArticle).where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.retrieval_group_id == retrieval_group_id,
                    WipArticle.is_duplicate == False,
                    WipArticle.passed_semantic_filter == None,
                )
            )
        )
        return list(result.scalars().all())

    async def get_for_deduplication(self, execution_id: str) -> List[WipArticle]:
        """Get articles ready for cross-group deduplication (async)."""
        result = await self.db.execute(
            select(WipArticle).where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.is_duplicate == False,
                    or_(
                        WipArticle.passed_semantic_filter == True,
                        WipArticle.passed_semantic_filter == None,
                    ),
                )
            )
        )
        return list(result.scalars().all())

    async def get_included_articles(self, execution_id: str) -> List[WipArticle]:
        """Get articles marked for report inclusion (async)."""
        result = await self.db.execute(
            select(WipArticle).where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.included_in_report == True,
                )
            )
        )
        return list(result.scalars().all())

    async def get_article_by_pmid(
        self, execution_id: str, pmid: str
    ) -> Optional[WipArticle]:
        """Find a WipArticle by PMID within an execution (async)."""
        result = await self.db.execute(
            select(WipArticle).where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.pmid == pmid,
                )
            )
        )
        return result.scalars().first()

    async def get_all_articles_by_status(
        self, execution_id: str
    ) -> Dict[str, List[WipArticle]]:
        """Get all articles for an execution grouped by status (async)."""
        result = await self.db.execute(
            select(WipArticle).where(WipArticle.pipeline_execution_id == execution_id)
        )
        all_articles = list(result.scalars().all())

        grouped = {"included": [], "filtered_out": [], "duplicate": []}

        for article in all_articles:
            if article.is_duplicate:
                grouped["duplicate"].append(article)
            elif article.passed_semantic_filter == False:
                grouped["filtered_out"].append(article)
            elif article.included_in_report:
                grouped["included"].append(article)
            else:
                grouped["filtered_out"].append(article)

        return grouped

    async def get_curated_articles(self, execution_id: str) -> List[WipArticle]:
        """Get articles with curator overrides for an execution (async)."""
        result = await self.db.execute(
            select(WipArticle).where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    or_(
                        WipArticle.curator_included == True,
                        WipArticle.curator_excluded == True,
                    ),
                )
            )
        )
        return list(result.scalars().all())

    async def update_curation_notes(
        self, wip_article_id: int, user_id: int, notes: str
    ) -> WipArticle:
        """Update curation notes for a WipArticle (async)."""
        from datetime import datetime

        article = await self.get_by_id_or_404(wip_article_id)
        article.curation_notes = notes
        article.curated_by = user_id
        article.curated_at = datetime.utcnow()

        await self.db.commit()

        return article

    async def get_by_execution_and_identifiers(
        self, execution_id: str, pmid: Optional[str] = None, doi: Optional[str] = None
    ) -> Optional[WipArticle]:
        """Find a WipArticle by PMID or DOI within an execution (async)."""
        if pmid:
            result = await self.db.execute(
                select(WipArticle).where(
                    and_(
                        WipArticle.pipeline_execution_id == execution_id,
                        WipArticle.pmid == pmid,
                    )
                )
            )
            article = result.scalars().first()
            if article:
                return article

        if doi:
            result = await self.db.execute(
                select(WipArticle).where(
                    and_(
                        WipArticle.pipeline_execution_id == execution_id,
                        WipArticle.doi == doi,
                    )
                )
            )
            article = result.scalars().first()
            if article:
                return article

        return None

    async def delete_by_execution_id(self, execution_id: str) -> int:
        """Delete all WipArticles for a pipeline execution (async)."""
        from sqlalchemy import delete

        result = await self.db.execute(
            delete(WipArticle).where(WipArticle.pipeline_execution_id == execution_id)
        )
        return result.rowcount

    # =========================================================================
    # BUILD Operations (transform WipArticles for external services)
    # =========================================================================

    def build_filter_eval_items(
        self, articles: List[WipArticle]
    ) -> tuple[List[Dict[str, Any]], Dict[str, WipArticle]]:
        """
        Build evaluation items from WipArticles for semantic filter.

        Args:
            articles: List of WipArticle objects

        Returns:
            Tuple of (items list for AI evaluation, article_map for result matching)
        """
        items = []
        article_map = {}
        for article in articles:
            article_id = str(article.id)
            article_map[article_id] = article
            items.append({
                "id": article_id,
                "title": article.title or "",
                "abstract": article.abstract or "",
                "summary": article.summary or "",
                "journal": article.journal or "",
                "authors": article.authors or [],
            })
        return items, article_map

    async def commit(self) -> None:
        """Commit pending changes to the database (async)."""
        await self.db.commit()

    async def flush(self) -> None:
        """Flush pending changes without committing (async)."""
        await self.db.flush()


# Dependency injection provider for async wip article service
async def get_wip_article_service(
    db: AsyncSession = Depends(get_async_db),
) -> WipArticleService:
    """Get a WipArticleService instance with async database session."""
    return WipArticleService(db)
