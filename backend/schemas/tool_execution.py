from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
from enum import Enum

class ToolExecutionStatus(str, Enum):
    """Status of a tool execution"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ToolExecutionResponse(BaseModel):
    """Response from a tool execution"""
    success: bool = Field(description="Whether the execution was successful")
    errors: list[str] = Field(default=[], description="List of error messages")
    outputs: Dict[str, Any] = Field(default={}, description="Tool execution outputs")
    canonical_outputs: Optional[Dict[str, Any]] = Field(None, description="Canonical typed outputs")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

