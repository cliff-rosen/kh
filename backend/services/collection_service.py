"""Collection Service - CRUD operations for article collections"""

import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, func, text
from fastapi import Depends

from models import Collection, CollectionArticle, Article, CollectionScope
from database import get_async_db

logger = logging.getLogger(__name__)


class CollectionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_collections(
        self,
        user_id: int,
        org_id: Optional[int],
        stream_id: Optional[int] = None,
        scope: Optional[str] = None
    ) -> List[dict]:
        """List all collections visible to this user, with article counts."""
        # Build conditions for visible collections
        conditions = []

        # Personal collections owned by user
        personal_cond = and_(
            Collection.scope == CollectionScope.PERSONAL,
            Collection.user_id == user_id
        )
        conditions.append(personal_cond)

        # Org collections for user's org
        if org_id:
            org_cond = and_(
                Collection.scope == CollectionScope.ORGANIZATION,
                Collection.org_id == org_id
            )
            conditions.append(org_cond)

            # Stream collections for user's org
            stream_cond = and_(
                Collection.scope == CollectionScope.STREAM,
                Collection.org_id == org_id
            )
            if stream_id:
                stream_cond = and_(stream_cond, Collection.stream_id == stream_id)
            conditions.append(stream_cond)

        from sqlalchemy import or_
        query = (
            select(
                Collection,
                func.count(CollectionArticle.article_id).label('article_count')
            )
            .outerjoin(CollectionArticle, Collection.collection_id == CollectionArticle.collection_id)
            .where(or_(*conditions))
            .group_by(Collection.collection_id)
            .order_by(Collection.updated_at.desc())
        )

        if scope:
            query = query.where(Collection.scope == scope)

        result = await self.db.execute(query)
        collections = []
        for row in result.all():
            coll = row[0]
            count = row[1]
            collections.append({
                "collection_id": coll.collection_id,
                "name": coll.name,
                "description": coll.description,
                "scope": coll.scope.value if hasattr(coll.scope, 'value') else coll.scope,
                "stream_id": coll.stream_id,
                "article_count": count,
                "created_by": coll.created_by,
                "created_at": coll.created_at,
                "updated_at": coll.updated_at,
            })
        return collections

    async def get_collection(
        self,
        collection_id: int,
        user_id: int,
        org_id: Optional[int]
    ) -> Optional[dict]:
        """Get a single collection with access check."""
        result = await self.db.execute(
            select(
                Collection,
                func.count(CollectionArticle.article_id).label('article_count')
            )
            .outerjoin(CollectionArticle, Collection.collection_id == CollectionArticle.collection_id)
            .where(Collection.collection_id == collection_id)
            .group_by(Collection.collection_id)
        )
        row = result.first()
        if not row:
            return None

        coll = row[0]
        count = row[1]

        if not self._can_access(coll, user_id, org_id):
            return None

        return {
            "collection_id": coll.collection_id,
            "name": coll.name,
            "description": coll.description,
            "scope": coll.scope.value if hasattr(coll.scope, 'value') else coll.scope,
            "stream_id": coll.stream_id,
            "article_count": count,
            "created_by": coll.created_by,
            "created_at": coll.created_at,
            "updated_at": coll.updated_at,
        }

    async def create_collection(
        self,
        name: str,
        scope: str,
        user_id: int,
        org_id: Optional[int],
        description: Optional[str] = None,
        stream_id: Optional[int] = None
    ) -> dict:
        """Create a new collection."""
        coll = Collection(
            name=name,
            description=description,
            scope=scope,
            user_id=user_id if scope == "personal" else None,
            org_id=org_id if scope in ("organization", "stream") else None,
            stream_id=stream_id if scope == "stream" else None,
            created_by=user_id,
        )
        self.db.add(coll)
        await self.db.commit()
        await self.db.refresh(coll)

        return {
            "collection_id": coll.collection_id,
            "name": coll.name,
            "description": coll.description,
            "scope": coll.scope.value if hasattr(coll.scope, 'value') else coll.scope,
            "stream_id": coll.stream_id,
            "article_count": 0,
            "created_by": coll.created_by,
            "created_at": coll.created_at,
            "updated_at": coll.updated_at,
        }

    async def update_collection(
        self,
        collection_id: int,
        user_id: int,
        org_id: Optional[int],
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> Optional[dict]:
        """Update collection metadata."""
        result = await self.db.execute(
            select(Collection).where(Collection.collection_id == collection_id)
        )
        coll = result.scalars().first()
        if not coll or not self._can_access(coll, user_id, org_id):
            return None

        if name is not None:
            coll.name = name
        if description is not None:
            coll.description = description

        await self.db.commit()
        await self.db.refresh(coll)

        # Get article count
        count_result = await self.db.execute(
            select(func.count(CollectionArticle.article_id))
            .where(CollectionArticle.collection_id == collection_id)
        )
        count = count_result.scalar() or 0

        return {
            "collection_id": coll.collection_id,
            "name": coll.name,
            "description": coll.description,
            "scope": coll.scope.value if hasattr(coll.scope, 'value') else coll.scope,
            "stream_id": coll.stream_id,
            "article_count": count,
            "created_by": coll.created_by,
            "created_at": coll.created_at,
            "updated_at": coll.updated_at,
        }

    async def delete_collection(
        self,
        collection_id: int,
        user_id: int,
        org_id: Optional[int]
    ) -> bool:
        """Delete a collection. Returns True if deleted."""
        result = await self.db.execute(
            select(Collection).where(Collection.collection_id == collection_id)
        )
        coll = result.scalars().first()
        if not coll or not self._can_access(coll, user_id, org_id):
            return False

        await self.db.delete(coll)
        await self.db.commit()
        return True

    async def add_article(
        self,
        collection_id: int,
        article_id: int,
        user_id: int,
        org_id: Optional[int],
        notes: Optional[str] = None
    ) -> bool:
        """Add an article to a collection (idempotent). Returns True if added."""
        # Access check
        result = await self.db.execute(
            select(Collection).where(Collection.collection_id == collection_id)
        )
        coll = result.scalars().first()
        if not coll or not self._can_access(coll, user_id, org_id):
            return False

        # INSERT IGNORE for idempotent behavior
        await self.db.execute(
            text("""
                INSERT IGNORE INTO collection_articles (collection_id, article_id, added_by, notes)
                VALUES (:collection_id, :article_id, :added_by, :notes)
            """),
            {"collection_id": collection_id, "article_id": article_id, "added_by": user_id, "notes": notes}
        )
        await self.db.commit()
        return True

    async def remove_article(
        self,
        collection_id: int,
        article_id: int,
        user_id: int,
        org_id: Optional[int]
    ) -> bool:
        """Remove an article from a collection."""
        # Access check
        result = await self.db.execute(
            select(Collection).where(Collection.collection_id == collection_id)
        )
        coll = result.scalars().first()
        if not coll or not self._can_access(coll, user_id, org_id):
            return False

        result = await self.db.execute(
            select(CollectionArticle).where(
                and_(
                    CollectionArticle.collection_id == collection_id,
                    CollectionArticle.article_id == article_id
                )
            )
        )
        assoc = result.scalars().first()
        if assoc:
            await self.db.delete(assoc)
            await self.db.commit()
        return True

    async def get_articles(
        self,
        collection_id: int,
        user_id: int,
        org_id: Optional[int]
    ) -> Optional[List[dict]]:
        """Get articles in a collection. Returns None if no access."""
        # Access check
        result = await self.db.execute(
            select(Collection).where(Collection.collection_id == collection_id)
        )
        coll = result.scalars().first()
        if not coll or not self._can_access(coll, user_id, org_id):
            return None

        result = await self.db.execute(
            select(Article, CollectionArticle)
            .join(CollectionArticle, Article.article_id == CollectionArticle.article_id)
            .where(CollectionArticle.collection_id == collection_id)
            .order_by(CollectionArticle.added_at.desc())
        )

        articles = []
        for row in result.all():
            article, assoc = row
            articles.append({
                "article_id": article.article_id,
                "title": article.title,
                "authors": article.authors or [],
                "journal": article.journal,
                "pmid": article.pmid,
                "doi": article.doi,
                "abstract": article.abstract,
                "url": article.url,
                "pub_year": article.pub_year,
                "pub_month": article.pub_month,
                "pub_day": article.pub_day,
                "added_at": assoc.added_at,
                "added_by": assoc.added_by,
                "notes": assoc.notes,
            })
        return articles

    def _can_access(self, collection: Collection, user_id: int, org_id: Optional[int]) -> bool:
        """Check if user can access this collection."""
        scope = collection.scope.value if hasattr(collection.scope, 'value') else collection.scope
        if scope == "personal":
            return collection.user_id == user_id
        elif scope == "organization":
            return collection.org_id == org_id and org_id is not None
        elif scope == "stream":
            return collection.org_id == org_id and org_id is not None
        return False


# Dependency injection provider
async def get_collection_service(
    db: AsyncSession = Depends(get_async_db)
) -> CollectionService:
    return CollectionService(db)
