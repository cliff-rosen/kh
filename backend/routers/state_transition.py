"""
State Transition API Router

Provides endpoints for triggering state transitions through the StateTransitionService.
These endpoints are used by frontend approval actions (not chat-based actions).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Dict, Any

from database import get_db
from services.auth_service import validate_token
from services.state_transition_service import StateTransitionService, get_state_transition_service, TransactionType, StateTransitionError


router = APIRouter(prefix="/state-transitions", tags=["state-transitions"])


class StateTransitionRequest(BaseModel):
    """Request model for state transitions"""
    transaction_type: str
    data: Dict[str, Any]


class StateTransitionResponse(BaseModel):
    """Response model for state transitions"""
    success: bool
    entity_id: str
    status: str
    message: str
    metadata: Dict[str, Any] = {}


@router.post("/execute", response_model=StateTransitionResponse)
async def execute_state_transition(
    request: StateTransitionRequest,
    current_user = Depends(validate_token),
    state_transition_service: StateTransitionService = Depends(get_state_transition_service)
) -> StateTransitionResponse:
    """
    Execute a state transition using the StateTransitionService.
    
    This endpoint is used by frontend approval actions that need to trigger
    state transitions directly (not through chat).
    """
    try:
        # Validate transaction type
        try:
            transaction_type = TransactionType(request.transaction_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid transaction type: {request.transaction_type}"
            )
        
        # Add user_id to the request data
        transaction_data = {
            **request.data,
            "user_id": current_user.user_id
        }
        
        # Execute the state transition
        result = await state_transition_service.updateState(transaction_type, transaction_data)
        
        return StateTransitionResponse(
            success=result.success,
            entity_id=result.entity_id,
            status=result.status,
            message=result.message,
            metadata=result.metadata
        )
        
    except StateTransitionError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/accept-mission/{mission_id}", response_model=StateTransitionResponse)
async def accept_mission(
    mission_id: str,
    current_user = Depends(validate_token),
    state_transition_service: StateTransitionService = Depends(get_state_transition_service)
) -> StateTransitionResponse:
    """
    Accept a mission proposal (step 1.2).
    
    Convenience endpoint for mission approval that doesn't require building the full request.
    """
    try:
        result = await state_transition_service.updateState(
            TransactionType.ACCEPT_MISSION,
            {
                "mission_id": mission_id,
                "user_id": current_user.user_id
            }
        )
        
        return StateTransitionResponse(
            success=result.success,
            entity_id=result.entity_id,
            status=result.status,
            message=result.message,
            metadata=result.metadata
        )
        
    except StateTransitionError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/accept-hop-plan/{hop_id}", response_model=StateTransitionResponse)
async def accept_hop_plan(
    hop_id: str,
    current_user = Depends(validate_token),
    state_transition_service: StateTransitionService = Depends(get_state_transition_service)
) -> StateTransitionResponse:
    """
    Accept a hop plan proposal (steps 2.3, 3.3).
    
    Convenience endpoint for hop plan approval.
    """
    try:
        result = await state_transition_service.updateState(
            TransactionType.ACCEPT_HOP_PLAN,
            {
                "hop_id": hop_id,
                "user_id": current_user.user_id
            }
        )
        
        return StateTransitionResponse(
            success=result.success,
            entity_id=result.entity_id,
            status=result.status,
            message=result.message,
            metadata=result.metadata
        )
        
    except StateTransitionError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )


@router.post("/accept-hop-implementation/{hop_id}", response_model=StateTransitionResponse)
async def accept_hop_implementation(
    hop_id: str,
    current_user = Depends(validate_token),
    state_transition_service: StateTransitionService = Depends(get_state_transition_service)
) -> StateTransitionResponse:
    """
    Accept a hop implementation proposal (steps 2.6, 3.6).
    
    Convenience endpoint for hop implementation approval.
    """
    try:
        result = await state_transition_service.updateState(
            TransactionType.ACCEPT_HOP_IMPL,
            {
                "hop_id": hop_id,
                "user_id": current_user.user_id
            }
        )
        
        return StateTransitionResponse(
            success=result.success,
            entity_id=result.entity_id,
            status=result.status,
            message=result.message,
            metadata=result.metadata
        )
        
    except StateTransitionError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )