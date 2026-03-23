"""
Operations Router

Admin-facing endpoints for monitoring and controlling the pipeline system.

Sections:
    1. Pipeline Monitoring    — View execution history and details
    2. Scheduler Management   — Configure stream schedules
    3. Worker Control         — Monitor, pause/resume, restart the worker process;
                                trigger/cancel/stream pipeline runs (proxied to worker)
    4. Email Queue            — View, schedule, cancel, and process report emails
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
import logging
import httpx
import json

from database import get_async_db
from models import User, RunType
from services import auth_service
from services.operations_service import OperationsService, get_operations_service
from services.research_stream_service import (
    ResearchStreamService,
    get_research_stream_service,
)
from services.pipeline_service import PipelineService
from services.report_email_queue_service import (
    ReportEmailQueueService,
    get_report_email_queue_service,
)
from services.worker_status_service import WorkerStatusService, get_worker_status_service
from config.settings import settings

# Domain types from schemas
from schemas.research_stream import (
    ExecutionQueueItem,
    StreamOption,
    ExecutionDetail,
    ScheduledStreamSummary,
)
from schemas.report_email_queue import (
    ReportEmailQueueStatus,
    ReportEmailQueueWithDetails,
    BulkScheduleRequest,
    BulkScheduleResponse,
    ProcessQueueResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations", tags=["operations"])


# ==================== Helpers ====================


async def _proxy_worker(
    method: str, path: str, json: Optional[dict] = None, timeout: float = 10.0
) -> dict:
    """
    Proxy a request to the worker management API.

    All worker communication (runs, status, shutdown) goes through this helper
    except SSE streaming which requires a different HTTP pattern.
    """
    url = f"{settings.WORKER_URL}{path}"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(method, url, json=json, timeout=timeout)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=response.json().get("detail", "Worker error"),
                )
            return response.json()

    except httpx.RequestError as e:
        logger.error(f"worker proxy {method} {path} connection error - {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker service unavailable",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"worker proxy {method} {path} failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Worker {method} {path} failed: {str(e)}",
        )


def _require_platform_admin(current_user: User):
    """Raise 403 if user is not a platform admin."""
    from models import UserRole
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )


# ==================== 1. Pipeline Monitoring ====================
#
# Read-only views of pipeline execution history.
# Data comes from OperationsService (aggregates executions, reports, streams).


class ExecutionQueueResponse(BaseModel):
    """Paginated list of pipeline executions with available stream filters."""
    executions: List[ExecutionQueueItem]
    total: int
    streams: List[StreamOption]


@router.get(
    "/executions",
    response_model=ExecutionQueueResponse,
    summary="Get pipeline execution queue",
)
async def get_execution_queue(
    execution_status: Optional[str] = None,
    approval_status: Optional[str] = None,
    stream_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(auth_service.validate_token),
    service: OperationsService = Depends(get_operations_service),
):
    """
    List pipeline executions with optional filters.

    - execution_status: pending, running, completed, failed
    - approval_status: awaiting_approval, approved, rejected (completed only)
    """
    logger.info(
        f"get_execution_queue - user_id={current_user.user_id}, "
        f"execution_status={execution_status}, approval_status={approval_status}"
    )

    try:
        executions, total, streams = await service.get_execution_queue(
            user_id=current_user.user_id,
            execution_status=execution_status,
            approval_status=approval_status,
            stream_id=stream_id,
            limit=limit,
            offset=offset,
        )
        logger.info(
            f"get_execution_queue complete - user_id={current_user.user_id}, count={len(executions)}"
        )
        return ExecutionQueueResponse(executions=executions, total=total, streams=streams)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"get_execution_queue failed - user_id={current_user.user_id}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get execution queue: {str(e)}",
        )


@router.get(
    "/executions/{execution_id}",
    response_model=ExecutionDetail,
    summary="Get execution details",
)
async def get_execution_detail(
    execution_id: str,
    current_user: User = Depends(auth_service.validate_token),
    service: OperationsService = Depends(get_operations_service),
):
    """Get full execution details including report and WIP articles."""
    logger.info(f"get_execution_detail - user_id={current_user.user_id}, execution_id={execution_id}")

    try:
        result = await service.get_execution_detail(execution_id, current_user.user_id)
        logger.info(
            f"get_execution_detail complete - user_id={current_user.user_id}, execution_id={execution_id}"
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"get_execution_detail failed - user_id={current_user.user_id}, execution_id={execution_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get execution detail: {str(e)}",
        )


# ==================== 2. Scheduler Management ====================
#
# Configure when streams run automatically.
# Data comes from OperationsService.


class UpdateScheduleRequest(BaseModel):
    """Fields to update on a stream's schedule configuration."""
    enabled: Optional[bool] = None
    frequency: Optional[str] = None
    anchor_day: Optional[str] = None
    preferred_time: Optional[str] = None
    timezone: Optional[str] = None
    send_day: Optional[str] = None
    send_time: Optional[str] = None


