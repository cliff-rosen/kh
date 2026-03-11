"""Tag Service - CRUD operations for article tags"""

import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, text, or_
from fastapi import Depends

from models import Tag, ArticleTag, Article, TagScope, UserRole
from database import get_async_db

logger = logging.getLogger(__name__)


class TagService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_tags(
        self,
        user_id: int,
        org_id: Optional[int]
    ) -> List[dict]:
        """List all tags visible to this user (personal + org)."""
        conditions = [
            and_(Tag.scope == TagScope.PERSONAL, Tag.user_id == user_id)
        ]
        if org_id:
            conditions.append(
                and_(Tag.scope == TagScope.ORGANIZATION, Tag.org_id == org_id)
            )

        result = await self.db.execute(
            select(Tag)
            .where(or_(*conditions))
            .order_by(Tag.scope, Tag.name)
        )

        tags = []
        for tag in result.scalars().all():
            tags.append({
                "tag_id": tag.tag_id,
                "name": tag.name,
                "color": tag.color,
                "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
                "created_by": tag.created_by,
                "created_at": tag.created_at,
            })
        return tags

    async def create_tag(
        self,
        name: str,
        scope: str,
        user_id: int,
        org_id: Optional[int] = None,
        color: Optional[str] = None,
        user_role: Optional[str] = None
    ) -> dict:
        """Create a new tag. Org tags require org admin role."""
        if scope == "organization":
            if not org_id:
                raise ValueError("org_id required for organization-scoped tags")
            if user_role not in (UserRole.ORG_ADMIN.value, UserRole.PLATFORM_ADMIN.value, "org_admin", "platform_admin"):
                raise PermissionError("Only org admins can create organization tags")

        tag = Tag(
            name=name,
            color=color,
            scope=scope,
            user_id=user_id if scope == "personal" else None,
            org_id=org_id if scope == "organization" else None,
            created_by=user_id,
        )
        self.db.add(tag)
        await self.db.commit()
        await self.db.refresh(tag)

        return {
            "tag_id": tag.tag_id,
            "name": tag.name,
            "color": tag.color,
            "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
            "created_by": tag.created_by,
            "created_at": tag.created_at,
        }

    async def update_tag(
        self,
        tag_id: int,
        user_id: int,
        org_id: Optional[int],
        user_role: Optional[str] = None,
        name: Optional[str] = None,
        color: Optional[str] = None
    ) -> Optional[dict]:
        """Update tag metadata."""
        result = await self.db.execute(
            select(Tag).where(Tag.tag_id == tag_id)
        )
        tag = result.scalars().first()
        if not tag:
            return None

        # Access check
        if not self._can_manage(tag, user_id, org_id, user_role):
            return None

        if name is not None:
            tag.name = name
        if color is not None:
            tag.color = color

        await self.db.commit()
        await self.db.refresh(tag)

        return {
            "tag_id": tag.tag_id,
            "name": tag.name,
            "color": tag.color,
            "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
            "created_by": tag.created_by,
            "created_at": tag.created_at,
        }

    async def delete_tag(
        self,
        tag_id: int,
        user_id: int,
        org_id: Optional[int],
        user_role: Optional[str] = None
    ) -> bool:
        """Delete a tag and all assignments."""
        result = await self.db.execute(
            select(Tag).where(Tag.tag_id == tag_id)
        )
        tag = result.scalars().first()
        if not tag:
            return False

        if not self._can_manage(tag, user_id, org_id, user_role):
            return False

        await self.db.delete(tag)
        await self.db.commit()
        return True

    async def assign_tag(
        self,
        tag_id: int,
        article_id: int,
        user_id: int
    ) -> bool:
        """Assign a tag to an article (idempotent via INSERT IGNORE)."""
        await self.db.execute(
            text("""
                INSERT IGNORE INTO article_tags (tag_id, article_id, tagged_by)
                VALUES (:tag_id, :article_id, :tagged_by)
            """),
            {"tag_id": tag_id, "article_id": article_id, "tagged_by": user_id}
        )
        await self.db.commit()
        return True

    async def unassign_tag(
        self,
        tag_id: int,
        article_id: int
    ) -> bool:
        """Remove a tag from an article."""
        result = await self.db.execute(
            select(ArticleTag).where(
                and_(ArticleTag.tag_id == tag_id, ArticleTag.article_id == article_id)
            )
        )
        assoc = result.scalars().first()
        if assoc:
            await self.db.delete(assoc)
            await self.db.commit()
        return True

    async def get_article_tags(
        self,
        article_id: int,
        user_id: int,
        org_id: Optional[int]
    ) -> List[dict]:
        """Get all visible tags for an article."""
        conditions = [
            and_(Tag.scope == TagScope.PERSONAL, Tag.user_id == user_id)
        ]
        if org_id:
            conditions.append(
                and_(Tag.scope == TagScope.ORGANIZATION, Tag.org_id == org_id)
            )

        result = await self.db.execute(
            select(Tag)
            .join(ArticleTag, Tag.tag_id == ArticleTag.tag_id)
            .where(
                and_(
                    ArticleTag.article_id == article_id,
                    or_(*conditions)
                )
            )
            .order_by(Tag.name)
        )

        tags = []
        for tag in result.scalars().all():
            tags.append({
                "tag_id": tag.tag_id,
                "name": tag.name,
                "color": tag.color,
                "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
            })
        return tags

    async def get_aggregate_tags(
        self,
        user_id: int,
        org_id: Optional[int],
        report_id: Optional[int] = None,
        collection_id: Optional[int] = None,
        article_ids: Optional[List[int]] = None,
    ) -> List[dict]:
        """Get tags used across a set of articles, with usage counts.

        Scoped to tags visible to the user (personal + org).
        Provide exactly one of: report_id, collection_id, or article_ids.
        """
        from models import ReportArticleAssociation, CollectionArticle
        from sqlalchemy import func

        # Visibility filter: only tags user can see
        visibility = [
            and_(Tag.scope == TagScope.PERSONAL, Tag.user_id == user_id)
        ]
        if org_id:
            visibility.append(
                and_(Tag.scope == TagScope.ORGANIZATION, Tag.org_id == org_id)
            )

        query = (
            select(Tag, func.count(ArticleTag.article_id).label("article_count"))
            .join(ArticleTag, Tag.tag_id == ArticleTag.tag_id)
            .where(or_(*visibility))
        )

        if report_id:
            query = query.join(
                ReportArticleAssociation,
                ArticleTag.article_id == ReportArticleAssociation.article_id,
            ).where(ReportArticleAssociation.report_id == report_id)
        elif collection_id:
            query = query.join(
                CollectionArticle,
                ArticleTag.article_id == CollectionArticle.article_id,
            ).where(CollectionArticle.collection_id == collection_id)
        elif article_ids:
            query = query.where(ArticleTag.article_id.in_(article_ids))
        else:
            return []

        query = query.group_by(Tag.tag_id).order_by(func.count(ArticleTag.article_id).desc())
        result = await self.db.execute(query)

        tags = []
        for row in result.all():
            tag = row[0]
            count = row[1]
            tags.append({
                "tag_id": tag.tag_id,
                "name": tag.name,
                "color": tag.color,
                "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
                "article_count": count,
            })
        return tags

    async def get_tags_for_articles(
        self,
        article_ids: List[int],
        user_id: int,
        org_id: Optional[int],
    ) -> dict:
        """Get tags for multiple articles at once. Returns {article_id: [tag_dicts]}."""
        if not article_ids:
            return {}

        # Visibility filter
        visibility = [
            and_(Tag.scope == TagScope.PERSONAL, Tag.user_id == user_id)
        ]
        if org_id:
            visibility.append(
                and_(Tag.scope == TagScope.ORGANIZATION, Tag.org_id == org_id)
            )

        result = await self.db.execute(
            select(ArticleTag.article_id, Tag)
            .join(Tag, ArticleTag.tag_id == Tag.tag_id)
            .where(
                and_(
                    ArticleTag.article_id.in_(article_ids),
                    or_(*visibility),
                )
            )
            .order_by(ArticleTag.article_id, Tag.name)
        )

        tags_map: dict = {}
        for row in result.all():
            aid = row[0]
            tag = row[1]
            if aid not in tags_map:
                tags_map[aid] = []
            tags_map[aid].append({
                "tag_id": tag.tag_id,
                "name": tag.name,
                "color": tag.color,
                "scope": tag.scope.value if hasattr(tag.scope, 'value') else tag.scope,
            })
        return tags_map

    async def get_articles_by_tags(
        self,
        tag_ids: List[int],
        user_id: int,
        org_id: Optional[int],
        stream_id: Optional[int] = None,
        report_id: Optional[int] = None
    ) -> List[dict]:
        """Get articles matching given tags."""
        from models import ReportArticleAssociation, Report

        query = (
            select(Article)
            .join(ArticleTag, Article.article_id == ArticleTag.article_id)
            .where(ArticleTag.tag_id.in_(tag_ids))
        )

        if stream_id or report_id:
            query = query.join(
                ReportArticleAssociation,
                Article.article_id == ReportArticleAssociation.article_id
            )
            if report_id:
                query = query.where(ReportArticleAssociation.report_id == report_id)
            elif stream_id:
                query = query.join(
                    Report,
                    ReportArticleAssociation.report_id == Report.report_id
                ).where(Report.research_stream_id == stream_id)

        query = query.group_by(Article.article_id)
        result = await self.db.execute(query)

        articles = []
        for article in result.scalars().all():
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
            })
        return articles

    async def bulk_assign_tags(
        self,
        tag_ids: List[int],
        article_ids: List[int],
        user_id: int
    ) -> int:
        """Bulk assign tags to articles. Returns number of new assignments."""
        count = 0
        for tag_id in tag_ids:
            for article_id in article_ids:
                await self.db.execute(
                    text("""
                        INSERT IGNORE INTO article_tags (tag_id, article_id, tagged_by)
                        VALUES (:tag_id, :article_id, :tagged_by)
                    """),
                    {"tag_id": tag_id, "article_id": article_id, "tagged_by": user_id}
                )
                count += 1
        await self.db.commit()
        return count

    def _can_manage(self, tag: Tag, user_id: int, org_id: Optional[int], user_role: Optional[str] = None) -> bool:
        """Check if user can manage (edit/delete) this tag."""
        scope = tag.scope.value if hasattr(tag.scope, 'value') else tag.scope
        if scope == "personal":
            return tag.user_id == user_id
        elif scope == "organization":
            if tag.org_id != org_id or org_id is None:
                return False
            return user_role in (UserRole.ORG_ADMIN.value, UserRole.PLATFORM_ADMIN.value, "org_admin", "platform_admin")
        return False


# Dependency injection provider
async def get_tag_service(
    db: AsyncSession = Depends(get_async_db)
) -> TagService:
    return TagService(db)
