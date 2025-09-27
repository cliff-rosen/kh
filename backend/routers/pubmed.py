from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
from sqlalchemy.orm import Session
import logging

from schemas.canonical_types import CanonicalPubMedArticle

from services.pubmed_service import search_articles_by_date_range

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["pubmed"]
)

@router.get("/articles/search", response_model=List[CanonicalPubMedArticle])
def search_articles(
    filter_term: str = Query(..., description="The search term to filter articles by."),
    start_date: str = Query(..., description="The start date for the search range (YYYY-MM-DD)."),
    end_date: str = Query(..., description="The end date for the search range (YYYY-MM-DD).")
):
    """
    Search for PubMed articles within a specified date range.
    """
    try:
        return search_articles_by_date_range(filter_term, start_date, end_date)
    except Exception as e:
        logger.error(f"Error in PubMed search endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") 