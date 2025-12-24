"""
Report Service for Knowledge Horizon

This service is the ONLY place that should write to the Report and
ReportArticleAssociation tables. All other services should use this
service for report-related operations.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from fastapi import HTTPException, status

from models import Report, ReportArticleAssociation, Article, WipArticle
from schemas.report import Report as ReportSchema

logger = logging.getLogger(__name__)


class ReportService:
    """
    Service for all Report and ReportArticleAssociation operations.

    This is the single source of truth for Report table access.
    Only this service should write to the Report and ReportArticleAssociation tables.
    """

    def __init__(self, db: Session):
        self.db = db

    def get_report(self, report_id: int, user_id: int) -> Report:
        """
        Get a report by ID for a user.

        Args:
            report_id: The report ID
            user_id: The user ID (for ownership verification)

        Returns:
            Report ORM model

        Raises:
            HTTPException: 404 if report not found or user doesn't have access
        """
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        return report

    def get_reports_for_stream(self, research_stream_id: int, user_id: int) -> List[ReportSchema]:
        """Get all reports for a research stream"""
        reports = self.db.query(Report).filter(
            and_(
                Report.research_stream_id == research_stream_id,
                Report.user_id == user_id
            )
        ).order_by(Report.report_date.desc()).all()

        # Add article count to each report
        result = []
        for report in reports:
            report_dict = ReportSchema.from_orm(report).dict()
            article_count = self.db.query(ReportArticleAssociation).filter(
                ReportArticleAssociation.report_id == report.report_id
            ).count()
            report_dict['article_count'] = article_count
            result.append(ReportSchema(**report_dict))

        return result

    def get_latest_report_for_stream(self, research_stream_id: int, user_id: int) -> Optional[ReportSchema]:
        """Get the most recent report for a research stream"""
        report = self.db.query(Report).filter(
            and_(
                Report.research_stream_id == research_stream_id,
                Report.user_id == user_id
            )
        ).order_by(Report.report_date.desc()).first()

        if not report:
            return None

        # Add article count
        article_count = self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report.report_id
        ).count()

        report_dict = ReportSchema.from_orm(report).dict()
        report_dict['article_count'] = article_count
        return ReportSchema(**report_dict)

    def get_recent_reports(self, user_id: int, limit: int = 5) -> List[ReportSchema]:
        """Get the most recent reports across all streams for a user"""
        reports = self.db.query(Report).filter(
            Report.user_id == user_id
        ).order_by(Report.created_at.desc()).limit(limit).all()

        result = []
        for report in reports:
            report_dict = ReportSchema.from_orm(report).dict()
            article_count = self.db.query(ReportArticleAssociation).filter(
                ReportArticleAssociation.report_id == report.report_id
            ).count()
            report_dict['article_count'] = article_count
            result.append(ReportSchema(**report_dict))

        return result

    def get_report_with_articles(self, report_id: int, user_id: int) -> Optional[Dict[str, Any]]:
        """Get a report with its associated articles"""
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report:
            return None

        # Get articles with association data
        article_associations = self.db.query(
            ReportArticleAssociation, Article
        ).join(
            Article, Article.article_id == ReportArticleAssociation.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).order_by(
            ReportArticleAssociation.ranking
        ).all()

        # Build article list with association metadata
        articles = []
        for assoc, article in article_associations:
            article_dict = {
                'article_id': article.article_id,
                'title': article.title,
                'authors': article.authors,
                'journal': article.journal,
                'publication_date': article.publication_date.isoformat() if article.publication_date else None,
                'pmid': article.pmid,
                'doi': article.doi,
                'abstract': article.abstract,
                'url': article.url,
                'year': article.year,
                # Association metadata
                'relevance_score': assoc.relevance_score,
                'relevance_rationale': assoc.relevance_rationale,
                'ranking': assoc.ranking,
                'is_starred': assoc.is_starred,
                'is_read': assoc.is_read,
                'notes': assoc.notes,
                'presentation_categories': assoc.presentation_categories or [],
                'ai_enrichments': assoc.ai_enrichments
            }
            articles.append(article_dict)

        # Build complete report dict
        report_dict = ReportSchema.from_orm(report).dict()
        report_dict['article_count'] = len(articles)
        report_dict['articles'] = articles

        return report_dict

    def get_wip_articles_for_report(self, report_id: int, user_id: int, included_only: bool = True) -> List[WipArticle]:
        """
        Get WIP articles for a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for ownership verification)
            included_only: If True, only return articles with included_in_report=True

        Returns:
            List of WipArticle objects
        """
        # Get the report to verify ownership and get pipeline_execution_id
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report or not report.pipeline_execution_id:
            return []

        # Build query
        query = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == report.pipeline_execution_id
        )

        if included_only:
            query = query.filter(WipArticle.included_in_report == True)

        return query.all()

    def delete_report(self, report_id: int, user_id: int) -> bool:
        """
        Delete a report and its associated data (wip_articles, article associations).
        Returns True if report was deleted, False if not found or unauthorized.
        """
        # Find the report
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report:
            return False

        # Delete wip_articles associated with this pipeline execution (if any)
        if report.pipeline_execution_id:
            self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).delete()

        # Delete article associations (due to foreign key constraints)
        self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).delete()

        # Delete the report
        self.db.delete(report)
        self.db.commit()

        return True

    # =========================================================================
    # CREATE Operations
    # =========================================================================

    def create_report(
        self,
        user_id: int,
        research_stream_id: int,
        report_date: date,
        title: str,
        pipeline_execution_id: Optional[str] = None,
        executive_summary: Optional[str] = None,
        enrichments: Optional[Dict[str, Any]] = None
    ) -> Report:
        """
        Create a new report.

        Args:
            user_id: Owner user ID
            research_stream_id: Associated research stream ID
            report_date: Date of the report
            title: Report title
            pipeline_execution_id: Optional pipeline execution ID
            executive_summary: Optional executive summary
            enrichments: Optional enrichments dict (category summaries, etc.)

        Returns:
            Created Report instance
        """
        # Build enrichments with executive_summary included
        final_enrichments = enrichments or {}
        if executive_summary:
            final_enrichments["executive_summary"] = executive_summary

        report = Report(
            user_id=user_id,
            research_stream_id=research_stream_id,
            report_date=report_date,
            report_name=title,
            pipeline_execution_id=pipeline_execution_id,
            enrichments=final_enrichments,
            created_at=datetime.utcnow()
        )
        self.db.add(report)
        self.db.flush()  # Get the report_id
        return report

    def create_article_association(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        relevance_score: Optional[float] = None,
        relevance_rationale: Optional[str] = None,
        presentation_categories: Optional[List[str]] = None
    ) -> ReportArticleAssociation:
        """
        Create a report-article association.

        Args:
            report_id: Report ID
            article_id: Article ID
            ranking: Article ranking in the report
            relevance_score: Optional relevance score
            relevance_rationale: Optional relevance explanation
            presentation_categories: Optional list of category IDs

        Returns:
            Created ReportArticleAssociation instance
        """
        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            ranking=ranking,
            relevance_score=relevance_score,
            relevance_rationale=relevance_rationale,
            presentation_categories=presentation_categories or [],
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    def update_report_enrichments(
        self,
        report: Report,
        executive_summary: Optional[str] = None,
        enrichments: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Update report enrichments (executive summary, category summaries).

        Args:
            report: Report instance to update
            executive_summary: New executive summary
            enrichments: New enrichments dict
        """
        if executive_summary is not None:
            report.executive_summary = executive_summary
        if enrichments is not None:
            report.enrichments = enrichments
        report.updated_at = datetime.utcnow()

    # =========================================================================
    # Extended READ Operations
    # =========================================================================

    def get_report_with_wip_articles(
        self,
        report_id: int,
        user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Get report with all WIP articles for analytics/debugging.

        Args:
            report_id: Report ID
            user_id: User ID for ownership verification

        Returns:
            Dict with report data and wip_articles, or None if not found
        """
        report = self.db.query(Report).filter(
            and_(
                Report.report_id == report_id,
                Report.user_id == user_id
            )
        ).first()

        if not report:
            return None

        # Get WIP articles if pipeline execution exists
        wip_articles = []
        if report.pipeline_execution_id:
            wip_articles = self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).all()

        return {
            "report": report,
            "wip_articles": wip_articles
        }

    def get_report_article_associations(
        self,
        report_id: int
    ) -> List[ReportArticleAssociation]:
        """
        Get all article associations for a report.

        Args:
            report_id: Report ID

        Returns:
            List of ReportArticleAssociation instances with joined Article data
        """
        return self.db.query(ReportArticleAssociation).join(Article).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

    def get_report_pmids(self, report_id: int) -> Dict[str, Article]:
        """
        Get a mapping of PMIDs to Articles for a report.

        Args:
            report_id: Report ID

        Returns:
            Dict mapping PMID -> Article
        """
        associations = self.db.query(ReportArticleAssociation).join(Article).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

        return {
            assoc.article.pmid: assoc.article
            for assoc in associations
            if assoc.article.pmid
        }

    # =========================================================================
    # COMMIT Operations
    # =========================================================================

    def commit(self) -> None:
        """Commit pending changes to the database."""
        self.db.commit()

    def flush(self) -> None:
        """Flush pending changes without committing."""
        self.db.flush()
