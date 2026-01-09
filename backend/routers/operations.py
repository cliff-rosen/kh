"""
Operations router - Pipeline execution queue and scheduler management

For platform operations, not platform admin.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import List, Optional
import logging
import httpx
import json

from database import get_db
from models import User
from services import auth_service
from services.operations_service import OperationsService
from config.settings import settings

# Import domain types from schemas
from schemas.research_stream import (
    ExecutionQueueItem,
    StreamOption,
    ExecutionDetail,
    ScheduledStreamSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations", tags=["operations"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== API-Specific Models (request/response wrappers) ====================

class RejectReportRequest(BaseModel):
    """Request to reject a report."""
    reason: str = Field(..., min_length=1, description="Reason for rejection")


class ExecutionQueueResponse(BaseModel):
    """Response wrapper for execution queue with pagination info."""
    executions: List[ExecutionQueueItem]
    total: int
    streams: List[StreamOption]


class ApprovalResponse(BaseModel):
    """Response for approve/reject operations."""
    status: str
    report_id: int
    reason: Optional[str] = None


class UpdateScheduleRequest(BaseModel):
    """Request to update schedule configuration."""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    anchor_day: Optional[str] = None
    preferred_time: Optional[str] = None
    timezone: Optional[str] = None
    lookback_days: Optional[int] = None


class TriggerRunRequest(BaseModel):
    """Request to trigger a pipeline run."""
    stream_id: int
    run_type: str = "manual"  # manual, test
    # Job config options
    report_name: Optional[str] = None
    start_date: Optional[str] = None  # ISO date string
    end_date: Optional[str] = None    # ISO date string


class TriggerRunResponse(BaseModel):
    """Response after triggering a run."""
    execution_id: str
    stream_id: int
    status: str
    message: str


class RunStatusResponse(BaseModel):
    """Status of a pipeline execution."""
    execution_id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


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
        executions, total, streams = service.get_execution_queue(
            user_id=current_user.user_id,
            execution_status=execution_status,
            approval_status=approval_status,
            stream_id=stream_id,
            limit=limit,
            offset=offset
        )

        logger.info(f"get_execution_queue complete - user_id={current_user.user_id}, count={len(executions)}")
        return ExecutionQueueResponse(executions=executions, total=total, streams=streams)

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
    response_model=ApprovalResponse,
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
        return ApprovalResponse(**result)

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
    response_model=ApprovalResponse,
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
        return ApprovalResponse(**result)

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


# ==================== Run Management (Proxy to Worker) ====================

@router.post(
    "/runs",
    response_model=TriggerRunResponse,
    summary="Trigger a pipeline run"
)
async def trigger_run(
    request: TriggerRunRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Trigger a pipeline run for a stream.

    Proxies to the worker service which creates a pending execution.
    """
    logger.info(f"trigger_run - user_id={current_user.user_id}, stream_id={request.stream_id}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.WORKER_URL}/worker/runs",
                json={
                    "stream_id": request.stream_id,
                    "run_type": request.run_type,
                },
                timeout=10.0
            )

            if response.status_code != 200:
                logger.error(f"trigger_run worker error - status={response.status_code}, body={response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Worker error")
                )

            result = response.json()
            logger.info(f"trigger_run success - execution_id={result.get('execution_id')}")
            return TriggerRunResponse(**result)

    except httpx.RequestError as e:
        logger.error(f"trigger_run connection error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker service unavailable"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"trigger_run unexpected error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to trigger run: {str(e)}"
        )


@router.get(
    "/runs/{execution_id}",
    response_model=RunStatusResponse,
    summary="Get run status"
)
async def get_run_status(
    execution_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get the status of a pipeline execution."""
    logger.info(f"get_run_status - user_id={current_user.user_id}, execution_id={execution_id}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{settings.WORKER_URL}/worker/runs/{execution_id}",
                timeout=10.0
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Worker error")
                )

            return RunStatusResponse(**response.json())

    except httpx.RequestError as e:
        logger.error(f"get_run_status connection error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker service unavailable"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_run_status unexpected error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get run status: {str(e)}"
        )


@router.get(
    "/runs/{execution_id}/stream",
    response_class=EventSourceResponse,
    summary="Stream run status updates"
)
async def stream_run_status(
    execution_id: str,
    current_user: User = Depends(get_current_user),
) -> EventSourceResponse:
    """
    Stream status updates for a running execution via SSE.

    Proxies the SSE stream from the worker service.
    """
    logger.info(f"stream_run_status - user_id={current_user.user_id}, execution_id={execution_id}")

    async def event_generator():
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "GET",
                    f"{settings.WORKER_URL}/worker/runs/{execution_id}/stream",
                    timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0)
                ) as response:
                    if response.status_code != 200:
                        logger.error(f"stream_run_status worker error - status={response.status_code}")
                        yield {
                            "event": "message",
                            "data": json.dumps({"error": f"Worker returned {response.status_code}"})
                        }
                        return

                    async for line in response.aiter_lines():
                        # Parse SSE format from worker: "data: {...}"
                        if line.startswith("data: "):
                            data = line[6:]  # Strip "data: " prefix
                            yield {
                                "event": "message",
                                "data": data
                            }

        except httpx.RequestError as e:
            logger.error(f"stream_run_status connection error - {e}")
            yield {
                "event": "message",
                "data": json.dumps({"error": "Worker connection failed"})
            }
        except Exception as e:
            logger.error(f"stream_run_status unexpected error - {e}", exc_info=True)
            yield {
                "event": "message",
                "data": json.dumps({"error": "Stream error"})
            }

    return EventSourceResponse(event_generator(), ping=1)


@router.delete(
    "/runs/{execution_id}",
    summary="Cancel a run"
)
async def cancel_run(
    execution_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Request cancellation of a running job.

    Proxies to the worker service.
    """
    logger.info(f"cancel_run - user_id={current_user.user_id}, execution_id={execution_id}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{settings.WORKER_URL}/worker/runs/{execution_id}",
                timeout=10.0
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Worker error")
                )

            result = response.json()
            logger.info(f"cancel_run success - execution_id={execution_id}")
            return result

    except httpx.RequestError as e:
        logger.error(f"cancel_run connection error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker service unavailable"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cancel_run unexpected error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel run: {str(e)}"
        )
