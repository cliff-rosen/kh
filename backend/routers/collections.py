"""Collections API endpoints - Custom article groupings"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from models import User, Article, Collection, CollectionArticle
from schemas.collection import (
    CollectionCreate, CollectionUpdate, CollectionResponse,
    CollectionArticleAdd
)
from schemas.explorer import OverlapCheckRequest, OverlapCheckResponse, OverlapArticleSummary
from services.collection_service import CollectionService, get_collection_service
from routers.auth import get_current_user
from database import get_async_db

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


@router.post("/{collection_id}/check-overlap", response_model=OverlapCheckResponse)
async def check_overlap(
    collection_id: int,
    data: OverlapCheckRequest,
    db: AsyncSession = Depends(get_async_db),
    collection_service: CollectionService = Depends(get_collection_service),
    current_user: User = Depends(get_current_user),
):
    """
    Check which of the given article_ids already exist in this collection.

    Returns overlap/new article lists and projected final count.
    """
    # Verify collection exists and user has access
    coll_data = await collection_service.get_collection(
        collection_id=collection_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    if not coll_data:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Count existing articles in the collection
    existing_count_result = await db.execute(
        select(func.count(CollectionArticle.article_id))
        .where(CollectionArticle.collection_id == collection_id)
    )
    existing_count = existing_count_result.scalar() or 0

    if not data.article_ids:
        return OverlapCheckResponse(
            collection_name=coll_data["name"],
            existing_count=existing_count,
            selected_count=0,
            new_ids=[],
            overlap_ids=[],
            new_articles=[],
            overlap_articles=[],
            final_count=existing_count,
        )

    # Find which of the provided article_ids already exist in this collection
    overlap_result = await db.execute(
        select(CollectionArticle.article_id)
        .where(
            CollectionArticle.collection_id == collection_id,
            CollectionArticle.article_id.in_(data.article_ids),
        )
    )
    overlap_ids_set = {row[0] for row in overlap_result.all()}

    overlap_ids = [aid for aid in data.article_ids if aid in overlap_ids_set]
    new_ids = [aid for aid in data.article_ids if aid not in overlap_ids_set]

    # Fetch article summaries for both sets
    all_ids = list(set(data.article_ids))
    articles_result = await db.execute(
        select(Article.article_id, Article.title, Article.authors)
        .where(Article.article_id.in_(all_ids))
    )
    article_info = {row[0]: (row[1], row[2]) for row in articles_result.all()}

    new_articles = [
        OverlapArticleSummary(
            article_id=aid,
            title=article_info.get(aid, ("Unknown", []))[0],
            authors=article_info.get(aid, ("Unknown", []))[1] or [],
        )
        for aid in new_ids
    ]
    overlap_articles = [
        OverlapArticleSummary(
            article_id=aid,
            title=article_info.get(aid, ("Unknown", []))[0],
            authors=article_info.get(aid, ("Unknown", []))[1] or [],
        )
        for aid in overlap_ids
    ]

    return OverlapCheckResponse(
        collection_name=coll_data["name"],
        existing_count=existing_count,
        selected_count=len(data.article_ids),
        new_ids=new_ids,
        overlap_ids=overlap_ids,
        new_articles=new_articles,
        overlap_articles=overlap_articles,
        final_count=existing_count + len(new_ids),
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
