"""
Stream subscription API endpoints.
Handles org subscriptions to global streams and user subscriptions to org streams.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging

from database import get_db
from models import User, UserRole
from services import auth_service
from services.organization_service import OrganizationService
from services.subscription_service import SubscriptionService
from schemas.organization import (
    StreamSubscriptionStatus, GlobalStreamLibrary, OrgStreamList
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== Org Admin: Global Stream Subscriptions ====================

@router.get(
    "/org/global-streams",
    response_model=GlobalStreamLibrary,
    summary="List global streams available for org subscription"
)
async def list_global_streams_for_org(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all global streams with subscription status for the current org.
    Requires org admin role.
    """
    org_service = OrganizationService(db)
    org_service.require_org_admin(current_user, current_user.org_id)

    sub_service = SubscriptionService(db)
    return sub_service.get_global_streams_for_org(current_user.org_id)


@router.post(
    "/org/global-streams/{stream_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe org to a global stream"
)
async def subscribe_org_to_global_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe the current org to a global stream. Requires org admin role."""
    org_service = OrganizationService(db)
    org_service.require_org_admin(current_user, current_user.org_id)

    sub_service = SubscriptionService(db)
    sub_service.subscribe_org_to_global_stream(
        current_user.org_id,
        stream_id,
        current_user.user_id
    )

    return {"status": "subscribed", "stream_id": stream_id}


@router.delete(
    "/org/global-streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsubscribe org from a global stream"
)
async def unsubscribe_org_from_global_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe the current org from a global stream. Requires org admin role."""
    org_service = OrganizationService(db)
    org_service.require_org_admin(current_user, current_user.org_id)

    sub_service = SubscriptionService(db)
    success = sub_service.unsubscribe_org_from_global_stream(
        current_user.org_id,
        stream_id
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )


# ==================== User: Org Stream Subscriptions ====================

@router.get(
    "/org-streams",
    response_model=OrgStreamList,
    summary="List org streams available for user subscription"
)
async def list_org_streams_for_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all org streams with subscription status for the current user."""
    sub_service = SubscriptionService(db)
    return sub_service.get_org_streams_for_user(current_user)


@router.post(
    "/org-streams/{stream_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe to an org stream"
)
async def subscribe_to_org_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe the current user to an org stream."""
    sub_service = SubscriptionService(db)
    sub_service.subscribe_user_to_org_stream(current_user, stream_id)

    return {"status": "subscribed", "stream_id": stream_id}


@router.delete(
    "/org-streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsubscribe from an org stream"
)
async def unsubscribe_from_org_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe the current user from an org stream."""
    sub_service = SubscriptionService(db)
    success = sub_service.unsubscribe_user_from_org_stream(current_user, stream_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subscription not found"
        )


# ==================== User: Global Stream Opt-Out ====================

@router.get(
    "/global-streams",
    response_model=List[StreamSubscriptionStatus],
    summary="List global streams available to user"
)
async def list_global_streams_for_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get global streams available to the user (via org subscription).
    Shows opt-out status for each stream.
    """
    sub_service = SubscriptionService(db)
    return sub_service.get_global_streams_for_user(current_user)


@router.post(
    "/global-streams/{stream_id}/opt-out",
    status_code=status.HTTP_200_OK,
    summary="Opt out of a global stream"
)
async def opt_out_of_global_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Opt out of a global stream that the user's org is subscribed to."""
    sub_service = SubscriptionService(db)
    sub_service.opt_out_of_global_stream(current_user, stream_id)

    return {"status": "opted_out", "stream_id": stream_id}


@router.delete(
    "/global-streams/{stream_id}/opt-out",
    status_code=status.HTTP_200_OK,
    summary="Opt back into a global stream"
)
async def opt_back_into_global_stream(
    stream_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Opt back into a global stream (remove opt-out)."""
    sub_service = SubscriptionService(db)
    sub_service.opt_back_into_global_stream(current_user, stream_id)

    return {"status": "opted_in", "stream_id": stream_id}
