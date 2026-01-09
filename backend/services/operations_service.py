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
from dataclasses import dataclass, field
from fastapi import HTTPException, status

from models import (
    Report, ResearchStream, PipelineExecution, User,
    ReportArticleAssociation, Article, WipArticle,
    ApprovalStatus, ExecutionStatus
)

logger = logging.getLogger(__name__)


# ==================== Response Types ====================

@dataclass
class StreamOption:
    """Stream info for filter dropdown."""
    stream_id: int
    stream_name: str


@dataclass
class ExecutionQueueItem:
    """Pipeline execution item in the queue."""
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: str  # pending, running, completed, failed
    run_type: str  # scheduled, manual, test
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    created_at: datetime
    # Report info (only for completed executions)
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None  # awaiting_approval, approved, rejected
    article_count: Optional[int] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


@dataclass
class ExecutionQueueResult:
    """Result from get_execution_queue."""
    executions: List[ExecutionQueueItem]
    total: int
    streams: List[StreamOption]


@dataclass
class ReportArticleInfo:
    """Article info within a report."""
    article_id: int
    title: str
    authors: List[str]
    journal: Optional[str]
    year: Optional[str]
    pmid: Optional[str]
    abstract: Optional[str]
    category_id: Optional[str]
    relevance_score: float
    filter_passed: bool


@dataclass
class ReportCategory:
    """Category info within a report."""
    id: str
    name: str
    article_count: int


@dataclass
class ExecutionMetrics:
    """Pipeline execution metrics."""
    articles_retrieved: Optional[int] = None
    articles_after_dedup: Optional[int] = None
    articles_after_filter: Optional[int] = None
    filter_config: Optional[str] = None


@dataclass
class WipArticleInfo:
    """WIP article info for pipeline audit."""
    id: int
    title: str
    authors: List[str]
    journal: Optional[str]
    year: Optional[str]
    pmid: Optional[str]
    abstract: Optional[str]
    is_duplicate: bool
    duplicate_of_id: Optional[int]
    passed_semantic_filter: Optional[bool]
    filter_rejection_reason: Optional[str]
    included_in_report: bool
    presentation_categories: List[str]


@dataclass
class ExecutionDetailResult:
    """Full execution details for review."""
    # Execution info
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: str
    run_type: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]
    created_at: datetime
    metrics: Optional[ExecutionMetrics] = None
    wip_articles: List[WipArticleInfo] = field(default_factory=list)
    # Report info (only for completed executions)
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: int = 0
    executive_summary: Optional[str] = None
    categories: List[ReportCategory] = field(default_factory=list)
    articles: List[ReportArticleInfo] = field(default_factory=list)
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None


@dataclass
class ApproveRejectResult:
    """Result from approve/reject operations."""
    status: str
    report_id: int
    reason: Optional[str] = None


@dataclass
class ScheduleConfig:
    """Schedule configuration."""
    enabled: bool
    frequency: str
    anchor_day: Optional[str]
    preferred_time: str
    timezone: str
    lookback_days: Optional[int] = None


@dataclass
class LastExecutionInfo:
    """Last execution info for scheduler display."""
    id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    report_id: Optional[int] = None
    report_approval_status: Optional[str] = None
    article_count: Optional[int] = None


@dataclass
class ScheduledStreamInfo:
    """Scheduled stream info."""
    stream_id: int
    stream_name: str
    schedule_config: ScheduleConfig
    next_scheduled_run: Optional[str] = None
    last_execution: Optional[LastExecutionInfo] = None


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
        """
        Get pipeline executions queue with optional filters.

        Args:
            user_id: The requesting user's ID
            execution_status: Filter by execution status (pending, running, completed, failed)
            approval_status: Filter by report approval status (awaiting_approval, approved, rejected)
            stream_id: Filter by stream ID
            limit: Maximum number of executions to return
            offset: Pagination offset

        Returns:
            ExecutionQueueResult with executions list, total count, and streams for filter
        """
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
                execution_status=execution.status.value if execution.status else "pending",
                run_type=execution.run_type.value if execution.run_type else "manual",
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

    def get_execution_detail(self, execution_id: str, user_id: int) -> ExecutionDetailResult:
        """
        Get full execution details for review.

        Args:
            execution_id: The execution to retrieve
            user_id: The requesting user's ID

        Returns:
            ExecutionDetailResult with full details

        Raises:
            HTTPException: 404 if execution not found
        """
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
        wip_articles = self.db.query(WipArticle).filter(
            WipArticle.pipeline_execution_id == execution.id
        ).all()

        wip_articles_list: List[WipArticleInfo] = []
        for wip in wip_articles:
            wip_articles_list.append(WipArticleInfo(
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
        categories_list: List[ReportCategory] = []
        articles_list: List[ReportArticleInfo] = []
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

                categories_dict: dict[str, ReportCategory] = {}

                for ra in report_articles:
                    article = self.db.query(Article).filter(Article.article_id == ra.article_id).first()
                    if article:
                        presentation_categories = getattr(ra, 'presentation_categories', None) or []

                        articles_list.append(ReportArticleInfo(
                            article_id=article.article_id,
                            title=article.title,
                            authors=article.authors or [],
                            journal=article.journal,
                            year=article.year,
                            pmid=article.pmid,
                            abstract=article.abstract,
                            category_id=presentation_categories[0] if presentation_categories else None,
                            relevance_score=ra.relevance_score or 0.0,
                            filter_passed=True,
                        ))

                        # Track categories
                        for cat_id in presentation_categories:
                            if cat_id not in categories_dict:
                                categories_dict[cat_id] = ReportCategory(
                                    id=cat_id,
                                    name=cat_id.replace("_", " ").title(),
                                    article_count=0
                                )
                            categories_dict[cat_id].article_count += 1

                categories_list = list(categories_dict.values())
                article_count = len(articles_list)

        logger.info(f"get_execution_detail complete - user_id={user_id}, execution_id={execution_id}")
        return ExecutionDetailResult(
            execution_id=execution.id,
            stream_id=execution.stream_id,
            stream_name=stream.stream_name if stream else "Unknown",
            execution_status=execution.status.value if execution.status else "pending",
            run_type=execution.run_type.value if execution.run_type else "manual",
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

    def approve_report(self, report_id: int, user_id: int) -> ApproveRejectResult:
        """
        Approve a report for distribution.

        Args:
            report_id: The report to approve
            user_id: The approving user's ID

        Returns:
            ApproveRejectResult with status and report_id

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
        return ApproveRejectResult(status="approved", report_id=report_id)

    def reject_report(self, report_id: int, user_id: int, reason: str) -> ApproveRejectResult:
        """
        Reject a report with a reason.

        Args:
            report_id: The report to reject
            user_id: The rejecting user's ID
            reason: Reason for rejection

        Returns:
            ApproveRejectResult with status, report_id, and reason

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
        return ApproveRejectResult(status="rejected", report_id=report_id, reason=reason)

    # ==================== Scheduler Management ====================

    def get_scheduled_streams(self, user_id: int) -> List[ScheduledStreamInfo]:
        """
        Get all streams with scheduling configuration and their last execution status.

        Args:
            user_id: The requesting user's ID

        Returns:
            List of ScheduledStreamInfo
        """
        logger.info(f"get_scheduled_streams - user_id={user_id}")

        # Get all streams that have schedule_config (not null)
        streams = self.db.query(ResearchStream).filter(
            ResearchStream.schedule_config.isnot(None)
        ).all()

        result: List[ScheduledStreamInfo] = []
        for stream in streams:
            # Parse schedule_config
            schedule_config_data = stream.schedule_config or {}
            config_info = ScheduleConfig(
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

                    last_exec = LastExecutionInfo(
                        id=exec_db.id,
                        stream_id=exec_db.stream_id,
                        status=exec_db.status.value if exec_db.status else 'pending',
                        run_type=exec_db.run_type.value if exec_db.run_type else 'manual',
                        started_at=exec_db.started_at.isoformat() if exec_db.started_at else None,
                        completed_at=exec_db.completed_at.isoformat() if exec_db.completed_at else None,
                        error=exec_db.error,
                        report_id=exec_db.report_id,
                        report_approval_status=report_approval_status,
                        article_count=article_count
                    )

            result.append(ScheduledStreamInfo(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                schedule_config=config_info,
                next_scheduled_run=stream.next_scheduled_run.isoformat() if stream.next_scheduled_run else None,
                last_execution=last_exec
            ))

        logger.info(f"get_scheduled_streams complete - user_id={user_id}, count={len(result)}")
        return result

    def update_stream_schedule(
        self,
        stream_id: int,
        user_id: int,
        updates: dict
    ) -> ScheduledStreamInfo:
        """
        Update scheduling configuration for a stream.

        Args:
            stream_id: The stream to update
            user_id: The requesting user's ID
            updates: Dict with schedule config updates

        Returns:
            Updated ScheduledStreamInfo

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
        config_info = ScheduleConfig(
            enabled=current_config.get('enabled', False),
            frequency=current_config.get('frequency', 'weekly'),
            anchor_day=current_config.get('anchor_day'),
            preferred_time=current_config.get('preferred_time', '08:00'),
            timezone=current_config.get('timezone', 'UTC'),
            lookback_days=current_config.get('lookback_days')
        )

        logger.info(f"update_stream_schedule complete - user_id={user_id}, stream_id={stream_id}")
        return ScheduledStreamInfo(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            schedule_config=config_info,
            next_scheduled_run=stream.next_scheduled_run.isoformat() if stream.next_scheduled_run else None,
            last_execution=None
        )
