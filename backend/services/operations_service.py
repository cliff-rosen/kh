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
    ExecutionDetail,
    ScheduledStreamSummary,
    LastExecution,
    StreamOption,
    CategoryCount,
    WipArticle,
    ScheduleConfig,
    ExecutionStatus as ExecutionStatusEnum,
    RunType as RunTypeEnum,
)
from typing import Tuple, Dict, Any
from schemas.report import ReportArticle

logger = logging.getLogger(__name__)


class OperationsService:
    """
    Service for operations management - execution queue and scheduler.

    All database operations for the operations router go through this service.
    """

    def __init__(self, db: Session):
        self.db = db
        self._association_service = None

    @property
    def association_service(self):
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

    # ==================== Execution Queue ====================

    def get_execution_queue(
        self,
        user_id: int,
        execution_status: Optional[str] = None,
        approval_status: Optional[str] = None,
        stream_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[ExecutionQueueItem], int, List[StreamOption]]:
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
            filtered_out_count = None
            has_curation_edits = None
            last_curated_by_email = None

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
                    has_curation_edits = report.has_curation_edits or False

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

                    # Get last curator email
                    if report.last_curated_by:
                        curator = self.db.query(User).filter(User.user_id == report.last_curated_by).first()
                        last_curated_by_email = curator.email if curator else None

            # Get filtered out count from WipArticles
            if execution.id:
                filtered_out_count = self.db.query(WipArticleModel).filter(
                    WipArticleModel.pipeline_execution_id == execution.id,
                    WipArticleModel.passed_semantic_filter == False
                ).count()

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
                filtered_out_count=filtered_out_count,
                has_curation_edits=has_curation_edits,
                last_curated_by=last_curated_by_email,
            ))

        # Get streams for filter dropdown
        streams_query = self.db.query(ResearchStream.stream_id, ResearchStream.stream_name).distinct().all()
        streams_list = [StreamOption(stream_id=s.stream_id, stream_name=s.stream_name) for s in streams_query]

        logger.info(f"get_execution_queue complete - user_id={user_id}, count={len(executions)}, total={total}")
        return (executions, total, streams_list)

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
                filter_score=wip.filter_score,
                filter_score_reason=wip.filter_score_reason,
                included_in_report=wip.included_in_report or False,
                presentation_categories=wip.presentation_categories or [],
                curator_included=wip.curator_included or False,
                curator_excluded=wip.curator_excluded or False,
                curation_notes=wip.curation_notes,
            ))

        # Initialize report-related fields
        report_id = None
        report_name = None
        report_approval_status = None
        article_count = 0
        executive_summary = None
        category_summaries = None
        categories_list: List[CategoryCount] = []
        articles_list: List[ReportArticle] = []
        approved_by_email = None
        approved_at = None
        rejection_reason = None

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

                # Get executive summary and category summaries
                if report.enrichments:
                    executive_summary = report.enrichments.get("executive_summary")
                    category_summaries = report.enrichments.get("category_summaries")

                # Get visible report articles (excludes curator_excluded)
                visible_associations = self.association_service.get_visible_for_report(report.report_id)

                categories_dict: dict[str, CategoryCount] = {}

                for ra in visible_associations:
                    article = ra.article
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
            wip_articles=wip_articles_list,
            # Retrieval configuration
            start_date=execution.start_date,
            end_date=execution.end_date,
            retrieval_config=execution.retrieval_config,
            # Report info
            report_id=report_id,
            report_name=report_name,
            approval_status=report_approval_status,
            article_count=article_count,
            executive_summary=executive_summary,
            category_summaries=category_summaries,
            categories=categories_list,
            articles=articles_list,
            approved_by=approved_by_email,
            approved_at=approved_at,
            rejection_reason=rejection_reason,
        )

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

            # Get last execution - query for most recent execution for this stream
            last_exec = None
            exec_db = self.db.query(PipelineExecution).filter(
                PipelineExecution.stream_id == stream.stream_id
            ).order_by(
                PipelineExecution.started_at.is_(None),  # NULLs last
                PipelineExecution.started_at.desc()
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
