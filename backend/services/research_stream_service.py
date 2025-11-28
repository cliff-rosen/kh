"""
Research Stream service for managing research streams
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from fastapi import HTTPException, status

from models import ResearchStream, Report
from schemas.research_stream import ResearchStream as ResearchStreamSchema
from schemas.research_stream import StreamType, ReportFrequency


def serialize_json_data(data: Any) -> Any:
    """
    Recursively serialize datetime objects to ISO format strings in nested structures.
    This is needed for JSON columns that may contain datetime objects.
    """
    if isinstance(data, (datetime, date)):
        return data.isoformat()
    elif isinstance(data, dict):
        return {key: serialize_json_data(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [serialize_json_data(item) for item in data]
    else:
        return data


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

    def get_research_stream(self, stream_id: int, user_id: int) -> ResearchStreamSchema:
        """
        Get a specific research stream by ID for a user.
        Returns a Pydantic schema with properly parsed nested objects.

        Raises:
            HTTPException: 404 if stream not found or user doesn't have access
        """
        stream = self.db.query(ResearchStream).filter(
            and_(
                ResearchStream.stream_id == stream_id,
                ResearchStream.user_id == user_id
            )
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema - this parses nested objects like SemanticSpace
        return ResearchStreamSchema.from_orm(stream)

    def create_research_stream(
        self,
        user_id: int,
        stream_name: str,
        purpose: str,
        report_frequency: ReportFrequency,
        semantic_space: Dict[str, Any],
        retrieval_config: Dict[str, Any],
        presentation_config: Dict[str, Any]
    ) -> ResearchStream:
        """Create a new research stream with three-layer architecture"""

        # Serialize datetime objects in JSON fields
        semantic_space = serialize_json_data(semantic_space)
        retrieval_config = serialize_json_data(retrieval_config)
        presentation_config = serialize_json_data(presentation_config)

        research_stream = ResearchStream(
            user_id=user_id,
            stream_name=stream_name,
            purpose=purpose,
            report_frequency=report_frequency,
            semantic_space=semantic_space,
            retrieval_config=retrieval_config,
            presentation_config=presentation_config,
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
        from sqlalchemy.orm.attributes import flag_modified

        research_stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not research_stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        # JSON fields that need datetime serialization
        json_fields = [
            'semantic_space',
            'retrieval_config',
            'presentation_config',
            'workflow_config',
            'scoring_config',
            'categories',
            'audience',
            'intended_guidance',
            'global_inclusion',
            'global_exclusion'
        ]

        # Update fields
        for field, value in update_data.items():
            if hasattr(research_stream, field):
                # Serialize datetime objects in JSON fields
                if field in json_fields and value is not None:
                    value = serialize_json_data(value)

                setattr(research_stream, field, value)

                # Flag mutable fields (like JSON/dict) as modified so SQLAlchemy tracks them
                if field in json_fields:
                    flag_modified(research_stream, field)

        research_stream.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(research_stream)
        return research_stream

    def update_broad_query(
        self,
        stream_id: int,
        query_index: int,
        query_expression: str
    ) -> ResearchStream:
        """
        Update a specific broad query's expression.

        Args:
            stream_id: Research stream ID
            query_index: Index of the query to update (0-based)
            query_expression: Updated query expression

        Returns:
            Updated ResearchStream
        """
        from sqlalchemy.orm.attributes import flag_modified

        research_stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not research_stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        # Get retrieval config
        retrieval_config = research_stream.retrieval_config or {}
        broad_search = retrieval_config.get("broad_search", {})
        queries = broad_search.get("queries", [])

        # Validate query index
        if query_index < 0 or query_index >= len(queries):
            raise ValueError(f"Query index {query_index} out of range (0-{len(queries)-1})")

        # Update the query expression
        queries[query_index]["query_expression"] = query_expression

        # Save back to database
        broad_search["queries"] = queries
        retrieval_config["broad_search"] = broad_search
        research_stream.retrieval_config = retrieval_config

        # Mark as modified so SQLAlchemy tracks the change
        flag_modified(research_stream, "retrieval_config")
        research_stream.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(research_stream)
        return research_stream

    def update_semantic_filter(
        self,
        stream_id: int,
        query_index: int,
        enabled: bool,
        criteria: str,
        threshold: float
    ) -> ResearchStream:
        """
        Update semantic filter configuration for a specific broad query.

        Args:
            stream_id: Research stream ID
            query_index: Index of the query whose filter to update (0-based)
            enabled: Whether semantic filter is enabled
            criteria: Natural language filter criteria
            threshold: Relevance threshold (0.0-1.0)

        Returns:
            Updated ResearchStream
        """
        from sqlalchemy.orm.attributes import flag_modified

        research_stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not research_stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        # Get retrieval config
        retrieval_config = research_stream.retrieval_config or {}
        broad_search = retrieval_config.get("broad_search", {})
        queries = broad_search.get("queries", [])

        # Validate query index
        if query_index < 0 or query_index >= len(queries):
            raise ValueError(f"Query index {query_index} out of range (0-{len(queries)-1})")

        # Update the semantic filter
        queries[query_index]["semantic_filter"] = {
            "enabled": enabled,
            "criteria": criteria,
            "threshold": threshold
        }

        # Save back to database
        broad_search["queries"] = queries
        retrieval_config["broad_search"] = broad_search
        research_stream.retrieval_config = retrieval_config

        # Mark as modified so SQLAlchemy tracks the change
        flag_modified(research_stream, "retrieval_config")
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