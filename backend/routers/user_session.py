"""
User Session Router

This router handles all HTTP endpoints for user session management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from database import get_db
from models import User

from schemas.user_session import UserSessionStatus

from services.auth_service import validate_token
from services.user_session_service import UserSessionService

router = APIRouter(prefix="/sessions", tags=["sessions"])


# Request/Response models for user session endpoints
class CreateUserSessionRequest(BaseModel):
    """Request to create a new user session"""
    name: Optional[str] = Field(default=None, description="Name for the new session (auto-generated if not provided)")
    session_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional metadata")


class UpdateUserSessionRequest(BaseModel):
    """Request to update an existing user session"""
    name: Optional[str] = Field(default=None, description="Updated name")
    status: Optional[UserSessionStatus] = Field(default=None, description="Updated status")
    mission_id: Optional[str] = Field(default=None, description="Updated mission ID")
    session_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Updated metadata")


class UserSessionLightweightResponse(BaseModel):
    """Lightweight response containing just session pointers/IDs"""
    id: str = Field(description="Session ID")
    user_id: int = Field(description="User ID")
    name: Optional[str] = Field(description="Session name")
    chat_id: str = Field(description="Associated chat ID")
    mission_id: Optional[str] = Field(default=None, description="Associated mission ID if exists")
    session_metadata: Dict[str, Any] = Field(default_factory=dict, description="Session metadata")


@router.post("/initialize", response_model=UserSessionLightweightResponse)
async def initialize_session(
    request: CreateUserSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
) -> UserSessionLightweightResponse:
    """Create new session with fresh chat when none exists"""
    service = UserSessionService(db)
    try:
        response = service.create_user_session(current_user.user_id, request)
        # Return lightweight response - just the pointers
        return UserSessionLightweightResponse(
            id=response.user_session.id,
            user_id=response.user_session.user_id,
            name=response.user_session.name,
            chat_id=response.chat.id,
            mission_id=response.user_session.mission.id if response.user_session.mission else None,
            session_metadata=response.user_session.session_metadata
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/active", response_model=UserSessionLightweightResponse)
async def get_active_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
) -> UserSessionLightweightResponse:
    """Get the user's current active session - returns lightweight pointers"""
    service = UserSessionService(db)
    session = service.get_active_session(current_user.user_id)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active session found"
        )
    
    # Return just the pointers - no heavy relationship loading
    return UserSessionLightweightResponse(
        id=session.id,
        user_id=session.user_id,
        name=session.name,
        chat_id=session.chat_id,
        mission_id=session.mission_id,
        session_metadata=session.session_metadata
    )


@router.put("/{session_id}", response_model=UserSessionLightweightResponse)
async def update_session(
    session_id: str,
    request: UpdateUserSessionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
) -> UserSessionLightweightResponse:
    """Update an existing user session - returns lightweight response"""
    service = UserSessionService(db)
    session = service.update_user_session_lightweight(current_user.user_id, session_id, request)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return UserSessionLightweightResponse(
        id=session.id,
        user_id=session.user_id,
        name=session.name,
        chat_id=session.chat_id,
        mission_id=session.mission_id,
        session_metadata=session.session_metadata
    ) 