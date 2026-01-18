"""
Service for managing article notes with JSON storage and visibility control.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import uuid
import json
import logging
from fastapi import Depends

from models import User, ReportArticleAssociation, Report
from services.user_service import UserService
from database import get_async_db

logger = logging.getLogger(__name__)


def _parse_notes(notes_str: Optional[str]) -> List[dict]:
    """Parse notes from JSON string stored in Text column."""
    if not notes_str:
        return []

    # Try to parse as JSON array
    try:
        parsed = json.loads(notes_str)
        if isinstance(parsed, list):
            return parsed
        # If it's not a list, treat as legacy single note
        return []
    except (json.JSONDecodeError, TypeError):
        # Not valid JSON - treat as legacy plain text note
        return []


def _serialize_notes(notes: List[dict]) -> str:
    """Serialize notes list to JSON string for storage."""
    return json.dumps(notes)


class NotesService:
    """Service for managing article notes."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    # ==================== Async Methods ====================

    async def _async_get_article_association(
        self,
        report_id: int,
        article_id: int,
        user: User
    ) -> Optional[ReportArticleAssociation]:
        """Get the report-article association (async)."""
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()
        if not report:
            return None

        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        )
        return result.scalars().first()

    async def async_get_notes(
        self,
        report_id: int,
        article_id: int,
        user: User
    ) -> List[dict]:
        """Get all visible notes for an article (async)."""
        association = await self._async_get_article_association(report_id, article_id, user)
        if not association:
            return []

        raw_notes = association.notes
        if not raw_notes:
            return []

        existing_notes = _parse_notes(raw_notes)

        if not existing_notes and raw_notes and isinstance(raw_notes, str):
            return [{
                "id": str(uuid.uuid4()),
                "user_id": 0,
                "author_name": "Legacy",
                "content": raw_notes,
                "visibility": "shared",
                "created_at": association.added_at.isoformat() if association.added_at else datetime.utcnow().isoformat(),
                "updated_at": association.added_at.isoformat() if association.added_at else datetime.utcnow().isoformat()
            }]

        visible_notes = []
        for note in existing_notes:
            if not isinstance(note, dict):
                continue

            note_user_id = note.get("user_id")
            visibility = note.get("visibility", "personal")

            if note_user_id == user.user_id:
                visible_notes.append(note)
            elif visibility == "shared" and user.org_id:
                result = await self.db.execute(
                    select(User).where(User.user_id == note_user_id)
                )
                author = result.scalars().first()
                if author and author.org_id == user.org_id:
                    visible_notes.append(note)

        return visible_notes

    async def async_create_note(
        self,
        report_id: int,
        article_id: int,
        user: User,
        content: str,
        visibility: str = "personal"
    ) -> Optional[dict]:
        """Create a new note on an article (async)."""
        association = await self._async_get_article_association(report_id, article_id, user)
        if not association:
            return None

        raw_notes = association.notes
        existing_notes = _parse_notes(raw_notes) if raw_notes else []

        if not existing_notes and raw_notes and isinstance(raw_notes, str):
            legacy_note = {
                "id": str(uuid.uuid4()),
                "user_id": 0,
                "author_name": "Legacy",
                "content": raw_notes,
                "visibility": "shared",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            existing_notes = [legacy_note]

        now = datetime.utcnow().isoformat()
        new_note = {
            "id": str(uuid.uuid4()),
            "user_id": user.user_id,
            "author_name": user.full_name or user.email.split('@')[0],
            "content": content,
            "visibility": visibility,
            "created_at": now,
            "updated_at": now
        }

        existing_notes.append(new_note)
        association.notes = _serialize_notes(existing_notes)
        await self.db.commit()

        return new_note

    async def async_update_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User,
        content: Optional[str] = None,
        visibility: Optional[str] = None
    ) -> Optional[dict]:
        """Update an existing note (async). Only the author can update their note."""
        association = await self._async_get_article_association(report_id, article_id, user)
        if not association:
            return None

        raw_notes = association.notes
        existing_notes = _parse_notes(raw_notes)
        if not existing_notes:
            return None

        for i, note in enumerate(existing_notes):
            if not isinstance(note, dict):
                continue

            if note.get("id") == note_id:
                # Only author can update
                if note.get("user_id") != user.user_id:
                    return None

                # Update fields
                if content is not None:
                    note["content"] = content
                if visibility is not None:
                    note["visibility"] = visibility
                note["updated_at"] = datetime.utcnow().isoformat()

                existing_notes[i] = note
                association.notes = _serialize_notes(existing_notes)
                await self.db.commit()

                return note

        return None

    async def async_delete_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User
    ) -> bool:
        """Delete a note (async)."""
        association = await self._async_get_article_association(report_id, article_id, user)
        if not association:
            return False

        raw_notes = association.notes
        existing_notes = _parse_notes(raw_notes)
        if not existing_notes:
            return False

        for i, note in enumerate(existing_notes):
            if not isinstance(note, dict):
                continue

            if note.get("id") == note_id:
                if note.get("user_id") != user.user_id:
                    return False

                existing_notes.pop(i)
                association.notes = _serialize_notes(existing_notes)
                await self.db.commit()

                return True

        return False


# Dependency injection provider for async notes service
async def get_async_notes_service(
    db: AsyncSession = Depends(get_async_db)
) -> NotesService:
    """Get a NotesService instance with async database session."""
    return NotesService(db)
