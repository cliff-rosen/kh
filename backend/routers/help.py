"""
Help Content Router

API endpoints for browsing and editing help documentation (platform admin only).

Help content is organized by CATEGORY (e.g., "reports", "streams", "tools").
Each category contains multiple TOPICS (e.g., "overview", "viewing", "tablizer").

Content defaults come from YAML files. Database overrides are stored in
the `help_content_override` table and take precedence over YAML defaults.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from database import get_async_db
from models import User, HelpContentOverride
from routers.auth import get_current_user
from services.help_registry import (
    get_all_topic_ids,
    get_all_categories,
    get_topics_by_category,
    get_topic,
    get_help_toc_for_role,
    reload_help_content,
    get_default_topic,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/help", tags=["admin-help"])


# ============================================================================
# Response Models
# ============================================================================

class HelpTopicContent(BaseModel):
    """A single help topic with its content."""
    category: str
    topic: str
    title: str
    summary: str
    roles: List[str]
    order: int
    content: str
    has_override: bool = False


class HelpCategorySummary(BaseModel):
    """Summary of a help category for listing."""
    category: str
    label: str
    topic_count: int
    override_count: int


class HelpCategoryDetail(BaseModel):
    """Full help category with all topics."""
    category: str
    label: str
    topics: List[HelpTopicContent]


class HelpCategoriesResponse(BaseModel):
    """Response for listing all help categories."""
    categories: List[HelpCategorySummary]
    total_topics: int
    total_overrides: int


class HelpTopicUpdate(BaseModel):
    """Update for a single topic."""
    category: str
    topic: str
    content: str


class HelpCategoryUpdate(BaseModel):
    """Request body for bulk updating topics in a category."""
    topics: List[HelpTopicUpdate]


class HelpTOCPreview(BaseModel):
    """Preview of TOC for a specific role."""
    role: str
    toc: str


# ============================================================================
# Helpers
# ============================================================================

def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role.value != "platform_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return current_user


def get_category_label(category: str) -> str:
    """Get human-readable label for a category."""
    labels = {
        'general': 'Getting Started',
        'reports': 'Reports',
        'streams': 'Streams',
        'tools': 'Tools',
        'operations': 'Operations',
    }
    return labels.get(category, category.replace('-', ' ').title())


async def get_all_overrides(db: AsyncSession) -> Dict[str, str]:
    """Get all help content overrides as a dict of 'category/topic' -> content."""
    result = await db.execute(select(HelpContentOverride))
    return {f"{row.category}/{row.topic}": row.content for row in result.scalars().all()}


async def save_override(
    db: AsyncSession,
    category: str,
    topic: str,
    content: str,
    user_id: int
) -> None:
    """Save a help content override."""
    from sqlalchemy import and_
    result = await db.execute(
        select(HelpContentOverride).where(
            and_(
                HelpContentOverride.category == category,
                HelpContentOverride.topic == topic
            )
        )
    )
    existing = result.scalars().first()

    if existing:
        existing.content = content
        existing.updated_by = user_id
    else:
        override = HelpContentOverride(
            category=category,
            topic=topic,
            content=content,
            updated_by=user_id
        )
        db.add(override)


async def delete_override(db: AsyncSession, category: str, topic: str) -> bool:
    """Delete a help content override. Returns True if existed."""
    from sqlalchemy import and_
    result = await db.execute(
        select(HelpContentOverride).where(
            and_(
                HelpContentOverride.category == category,
                HelpContentOverride.topic == topic
            )
        )
    )
    existing = result.scalars().first()
    if existing:
        await db.delete(existing)
        return True
    return False


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/categories", response_model=HelpCategoriesResponse)
async def list_help_categories(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoriesResponse:
    """
    List all help categories with topic counts.
    """
    categories = get_all_categories()
    overrides = await get_all_overrides(db)

    # Build category summaries
    category_summaries = []
    total_topics = 0
    total_overrides = 0

    for category in categories:
        sections = get_topics_by_category(category)
        topic_count = len(sections)
        override_count = sum(1 for s in sections if s.id in overrides)

        total_topics += topic_count
        total_overrides += override_count

        category_summaries.append(HelpCategorySummary(
            category=category,
            label=get_category_label(category),
            topic_count=topic_count,
            override_count=override_count
        ))

    return HelpCategoriesResponse(
        categories=category_summaries,
        total_topics=total_topics,
        total_overrides=total_overrides
    )


@router.get("/categories/{category}", response_model=HelpCategoryDetail)
async def get_help_category(
    category: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoryDetail:
    """
    Get all topics in a help category with full content.
    """
    sections = get_topics_by_category(category)
    if not sections:
        raise HTTPException(status_code=404, detail=f"Help category '{category}' not found")

    overrides = await get_all_overrides(db)

    # Build topic list
    topics = []
    for section in sections:
        has_override = section.id in overrides
        content = overrides[section.id] if has_override else section.content

        topics.append(HelpTopicContent(
            category=section.category,
            topic=section.topic,
            title=section.title,
            summary=section.summary,
            roles=section.roles,
            order=section.order,
            content=content,
            has_override=has_override
        ))

    return HelpCategoryDetail(
        category=category,
        label=get_category_label(category),
        topics=topics
    )


@router.get("/categories/{category}/topics/{topic}", response_model=HelpTopicContent)
async def get_help_topic(
    category: str,
    topic: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTopicContent:
    """
    Get a single help topic by category and topic name.
    """
    section = get_topic(category, topic)
    if not section:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    overrides = await get_all_overrides(db)
    has_override = section.id in overrides
    content = overrides[section.id] if has_override else section.content

    return HelpTopicContent(
        category=section.category,
        topic=section.topic,
        title=section.title,
        summary=section.summary,
        roles=section.roles,
        order=section.order,
        content=content,
        has_override=has_override
    )


@router.put("/categories/{category}", response_model=HelpCategoryDetail)
async def update_help_category(
    category: str,
    update: HelpCategoryUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoryDetail:
    """
    Bulk update topics in a help category.
    Only topics included in the request are updated.
    """
    # Verify all topics exist and belong to this category
    for topic_update in update.topics:
        if topic_update.category != category:
            raise HTTPException(
                status_code=400,
                detail=f"Topic '{topic_update.category}/{topic_update.topic}' does not belong to category '{category}'"
            )

        section = get_topic(topic_update.category, topic_update.topic)
        if not section:
            raise HTTPException(
                status_code=404,
                detail=f"Topic '{topic_update.category}/{topic_update.topic}' not found"
            )

    # Save all overrides
    try:
        for topic_update in update.topics:
            default_topic = get_topic(topic_update.category, topic_update.topic)

            if default_topic and topic_update.content == default_topic.content:
                # Content matches default - delete override if exists
                await delete_override(db, topic_update.category, topic_update.topic)
            else:
                # Content differs - save override
                await save_override(db, topic_update.category, topic_update.topic, topic_update.content, current_user.user_id)

        await db.commit()
    except Exception as e:
        logger.error(f"Failed to update help category {category}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Return updated category
    return await get_help_category(category, current_user, db)


@router.put("/categories/{category}/topics/{topic}", response_model=HelpTopicContent)
async def update_help_topic(
    category: str,
    topic: str,
    content: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTopicContent:
    """
    Update a single help topic.
    """
    topic_data = get_topic(category, topic)
    if not topic_data:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    try:
        if topic_data and content == topic_data.content:
            await delete_override(db, category, topic)
        else:
            await save_override(db, category, topic, content, current_user.user_id)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to update help topic {category}/{topic}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return await get_help_topic(category, topic, current_user, db)


@router.delete("/categories/{category}/overrides")
async def reset_help_category(
    category: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Delete all overrides in a help category, reverting all topics to defaults.
    """
    topics = get_topics_by_category(category)

    deleted_count = 0
    for topic_data in topics:
        if await delete_override(db, topic_data.category, topic_data.topic):
            deleted_count += 1

    await db.commit()

    return {
        "status": "ok",
        "category": category,
        "overrides_deleted": deleted_count
    }


