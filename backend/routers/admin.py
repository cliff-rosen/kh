"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime
import logging

from database import get_db
from config.settings import settings
from models import User, UserRole
from services import auth_service
from services.organization_service import OrganizationService
from services.user_service import UserService
from services.subscription_service import SubscriptionService
from services.invitation_service import InvitationService
from services.research_stream_service import ResearchStreamService
from schemas.organization import (
    Organization as OrgSchema,
    OrganizationUpdate,
    OrganizationWithStats,
    StreamSubscriptionStatus
)
from schemas.research_stream import ResearchStream as StreamSchema
from schemas.user import UserRole as UserRoleSchema, User as UserSchema, UserList

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
    logger.info(f"list_all_organizations - admin_user_id={current_user.user_id}")

    try:
        service = OrganizationService(db)
        orgs = service.list_organizations(include_inactive=True)

        logger.info(f"list_all_organizations complete - admin_user_id={current_user.user_id}, count={len(orgs)}")
        return orgs

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_organizations failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list organizations: {str(e)}"
        )


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
    logger.info(f"create_organization - admin_user_id={current_user.user_id}, name={name}")

    try:
        from schemas.organization import OrganizationCreate
        service = OrganizationService(db)
        org = service.create_organization(OrganizationCreate(name=name))

        logger.info(f"create_organization complete - admin_user_id={current_user.user_id}, org_id={org.org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_organization failed - admin_user_id={current_user.user_id}, name={name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization: {str(e)}"
        )


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
    logger.info(f"get_organization - admin_user_id={current_user.user_id}, org_id={org_id}")

    try:
        service = OrganizationService(db)
        org = service.get_organization_with_stats(org_id)

        if not org:
            logger.warning(f"get_organization - not found - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        logger.info(f"get_organization complete - admin_user_id={current_user.user_id}, org_id={org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_organization failed - admin_user_id={current_user.user_id}, org_id={org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get organization: {str(e)}"
        )


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
    logger.info(f"update_organization - admin_user_id={current_user.user_id}, org_id={org_id}")

    try:
        service = OrganizationService(db)
        org = service.update_organization(org_id, update_data)

        if not org:
            logger.warning(f"update_organization - not found - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        logger.info(f"update_organization complete - admin_user_id={current_user.user_id}, org_id={org_id}")
        return OrgSchema.model_validate(org)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_organization failed - admin_user_id={current_user.user_id}, org_id={org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update organization: {str(e)}"
        )


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
    logger.info(f"delete_organization - admin_user_id={current_user.user_id}, org_id={org_id}")

    try:
        service = OrganizationService(db)
        success = service.delete_organization(org_id)

        if not success:
            logger.warning(f"delete_organization - cannot delete - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete organization. It may have members or not exist."
            )

        logger.info(f"delete_organization complete - admin_user_id={current_user.user_id}, org_id={org_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_organization failed - admin_user_id={current_user.user_id}, org_id={org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete organization: {str(e)}"
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
    logger.info(f"assign_user_to_org - admin_user_id={current_user.user_id}, user_id={user_id}, org_id={org_id}")

    try:
        user_service = UserService(db)
        user = user_service.assign_to_org(user_id, org_id, current_user)

        logger.info(f"assign_user_to_org complete - admin_user_id={current_user.user_id}, user_id={user_id}, org_id={org_id}")
        return {"status": "success", "user_id": user.user_id, "org_id": user.org_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_user_to_org failed - admin_user_id={current_user.user_id}, user_id={user_id}, org_id={org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign user to organization: {str(e)}"
        )


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
    logger.info(f"list_global_streams - admin_user_id={current_user.user_id}")

    try:
        service = ResearchStreamService(db)
        streams = service.list_global_streams()

        logger.info(f"list_global_streams complete - admin_user_id={current_user.user_id}, count={len(streams)}")
        return streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_global_streams failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global streams: {str(e)}"
        )


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
    logger.info(f"set_stream_scope_global - admin_user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        service = ResearchStreamService(db)
        stream = service.set_stream_scope_global(stream_id)

        if not stream:
            logger.warning(f"set_stream_scope_global - not found - admin_user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        logger.info(f"set_stream_scope_global complete - admin_user_id={current_user.user_id}, stream_id={stream_id}")
        return stream

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"set_stream_scope_global failed - admin_user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stream scope: {str(e)}"
        )


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
    logger.info(f"delete_global_stream - admin_user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        service = ResearchStreamService(db)
        success = service.delete_global_stream(stream_id)

        if not success:
            logger.warning(f"delete_global_stream - not found - admin_user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Global stream not found"
            )

        logger.info(f"delete_global_stream complete - admin_user_id={current_user.user_id}, stream_id={stream_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_global_stream failed - admin_user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete global stream: {str(e)}"
        )


# ==================== User Management ====================

@router.get(
    "/users",
    response_model=UserList,
    summary="List all users"
)
async def list_all_users(
    org_id: Optional[int] = None,
    role: Optional[UserRoleSchema] = None,
    is_active: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get all users with optional filters. Platform admin only."""
    logger.info(f"list_all_users - admin_user_id={current_user.user_id}, org_id={org_id}, role={role}, limit={limit}")

    try:
        user_service = UserService(db)
        users, total = user_service.list_users(
            org_id=org_id,
            role=role,
            is_active=is_active,
            limit=limit,
            offset=offset
        )

        logger.info(f"list_all_users complete - admin_user_id={current_user.user_id}, total={total}, returned={len(users)}")
        return UserList(
            users=[UserSchema.model_validate(u) for u in users],
            total=total
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_users failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list users: {str(e)}"
        )


@router.put(
    "/users/{user_id}/role",
    response_model=UserSchema,
    summary="Update user role"
)
async def update_user_role(
    user_id: int,
    new_role: UserRoleSchema,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Update any user's role. Platform admin only."""
    logger.info(f"update_user_role - admin_user_id={current_user.user_id}, user_id={user_id}, new_role={new_role}")

    try:
        user_service = UserService(db)
        user = user_service.update_role(user_id, new_role, current_user)

        logger.info(f"update_user_role complete - admin_user_id={current_user.user_id}, user_id={user_id}, new_role={new_role}")
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_user_role failed - admin_user_id={current_user.user_id}, user_id={user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user role: {str(e)}"
        )


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a user"
)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Permanently delete a user from the system.
    Platform admin only. Cannot delete yourself or other platform admins.
    """
    logger.info(f"delete_user - admin_user_id={current_user.user_id}, user_id={user_id}")

    try:
        user_service = UserService(db)
        user_service.delete_user(user_id, current_user)

        logger.info(f"delete_user complete - admin_user_id={current_user.user_id}, user_id={user_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_user failed - admin_user_id={current_user.user_id}, user_id={user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}"
        )


# ==================== Invitation Management ====================

class InvitationCreate(BaseModel):
    """Request schema for creating an invitation."""
    email: EmailStr = Field(description="Email address to invite")
    org_id: Optional[int] = Field(default=None, description="Organization to assign user to (optional for platform_admin)")
    role: UserRoleSchema = Field(
        default=UserRoleSchema.MEMBER,
        description="Role to assign (member, org_admin, or platform_admin)"
    )
    expires_in_days: int = Field(default=7, ge=1, le=30, description="Days until expiration")


class InvitationResponse(BaseModel):
    """Response schema for invitation."""
    invitation_id: int
    email: str
    org_id: Optional[int] = None
    org_name: Optional[str] = None
    role: str
    token: str
    invite_url: str
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    is_revoked: bool = False
    inviter_email: Optional[str] = None

    class Config:
        from_attributes = True


class CreateUserRequest(BaseModel):
    """Request schema for directly creating a user."""
    email: EmailStr = Field(description="User's email address")
    password: str = Field(min_length=5, description="User's password")
    full_name: Optional[str] = Field(default=None, description="User's full name")
    org_id: int = Field(description="Organization to assign user to")
    role: UserRoleSchema = Field(
        default=UserRoleSchema.MEMBER,
        description="Role to assign"
    )


@router.get(
    "/invitations",
    response_model=List[InvitationResponse],
    summary="List all invitations"
)
async def list_invitations(
    org_id: Optional[int] = None,
    include_accepted: bool = False,
    include_expired: bool = False,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Get all invitations with optional filters. Platform admin only."""
    logger.info(f"list_invitations - admin_user_id={current_user.user_id}, org_id={org_id}")

    try:
        service = InvitationService(db)
        invitations = service.list_invitations(
            org_id=org_id,
            include_accepted=include_accepted,
            include_expired=include_expired
        )

        result = [InvitationResponse(**inv) for inv in invitations]

        logger.info(f"list_invitations complete - admin_user_id={current_user.user_id}, count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_invitations failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list invitations: {str(e)}"
        )


@router.post(
    "/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new invitation"
)
async def create_invitation(
    invitation: InvitationCreate,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Create an invitation for a new user.
    Returns an invitation token that can be used during registration.
    Platform admin only.
    """
    logger.info(f"create_invitation - admin_user_id={current_user.user_id}, email={invitation.email}, org_id={invitation.org_id}")

    try:
        user_service = UserService(db)

        # Check if email already registered
        existing_user = user_service.get_user_by_email(invitation.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists"
            )

        # Validate org_id based on role (non-platform_admin requires org)
        if invitation.role != UserRoleSchema.PLATFORM_ADMIN and not invitation.org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is required for non-platform-admin roles"
            )

        # Create invitation via service
        invitation_service = InvitationService(db)
        result = invitation_service.create_invitation(
            email=invitation.email,
            role=invitation.role.value,
            invited_by=current_user.user_id,
            org_id=invitation.org_id,
            expires_in_days=invitation.expires_in_days
        )

        logger.info(f"create_invitation complete - admin_user_id={current_user.user_id}, email={invitation.email}, org_id={invitation.org_id}")
        return InvitationResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_invitation failed - admin_user_id={current_user.user_id}, email={invitation.email}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create invitation: {str(e)}"
        )


@router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an invitation"
)
async def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """Revoke an invitation. Platform admin only."""
    logger.info(f"revoke_invitation - admin_user_id={current_user.user_id}, invitation_id={invitation_id}")

    try:
        service = InvitationService(db)
        success = service.revoke_invitation(invitation_id)

        if not success:
            logger.warning(f"revoke_invitation - not found - admin_user_id={current_user.user_id}, invitation_id={invitation_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found"
            )

        logger.info(f"revoke_invitation complete - admin_user_id={current_user.user_id}, invitation_id={invitation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"revoke_invitation failed - admin_user_id={current_user.user_id}, invitation_id={invitation_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke invitation: {str(e)}"
        )


@router.post(
    "/users/create",
    response_model=UserSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user directly"
)
async def create_user_directly(
    user_data: CreateUserRequest,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Create a user directly without invitation.
    Platform admin only.
    """
    logger.info(f"create_user_directly - admin_user_id={current_user.user_id}, email={user_data.email}, org_id={user_data.org_id}")

    try:
        # Verify organization exists
        org_service = OrganizationService(db)
        org = org_service.get_organization(user_data.org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        user_service = UserService(db)
        user = user_service.create_user(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name,
            role=user_data.role,
            org_id=user_data.org_id
        )

        logger.info(f"create_user_directly complete - admin_user_id={current_user.user_id}, new_user_id={user.user_id}, email={user.email}")
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_user_directly failed - admin_user_id={current_user.user_id}, email={user_data.email}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )


# ==================== Organization Stream Subscriptions ====================

@router.get(
    "/orgs/{org_id}/global-streams",
    response_model=List[StreamSubscriptionStatus],
    summary="List global streams with subscription status for an org"
)
async def list_org_global_stream_subscriptions(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Get all global streams with subscription status for the specified org.
    Platform admin only.
    """
    logger.info(f"list_org_global_stream_subscriptions - admin_user_id={current_user.user_id}, org_id={org_id}")

    try:
        # Verify organization exists
        org_service = OrganizationService(db)
        org = org_service.get_organization(org_id)
        if not org:
            logger.warning(f"list_org_global_stream_subscriptions - org not found - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        sub_service = SubscriptionService(db)
        result = sub_service.get_global_streams_for_org(org_id)

        logger.info(f"list_org_global_stream_subscriptions complete - admin_user_id={current_user.user_id}, org_id={org_id}, count={len(result.streams)}")
        return result.streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_org_global_stream_subscriptions failed - admin_user_id={current_user.user_id}, org_id={org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global stream subscriptions: {str(e)}"
        )


@router.post(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe an org to a global stream"
)
async def subscribe_org_to_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Subscribe an organization to a global stream.
    Platform admin only.
    """
    logger.info(f"subscribe_org_to_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}")

    try:
        # Verify organization exists
        org_service = OrganizationService(db)
        org = org_service.get_organization(org_id)
        if not org:
            logger.warning(f"subscribe_org_to_global_stream - org not found - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        # Verify global stream exists
        stream_service = ResearchStreamService(db)
        stream = stream_service.get_global_stream(stream_id)
        if not stream:
            logger.warning(f"subscribe_org_to_global_stream - stream not found - admin_user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Global stream not found"
            )

        sub_service = SubscriptionService(db)
        sub_service.subscribe_org_to_global_stream(org_id, stream_id, current_user.user_id)

        logger.info(f"subscribe_org_to_global_stream complete - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}")
        return {"status": "subscribed", "org_id": org_id, "stream_id": stream_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"subscribe_org_to_global_stream failed - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to subscribe to global stream: {str(e)}"
        )


@router.delete(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsubscribe an org from a global stream"
)
async def unsubscribe_org_from_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Unsubscribe an organization from a global stream.
    Platform admin only.
    """
    logger.info(f"unsubscribe_org_from_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}")

    try:
        sub_service = SubscriptionService(db)
        success = sub_service.unsubscribe_org_from_global_stream(org_id, stream_id)

        if not success:
            logger.warning(f"unsubscribe_org_from_global_stream - not found - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subscription not found"
            )

        logger.info(f"unsubscribe_org_from_global_stream complete - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"unsubscribe_org_from_global_stream failed - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unsubscribe from global stream: {str(e)}"
        )


# ==================== Chat System Configuration ====================

class PayloadTypeInfo(BaseModel):
    """Info about a registered payload type."""
    name: str
    description: str
    source: str
    is_global: bool
    parse_marker: Optional[str] = None
    has_parser: bool = False
    has_instructions: bool = False

    class Config:
        from_attributes = True


class ToolInfo(BaseModel):
    """Info about a registered tool."""
    name: str
    description: str
    category: str
    is_global: bool
    payload_type: Optional[str] = None
    streaming: bool = False

    class Config:
        from_attributes = True


class SubTabConfigInfo(BaseModel):
    """Info about a subtab configuration."""
    payloads: List[str]
    tools: List[str]


class TabConfigInfo(BaseModel):
    """Info about a tab configuration."""
    payloads: List[str]
    tools: List[str]
    subtabs: dict[str, SubTabConfigInfo] = {}


class PageConfigInfo(BaseModel):
    """Info about a page configuration."""
    page: str
    has_context_builder: bool
    payloads: List[str]
    tools: List[str]
    tabs: dict[str, TabConfigInfo]
    client_actions: List[str]


class StreamInstructionsInfo(BaseModel):
    """Info about a stream's chat instructions."""
    stream_id: int
    stream_name: str
    has_instructions: bool
    instructions_preview: Optional[str] = None  # First 200 chars


class ChatConfigResponse(BaseModel):
    """Complete chat system configuration."""
    payload_types: List[PayloadTypeInfo]
    tools: List[ToolInfo]
    pages: List[PageConfigInfo]
    stream_instructions: List[StreamInstructionsInfo]
    summary: dict


@router.get(
    "/chat-config",
    response_model=ChatConfigResponse,
    summary="Get chat system configuration"
)
async def get_chat_config(
    current_user: User = Depends(require_platform_admin),
    db: Session = Depends(get_db)
):
    """
    Get complete chat system configuration including all registered
    payload types, tools, page configurations, and stream-specific
    chat instructions. Platform admin only.
    """
    logger.info(f"get_chat_config - admin_user_id={current_user.user_id}")

    try:
        from schemas.payloads import get_all_payload_types
        from tools.registry import get_all_tools
        from services.chat_page_config import get_page_config
        from services.chat_page_config.registry import _page_registry

        # Get all payload types
        payload_types = []
        for pt in get_all_payload_types():
            payload_types.append(PayloadTypeInfo(
                name=pt.name,
                description=pt.description,
                source=pt.source,
                is_global=pt.is_global,
                parse_marker=pt.parse_marker,
                has_parser=pt.parser is not None,
                has_instructions=pt.llm_instructions is not None and len(pt.llm_instructions) > 0
            ))

        # Get all tools
        tools = []
        for tool in get_all_tools():
            tools.append(ToolInfo(
                name=tool.name,
                description=tool.description,
                category=tool.category,
                is_global=tool.is_global,
                payload_type=tool.payload_type,
                streaming=tool.streaming
            ))

        # Get all page configs
        pages = []
        for page_name, config in _page_registry.items():
            tabs_info = {}
            for tab_name, tab_config in config.tabs.items():
                # Build subtabs info
                subtabs_info = {}
                for subtab_name, subtab_config in tab_config.subtabs.items():
                    subtabs_info[subtab_name] = SubTabConfigInfo(
                        payloads=subtab_config.payloads,
                        tools=subtab_config.tools
                    )

                tabs_info[tab_name] = TabConfigInfo(
                    payloads=tab_config.payloads,
                    tools=tab_config.tools,
                    subtabs=subtabs_info
                )

            pages.append(PageConfigInfo(
                page=page_name,
                has_context_builder=config.context_builder is not None,
                payloads=config.payloads,
                tools=config.tools,
                tabs=tabs_info,
                client_actions=[ca.action for ca in config.client_actions]
            ))

        # Get all streams with their chat instructions status
        stream_service = ResearchStreamService(db)
        streams_data = stream_service.get_all_streams_with_chat_instructions()
        stream_instructions = [
            StreamInstructionsInfo(
                stream_id=s["stream_id"],
                stream_name=s["stream_name"],
                has_instructions=s["has_instructions"],
                instructions_preview=s["instructions_preview"]
            )
            for s in streams_data
        ]

        # Build summary
        streams_with_instructions = len([s for s in stream_instructions if s.has_instructions])
        summary = {
            "total_payload_types": len(payload_types),
            "global_payloads": len([p for p in payload_types if p.is_global]),
            "llm_payloads": len([p for p in payload_types if p.source == "llm"]),
            "tool_payloads": len([p for p in payload_types if p.source == "tool"]),
            "total_tools": len(tools),
            "global_tools": len([t for t in tools if t.is_global]),
            "total_pages": len(pages),
            "total_streams": len(stream_instructions),
            "streams_with_instructions": streams_with_instructions,
        }

        logger.info(f"get_chat_config complete - admin_user_id={current_user.user_id}, payloads={len(payload_types)}, tools={len(tools)}, pages={len(pages)}")
        return ChatConfigResponse(
            payload_types=payload_types,
            tools=tools,
            pages=pages,
            stream_instructions=stream_instructions,
            summary=summary
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_chat_config failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat config: {str(e)}"
        )
