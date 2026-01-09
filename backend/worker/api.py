"""
Management Plane API

External control interface for the worker:
- Trigger runs
- Check status
- Cancel jobs
- Health checks
"""

import logging
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
from datetime import datetime
import uuid

from database import get_db
from models import PipelineExecution, ResearchStream, ExecutionStatus, RunType
from worker.status_broker import broker

logger = logging.getLogger('worker.api')

router = APIRouter(prefix="/worker", tags=["worker"])


# ==================== Request/Response Models ====================

class TriggerRunRequest(BaseModel):
    """Request to trigger a pipeline run"""
    stream_id: int
    run_type: str = "manual"  # manual, test


class TriggerRunResponse(BaseModel):
    """Response after triggering a run"""
    execution_id: str
    stream_id: int
    status: str
    message: str


class JobStatusResponse(BaseModel):
    """Status of a pipeline execution"""
    execution_id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    timestamp: datetime
    version: str = "1.0.0"


# ==================== Endpoints ====================

@router.post("/runs", response_model=TriggerRunResponse)
async def trigger_run(
    request: TriggerRunRequest,
    db: Session = Depends(get_db)
):
    """
    Trigger a pipeline run for a stream.

    Creates a PipelineExecution with status='pending'.
    The worker loop will pick it up and execute.
    """
    logger.info(f"trigger_run called - stream_id={request.stream_id}, run_type={request.run_type}")

    try:
        # Verify stream exists
        stream = db.query(ResearchStream).filter(
            ResearchStream.stream_id == request.stream_id
        ).first()

        if not stream:
            logger.warning(f"trigger_run failed - stream {request.stream_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stream {request.stream_id} not found"
            )

        # Create pending execution
        execution_id = str(uuid.uuid4())
        run_type = RunType.TEST if request.run_type == "test" else RunType.MANUAL

        execution = PipelineExecution(
            id=execution_id,
            stream_id=request.stream_id,
            status=ExecutionStatus.PENDING,
            run_type=run_type
        )
        db.add(execution)
        db.commit()

        logger.info(f"trigger_run success - execution_id={execution_id}, stream={stream.stream_name}")

        return TriggerRunResponse(
            execution_id=execution_id,
            stream_id=request.stream_id,
            status="pending",
            message=f"Pipeline run queued for stream {stream.stream_name}"
        )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"trigger_run database error - stream_id={request.stream_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating execution"
        )
    except Exception as e:
        logger.error(f"trigger_run unexpected error - stream_id={request.stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger run"
        )


@router.get("/runs", response_model=List[JobStatusResponse])
async def list_runs(
    status_filter: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """List recent pipeline executions"""
    logger.info(f"list_runs called - status_filter={status_filter}, limit={limit}")

    try:
        query = db.query(PipelineExecution).order_by(
            PipelineExecution.created_at.desc()
        )

        if status_filter:
            try:
                exec_status = ExecutionStatus(status_filter)
                query = query.filter(PipelineExecution.status == exec_status)
            except ValueError:
                logger.warning(f"list_runs invalid status filter: {status_filter}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {status_filter}. Valid values: pending, running, completed, failed"
                )

        executions = query.limit(limit).all()

        logger.info(f"list_runs returning {len(executions)} executions")

        return [
            JobStatusResponse(
                execution_id=e.id,
                stream_id=e.stream_id,
                status=e.status.value,
                run_type=e.run_type.value,
                started_at=e.started_at,
                completed_at=e.completed_at,
                error=e.error
            )
            for e in executions
        ]

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"list_runs database error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching executions"
        )
    except Exception as e:
        logger.error(f"list_runs unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list runs"
        )


@router.get("/runs/{execution_id}", response_model=JobStatusResponse)
async def get_run_status(
    execution_id: str,
    db: Session = Depends(get_db)
):
    """Get status of a specific execution"""
    logger.debug(f"get_run_status called - execution_id={execution_id}")

    try:
        execution = db.query(PipelineExecution).filter(
            PipelineExecution.id == execution_id
        ).first()

        if not execution:
            logger.warning(f"get_run_status - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        return JobStatusResponse(
            execution_id=execution.id,
            stream_id=execution.stream_id,
            status=execution.status.value,
            run_type=execution.run_type.value,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            error=execution.error
        )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"get_run_status database error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching execution"
        )
    except Exception as e:
        logger.error(f"get_run_status unexpected error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get run status"
        )


