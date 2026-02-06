"""
Artifact schemas for bug/feature tracking.

Mirrors frontend types/artifact.ts for easy cross-reference.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ArtifactCategory(BaseModel):
    """Artifact category domain object."""
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class Artifact(BaseModel):
    """Artifact domain object."""
    id: int
    title: str
    description: Optional[str] = None
    artifact_type: str  # "bug" | "feature"
    status: str         # "open" | "in_progress" | "closed"
    category: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
