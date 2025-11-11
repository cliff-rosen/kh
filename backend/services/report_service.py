"""
Report Service for Knowledge Horizon
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import date

from models import Report, ReportArticleAssociation, Article
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
