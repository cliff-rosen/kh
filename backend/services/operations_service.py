"""
Operations Service - Pipeline execution queue and scheduler management

This service handles:
- Pipeline execution queue (pending, running, completed, failed)
- Report approval workflow (for completed executions)
- Scheduler management (list scheduled streams, update schedules)
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime
from fastapi import HTTPException, status

from models import (
    Report, ResearchStream, PipelineExecution, User,
    ReportArticleAssociation, Article, WipArticle as WipArticleModel,
    ApprovalStatus, ExecutionStatus
)
from schemas.research_stream import (
    ExecutionQueueItem,
    ExecutionQueueResult,
    ExecutionMetrics,
    ExecutionDetail,
    ApprovalResult,
    ScheduledStreamSummary,
    LastExecution,
    StreamOption,
    CategoryCount,
    WipArticle,
    ScheduleConfig,
    ExecutionStatus as ExecutionStatusEnum,
    RunType as RunTypeEnum,
)
from schemas.report import ReportArticle

logger = logging.getLogger(__name__)


class OperationsService:
    """
    Service for operations management - execution queue and scheduler.

    All database operations for the operations router go through this service.
    """

    def __init__(self, db: Session):
        self.db = db

    # ==================== Execution Queue ====================

    def get_execution_queue(
        self,
        user_id: int,
        execution_status: Optional[str] = None,
        approval_status: Optional[str] = None,
        stream_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> ExecutionQueueResult:
        """Get pipeline executions queue with optional filters."""
        logger.info(
            f"get_execution_queue - user_id={user_id}, "
            f"execution_status={execution_status}, approval_status={approval_status}, stream_id={stream_id}"
        )

        # Build base query on PipelineExecution
        query = self.db.query(PipelineExecution).join(
            ResearchStream, PipelineExecution.stream_id == ResearchStream.stream_id
        )

        # Filter by execution status
        if execution_status:
            try:
                status_enum = ExecutionStatus(execution_status)
                query = query.filter(PipelineExecution.status == status_enum)
            except ValueError:
                pass  # Ignore invalid status

        # Filter by stream
        if stream_id:
            query = query.filter(PipelineExecution.stream_id == stream_id)

        # Filter by approval status (requires joining to Report)
        if approval_status:
            try:
                approval_enum = ApprovalStatus(approval_status)
                query = query.join(Report, PipelineExecution.report_id == Report.report_id)
                query = query.filter(Report.approval_status == approval_enum)
            except ValueError:
                pass  # Ignore invalid status

        # Get total count
        total = query.count()

        # Get executions with pagination, most recent first
        executions_db = query.order_by(desc(PipelineExecution.created_at)).offset(offset).limit(limit).all()

        # Build response
        executions: List[ExecutionQueueItem] = []
        for execution in executions_db:
            stream = self.db.query(ResearchStream).filter(
                ResearchStream.stream_id == execution.stream_id
            ).first()

            # Get report info if exists
            report_id = None
            report_name = None
            report_approval_status = None
            article_count = None
            approved_by_email = None
            approved_at = None
            rejection_reason = None

            if execution.report_id:
                report = self.db.query(Report).filter(
                    Report.report_id == execution.report_id
                ).first()
                if report:
                    report_id = report.report_id
                    report_name = report.report_name
                    report_approval_status = report.approval_status.value if report.approval_status else None
                    rejection_reason = report.rejection_reason
                    approved_at = report.approved_at

                    # Get article count
                    if report.pipeline_metrics:
                        article_count = (
                            report.pipeline_metrics.get('articles_after_filter', 0) or
                            report.pipeline_metrics.get('article_count', 0)
                        )
                    if not article_count:
                        article_count = len(report.article_associations) if report.article_associations else 0

                    # Get approver email
                    if report.approved_by:
                        approver = self.db.query(User).filter(User.user_id == report.approved_by).first()
                        approved_by_email = approver.email if approver else None

            executions.append(ExecutionQueueItem(
                execution_id=execution.id,
                stream_id=execution.stream_id,
                stream_name=stream.stream_name if stream else "Unknown",
                execution_status=execution.status if execution.status else ExecutionStatusEnum.PENDING,
                run_type=execution.run_type if execution.run_type else RunTypeEnum.MANUAL,
                started_at=execution.started_at,
                completed_at=execution.completed_at,
                error=execution.error,
                created_at=execution.created_at,
                report_id=report_id,
                report_name=report_name,
                approval_status=report_approval_status,
                article_count=article_count,
                approved_by=approved_by_email,
                approved_at=approved_at,
                rejection_reason=rejection_reason,
            ))

        # Get streams for filter dropdown
        streams_query = self.db.query(ResearchStream.stream_id, ResearchStream.stream_name).distinct().all()
        streams_list = [StreamOption(stream_id=s.stream_id, stream_name=s.stream_name) for s in streams_query]

        logger.info(f"get_execution_queue complete - user_id={user_id}, count={len(executions)}, total={total}")
        return ExecutionQueueResult(executions=executions, total=total, streams=streams_list)

    def get_execution_detail(self, execution_id: str, user_id: int) -> ExecutionDetail:
        """Get full execution details for review."""
        logger.info(f"get_execution_detail - user_id={user_id}, execution_id={execution_id}")

        execution = self.db.query(PipelineExecution).filter(
            PipelineExecution.id == execution_id
        ).first()

        if not execution:
            logger.warning(f"Execution not found - execution_id={execution_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Execution not found"
            )

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == execution.stream_id
        ).first()

        # Get WIP articles for this execution
        wip_articles_db = self.db.query(WipArticleModel).filter(
            WipArticleModel.pipeline_execution_id == execution.id
        ).all()

        wip_articles_list: List[WipArticle] = []
        for wip in wip_articles_db:
            wip_articles_list.append(WipArticle(
                id=wip.id,
                title=wip.title,
                authors=wip.authors or [],
                journal=wip.journal,
                year=wip.year,
                pmid=wip.pmid,
                abstract=wip.abstract,
                is_duplicate=wip.is_duplicate or False,
                duplicate_of_id=wip.duplicate_of_id,
                passed_semantic_filter=wip.passed_semantic_filter,
                filter_rejection_reason=wip.filter_rejection_reason,
                included_in_report=wip.included_in_report or False,
                presentation_categories=wip.presentation_categories or [],
            ))

        # Initialize report-related fields
        report_id = None
        report_name = None
        report_approval_status = None
        article_count = 0
        executive_summary = None
        categories_list: List[CategoryCount] = []
        articles_list: List[ReportArticle] = []
        approved_by_email = None
        approved_at = None
        rejection_reason = None
        metrics = None

        # Get report info if execution completed
        if execution.report_id:
            report = self.db.query(Report).filter(
                Report.report_id == execution.report_id
            ).first()

            if report:
                report_id = report.report_id
                report_name = report.report_name
                report_approval_status = report.approval_status.value if report.approval_status else None
                rejection_reason = report.rejection_reason
                approved_at = report.approved_at

                # Get approver email
                if report.approved_by:
                    approver = self.db.query(User).filter(User.user_id == report.approved_by).first()
                    approved_by_email = approver.email if approver else None

                # Get executive summary
                if report.enrichments:
                    executive_summary = report.enrichments.get("executive_summary")

                # Get metrics from report
                if report.pipeline_metrics:
                    metrics = ExecutionMetrics(
                        articles_retrieved=report.pipeline_metrics.get("articles_retrieved"),
                        articles_after_dedup=report.pipeline_metrics.get("articles_after_dedup"),
                        articles_after_filter=report.pipeline_metrics.get("articles_after_filter"),
                        filter_config=report.pipeline_metrics.get("filter_config"),
                    )

                # Get report articles
                report_articles = self.db.query(ReportArticleAssociation).filter(
                    ReportArticleAssociation.report_id == report.report_id
                ).all()

                categories_dict: dict[str, CategoryCount] = {}

                for ra in report_articles:
                    article = self.db.query(Article).filter(Article.article_id == ra.article_id).first()
                    if article:
                        presentation_categories = getattr(ra, 'presentation_categories', None) or []

                        articles_list.append(ReportArticle(
                            article_id=article.article_id,
                            title=article.title,
                            authors=article.authors or [],
                            journal=article.journal,
                            year=article.year,
                            pmid=article.pmid,
                            abstract=article.abstract,
                            relevance_score=ra.relevance_score,
                            presentation_categories=presentation_categories,
                        ))

                        # Track categories
                        for cat_id in presentation_categories:
                            if cat_id not in categories_dict:
                                categories_dict[cat_id] = CategoryCount(
                                    id=cat_id,
                                    name=cat_id.replace("_", " ").title(),
                                    article_count=0
                                )
                            categories_dict[cat_id].article_count += 1

                categories_list = list(categories_dict.values())
                article_count = len(articles_list)

        logger.info(f"get_execution_detail complete - user_id={user_id}, execution_id={execution_id}")
        return ExecutionDetail(
            execution_id=execution.id,
            stream_id=execution.stream_id,
            stream_name=stream.stream_name if stream else "Unknown",
            execution_status=execution.status if execution.status else ExecutionStatusEnum.PENDING,
            run_type=execution.run_type if execution.run_type else RunTypeEnum.MANUAL,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            error=execution.error,
            created_at=execution.created_at,
            metrics=metrics,
            wip_articles=wip_articles_list,
            report_id=report_id,
            report_name=report_name,
            approval_status=report_approval_status,
            article_count=article_count,
            executive_summary=executive_summary,
            categories=categories_list,
            articles=articles_list,
            approved_by=approved_by_email,
            approved_at=approved_at,
            rejection_reason=rejection_reason,
        )

    def approve_report(self, report_id: int, user_id: int) -> ApprovalResult:
        """Approve a report for distribution."""
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
        return ApprovalResult(status="approved", report_id=report_id)

    def reject_report(self, report_id: int, user_id: int, reason: str) -> ApprovalResult:
        """Reject a report with a reason."""
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
        return ApprovalResult(status="rejected", report_id=report_id, reason=reason)

    # ==================== Scheduler Management ====================

    def get_scheduled_streams(self, user_id: int) -> List[ScheduledStreamSummary]:
        """Get all streams with scheduling configuration and their last execution status."""
        logger.info(f"get_scheduled_streams - user_id={user_id}")

        # Get all streams that have schedule_config (not null)
        streams = self.db.query(ResearchStream).filter(
            ResearchStream.schedule_config.isnot(None)
        ).all()

        result: List[ScheduledStreamSummary] = []
        for stream in streams:
            # Parse schedule_config
            schedule_config_data = stream.schedule_config or {}
            config = ScheduleConfig(
                enabled=schedule_config_data.get('enabled', False),
                frequency=schedule_config_data.get('frequency', 'weekly'),
                anchor_day=schedule_config_data.get('anchor_day'),
                preferred_time=schedule_config_data.get('preferred_time', '08:00'),
                timezone=schedule_config_data.get('timezone', 'UTC'),
                lookback_days=schedule_config_data.get('lookback_days')
            )

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
                            if report.pipeline_metrics:
                                article_count = (
                                    report.pipeline_metrics.get('articles_after_filter', 0) or
                                    report.pipeline_metrics.get('article_count', 0)
                                )
                            if not article_count:
                                article_count = len(report.article_associations) if report.article_associations else 0

                    last_exec = LastExecution(
                        id=exec_db.id,
                        stream_id=exec_db.stream_id,
                        status=exec_db.status if exec_db.status else ExecutionStatusEnum.PENDING,
                        run_type=exec_db.run_type if exec_db.run_type else RunTypeEnum.MANUAL,
                        started_at=exec_db.started_at,
                        completed_at=exec_db.completed_at,
                        error=exec_db.error,
                        report_id=exec_db.report_id,
                        report_approval_status=report_approval_status,
                        article_count=article_count
                    )

            result.append(ScheduledStreamSummary(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                schedule_config=config,
                next_scheduled_run=stream.next_scheduled_run,
                last_execution=last_exec
            ))

        logger.info(f"get_scheduled_streams complete - user_id={user_id}, count={len(result)}")
        return result

    def update_stream_schedule(
        self,
        stream_id: int,
        user_id: int,
        updates: dict
    ) -> ScheduledStreamSummary:
        """Update scheduling configuration for a stream."""
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

        if 'enabled' in updates:
            current_config['enabled'] = updates['enabled']
        if 'frequency' in updates:
            current_config['frequency'] = updates['frequency']
        if 'anchor_day' in updates:
            current_config['anchor_day'] = updates['anchor_day']
        if 'preferred_time' in updates:
            current_config['preferred_time'] = updates['preferred_time']
        if 'timezone' in updates:
            current_config['timezone'] = updates['timezone']
        if 'lookback_days' in updates:
            current_config['lookback_days'] = updates['lookback_days']

        stream.schedule_config = current_config
        self.db.commit()
        self.db.refresh(stream)

        # Build response
        config = ScheduleConfig(
            enabled=current_config.get('enabled', False),
            frequency=current_config.get('frequency', 'weekly'),
            anchor_day=current_config.get('anchor_day'),
            preferred_time=current_config.get('preferred_time', '08:00'),
            timezone=current_config.get('timezone', 'UTC'),
            lookback_days=current_config.get('lookback_days')
        )

        logger.info(f"update_stream_schedule complete - user_id={user_id}, stream_id={stream_id}")
        return ScheduledStreamSummary(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            schedule_config=config,
            next_scheduled_run=stream.next_scheduled_run,
            last_execution=None
        )
