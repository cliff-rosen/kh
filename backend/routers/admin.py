"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime
import logging

from config.settings import settings
from models import User, UserRole
from services import auth_service
from services.organization_service import OrganizationService, get_organization_service
from services.user_service import UserService, get_user_service
from services.subscription_service import SubscriptionService, get_subscription_service
from services.invitation_service import InvitationService, get_invitation_service
from services.research_stream_service import (
    ResearchStreamService,
    get_research_stream_service,
)
from services.report_email_queue_service import (
    ReportEmailQueueService,
    get_report_email_queue_service,
)
from schemas.organization import (
    Organization as OrgSchema,
    OrganizationUpdate,
    OrganizationWithStats,
    StreamSubscriptionStatus,
)
from schemas.research_stream import ResearchStream as StreamSchema
from schemas.user import UserRole as UserRoleSchema, User as UserSchema, UserList
from schemas.report_email_queue import (
    ReportEmailQueueStatus,
    ReportEmailQueue as EmailQueueSchema,
    ReportEmailQueueWithDetails,
    BulkScheduleRequest,
    BulkScheduleResponse,
)
from schemas.report import Report as ReportSchema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_platform_admin(
    current_user: User = Depends(auth_service.validate_token),
) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


# ==================== Organization Management ====================


@router.get(
    "/orgs",
    response_model=List[OrganizationWithStats],
    summary="List all organizations",
)
async def list_all_organizations(
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Get all organizations with member counts. Platform admin only."""
    logger.info(f"list_all_organizations - admin_user_id={current_user.user_id}")

    try:
        orgs = await org_service.list_organizations(include_inactive=True)
        logger.info(f"list_all_organizations complete - count={len(orgs)}")
        return orgs

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_organizations failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list organizations: {str(e)}",
        )


@router.post(
    "/orgs",
    response_model=OrgSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization",
)
async def create_organization(
    name: str,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Create a new organization. Platform admin only."""
    logger.info(
        f"create_organization - admin_user_id={current_user.user_id}, name={name}"
    )

    try:
        from schemas.organization import OrganizationCreate

        org = await org_service.create_organization(OrganizationCreate(name=name))
        logger.info(f"create_organization complete - org_id={org.org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization: {str(e)}",
        )


@router.get(
    "/orgs/{org_id}",
    response_model=OrganizationWithStats,
    summary="Get organization details",
)
async def get_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Get organization details by ID. Platform admin only."""
    logger.info(
        f"get_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.get_organization_with_stats(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )
        logger.info(f"get_organization complete - org_id={org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get organization: {str(e)}",
        )


@router.put("/orgs/{org_id}", response_model=OrgSchema, summary="Update organization")
async def update_organization(
    org_id: int,
    update_data: OrganizationUpdate,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Update an organization. Platform admin only."""
    logger.info(
        f"update_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.update_organization(org_id, update_data)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )
        logger.info(f"update_organization complete - org_id={org_id}")
        return OrgSchema.model_validate(org)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update organization: {str(e)}",
        )


@router.delete(
    "/orgs/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete organization",
)
async def delete_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Delete an organization. Platform admin only."""
    logger.info(
        f"delete_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        success = await org_service.delete_organization(org_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete organization.",
            )
        logger.info(f"delete_organization complete - org_id={org_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete organization: {str(e)}",
        )


@router.put("/orgs/{org_id}/members/{user_id}", summary="Move user to organization")
async def assign_user_to_org(
    org_id: int,
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Assign a user to an organization. Platform admin only."""
    logger.info(
        f"assign_user_to_org - admin_user_id={current_user.user_id}, user_id={user_id}, org_id={org_id}"
    )

    try:
        user = await user_service.assign_to_org(user_id, org_id, current_user)
        logger.info(f"assign_user_to_org complete - user_id={user_id}, org_id={org_id}")
        return {"status": "success", "user_id": user.user_id, "org_id": user.org_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_user_to_org failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign user to organization: {str(e)}",
        )


# ==================== Global Stream Management ====================


@router.get(
    "/streams", response_model=List[StreamSchema], summary="List all global streams"
)
async def list_global_streams(
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Get all global streams. Platform admin only."""
    logger.info(f"list_global_streams - admin_user_id={current_user.user_id}")

    try:
        streams = await stream_service.list_global_streams()
        logger.info(f"list_global_streams complete - count={len(streams)}")
        return streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_global_streams failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global streams: {str(e)}",
        )


@router.put(
    "/streams/{stream_id}/scope",
    response_model=StreamSchema,
    summary="Update stream scope to global",
)
async def update_stream_scope_global(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Change a stream's scope to global. Platform admin only."""
    logger.info(
        f"set_stream_scope_global - admin_user_id={current_user.user_id}, stream_id={stream_id}"
    )

    try:
        stream = await stream_service.update_stream_scope_global(stream_id)
        logger.info(f"set_stream_scope_global complete - stream_id={stream_id}")
        return stream

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"set_stream_scope_global failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stream scope: {str(e)}",
        )


@router.delete(
    "/streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a global stream",
)
async def delete_global_stream(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Delete a global stream. Platform admin only."""
    logger.info(
        f"delete_global_stream - admin_user_id={current_user.user_id}, stream_id={stream_id}"
    )

    try:
        success = await stream_service.delete_global_stream(stream_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global stream not found"
            )
        logger.info(f"delete_global_stream complete - stream_id={stream_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete global stream: {str(e)}",
        )


# ==================== User Management ====================


@router.get("/users", response_model=UserList, summary="List all users")
async def list_all_users(
    org_id: Optional[int] = None,
    role: Optional[UserRoleSchema] = None,
    is_active: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Get all users with optional filters. Platform admin only."""
    logger.info(
        f"list_all_users - admin_user_id={current_user.user_id}, org_id={org_id}, role={role}"
    )

    try:
        users, total = await user_service.list_users(
            org_id=org_id, role=role, is_active=is_active, limit=limit, offset=offset
        )
        logger.info(f"list_all_users complete - total={total}, returned={len(users)}")
        return UserList(
            users=[UserSchema.model_validate(u) for u in users], total=total
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_users failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list users: {str(e)}",
        )


@router.put(
    "/users/{user_id}/role", response_model=UserSchema, summary="Update user role"
)
async def update_user_role(
    user_id: int,
    new_role: UserRoleSchema,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Update any user's role. Platform admin only."""
    logger.info(
        f"update_user_role - admin_user_id={current_user.user_id}, user_id={user_id}, new_role={new_role}"
    )

    try:
        user = await user_service.update_role(user_id, new_role, current_user)
        logger.info(
            f"update_user_role complete - user_id={user_id}, new_role={new_role}"
        )
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_user_role failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user role: {str(e)}",
        )


@router.delete(
    "/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a user"
)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Delete a user. Platform admin only."""
    logger.info(
        f"delete_user - admin_user_id={current_user.user_id}, user_id={user_id}"
    )

    try:
        await user_service.delete_user(user_id, current_user)
        logger.info(f"delete_user complete - user_id={user_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_user failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}",
        )


# ==================== Invitation Management ====================


class InvitationCreate(BaseModel):
    """Request schema for creating an invitation."""

    email: EmailStr = Field(description="Email address to invite")
    org_id: Optional[int] = Field(
        default=None, description="Organization to assign user to"
    )
    role: UserRoleSchema = Field(
        default=UserRoleSchema.MEMBER, description="Role to assign"
    )
    expires_in_days: int = Field(
        default=7, ge=1, le=30, description="Days until expiration"
    )


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
        default=UserRoleSchema.MEMBER, description="Role to assign"
    )


@router.get(
    "/invitations",
    response_model=List[InvitationResponse],
    summary="List all invitations",
)
async def list_invitations(
    org_id: Optional[int] = None,
    include_accepted: bool = False,
    include_expired: bool = False,
    current_user: User = Depends(require_platform_admin),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Get all invitations with optional filters. Platform admin only."""
    logger.info(
        f"list_invitations - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        invitations = await inv_service.list_invitations(
            org_id=org_id,
            include_accepted=include_accepted,
            include_expired=include_expired,
        )
        result = [
            InvitationResponse.model_validate(inv.model_dump()) for inv in invitations
        ]
        logger.info(f"list_invitations complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_invitations failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list invitations: {str(e)}",
        )


@router.post(
    "/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new invitation",
)
async def create_invitation(
    invitation: InvitationCreate,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Create an invitation for a new user. Platform admin only."""
    logger.info(
        f"create_invitation - admin_user_id={current_user.user_id}, email={invitation.email}"
    )

    try:
        # Check if email already registered
        existing_user = await user_service.get_user_by_email(invitation.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )

        # Validate org_id based on role
        if invitation.role != UserRoleSchema.PLATFORM_ADMIN and not invitation.org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is required for non-platform-admin roles",
            )

        result = await inv_service.create_invitation(
            email=invitation.email,
            role=invitation.role.value,
            invited_by=current_user.user_id,
            org_id=invitation.org_id,
            expires_in_days=invitation.expires_in_days,
        )
        logger.info(f"create_invitation complete - email={invitation.email}")
        return InvitationResponse.model_validate(result.model_dump())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_invitation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create invitation: {str(e)}",
        )


@router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an invitation",
)
async def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(require_platform_admin),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Revoke an invitation. Platform admin only."""
    logger.info(
        f"revoke_invitation - admin_user_id={current_user.user_id}, invitation_id={invitation_id}"
    )

    try:
        success = await inv_service.revoke_invitation(invitation_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
            )
        logger.info(f"revoke_invitation complete - invitation_id={invitation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"revoke_invitation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke invitation: {str(e)}",
        )


@router.post(
    "/users/create",
    response_model=UserSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user directly",
)
async def create_user_directly(
    user_data: CreateUserRequest,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    user_service: UserService = Depends(get_user_service),
):
    """Create a user directly without invitation. Platform admin only."""
    logger.info(
        f"create_user_directly - admin_user_id={current_user.user_id}, email={user_data.email}"
    )

    try:
        # Verify organization exists
        org = await org_service.get_organization(user_data.org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        user = await user_service.create_user(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name,
            role=user_data.role,
            org_id=user_data.org_id,
        )
        logger.info(f"create_user_directly complete - new_user_id={user.user_id}")
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_user_directly failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}",
        )


# ==================== Organization Stream Subscriptions ====================


@router.get(
    "/orgs/{org_id}/global-streams",
    response_model=List[StreamSubscriptionStatus],
    summary="List global streams with subscription status for an org",
)
async def list_org_global_stream_subscriptions(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Get all global streams with subscription status for an org. Platform admin only."""
    logger.info(
        f"list_org_global_stream_subscriptions - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.get_organization(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        result = await sub_service.get_global_streams_for_org(org_id)
        logger.info(f"list_org_global_stream_subscriptions complete - org_id={org_id}")
        return result.streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_org_global_stream_subscriptions failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global stream subscriptions: {str(e)}",
        )


@router.post(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe an org to a global stream",
)
async def subscribe_org_to_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Subscribe an organization to a global stream. Platform admin only."""
    logger.info(
        f"subscribe_org_to_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}"
    )

    try:
        org = await org_service.get_organization(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        stream = await stream_service.get_global_stream(stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global stream not found"
            )

        await sub_service.subscribe_org_to_global_stream(
            org_id, stream_id, current_user.user_id
        )
        logger.info(
            f"subscribe_org_to_global_stream complete - org_id={org_id}, stream_id={stream_id}"
        )
        return {"status": "subscribed", "org_id": org_id, "stream_id": stream_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"subscribe_org_to_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to subscribe to global stream: {str(e)}",
        )


@router.delete(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsubscribe an org from a global stream",
)
async def unsubscribe_org_from_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Unsubscribe an organization from a global stream. Platform admin only."""
    logger.info(
        f"unsubscribe_org_from_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}"
    )

    try:
        success = await sub_service.unsubscribe_org_from_global_stream(
            org_id, stream_id
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
            )
        logger.info(
            f"unsubscribe_org_from_global_stream complete - org_id={org_id}, stream_id={stream_id}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"unsubscribe_org_from_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unsubscribe from global stream: {str(e)}",
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
    instructions_preview: Optional[str] = None


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
    summary="Get chat system configuration",
)
async def get_chat_config(
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Get complete chat system configuration. Platform admin only."""
    logger.info(f"get_chat_config - admin_user_id={current_user.user_id}")

    try:
        from schemas.payloads import get_all_payload_types
        from tools.registry import get_all_tools
        from services.chat_page_config.registry import _page_registry

        # Get all payload types
        payload_types = []
        for pt in get_all_payload_types():
            payload_types.append(
                PayloadTypeInfo(
                    name=pt.name,
                    description=pt.description,
                    source=pt.source,
                    is_global=pt.is_global,
                    parse_marker=pt.parse_marker,
                    has_parser=pt.parser is not None,
                    has_instructions=pt.llm_instructions is not None
                    and len(pt.llm_instructions) > 0,
                )
            )

        # Get all tools
        tools = []
        for tool in get_all_tools():
            tools.append(
                ToolInfo(
                    name=tool.name,
                    description=tool.description,
                    category=tool.category,
                    is_global=tool.is_global,
                    payload_type=tool.payload_type,
                    streaming=tool.streaming,
                )
            )

        # Get all page configs
        pages = []
        for page_name, config in _page_registry.items():
            tabs_info = {}
            for tab_name, tab_config in config.tabs.items():
                subtabs_info = {}
                for subtab_name, subtab_config in tab_config.subtabs.items():
                    subtabs_info[subtab_name] = SubTabConfigInfo(
                        payloads=subtab_config.payloads, tools=subtab_config.tools
                    )
                tabs_info[tab_name] = TabConfigInfo(
                    payloads=tab_config.payloads,
                    tools=tab_config.tools,
                    subtabs=subtabs_info,
                )
            pages.append(
                PageConfigInfo(
                    page=page_name,
                    has_context_builder=config.context_builder is not None,
                    payloads=config.payloads,
                    tools=config.tools,
                    tabs=tabs_info,
                    client_actions=[ca.action for ca in config.client_actions],
                )
            )

        # Get stream chat instructions (async)
        streams_data = await stream_service.get_all_streams_with_chat_instructions()
        stream_instructions = [
            StreamInstructionsInfo(
                stream_id=s["stream_id"],
                stream_name=s["stream_name"],
                has_instructions=s["has_instructions"],
                instructions_preview=s["instructions_preview"],
            )
            for s in streams_data
        ]

        # Build summary
        streams_with_instructions = len(
            [s for s in stream_instructions if s.has_instructions]
        )
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

        logger.info(
            f"get_chat_config complete - payloads={len(payload_types)}, tools={len(tools)}, pages={len(pages)}"
        )
        return ChatConfigResponse(
            payload_types=payload_types,
            tools=tools,
            pages=pages,
            stream_instructions=stream_instructions,
            summary=summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_chat_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat config: {str(e)}",
        )


# ==================== Email Queue Management ====================


class EmailQueueListResponse(BaseModel):
    """Response for email queue list."""

    entries: List[ReportEmailQueueWithDetails]
    total: int


class SubscriberInfo(BaseModel):
    """User info for subscriber picker."""

    user_id: int
    email: str
    full_name: Optional[str] = None
    org_name: Optional[str] = None


class ApprovedReportInfo(BaseModel):
    """Report info for report picker."""

    report_id: int
    report_name: str
    stream_name: Optional[str] = None
    created_at: datetime


@router.get(
    "/email-queue",
    response_model=EmailQueueListResponse,
    summary="List email queue entries",
)
async def list_email_queue(
    status_filter: Optional[ReportEmailQueueStatus] = None,
    scheduled_from: Optional[datetime] = None,
    scheduled_to: Optional[datetime] = None,
    report_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_platform_admin),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Get email queue entries with optional filters. Platform admin only."""
    logger.info(
        f"list_email_queue - admin_user_id={current_user.user_id}, status={status_filter}"
    )

    try:
        entries, total = await queue_service.get_queue_entries(
            status_filter=status_filter,
            scheduled_from=scheduled_from.date() if scheduled_from else None,
            scheduled_to=scheduled_to.date() if scheduled_to else None,
            report_id=report_id,
            limit=limit,
            offset=offset,
        )
        logger.info(f"list_email_queue complete - total={total}, returned={len(entries)}")
        return EmailQueueListResponse(entries=entries, total=total)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_email_queue failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list email queue: {str(e)}",
        )


@router.get(
    "/email-queue/approved-reports",
    response_model=List[ApprovedReportInfo],
    summary="Get approved reports for scheduling",
)
async def get_approved_reports_for_email(
    current_user: User = Depends(require_platform_admin),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Get approved reports for the email scheduling dropdown. Platform admin only."""
    logger.info(f"get_approved_reports_for_email - admin_user_id={current_user.user_id}")

    try:
        reports = await queue_service.get_approved_reports(limit=50)

        # Get stream names
        stream_ids = [r.research_stream_id for r in reports if r.research_stream_id]
        streams = {}
        if stream_ids:
            stream_list = await stream_service.get_streams_by_ids(stream_ids)
            streams = {s.stream_id: s.stream_name for s in stream_list}

        result = [
            ApprovedReportInfo(
                report_id=r.report_id,
                report_name=r.report_name,
                stream_name=streams.get(r.research_stream_id) if r.research_stream_id else None,
                created_at=r.created_at,
            )
            for r in reports
        ]

        logger.info(f"get_approved_reports_for_email complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_approved_reports_for_email failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get approved reports: {str(e)}",
        )


@router.get(
    "/email-queue/subscribers/{report_id}",
    response_model=List[SubscriberInfo],
    summary="Get subscribers for a report's stream",
)
async def get_report_subscribers(
    report_id: int,
    current_user: User = Depends(require_platform_admin),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Get all subscribers for the given report's stream. Platform admin only."""
    logger.info(
        f"get_report_subscribers - admin_user_id={current_user.user_id}, report_id={report_id}"
    )

    try:
        subscribers = await queue_service.get_stream_subscribers(report_id)

        result = [
            SubscriberInfo(
                user_id=u.user_id,
                email=u.email,
                full_name=u.full_name,
                org_name=u.organization.name if u.organization else None,
            )
            for u in subscribers
        ]

        logger.info(f"get_report_subscribers complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_subscribers failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get subscribers: {str(e)}",
        )


@router.post(
    "/email-queue/schedule",
    response_model=BulkScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Schedule emails for users",
)
async def schedule_emails(
    request: BulkScheduleRequest,
    current_user: User = Depends(require_platform_admin),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Schedule report emails for multiple users. Platform admin only."""
    logger.info(
        f"schedule_emails - admin_user_id={current_user.user_id}, report_id={request.report_id}, "
        f"user_count={len(request.user_ids)}, scheduled_for={request.scheduled_for}"
    )

    try:
        result = await queue_service.schedule_emails(request)
        logger.info(
            f"schedule_emails complete - scheduled={result.scheduled_count}, "
            f"skipped={result.skipped_count}"
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"schedule_emails failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to schedule emails: {str(e)}",
        )


@router.delete(
    "/email-queue/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel a scheduled email",
)
async def cancel_email(
    entry_id: int,
    current_user: User = Depends(require_platform_admin),
    queue_service: ReportEmailQueueService = Depends(get_report_email_queue_service),
):
    """Cancel a scheduled email. Only works for scheduled/ready status. Platform admin only."""
    logger.info(
        f"cancel_email - admin_user_id={current_user.user_id}, entry_id={entry_id}"
    )

    try:
        success = await queue_service.cancel_entry(entry_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel: entry not found or already processed",
            )
        logger.info(f"cancel_email complete - entry_id={entry_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"cancel_email failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to cancel email: {str(e)}",
        )
