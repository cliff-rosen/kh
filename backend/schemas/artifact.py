"""
Artifact schemas for bug/feature tracking.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ArtifactResponse(BaseModel):
    """Full artifact response."""
    id: int
    title: str
    description: Optional[str] = None
    artifact_type: str  # "bug" | "feature"
    status: str         # "open" | "in_progress" | "closed"
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
