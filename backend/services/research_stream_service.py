"""
Research Stream service for managing research streams
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional, Dict, Any
from datetime import datetime

from models import ResearchStream
from schemas.research_stream import StreamType, ReportFrequency


class ResearchStreamService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_research_streams(self, user_id: int) -> List[ResearchStream]:
        """Get all research streams for a user"""
        return self.db.query(ResearchStream).filter(
            ResearchStream.user_id == user_id
        ).order_by(ResearchStream.created_at.desc()).all()

    def get_research_stream(self, stream_id: int, user_id: int) -> Optional[ResearchStream]:
        """Get a specific research stream by ID for a user"""
        return self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.stream_id == stream_id,
                ResearchStream.user_id == user_id
            )
        ).first()

    def create_research_stream(
        self,
        user_id: int,
        stream_name: str,
        description: Optional[str] = None,
        stream_type: StreamType = StreamType.MIXED,
        focus_areas: List[str] = None,
        competitors: List[str] = None,
        report_frequency: ReportFrequency = ReportFrequency.WEEKLY
    ) -> ResearchStream:
        """Create a new research stream"""

        if focus_areas is None:
            focus_areas = []
        if competitors is None:
            competitors = []

        research_stream = ResearchStream(
            user_id=user_id,
            stream_name=stream_name,
            description=description,
            stream_type=stream_type,
            focus_areas=focus_areas,
            competitors=competitors,
            report_frequency=report_frequency,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(research_stream)
        self.db.commit()
        self.db.refresh(research_stream)
        return research_stream

    def update_research_stream(
        self,
        stream_id: int,
        update_data: Dict[str, Any]
    ) -> ResearchStream:
        """Update an existing research stream"""

        research_stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not research_stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        # Update fields
        for field, value in update_data.items():
            if hasattr(research_stream, field):
                setattr(research_stream, field, value)

        research_stream.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(research_stream)
        return research_stream

    def delete_research_stream(self, stream_id: int) -> bool:
        """Delete a research stream"""
        research_stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not research_stream:
            return False

        self.db.delete(research_stream)
        self.db.commit()
        return True

    def get_active_research_streams(self, user_id: int) -> List[ResearchStream]:
        """Get only active research streams for a user"""
        return self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.user_id == user_id,
                ResearchStream.is_active == True
            )
        ).order_by(ResearchStream.created_at.desc()).all()

    def count_user_research_streams(self, user_id: int) -> int:
        """Count total research streams for a user"""
        return self.db.query(ResearchStream).filter(
            ResearchStream.user_id == user_id
        ).count()

    def toggle_stream_status(self, stream_id: int, is_active: bool) -> ResearchStream:
        """Toggle the active status of a research stream"""
        return self.update_research_stream(stream_id, {"is_active": is_active})