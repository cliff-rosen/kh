"""Tag schemas for request/response validation."""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TagCreate(BaseModel):
    name: str
    scope: str = "personal"  # personal | organization
    color: Optional[str] = None


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


class TagResponse(BaseModel):
    tag_id: int
    name: str
    color: Optional[str]
    scope: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class TagAssignment(BaseModel):
    tag_ids: List[int]
    article_ids: List[int]


class TagUnassignment(BaseModel):
    tag_id: int
    article_id: int


class ArticleTagResponse(BaseModel):
    """Tag info as displayed on an article."""
    tag_id: int
    name: str
    color: Optional[str]
    scope: str
