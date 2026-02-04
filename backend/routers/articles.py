"""
Articles API endpoints - fetches from local database and PubMed

ARTICLE TEXT ACCESS ENDPOINTS:
==============================
1. GET /{pmid} - Get article metadata + abstract from local database
2. GET /{pmid}/full-text - Get full text from PubMed Central (only for PMC articles)
3. GET /{pmid}/full-text-links - Get publisher links (LinkOut) for accessing full text

Note: Only ~30% of PubMed articles are in PMC. For articles not in PMC:
- /full-text returns an error
- /full-text-links returns publisher URLs (free and subscription options)
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status

from models import User
from schemas.canonical_types import CanonicalResearchArticle
from services.article_service import ArticleService, get_article_service
from services.pubmed_service import get_full_text_links, PubMedService
from routers.auth import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/articles", tags=["articles"])


class FullTextLink(BaseModel):
    provider: str
    url: str
    categories: List[str]
    is_free: bool


class FullTextLinksResponse(BaseModel):
    pmid: str
    links: List[FullTextLink]


class FullTextContentResponse(BaseModel):
    pmid: str
    pmc_id: str | None
    full_text: str | None
    error: str | None = None


@router.get("/{pmid}", response_model=CanonicalResearchArticle)
async def get_article_by_pmid(
    pmid: str,
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get an article by its PMID from the local database.
    This fetches from our stored articles, not from PubMed directly.
    """
    try:
        return await service.get_article_by_pmid(pmid)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error fetching article {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching article: {str(e)}"
        )


@router.get("/{pmid}/full-text-links", response_model=FullTextLinksResponse)
async def get_article_full_text_links(
    pmid: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get full text link options for an article from PubMed's LinkOut system.

    This fetches live data from PubMed's ELink API and returns URLs to publisher
    websites where the full text may be available. Links are categorized as:
    - is_free=True: Open access, no subscription required
    - is_free=False: May require subscription or purchase

    Use this as a fallback when the article is not in PubMed Central.
    """
    try:
        links = await get_full_text_links(pmid)
        return FullTextLinksResponse(pmid=pmid, links=links)
    except Exception as e:
        logger.error(f"Error fetching full text links for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text links: {str(e)}"
        )


@router.get("/{pmid}/full-text", response_model=FullTextContentResponse)
async def get_article_full_text(
    pmid: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get the full text content of an article from PubMed Central (PMC).

    IMPORTANT: Only works for articles that have a PMC ID (~30% of PubMed).
    Returns:
    - full_text: The article text if available in PMC
    - pmc_id: The PMC ID if the article is in PMC
    - error: Message if article is not in PMC or retrieval failed

    For articles NOT in PMC, use /full-text-links to get publisher URLs instead.
    """
    try:
        # First, fetch the article to get the PMC ID
        service = PubMedService()
        articles = await service.get_articles_from_ids([pmid])

        if not articles:
            return FullTextContentResponse(
                pmid=pmid,
                pmc_id=None,
                full_text=None,
                error="Article not found"
            )

        article = articles[0]

        if not article.pmc_id:
            return FullTextContentResponse(
                pmid=pmid,
                pmc_id=None,
                full_text=None,
                error="Article is not available in PubMed Central"
            )

        # Fetch the full text from PMC
        full_text = await service.get_pmc_full_text(article.pmc_id)

        if not full_text:
            return FullTextContentResponse(
                pmid=pmid,
                pmc_id=article.pmc_id,
                full_text=None,
                error="Could not retrieve full text from PubMed Central"
            )

        return FullTextContentResponse(
            pmid=pmid,
            pmc_id=article.pmc_id,
            full_text=full_text,
            error=None
        )

    except Exception as e:
        logger.error(f"Error fetching full text for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text: {str(e)}"
        )
