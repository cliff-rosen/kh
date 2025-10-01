"""
Profile-related schemas for Knowledge Horizon
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


class UserProfile(BaseModel):
    """User profile business object"""
    user_id: int
    email: str
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    preferences: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CompanyProfile(BaseModel):
    """Company profile business object"""
    company_id: int
    user_id: int
    company_name: Optional[str] = None
    therapeutic_areas: List[str] = []
    competitors: List[str] = []
    pipeline_products: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ProfileCompletenessStatus(BaseModel):
    """Profile completeness status"""
    user_profile_complete: bool
    company_profile_complete: bool
    missing_user_fields: List[str]
    missing_company_fields: List[str]
    can_create_research_stream: bool