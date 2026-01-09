"""
Operations router - Report queue and scheduler management
For platform operations, not platform admin
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import logging

from database import get_db
from models import User
from auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations", tags=["operations"])


# ==================== Report Queue Management ====================

class ReportQueueItem(BaseModel):
    """Report item in the queue"""
    report_id: int
    report_name: str
    stream_id: int
    stream_name: str
    article_count: int
    run_type: str
    approval_status: str
    created_at: datetime
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    pipeline_execution_id: Optional[str] = None

    class Config:
        from_attributes = True


class ReportQueueResponse(BaseModel):
    """Response for report queue"""
    reports: List[ReportQueueItem]
    total: int
    streams: List[dict]  # For filter dropdown


class RejectReportRequest(BaseModel):
    """Request to reject a report"""
    reason: str = Field(..., min_length=1, description="Reason for rejection")


class ReportDetailResponse(BaseModel):
    """Full report details for review"""
    report_id: int
    report_name: str
    stream_id: int
    stream_name: str
    run_type: str
    approval_status: str
    created_at: datetime
    article_count: int
    pipeline_execution_id: Optional[str] = None
    executive_summary: Optional[str] = None
    categories: List[dict] = []
    articles: List[dict] = []
    execution: Optional[dict] = None
    wip_articles: List[dict] = []
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


@router.get(
    "/reports/queue",
    response_model=ReportQueueResponse,
    summary="Get report queue for approval"
)
async def get_report_queue(
    status_filter: Optional[str] = None,
    stream_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all reports awaiting approval or with other statuses.
    """
    from models import Report, ResearchStream, ApprovalStatus

    logger.info(f"get_report_queue - user_id={current_user.user_id}, status={status_filter}, stream_id={stream_id}")

    try:
        # Build query
        query = db.query(Report).join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)

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
            stream = db.query(ResearchStream).filter(ResearchStream.stream_id == report.research_stream_id).first()
            approved_by_email = None
            if report.approved_by:
                approver = db.query(User).filter(User.user_id == report.approved_by).first()
                approved_by_email = approver.email if approver else None

            reports.append(ReportQueueItem(
                report_id=report.report_id,
                report_name=report.report_name,
                stream_id=report.research_stream_id,
                stream_name=stream.stream_name if stream else "Unknown",
                article_count=report.article_count or 0,
                run_type=report.run_type or "manual",
                approval_status=report.approval_status.value if report.approval_status else "awaiting_approval",
                created_at=report.created_at,
                approved_by=approved_by_email,
                approved_at=report.approved_at,
                rejection_reason=report.rejection_reason,
                pipeline_execution_id=report.pipeline_execution_id
            ))

        # Get streams for filter dropdown
        streams = db.query(ResearchStream.stream_id, ResearchStream.stream_name).distinct().all()
        streams_list = [{"stream_id": s.stream_id, "stream_name": s.stream_name} for s in streams]

        logger.info(f"get_report_queue complete - user_id={current_user.user_id}, count={len(reports)}, total={total}")
        return ReportQueueResponse(reports=reports, total=total, streams=streams_list)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_queue failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get report queue: {str(e)}"
        )


