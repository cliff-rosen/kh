"""
Profile API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
from pydantic import BaseModel
from typing import List, Optional

from database import get_db
from models import User

from schemas.profile import UserProfile, CompanyProfile, ProfileCompletenessStatus
from routers.auth import get_current_user
from services.profile_service import ProfileService

# Request/Response types for this API
class UserProfileUpdateRequest(BaseModel):
    """User profile update request"""
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    preferences: Optional[str] = None


class CompanyProfileUpdateRequest(BaseModel):
    """Company profile update request"""
    company_name: Optional[str] = None
    therapeutic_areas: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    pipeline_products: Optional[str] = None


class FullProfileResponse(BaseModel):
    """Response containing both user and company profiles for current user"""
    user: UserProfile
    company: CompanyProfile


router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.get("/user", response_model=UserProfile)
async def get_user_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's profile"""
    service = ProfileService(db)
    profile = service.get_user_profile(current_user.user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found"
        )
    return profile


@router.put("/user", response_model=UserProfile)
async def update_user_profile(
    request: UserProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user profile"""
    service = ProfileService(db)

    # Prepare update data (only non-None values)
    update_data = {k: v for k, v in request.dict().items() if v is not None}

    try:
        return service.update_user_profile(current_user.user_id, update_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.get("/company", response_model=CompanyProfile)
async def get_company_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's company profile"""
    service = ProfileService(db)
    profile = service.get_company_profile(current_user.user_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company profile not found"
        )
    return profile


@router.put("/company", response_model=CompanyProfile)
async def update_company_profile(
    request: CompanyProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update company profile"""
    service = ProfileService(db)

    # Prepare update data (only non-None values)
    update_data = {k: v for k, v in request.dict().items() if v is not None}

    return service.update_company_profile(current_user.user_id, update_data)


@router.get("/completeness", response_model=ProfileCompletenessStatus)
async def check_profile_completeness(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Check if user and company profiles are complete enough to create research streams"""
    service = ProfileService(db)
    return service.check_profile_completeness(current_user.user_id)


@router.get("/full", response_model=FullProfileResponse)
async def get_full_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get both user and company profiles for current user in one call"""
    service = ProfileService(db)
    profiles = service.get_full_profile(current_user.user_id)
    return FullProfileResponse(user=profiles['user'], company=profiles['company'])