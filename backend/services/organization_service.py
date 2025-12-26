"""
Organization service for multi-tenancy support.
Handles organization management, member management, and access control.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import HTTPException, status

from models import (
    Organization, User, ResearchStream, UserRole,
    OrgStreamSubscription, UserStreamSubscription, StreamScope
)
from schemas.organization import (
    OrganizationCreate, OrganizationUpdate, Organization as OrgSchema,
    OrganizationWithStats, OrgMember, OrgMemberUpdate
)

logger = logging.getLogger(__name__)


class OrganizationService:
    """Service for managing organizations and their members."""

    def __init__(self, db: Session):
        self.db = db

    # ==================== Organization CRUD ====================

    def get_organization(self, org_id: int) -> Optional[Organization]:
        """Get an organization by ID."""
        return self.db.query(Organization).filter(
            Organization.org_id == org_id
        ).first()

    def get_organization_for_user(self, user: User) -> Optional[OrgSchema]:
        """Get the organization for a user."""
        if not user.org_id:
            return None

        org = self.get_organization(user.org_id)
        if not org:
            return None

        return OrgSchema.model_validate(org)

    def get_organization_with_stats(self, org_id: int) -> Optional[OrganizationWithStats]:
        """Get organization with member and stream counts."""
        org = self.get_organization(org_id)
        if not org:
            return None

        member_count = self.db.query(func.count(User.user_id)).filter(
            User.org_id == org_id
        ).scalar()

        stream_count = self.db.query(func.count(ResearchStream.stream_id)).filter(
            and_(
                ResearchStream.org_id == org_id,
                ResearchStream.scope == StreamScope.ORGANIZATION
            )
        ).scalar()

        return OrganizationWithStats(
            org_id=org.org_id,
            name=org.name,
            is_active=org.is_active,
            created_at=org.created_at,
            updated_at=org.updated_at,
            member_count=member_count or 0,
            stream_count=stream_count or 0
        )

    def create_organization(self, data: OrganizationCreate) -> Organization:
        """Create a new organization (platform admin only)."""
        org = Organization(
            name=data.name,
            is_active=True
        )
        self.db.add(org)
        self.db.commit()
        self.db.refresh(org)
        logger.info(f"Created organization: {org.org_id} - {org.name}")
        return org

    def update_organization(self, org_id: int, data: OrganizationUpdate) -> Optional[Organization]:
        """Update an organization."""
        org = self.get_organization(org_id)
        if not org:
            return None

        if data.name is not None:
            org.name = data.name
        if data.is_active is not None:
            org.is_active = data.is_active

        self.db.commit()
        self.db.refresh(org)
        logger.info(f"Updated organization: {org.org_id}")
        return org

    def list_organizations(self, include_inactive: bool = False) -> List[OrganizationWithStats]:
        """List all organizations (platform admin only)."""
        query = self.db.query(Organization)
        if not include_inactive:
            query = query.filter(Organization.is_active == True)

        orgs = query.order_by(Organization.name).all()

        result = []
        for org in orgs:
            stats = self.get_organization_with_stats(org.org_id)
            if stats:
                result.append(stats)

        return result

    # ==================== Member Management ====================

    def get_org_members(self, org_id: int) -> List[OrgMember]:
        """Get all members of an organization."""
        members = self.db.query(User).filter(
            User.org_id == org_id
        ).order_by(User.full_name, User.email).all()

        return [
            OrgMember(
                user_id=m.user_id,
                email=m.email,
                full_name=m.full_name,
                role=m.role,
                joined_at=m.created_at
            )
            for m in members
        ]

    def update_member_role(
        self,
        org_id: int,
        user_id: int,
        new_role: UserRole,
        acting_user: User
    ) -> Optional[OrgMember]:
        """Update a member's role (org admin only)."""
        # Verify the target user is in the same org
        target_user = self.db.query(User).filter(
            and_(
                User.user_id == user_id,
                User.org_id == org_id
            )
        ).first()

        if not target_user:
            return None

        # Prevent demoting yourself if you're the only org_admin
        if target_user.user_id == acting_user.user_id and new_role != UserRole.ORG_ADMIN:
            admin_count = self.db.query(func.count(User.user_id)).filter(
                and_(
                    User.org_id == org_id,
                    User.role == UserRole.ORG_ADMIN
                )
            ).scalar()

            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote the only org admin"
                )

        # Don't allow changing platform admin roles through this endpoint
        if target_user.role == UserRole.PLATFORM_ADMIN or new_role == UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify platform admin roles"
            )

        target_user.role = new_role
        self.db.commit()
        self.db.refresh(target_user)

        logger.info(f"Updated role for user {user_id} to {new_role}")

        return OrgMember(
            user_id=target_user.user_id,
            email=target_user.email,
            full_name=target_user.full_name,
            role=target_user.role,
            joined_at=target_user.created_at
        )

    def remove_member(self, org_id: int, user_id: int, acting_user: User) -> bool:
        """Remove a member from an organization."""
        # Can't remove yourself
        if user_id == acting_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove yourself from the organization"
            )

        target_user = self.db.query(User).filter(
            and_(
                User.user_id == user_id,
                User.org_id == org_id
            )
        ).first()

        if not target_user:
            return False

        # Don't allow removing platform admins
        if target_user.role == UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot remove platform admin"
            )

        # For now, we'll just clear their org_id (soft removal)
        # In production, you might want to handle this differently
        target_user.org_id = None
        self.db.commit()

        logger.info(f"Removed user {user_id} from org {org_id}")
        return True

    # ==================== Access Control Helpers ====================

    def user_can_manage_org(self, user: User, org_id: int) -> bool:
        """Check if user can manage an organization."""
        if user.role == UserRole.PLATFORM_ADMIN:
            return True
        if user.role == UserRole.ORG_ADMIN and user.org_id == org_id:
            return True
        return False

    def user_is_platform_admin(self, user: User) -> bool:
        """Check if user is a platform admin."""
        return user.role == UserRole.PLATFORM_ADMIN

    def user_is_org_admin(self, user: User) -> bool:
        """Check if user is an org admin (or platform admin)."""
        return user.role in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN)

    def require_platform_admin(self, user: User):
        """Raise 403 if user is not a platform admin."""
        if not self.user_is_platform_admin(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Platform admin access required"
            )

    def require_org_admin(self, user: User, org_id: int):
        """Raise 403 if user cannot manage the specified org."""
        if not self.user_can_manage_org(user, org_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization admin access required"
            )