@router.get(
    "/reports/{report_id}",
    response_model=ReportDetailResponse,
    summary="Get report details for review"
)
async def get_report_detail(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get full report details for review."""
    from models import Report, ResearchStream, PipelineExecution, ReportArticle, WipArticle, Article

    logger.info(f"get_report_detail - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report = db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        stream = db.query(ResearchStream).filter(ResearchStream.stream_id == report.research_stream_id).first()

        # Get approval info
        approved_by_email = None
        if report.approved_by:
            approver = db.query(User).filter(User.user_id == report.approved_by).first()
            approved_by_email = approver.email if approver else None

        # Get execution details
        execution_info = None
        if report.pipeline_execution_id:
            execution = db.query(PipelineExecution).filter(
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
        report_articles = db.query(ReportArticle).filter(ReportArticle.report_id == report_id).all()
        articles_list = []
        categories_dict = {}

        for ra in report_articles:
            article = db.query(Article).filter(Article.article_id == ra.article_id).first()
            if article:
                article_data = {
                    "article_id": article.article_id,
                    "title": article.title,
                    "authors": article.authors or [],
                    "journal": article.journal,
                    "year": article.publication_year,
                    "pmid": article.pmid,
                    "abstract": article.abstract,
                    "category_id": ra.presentation_categories[0] if ra.presentation_categories else None,
                    "relevance_score": ra.relevance_score or 0.0,
                    "filter_passed": True,
                }
                articles_list.append(article_data)

                # Track categories
                for cat_id in (ra.presentation_categories or []):
                    if cat_id not in categories_dict:
                        categories_dict[cat_id] = {"id": cat_id, "name": cat_id.replace("_", " ").title(), "article_count": 0}
                    categories_dict[cat_id]["article_count"] += 1

        categories_list = list(categories_dict.values())

        # Get WIP articles if execution exists
        wip_articles_list = []
        if report.pipeline_execution_id:
            wip_articles = db.query(WipArticle).filter(
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

        logger.info(f"get_report_detail complete - user_id={current_user.user_id}, report_id={report_id}")
        return ReportDetailResponse(
            report_id=report.report_id,
            report_name=report.report_name,
            stream_id=report.research_stream_id,
            stream_name=stream.stream_name if stream else "Unknown",
            run_type=report.run_type or "manual",
            approval_status=report.approval_status.value if report.approval_status else "awaiting_approval",
            created_at=report.created_at,
            article_count=report.article_count or len(articles_list),
            pipeline_execution_id=report.pipeline_execution_id,
            executive_summary=executive_summary,
            categories=categories_list,
            articles=articles_list,
            execution=execution_info,
            wip_articles=wip_articles_list,
            approved_by=approved_by_email,
            approved_at=report.approved_at,
            rejection_reason=report.rejection_reason,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_detail failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get report detail: {str(e)}"
        )


@router.post(
    "/reports/{report_id}/approve",
    summary="Approve a report"
)
async def approve_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve a report for distribution."""
    from models import Report, ApprovalStatus

    logger.info(f"approve_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report = db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        report.approval_status = ApprovalStatus.APPROVED
        report.approved_by = current_user.user_id
        report.approved_at = datetime.utcnow()
        report.rejection_reason = None

        db.commit()

        logger.info(f"approve_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return {"status": "approved", "report_id": report_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"approve_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve report: {str(e)}"
        )


@router.post(
    "/reports/{report_id}/reject",
    summary="Reject a report"
)
async def reject_report(
    report_id: int,
    request: RejectReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reject a report with a reason."""
    from models import Report, ApprovalStatus

    logger.info(f"reject_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        report = db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        report.approval_status = ApprovalStatus.REJECTED
        report.approved_by = current_user.user_id
        report.approved_at = datetime.utcnow()
        report.rejection_reason = request.reason

        db.commit()

        logger.info(f"reject_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return {"status": "rejected", "report_id": report_id, "reason": request.reason}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reject_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject report: {str(e)}"
        )


# ==================== Scheduler Management ====================

class PipelineExecutionInfo(BaseModel):
    """Pipeline execution info for scheduler display"""
    id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    report_id: Optional[int] = None
    report_approval_status: Optional[str] = None
    article_count: Optional[int] = None

    class Config:
        from_attributes = True


class ScheduleConfigInfo(BaseModel):
    """Schedule configuration"""
    enabled: bool
    frequency: str
    anchor_day: Optional[str] = None
    preferred_time: str
    timezone: str
    lookback_days: Optional[int] = None


class ScheduledStreamInfo(BaseModel):
    """Scheduled stream info"""
    stream_id: int
    stream_name: str
    schedule_config: ScheduleConfigInfo
    next_scheduled_run: Optional[datetime] = None
    last_execution: Optional[PipelineExecutionInfo] = None

    class Config:
        from_attributes = True


class UpdateScheduleRequest(BaseModel):
    """Request to update schedule configuration"""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    anchor_day: Optional[str] = None
    preferred_time: Optional[str] = None
    timezone: Optional[str] = None
    lookback_days: Optional[int] = None


@router.get(
    "/streams/scheduled",
    response_model=List[ScheduledStreamInfo],
    summary="Get all scheduled streams"
)
async def get_scheduled_streams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all streams with scheduling configuration and their last execution status.
    """
    from models import ResearchStream, PipelineExecution, Report

    logger.info(f"get_scheduled_streams - user_id={current_user.user_id}")

    try:
        # Get all streams that have schedule_config (not null)
        streams = db.query(ResearchStream).filter(
            ResearchStream.schedule_config.isnot(None)
        ).all()

        result = []
        for stream in streams:
            # Parse schedule_config
            schedule_config = stream.schedule_config or {}
            config_info = ScheduleConfigInfo(
                enabled=schedule_config.get('enabled', False),
                frequency=schedule_config.get('frequency', 'weekly'),
                anchor_day=schedule_config.get('anchor_day'),
                preferred_time=schedule_config.get('preferred_time', '08:00'),
                timezone=schedule_config.get('timezone', 'UTC'),
                lookback_days=schedule_config.get('lookback_days')
            )

            # Get last execution
            last_exec = None
            if stream.last_execution_id:
                exec_db = db.query(PipelineExecution).filter(
                    PipelineExecution.id == stream.last_execution_id
                ).first()
                if exec_db:
                    # Get report info if completed
                    report_approval_status = None
                    article_count = None
                    if exec_db.report_id:
                        report = db.query(Report).filter(Report.report_id == exec_db.report_id).first()
                        if report:
                            report_approval_status = report.approval_status.value if report.approval_status else None
                            article_count = report.article_count

                    last_exec = PipelineExecutionInfo(
                        id=exec_db.id,
                        stream_id=exec_db.stream_id,
                        status=exec_db.status.value if exec_db.status else 'pending',
                        run_type=exec_db.run_type.value if exec_db.run_type else 'manual',
                        started_at=exec_db.started_at,
                        completed_at=exec_db.completed_at,
                        error=exec_db.error,
                        report_id=exec_db.report_id,
                        report_approval_status=report_approval_status,
                        article_count=article_count
                    )

            result.append(ScheduledStreamInfo(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                schedule_config=config_info,
                next_scheduled_run=stream.next_scheduled_run,
                last_execution=last_exec
            ))

        logger.info(f"get_scheduled_streams complete - user_id={current_user.user_id}, count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_scheduled_streams failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get scheduled streams: {str(e)}"
        )


@router.patch(
    "/streams/{stream_id}/schedule",
    response_model=ScheduledStreamInfo,
    summary="Update stream schedule"
)
async def update_stream_schedule(
    stream_id: int,
    request: UpdateScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update scheduling configuration for a stream."""
    from models import ResearchStream

    logger.info(f"update_stream_schedule - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        stream = db.query(ResearchStream).filter(ResearchStream.stream_id == stream_id).first()
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        # Update schedule_config
        current_config = stream.schedule_config or {}
        if request.enabled is not None:
            current_config['enabled'] = request.enabled
        if request.frequency is not None:
            current_config['frequency'] = request.frequency
        if request.anchor_day is not None:
            current_config['anchor_day'] = request.anchor_day
        if request.preferred_time is not None:
            current_config['preferred_time'] = request.preferred_time
        if request.timezone is not None:
            current_config['timezone'] = request.timezone
        if request.lookback_days is not None:
            current_config['lookback_days'] = request.lookback_days

        stream.schedule_config = current_config
        db.commit()
        db.refresh(stream)

        # Build response
        config_info = ScheduleConfigInfo(
            enabled=current_config.get('enabled', False),
            frequency=current_config.get('frequency', 'weekly'),
            anchor_day=current_config.get('anchor_day'),
            preferred_time=current_config.get('preferred_time', '08:00'),
            timezone=current_config.get('timezone', 'UTC'),
            lookback_days=current_config.get('lookback_days')
        )

        logger.info(f"update_stream_schedule complete - user_id={current_user.user_id}, stream_id={stream_id}")
        return ScheduledStreamInfo(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            schedule_config=config_info,
            next_scheduled_run=stream.next_scheduled_run,
            last_execution=None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_stream_schedule failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schedule: {str(e)}"
        )
