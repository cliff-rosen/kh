"""
Centralised Tool Registry (moved to *backend/tools*).

This module owns the global *TOOL_REGISTRY* instance and all helper utilities
for loading, refreshing and querying tool definitions.

It was migrated from *schemas/tool_registry.py* to this location so that all
runtime-facing code can simply use the canonical import path
`tools.tool_registry`.
"""

from __future__ import annotations

import json
import os
import logging
from typing import Any, Dict, List, Optional

# Create logger for this module
logger = logging.getLogger(__name__)

# NOTE: We import inside functions (rather than at module top-level) to avoid
# circular import issues between this module and *schemas/tools.py* (which
# still contains the dataclasses for ToolDefinition etc.).

# ---------------------------------------------------------------------------
# Global registry – keeps all ToolDefinition objects keyed by their tool_id
# ---------------------------------------------------------------------------
TOOL_REGISTRY: Dict[str, "ToolDefinition"] = {}

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_tools_json(tools_data: Dict[str, Any]) -> Dict[str, "ToolDefinition"]:
    """Parse the tools.json data into ToolDefinition objects."""
    from schemas.tool import ToolDefinition, ToolParameter, ToolOutput
    from schemas.resource import Resource, AuthConfig, AuthField
    from schemas.base import SchemaType
    
    tools = {}
    
    logger.debug("Starting tool parsing")
    for tool_data in tools_data.get("tools", []):
        logger.debug(f"Parsing tool: {tool_data['id']}")
        try:
            # Parse parameters
            parameters = []
            for param_data in tool_data.get("parameters", []):
                # Get schema definition data
                schema_def_data = param_data.get("schema_definition", {})
                
                param = ToolParameter(
                    id=f"{tool_data['id']}.{param_data['name']}",
                    name=param_data["name"],
                    description=param_data.get("description", ""),
                    schema_definition=SchemaType(
                        type=schema_def_data.get("type", "string"),
                        description=schema_def_data.get("description", param_data.get("description", "")),
                        is_array=schema_def_data.get("is_array", False),
                        fields=schema_def_data.get("fields")
                    ),
                    required=param_data.get("required", True)
                )
                parameters.append(param)
            
            # Parse outputs
            outputs = []
            for output_data in tool_data.get("outputs", []):
                # Get schema definition data
                schema_def_data = output_data.get("schema_definition", {})
                
                output = ToolOutput(
                    id=f"{tool_data['id']}.{output_data['name']}",
                    name=output_data["name"],
                    description=output_data.get("description", ""),
                    schema_definition=SchemaType(
                        type=schema_def_data.get("type", "string"),
                        description=schema_def_data.get("description", output_data.get("description", "")),
                        is_array=schema_def_data.get("is_array", False),
                        fields=schema_def_data.get("fields")
                    ),
                    required=output_data.get("required", True)
                )
                outputs.append(output)
            
            # Parse resource dependencies
            resource_deps = []
            for resource_data in tool_data.get("resource_dependencies", []):
                # Parse auth fields
                auth_fields = []
                for field_data in resource_data.get("auth_config", {}).get("required_fields", []):
                    auth_field = AuthField(
                        field_name=field_data["field_name"],
                        field_type=field_data["field_type"],
                        required=field_data.get("required", True),
                        description=field_data.get("description", "")
                    )
                    auth_fields.append(auth_field)
                
                # Create auth config
                auth_config = AuthConfig(
                    type=resource_data.get("auth_config", {}).get("type", "none"),
                    required_fields=auth_fields
                )
                
                # Create connection schema
                connection_schema_data = resource_data.get("connection_schema", {})
                connection_schema = SchemaType(
                    type=connection_schema_data.get("type", "object"),
                    description=connection_schema_data.get("description", ""),
                    is_array=connection_schema_data.get("is_array", False),
                    fields=connection_schema_data.get("fields")
                )
                
                resource = Resource(
                    id=resource_data["id"],
                    name=resource_data["name"],
                    type=resource_data["type"],
                    description=resource_data.get("description", ""),
                    auth_config=auth_config,
                    connection_schema=connection_schema,
                    capabilities=resource_data.get("capabilities", []),
                    base_url=resource_data.get("base_url"),
                    documentation_url=resource_data.get("documentation_url")
                )
                resource_deps.append(resource)
            
            # Create tool definition
            tool_def = ToolDefinition(
                id=tool_data["id"],
                name=tool_data["name"],
                description=tool_data.get("description", ""),
                category=tool_data.get("category", "general"),
                functional_category=tool_data.get("functional_category"),
                domain_category=tool_data.get("domain_category"),
                tags=tool_data.get("tags"),
                pipeline_info=tool_data.get("pipeline_info"),
                ui_metadata=tool_data.get("ui_metadata"),
                parameters=parameters,
                outputs=outputs,
                resource_dependencies=resource_deps
            )
            
            tools[tool_data["id"]] = tool_def
            
        except Exception as exc:
            print(f"Error parsing tool {tool_data.get('id', 'unknown')}: {exc}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            continue
    
    return tools


def _default_tools_json_path() -> str:
    """Return the path to *tools.json* – first look in this package, then fallback to schemas."""
    local_path = os.path.join(os.path.dirname(__file__), "tools.json")
    if os.path.exists(local_path):
        return local_path

    # Fallback to original location to preserve compatibility until file is moved
    return os.path.join(os.path.dirname(__file__), "..", "schemas", "tools.json")


def load_tools_from_file() -> Dict[str, "ToolDefinition"]:
    """Load tool definitions from *tools.json*."""
    file_path = _default_tools_json_path()
    try:
        logger.debug(f"Loading tools from {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            tools_data = json.load(f)
        return _parse_tools_json(tools_data)
    except FileNotFoundError:
        print(f"Tool definitions file not found: {file_path}")
        return {}
    except json.JSONDecodeError as exc:
        print(f"Error parsing tools.json: {exc}")
        return {}
    except Exception as exc:  # pragma: no cover
        print(f"Error loading tool definitions: {exc}")
        import traceback

        print(f"Traceback: {traceback.format_exc()}")
        return {}


def refresh_tool_registry() -> None:
    """Refresh the in-memory registry by re-reading *tools.json*."""
    global TOOL_REGISTRY
    logger.info("Refreshing tool registry")
    TOOL_REGISTRY = load_tools_from_file()
    logger.info(f"Loaded {len(TOOL_REGISTRY)} tool definitions")


def get_available_tools() -> List[str]:
    """Return a list of all loaded *tool_id*s."""
    return list(TOOL_REGISTRY.keys())


def get_tools_by_category() -> Dict[str, List[str]]:
    """Group tool IDs by their declared *category*."""
    categories: Dict[str, List[str]] = {}
    for tool_id, tool_def in TOOL_REGISTRY.items():
        categories.setdefault(tool_def.category, []).append(tool_id)
    return categories


def get_tool_definition(tool_id: str) -> Optional["ToolDefinition"]:
    """Return the *ToolDefinition* for *tool_id* if it exists."""
    tool_def: Optional["ToolDefinition"] = TOOL_REGISTRY.get(tool_id)
    if not tool_def:
        raise ValueError(f"No tool definition found for {tool_id}")
    return TOOL_REGISTRY.get(tool_id)

def register_tool_handler(tool_id: str, handler: "ToolExecutionHandler") -> None:
    """Attach an execution *handler* to an already-defined tool."""
    from schemas.tool_handler_schema import ToolExecutionHandler

    logger.info(f"Registering tool handler for {tool_id}")
    print(f"Registering tool handler for {tool_id}")
    if tool_id not in TOOL_REGISTRY:
        raise ValueError(f"No tool definition found for {tool_id}")
    
    try:
        TOOL_REGISTRY[tool_id].execution_handler = handler
        logger.debug(f"Successfully registered handler for {tool_id}")
    except Exception as e:
        logger.error(f"Failed to register handler for {tool_id}: {e}")
        raise


# ---------------------------------------------------------------------------
# Automatically load the registry at import time, mirroring old behaviour
# ---------------------------------------------------------------------------
try:
    print("Loading tools on import")
    refresh_tool_registry()
except Exception as exc:  # pragma: no cover
    print(f"Failed to load tools on import: {exc}")
    TOOL_REGISTRY = {} 