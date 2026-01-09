"""
Operations router - Pipeline execution queue and scheduler management

For platform operations, not platform admin.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
import logging

from database import get_db
from models import User
from services import auth_service
from services.operations_service import OperationsService

# Import domain types from schemas
from schemas.research_stream import (
    ExecutionQueueResult,
    ExecutionDetail,
    ApprovalResult,
    ScheduledStreamSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations", tags=["operations"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== Request Models (API-specific) ====================

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
    response_model=ExecutionQueueResult,
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
        return result

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
    response_model=ExecutionDetail,
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
        return result

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
    response_model=ApprovalResult,
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
    response_model=ApprovalResult,
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
    response_model=List[ScheduledStreamSummary],
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
    response_model=ScheduledStreamSummary,
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
