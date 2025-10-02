"""
Profile service for managing user and company profiles
"""

from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime

from models import User, CompanyProfile
from schemas.profile import UserProfile, CompanyProfile as CompanyProfileSchema, ProfileCompletenessStatus


class ProfileService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_profile(self, user_id: int) -> Optional[UserProfile]:
        """Get user profile information"""
        user = self.db.query(User).filter(User.user_id == user_id).first()
        if not user:
            return None

        # Get job_title from company profile if it exists
        company_profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.user_id == user_id
        ).first()

        return UserProfile(
            user_id=user.user_id,
            email=user.email,
            full_name=user.full_name,
            job_title=company_profile.job_title if company_profile else None,
            preferences=None,  # Not implemented yet
            created_at=user.created_at,
            updated_at=user.updated_at
        )

    def get_company_profile(self, user_id: int) -> Optional[CompanyProfileSchema]:
        """Get company profile information"""
        company_profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.user_id == user_id
        ).first()

        if not company_profile:
            return None

        return CompanyProfileSchema(
            company_id=company_profile.profile_id,
            user_id=company_profile.user_id,
            company_name=company_profile.company_name,
            therapeutic_areas=company_profile.therapeutic_areas or [],
            competitors=company_profile.competitors or [],
            pipeline_products=str(company_profile.pipeline_products) if company_profile.pipeline_products else None,
            created_at=company_profile.created_at,
            updated_at=company_profile.updated_at
        )

    def update_user_profile(self, user_id: int, updates: Dict[str, Any]) -> UserProfile:
        """Update user profile"""
        user = self.db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise ValueError(f"User with ID {user_id} not found")

        # Update user fields
        if 'full_name' in updates:
            user.full_name = updates['full_name']

        user.updated_at = datetime.utcnow()

        # Handle job_title - it goes to company profile
        if 'job_title' in updates:
            company_profile = self.db.query(CompanyProfile).filter(
                CompanyProfile.user_id == user_id
            ).first()

            if not company_profile:
                # Create company profile if it doesn't exist
                company_profile = CompanyProfile(
                    user_id=user_id,
                    company_name="",  # Will be updated later
                    job_title=updates['job_title'],
                    therapeutic_areas=[],
                    competitors=[],
                    pipeline_products=[],
                    company_metadata={}
                )
                self.db.add(company_profile)
            else:
                company_profile.job_title = updates['job_title']
                company_profile.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return self.get_user_profile(user_id)

    def update_company_profile(self, user_id: int, updates: Dict[str, Any]) -> CompanyProfileSchema:
        """Update company profile"""
        company_profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.user_id == user_id
        ).first()

        if not company_profile:
            # Create new company profile
            company_profile = CompanyProfile(
                user_id=user_id,
                company_name=updates.get('company_name', ''),
                job_title=updates.get('job_title', ''),
                therapeutic_areas=updates.get('therapeutic_areas', []),
                competitors=updates.get('competitors', []),
                pipeline_products=updates.get('pipeline_products', []),
                company_metadata={}
            )
            self.db.add(company_profile)
        else:
            # Update existing fields
            for field, value in updates.items():
                if hasattr(company_profile, field):
                    setattr(company_profile, field, value)
            company_profile.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(company_profile)

        return self.get_company_profile(user_id)

    def check_profile_completeness(self, user_id: int) -> ProfileCompletenessStatus:
        """Check if user and company profiles are complete"""
        user = self.db.query(User).filter(User.user_id == user_id).first()
        company_profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.user_id == user_id
        ).first()

        missing_user_fields = []
        missing_company_fields = []

        # Check user profile completeness
        if not user.full_name:
            missing_user_fields.append('full_name')

        # Check job_title from company profile
        if not company_profile or not company_profile.job_title:
            missing_user_fields.append('job_title')

        # Check company profile completeness
        if not company_profile:
            missing_company_fields.extend(['company_name', 'therapeutic_areas', 'competitors'])
        else:
            if not company_profile.company_name:
                missing_company_fields.append('company_name')
            if not company_profile.therapeutic_areas or len(company_profile.therapeutic_areas) == 0:
                missing_company_fields.append('therapeutic_areas')
            if not company_profile.competitors or len(company_profile.competitors) == 0:
                missing_company_fields.append('competitors')

        user_profile_complete = len(missing_user_fields) == 0
        company_profile_complete = len(missing_company_fields) == 0
        can_create_research_stream = user_profile_complete and company_profile_complete

        return ProfileCompletenessStatus(
            user_profile_complete=user_profile_complete,
            company_profile_complete=company_profile_complete,
            missing_user_fields=missing_user_fields,
            missing_company_fields=missing_company_fields,
            can_create_research_stream=can_create_research_stream
        )

    def get_full_profile(self, user_id: int) -> Dict[str, Any]:
        """Get both user and company profiles for current user"""
        user_profile = self.get_user_profile(user_id)
        company_profile = self.get_company_profile(user_id)

        return {
            "user": user_profile,
            "company": company_profile
        }