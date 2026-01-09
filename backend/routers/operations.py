"""
Operations router - Report queue and scheduler management

For platform operations, not platform admin.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import logging

from database import get_db
from models import User
from services import auth_service
from services.operations_service import OperationsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations", tags=["operations"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== Request/Response Schemas ====================

class ReportQueueItem(BaseModel):
    """Report item in the queue."""
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
    """Response for report queue."""
    reports: List[ReportQueueItem]
    total: int
    streams: List[dict]


class RejectReportRequest(BaseModel):
    """Request to reject a report."""
    reason: str = Field(..., min_length=1, description="Reason for rejection")


class ReportDetailResponse(BaseModel):
    """Full report details for review."""
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


class ApproveRejectResponse(BaseModel):
    """Response for approve/reject operations."""
    status: str
    report_id: int
    reason: Optional[str] = None


class PipelineExecutionInfo(BaseModel):
    """Pipeline execution info for scheduler display."""
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

    class Config:
        from_attributes = True


class ScheduleConfigInfo(BaseModel):
    """Schedule configuration."""
    enabled: bool
    frequency: str
    anchor_day: Optional[str] = None
    preferred_time: str
    timezone: str
    lookback_days: Optional[int] = None


class ScheduledStreamInfo(BaseModel):
    """Scheduled stream info."""
    stream_id: int
    stream_name: str
    schedule_config: ScheduleConfigInfo
    next_scheduled_run: Optional[str] = None
    last_execution: Optional[PipelineExecutionInfo] = None

    class Config:
        from_attributes = True


class UpdateScheduleRequest(BaseModel):
    """Request to update schedule configuration."""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    anchor_day: Optional[str] = None
    preferred_time: Optional[str] = None
    timezone: Optional[str] = None
    lookback_days: Optional[int] = None


# ==================== Report Queue Endpoints ====================

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
    """Get all reports awaiting approval or with other statuses."""
    logger.info(f"get_report_queue - user_id={current_user.user_id}, status={status_filter}, stream_id={stream_id}")

    try:
        service = OperationsService(db)
        result = service.get_report_queue(
            user_id=current_user.user_id,
            status_filter=status_filter,
            stream_id=stream_id,
            limit=limit,
            offset=offset
        )

        logger.info(f"get_report_queue complete - user_id={current_user.user_id}, count={len(result['reports'])}")
        return result

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
    logger.info(f"get_report_detail - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = OperationsService(db)
        result = service.get_report_detail(report_id, current_user.user_id)

        logger.info(f"get_report_detail complete - user_id={current_user.user_id}, report_id={report_id}")
        return result

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
    response_model=ApproveRejectResponse,
    summary="Approve a report"
)
async def approve_report(
    report_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve a report for distribution."""
    logger.info(f"approve_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = OperationsService(db)
        result = service.approve_report(report_id, current_user.user_id)

        logger.info(f"approve_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return result

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
    response_model=ApproveRejectResponse,
    summary="Reject a report"
)
async def reject_report(
    report_id: int,
    request: RejectReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reject a report with a reason."""
    logger.info(f"reject_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        service = OperationsService(db)
        result = service.reject_report(report_id, current_user.user_id, request.reason)

        logger.info(f"reject_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reject_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject report: {str(e)}"
        )


# ==================== Scheduler Endpoints ====================

@router.get(
    "/streams/scheduled",
    response_model=List[ScheduledStreamInfo],
    summary="Get all scheduled streams"
)
async def get_scheduled_streams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all streams with scheduling configuration and their last execution status."""
    logger.info(f"get_scheduled_streams - user_id={current_user.user_id}")

    try:
        service = OperationsService(db)
        result = service.get_scheduled_streams(current_user.user_id)

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
    logger.info(f"update_stream_schedule - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        service = OperationsService(db)
        result = service.update_stream_schedule(
            stream_id=stream_id,
            user_id=current_user.user_id,
            updates=request.model_dump(exclude_none=True)
        )

        logger.info(f"update_stream_schedule complete - user_id={current_user.user_id}, stream_id={stream_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_stream_schedule failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schedule: {str(e)}"
        )
