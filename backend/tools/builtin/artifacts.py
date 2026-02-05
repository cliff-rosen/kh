"""
Artifact Tools (Defect/Feature Tracker)

Platform-admin-only tools for tracking bugs and feature requests.
All tools are global but restricted to platform_admin role.

Uses ArtifactService for all database operations.
"""

import logging
from typing import Any, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, register_tool

logger = logging.getLogger(__name__)


# =============================================================================
# Helpers
# =============================================================================

def _artifact_to_dict(artifact) -> Dict[str, Any]:
    """Convert an Artifact model to a serializable dict."""
    return {
        "id": artifact.id,
        "title": artifact.title,
        "description": artifact.description,
        "type": artifact.artifact_type.value,
        "status": artifact.status.value,
        "created_by": artifact.created_by,
        "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
        "updated_at": artifact.updated_at.isoformat() if artifact.updated_at else None,
    }


# =============================================================================
# Tool Executors (Async)
# =============================================================================

async def execute_list_artifacts(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all artifacts with optional filtering by type and status."""
    from services.artifact_service import ArtifactService

    try:
        service = ArtifactService(db)
        artifacts = await service.list_artifacts(
            artifact_type=params.get("type"),
            status=params.get("status"),
        )

        if not artifacts:
            filter_desc = ""
            if params.get("type"):
                filter_desc += f" type={params['type']}"
            if params.get("status"):
                filter_desc += f" status={params['status']}"
            return f"No artifacts found{' with' + filter_desc if filter_desc else ''}."

        text_lines = [f"Found {len(artifacts)} artifacts:\n"]
        artifacts_data = []

        for i, a in enumerate(artifacts, 1):
            text_lines.append(
                f"{i}. [{a.artifact_type.value.upper()}] #{a.id} {a.title} "
                f"({a.status.value})"
            )
            artifacts_data.append(_artifact_to_dict(a))

        payload = {
            "type": "artifact_list",
            "data": {
                "total": len(artifacts),
                "artifacts": artifacts_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error listing artifacts: {e}", exc_info=True)
        return f"Error listing artifacts: {str(e)}"


async def execute_create_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Create a new bug or feature artifact."""
    from services.artifact_service import ArtifactService

    title = params.get("title")
    artifact_type = params.get("type")

    if not title:
        return "Error: title is required."
    if not artifact_type:
        return "Error: type is required (must be 'bug' or 'feature')."
    if artifact_type not in ("bug", "feature"):
        return "Error: type must be 'bug' or 'feature'."

    try:
        service = ArtifactService(db)
        artifact = await service.create_artifact(
            title=title,
            artifact_type=artifact_type,
            created_by=user_id,
            description=params.get("description"),
        )

        payload = {
            "type": "artifact_details",
            "data": _artifact_to_dict(artifact)
        }

        return ToolResult(
            text=f"Created {artifact_type} #{artifact.id}: {title}",
            payload=payload
        )

    except Exception as e:
        logger.error(f"Error creating artifact: {e}", exc_info=True)
        return f"Error creating artifact: {str(e)}"


async def execute_update_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Update an existing artifact's title, description, status, or type."""
    from services.artifact_service import ArtifactService

    artifact_id = params.get("id")
    if not artifact_id:
        return "Error: id is required."

    # Validate enum values before passing to service
    if "status" in params and params["status"]:
        if params["status"] not in ("open", "in_progress", "closed"):
            return "Error: status must be 'open', 'in_progress', or 'closed'."
    if "type" in params and params["type"]:
        if params["type"] not in ("bug", "feature"):
            return "Error: type must be 'bug' or 'feature'."

    try:
        service = ArtifactService(db)
        artifact = await service.update_artifact(
            artifact_id=int(artifact_id),
            title=params.get("title"),
            description=params.get("description"),
            status=params.get("status"),
            artifact_type=params.get("type"),
        )

        if not artifact:
            return f"Error: Artifact #{artifact_id} not found."

        payload = {
            "type": "artifact_details",
            "data": _artifact_to_dict(artifact)
        }

        return ToolResult(
            text=f"Updated artifact #{artifact.id}: {artifact.title} ({artifact.status.value})",
            payload=payload
        )

    except Exception as e:
        logger.error(f"Error updating artifact: {e}", exc_info=True)
        return f"Error updating artifact: {str(e)}"


async def execute_delete_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Delete an artifact by ID."""
    from services.artifact_service import ArtifactService

    artifact_id = params.get("id")
    if not artifact_id:
        return "Error: id is required."

    try:
        service = ArtifactService(db)
        title = await service.delete_artifact(int(artifact_id))

        if title is None:
            return f"Error: Artifact #{artifact_id} not found."

        return f"Deleted artifact #{artifact_id}: {title}"

    except Exception as e:
        logger.error(f"Error deleting artifact: {e}", exc_info=True)
        return f"Error deleting artifact: {str(e)}"


# =============================================================================
# Tool Registration
# =============================================================================

register_tool(ToolConfig(
    name="list_artifacts",
    description="List all bugs and feature requests. Optionally filter by type (bug/feature) and status (open/in_progress/closed).",
    input_schema={
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": ["bug", "feature"],
                "description": "Filter by artifact type."
            },
            "status": {
                "type": "string",
                "enum": ["open", "in_progress", "closed"],
                "description": "Filter by status."
            }
        },
    },
    executor=execute_list_artifacts,
    category="admin",
    is_global=True,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="create_artifact",
    description="Create a new bug report or feature request. Provide a title, type (bug or feature), and optional description.",
    input_schema={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title of the bug or feature request."
            },
            "type": {
                "type": "string",
                "enum": ["bug", "feature"],
                "description": "Type: 'bug' or 'feature'."
            },
            "description": {
                "type": "string",
                "description": "Detailed description (optional)."
            }
        },
        "required": ["title", "type"]
    },
    executor=execute_create_artifact,
    category="admin",
    is_global=True,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="update_artifact",
    description="Update an existing bug or feature request. You can change the title, description, status, or type.",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the artifact to update."
            },
            "title": {
                "type": "string",
                "description": "New title (optional)."
            },
            "description": {
                "type": "string",
                "description": "New description (optional)."
            },
            "status": {
                "type": "string",
                "enum": ["open", "in_progress", "closed"],
                "description": "New status (optional)."
            },
            "type": {
                "type": "string",
                "enum": ["bug", "feature"],
                "description": "New type (optional)."
            }
        },
        "required": ["id"]
    },
    executor=execute_update_artifact,
    category="admin",
    is_global=True,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="delete_artifact",
    description="Delete a bug or feature request by its ID.",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the artifact to delete."
            }
        },
        "required": ["id"]
    },
    executor=execute_delete_artifact,
    category="admin",
    is_global=True,
    required_role="platform_admin",
))
