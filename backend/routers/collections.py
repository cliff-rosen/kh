"""Collections API endpoints - Custom article groupings"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional

from models import User
from schemas.collection import (
    CollectionCreate, CollectionUpdate, CollectionResponse,
    CollectionArticleAdd
)
from services.collection_service import CollectionService, get_collection_service
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/collections", tags=["collections"])


@router.get("", response_model=List[CollectionResponse])
async def list_collections(
    scope: Optional[str] = None,
    stream_id: Optional[int] = None,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """List all collections visible to the current user."""
    collections = await collection_service.list_collections(
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        stream_id=stream_id,
        scope=scope
    )
    return collections


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    data: CollectionCreate,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Create a new collection."""
    if data.scope == "stream" and not data.stream_id:
        raise HTTPException(status_code=400, detail="stream_id is required for stream-scoped collections")
    result = await collection_service.create_collection(
        name=data.name,
        description=data.description,
        scope=data.scope,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        stream_id=data.stream_id,
    )
    return result


@router.get("/for-article/{article_id}")
async def get_collections_for_article(
    article_id: int,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Get all collections (visible to user) that contain this article."""
    return await collection_service.get_collections_for_article(
        article_id=article_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: int,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Get a collection by ID."""
    result = await collection_service.get_collection(
        collection_id=collection_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Collection not found")
    return result


@router.put("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: int,
    data: CollectionUpdate,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Update collection metadata."""
    result = await collection_service.update_collection(
        collection_id=collection_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        name=data.name,
        description=data.description,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Collection not found")
    return result


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: int,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Delete a collection."""
    success = await collection_service.delete_collection(
        collection_id=collection_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Collection not found")


@router.post("/{collection_id}/articles", status_code=status.HTTP_201_CREATED)
async def add_article_to_collection(
    collection_id: int,
    data: CollectionArticleAdd,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Add an article to a collection."""
    success = await collection_service.add_article(
        collection_id=collection_id,
        article_id=data.article_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"status": "added"}


@router.delete("/{collection_id}/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_article_from_collection(
    collection_id: int,
    article_id: int,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Remove an article from a collection."""
    success = await collection_service.remove_article(
        collection_id=collection_id,
        article_id=article_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Collection not found")


@router.get("/{collection_id}/articles")
async def get_collection_articles(
    collection_id: int,
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user)
):
    """Get all articles in a collection."""
    articles = await collection_service.get_articles(
        collection_id=collection_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if articles is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"articles": articles}
