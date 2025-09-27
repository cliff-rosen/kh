"""
Tool Schema Definitions

This module contains all Pydantic models and related utilities for defining
and managing Tools. Tools are the functional units that perform actions
within a hop.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from .base import SchemaEntity
from .resource import Resource
from .tool_handler_schema import ToolExecutionHandler

# --- Core Tool Models ---

class ToolParameter(SchemaEntity):
    """
    Defines an input parameter for a tool. It extends SchemaEntity and adds
    a 'required' flag.
    """
    required: bool = Field(default=True)

class ToolOutput(SchemaEntity):
    """
    Defines an output field for a tool. It extends SchemaEntity and adds
    a 'required' flag.
    """
    required: bool = Field(default=True)

class ToolDefinition(BaseModel):
    """
    Represents the complete definition of a tool, including its parameters,
    outputs, and dependencies on external resources.
    """
    id: str
    name: str
    description: str
    category: str
    functional_category: Optional[str] = Field(default=None, description="Functional category (e.g., 'search_retrieve', 'extract_analyze')")
    domain_category: Optional[str] = Field(default=None, description="Domain category (e.g., 'academic_research', 'web_content')")
    tags: Optional[List[str]] = Field(default=None, description="Tags for the tool")
    pipeline_info: Optional[Dict[str, Any]] = Field(default=None, description="Pipeline information")
    ui_metadata: Optional[Dict[str, Any]] = Field(default=None, description="UI metadata")
    parameters: List[ToolParameter]
    outputs: List[ToolOutput]
    resource_dependencies: List[Resource] = Field(default_factory=list)
    
    # The execution_handler is not serialized and is attached at runtime.
    execution_handler: Optional[ToolExecutionHandler] = Field(default=None, exclude=True)

    # --- Utility Methods ---

    def requires_resources(self) -> bool:
        """Checks if the tool has any resource dependencies."""
        return len(self.resource_dependencies) > 0
    
    def get_resource_ids(self) -> List[str]:
        """Returns a list of IDs for all resources this tool depends on."""
        return [r.id for r in self.resource_dependencies]
    
    def get_resource_config(self, resource_id: str) -> Optional[Resource]:
        """Retrieves the definition for a specific resource dependency."""
        return next((r for r in self.resource_dependencies if r.id == resource_id), None) 