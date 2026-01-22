"""
Articles API endpoints - fetches from local database
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status

from models import User
from schemas.canonical_types import CanonicalResearchArticle
from services.article_service import ArticleService, get_article_service
from services.pubmed_service import get_full_text_links
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
        article = await service.get_article_by_pmid(pmid)

        if not article:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Article with PMID {pmid} not found in database"
            )

        return article
    except HTTPException:
        raise
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
    This fetches live data from PubMed's ELink API.
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