@router.get(
    "/streams/scheduled",
    response_model=List[ScheduledStreamSummary],
    summary="Get all scheduled streams",
)
async def get_scheduled_streams(
    current_user: User = Depends(auth_service.validate_token),
    service: OperationsService = Depends(get_operations_service),
):
    """List all streams with scheduling configuration and their last execution status."""
    logger.info(f"get_scheduled_streams - user_id={current_user.user_id}")

    try:
        result = await service.get_scheduled_streams(current_user.user_id)
        logger.info(f"get_scheduled_streams complete - user_id={current_user.user_id}, count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_scheduled_streams failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get scheduled streams: {str(e)}",
        )


@router.patch(
    "/streams/{stream_id}/schedule",
    response_model=ScheduledStreamSummary,
    summary="Update stream schedule",
)
async def update_stream_schedule(
    stream_id: int,
    request: UpdateScheduleRequest,
    current_user: User = Depends(auth_service.validate_token),
    service: OperationsService = Depends(get_operations_service),
):
    """Update scheduling configuration for a stream."""
    logger.info(f"update_stream_schedule - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        result = await service.update_stream_schedule(
            stream_id=stream_id,
            user_id=current_user.user_id,
            updates=request.model_dump(exclude_none=True),
        )
        logger.info(f"update_stream_schedule complete - user_id={current_user.user_id}, stream_id={stream_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"update_stream_schedule failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update schedule: {str(e)}",
        )


# ==================== 3. Worker Control ====================
#
# Monitor and control the background worker process.
# - Status/health: reads from worker_status table via WorkerStatusService
# - Pause/resume: writes to worker_status table (worker reads it each poll)
# - Shutdown: proxied to worker management API (systemd restarts it)
# - Run management: trigger, status, cancel, SSE stream — all proxied to worker


class WorkerStatusResponse(BaseModel):
    """Current worker health and configuration."""
    worker_id: Optional[str] = None
    started_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None
    status: str  # running, paused, stopping, down, unknown
    seconds_since_heartbeat: Optional[int] = None
    active_jobs: int = 0
    poll_interval_seconds: int = 0
    max_concurrent_jobs: int = 0
    last_poll_summary: Optional[dict] = None
    version: Optional[str] = None


class WorkerPauseResponse(BaseModel):
    """Result of a pause or resume action."""
    paused: bool
    message: str


class WorkerShutdownResponse(BaseModel):
    """Result of a shutdown (restart) request."""
    message: str
    active_jobs: int


class TriggerRunRequest(BaseModel):
    """Request to trigger a pipeline run via the worker."""
    stream_id: int
    run_type: str = "manual"
    report_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class TriggerRunResponse(BaseModel):
    """Confirmation that a run was queued."""
    execution_id: str
    stream_id: int
    status: str
    message: str


class RunStatusResponse(BaseModel):
    """Status of a single pipeline execution."""
    execution_id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None


class DirectRunRequest(BaseModel):
    """Request to execute pipeline directly in the main API process (SSE)."""
    stream_id: int
    run_type: str = Field("test", description="Type of run: manual, test, or scheduled")
    start_date: Optional[str] = Field(
        None, description="Start date for retrieval (YYYY/MM/DD). Defaults to 7 days ago."
    )
    end_date: Optional[str] = Field(
        None, description="End date for retrieval (YYYY/MM/DD). Defaults to today."
    )
    report_name: Optional[str] = Field(
        None, description="Custom name for the generated report. Defaults to YYYY.MM.DD format."
    )


# --- Worker process status ---

