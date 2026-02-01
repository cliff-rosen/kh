"""
Help Registry Service

Provides help documentation for the chat system, filtered by user role.
Help content is loaded from YAML files in /backend/help/.

Each help section has:
- id: Unique identifier (e.g., "reports/viewing")
- title: Short title for TOC
- summary: Brief description for TOC (shown in system prompt)
- roles: List of roles that can see this section (member, org_admin, platform_admin)
- content: Full markdown content (retrieved via tool)
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional
import yaml

logger = logging.getLogger(__name__)

# Path to help content directory
HELP_DIR = Path(__file__).parent.parent / "help"


@dataclass
class HelpSection:
    """A help documentation section."""
    id: str
    title: str
    summary: str
    roles: List[str]  # Which roles can see this: member, org_admin, platform_admin
    content: str      # Full markdown content
    order: int = 0    # Display order in TOC


# Global registry of help sections
_help_sections: Dict[str, HelpSection] = {}


def _load_help_content() -> None:
    """Load all help content from YAML files in the help directory."""
    global _help_sections

    if not HELP_DIR.exists():
        logger.warning(f"Help directory not found: {HELP_DIR}")
        return

    logger.info(f"Loading help content from {HELP_DIR}")

    # Load each .yaml file in the help directory
    for yaml_file in sorted(HELP_DIR.glob("**/*.yaml")):
        try:
            with open(yaml_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)

            if not data or "sections" not in data:
                logger.debug(f"Skipping {yaml_file}: no sections found")
                continue

            for idx, section_data in enumerate(data["sections"]):
                section = HelpSection(
                    id=section_data["id"],
                    title=section_data["title"],
                    summary=section_data["summary"],
                    roles=section_data.get("roles", ["member", "org_admin", "platform_admin"]),
                    content=section_data.get("content", ""),
                    order=section_data.get("order", idx)
                )
                _help_sections[section.id] = section
                logger.debug(f"Loaded help section: {section.id}")

            logger.info(f"Loaded {len(data['sections'])} sections from {yaml_file.name}")

        except Exception as e:
            logger.error(f"Error loading help file {yaml_file}: {e}", exc_info=True)

    logger.info(f"Help registry loaded {len(_help_sections)} total sections")


def get_help_toc_for_role(role: str) -> str:
    """
    Get the help table of contents formatted for the system prompt.
    Filters sections by user role.

    Args:
        role: User role (member, org_admin, platform_admin)

    Returns:
        Formatted TOC string for inclusion in system prompt
    """
    if not _help_sections:
        _load_help_content()

    # Filter and sort sections for this role
    visible_sections = [
        s for s in _help_sections.values()
        if role in s.roles or role == "platform_admin"  # Platform admins see all
    ]
    visible_sections.sort(key=lambda s: (s.order, s.id))

    if not visible_sections:
        return ""

    # Format as a compact TOC
    lines = []
    for section in visible_sections:
        lines.append(f"- {section.id}: {section.summary}")

    return "\n".join(lines)


def get_help_section(section_id: str, role: str) -> Optional[HelpSection]:
    """
    Get a help section by ID if the user's role has access.

    Args:
        section_id: The section ID to retrieve
        role: User role for access check

    Returns:
        HelpSection if found and accessible, None otherwise
    """
    if not _help_sections:
        _load_help_content()

    section = _help_sections.get(section_id)
    if not section:
        return None

    # Check role access (platform_admin sees all)
    if role not in section.roles and role != "platform_admin":
        return None

    return section


def get_all_section_ids() -> List[str]:
    """Get all section IDs (for validation/testing)."""
    if not _help_sections:
        _load_help_content()
    return list(_help_sections.keys())


def reload_help_content() -> None:
    """Force reload of help content (useful for development)."""
    global _help_sections
    _help_sections = {}
    _load_help_content()
