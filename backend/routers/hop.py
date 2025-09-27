from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

from database import get_db

from exceptions import HopNotFoundError, NotFoundError

from schemas.workflow import Hop, HopStatus, ToolStep, Mission

from services.auth_service import validate_token
from services.hop_service import HopService
from services.tool_step_service import ToolStepService
from services.mission_service import MissionService


router = APIRouter(prefix="/hops", tags=["hops"])


class CreateHopRequest(BaseModel):
    name: str
    description: str
    goal: Optional[str] = None
    success_criteria: Optional[List[str]] = None
    input_asset_ids: Optional[List[str]] = None
    output_asset_ids: Optional[List[str]] = None
    rationale: Optional[str] = None
    is_final: bool = False
    metadata: Optional[Dict[str, Any]] = None


class UpdateHopRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None
    success_criteria: Optional[List[str]] = None
    input_asset_ids: Optional[List[str]] = None
    output_asset_ids: Optional[List[str]] = None
    rationale: Optional[str] = None
    is_final: Optional[bool] = None
    is_resolved: Optional[bool] = None
    status: Optional[HopStatus] = None
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class CreateToolStepRequest(BaseModel):
    tool_id: str
    description: str
    resource_configs: Optional[Dict[str, Any]] = None
    parameter_mapping: Optional[Dict[str, Any]] = None
    result_mapping: Optional[Dict[str, Any]] = None
    validation_errors: Optional[List[str]] = None


class HopExecutionResponse(BaseModel):
    success: bool
    errors: List[str]
    message: str
    executed_steps: int
    total_steps: int
    metadata: Optional[Dict[str, Any]] = None



@router.post("/missions/{mission_id}/hops", response_model=Hop)
async def create_hop(
    mission_id: str,
    hop_request: CreateHopRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Create a new hop for a mission"""
    try:
        hop_service = HopService(db)
        hop = await hop_service.create_hop(
            mission_id=mission_id,
            user_id=current_user.user_id,
            name=hop_request.name,
            description=hop_request.description,
            goal=hop_request.goal,
            success_criteria=hop_request.success_criteria,
            input_asset_ids=hop_request.input_asset_ids,
            output_asset_ids=hop_request.output_asset_ids,
            rationale=hop_request.rationale,
            is_final=hop_request.is_final,
            metadata=hop_request.metadata
        )
        return hop
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/missions/{mission_id}/hops", response_model=List[Hop])
async def get_mission_hops(
    mission_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get all hops for a mission"""
    try:
        hop_service = HopService(db)
        hops = await hop_service.get_hops_by_mission(mission_id, current_user.user_id)
        return hops
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{hop_id}", response_model=Hop)
async def get_hop(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get a hop by ID"""
    try:
        hop_service = HopService(db)
        return await hop_service.get_hop(hop_id, current_user.user_id)
    except HopNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{hop_id}", response_model=Hop)
async def update_hop(
    hop_id: str,
    hop_request: UpdateHopRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update a hop"""
    try:
        hop_service = HopService(db)
        
        # Only include non-None values in the update
        updates = {k: v for k, v in hop_request.model_dump().items() if v is not None}
        
        if not updates:
            raise HTTPException(status_code=400, detail="No updates provided")
        
        hop = await hop_service.update_hop(hop_id, current_user.user_id, updates)
        if not hop:
            raise HTTPException(status_code=404, detail="Hop not found")
        return hop
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{hop_id}/status")
async def update_hop_status(
    hop_id: str,
    status: HopStatus,
    error_message: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Update hop status"""
    try:
        hop_service = HopService(db)
        hop = await hop_service.update_hop_status(
            hop_id, 
            current_user.user_id, 
            status, 
            error_message
        )
        if not hop:
            raise HTTPException(status_code=404, detail="Hop not found")
        return {"message": "Hop status updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{hop_id}/tool-steps", response_model=ToolStep)
async def create_tool_step(
    hop_id: str,
    tool_step_request: CreateToolStepRequest,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Create a new tool step for a hop"""
    try:
        tool_step_service = ToolStepService(db)
        tool_step = await tool_step_service.create_tool_step(
            hop_id=hop_id,
            user_id=current_user.user_id,
            tool_id=tool_step_request.tool_id,
            description=tool_step_request.description,
            resource_configs=tool_step_request.resource_configs,
            parameter_mapping=tool_step_request.parameter_mapping,
            result_mapping=tool_step_request.result_mapping,
            validation_errors=tool_step_request.validation_errors
        )
        return tool_step
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{hop_id}/tool-steps", response_model=List[ToolStep])
async def get_hop_tool_steps(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Get all tool steps for a hop"""
    try:
        tool_step_service = ToolStepService(db)
        tool_steps = await tool_step_service.get_tool_steps_by_hop(hop_id, current_user.user_id)
        return tool_steps
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{hop_id}")
async def delete_hop(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Delete a hop"""
    try:
        hop_service = HopService(db)
        success = await hop_service.delete_hop(hop_id, current_user.user_id)
        if not success:
            raise HTTPException(status_code=404, detail="Hop not found")
        return {"message": "Hop deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{hop_id}/reorder-tool-steps")
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


@router.post("/{hop_id}/execute", response_model=HopExecutionResponse)
async def execute_hop(
    hop_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(validate_token)
):
    """Execute all tool steps in a hop sequentially"""
    import logging
    logger = logging.getLogger(__name__)
    
    # Force immediate log to see if this endpoint is even being called
    print(f"ROUTER DEBUG: execute_hop endpoint called for hop_id={hop_id}")
    logger.error(f"ROUTER DEBUG: execute_hop endpoint called for hop_id={hop_id}")
    
    logger.info(f"Hop execution endpoint called", extra={
        "hop_id": hop_id,
        "user_id": current_user.user_id,
        "endpoint": "POST /api/hops/{hop_id}/execute"
    })
    
    try:
        hop_service = HopService(db)
        logger.info(f"Calling hop_service.execute_hop", extra={"hop_id": hop_id})
        result = await hop_service.execute_hop(hop_id, current_user.user_id)
        logger.info(f"Hop service returned result", extra={"hop_id": hop_id, "success": result.get('success')})
        return result
    except Exception as e:
        logger.error(f"Exception in hop execution endpoint", extra={
            "hop_id": hop_id,
            "user_id": current_user.user_id,
            "error": str(e),
            "exception_type": type(e).__name__
        })
        raise HTTPException(status_code=500, detail=str(e)) 