@router.get(
    "/worker-status",
    response_model=WorkerStatusResponse,
    summary="Get worker process status",
)
async def get_worker_status(
    service: WorkerStatusService = Depends(get_worker_status_service),
):
    """
    Read the worker's most recent heartbeat. Reports 'down' if stale (>2 min).

    No authentication required — used by external monitoring systems.
    """
    logger.info("get_worker_status called")

    try:
        result = await service.get_current_status()
        logger.info(f"get_worker_status complete - status={result.status}")
        return WorkerStatusResponse(
            worker_id=result.worker_id,
            started_at=result.started_at,
            last_heartbeat=result.last_heartbeat,
            status=result.status,
            seconds_since_heartbeat=result.seconds_since_heartbeat,
            active_jobs=result.active_jobs,
            poll_interval_seconds=result.poll_interval_seconds,
            max_concurrent_jobs=result.max_concurrent_jobs,
            last_poll_summary=result.last_poll_summary,
            version=result.version,
        )

    except Exception as e:
        logger.error(f"get_worker_status failed: {e}", exc_info=True)
        return WorkerStatusResponse(status="unknown")


# --- Worker process control (platform admin only) ---

@router.post(
    "/worker/pause",
    response_model=WorkerPauseResponse,
    summary="Pause worker job dispatch",
)
async def pause_worker(
    current_user: User = Depends(auth_service.validate_token),
    service: WorkerStatusService = Depends(get_worker_status_service),
):
    """Pause the worker. Sets status='paused' in the DB. Worker reads it each poll cycle."""
    _require_platform_admin(current_user)
    logger.info(f"pause_worker - user_id={current_user.user_id}")
    await service.set_paused(True)
    logger.info(f"pause_worker success - user_id={current_user.user_id}")
    return WorkerPauseResponse(paused=True, message="Worker paused. No new jobs will be dispatched.")


@router.post(
    "/worker/resume",
    response_model=WorkerPauseResponse,
    summary="Resume worker job dispatch",
)
async def resume_worker(
    current_user: User = Depends(auth_service.validate_token),
    service: WorkerStatusService = Depends(get_worker_status_service),
):
    """Resume the worker. Sets status='running' in the DB."""
    _require_platform_admin(current_user)
    logger.info(f"resume_worker - user_id={current_user.user_id}")
    await service.set_paused(False)
    logger.info(f"resume_worker success - user_id={current_user.user_id}")
    return WorkerPauseResponse(paused=False, message="Worker resumed. Jobs will be dispatched on next poll.")


@router.post(
    "/worker/shutdown",
    response_model=WorkerShutdownResponse,
    summary="Restart worker (graceful shutdown)",
)
async def shutdown_worker(
    current_user: User = Depends(auth_service.validate_token),
):
    """
    Graceful shutdown. In production, systemd restarts the worker automatically,
    so this effectively performs a restart.
    """
    _require_platform_admin(current_user)
    logger.info(f"shutdown_worker - user_id={current_user.user_id}")
    result = await _proxy_worker("POST", "/worker/shutdown")
    logger.info(f"shutdown_worker success - active_jobs={result.get('active_jobs')}")
    return WorkerShutdownResponse(**result)


# --- Pipeline run management (proxied to worker) ---

@router.post(
    "/runs",
    response_model=TriggerRunResponse,
    summary="Trigger a pipeline run",
)
async def trigger_run(
    request: TriggerRunRequest,
    current_user: User = Depends(auth_service.validate_token),
):
    """Queue a pipeline run on the worker for a given stream."""
    logger.info(f"trigger_run - user_id={current_user.user_id}, stream_id={request.stream_id}")

    result = await _proxy_worker("POST", "/worker/runs", json={
        "stream_id": request.stream_id,
        "run_type": request.run_type,
        "report_name": request.report_name,
        "start_date": request.start_date,
        "end_date": request.end_date,
    })
    logger.info(f"trigger_run success - execution_id={result.get('execution_id')}")
    return TriggerRunResponse(**result)


@router.get(
    "/runs/{execution_id}",
    response_model=RunStatusResponse,
    summary="Get run status",
)
async def get_run_status(
    execution_id: str,
    current_user: User = Depends(auth_service.validate_token),
):
    """Get the current status of a pipeline execution from the worker."""
    logger.info(f"get_run_status - user_id={current_user.user_id}, execution_id={execution_id}")
    result = await _proxy_worker("GET", f"/worker/runs/{execution_id}")
    return RunStatusResponse(**result)


