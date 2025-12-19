"""
Articles API endpoints - fetches from local database
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from schemas.canonical_types import CanonicalResearchArticle
from services.article_service import ArticleService
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.get("/{pmid}", response_model=CanonicalResearchArticle)
async def get_article_by_pmid(
    pmid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get an article by its PMID from the local database.
    This fetches from our stored articles, not from PubMed directly.
    """
    try:
        service = ArticleService(db)
        article = service.get_article_by_pmid(pmid)

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
