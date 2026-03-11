"""Collection schemas for request/response validation."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CollectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str = "personal"  # personal | organization | stream
    stream_id: Optional[int] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CollectionResponse(BaseModel):
    collection_id: int
    name: str
    description: Optional[str]
    scope: str
    stream_id: Optional[int]
    article_count: int
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CollectionArticleAdd(BaseModel):
    article_id: int


class CollectionDetailResponse(CollectionResponse):
    """Collection with its articles included."""
    pass
