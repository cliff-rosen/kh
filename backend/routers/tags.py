"""Tags API endpoints - Article labeling and filtering"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional

from models import User
from schemas.tag import (
    TagCreate, TagUpdate, TagResponse,
    TagAssignment, ArticleTagResponse
)
from services.tag_service import TagService, get_tag_service
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=List[TagResponse])
async def list_tags(
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """List all tags visible to the current user."""
    tags = await tag_service.list_tags(
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    return tags


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    data: TagCreate,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Create a new tag."""
    try:
        result = await tag_service.create_tag(
            name=data.name,
            scope=data.scope,
            user_id=current_user.user_id,
            org_id=current_user.org_id,
            color=data.color,
            user_role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        )
        return result
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: int,
    data: TagUpdate,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Update tag metadata."""
    result = await tag_service.update_tag(
        tag_id=tag_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        user_role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        name=data.name,
        color=data.color,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Tag not found")
    return result


@router.post("/assign", status_code=status.HTTP_201_CREATED)
async def assign_tags(
    data: TagAssignment,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Assign tag(s) to article(s)."""
    count = await tag_service.bulk_assign_tags(
        tag_ids=data.tag_ids,
        article_ids=data.article_ids,
        user_id=current_user.user_id,
    )
    return {"assigned": count}


@router.delete("/assign")
async def unassign_tag(
    tag_id: int,
    article_id: int,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Remove a tag from an article."""
    await tag_service.unassign_tag(
        tag_id=tag_id,
        article_id=article_id,
    )
    return {"status": "removed"}


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: int,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Delete a tag and all its assignments."""
    success = await tag_service.delete_tag(
        tag_id=tag_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        user_role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")


@router.get("/batch")
async def get_tags_for_articles(
    article_ids: str,  # comma-separated article IDs
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Get tags for multiple articles at once. Returns {article_id: [tags]}."""
    parsed_ids = [int(aid.strip()) for aid in article_ids.split(",") if aid.strip()]
    if not parsed_ids:
        return {}
    return await tag_service.get_tags_for_articles(
        article_ids=parsed_ids,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )


@router.get("/aggregate")
async def get_aggregate_tags(
    report_id: Optional[int] = None,
    collection_id: Optional[int] = None,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Get tags used across articles in a report or collection, with counts."""
    tags = await tag_service.get_aggregate_tags(
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        report_id=report_id,
        collection_id=collection_id,
    )
    return tags


@router.get("/articles/{article_id}", response_model=List[ArticleTagResponse])
async def get_article_tags(
    article_id: int,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Get all visible tags for an article."""
    tags = await tag_service.get_article_tags(
        article_id=article_id,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
    )
    return tags


@router.get("/search")
async def search_articles_by_tags(
    tag_ids: str,  # comma-separated tag IDs
    stream_id: Optional[int] = None,
    report_id: Optional[int] = None,
    tag_service: TagService = Depends(get_tag_service),
    current_user: User = Depends(get_current_user)
):
    """Get articles matching given tags."""
    parsed_tag_ids = [int(tid.strip()) for tid in tag_ids.split(",") if tid.strip()]
    if not parsed_tag_ids:
        return {"articles": []}

    articles = await tag_service.get_articles_by_tags(
        tag_ids=parsed_tag_ids,
        user_id=current_user.user_id,
        org_id=current_user.org_id,
        stream_id=stream_id,
        report_id=report_id,
    )
    return {"articles": articles}
