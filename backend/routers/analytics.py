"""
Analytics API endpoints

Provides journey and event analytics data
"""

from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Dict, Any

from database import get_db
from models import UserEvent, EventType
from services.auth_service import validate_token

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/journey/{journey_id}")
async def get_journey_analytics(
    journey_id: str,
    current_user=Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get analytics for a specific journey"""

    # Get current journey events
    current_journey_events = db.query(UserEvent).filter(
        UserEvent.user_id == current_user.user_id,
        UserEvent.journey_id == journey_id
    ).order_by(UserEvent.timestamp).all()

    if not current_journey_events:
        # Return empty journey data instead of 404
        return {
            "current_journey": {
                "journey_id": journey_id,
                "event_count": 0,
                "duration": "0s",
                "events": []
            },
            "recent_journeys": []
        }

    # Calculate journey duration
    start_time = current_journey_events[0].timestamp
    end_time = current_journey_events[-1].timestamp
    duration = end_time - start_time

    # Format duration
    duration_str = f"{duration.total_seconds():.1f}s"
    if duration.total_seconds() > 60:
        minutes = int(duration.total_seconds() // 60)
        seconds = int(duration.total_seconds() % 60)
        duration_str = f"{minutes}m {seconds}s"

    # Get recent journeys (last 10)
    recent_journeys_query = db.query(
        UserEvent.journey_id,
        func.count(UserEvent.event_id).label('event_count'),
        func.min(UserEvent.timestamp).label('start_time'),
        func.max(UserEvent.timestamp).label('end_time'),
        func.max(UserEvent.event_type).label('last_event_type')
    ).filter(
        UserEvent.user_id == current_user.user_id
    ).group_by(
        UserEvent.journey_id
    ).order_by(
        func.max(UserEvent.timestamp).desc()
    ).limit(10).all()

    recent_journeys = []
    for journey in recent_journeys_query:
        if journey.journey_id == journey_id:
            continue  # Skip current journey

        journey_duration = journey.end_time - journey.start_time
        duration_str_recent = f"{journey_duration.total_seconds():.1f}s"
        if journey_duration.total_seconds() > 60:
            minutes = int(journey_duration.total_seconds() // 60)
            seconds = int(journey_duration.total_seconds() % 60)
            duration_str_recent = f"{minutes}m {seconds}s"

        recent_journeys.append({
            "journey_id": journey.journey_id,
            "event_count": journey.event_count,
            "start_time": journey.start_time.isoformat(),
            "duration": duration_str_recent,
            "last_event_type": journey.last_event_type
        })

    return {
        "current_journey": {
            "journey_id": journey_id,
            "event_count": len(current_journey_events),
            "duration": duration_str,
            "events": [
                {
                    "user_id": event.user_id,
                    "journey_id": event.journey_id,
                    "event_id": event.event_id,
                    "event_type": event.event_type,
                    "timestamp": event.timestamp.isoformat(),
                    "event_data": event.event_data
                }
                for event in current_journey_events
            ]
        },
        "recent_journeys": recent_journeys
    }


@router.get("/user/summary")
async def get_user_analytics_summary(
    current_user=Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get summary analytics for the user"""

    # Get event counts by type
    event_type_counts = db.query(
        UserEvent.event_type,
        func.count(UserEvent.event_id).label('count')
    ).filter(
        UserEvent.user_id == current_user.user_id
    ).group_by(
        UserEvent.event_type
    ).all()

    # Get journey count
    journey_count = db.query(func.count(func.distinct(UserEvent.journey_id))).filter(
        UserEvent.user_id == current_user.user_id
    ).scalar()

    # Get events from last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    recent_event_count = db.query(func.count(UserEvent.event_id)).filter(
        UserEvent.user_id == current_user.user_id,
        UserEvent.timestamp >= thirty_days_ago
    ).scalar()

    return {
        "total_journeys": journey_count,
        "total_events": sum(count.count for count in event_type_counts),
        "recent_events_30d": recent_event_count,
        "event_type_breakdown": {
            count.event_type: count.count
            for count in event_type_counts
        }
    }


@router.get("/events/recent")
async def get_recent_events(
    limit: int = 50,
    current_user=Depends(validate_token),
    db: Session = Depends(get_db)
):
    """Get recent events for the user"""

    events = db.query(UserEvent).filter(
        UserEvent.user_id == current_user.user_id
    ).order_by(
        desc(UserEvent.timestamp)
    ).limit(limit).all()

    return {
        "events": [
            {
                "user_id": event.user_id,
                "journey_id": event.journey_id,
                "event_id": event.event_id,
                "event_type": event.event_type,
                "timestamp": event.timestamp.isoformat(),
                "event_data": event.event_data
            }
            for event in events
        ]
    }