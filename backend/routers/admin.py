"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from database import get_db
from models import User, UserRole, Organization, ResearchStream, StreamScope
from services import auth_service
from services.organization_service import OrganizationService
from schemas.organization import (
    Organization as OrgSchema,
    OrganizationUpdate,
    OrganizationWithStats
)
from schemas.research_stream import ResearchStream as StreamSchema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required"
        )
    return current_user


# ==================== Organization Management ====================

@router.get(
    "/orgs",
    response_model=List[OrganizationWithStats],
    summary="List all organizations"
)
async def list_all_organizations(
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get all organizations with member counts. Platform admin only."""
    service = OrganizationService(db)
    return service.get_all_organizations()


@router.post(
    "/orgs",
    response_model=OrgSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization"
)
async def create_organization(
    name: str,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Create a new organization. Platform admin only."""
    service = OrganizationService(db)
    return service.create_organization(name, current_user.user_id)


@router.get(
    "/orgs/{org_id}",
    response_model=OrganizationWithStats,
    summary="Get organization details"
)
async def get_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get organization details by ID. Platform admin only."""
    service = OrganizationService(db)
    org = service.get_organization_by_id(org_id)

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    return org


@router.put(
    "/orgs/{org_id}",
    response_model=OrgSchema,
    summary="Update organization"
)
async def update_organization(
    org_id: int,
    update_data: OrganizationUpdate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Update an organization. Platform admin only."""
    service = OrganizationService(db)
    org = service.update_organization(org_id, update_data)

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    return OrgSchema.model_validate(org)


@router.delete(
    "/orgs/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete organization"
)
async def delete_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Delete an organization. Platform admin only.
    Will fail if organization has members.
    """
    service = OrganizationService(db)
    success = service.delete_organization(org_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete organization. It may have members or not exist."
        )


@router.put(
    "/orgs/{org_id}/members/{user_id}",
    summary="Move user to organization"
)
async def assign_user_to_org(
    org_id: int,
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Assign a user to an organization. Platform admin only."""
    # Verify org exists
    org = db.query(Organization).filter(Organization.org_id == org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    # Verify user exists
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update user's org
    user.org_id = org_id
    db.commit()

    return {"status": "success", "user_id": user_id, "org_id": org_id}


# ==================== Global Stream Management ====================

@router.get(
    "/streams",
    response_model=List[StreamSchema],
    summary="List all global streams"
)
async def list_global_streams(
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get all global streams. Platform admin only."""
    streams = db.query(ResearchStream).filter(
        ResearchStream.scope == StreamScope.GLOBAL
    ).all()

    return [StreamSchema.model_validate(s) for s in streams]


@router.put(
    "/streams/{stream_id}/scope",
    response_model=StreamSchema,
    summary="Update stream scope to global"
)
async def set_stream_scope_global(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Change an existing stream's scope to global.
    Platform admin only. Use this to promote any stream to global scope.
    """
    stream = db.query(ResearchStream).filter(
        ResearchStream.stream_id == stream_id
    ).first()

    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stream not found"
        )

    # Update scope to global
    stream.scope = StreamScope.GLOBAL
    stream.org_id = None  # Global streams don't belong to an org

    db.commit()
    db.refresh(stream)

    return StreamSchema.model_validate(stream)


@router.delete(
    "/streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a global stream"
)
async def delete_global_stream(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Delete a global stream. Platform admin only."""
    stream = db.query(ResearchStream).filter(
        ResearchStream.stream_id == stream_id,
        ResearchStream.scope == StreamScope.GLOBAL
    ).first()

    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Global stream not found"
        )

    db.delete(stream)
    db.commit()


# ==================== User Management ====================

@router.get(
    "/users",
    summary="List all users"
)
async def list_all_users(
    org_id: Optional[int] = None,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get all users, optionally filtered by organization. Platform admin only."""
    query = db.query(User)

    if org_id is not None:
        query = query.filter(User.org_id == org_id)

    users = query.all()

    return [
        {
            "user_id": u.user_id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role.value,
            "org_id": u.org_id,
            "registration_date": u.registration_date
        }
        for u in users
    ]


@router.put(
    "/users/{user_id}/role",
    summary="Update user role"
)
async def update_user_role(
    user_id: int,
    new_role: UserRole,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Update any user's role. Platform admin only."""
    user = db.query(User).filter(User.user_id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent removing the last platform admin
    if user.role == UserRole.PLATFORM_ADMIN and new_role != UserRole.PLATFORM_ADMIN:
        admin_count = db.query(User).filter(User.role == UserRole.PLATFORM_ADMIN).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last platform admin"
            )

    user.role = new_role
    db.commit()

    return {
        "user_id": user.user_id,
        "email": user.email,
        "role": user.role.value
    }
