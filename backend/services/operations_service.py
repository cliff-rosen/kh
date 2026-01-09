"""
Operations Service - Report queue and scheduler management

This service handles:
- Report queue operations (list, approve, reject)
- Scheduler management (list scheduled streams, update schedules)
"""

import logging
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import HTTPException, status

from models import (
    Report, ResearchStream, PipelineExecution, User,
    ReportArticleAssociation, Article, WipArticle, ApprovalStatus
)

logger = logging.getLogger(__name__)


class OperationsService:
    """
    Service for operations management - report queue and scheduler.

    All database operations for the operations router go through this service.
    """

    def __init__(self, db: Session):
        self.db = db

    # ==================== Report Queue ====================

    def get_report_queue(
        self,
        user_id: int,
        status_filter: Optional[str] = None,
        stream_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get all reports for the approval queue.

        Args:
            user_id: The requesting user's ID
            status_filter: Filter by approval status (awaiting_approval, approved, rejected, or all)
            stream_id: Filter by stream ID
            limit: Maximum number of reports to return
            offset: Pagination offset

        Returns:
            Dict with reports list, total count, and streams for filter dropdown
        """
        logger.info(f"get_report_queue - user_id={user_id}, status={status_filter}, stream_id={stream_id}")

        # Build query
        query = self.db.query(Report).join(
            ResearchStream, Report.research_stream_id == ResearchStream.stream_id
        )

        # Apply filters
        if status_filter and status_filter != 'all':
            try:
                status_enum = ApprovalStatus(status_filter)
                query = query.filter(Report.approval_status == status_enum)
            except ValueError:
                pass  # Ignore invalid status

        if stream_id:
            query = query.filter(Report.research_stream_id == stream_id)

        # Get total count
        total = query.count()

        # Get reports with pagination
        reports_db = query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()

        # Build response
        reports = []
        for report in reports_db:
            stream = self.db.query(ResearchStream).filter(
                ResearchStream.stream_id == report.research_stream_id
            ).first()

            approved_by_email = None
            if report.approved_by:
                approver = self.db.query(User).filter(User.user_id == report.approved_by).first()
                approved_by_email = approver.email if approver else None

            # Get article count from pipeline_metrics or count associations
            article_count = 0
            if report.pipeline_metrics:
                article_count = (
                    report.pipeline_metrics.get('articles_after_filter', 0) or
                    report.pipeline_metrics.get('article_count', 0)
                )
            if not article_count:
                article_count = len(report.article_associations) if report.article_associations else 0

            reports.append({
                "report_id": report.report_id,
                "report_name": report.report_name,
                "stream_id": report.research_stream_id,
                "stream_name": stream.stream_name if stream else "Unknown",
                "article_count": article_count,
                "run_type": report.run_type.value if report.run_type else "manual",
                "approval_status": report.approval_status.value if report.approval_status else "awaiting_approval",
                "created_at": report.created_at,
                "approved_by": approved_by_email,
                "approved_at": report.approved_at,
                "rejection_reason": report.rejection_reason,
                "pipeline_execution_id": report.pipeline_execution_id
            })

        # Get streams for filter dropdown
        streams = self.db.query(ResearchStream.stream_id, ResearchStream.stream_name).distinct().all()
        streams_list = [{"stream_id": s.stream_id, "stream_name": s.stream_name} for s in streams]

        logger.info(f"get_report_queue complete - user_id={user_id}, count={len(reports)}, total={total}")
        return {
            "reports": reports,
            "total": total,
            "streams": streams_list
        }

    def get_report_detail(self, report_id: int, user_id: int) -> Dict[str, Any]:
        """
        Get full report details for review.

        Args:
            report_id: The report to retrieve
            user_id: The requesting user's ID

        Returns:
            Dict with full report details including articles and execution info

        Raises:
            HTTPException: 404 if report not found
        """
        logger.info(f"get_report_detail - user_id={user_id}, report_id={report_id}")

        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            logger.warning(f"Report not found - report_id={report_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == report.research_stream_id
        ).first()

        # Get approval info
        approved_by_email = None
        if report.approved_by:
            approver = self.db.query(User).filter(User.user_id == report.approved_by).first()
            approved_by_email = approver.email if approver else None

        # Get execution details
        execution_info = None
        if report.pipeline_execution_id:
            execution = self.db.query(PipelineExecution).filter(
                PipelineExecution.id == report.pipeline_execution_id
            ).first()
            if execution:
                execution_info = {
                    "id": execution.id,
                    "stream_id": execution.stream_id,
                    "status": execution.status.value if execution.status else "completed",
                    "run_type": execution.run_type.value if execution.run_type else "manual",
                    "started_at": execution.started_at.isoformat() if execution.started_at else None,
                    "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
                    "error": execution.error,
                    "report_id": execution.report_id,
                    "articles_retrieved": report.pipeline_metrics.get("articles_retrieved") if report.pipeline_metrics else None,
                    "articles_after_dedup": report.pipeline_metrics.get("articles_after_dedup") if report.pipeline_metrics else None,
                    "articles_after_filter": report.pipeline_metrics.get("articles_after_filter") if report.pipeline_metrics else None,
                    "filter_config": report.pipeline_metrics.get("filter_config") if report.pipeline_metrics else None,
                }

        # Get report articles with article details
        report_articles = self.db.query(ReportArticleAssociation).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

        articles_list = []
        categories_dict = {}

        for ra in report_articles:
            article = self.db.query(Article).filter(Article.article_id == ra.article_id).first()
            if article:
                # Get presentation_categories if exists on the association
                presentation_categories = getattr(ra, 'presentation_categories', None) or []

                article_data = {
                    "article_id": article.article_id,
                    "title": article.title,
                    "authors": article.authors or [],
                    "journal": article.journal,
                    "year": article.publication_year,
                    "pmid": article.pmid,
                    "abstract": article.abstract,
                    "category_id": presentation_categories[0] if presentation_categories else None,
                    "relevance_score": ra.relevance_score or 0.0,
                    "filter_passed": True,
                }
                articles_list.append(article_data)

                # Track categories
                for cat_id in presentation_categories:
                    if cat_id not in categories_dict:
                        categories_dict[cat_id] = {
                            "id": cat_id,
                            "name": cat_id.replace("_", " ").title(),
                            "article_count": 0
                        }
                    categories_dict[cat_id]["article_count"] += 1

        categories_list = list(categories_dict.values())

        # Get WIP articles if execution exists
        wip_articles_list = []
        if report.pipeline_execution_id:
            wip_articles = self.db.query(WipArticle).filter(
                WipArticle.pipeline_execution_id == report.pipeline_execution_id
            ).all()
            for wip in wip_articles:
                wip_data = {
                    "id": wip.wip_article_id,
                    "title": wip.title,
                    "authors": wip.authors or [],
                    "journal": wip.journal,
                    "year": wip.publication_year,
                    "pmid": wip.pmid,
                    "abstract": wip.abstract,
                    "is_duplicate": wip.is_duplicate or False,
                    "duplicate_of_id": wip.duplicate_of_id,
                    "passed_semantic_filter": wip.passed_semantic_filter,
                    "filter_rejection_reason": wip.filter_rejection_reason,
                    "included_in_report": wip.included_in_report or False,
                    "presentation_categories": wip.presentation_categories or [],
                    "relevance_score": wip.relevance_score,
                }
                wip_articles_list.append(wip_data)

        # Get executive summary from enrichments
        executive_summary = None
        if report.enrichments:
            executive_summary = report.enrichments.get("executive_summary")

        logger.info(f"get_report_detail complete - user_id={user_id}, report_id={report_id}")
        return {
            "report_id": report.report_id,
            "report_name": report.report_name,
            "stream_id": report.research_stream_id,
            "stream_name": stream.stream_name if stream else "Unknown",
            "run_type": report.run_type.value if report.run_type else "manual",
            "approval_status": report.approval_status.value if report.approval_status else "awaiting_approval",
            "created_at": report.created_at,
            "article_count": len(articles_list),
            "pipeline_execution_id": report.pipeline_execution_id,
            "executive_summary": executive_summary,
            "categories": categories_list,
            "articles": articles_list,
            "execution": execution_info,
            "wip_articles": wip_articles_list,
            "approved_by": approved_by_email,
            "approved_at": report.approved_at,
            "rejection_reason": report.rejection_reason,
        }

    def approve_report(self, report_id: int, user_id: int) -> Dict[str, Any]:
        """
        Approve a report for distribution.

        Args:
            report_id: The report to approve
            user_id: The approving user's ID

        Returns:
            Dict with status and report_id

        Raises:
            HTTPException: 404 if report not found
        """
        logger.info(f"approve_report - user_id={user_id}, report_id={report_id}")

        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            logger.warning(f"Report not found for approval - report_id={report_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        report.approval_status = ApprovalStatus.APPROVED
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()
        report.rejection_reason = None

        self.db.commit()

        logger.info(f"approve_report complete - user_id={user_id}, report_id={report_id}")
        return {"status": "approved", "report_id": report_id}

    def reject_report(self, report_id: int, user_id: int, reason: str) -> Dict[str, Any]:
        """
        Reject a report with a reason.

        Args:
            report_id: The report to reject
            user_id: The rejecting user's ID
            reason: Reason for rejection

        Returns:
            Dict with status, report_id, and reason

        Raises:
            HTTPException: 404 if report not found
        """
        logger.info(f"reject_report - user_id={user_id}, report_id={report_id}")

        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            logger.warning(f"Report not found for rejection - report_id={report_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        report.approval_status = ApprovalStatus.REJECTED
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()
        report.rejection_reason = reason

        self.db.commit()

        logger.info(f"reject_report complete - user_id={user_id}, report_id={report_id}")
        return {"status": "rejected", "report_id": report_id, "reason": reason}

    # ==================== Scheduler Management ====================

    def get_scheduled_streams(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Get all streams with scheduling configuration and their last execution status.

        Args:
            user_id: The requesting user's ID

        Returns:
            List of scheduled stream info dicts
        """
        logger.info(f"get_scheduled_streams - user_id={user_id}")

        # Get all streams that have schedule_config (not null)
        streams = self.db.query(ResearchStream).filter(
            ResearchStream.schedule_config.isnot(None)
        ).all()

        result = []
        for stream in streams:
            # Parse schedule_config
            schedule_config = stream.schedule_config or {}
            config_info = {
                "enabled": schedule_config.get('enabled', False),
                "frequency": schedule_config.get('frequency', 'weekly'),
                "anchor_day": schedule_config.get('anchor_day'),
                "preferred_time": schedule_config.get('preferred_time', '08:00'),
                "timezone": schedule_config.get('timezone', 'UTC'),
                "lookback_days": schedule_config.get('lookback_days')
            }

            # Get last execution
            last_exec = None
            if stream.last_execution_id:
                exec_db = self.db.query(PipelineExecution).filter(
                    PipelineExecution.id == stream.last_execution_id
                ).first()
                if exec_db:
                    # Get report info if completed
                    report_approval_status = None
                    article_count = None
                    if exec_db.report_id:
                        report = self.db.query(Report).filter(
                            Report.report_id == exec_db.report_id
                        ).first()
                        if report:
                            report_approval_status = report.approval_status.value if report.approval_status else None
                            # Get article count from pipeline_metrics
                            if report.pipeline_metrics:
                                article_count = (
                                    report.pipeline_metrics.get('articles_after_filter', 0) or
                                    report.pipeline_metrics.get('article_count', 0)
                                )
                            if not article_count:
                                article_count = len(report.article_associations) if report.article_associations else 0

                    last_exec = {
                        "id": exec_db.id,
                        "stream_id": exec_db.stream_id,
                        "status": exec_db.status.value if exec_db.status else 'pending',
                        "run_type": exec_db.run_type.value if exec_db.run_type else 'manual',
                        "started_at": exec_db.started_at.isoformat() if exec_db.started_at else None,
                        "completed_at": exec_db.completed_at.isoformat() if exec_db.completed_at else None,
                        "error": exec_db.error,
                        "report_id": exec_db.report_id,
                        "report_approval_status": report_approval_status,
                        "article_count": article_count
                    }

            result.append({
                "stream_id": stream.stream_id,
                "stream_name": stream.stream_name,
                "schedule_config": config_info,
                "next_scheduled_run": stream.next_scheduled_run.isoformat() if stream.next_scheduled_run else None,
                "last_execution": last_exec
            })

        logger.info(f"get_scheduled_streams complete - user_id={user_id}, count={len(result)}")
        return result

    def update_stream_schedule(
        self,
        stream_id: int,
        user_id: int,
        updates: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update scheduling configuration for a stream.

        Args:
            stream_id: The stream to update
            user_id: The requesting user's ID
            updates: Dict with schedule config updates

        Returns:
            Updated scheduled stream info

        Raises:
            HTTPException: 404 if stream not found
        """
        logger.info(f"update_stream_schedule - user_id={user_id}, stream_id={stream_id}")

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            logger.warning(f"Stream not found for schedule update - stream_id={stream_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        # Update schedule_config
        current_config = stream.schedule_config or {}

        if updates.get('enabled') is not None:
            current_config['enabled'] = updates['enabled']
        if updates.get('frequency') is not None:
            current_config['frequency'] = updates['frequency']
        if updates.get('anchor_day') is not None:
            current_config['anchor_day'] = updates['anchor_day']
        if updates.get('preferred_time') is not None:
            current_config['preferred_time'] = updates['preferred_time']
        if updates.get('timezone') is not None:
            current_config['timezone'] = updates['timezone']
        if updates.get('lookback_days') is not None:
            current_config['lookback_days'] = updates['lookback_days']

        stream.schedule_config = current_config
        self.db.commit()
        self.db.refresh(stream)

        # Build response
        config_info = {
            "enabled": current_config.get('enabled', False),
            "frequency": current_config.get('frequency', 'weekly'),
            "anchor_day": current_config.get('anchor_day'),
            "preferred_time": current_config.get('preferred_time', '08:00'),
            "timezone": current_config.get('timezone', 'UTC'),
            "lookback_days": current_config.get('lookback_days')
        }

        logger.info(f"update_stream_schedule complete - user_id={user_id}, stream_id={stream_id}")
        return {
            "stream_id": stream.stream_id,
            "stream_name": stream.stream_name,
            "schedule_config": config_info,
            "next_scheduled_run": stream.next_scheduled_run.isoformat() if stream.next_scheduled_run else None,
            "last_execution": None
        }
