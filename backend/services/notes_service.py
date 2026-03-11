"""
Service for managing article notes — unified, decoupled from report/collection context.

Notes live on articles directly. Each note optionally records a context_type
('report' or 'collection') and context_id so we know where it was written from.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import logging
from fastapi import Depends

from models import ArticleNote, User
from database import get_async_db

logger = logging.getLogger(__name__)


class NotesService:
    """Service for managing article notes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_notes(
        self,
        article_id: int,
        user: User,
    ) -> List[dict]:
        """Get all visible notes for an article.

        Returns:
        - User's own notes (personal and shared)
        - Shared notes from other users in the same org
        """
        result = await self.db.execute(
            select(ArticleNote, User.full_name, User.email)
            .join(User, ArticleNote.user_id == User.user_id)
            .where(ArticleNote.article_id == article_id)
            .order_by(ArticleNote.created_at.asc())
        )

        visible = []
        for row in result.all():
            note, full_name, email = row
            # Own notes — always visible
            if note.user_id == user.user_id:
                visible.append(self._to_dict(note, full_name, email))
            # Shared notes from same org
            elif note.visibility == "shared" and user.org_id:
                # Check if note author is in same org
                author_result = await self.db.execute(
                    select(User.org_id).where(User.user_id == note.user_id)
                )
                author_org = author_result.scalar()
                if author_org == user.org_id:
                    visible.append(self._to_dict(note, full_name, email))

        return visible

    async def create_note(
        self,
        article_id: int,
        user: User,
        content: str,
        visibility: str = "personal",
        context_type: Optional[str] = None,
        context_id: Optional[int] = None,
    ) -> dict:
        """Create a new note on an article."""
        note = ArticleNote(
            article_id=article_id,
            user_id=user.user_id,
            content=content,
            visibility=visibility,
            context_type=context_type,
            context_id=context_id,
        )
        self.db.add(note)
        await self.db.commit()
        await self.db.refresh(note)

        author_name = user.full_name or user.email.split("@")[0]
        return self._to_dict(note, user.full_name, user.email)

    async def update_note(
        self,
        note_id: int,
        user: User,
        content: Optional[str] = None,
        visibility: Optional[str] = None,
    ) -> Optional[dict]:
        """Update an existing note. Only the author can update."""
        result = await self.db.execute(
            select(ArticleNote).where(ArticleNote.note_id == note_id)
        )
        note = result.scalars().first()
        if not note or note.user_id != user.user_id:
            return None

        if content is not None:
            note.content = content
        if visibility is not None:
            note.visibility = visibility
        note.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(note)

        return self._to_dict(note, user.full_name, user.email)

    async def delete_note(
        self,
        note_id: int,
        user: User,
    ) -> bool:
        """Delete a note. Only the author can delete."""
        result = await self.db.execute(
            select(ArticleNote).where(ArticleNote.note_id == note_id)
        )
        note = result.scalars().first()
        if not note or note.user_id != user.user_id:
            return False

        await self.db.delete(note)
        await self.db.commit()
        return True

    async def get_notes_count(self, article_id: int, user: User) -> int:
        """Get count of visible notes for an article (for badge display)."""
        notes = await self.get_notes(article_id, user)
        return len(notes)

    async def get_notes_counts_batch(self, article_ids: List[int], user: User) -> dict:
        """Batch get note counts for multiple articles."""
        if not article_ids:
            return {}

        result = await self.db.execute(
            select(ArticleNote)
            .where(ArticleNote.article_id.in_(article_ids))
        )
        all_notes = result.scalars().all()

        counts: dict = {aid: 0 for aid in article_ids}
        for note in all_notes:
            # Apply same visibility rules
            if note.user_id == user.user_id:
                counts[note.article_id] = counts.get(note.article_id, 0) + 1
            elif note.visibility == "shared":
                counts[note.article_id] = counts.get(note.article_id, 0) + 1

        return {k: v for k, v in counts.items() if v > 0}

    def _to_dict(self, note: ArticleNote, full_name: Optional[str], email: Optional[str]) -> dict:
        author_name = full_name or (email.split("@")[0] if email else "Unknown")
        return {
            "note_id": note.note_id,
            "article_id": note.article_id,
            "user_id": note.user_id,
            "author_name": author_name,
            "content": note.content,
            "visibility": note.visibility,
            "context_type": note.context_type,
            "context_id": note.context_id,
            "created_at": note.created_at.isoformat() if note.created_at else None,
            "updated_at": note.updated_at.isoformat() if note.updated_at else None,
        }


# Dependency injection provider
async def get_notes_service(
    db: AsyncSession = Depends(get_async_db)
) -> NotesService:
    return NotesService(db)
