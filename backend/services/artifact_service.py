"""
Artifact Service

Service for managing bugs and feature requests (platform admin defect tracker).
"""

import logging
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from models import Artifact, ArtifactType, ArtifactStatus
from database import get_async_db

logger = logging.getLogger(__name__)


class ArtifactService:
    """Service for artifact (bug/feature) CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_artifacts(
        self,
        artifact_type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Artifact]:
        """List all artifacts with optional type and status filters."""
        stmt = select(Artifact).order_by(Artifact.created_at.desc())

        if artifact_type:
            stmt = stmt.where(Artifact.artifact_type == ArtifactType(artifact_type))
        if status:
            stmt = stmt.where(Artifact.status == ArtifactStatus(status))

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_artifact_by_id(self, artifact_id: int) -> Optional[Artifact]:
        """Get a single artifact by ID."""
        result = await self.db.execute(
            select(Artifact).where(Artifact.id == artifact_id)
        )
        return result.scalars().first()

    async def create_artifact(
        self,
        title: str,
        artifact_type: str,
        created_by: int,
        description: Optional[str] = None,
    ) -> Artifact:
        """Create a new artifact."""
        artifact = Artifact(
            title=title,
            description=description,
            artifact_type=ArtifactType(artifact_type),
            created_by=created_by,
        )
        self.db.add(artifact)
        await self.db.commit()
        await self.db.refresh(artifact)
        return artifact

    async def update_artifact(
        self,
        artifact_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        artifact_type: Optional[str] = None,
    ) -> Optional[Artifact]:
        """Update an existing artifact. Returns None if not found."""
        artifact = await self.get_artifact_by_id(artifact_id)
        if not artifact:
            return None

        if title is not None:
            artifact.title = title
        if description is not None:
            artifact.description = description
        if status is not None:
            artifact.status = ArtifactStatus(status)
        if artifact_type is not None:
            artifact.artifact_type = ArtifactType(artifact_type)

        await self.db.commit()
        await self.db.refresh(artifact)
        return artifact

    async def delete_artifact(self, artifact_id: int) -> Optional[str]:
        """Delete an artifact by ID. Returns the title if deleted, None if not found."""
        artifact = await self.get_artifact_by_id(artifact_id)
        if not artifact:
            return None

        title = artifact.title
        await self.db.delete(artifact)
        await self.db.commit()
        return title


async def get_artifact_service(
    db: AsyncSession = Depends(get_async_db)
) -> ArtifactService:
    """Get an ArtifactService instance with async database session."""
    return ArtifactService(db)
