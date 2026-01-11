"""
Research Stream service for managing research streams
"""

import logging
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, date
from fastapi import HTTPException, status

from models import (
    ResearchStream, Report, User, UserRole, StreamScope,
    OrgStreamSubscription, UserStreamSubscription
)
from services.user_service import UserService

logger = logging.getLogger(__name__)
from schemas.research_stream import ResearchStream as ResearchStreamSchema
from schemas.research_stream import StreamType, ReportFrequency, StreamScope as StreamScopeSchema


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
        self._user_service: Optional[UserService] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    def _get_accessible_stream_ids(self, user: User) -> Set[int]:
        """
        Get all stream IDs that a user can access.
        This is the core access control function.

        Access rules by role:
        - PLATFORM_ADMIN: All global streams + own personal streams
        - ORG_ADMIN: All org streams for their org + subscribed global streams + own personal
        - MEMBER: Subscribed org streams + subscribed global streams (via org) + own personal
        """
        accessible_ids = set()

        # 1. Personal streams (user owns) - same for all roles
        personal_streams = self.db.query(ResearchStream.stream_id).filter(
            and_(
                ResearchStream.scope == StreamScope.PERSONAL,
                ResearchStream.user_id == user.user_id
            )
        ).all()
        accessible_ids.update(s[0] for s in personal_streams)

        # 2. Handle based on role
        if user.role == UserRole.PLATFORM_ADMIN:
            # Platform admins see ALL global streams (they manage them)
            global_streams = self.db.query(ResearchStream.stream_id).filter(
                ResearchStream.scope == StreamScope.GLOBAL
            ).all()
            accessible_ids.update(s[0] for s in global_streams)

        elif user.role == UserRole.ORG_ADMIN and user.org_id:
            # Org admins see ALL org streams for their org (they manage them)
            org_streams = self.db.query(ResearchStream.stream_id).filter(
                and_(
                    ResearchStream.scope == StreamScope.ORGANIZATION,
                    ResearchStream.org_id == user.org_id
                )
            ).all()
            accessible_ids.update(s[0] for s in org_streams)

            # Plus global streams their org is subscribed to
            org_subscribed_global = self.db.query(OrgStreamSubscription.stream_id).filter(
                OrgStreamSubscription.org_id == user.org_id
            ).all()
            accessible_ids.update(s[0] for s in org_subscribed_global)

        else:
            # Regular members: subscribed org streams only
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

            # Plus global streams (org subscribed AND user not opted out)
            if user.org_id:
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

    def get_stream_or_404(self, stream_id: int) -> ResearchStream:
        """
        Get a research stream by ID, raising 404 if not found.

        This is a raw lookup without access checks - use for internal operations
        where access is verified separately.

        Args:
            stream_id: The stream ID to look up

        Returns:
            ResearchStream model instance

        Raises:
            HTTPException: 404 if stream not found
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )
        return stream

    def get_user_research_streams(self, user_id: int) -> List[Dict[str, Any]]:
        """
        Get all research streams accessible to a user with report counts and latest report date.
        This includes personal streams, subscribed org streams, and global streams (via org subscription).
        """
        # Get the user for access control
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            return []

        # Get accessible stream IDs
        accessible_ids = self._get_accessible_stream_ids(user)

        if not accessible_ids:
            return []

        # Query streams with report counts and latest report date
        streams_with_stats = self.db.query(
            ResearchStream,
            func.count(Report.report_id).label('report_count'),
            func.max(Report.created_at).label('latest_report_date')
        ).outerjoin(
            Report,
            Report.research_stream_id == ResearchStream.stream_id
        ).filter(
            ResearchStream.stream_id.in_(accessible_ids)
        ).group_by(
            ResearchStream.stream_id
        ).order_by(
            ResearchStream.scope,  # Group by scope (personal, org, global)
            ResearchStream.stream_name
        ).all()

        # Convert to list of dicts with report_count and latest_report_date included
        result = []
        for stream, report_count, latest_report_date in streams_with_stats:
            stream_dict = ResearchStreamSchema.model_validate(stream).model_dump()
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
        # Get the user for access control
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Check if user has access to this stream
        accessible_ids = self._get_accessible_stream_ids(user)

        if stream_id not in accessible_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema - this parses nested objects like SemanticSpace
        return ResearchStreamSchema.model_validate(stream)

    def create_research_stream(
        self,
        user_id: int,
        stream_name: str,
        purpose: str,
        semantic_space: Dict[str, Any],
        retrieval_config: Dict[str, Any],
        presentation_config: Dict[str, Any],
        schedule_config: Optional[Dict[str, Any]] = None,
        chat_instructions: Optional[str] = None,
        scope: StreamScope = StreamScope.PERSONAL,
        org_id: Optional[int] = None
    ) -> ResearchStream:
        """
        Create a new research stream with three-layer architecture.

        Args:
            user_id: The user creating the stream
            scope: StreamScope.PERSONAL (default), ORGANIZATION, or GLOBAL
            org_id: Required for personal/org streams, NULL for global streams

        For personal streams: user_id is set as owner, org_id is set from user's org
        For org streams: user_id is NULL (no owner), org_id is the org
        For global streams: user_id and org_id are both NULL (platform admin only)
        """
        # Get the user for org_id (if creating personal stream)
        user = self.user_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Determine the correct user_id, org_id based on scope
        stream_user_id = None
        stream_org_id = org_id

        if scope == StreamScope.PERSONAL:
            stream_user_id = user_id
            stream_org_id = user.org_id  # Personal streams use user's org
        elif scope == StreamScope.ORGANIZATION:
            stream_user_id = None  # Org streams have no owner
            if not org_id:
                stream_org_id = user.org_id  # Default to user's org
        elif scope == StreamScope.GLOBAL:
            # Only platform admins can create global streams
            if user.role != UserRole.PLATFORM_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only platform admins can create global streams"
                )
            stream_user_id = None
            stream_org_id = None

        # Serialize datetime objects in JSON fields
        semantic_space = serialize_json_data(semantic_space)
        retrieval_config = serialize_json_data(retrieval_config)
        presentation_config = serialize_json_data(presentation_config)

        research_stream = ResearchStream(
            scope=scope,
            org_id=stream_org_id,
            user_id=stream_user_id,
            created_by=user_id,  # Always track who created it
            stream_name=stream_name,
            purpose=purpose,
            schedule_config=schedule_config,
            chat_instructions=chat_instructions,
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

    def get_enrichment_config(self, stream_id: int) -> Optional[Dict[str, Any]]:
        """
        Get enrichment config for a stream.

        Args:
            stream_id: Research stream ID

        Returns:
            Enrichment config dict or None if not set
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        return stream.enrichment_config

    def update_enrichment_config(
        self,
        stream_id: int,
        enrichment_config: Optional[Dict[str, Any]]
    ) -> None:
        """
        Update enrichment config for a stream.

        Args:
            stream_id: Research stream ID
            enrichment_config: New enrichment config dict, or None to reset to defaults
        """
        from sqlalchemy.orm.attributes import flag_modified

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        logger.info(f"Setting enrichment_config for stream {stream_id}: {enrichment_config}")
        stream.enrichment_config = enrichment_config

        # Always flag as modified since we're updating the column
        flag_modified(stream, "enrichment_config")

        stream.updated_at = datetime.utcnow()
        self.db.commit()
        logger.info(f"Committed enrichment_config for stream {stream_id}")

    # ==================== Admin Methods for Global Streams ====================

    def list_global_streams(self) -> List[ResearchStreamSchema]:
        """
        Get all global streams. For platform admin use.

        Returns:
            List of global ResearchStream schemas
        """
        streams = self.db.query(ResearchStream).filter(
            ResearchStream.scope == StreamScope.GLOBAL
        ).all()

        logger.info(f"Listed {len(streams)} global streams")
        return [ResearchStreamSchema.model_validate(s) for s in streams]

    def get_global_stream(self, stream_id: int) -> Optional[ResearchStreamSchema]:
        """
        Get a specific global stream by ID. For platform admin use.

        Args:
            stream_id: ID of the global stream

        Returns:
            ResearchStream schema if found, None otherwise
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id,
            ResearchStream.scope == StreamScope.GLOBAL
        ).first()

        if stream:
            return ResearchStreamSchema.model_validate(stream)
        return None

    def set_stream_scope_global(self, stream_id: int) -> ResearchStreamSchema:
        """
        Change a stream's scope to global. For platform admin use.

        Args:
            stream_id: ID of stream to promote to global

        Returns:
            Updated ResearchStream schema

        Raises:
            HTTPException: If stream not found
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        # Update scope to global
        stream.scope = StreamScope.GLOBAL
        stream.org_id = None  # Global streams don't belong to an org

        self.db.commit()
        self.db.refresh(stream)

        logger.info(f"Set stream {stream_id} scope to global")
        return ResearchStreamSchema.model_validate(stream)

    def delete_global_stream(self, stream_id: int) -> bool:
        """
        Delete a global stream. For platform admin use.

        Args:
            stream_id: ID of global stream to delete

        Returns:
            True if deleted

        Raises:
            HTTPException: If stream not found or not global
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id,
            ResearchStream.scope == StreamScope.GLOBAL
        ).first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Global stream not found"
            )

        self.db.delete(stream)
        self.db.commit()

        logger.info(f"Deleted global stream {stream_id}")
        return True

    def get_all_streams_with_chat_instructions(self) -> List[Dict[str, Any]]:
        """
        Get all streams with their chat instructions status. For admin chat config.

        Returns:
            List of dicts with stream_id, stream_name, has_instructions, instructions_preview
        """
        streams = self.db.query(ResearchStream).order_by(ResearchStream.stream_name).all()

        result = []
        for stream in streams:
            has_instr = stream.chat_instructions is not None and len(stream.chat_instructions.strip()) > 0
            preview = None
            if has_instr:
                preview = stream.chat_instructions[:200] + "..." if len(stream.chat_instructions) > 200 else stream.chat_instructions

            result.append({
                "stream_id": stream.stream_id,
                "stream_name": stream.stream_name,
                "has_instructions": has_instr,
                "instructions_preview": preview
            })

        logger.info(f"Got chat instructions status for {len(result)} streams")
        return result