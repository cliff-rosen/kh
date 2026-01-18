"""
ReportArticleAssociation Service - Atomic operations for report-article associations

This service provides atomic operations for the ReportArticleAssociation table.
All association operations should go through this service.
"""

import logging
from typing import List, Optional, Tuple, Union
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, func
from fastapi import HTTPException, status, Depends

from models import ReportArticleAssociation
from database import get_async_db

logger = logging.getLogger(__name__)


class ReportArticleAssociationService:
    """
    Service for ReportArticleAssociation operations.

    Provides atomic, reusable methods for managing report-article associations.
    Supports both sync (Session) and async (AsyncSession) database access.
    """

    def __init__(self, db: Union[Session, AsyncSession]):
        self.db = db

    # =========================================================================
    # GET Operations
    # =========================================================================

    def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """
        Find an association by report and article ID.

        Use this for existence checks. For retrieval of known records, use get().

        Args:
            report_id: The report ID
            article_id: The article ID

        Returns:
            ReportArticleAssociation if found, None otherwise
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

    def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """
        Get an association by report and article ID, raising 404 if not found.

        Args:
            report_id: The report ID
            article_id: The article ID

        Returns:
            ReportArticleAssociation

        Raises:
            HTTPException: 404 if association not found
        """
        association = self.find(report_id, article_id)
        if not association:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )
        return association

    def get_visible_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """
        Get all visible (non-hidden) associations for a report.

        Args:
            report_id: The report ID

        Returns:
            List of visible associations ordered by ranking
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == False
            )
        ).order_by(ReportArticleAssociation.ranking).all()

    def get_all_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """
        Get all associations for a report (including excluded).

        Args:
            report_id: The report ID

        Returns:
            List of all associations ordered by ranking
        """
        return self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(ReportArticleAssociation.ranking).all()

    def get_hidden_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """
        Get hidden associations for a report.

        Args:
            report_id: The report ID

        Returns:
            List of hidden associations
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == True
            )
        ).all()

    def get_curator_added_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """
        Get curator-added associations for a report.

        Args:
            report_id: The report ID

        Returns:
            List of curator-added associations
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.curator_added == True
            )
        ).all()

    def count_visible(self, report_id: int) -> int:
        """
        Count visible articles in a report.

        Args:
            report_id: The report ID

        Returns:
            Number of visible articles
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.is_hidden == False
            )
        ).count()

    def get_next_ranking(self, report_id: int) -> int:
        """
        Get the next available ranking for a report.

        Args:
            report_id: The report ID

        Returns:
            Next ranking number (max + 1, or 1 if empty)
        """
        max_result = self.db.query(ReportArticleAssociation.ranking).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(ReportArticleAssociation.ranking.desc()).first()

        return (max_result[0] + 1) if max_result and max_result[0] else 1

    # =========================================================================
    # CREATE Operations
    # =========================================================================

    def create(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        presentation_categories: Optional[List[str]] = None,
        ai_summary: Optional[str] = None,
        relevance_score: Optional[float] = None,
        curator_added: bool = False,
        wip_article_id: Optional[int] = None
    ) -> ReportArticleAssociation:
        """
        Create a new association.

        Args:
            report_id: The report ID
            article_id: The article ID
            ranking: Position in the report
            presentation_categories: Category IDs
            ai_summary: AI-generated summary
            relevance_score: Relevance score
            curator_added: True if added by curator (not pipeline)
            wip_article_id: Optional link to WipArticle for curation data

        Returns:
            Created association
        """
        categories = presentation_categories or []

        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            wip_article_id=wip_article_id,
            ranking=ranking,
            presentation_categories=categories,
            original_presentation_categories=categories if not curator_added else [],
            original_ranking=ranking if not curator_added else None,
            ai_summary=ai_summary,
            original_ai_summary=ai_summary if not curator_added else None,
            relevance_score=relevance_score,
            curator_added=curator_added,
            is_hidden=False,
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    # =========================================================================
    # UPDATE Operations
    # =========================================================================

    def set_hidden(
        self,
        association: ReportArticleAssociation,
        hidden: bool
    ) -> None:
        """
        Set the is_hidden flag on an association.

        Note: Curation audit trail (who/when/why) is stored on WipArticle, not here.

        Args:
            association: The association to update
            hidden: True to hide, False to restore
        """
        association.is_hidden = hidden

    def update_ranking(
        self,
        association: ReportArticleAssociation,
        ranking: int
    ) -> None:
        """
        Update the ranking of an association.

        Args:
            association: The association to update
            ranking: New ranking
        """
        association.ranking = ranking

    def update_categories(
        self,
        association: ReportArticleAssociation,
        categories: List[str]
    ) -> None:
        """
        Update the presentation categories of an association.

        Args:
            association: The association to update
            categories: New category list
        """
        association.presentation_categories = categories

    def bulk_set_categories_from_pipeline(
        self,
        categorization_results: List[Tuple[ReportArticleAssociation, str]]
    ) -> int:
        """
        Bulk set presentation categories from pipeline categorization results.

        Sets both presentation_categories and original_presentation_categories
        since this is the initial assignment from the pipeline.

        Args:
            categorization_results: List of (association, category_id) tuples

        Returns:
            Number of associations categorized
        """
        categorized_count = 0
        for association, category_id in categorization_results:
            if category_id:
                categories = [category_id]
                association.presentation_categories = categories
                association.original_presentation_categories = categories
                categorized_count += 1
        return categorized_count

    def bulk_set_ai_summary_from_pipeline(
        self,
        summary_results: List[Tuple[ReportArticleAssociation, str]]
    ) -> int:
        """
        Bulk set AI summaries from pipeline summarization results.

        Sets both ai_summary and original_ai_summary since this is the
        initial assignment from the pipeline.

        Args:
            summary_results: List of (association, summary) tuples

        Returns:
            Number of associations with summaries set
        """
        summary_count = 0
        for association, summary in summary_results:
            if summary:
                association.ai_summary = summary
                association.original_ai_summary = summary
                summary_count += 1
        return summary_count

    def update_ai_summary(
        self,
        association: ReportArticleAssociation,
        summary: str
    ) -> None:
        """
        Update the AI summary of an association.

        Preserves original_ai_summary on first edit.

        Args:
            association: The association to update
            summary: New summary text
        """
        # Preserve original on first edit
        if association.original_ai_summary is None and association.ai_summary:
            association.original_ai_summary = association.ai_summary

        association.ai_summary = summary

    # =========================================================================
    # DELETE Operations
    # =========================================================================

    def delete(self, association: ReportArticleAssociation) -> None:
        """
        Delete an association.

        Args:
            association: The association to delete
        """
        self.db.delete(association)

    def delete_by_ids(self, report_id: int, article_id: int) -> bool:
        """
        Delete an association by report and article ID.

        Args:
            report_id: The report ID
            article_id: The article ID

        Returns:
            True if deleted, False if not found
        """
        association = self.find(report_id, article_id)
        if association:
            self.db.delete(association)
            return True
        return False

    def delete_all_for_report(self, report_id: int) -> int:
        """
        Delete all associations for a report.

        Args:
            report_id: The report ID

        Returns:
            Number of associations deleted
        """
        return self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).delete()

    # =========================================================================
    # ASYNC Methods
    # =========================================================================

    async def async_find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Find an association by report and article ID (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        return result.scalars().first()

    async def async_get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Get an association, raising 404 if not found (async)."""
        association = await self.async_find(report_id, article_id)
        if not association:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )
        return association

    async def async_get_visible_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all visible associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == False
                )
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def async_get_all_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def async_count_visible(self, report_id: int) -> int:
        """Count visible articles in a report (async)."""
        result = await self.db.execute(
            select(func.count(ReportArticleAssociation.article_id)).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == False
                )
            )
        )
        return result.scalar() or 0

    async def async_get_next_ranking(self, report_id: int) -> int:
        """Get the next available ranking for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation.ranking).where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking.desc()).limit(1)
        )
        max_ranking = result.scalar()
        return (max_ranking + 1) if max_ranking else 1

    async def async_create(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        presentation_categories: Optional[List[str]] = None,
        ai_summary: Optional[str] = None,
        relevance_score: Optional[float] = None,
        curator_added: bool = False,
        wip_article_id: Optional[int] = None
    ) -> ReportArticleAssociation:
        """Create a new association (async)."""
        categories = presentation_categories or []

        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            wip_article_id=wip_article_id,
            ranking=ranking,
            presentation_categories=categories,
            original_presentation_categories=categories if not curator_added else [],
            original_ranking=ranking if not curator_added else None,
            ai_summary=ai_summary,
            original_ai_summary=ai_summary if not curator_added else None,
            relevance_score=relevance_score,
            curator_added=curator_added,
            is_hidden=False,
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    async def async_delete(self, association: ReportArticleAssociation) -> None:
        """Delete an association (async)."""
        await self.db.delete(association)

    async def async_delete_by_ids(self, report_id: int, article_id: int) -> bool:
        """Delete an association by IDs (async)."""
        association = await self.async_find(report_id, article_id)
        if association:
            await self.db.delete(association)
            return True
        return False


# Dependency injection provider for async association service
async def get_async_association_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportArticleAssociationService:
    """Get a ReportArticleAssociationService instance with async database session."""
    return ReportArticleAssociationService(db)
