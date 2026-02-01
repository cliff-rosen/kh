"""
Help Content Router

API endpoints for browsing help documentation (platform admin only).
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import logging

from models import User
from routers.auth import get_current_user
from services.help_registry import (
    get_all_section_ids,
    get_help_section,
    get_help_toc_for_role,
    reload_help_content,
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


class HelpSectionDetail(BaseModel):
    """Full help section with content."""
    id: str
    title: str
    summary: str
    roles: List[str]
    order: int
    content: str


class HelpSectionsResponse(BaseModel):
    """Response for listing all help sections."""
    sections: List[HelpSectionSummary]
    total: int


class HelpTOCPreview(BaseModel):
    """Preview of TOC for a specific role."""
    role: str
    toc: str


# ============================================================================
# Helper to check platform admin
# ============================================================================

def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role.value != "platform_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return current_user


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/sections", response_model=HelpSectionsResponse)
async def list_help_sections(
    current_user: User = Depends(require_platform_admin)
) -> HelpSectionsResponse:
    """
    List all help sections (platform admin only).
    Returns summaries without full content.
    """
    section_ids = get_all_section_ids()
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
                order=section.order
            ))

    # Sort by order, then by id
    sections.sort(key=lambda s: (s.order, s.id))

    return HelpSectionsResponse(sections=sections, total=len(sections))


@router.get("/sections/{section_id:path}", response_model=HelpSectionDetail)
async def get_help_section_detail(
    section_id: str,
    current_user: User = Depends(require_platform_admin)
) -> HelpSectionDetail:
    """
    Get full help section with content (platform admin only).
    """
    section = get_help_section(section_id, "platform_admin")

    if not section:
        raise HTTPException(status_code=404, detail=f"Help section '{section_id}' not found")

    return HelpSectionDetail(
        id=section.id,
        title=section.title,
        summary=section.summary,
        roles=section.roles,
        order=section.order,
        content=section.content
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


@router.post("/reload")
async def reload_help(
    current_user: User = Depends(require_platform_admin)
) -> dict:
    """
    Reload help content from YAML files (platform admin only).
    Useful after editing help files without restarting server.
    """
    try:
        reload_help_content()
        section_count = len(get_all_section_ids())
        return {"status": "ok", "sections_loaded": section_count}
    except Exception as e:
        logger.error(f"Failed to reload help content: {e}")
        raise HTTPException(status_code=500, detail=str(e))
