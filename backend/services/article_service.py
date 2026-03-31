"""
Article Service - Single source of truth for Article table operations.

This service owns:
- Article lookups (by PMID, DOI, ID)
- Article creation from WipArticle (deduplication by PMID/DOI)
- Conversion to canonical schema
"""

import logging
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from fastapi import Depends

from models import Article, WipArticle
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
            # Honest date fields
            pub_year=article.pub_year,
            pub_month=article.pub_month,
            pub_day=article.pub_day,
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

    # =========================================================================
    # Getters (async, DB reads)
    # - find_* returns Optional (None if not found)
    # - get_* raises ValueError if not found
    # =========================================================================

    async def get_article_by_pmid(self, pmid: str) -> CanonicalResearchArticle:
        """Get an article by its PMID, raises ValueError if not found."""
        article = await self.find_by_pmid(pmid)
        if not article:
            raise ValueError(f"Article with PMID {pmid} not found")
        return self._to_canonical(article)

    async def find_by_id(self, article_id: int) -> Optional[Article]:
        """Find an article by ID, returning the ORM model."""
        result = await self.db.execute(
            select(Article).where(Article.article_id == article_id)
        )
        return result.scalars().first()

    async def find_by_pmid(self, pmid: str) -> Optional[Article]:
        """Find an article by PMID, returning the ORM model."""
        result = await self.db.execute(
            select(Article).where(Article.pmid == pmid)
        )
        return result.scalars().first()

    async def find_by_doi(self, doi: str) -> Optional[Article]:
        """Find an article by DOI, returning the ORM model."""
        result = await self.db.execute(
            select(Article).where(Article.doi == doi)
        )
        return result.scalars().first()

    async def search(self, query: str, limit: int = 20) -> List[Article]:
        """Search articles by PMID or title keyword."""
        query = query.strip()
        if not query:
            return []

        # If query looks like a PMID (all digits), search by PMID first
        if query.isdigit():
            article = await self.find_by_pmid(query)
            if article:
                return [article]

        # Keyword search on title
        result = await self.db.execute(
            select(Article)
            .where(
                or_(
                    Article.title.ilike(f"%{query}%"),
                    Article.pmid == query,
                )
            )
            .order_by(Article.first_seen.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # =========================================================================
    # Writers (async, stages DB writes - caller must commit)
    # =========================================================================

    async def find_or_create_from_pubmed(self, pmid: str) -> Optional[Article]:
        """
        Fetch an article from PubMed by PMID and create it in our DB.

        Returns the Article ORM model, or None if PubMed doesn't have it.
        """
        from services.pubmed_service import PubMedService

        # Check DB first (in case of race condition)
        article = await self.find_by_pmid(pmid)
        if article:
            return article

        # Fetch from PubMed
        pubmed = PubMedService()
        pubmed_articles = await pubmed.get_articles_from_ids([pmid])
        if not pubmed_articles:
            logger.info(f"PMID {pmid} not found in PubMed")
            return None

        pa = pubmed_articles[0]

        # Parse pub_year/pub_month/pub_day from PubMedArticle.comp_date (YYYY-MM-DD or partial)
        pub_year, pub_month, pub_day = None, None, None
        if pa.comp_date:
            parts = pa.comp_date.split("-")
            if len(parts) >= 1 and parts[0].isdigit():
                pub_year = int(parts[0])
            if len(parts) >= 2 and parts[1].isdigit():
                pub_month = int(parts[1])
            if len(parts) >= 3 and parts[2].isdigit():
                pub_day = int(parts[2])

        article = Article(
            title=pa.title,
            url=f"https://pubmed.ncbi.nlm.nih.gov/{pa.PMID}/",
            authors=pa.authors,
            abstract=pa.abstract,
            pmid=pa.PMID,
            doi=pa.doi or None,
            journal=pa.journal,
            volume=pa.volume or None,
            issue=pa.issue or None,
            pages=pa.pages or None,
            medium=pa.medium or None,
            pub_year=pub_year,
            pub_month=pub_month,
            pub_day=pub_day,
            fetch_count=1,
        )
        self.db.add(article)
        await self.db.flush()
        await self.db.commit()
        await self.db.refresh(article)
        logger.info(f"Created Article from PubMed: PMID={pmid}, article_id={article.article_id}")
        return article

    async def find_or_create_from_wip(self, wip_article: WipArticle) -> Article:
        """
        Find existing Article by PMID/DOI or create new one from WipArticle.

        Deduplication strategy:
        1. Check by PMID first (most common identifier)
        2. Check by DOI if no PMID match
        3. Create new Article if no match found

        Returns the Article ORM model (existing or newly created).
        """
        article = None

        # Try to find existing article by PMID
        if wip_article.pmid:
            article = await self.find_by_pmid(wip_article.pmid)

        # Try DOI if no PMID match
        if not article and wip_article.doi:
            article = await self.find_by_doi(wip_article.doi)

        # Create new article if not found
        if not article:
            article = Article(
                source_id=wip_article.source_id,
                title=wip_article.title,
                url=wip_article.url,
                authors=wip_article.authors,
                summary=wip_article.summary,
                abstract=wip_article.abstract,
                full_text=wip_article.full_text,
                article_metadata=wip_article.article_metadata,
                pmid=wip_article.pmid,
                doi=wip_article.doi,
                journal=wip_article.journal,
                volume=wip_article.volume,
                issue=wip_article.issue,
                pages=wip_article.pages,
                pub_year=wip_article.pub_year,
                pub_month=wip_article.pub_month,
                pub_day=wip_article.pub_day,
                entry_date=wip_article.entry_date,
                fetch_count=1,
            )
            self.db.add(article)
            await self.db.flush()
            logger.debug(f"Created new Article: pmid={wip_article.pmid}, doi={wip_article.doi}")

        return article


# Dependency injection provider for async article service
async def get_article_service(
    db: AsyncSession = Depends(get_async_db)
) -> ArticleService:
    """Get an ArticleService instance with async database session."""
    return ArticleService(db)
