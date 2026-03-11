"""
Notes API endpoints — unified article notes with visibility control.

Notes are associated with articles directly (not reports or collections).
Each note optionally records context_type/context_id for where it was written.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List  # noqa: used by response_model

from models import User
from schemas.note import (
    NoteCreate, NoteUpdate, NoteResponse,
    NotesListResponse
)
from services.notes_service import NotesService, get_notes_service
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("/articles/batch/counts")
async def get_notes_counts_batch(
    article_ids: str,  # comma-separated
    notes_service: NotesService = Depends(get_notes_service),
    current_user: User = Depends(get_current_user),
):
    """Get note counts for multiple articles (for badge display on cards)."""
    parsed_ids = [int(aid.strip()) for aid in article_ids.split(",") if aid.strip()]
    if not parsed_ids:
        return {}
    return await notes_service.get_notes_counts_batch(parsed_ids, current_user)


@router.get("/articles/{article_id}", response_model=NotesListResponse)
async def get_article_notes(
    article_id: int,
    notes_service: NotesService = Depends(get_notes_service),
    current_user: User = Depends(get_current_user),
):
    """Get all visible notes for an article."""
    notes = await notes_service.get_notes(article_id, current_user)
    return NotesListResponse(
        article_id=article_id,
        notes=[NoteResponse(**n) for n in notes],
        total_count=len(notes),
    )


@router.post(
    "/articles/{article_id}",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_note(
    article_id: int,
    data: NoteCreate,
    notes_service: NotesService = Depends(get_notes_service),
    current_user: User = Depends(get_current_user),
):
    """Create a note on an article."""
    note = await notes_service.create_note(
        article_id=article_id,
        user=current_user,
        content=data.content,
        visibility=data.visibility,
        context_type=data.context_type,
        context_id=data.context_id,
    )
    return NoteResponse(**note)


@router.put("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    data: NoteUpdate,
    notes_service: NotesService = Depends(get_notes_service),
    current_user: User = Depends(get_current_user),
):
    """Update a note. Only the author can update."""
    note = await notes_service.update_note(
        note_id=note_id,
        user=current_user,
        content=data.content,
        visibility=data.visibility,
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found or not authorized")
    return NoteResponse(**note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: int,
    notes_service: NotesService = Depends(get_notes_service),
    current_user: User = Depends(get_current_user),
):
    """Delete a note. Only the author can delete."""
    success = await notes_service.delete_note(note_id=note_id, user=current_user)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found or not authorized")