@router.get("/runs/{execution_id}/stream")
async def stream_run_status(
    execution_id: str,
    db: Session = Depends(get_db)
):
    """
    Stream status updates for a running execution via SSE.

    Connect to this endpoint to receive real-time status updates.
    The stream ends when the job completes or fails.
    """
    logger.info(f"stream_run_status called - execution_id={execution_id}")

    # Verify execution exists
    try:
        execution = db.query(PipelineExecution).filter(
            PipelineExecution.id == execution_id
        ).first()

        if not execution:
            logger.warning(f"stream_run_status - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        # If already completed, return immediately with final status
        if execution.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]:
            logger.info(f"stream_run_status - execution {execution_id} already {execution.status.value}")

            async def completed_stream() -> AsyncGenerator[str, None]:
                data = {
                    "execution_id": execution_id,
                    "stage": execution.status.value,
                    "message": execution.error if execution.error else "Completed",
                    "timestamp": execution.completed_at.isoformat() if execution.completed_at else None
                }
                yield f"data: {json.dumps(data)}\n\n"

            return StreamingResponse(
                completed_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"stream_run_status database error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )

    # Subscribe to status updates
    async def event_stream() -> AsyncGenerator[str, None]:
        queue = await broker.subscribe(execution_id)
        try:
            logger.debug(f"Client subscribed to execution {execution_id}")
            while True:
                try:
                    # Wait for status update with timeout
                    update = await asyncio.wait_for(queue.get(), timeout=30.0)

                    if update is None:
                        # Sentinel value - stream complete
                        logger.debug(f"Stream complete for execution {execution_id}")
                        break

                    data = update.to_dict()
                    yield f"data: {json.dumps(data)}\n\n"

                    # If this was a completion message, we're done
                    if update.stage in ["completed", "failed"]:
                        break

                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f": keepalive\n\n"

        except asyncio.CancelledError:
            logger.debug(f"Stream cancelled for execution {execution_id}")
        finally:
            await broker.unsubscribe(execution_id, queue)
            logger.debug(f"Client unsubscribed from execution {execution_id}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.delete("/runs/{execution_id}")
async def cancel_run(
    execution_id: str,
    db: Session = Depends(get_db)
):
    """
    Request cancellation of a running job.

    Note: Actual cancellation depends on the worker's ability to interrupt.
    """
    logger.info(f"cancel_run called - execution_id={execution_id}")

    try:
        execution = db.query(PipelineExecution).filter(
            PipelineExecution.id == execution_id
        ).first()

        if not execution:
            logger.warning(f"cancel_run - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        if execution.status not in [ExecutionStatus.PENDING, ExecutionStatus.RUNNING]:
            logger.warning(f"cancel_run - cannot cancel execution {execution_id} with status {execution.status.value}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel execution with status: {execution.status.value}"
            )

        # For pending jobs, we can just mark as failed
        if execution.status == ExecutionStatus.PENDING:
            execution.status = ExecutionStatus.FAILED
            execution.error = "Cancelled by user"
            execution.completed_at = datetime.utcnow()
            db.commit()
            logger.info(f"cancel_run - cancelled pending execution {execution_id}")
            return {"message": "Execution cancelled", "execution_id": execution_id}

        # For running jobs, we'd need to signal the worker
        # This is a placeholder - actual implementation depends on worker architecture
        logger.info(f"cancel_run - cancellation requested for running execution {execution_id}")
        return {
            "message": "Cancellation requested (running jobs may not stop immediately)",
            "execution_id": execution_id
        }

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"cancel_run database error - execution_id={execution_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while cancelling execution"
        )
    except Exception as e:
        logger.error(f"cancel_run unexpected error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel run"
        )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    logger.debug("health_check called")
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow()
    )
