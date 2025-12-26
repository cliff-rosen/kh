"""
Service for managing article notes with JSON storage and visibility control.
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime
import uuid
import logging

from models import User, ReportArticleAssociation, Report

logger = logging.getLogger(__name__)


class NotesService:
    """Service for managing article notes."""

    def __init__(self, db: Session):
        self.db = db

    def _get_article_association(
        self,
        report_id: int,
        article_id: int,
        user: User
    ) -> Optional[ReportArticleAssociation]:
        """Get the report-article association, verifying user access."""
        # Verify report belongs to a stream the user can access
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            return None

        # Get the association
        association = self.db.query(ReportArticleAssociation).filter(
            and_(
                ReportArticleAssociation.report_id == report_id,
                ReportArticleAssociation.article_id == article_id
            )
        ).first()

        return association

    def get_notes(
        self,
        report_id: int,
        article_id: int,
        user: User
    ) -> List[dict]:
        """
        Get all visible notes for an article.

        User can see:
        - Their own notes (personal and shared)
        - Shared notes from users in the same organization
        """
        association = self._get_article_association(report_id, article_id, user)
        if not association:
            return []

        # Parse existing notes (handle both string and list formats)
        existing_notes = association.notes
        if not existing_notes:
            return []

        if isinstance(existing_notes, str):
            # Legacy format - single text note, convert to list
            return [{
                "id": str(uuid.uuid4()),
                "user_id": 0,  # Unknown user for legacy notes
                "author_name": "Legacy",
                "content": existing_notes,
                "visibility": "shared",
                "created_at": association.added_at.isoformat() if association.added_at else datetime.utcnow().isoformat(),
                "updated_at": association.added_at.isoformat() if association.added_at else datetime.utcnow().isoformat()
            }]

        if not isinstance(existing_notes, list):
            return []

        # Filter notes by visibility
        visible_notes = []
        for note in existing_notes:
            if not isinstance(note, dict):
                continue

            note_user_id = note.get("user_id")
            visibility = note.get("visibility", "personal")

            # User can see their own notes
            if note_user_id == user.user_id:
                visible_notes.append(note)
            # User can see shared notes from their org
            elif visibility == "shared" and user.org_id:
                # Check if note author is in same org
                author = self.db.query(User).filter(User.user_id == note_user_id).first()
                if author and author.org_id == user.org_id:
                    visible_notes.append(note)

        return visible_notes

    def create_note(
        self,
        report_id: int,
        article_id: int,
        user: User,
        content: str,
        visibility: str = "personal"
    ) -> Optional[dict]:
        """Create a new note on an article."""
        association = self._get_article_association(report_id, article_id, user)
        if not association:
            return None

        # Parse existing notes
        existing_notes = association.notes
        if not existing_notes:
            existing_notes = []
        elif isinstance(existing_notes, str):
            # Convert legacy string to list format
            legacy_note = {
                "id": str(uuid.uuid4()),
                "user_id": 0,
                "author_name": "Legacy",
                "content": existing_notes,
                "visibility": "shared",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            existing_notes = [legacy_note]

        # Create new note
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
        association.notes = existing_notes
        self.db.commit()

        return new_note

    def update_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User,
        content: Optional[str] = None,
        visibility: Optional[str] = None
    ) -> Optional[dict]:
        """Update an existing note. Only the author can update their note."""
        association = self._get_article_association(report_id, article_id, user)
        if not association:
            return None

        existing_notes = association.notes
        if not existing_notes or not isinstance(existing_notes, list):
            return None

        # Find and update the note
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
                association.notes = existing_notes
                self.db.commit()

                return note

        return None

    def delete_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User
    ) -> bool:
        """Delete a note. Only the author can delete their note."""
        association = self._get_article_association(report_id, article_id, user)
        if not association:
            return False

        existing_notes = association.notes
        if not existing_notes or not isinstance(existing_notes, list):
            return False

        # Find and remove the note
        for i, note in enumerate(existing_notes):
            if not isinstance(note, dict):
                continue

            if note.get("id") == note_id:
                # Only author can delete
                if note.get("user_id") != user.user_id:
                    return False

                existing_notes.pop(i)
                association.notes = existing_notes
                self.db.commit()

                return True

        return False
