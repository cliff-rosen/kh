"""
Tracking Router

Endpoints for:
- Frontend event tracking
- Admin event viewing
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel

from database import get_db
from models import User, UserRole, EventSource
from services import auth_service
from services.user_tracking_service import UserTrackingService

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


# === Schemas ===

class TrackEventRequest(BaseModel):
    """Request to track a frontend event"""
    event_type: str
    event_data: Optional[dict] = None


class TrackEventResponse(BaseModel):
    """Response after tracking an event"""
    success: bool
    event_id: int


class EventResponse(BaseModel):
    """Single event in response"""
    id: int
    user_id: int
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    event_source: str
    event_type: str
    event_data: Optional[dict] = None
    created_at: str


class EventsListResponse(BaseModel):
    """Paginated list of events"""
    events: List[EventResponse]
    total: int
    limit: int
    offset: int


# === Frontend Tracking Endpoint ===

@router.post("/events", response_model=TrackEventResponse)
async def track_event(
    request: TrackEventRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Track a frontend UI event.

    Common event types:
    - view_change: {from: 'list', to: 'grid', page: 'reports'}
    - tab_click: {tab: 'notes', pmid: '12345', page: 'article_modal'}
    - button_click: {button: 'star', pmid: '12345'}
    - page_view: {page: 'reports', report_id: 123}
    """
    service = UserTrackingService(db)
    event = service.track_frontend_event(
        user_id=current_user.user_id,
        event_type=request.event_type,
        event_data=request.event_data
    )
    return TrackEventResponse(success=True, event_id=event.id)


# === Admin Event Viewing Endpoints ===

@router.get("/admin/events", response_model=EventsListResponse)
async def get_events(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    event_source: Optional[str] = Query(None, description="Filter by source: 'backend' or 'frontend'"),
    hours: Optional[int] = Query(24, description="Events from last N hours"),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Get user events (platform admin only).

    Supports filtering by user, event type, source, and time range.
    """
    # Check admin access
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Platform admin access required")

    # Parse event source
    source = None
    if event_source:
        try:
            source = EventSource(event_source)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid event_source: {event_source}")

    # Calculate since time
    since = datetime.utcnow() - timedelta(hours=hours) if hours else None

    service = UserTrackingService(db)
    events, total = service.get_all_events(
        limit=limit,
        offset=offset,
        user_id=user_id,
        event_type=event_type,
        event_source=source,
        since=since
    )

    return EventsListResponse(
        events=[EventResponse(**e) for e in events],
        total=total,
        limit=limit,
        offset=offset
    )


@router.get("/admin/event-types", response_model=List[str])
async def get_event_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get distinct event types for filtering (platform admin only)."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=403, detail="Platform admin access required")

    service = UserTrackingService(db)
    return service.get_event_types()
