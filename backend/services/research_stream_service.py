"""
Research Stream service for managing research streams
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional, Dict, Any
from datetime import datetime

from models import ResearchStream, Report
from schemas.research_stream import ResearchStream as ResearchStreamSchema
from schemas.research_stream import StreamType, ReportFrequency


class ResearchStreamService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_research_streams(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all research streams for a user with report counts and latest report date"""
        # Query streams with report counts and latest report date
        streams_with_stats = self.db.query(
            ResearchStream,
            func.count(Report.report_id).label('report_count'),
            func.max(Report.created_at).label('latest_report_date')
        ).outerjoin(
            Report,
            and_(
                Report.research_stream_id == ResearchStream.stream_id,
                Report.user_id == user_id
            )
        ).filter(
            ResearchStream.user_id == user_id
        ).group_by(
            ResearchStream.stream_id
        ).order_by(
            ResearchStream.created_at.desc()
        ).all()

        # Convert to list of dicts with report_count and latest_report_date included
        result = []
        for stream, report_count, latest_report_date in streams_with_stats:
            stream_dict = ResearchStreamSchema.from_orm(stream).dict()
            stream_dict['report_count'] = report_count
            stream_dict['latest_report_date'] = latest_report_date.isoformat() if latest_report_date else None
            result.append(stream_dict)

        return result

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
        purpose: str,
        channels: List[Dict[str, Any]],
        report_frequency: ReportFrequency = ReportFrequency.WEEKLY,
        scoring_config: Optional[Dict[str, Any]] = None
    ) -> ResearchStream:
        """Create a new research stream with channel-based structure"""

        research_stream = ResearchStream(
            user_id=user_id,
            stream_name=stream_name,
            purpose=purpose,
            channels=channels,
            report_frequency=report_frequency,
            scoring_config=scoring_config,
            workflow_config=None,  # Auto-generated on first report
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