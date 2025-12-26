"""
Subscription service for managing stream subscriptions.
Handles org subscriptions to global streams and user subscriptions to org streams.
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional, Set
from datetime import datetime
from fastapi import HTTPException, status

from models import (
    Organization, User, ResearchStream, UserRole,
    OrgStreamSubscription, UserStreamSubscription, StreamScope
)
from schemas.organization import (
    StreamSubscriptionStatus, GlobalStreamLibrary, OrgStreamList
)

logger = logging.getLogger(__name__)


class SubscriptionService:
    """Service for managing stream subscriptions."""

    def __init__(self, db: Session):
        self.db = db

    # ==================== Stream Access Control ====================

    def get_accessible_stream_ids(self, user: User) -> Set[int]:
        """
        Get all stream IDs that a user can access.
        This is the core access control function.
        """
        accessible_ids = set()

        # 1. Personal streams (user owns)
        personal_streams = self.db.query(ResearchStream.stream_id).filter(
            and_(
                ResearchStream.scope == StreamScope.PERSONAL,
                ResearchStream.user_id == user.user_id
            )
        ).all()
        accessible_ids.update(s[0] for s in personal_streams)

        # 2. Org streams (user is subscribed to)
        subscribed_org_streams = self.db.query(UserStreamSubscription.stream_id).join(
            ResearchStream,
            ResearchStream.stream_id == UserStreamSubscription.stream_id
        ).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.is_subscribed == True,
                ResearchStream.scope == StreamScope.ORGANIZATION
            )
        ).all()
        accessible_ids.update(s[0] for s in subscribed_org_streams)

        # 3. Global streams (org subscribed AND user not opted out)
        if user.org_id:
            # Get global streams org is subscribed to
            org_subscribed = self.db.query(OrgStreamSubscription.stream_id).filter(
                OrgStreamSubscription.org_id == user.org_id
            ).all()
            org_subscribed_ids = {s[0] for s in org_subscribed}

            # Get streams user has opted out of
            user_opted_out = self.db.query(UserStreamSubscription.stream_id).filter(
                and_(
                    UserStreamSubscription.user_id == user.user_id,
                    UserStreamSubscription.is_subscribed == False
                )
            ).all()
            opted_out_ids = {s[0] for s in user_opted_out}

            # Global streams = org subscribed - user opted out
            accessible_ids.update(org_subscribed_ids - opted_out_ids)

        return accessible_ids

    def can_access_stream(self, user: User, stream_id: int) -> bool:
        """Check if a user can access a specific stream."""
        return stream_id in self.get_accessible_stream_ids(user)

    def get_accessible_streams(self, user: User) -> List[ResearchStream]:
        """Get all streams a user can access."""
        accessible_ids = self.get_accessible_stream_ids(user)

        if not accessible_ids:
            return []

        return self.db.query(ResearchStream).filter(
            ResearchStream.stream_id.in_(accessible_ids)
        ).order_by(ResearchStream.stream_name).all()

    # ==================== Global Stream Subscriptions (Org Admin) ====================

    def get_global_streams_for_org(self, org_id: int) -> GlobalStreamLibrary:
        """Get all global streams with subscription status for an org."""
        # Get all global streams
        global_streams = self.db.query(ResearchStream).filter(
            ResearchStream.scope == StreamScope.GLOBAL
        ).order_by(ResearchStream.stream_name).all()

        # Get streams this org is subscribed to
        subscribed = self.db.query(OrgStreamSubscription.stream_id).filter(
            OrgStreamSubscription.org_id == org_id
        ).all()
        subscribed_ids = {s[0] for s in subscribed}

        result = []
        for stream in global_streams:
            result.append(StreamSubscriptionStatus(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                scope=stream.scope,
                purpose=stream.purpose,
                is_org_subscribed=stream.stream_id in subscribed_ids,
                is_user_subscribed=True,  # Not relevant at org level
                is_user_opted_out=False,
                created_at=stream.created_at
            ))

        return GlobalStreamLibrary(
            streams=result,
            total_count=len(result)
        )

    def subscribe_org_to_global_stream(
        self,
        org_id: int,
        stream_id: int,
        subscribed_by: int
    ) -> bool:
        """Subscribe an organization to a global stream."""
        # Verify stream exists and is global
        stream = self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.stream_id == stream_id,
                ResearchStream.scope == StreamScope.GLOBAL
            )
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Global stream not found"
            )

        # Check if already subscribed
        existing = self.db.query(OrgStreamSubscription).filter(
            and_(
                OrgStreamSubscription.org_id == org_id,
                OrgStreamSubscription.stream_id == stream_id
            )
        ).first()

        if existing:
            return True  # Already subscribed

        # Create subscription
        subscription = OrgStreamSubscription(
            org_id=org_id,
            stream_id=stream_id,
            subscribed_by=subscribed_by
        )
        self.db.add(subscription)
        self.db.commit()

        logger.info(f"Org {org_id} subscribed to global stream {stream_id}")
        return True

    def unsubscribe_org_from_global_stream(self, org_id: int, stream_id: int) -> bool:
        """Unsubscribe an organization from a global stream."""
        subscription = self.db.query(OrgStreamSubscription).filter(
            and_(
                OrgStreamSubscription.org_id == org_id,
                OrgStreamSubscription.stream_id == stream_id
            )
        ).first()

        if not subscription:
            return False

        self.db.delete(subscription)
        self.db.commit()

        logger.info(f"Org {org_id} unsubscribed from global stream {stream_id}")
        return True

    # ==================== Org Stream Subscriptions (User) ====================

    def get_org_streams_for_user(self, user: User) -> OrgStreamList:
        """Get all org streams with subscription status for a user."""
        if not user.org_id:
            return OrgStreamList(streams=[], total_count=0)

        # Get all org streams for user's organization
        org_streams = self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.scope == StreamScope.ORGANIZATION,
                ResearchStream.org_id == user.org_id
            )
        ).order_by(ResearchStream.stream_name).all()

        # Get streams this user is subscribed to
        subscribed = self.db.query(UserStreamSubscription).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.is_subscribed == True
            )
        ).all()
        subscribed_ids = {s.stream_id for s in subscribed}

        result = []
        for stream in org_streams:
            result.append(StreamSubscriptionStatus(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                scope=stream.scope,
                purpose=stream.purpose,
                is_org_subscribed=None,  # Not relevant for org streams
                is_user_subscribed=stream.stream_id in subscribed_ids,
                is_user_opted_out=False,
                created_at=stream.created_at
            ))

        return OrgStreamList(
            streams=result,
            total_count=len(result)
        )

    def subscribe_user_to_org_stream(self, user: User, stream_id: int) -> bool:
        """Subscribe a user to an org stream."""
        # Verify stream exists, is org-level, and belongs to user's org
        stream = self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.stream_id == stream_id,
                ResearchStream.scope == StreamScope.ORGANIZATION,
                ResearchStream.org_id == user.org_id
            )
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization stream not found"
            )

        # Check if subscription record exists
        existing = self.db.query(UserStreamSubscription).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.stream_id == stream_id
            )
        ).first()

        if existing:
            if existing.is_subscribed:
                return True  # Already subscribed
            existing.is_subscribed = True
            existing.updated_at = datetime.utcnow()
        else:
            subscription = UserStreamSubscription(
                user_id=user.user_id,
                stream_id=stream_id,
                is_subscribed=True
            )
            self.db.add(subscription)

        self.db.commit()
        logger.info(f"User {user.user_id} subscribed to org stream {stream_id}")
        return True

    def unsubscribe_user_from_org_stream(self, user: User, stream_id: int) -> bool:
        """Unsubscribe a user from an org stream."""
        subscription = self.db.query(UserStreamSubscription).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.stream_id == stream_id
            )
        ).first()

        if not subscription:
            return False

        subscription.is_subscribed = False
        subscription.updated_at = datetime.utcnow()
        self.db.commit()

        logger.info(f"User {user.user_id} unsubscribed from org stream {stream_id}")
        return True

    # ==================== Global Stream Opt-Out (User) ====================

    def get_global_streams_for_user(self, user: User) -> List[StreamSubscriptionStatus]:
        """Get global streams available to user (via org subscription) with opt-out status."""
        if not user.org_id:
            return []

        # Get global streams org is subscribed to
        org_subscribed = self.db.query(
            ResearchStream,
            OrgStreamSubscription
        ).join(
            OrgStreamSubscription,
            OrgStreamSubscription.stream_id == ResearchStream.stream_id
        ).filter(
            OrgStreamSubscription.org_id == user.org_id
        ).all()

        # Get user's opt-outs
        opted_out = self.db.query(UserStreamSubscription.stream_id).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.is_subscribed == False
            )
        ).all()
        opted_out_ids = {s[0] for s in opted_out}

        result = []
        for stream, _ in org_subscribed:
            is_opted_out = stream.stream_id in opted_out_ids
            result.append(StreamSubscriptionStatus(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                scope=stream.scope,
                purpose=stream.purpose,
                is_org_subscribed=True,
                is_user_subscribed=not is_opted_out,
                is_user_opted_out=is_opted_out,
                created_at=stream.created_at
            ))

        return result

    def opt_out_of_global_stream(self, user: User, stream_id: int) -> bool:
        """Opt out of a global stream that user's org is subscribed to."""
        # Verify org is subscribed to this global stream
        org_sub = self.db.query(OrgStreamSubscription).filter(
            and_(
                OrgStreamSubscription.org_id == user.org_id,
                OrgStreamSubscription.stream_id == stream_id
            )
        ).first()

        if not org_sub:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization is not subscribed to this global stream"
            )

        # Check if opt-out record exists
        existing = self.db.query(UserStreamSubscription).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.stream_id == stream_id
            )
        ).first()

        if existing:
            if not existing.is_subscribed:
                return True  # Already opted out
            existing.is_subscribed = False
            existing.updated_at = datetime.utcnow()
        else:
            opt_out = UserStreamSubscription(
                user_id=user.user_id,
                stream_id=stream_id,
                is_subscribed=False  # False = opted out
            )
            self.db.add(opt_out)

        self.db.commit()
        logger.info(f"User {user.user_id} opted out of global stream {stream_id}")
        return True

    def opt_back_into_global_stream(self, user: User, stream_id: int) -> bool:
        """Opt back into a global stream (remove opt-out)."""
        opt_out = self.db.query(UserStreamSubscription).filter(
            and_(
                UserStreamSubscription.user_id == user.user_id,
                UserStreamSubscription.stream_id == stream_id
            )
        ).first()

        if not opt_out:
            return True  # Never opted out

        # Remove the opt-out record (or set is_subscribed = True)
        self.db.delete(opt_out)
        self.db.commit()

        logger.info(f"User {user.user_id} opted back into global stream {stream_id}")
        return True
