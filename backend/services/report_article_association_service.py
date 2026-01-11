"""
ReportArticleAssociation Service - Atomic operations for report-article associations

This service provides atomic operations for the ReportArticleAssociation table.
All association operations should go through this service.
"""

import logging
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status

from models import ReportArticleAssociation, Article

logger = logging.getLogger(__name__)


class ReportArticleAssociationService:
    """
    Service for ReportArticleAssociation operations.

    Provides atomic, reusable methods for managing report-article associations.
    """

    def __init__(self, db: Session):
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
        Get all visible (non-excluded) associations for a report.

        Args:
            report_id: The report ID

        Returns:
            List of visible associations ordered by ranking
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.curator_excluded == False
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

    def get_excluded_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """
        Get curator-excluded associations for a report.

        Args:
            report_id: The report ID

        Returns:
            List of excluded associations
        """
        return self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.curator_excluded == True
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
                ReportArticleAssociation.curator_excluded == False
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
        curator_added: bool = False
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

        Returns:
            Created association
        """
        categories = presentation_categories or []

        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            ranking=ranking,
            presentation_categories=categories,
            original_presentation_categories=categories if not curator_added else [],
            original_ranking=ranking if not curator_added else None,
            ai_summary=ai_summary,
            original_ai_summary=ai_summary if not curator_added else None,
            relevance_score=relevance_score,
            curator_added=curator_added,
            curator_excluded=False,
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    # =========================================================================
    # UPDATE Operations
    # =========================================================================

    def set_excluded(
        self,
        association: ReportArticleAssociation,
        excluded: bool,
        user_id: int,
        notes: Optional[str] = None
    ) -> None:
        """
        Set the curator_excluded flag on an association.

        Args:
            association: The association to update
            excluded: True to exclude, False to restore
            user_id: ID of the user making the change
            notes: Optional curation notes
        """
        association.curator_excluded = excluded
        association.curated_by = user_id
        association.curated_at = datetime.utcnow()
        if notes is not None:
            association.curation_notes = notes

    def update_ranking(
        self,
        association: ReportArticleAssociation,
        ranking: int,
        user_id: int
    ) -> None:
        """
        Update the ranking of an association.

        Args:
            association: The association to update
            ranking: New ranking
            user_id: ID of the user making the change
        """
        association.ranking = ranking
        association.curated_by = user_id
        association.curated_at = datetime.utcnow()

    def update_categories(
        self,
        association: ReportArticleAssociation,
        categories: List[str],
        user_id: int
    ) -> None:
        """
        Update the presentation categories of an association.

        Args:
            association: The association to update
            categories: New category list
            user_id: ID of the user making the change
        """
        association.presentation_categories = categories
        association.curated_by = user_id
        association.curated_at = datetime.utcnow()

    def update_ai_summary(
        self,
        association: ReportArticleAssociation,
        summary: str,
        user_id: int
    ) -> None:
        """
        Update the AI summary of an association.

        Preserves original_ai_summary on first edit.

        Args:
            association: The association to update
            summary: New summary text
            user_id: ID of the user making the change
        """
        # Preserve original on first edit
        if association.original_ai_summary is None and association.ai_summary:
            association.original_ai_summary = association.ai_summary

        association.ai_summary = summary
        association.curated_by = user_id
        association.curated_at = datetime.utcnow()

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
        association = self.get(report_id, article_id)
        if association:
            self.db.delete(association)
            return True
        return False
