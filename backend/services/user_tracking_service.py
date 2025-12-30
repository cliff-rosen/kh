"""
User Tracking Service

Provides tracking for user activities:
- Backend API endpoint auto-tracking via decorator
- Frontend event tracking via API
- Admin event viewing
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from functools import wraps
from sqlalchemy.orm import Session
from sqlalchemy import desc

from models import UserEvent, EventSource, User

logger = logging.getLogger(__name__)


class UserTrackingService:
    """Service for tracking and querying user events"""

    def __init__(self, db: Session):
        self.db = db

    def track_event(
        self,
        user_id: int,
        event_source: EventSource,
        event_type: str,
        event_data: Optional[Dict[str, Any]] = None
    ) -> UserEvent:
        """
        Track a user event.

        Args:
            user_id: ID of the user
            event_source: 'backend' or 'frontend'
            event_type: Type of event (e.g., 'api_call', 'view_change', 'tab_click')
            event_data: Additional event context

        Returns:
            Created UserEvent
        """
        event = UserEvent(
            user_id=user_id,
            event_source=event_source,
            event_type=event_type,
            event_data=event_data or {}
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)

        logger.debug(f"Tracked event: user={user_id}, type={event_type}, source={event_source.value}")
        return event

    def track_api_call(
        self,
        user_id: int,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None
    ) -> UserEvent:
        """
        Track a backend API call.

        Args:
            user_id: ID of the user making the call
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Relevant request parameters
        """
        return self.track_event(
            user_id=user_id,
            event_source=EventSource.BACKEND,
            event_type="api_call",
            event_data={
                "method": method,
                "endpoint": endpoint,
                "params": params
            }
        )

    def track_frontend_event(
        self,
        user_id: int,
        event_type: str,
        event_data: Optional[Dict[str, Any]] = None
    ) -> UserEvent:
        """
        Track a frontend UI event.

        Args:
            user_id: ID of the user
            event_type: Type of UI event (e.g., 'view_change', 'tab_click')
            event_data: Event-specific data
        """
        return self.track_event(
            user_id=user_id,
            event_source=EventSource.FRONTEND,
            event_type=event_type,
            event_data=event_data
        )

    def get_user_events(
        self,
        user_id: int,
        limit: int = 100,
        offset: int = 0,
        event_type: Optional[str] = None,
        event_source: Optional[EventSource] = None,
        since: Optional[datetime] = None
    ) -> List[UserEvent]:
        """
        Get events for a specific user.

        Args:
            user_id: ID of the user
            limit: Max events to return
            offset: Pagination offset
            event_type: Filter by event type
            event_source: Filter by source (backend/frontend)
            since: Only events after this time
        """
        query = self.db.query(UserEvent).filter(UserEvent.user_id == user_id)

        if event_type:
            query = query.filter(UserEvent.event_type == event_type)
        if event_source:
            query = query.filter(UserEvent.event_source == event_source)
        if since:
            query = query.filter(UserEvent.created_at >= since)

        return query.order_by(desc(UserEvent.created_at)).offset(offset).limit(limit).all()

    def get_all_events(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None,
        event_type: Optional[str] = None,
        event_source: Optional[EventSource] = None,
        since: Optional[datetime] = None
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Get all events (admin view) with user info.

        Returns:
            Tuple of (events with user info, total count)
        """
        query = self.db.query(UserEvent, User).join(User, User.user_id == UserEvent.user_id)

        if user_id:
            query = query.filter(UserEvent.user_id == user_id)
        if event_type:
            query = query.filter(UserEvent.event_type == event_type)
        if event_source:
            query = query.filter(UserEvent.event_source == event_source)
        if since:
            query = query.filter(UserEvent.created_at >= since)

        # Get total count
        total = query.count()

        # Get paginated results
        results = query.order_by(desc(UserEvent.created_at)).offset(offset).limit(limit).all()

        events = []
        for event, user in results:
            events.append({
                "id": event.id,
                "user_id": event.user_id,
                "user_email": user.email,
                "user_name": user.full_name,
                "event_source": event.event_source.value,
                "event_type": event.event_type,
                "event_data": event.event_data,
                "created_at": event.created_at.isoformat()
            })

        return events, total

    def get_event_types(self) -> List[str]:
        """Get distinct event types for filtering."""
        results = self.db.query(UserEvent.event_type).distinct().all()
        return [r[0] for r in results]


def track_endpoint(event_type: str = "api_call", include_params: bool = True):
    """
    Decorator to automatically track API endpoint calls.

    Usage:
        @router.get("/reports/{report_id}")
        @track_endpoint("view_report")
        async def get_report(report_id: int, current_user: User = Depends(get_current_user)):
            ...

    Args:
        event_type: Custom event type name (defaults to 'api_call')
        include_params: Whether to include path/query params in event data
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user and db from kwargs (FastAPI dependency injection)
            current_user = kwargs.get('current_user')
            db = kwargs.get('db')

            # Execute the endpoint
            result = await func(*args, **kwargs)

            # Track if we have user and db
            if current_user and db and hasattr(current_user, 'user_id'):
                try:
                    # Build event data from kwargs (path params, query params)
                    event_data = {}
                    if include_params:
                        # Include relevant params (exclude db, current_user, request)
                        excluded = {'db', 'current_user', 'request', 'background_tasks'}
                        for key, value in kwargs.items():
                            if key not in excluded:
                                # Only include serializable values
                                if isinstance(value, (str, int, float, bool, list, dict, type(None))):
                                    event_data[key] = value

                    service = UserTrackingService(db)
                    service.track_event(
                        user_id=current_user.user_id,
                        event_source=EventSource.BACKEND,
                        event_type=event_type,
                        event_data=event_data if event_data else None
                    )
                except Exception as e:
                    # Don't let tracking errors affect the endpoint
                    logger.warning(f"Failed to track endpoint {event_type}: {e}")

            return result
        return wrapper
    return decorator
