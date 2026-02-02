"""
Help Content Router

API endpoints for browsing help documentation (platform admin only).
Help content comes from YAML files (defaults) with database overrides.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from database import get_async_db
from models import User, ChatConfig
from routers.auth import get_current_user
from services.help_registry import (
    get_all_section_ids,
    get_help_section,
    get_help_toc_for_role,
    reload_help_content,
    get_default_help_section,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/help", tags=["admin-help"])


# ============================================================================
# Response Models
# ============================================================================

class HelpSectionSummary(BaseModel):
    """Summary of a help section for listing."""
    id: str
    title: str
    summary: str
    roles: List[str]
    order: int
    has_override: bool = False


class HelpSectionDetail(BaseModel):
    """Full help section with content."""
    id: str
    title: str
    summary: str
    roles: List[str]
    order: int
    content: str
    has_override: bool = False


class HelpSectionsResponse(BaseModel):
    """Response for listing all help sections."""
    sections: List[HelpSectionSummary]
    total: int


class HelpTOCPreview(BaseModel):
    """Preview of TOC for a specific role."""
    role: str
    toc: str


class HelpSectionUpdate(BaseModel):
    """Request body for updating a help section."""
    content: str


# ============================================================================
# Helper to check platform admin
# ============================================================================

def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role.value != "platform_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return current_user


# ============================================================================
# Database helpers
# ============================================================================

async def get_help_override(db: AsyncSession, section_id: str) -> Optional[str]:
    """Get help content override from database."""
    result = await db.execute(
        select(ChatConfig).where(
            ChatConfig.scope == "help",
            ChatConfig.scope_key == section_id
        )
    )
    config = result.scalars().first()
    return config.instructions if config else None


async def get_all_help_overrides(db: AsyncSession) -> dict[str, bool]:
    """Get a dict of section_id -> has_override for all help sections."""
    result = await db.execute(
        select(ChatConfig.scope_key).where(ChatConfig.scope == "help")
    )
    return {row[0]: True for row in result.all()}


async def save_help_override(
    db: AsyncSession,
    section_id: str,
    content: str,
    user_id: int
) -> None:
    """Save help content override to database."""
    # Check if override already exists
    result = await db.execute(
        select(ChatConfig).where(
            ChatConfig.scope == "help",
            ChatConfig.scope_key == section_id
        )
    )
    config = result.scalars().first()

    if config:
        # Update existing
        config.instructions = content
        config.updated_by = user_id
    else:
        # Create new
        config = ChatConfig(
            scope="help",
            scope_key=section_id,
            instructions=content,
            updated_by=user_id
        )
        db.add(config)

    await db.commit()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/sections", response_model=HelpSectionsResponse)
async def list_help_sections(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpSectionsResponse:
    """
    List all help sections (platform admin only).
    Returns summaries without full content.
    """
    section_ids = get_all_section_ids()
    overrides = await get_all_help_overrides(db)
    sections = []

    for section_id in section_ids:
        # Get section with platform_admin role to see all
        section = get_help_section(section_id, "platform_admin")
        if section:
            sections.append(HelpSectionSummary(
                id=section.id,
                title=section.title,
                summary=section.summary,
                roles=section.roles,
                order=section.order,
                has_override=section_id in overrides
            ))

    # Sort by order, then by id
    sections.sort(key=lambda s: (s.order, s.id))

    return HelpSectionsResponse(sections=sections, total=len(sections))


@router.get("/sections/{section_id:path}", response_model=HelpSectionDetail)
async def get_help_section_detail(
    section_id: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpSectionDetail:
    """
    Get full help section with content (platform admin only).
    Returns database override if exists, otherwise YAML default.
    """
    # Get the base section from YAML (for metadata)
    section = get_help_section(section_id, "platform_admin")

    if not section:
        raise HTTPException(status_code=404, detail=f"Help section '{section_id}' not found")

    # Check for database override
    override_content = await get_help_override(db, section_id)
    has_override = override_content is not None
    content = override_content if has_override else section.content

    return HelpSectionDetail(
        id=section.id,
        title=section.title,
        summary=section.summary,
        roles=section.roles,
        order=section.order,
        content=content,
        has_override=has_override
    )


@router.get("/toc-preview", response_model=List[HelpTOCPreview])
async def preview_help_toc(
    current_user: User = Depends(require_platform_admin)
) -> List[HelpTOCPreview]:
    """
    Preview the help TOC as seen by each role (platform admin only).
    Useful for verifying role-based filtering.
    """
    roles = ["member", "org_admin", "platform_admin"]
    previews = []

    for role in roles:
        toc = get_help_toc_for_role(role)
        previews.append(HelpTOCPreview(role=role, toc=toc or "(empty)"))

    return previews


@router.put("/sections/{section_id:path}", response_model=HelpSectionDetail)
async def update_help_section_content(
    section_id: str,
    update: HelpSectionUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpSectionDetail:
    """
    Update a help section's content (platform admin only).
    Saves as a database override (YAML files remain unchanged).
    """
    # Verify section exists in YAML
    section = get_default_help_section(section_id)
    if not section:
        raise HTTPException(status_code=404, detail=f"Help section '{section_id}' not found")

    try:
        # Save override to database
        await save_help_override(db, section_id, update.content, current_user.user_id)

        return HelpSectionDetail(
            id=section.id,
            title=section.title,
            summary=section.summary,
            roles=section.roles,
            order=section.order,
            content=update.content,
            has_override=True
        )
    except Exception as e:
        logger.error(f"Failed to update help section {section_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sections/{section_id:path}/override")
async def delete_help_section_override(
    section_id: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Delete a help section's database override, reverting to YAML default.
    """
    # Verify section exists
    section = get_default_help_section(section_id)
    if not section:
        raise HTTPException(status_code=404, detail=f"Help section '{section_id}' not found")

    # Delete override if exists
    result = await db.execute(
        select(ChatConfig).where(
            ChatConfig.scope == "help",
            ChatConfig.scope_key == section_id
        )
    )
    config = result.scalars().first()

    if config:
        await db.delete(config)
        await db.commit()
        return {"status": "ok", "message": f"Override deleted for '{section_id}'"}
    else:
        return {"status": "ok", "message": f"No override existed for '{section_id}'"}


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
        section_count = len(get_all_section_ids())
        return {"status": "ok", "sections_loaded": section_count}
    except Exception as e:
        logger.error(f"Failed to reload help content: {e}")
        raise HTTPException(status_code=500, detail=str(e))
