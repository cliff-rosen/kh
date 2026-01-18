"""
Article Service - handles Article table operations
"""

import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends

from models import Article
from schemas.canonical_types import CanonicalResearchArticle
from database import get_async_db

logger = logging.getLogger(__name__)


class ArticleService:
    """
    Service for Article operations.

    This is the single source of truth for Article table access.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    def _to_canonical(self, article: Article) -> CanonicalResearchArticle:
        """Convert an Article ORM model to CanonicalResearchArticle schema."""
        return CanonicalResearchArticle(
            id=str(article.article_id),
            source="pubmed",
            pmid=article.pmid,
            title=article.title,
            authors=article.authors or [],
            abstract=article.abstract or article.summary or "",
            journal=article.journal or "",
            publication_year=article.year,
            publication_date=article.publication_date.isoformat() if article.publication_date else None,
            doi=article.doi,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/" if article.pmid else article.url,
            keywords=[],
            mesh_terms=[],
            source_metadata={
                "volume": article.volume,
                "issue": article.issue,
                "pages": article.pages,
                "medium": article.medium,
                "ai_summary": article.ai_summary,
                "theme_tags": article.theme_tags or []
            }
        )

    async def get_article_by_pmid(self, pmid: str) -> Optional[CanonicalResearchArticle]:
        """Get an article by its PMID (async)."""
        result = await self.db.execute(
            select(Article).where(Article.pmid == pmid)
        )
        article = result.scalars().first()

        if not article:
            return None

        return self._to_canonical(article)

    async def get_article_by_id(self, article_id: int) -> Optional[CanonicalResearchArticle]:
        """Get an article by its internal ID (async)."""
        result = await self.db.execute(
            select(Article).where(Article.article_id == article_id)
        )
        article = result.scalars().first()

        if not article:
            return None

        return self._to_canonical(article)


# Dependency injection provider for async article service
async def get_async_article_service(
    db: AsyncSession = Depends(get_async_db)
) -> ArticleService:
    """Get an ArticleService instance with async database session."""
    return ArticleService(db)
