"""
ReportArticleAssociation Service - Atomic operations for report-article associations

This service provides atomic operations for the ReportArticleAssociation table.
All association operations should go through this service.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status, Depends

from models import ReportArticleAssociation
from database import get_async_db

logger = logging.getLogger(__name__)


class ReportArticleAssociationService:
    """
    Service for ReportArticleAssociation operations.

    Provides atomic, reusable methods for managing report-article associations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # In-Memory Operations (no database queries, just modify objects)
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
    # ASYNC Methods
    # =========================================================================

    async def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Find an association by report and article ID (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        return result.scalars().first()

    async def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Get an association, raising 404 if not found (async)."""
        association = await self.find(report_id, article_id)
        if not association:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found in report"
            )
        return association

    async def get_visible_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all visible associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == False
                )
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def get_all_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def update_enrichments(
        self,
        report_id: int,
        article_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[ReportArticleAssociation]:
        """
        Update AI enrichments on an association.

        Args:
            report_id: The report ID
            article_id: The article ID
            ai_enrichments: The enrichments dict to set

        Returns:
            Updated association, or None if not found
        """
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        assoc = result.scalars().first()
        if not assoc:
            return None

        assoc.ai_enrichments = ai_enrichments
        await self.db.commit()
        return assoc

    async def update_notes(
        self,
        report_id: int,
        article_id: int,
        notes: List[Dict[str, Any]]
    ) -> Optional[ReportArticleAssociation]:
        """
        Update notes on an association.

        Args:
            report_id: The report ID
            article_id: The article ID
            notes: The notes list to set

        Returns:
            Updated association, or None if not found
        """
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        assoc = result.scalars().first()
        if not assoc:
            return None

        assoc.notes = notes
        await self.db.commit()
        return assoc

    async def count_visible(self, report_id: int) -> int:
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

    async def count_all(self, report_id: int) -> int:
        """Count all associations for a report (async)."""
        result = await self.db.execute(
            select(func.count(ReportArticleAssociation.article_id)).where(
                ReportArticleAssociation.report_id == report_id
            )
        )
        return result.scalar() or 0

    async def get_next_ranking(self, report_id: int) -> int:
        """Get the next available ranking for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation.ranking).where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking.desc()).limit(1)
        )
        max_ranking = result.scalar()
        return (max_ranking + 1) if max_ranking else 1

    async def create(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        presentation_categories: Optional[List[str]] = None,
        ai_summary: Optional[str] = None,
        relevance_score: Optional[float] = None,
        relevance_rationale: Optional[str] = None,
        curator_added: bool = False,
        wip_article_id: Optional[int] = None
    ) -> ReportArticleAssociation:
        """Create a new association (async). Does not commit."""
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
            relevance_rationale=relevance_rationale,
            curator_added=curator_added,
            is_hidden=False,
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    async def bulk_create(
        self,
        report_id: int,
        items: List[Dict[str, Any]]
    ) -> List[ReportArticleAssociation]:
        """
        Bulk create associations for a report.

        Args:
            report_id: The report ID
            items: List of dicts with keys:
                - article_id (required)
                - wip_article_id (optional)
                - ranking (required)
                - relevance_score (optional)
                - relevance_rationale (optional)

        Returns:
            List of created associations. Does not commit.
        """
        associations = []
        for item in items:
            association = ReportArticleAssociation(
                report_id=report_id,
                article_id=item["article_id"],
                wip_article_id=item.get("wip_article_id"),
                ranking=item["ranking"],
                relevance_score=item.get("relevance_score"),
                relevance_rationale=item.get("relevance_rationale"),
                presentation_categories=[],
                original_presentation_categories=[],
                original_ranking=item["ranking"],
                is_hidden=False,
                is_starred=False,
                is_read=False,
                curator_added=False
            )
            self.db.add(association)
            associations.append(association)
        return associations

    async def delete(self, association: ReportArticleAssociation) -> None:
        """Delete an association (async)."""
        await self.db.delete(association)

    async def delete_by_ids(self, report_id: int, article_id: int) -> bool:
        """Delete an association by IDs (async)."""
        association = await self.find(report_id, article_id)
        if association:
            await self.db.delete(association)
            return True
        return False

    async def get_hidden_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get hidden associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == True
                )
            )
        )
        return list(result.scalars().all())

    async def get_curator_added_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get curator-added associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.curator_added == True
                )
            )
        )
        return list(result.scalars().all())

    async def get_starred_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get starred associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_starred == True
                )
            )
            .order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def get_article_ids_for_report(self, report_id: int) -> List[int]:
        """Get just the article IDs for a report (for deduplication checks)."""
        result = await self.db.execute(
            select(ReportArticleAssociation.article_id).where(
                ReportArticleAssociation.report_id == report_id
            )
        )
        return list(result.scalars().all())

    async def delete_all_for_report(self, report_id: int) -> int:
        """Delete all associations for a report (async)."""
        from sqlalchemy import delete as sql_delete
        result = await self.db.execute(
            sql_delete(ReportArticleAssociation).where(
                ReportArticleAssociation.report_id == report_id
            )
        )
        return result.rowcount


# Dependency injection provider for async association service
async def get_association_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportArticleAssociationService:
    """Get a ReportArticleAssociationService instance with async database session."""
    return ReportArticleAssociationService(db)
