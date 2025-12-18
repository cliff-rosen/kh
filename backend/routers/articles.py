"""
Articles API endpoints - fetches from local database
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, Article
from schemas.canonical_types import CanonicalResearchArticle
from routers.auth import get_current_user

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
    article = db.query(Article).filter(Article.pmid == pmid).first()

    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Article with PMID {pmid} not found in database"
        )

    # Convert to CanonicalResearchArticle
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
