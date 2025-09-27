"""Schema definitions and base wrapper for backend tool handlers.

Placing these models in the `schemas` package keeps *all* shared/serialisable
objects in a single place, while the `tool_handlers` package remains dedicated
purely to implementation code.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Dict, Any, Optional
from pydantic import BaseModel, Field

__all__ = [
    "ToolParameterValue",
    "ToolHandlerInput", 
    "ToolHandlerResult",
    "ToolExecutionHandler",
]


class ToolParameterValue(BaseModel):
    """Runtime value for a tool parameter with type information."""
    
    value: Any = Field(description="The actual parameter value")
    parameter_type: Optional[str] = Field(None, description="Type hint for the parameter")
    parameter_name: Optional[str] = Field(None, description="Original parameter name")


class ToolHandlerInput(BaseModel):
    """Input payload delivered to every tool handler."""

    params: Dict[str, ToolParameterValue] = Field(default_factory=dict)
    resource_configs: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Configuration for each required resource, keyed by resource ID"
    )
    step_id: Optional[str] = None


class ToolHandlerResult(BaseModel):
    """Result returned by a tool handler with properly typed outputs."""
    
    outputs: Dict[str, Any] = Field(
        description="Maps output parameter names to their values, preserving canonical types"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata about the execution"
    )


class ToolExecutionHandler(BaseModel):
    """Metadata + async callable that performs the work."""

    handler: Callable[[ToolHandlerInput], Awaitable[ToolHandlerResult]]
    description: str 