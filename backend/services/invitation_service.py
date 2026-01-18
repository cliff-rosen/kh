"""
Invitation service for managing user invitations.
Handles invitation CRUD operations for platform admins.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select
from fastapi import HTTPException, status, Depends

from models import Invitation, Organization, User
from config.settings import settings
from database import get_async_db

logger = logging.getLogger(__name__)


class InvitationService:
    """Service for managing invitations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_invitations(
        self,
        org_id: Optional[int] = None,
        include_accepted: bool = False,
        include_expired: bool = False
    ) -> List[Dict[str, Any]]:
        """List invitations with optional filters."""
        where_clauses = [Invitation.is_revoked == False]

        if org_id:
            where_clauses.append(Invitation.org_id == org_id)
        if not include_accepted:
            where_clauses.append(Invitation.accepted_at == None)
        if not include_expired:
            where_clauses.append(Invitation.expires_at > datetime.utcnow())

        result = await self.db.execute(
            select(Invitation)
            .where(*where_clauses)
            .order_by(Invitation.created_at.desc())
        )
        invitations = list(result.scalars().all())

        invitation_list = []
        for inv in invitations:
            org = None
            if inv.org_id:
                org_result = await self.db.execute(
                    select(Organization).where(Organization.org_id == inv.org_id)
                )
                org = org_result.scalars().first()

            inviter = None
            if inv.invited_by:
                inviter_result = await self.db.execute(
                    select(User).where(User.user_id == inv.invited_by)
                )
                inviter = inviter_result.scalars().first()

            invitation_list.append({
                "invitation_id": inv.invitation_id,
                "email": inv.email,
                "org_id": inv.org_id,
                "org_name": org.name if org else None,
                "role": inv.role,
                "token": inv.token,
                "invite_url": f"{settings.FRONTEND_URL}/register?token={inv.token}",
                "created_at": inv.created_at,
                "expires_at": inv.expires_at,
                "accepted_at": inv.accepted_at,
                "is_revoked": inv.is_revoked,
                "inviter_email": inviter.email if inviter else None
            })

        logger.info(f"Listed {len(invitation_list)} invitations")
        return invitation_list

    async def get_pending_invitation_for_email(
        self,
        email: str
    ) -> Optional[Invitation]:
        """Check if a pending invitation exists for an email."""
        result = await self.db.execute(
            select(Invitation).where(
                and_(
                    Invitation.email == email,
                    Invitation.accepted_at == None,
                    Invitation.is_revoked == False,
                    Invitation.expires_at > datetime.utcnow()
                )
            )
        )
        return result.scalars().first()

    async def create_invitation(
        self,
        email: str,
        role: str,
        invited_by: int,
        org_id: Optional[int] = None,
        expires_in_days: int = 7
    ) -> Dict[str, Any]:
        """Create a new invitation."""
        existing_invite = await self.get_pending_invitation_for_email(email)
        if existing_invite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A pending invitation for this email already exists"
            )

        org = None
        if org_id:
            org_result = await self.db.execute(
                select(Organization).where(Organization.org_id == org_id)
            )
            org = org_result.scalars().first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Organization not found"
                )

        token = secrets.token_urlsafe(32)

        invitation = Invitation(
            email=email,
            token=token,
            org_id=org_id,
            role=role,
            invited_by=invited_by,
            expires_at=datetime.utcnow() + timedelta(days=expires_in_days)
        )

        self.db.add(invitation)
        await self.db.commit()
        await self.db.refresh(invitation)

        inviter_result = await self.db.execute(
            select(User).where(User.user_id == invited_by)
        )
        inviter = inviter_result.scalars().first()

        org_info = f"org {org.name}" if org else "no org (platform admin)"
        logger.info(f"Created invitation for {email} to {org_info}")

        return {
            "invitation_id": invitation.invitation_id,
            "email": invitation.email,
            "org_id": invitation.org_id,
            "org_name": org.name if org else None,
            "role": invitation.role,
            "token": invitation.token,
            "invite_url": f"{settings.FRONTEND_URL}/register?token={invitation.token}",
            "created_at": invitation.created_at,
            "expires_at": invitation.expires_at,
            "accepted_at": invitation.accepted_at,
            "is_revoked": invitation.is_revoked,
            "inviter_email": inviter.email if inviter else None
        }

    async def revoke_invitation(self, invitation_id: int) -> bool:
        """Revoke an invitation."""
        result = await self.db.execute(
            select(Invitation).where(Invitation.invitation_id == invitation_id)
        )
        invitation = result.scalars().first()

        if not invitation:
            return False

        if invitation.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot revoke an already accepted invitation"
            )

        invitation.is_revoked = True
        await self.db.commit()

        logger.info(f"Revoked invitation {invitation_id} for {invitation.email}")
        return True

    async def get_invitation_by_id(
        self,
        invitation_id: int
    ) -> Optional[Invitation]:
        """Get an invitation by ID."""
        result = await self.db.execute(
            select(Invitation).where(Invitation.invitation_id == invitation_id)
        )
        return result.scalars().first()


# Dependency injection provider for async invitation service
async def get_async_invitation_service(
    db: AsyncSession = Depends(get_async_db)
) -> InvitationService:
    """Get an InvitationService instance with async database session."""
    return InvitationService(db)