@router.get(
    "/runs/{execution_id}/stream",
    response_class=EventSourceResponse,
    summary="Stream run status updates",
)
async def stream_run_status(
    execution_id: str,
    current_user: User = Depends(auth_service.validate_token),
) -> EventSourceResponse:
    """
    Stream real-time status updates for a running execution via SSE.

    Proxies the SSE stream from the worker. Cannot use _proxy_worker because
    this streams lines rather than returning a single JSON response.
    """
    logger.info(f"stream_run_status - user_id={current_user.user_id}, execution_id={execution_id}")

    async def event_generator():
        try:
            async with httpx.AsyncClient() as client:
                async with client.stream(
                    "GET",
                    f"{settings.WORKER_URL}/worker/runs/{execution_id}/stream",
                    timeout=httpx.Timeout(connect=10.0, read=300.0, write=10.0, pool=10.0),
                ) as response:
                    if response.status_code != 200:
                        logger.error(f"stream_run_status worker error - status={response.status_code}")
                        yield {
                            "event": "message",
                            "data": json.dumps({"error": f"Worker returned {response.status_code}"}),
                        }
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            yield {"event": "message", "data": line[6:]}

        except httpx.RequestError as e:
            logger.error(f"stream_run_status connection error - {e}")
            yield {"event": "message", "data": json.dumps({"error": "Worker connection failed"})}
        except Exception as e:
            logger.error(f"stream_run_status unexpected error - {e}", exc_info=True)
            yield {"event": "message", "data": json.dumps({"error": "Stream error"})}

    return EventSourceResponse(event_generator(), ping=1)


@router.delete(
    "/runs/{execution_id}",
    summary="Cancel a run",
)
async def cancel_run(
    execution_id: str,
    current_user: User = Depends(auth_service.validate_token),
):
    """Request cancellation of a running pipeline job."""
    logger.info(f"cancel_run - user_id={current_user.user_id}, execution_id={execution_id}")
    result = await _proxy_worker("DELETE", f"/worker/runs/{execution_id}")
    logger.info(f"cancel_run success - execution_id={execution_id}")
    return result


# --- Direct execution (runs in main API process, not worker) ---

@router.post(
    "/runs/direct",
    summary="Execute pipeline directly via SSE",
)
async def execute_run_direct(
    request: DirectRunRequest,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(auth_service.validate_token),
):
    """
    Execute the pipeline directly in this process, streaming progress via SSE.

    Unlike POST /runs which queues the job for the worker, this runs the pipeline
    inline and streams real-time status updates. Used by the RunJobModal in the UI.
    """
    logger.info(f"execute_run_direct - user_id={current_user.user_id}, stream_id={request.stream_id}")

    try:
        stream = await stream_service.get_research_stream(current_user, request.stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        run_type_value = RunType.TEST
        if request.run_type:
            try:
                run_type_value = RunType(request.run_type.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid run_type. Must be one of: test, scheduled, manual",
                )

        end_date = request.end_date or datetime.now().strftime("%Y/%m/%d")
        start_date = request.start_date or (datetime.now() - timedelta(days=7)).strftime("%Y/%m/%d")

        pipeline_service = PipelineService(db)
        user_id = current_user.user_id

        async def event_generator():
            try:
                async for pipeline_status in pipeline_service.run_pipeline_direct(
                    stream_id=request.stream_id,
                    user_id=user_id,
                    run_type=run_type_value,
                    start_date=start_date,
                    end_date=end_date,
                    report_name=request.report_name,
                ):
                    yield f"data: {json.dumps(pipeline_status.to_dict())}\n\n"
                yield 'data: {"stage": "done"}\n\n'

            except Exception as e:
                yield f'data: {json.dumps({"stage": "error", "message": str(e), "error_type": type(e).__name__})}\n\n'

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"execute_run_direct failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline execution failed: {str(e)}",
        )


# ==================== 4. Email Queue ====================
#
# Manage scheduled report email delivery.
# Data comes from ReportEmailQueueService.


class EmailQueueListResponse(BaseModel):
    """Paginated list of email queue entries."""
    entries: List[ReportEmailQueueWithDetails]
    total: int


class SubscriberInfo(BaseModel):
    """User info for the subscriber picker."""
    user_id: int
    email: str
    full_name: Optional[str] = None
    org_name: Optional[str] = None


class ApprovedReportInfo(BaseModel):
    """Report info for the report picker."""
    report_id: int
    report_name: str
    stream_name: Optional[str] = None
    created_at: datetime


@router.get(
    "/email-queue",
    response_model=EmailQueueListResponse,
    summary="List email queue entries",
)
async def list_email_queue(
    status_filter: Optional[ReportEmailQueueStatus] = None,
    scheduled_from: Optional[datetime] = None,
    scheduled_to: Optional[datetime] = None,
    report_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """List email queue entries with optional filters."""
    logger.info(f"list_email_queue - user_id={current_user.user_id}, status={status_filter}")

    try:
        entries, total = await queue_service.get_queue_entries(
            status_filter=status_filter,
            scheduled_from=scheduled_from.date() if scheduled_from else None,
            scheduled_to=scheduled_to.date() if scheduled_to else None,
            report_id=report_id,
            limit=limit,
            offset=offset,
        )
        logger.info(f"list_email_queue complete - total={total}, returned={len(entries)}")
        return EmailQueueListResponse(entries=entries, total=total)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_email_queue failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list email queue: {str(e)}",
        )


