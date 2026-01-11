"""
WIP Article Service - Single source of truth for WipArticle operations

This service is the ONLY place that should write to the WipArticle table.
All other services should use this service for WipArticle operations.
"""

import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from models import WipArticle

logger = logging.getLogger(__name__)


class WipArticleService:
    """
    Service for all WipArticle operations.

    This is the single source of truth for WipArticle table access.
    Only this service should write to the WipArticle table.
    """

    def __init__(self, db: Session):
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
        source_specific_id: Optional[str] = None
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
            presentation_categories=[]
        )
        self.db.add(wip_article)
        return wip_article

    def bulk_create_wip_articles(self, articles: List[WipArticle]) -> None:
        """
        Bulk add WipArticle records.

        Args:
            articles: List of WipArticle instances to add
        """
        self.db.add_all(articles)

    # =========================================================================
    # READ Operations
    # =========================================================================

    def get_by_execution_id(
        self,
        execution_id: str,
        included_only: bool = False
    ) -> List[WipArticle]:
        """
        Get all WipArticles for a pipeline execution.

        Args:
            execution_id: Pipeline execution ID
            included_only: If True, only return articles with included_in_report=True

        Returns:
            List of WipArticle instances
        """
        query = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == execution_id
        )

        if included_only:
            query = query.filter(WipArticle.included_in_report == True)

        return query.all()

    def get_for_filtering(
        self,
        execution_id: str,
        retrieval_group_id: str
    ) -> List[WipArticle]:
        """
        Get articles ready for semantic filtering.

        Args:
            execution_id: Pipeline execution ID
            retrieval_group_id: Retrieval group (concept/query) ID

        Returns:
            List of WipArticle instances that need filtering
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.retrieval_group_id == retrieval_group_id,
                WipArticle.is_duplicate == False,
                WipArticle.passed_semantic_filter == None
            )
        ).all()

    def get_for_deduplication(self, execution_id: str) -> List[WipArticle]:
        """
        Get articles ready for cross-group deduplication.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            List of WipArticle instances that passed filtering
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.is_duplicate == False,
                or_(
                    WipArticle.passed_semantic_filter == True,
                    WipArticle.passed_semantic_filter == None
                )
            )
        ).all()

    def get_for_inclusion(self, execution_id: str) -> List[WipArticle]:
        """
        Get articles ready for report inclusion marking.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            List of WipArticle instances that can be included in report
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.is_duplicate == False,
                or_(
                    WipArticle.passed_semantic_filter == True,
                    WipArticle.passed_semantic_filter == None
                )
            )
        ).all()

    def get_included_articles(self, execution_id: str) -> List[WipArticle]:
        """
        Get articles marked for report inclusion.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            List of WipArticle instances included in report
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.included_in_report == True
            )
        ).all()

    def get_all_articles_by_status(self, execution_id: str) -> Dict[str, List[WipArticle]]:
        """
        Get all articles for an execution grouped by pipeline decision status.

        Used for curation workflow where we need to show all candidate articles.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            Dict with keys 'included', 'filtered_out', 'duplicate' mapping to lists of WipArticles
        """
        all_articles = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == execution_id
        ).all()

        result = {
            'included': [],
            'filtered_out': [],
            'duplicate': []
        }

        for article in all_articles:
            if article.is_duplicate:
                result['duplicate'].append(article)
            elif article.passed_semantic_filter == False:
                result['filtered_out'].append(article)
            elif article.included_in_report:
                result['included'].append(article)
            else:
                # Articles that passed filter but aren't marked for inclusion yet
                # This shouldn't happen in normal flow, but handle gracefully
                result['filtered_out'].append(article)

        return result

    def get_filtered_articles(self, execution_id: str) -> List[WipArticle]:
        """
        Get articles that were filtered out by semantic filter.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            List of WipArticle instances that failed the semantic filter
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.is_duplicate == False,
                WipArticle.passed_semantic_filter == False
            )
        ).all()

    def get_duplicate_articles(self, execution_id: str) -> List[WipArticle]:
        """
        Get articles marked as duplicates.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            List of WipArticle instances marked as duplicates
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.is_duplicate == True
            )
        ).all()

    def get_article_by_pmid(
        self,
        execution_id: str,
        pmid: str
    ) -> Optional[WipArticle]:
        """
        Find a WipArticle by PMID within an execution.

        Args:
            execution_id: Pipeline execution ID
            pmid: PubMed ID to search for

        Returns:
            WipArticle if found, None otherwise
        """
        return self.db.query(WipArticle).filter(
            and_(
                WipArticle.pipeline_execution_id == execution_id,
                WipArticle.pmid == pmid
            )
        ).first()

    # =========================================================================
    # UPDATE Operations
    # =========================================================================

    def mark_as_duplicate(
        self,
        article: WipArticle,
        duplicate_of_pmid: str
    ) -> None:
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
        score_reason: Optional[str] = None
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
        self,
        article: WipArticle,
        category_id: Optional[str]
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

    def bulk_update_categories(
        self,
        categorization_results: List[tuple]
    ) -> int:
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
    # DELETE Operations
    # =========================================================================

    def delete_by_execution_id(self, execution_id: str) -> int:
        """
        Delete all WipArticles for a pipeline execution.

        Args:
            execution_id: Pipeline execution ID

        Returns:
            Number of articles deleted
        """
        count = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == execution_id
        ).delete()
        return count

    # =========================================================================
    # COMMIT Operations
    # =========================================================================

    def commit(self) -> None:
        """Commit pending changes to the database."""
        self.db.commit()

    def flush(self) -> None:
        """Flush pending changes without committing."""
        self.db.flush()
