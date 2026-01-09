"""
Operations router - Pipeline execution queue and scheduler management

For platform operations, not platform admin.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import logging
from dataclasses import asdict

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


# ==================== Pydantic Response Models ====================

class StreamOptionResponse(BaseModel):
    """Stream info for filter dropdown."""
    stream_id: int
    stream_name: str

    class Config:
        from_attributes = True


class ExecutionQueueItemResponse(BaseModel):
    """Pipeline execution item in the queue."""
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: str
    run_type: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime
    # Report info (only for completed executions)
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: Optional[int] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


class ExecutionQueueResponse(BaseModel):
    """Response for execution queue."""
    executions: List[ExecutionQueueItemResponse]
    total: int
    streams: List[StreamOptionResponse]

    class Config:
        from_attributes = True


class ReportArticleResponse(BaseModel):
    """Article info within a report."""
    article_id: int
    title: str
    authors: List[str]
    journal: Optional[str] = None
    year: Optional[str] = None
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    category_id: Optional[str] = None
    relevance_score: float
    filter_passed: bool

    class Config:
        from_attributes = True


class ReportCategoryResponse(BaseModel):
    """Category info within a report."""
    id: str
    name: str
    article_count: int

    class Config:
        from_attributes = True


class ExecutionMetricsResponse(BaseModel):
    """Pipeline execution metrics."""
    articles_retrieved: Optional[int] = None
    articles_after_dedup: Optional[int] = None
    articles_after_filter: Optional[int] = None
    filter_config: Optional[str] = None

    class Config:
        from_attributes = True


class WipArticleResponse(BaseModel):
    """WIP article info for pipeline audit."""
    id: int
    title: str
    authors: List[str]
    journal: Optional[str] = None
    year: Optional[str] = None
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    is_duplicate: bool
    duplicate_of_id: Optional[int] = None
    passed_semantic_filter: Optional[bool] = None
    filter_rejection_reason: Optional[str] = None
    included_in_report: bool
    presentation_categories: List[str]

    class Config:
        from_attributes = True


class ExecutionDetailResponse(BaseModel):
    """Full execution details for review."""
    # Execution info
    execution_id: str
    stream_id: int
    stream_name: str
    execution_status: str
    run_type: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime
    metrics: Optional[ExecutionMetricsResponse] = None
    wip_articles: List[WipArticleResponse] = []
    # Report info (only for completed executions)
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    approval_status: Optional[str] = None
    article_count: int = 0
    executive_summary: Optional[str] = None
    categories: List[ReportCategoryResponse] = []
    articles: List[ReportArticleResponse] = []
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

    class Config:
        from_attributes = True


class ScheduleConfigResponse(BaseModel):
    """Schedule configuration."""
    enabled: bool
    frequency: str
    anchor_day: Optional[str] = None
    preferred_time: str
    timezone: str
    lookback_days: Optional[int] = None

    class Config:
        from_attributes = True


class LastExecutionResponse(BaseModel):
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

    class Config:
        from_attributes = True


class ScheduledStreamResponse(BaseModel):
    """Scheduled stream info."""
    stream_id: int
    stream_name: str
    schedule_config: ScheduleConfigResponse
    next_scheduled_run: Optional[str] = None
    last_execution: Optional[LastExecutionResponse] = None

    class Config:
        from_attributes = True


# ==================== Request Models ====================

class RejectReportRequest(BaseModel):
    """Request to reject a report."""
    reason: str = Field(..., min_length=1, description="Reason for rejection")


class UpdateScheduleRequest(BaseModel):
    """Request to update schedule configuration."""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    anchor_day: Optional[str] = None
    preferred_time: Optional[str] = None
    timezone: Optional[str] = None
    lookback_days: Optional[int] = None


# ==================== Execution Queue Endpoints ====================

@router.get(
    "/executions",
    response_model=ExecutionQueueResponse,
    summary="Get pipeline execution queue"
)
async def get_execution_queue(
    execution_status: Optional[str] = None,
    approval_status: Optional[str] = None,
    stream_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get pipeline executions with optional filters.

    - execution_status: pending, running, completed, failed
    - approval_status: awaiting_approval, approved, rejected (only for completed)
    """
    logger.info(
        f"get_execution_queue - user_id={current_user.user_id}, "
        f"execution_status={execution_status}, approval_status={approval_status}"
    )

    try:
        service = OperationsService(db)
        result = service.get_execution_queue(
            user_id=current_user.user_id,
            execution_status=execution_status,
            approval_status=approval_status,
            stream_id=stream_id,
            limit=limit,
            offset=offset
        )

        logger.info(f"get_execution_queue complete - user_id={current_user.user_id}, count={len(result.executions)}")
        return asdict(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_execution_queue failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get execution queue: {str(e)}"
        )


@router.get(
    "/executions/{execution_id}",
    response_model=ExecutionDetailResponse,
    summary="Get execution details"
)
async def get_execution_detail(
    execution_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get full execution details including report and WIP articles."""
    logger.info(f"get_execution_detail - user_id={current_user.user_id}, execution_id={execution_id}")

    try:
        service = OperationsService(db)
        result = service.get_execution_detail(execution_id, current_user.user_id)

        logger.info(f"get_execution_detail complete - user_id={current_user.user_id}, execution_id={execution_id}")
        return asdict(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_execution_detail failed - user_id={current_user.user_id}, execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get execution detail: {str(e)}"
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
        return asdict(result)

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
        return asdict(result)

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
    response_model=List[ScheduledStreamResponse],
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
        return [asdict(item) for item in result]

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
    response_model=ScheduledStreamResponse,
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
        return asdict(result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_stream_schedule failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schedule: {str(e)}"
        )
