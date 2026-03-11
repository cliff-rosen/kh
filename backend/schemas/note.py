"""Article notes schemas for request/response validation."""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class NoteCreate(BaseModel):
    content: str
    visibility: str = "personal"  # personal | shared
    context_type: Optional[str] = None  # report | collection | None
    context_id: Optional[int] = None


class NoteUpdate(BaseModel):
    content: Optional[str] = None
    visibility: Optional[str] = None


class NoteResponse(BaseModel):
    note_id: int
    article_id: int
    user_id: int
    author_name: str
    content: str
    visibility: str
    context_type: Optional[str] = None
    context_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NotesListResponse(BaseModel):
    article_id: int
    notes: List[NoteResponse]
    total_count: int