@router.get(
    "/email-queue/approved-reports",
    response_model=List[ApprovedReportInfo],
    summary="Get approved reports for scheduling",
)
async def get_approved_reports_for_email(
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Get approved reports for the email scheduling dropdown."""
    logger.info(f"get_approved_reports_for_email - user_id={current_user.user_id}")

    try:
        reports = await queue_service.get_approved_reports(limit=50)

        stream_ids = [r.research_stream_id for r in reports if r.research_stream_id]
        streams = {}
        if stream_ids:
            stream_list = await stream_service.get_streams_by_ids(stream_ids)
            streams = {s.stream_id: s.stream_name for s in stream_list}

        result = [
            ApprovedReportInfo(
                report_id=r.report_id,
                report_name=r.report_name,
                stream_name=streams.get(r.research_stream_id) if r.research_stream_id else None,
                created_at=r.created_at,
            )
            for r in reports
        ]

        logger.info(f"get_approved_reports_for_email complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_approved_reports_for_email failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get approved reports: {str(e)}",
        )


@router.get(
    "/email-queue/subscribers/{report_id}",
    response_model=List[SubscriberInfo],
    summary="Get subscribers for a report's stream",
)
async def get_report_subscribers(
    report_id: int,
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Get all subscribers for the given report's stream."""
    logger.info(f"get_report_subscribers - user_id={current_user.user_id}, report_id={report_id}")

    try:
        subscribers = await queue_service.get_stream_subscribers(report_id)
        result = [
            SubscriberInfo(
                user_id=u.user_id,
                email=u.email,
                full_name=u.full_name,
                org_name=u.organization.name if u.organization else None,
            )
            for u in subscribers
        ]
        logger.info(f"get_report_subscribers complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_subscribers failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get subscribers: {str(e)}",
        )


@router.post(
    "/email-queue/schedule",
    response_model=BulkScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule emails for users",
)
async def schedule_emails(
    request: BulkScheduleRequest,
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Schedule report emails for multiple users."""
    logger.info(
        f"schedule_emails - user_id={current_user.user_id}, report_id={request.report_id}, "
        f"user_count={len(request.user_ids)}, scheduled_for={request.scheduled_for}"
    )

    try:
        result = await queue_service.schedule_emails(request)
        logger.info(f"schedule_emails complete - scheduled={result.scheduled_count}, skipped={result.skipped_count}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"schedule_emails failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule emails: {str(e)}",
        )


@router.delete(
    "/email-queue/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel a scheduled email",
)
async def cancel_email(
    entry_id: int,
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Cancel a scheduled email. Only works for scheduled/ready status."""
    logger.info(f"cancel_email - user_id={current_user.user_id}, entry_id={entry_id}")

    try:
        success = await queue_service.cancel_entry(entry_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel: entry not found or already processed",
            )
        logger.info(f"cancel_email complete - entry_id={entry_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cancel_email failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel email: {str(e)}",
        )


@router.post(
    "/email-queue/process",
    response_model=ProcessQueueResponse,
    summary="Process scheduled emails now",
)
async def process_email_queue(
    force_all: bool = False,
    current_user: User = Depends(auth_service.validate_token),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """
    Manually trigger processing of due scheduled emails.

    Same logic as the worker's automatic processing. Finds entries where
    scheduled_for <= now and status = scheduled, then sends them.

    force_all: If True, process ALL scheduled entries regardless of date.
    """
    from datetime import date
    today = date.today()
    logger.info(f"process_email_queue - user_id={current_user.user_id}, force_all={force_all}, server_date={today}")

    try:
        result = await queue_service.process_queue(force_all=force_all)
        logger.info(
            f"process_email_queue complete - processed={result.total_processed}, "
            f"sent={result.sent_count}, failed={result.failed_count}"
        )
        return ProcessQueueResponse(
            total_processed=result.total_processed,
            sent_count=result.sent_count,
            failed_count=result.failed_count,
            skipped_count=result.skipped_count,
            errors=result.errors,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"process_email_queue failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process email queue: {str(e)}",
        )
