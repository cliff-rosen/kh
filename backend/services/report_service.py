"""
Report Service for Knowledge Horizon
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import date

from models import Report, ReportArticleAssociation, Article, WipArticle
from schemas.report import Report as ReportSchema


class ReportService:
    def __init__(self, db: Session):
        self.db = db

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
                'presentation_categories': assoc.presentation_categories or []
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
