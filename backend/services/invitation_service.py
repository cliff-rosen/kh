"""
Invitation service for managing user invitations.
Handles invitation CRUD operations for platform admins.
"""

import logging
import secrets
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_
from fastapi import HTTPException, status

from models import Invitation, Organization, User
from config.settings import settings

logger = logging.getLogger(__name__)


class InvitationService:
    """Service for managing invitations."""

    def __init__(self, db: Session):
        self.db = db

    def list_invitations(
        self,
        org_id: Optional[int] = None,
        include_accepted: bool = False,
        include_expired: bool = False
    ) -> List[Dict[str, Any]]:
        """
        List invitations with optional filters.

        Args:
            org_id: Filter by organization ID
            include_accepted: Include accepted invitations
            include_expired: Include expired invitations

        Returns:
            List of invitation dictionaries with org and inviter info
        """
        query = self.db.query(Invitation)

        if org_id:
            query = query.filter(Invitation.org_id == org_id)

        if not include_accepted:
            query = query.filter(Invitation.accepted_at == None)

        if not include_expired:
            query = query.filter(Invitation.expires_at > datetime.utcnow())

        query = query.filter(Invitation.is_revoked == False)
        invitations = query.order_by(Invitation.created_at.desc()).all()

        result = []
        for inv in invitations:
            org = self.db.query(Organization).filter(
                Organization.org_id == inv.org_id
            ).first() if inv.org_id else None

            inviter = self.db.query(User).filter(
                User.user_id == inv.invited_by
            ).first() if inv.invited_by else None

            result.append({
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

        logger.info(f"Listed {len(result)} invitations")
        return result

    def get_pending_invitation_for_email(self, email: str) -> Optional[Invitation]:
        """Check if a pending invitation exists for an email."""
        return self.db.query(Invitation).filter(
            and_(
                Invitation.email == email,
                Invitation.accepted_at == None,
                Invitation.is_revoked == False,
                Invitation.expires_at > datetime.utcnow()
            )
        ).first()

    def create_invitation(
        self,
        email: str,
        role: str,
        invited_by: int,
        org_id: Optional[int] = None,
        expires_in_days: int = 7
    ) -> Dict[str, Any]:
        """
        Create a new invitation.

        Args:
            email: Email to invite
            role: Role to assign
            invited_by: User ID of inviter
            org_id: Organization to assign (optional for platform_admin)
            expires_in_days: Days until expiration

        Returns:
            Invitation data dictionary

        Raises:
            HTTPException: If validation fails
        """
        # Check for existing pending invitation
        existing_invite = self.get_pending_invitation_for_email(email)
        if existing_invite:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A pending invitation for this email already exists"
            )

        # Get organization if provided
        org = None
        if org_id:
            org = self.db.query(Organization).filter(
                Organization.org_id == org_id
            ).first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Organization not found"
                )

        # Generate secure token
        token = secrets.token_urlsafe(32)

        # Create invitation
        invitation = Invitation(
            email=email,
            token=token,
            org_id=org_id,
            role=role,
            invited_by=invited_by,
            expires_at=datetime.utcnow() + timedelta(days=expires_in_days)
        )

        self.db.add(invitation)
        self.db.commit()
        self.db.refresh(invitation)

        # Get inviter for response
        inviter = self.db.query(User).filter(
            User.user_id == invited_by
        ).first()

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

    def revoke_invitation(self, invitation_id: int) -> bool:
        """
        Revoke an invitation.

        Args:
            invitation_id: ID of invitation to revoke

        Returns:
            True if revoked, False if not found

        Raises:
            HTTPException: If invitation already accepted
        """
        invitation = self.db.query(Invitation).filter(
            Invitation.invitation_id == invitation_id
        ).first()

        if not invitation:
            return False

        if invitation.accepted_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot revoke an already accepted invitation"
            )

        invitation.is_revoked = True
        self.db.commit()

        logger.info(f"Revoked invitation {invitation_id} for {invitation.email}")
        return True

    def get_invitation_by_id(self, invitation_id: int) -> Optional[Invitation]:
        """Get an invitation by ID."""
        return self.db.query(Invitation).filter(
            Invitation.invitation_id == invitation_id
        ).first()
