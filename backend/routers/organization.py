"""
Organization API endpoints for multi-tenancy support.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging

from database import get_db
from models import User, UserRole
from services import auth_service
from services.organization_service import OrganizationService
from schemas.organization import (
    Organization, OrganizationUpdate, OrgMember, OrgMemberUpdate
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/org", tags=["organization"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


@router.get(
    "",
    response_model=Organization,
    summary="Get current user's organization"
)
async def get_organization(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get the current user's organization details."""
    service = OrganizationService(db)
    org = service.get_organization_for_user(current_user)

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with an organization"
        )

    return org


@router.put(
    "",
    response_model=Organization,
    summary="Update organization"
)
async def update_organization(
    update_data: OrganizationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update the current user's organization. Requires org admin role."""
    service = OrganizationService(db)
    service.require_org_admin(current_user, current_user.org_id)

    org = service.update_organization(current_user.org_id, update_data)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    return Organization.model_validate(org)


@router.get(
    "/members",
    response_model=List[OrgMember],
    summary="List organization members"
)
async def list_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all members of the current user's organization."""
    if not current_user.org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User is not associated with an organization"
        )

    service = OrganizationService(db)
    return service.get_org_members(current_user.org_id)


@router.put(
    "/members/{user_id}",
    response_model=OrgMember,
    summary="Update member role"
)
async def update_member_role(
    user_id: int,
    update_data: OrgMemberUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a member's role. Requires org admin role."""
    service = OrganizationService(db)
    service.require_org_admin(current_user, current_user.org_id)

    member = service.update_member_role(
        current_user.org_id,
        user_id,
        update_data.role,
        current_user
    )

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in organization"
        )

    return member


@router.delete(
    "/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove member from organization"
)
async def remove_member(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove a member from the organization. Requires org admin role."""
    service = OrganizationService(db)
    service.require_org_admin(current_user, current_user.org_id)

    success = service.remove_member(current_user.org_id, user_id, current_user)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in organization"
        )
