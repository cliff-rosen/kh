"""
User API endpoints for user profile management.
Accessed via the profile icon in the top nav.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
import logging

from database import get_db
from models import User
from schemas.user import User as UserSchema
from services import auth_service
from services.user_service import UserService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


# ============== Request Schemas ==============

class UserUpdate(BaseModel):
    """Request schema for updating user profile."""
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)


# ============== Endpoints ==============

@router.get(
    "/me",
    response_model=UserSchema,
    summary="Get current user profile"
)
async def get_current_user(
    current_user: User = Depends(auth_service.validate_token),
    db: Session = Depends(get_db)
):
    """
    Get the current user's profile information.
    This is the main endpoint for the profile page.
    """
    return UserSchema.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserSchema,
    summary="Update current user profile"
)
async def update_current_user(
    updates: UserUpdate,
    current_user: User = Depends(auth_service.validate_token),
    db: Session = Depends(get_db)
):
    """
    Update the current user's profile.

    Updateable fields:
    - full_name: User's display name
    - job_title: User's job title
    """
    user_service = UserService(db)

    update_dict = updates.model_dump(exclude_unset=True)
    if not update_dict:
        # No updates provided, return current user
        return UserSchema.model_validate(current_user)

    updated_user = user_service.update_user(
        user_id=current_user.user_id,
        updates=update_dict,
        updated_by=current_user
    )

    return UserSchema.model_validate(updated_user)