@router.delete("/categories/{category}/topics/{topic}/override")
async def reset_help_topic(
    category: str,
    topic: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Delete the override for a single topic, reverting to default.
    """
    topic_data = get_topic(category, topic)
    if not topic_data:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    deleted = await delete_override(db, category, topic)
    await db.commit()

    return {
        "status": "ok",
        "category": category,
        "topic": topic,
        "override_deleted": deleted
    }


@router.get("/toc-preview", response_model=List[HelpTOCPreview])
async def preview_help_toc(
    current_user: User = Depends(require_platform_admin)
) -> List[HelpTOCPreview]:
    """
    Preview the help TOC as seen by each role (platform admin only).
    """
    roles = ["member", "org_admin", "platform_admin"]
    previews = []

    for role in roles:
        toc = get_help_toc_for_role(role)
        previews.append(HelpTOCPreview(role=role, toc=toc or "(empty)"))

    return previews


@router.post("/reload")
async def reload_help(
    current_user: User = Depends(require_platform_admin)
) -> dict:
    """
    Reload help content from YAML files (platform admin only).
    Clears the in-memory cache. Database overrides are not affected.
    """
    try:
        reload_help_content()
        topic_count = len(get_all_topic_ids())
        return {"status": "ok", "topics_loaded": topic_count}
    except Exception as e:
        logger.error(f"Failed to reload help content: {e}")
        raise HTTPException(status_code=500, detail=str(e))
