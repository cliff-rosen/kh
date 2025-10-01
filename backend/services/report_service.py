"""
Report Service for Knowledge Horizon
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import date

from models import Report, ReportArticleAssociation
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
