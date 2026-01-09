"""
Management Plane API

External control interface for the worker:
- Trigger runs
- Check status
- Cancel jobs
- Health checks
"""

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid

from database import get_db
from models import PipelineExecution, ResearchStream, ExecutionStatus, RunType

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
    # Verify stream exists
    stream = db.query(ResearchStream).filter(
        ResearchStream.stream_id == request.stream_id
    ).first()

    if not stream:
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

    return TriggerRunResponse(
        execution_id=execution_id,
        stream_id=request.stream_id,
        status="pending",
        message=f"Pipeline run queued for stream {stream.stream_name}"
    )


@router.get("/runs", response_model=List[JobStatusResponse])
async def list_runs(
    status_filter: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """List recent pipeline executions"""
    query = db.query(PipelineExecution).order_by(
        PipelineExecution.created_at.desc()
    )

    if status_filter:
        try:
            exec_status = ExecutionStatus(status_filter)
            query = query.filter(PipelineExecution.status == exec_status)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status: {status_filter}"
            )

    executions = query.limit(limit).all()

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


@router.get("/runs/{execution_id}", response_model=JobStatusResponse)
async def get_run_status(
    execution_id: str,
    db: Session = Depends(get_db)
):
    """Get status of a specific execution"""
    execution = db.query(PipelineExecution).filter(
        PipelineExecution.id == execution_id
    ).first()

    if not execution:
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


@router.delete("/runs/{execution_id}")
async def cancel_run(
    execution_id: str,
    db: Session = Depends(get_db)
):
    """
    Request cancellation of a running job.

    Note: Actual cancellation depends on the worker's ability to interrupt.
    """
    execution = db.query(PipelineExecution).filter(
        PipelineExecution.id == execution_id
    ).first()

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution {execution_id} not found"
        )

    if execution.status not in [ExecutionStatus.PENDING, ExecutionStatus.RUNNING]:
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
        return {"message": "Execution cancelled", "execution_id": execution_id}

    # For running jobs, we'd need to signal the worker
    # This is a placeholder - actual implementation depends on worker architecture
    return {
        "message": "Cancellation requested (running jobs may not stop immediately)",
        "execution_id": execution_id
    }


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow()
    )
