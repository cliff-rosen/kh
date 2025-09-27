from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from database import get_db

from exceptions import ToolStepNotFoundError

from schemas.workflow import ToolStep, ToolExecutionStatus

from services.auth_service import validate_token
from services.tool_step_service import ToolStepService

router = APIRouter(prefix="/tool-steps", tags=["tool-steps"])


class UpdateToolStepRequest(BaseModel):
    tool_id: Optional[str] = None
    description: Optional[str] = None
    resource_configs: Optional[Dict[str, Any]] = None
    parameter_mapping: Optional[Dict[str, Any]] = None
    result_mapping: Optional[Dict[str, Any]] = None
    status: Optional[ToolExecutionStatus] = None
    error_message: Optional[str] = None
    validation_errors: Optional[List[str]] = None


class ExecuteToolStepRequest(BaseModel):
    asset_context: Dict[str, Any]


class UpdateToolStepStatusRequest(BaseModel):
    status: ToolExecutionStatus
    error_message: Optional[str] = None
    execution_result: Optional[Dict[str, Any]] = None


@router.get("/{tool_step_id}", response_model=ToolStep)
async def get_tool_step(
    tool_step_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get a tool step by ID"""
    try:
        tool_step_service = ToolStepService(db)
        return await tool_step_service.get_tool_step(tool_step_id, current_user.user_id)
    except ToolStepNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{tool_step_id}", response_model=ToolStep)
async def update_tool_step(
    tool_step_id: str,
    tool_step_request: UpdateToolStepRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update a tool step"""
    try:
        tool_step_service = ToolStepService(db)
        
        # Only include non-None values in the update
        updates = {k: v for k, v in tool_step_request.model_dump().items() if v is not None}
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        return await tool_step_service.update_tool_step(tool_step_id, current_user.user_id, updates)
    except HTTPException:
        raise
    except ToolStepNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{tool_step_id}/status", response_model=ToolStep)
async def update_tool_step_status(
    tool_step_id: str,
    status_request: UpdateToolStepStatusRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update tool step status with optional error message and execution result"""
    try:
        tool_step_service = ToolStepService(db)
        return await tool_step_service.update_tool_step_status(
            tool_step_id,
            current_user.user_id,
            status_request.status,
            status_request.error_message,
            status_request.execution_result
        )
    except HTTPException:
        raise
    except ToolStepNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{tool_step_id}/execute", response_model=ToolStep)
async def execute_tool_step(
    tool_step_id: str,
    execute_request: ExecuteToolStepRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Execute a tool step with provided asset context"""
    try:
        tool_step_service = ToolStepService(db)
        tool_step = await tool_step_service.execute_tool_step(
            tool_step_id,
            current_user.user_id,
            execute_request.asset_context
        )
        if not tool_step:
            raise HTTPException(status_code=404, detail="Tool step not found")
        return tool_step
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{tool_step_id}")
async def delete_tool_step(
    tool_step_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Delete a tool step"""
    try:
        tool_step_service = ToolStepService(db)
        await tool_step_service.delete_tool_step(tool_step_id, current_user.user_id)
        return {"message": "Tool step deleted successfully"}
    except HTTPException:
        raise
    except ToolStepNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hop/{hop_id}/next-pending", response_model=Optional[ToolStep])
async def get_next_pending_tool_step(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get the next pending tool step for a hop"""
    try:
        tool_step_service = ToolStepService(db)
        tool_step = await tool_step_service.get_next_pending_tool_step(hop_id, current_user.user_id)
        return tool_step
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hop/{hop_id}/failed", response_model=List[ToolStep])
async def get_failed_tool_steps(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get all failed tool steps for a hop"""
    try:
        tool_step_service = ToolStepService(db)
        tool_steps = await tool_step_service.get_failed_tool_steps(hop_id, current_user.user_id)
        return tool_steps
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hop/{hop_id}/reorder")
async def reorder_tool_steps(
    hop_id: str,
    tool_step_ids: List[str],
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Reorder tool steps within a hop"""
    try:
        tool_step_service = ToolStepService(db)
        updated_tool_steps = await tool_step_service.reorder_tool_steps(
            hop_id, 
            current_user.user_id, 
            tool_step_ids
        )
        return {"message": "Tool steps reordered successfully", "tool_steps": updated_tool_steps}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 