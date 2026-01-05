"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime, timedelta
import secrets
import logging

from database import get_db
from config.settings import settings
from models import User, UserRole, Organization, ResearchStream, StreamScope, Invitation
from services import auth_service
from services.organization_service import OrganizationService
from services.user_service import UserService
from services.subscription_service import SubscriptionService
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
# NOTE: These endpoints have direct DB access which should be refactored to use services

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
        # TODO: Move to ResearchStreamService
        streams = db.query(ResearchStream).filter(
            ResearchStream.scope == StreamScope.GLOBAL
        ).all()

        logger.info(f"list_global_streams complete - admin_user_id={current_user.user_id}, count={len(streams)}")
        return [StreamSchema.model_validate(s) for s in streams]

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
        # TODO: Move to ResearchStreamService
        stream = db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            logger.warning(f"set_stream_scope_global - not found - admin_user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        # Update scope to global
        stream.scope = StreamScope.GLOBAL
        stream.org_id = None  # Global streams don't belong to an org

        db.commit()
        db.refresh(stream)

        logger.info(f"set_stream_scope_global complete - admin_user_id={current_user.user_id}, stream_id={stream_id}")
        return StreamSchema.model_validate(stream)

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
        # TODO: Move to ResearchStreamService
        stream = db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id,
            ResearchStream.scope == StreamScope.GLOBAL
        ).first()

        if not stream:
            logger.warning(f"delete_global_stream - not found - admin_user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Global stream not found"
            )

        db.delete(stream)
        db.commit()

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
        # TODO: Move to InvitationService
        query = db.query(Invitation)

        if org_id:
            query = query.filter(Invitation.org_id == org_id)

        if not include_accepted:
            query = query.filter(Invitation.accepted_at == None)

        if not include_expired:
            query = query.filter(Invitation.expires_at > datetime.utcnow())

        query = query.filter(Invitation.is_revoked == False)
        invitations = query.order_by(Invitation.created_at.desc()).all()

        user_service = UserService(db)
        result = []
        for inv in invitations:
            org = db.query(Organization).filter(Organization.org_id == inv.org_id).first() if inv.org_id else None
            inviter = user_service.get_user_by_id(inv.invited_by) if inv.invited_by else None

            result.append(InvitationResponse(
                invitation_id=inv.invitation_id,
                email=inv.email,
                org_id=inv.org_id,
                org_name=org.name if org else None,
                role=inv.role,
                token=inv.token,
                invite_url=f"{settings.FRONTEND_URL}/register?token={inv.token}",
                created_at=inv.created_at,
                expires_at=inv.expires_at,
                accepted_at=inv.accepted_at,
                is_revoked=inv.is_revoked,
                inviter_email=inviter.email if inviter else None
            ))

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

        # TODO: Move to InvitationService
        # Check if pending invitation exists
        existing_invite = db.query(Invitation).filter(
            Invitation.email == invitation.email,
            Invitation.accepted_at == None,
            Invitation.is_revoked == False,
            Invitation.expires_at > datetime.utcnow()
        ).first()

        if existing_invite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A pending invitation for this email already exists"
            )

        # Validate org_id based on role
        org = None
        if invitation.role == UserRoleSchema.PLATFORM_ADMIN:
            # Platform admins don't require an organization
            if invitation.org_id:
                org = db.query(Organization).filter(Organization.org_id == invitation.org_id).first()
                if not org:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Organization not found"
                    )
        else:
            # Non-platform-admin roles require an organization
            if not invitation.org_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Organization is required for non-platform-admin roles"
                )
            org = db.query(Organization).filter(Organization.org_id == invitation.org_id).first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Organization not found"
                )

        # Generate secure token
        token = secrets.token_urlsafe(32)

        # Create invitation
        new_invitation = Invitation(
            email=invitation.email,
            token=token,
            org_id=invitation.org_id,
            role=invitation.role.value,
            invited_by=current_user.user_id,
            expires_at=datetime.utcnow() + timedelta(days=invitation.expires_in_days)
        )

        db.add(new_invitation)
        db.commit()
        db.refresh(new_invitation)

        org_info = f"org {org.name}" if org else "no org (platform admin)"
        logger.info(f"create_invitation complete - admin_user_id={current_user.user_id}, email={invitation.email}, to {org_info}")

        return InvitationResponse(
            invitation_id=new_invitation.invitation_id,
            email=new_invitation.email,
            org_id=new_invitation.org_id,
            org_name=org.name if org else None,
            role=new_invitation.role,
            token=new_invitation.token,
            invite_url=f"{settings.FRONTEND_URL}/register?token={new_invitation.token}",
            created_at=new_invitation.created_at,
            expires_at=new_invitation.expires_at,
            accepted_at=new_invitation.accepted_at,
            is_revoked=new_invitation.is_revoked,
            inviter_email=current_user.email
        )

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
        # TODO: Move to InvitationService
        invitation = db.query(Invitation).filter(
            Invitation.invitation_id == invitation_id
        ).first()

        if not invitation:
            logger.warning(f"revoke_invitation - not found - admin_user_id={current_user.user_id}, invitation_id={invitation_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Invitation not found"
            )

        if invitation.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot revoke an already accepted invitation"
            )

        invitation.is_revoked = True
        db.commit()

        logger.info(f"revoke_invitation complete - admin_user_id={current_user.user_id}, invitation_id={invitation_id}, email={invitation.email}")

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
        # TODO: Move org verification to OrganizationService
        org = db.query(Organization).filter(Organization.org_id == user_data.org_id).first()
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
# NOTE: These endpoints have some direct DB access for validation which should be refactored

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
        # TODO: Move org verification to OrganizationService
        org = db.query(Organization).filter(Organization.org_id == org_id).first()
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
        # TODO: Move these validations to services
        org = db.query(Organization).filter(Organization.org_id == org_id).first()
        if not org:
            logger.warning(f"subscribe_org_to_global_stream - org not found - admin_user_id={current_user.user_id}, org_id={org_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        stream = db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id,
            ResearchStream.scope == StreamScope.GLOBAL
        ).first()
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

        # TODO: Move to ResearchStreamService
        # Get all streams with their chat instructions status
        stream_instructions = []
        streams = db.query(ResearchStream).order_by(ResearchStream.stream_name).all()
        for stream in streams:
            has_instr = stream.chat_instructions is not None and len(stream.chat_instructions.strip()) > 0
            preview = None
            if has_instr:
                preview = stream.chat_instructions[:200] + "..." if len(stream.chat_instructions) > 200 else stream.chat_instructions

            stream_instructions.append(StreamInstructionsInfo(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                has_instructions=has_instr,
                instructions_preview=preview
            ))

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
