"""
Tools API endpoints - Standalone utilities for testing and analysis

Only contains endpoints used by the Tools page in the main navigation.
Tablizer-specific endpoints (search, filter, extract) are in the tablizer router.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])


# ============================================================================
# PubMed Query Tester (Tools Page)
# ============================================================================

class PubMedQueryTestRequest(BaseModel):
    """Request to test a PubMed query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.)")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date)")


class PubMedQueryTestResponse(BaseModel):
    """Response from PubMed query test"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles returned")
    total_results: int = Field(..., description="Total number of results matching the query")
    returned_count: int = Field(..., description="Number of articles returned in this response")


class PubMedIdCheckRequest(BaseModel):
    """Request to check which PubMed IDs are captured by a query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to check")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('publication', description="Date type for filtering (publication=DP [default/matches pipeline], entry=EDAT, pubmed=PDAT, completion=DCOM)")


class PubMedIdCheckResult(BaseModel):
    """Result for a single PubMed ID check"""
    pubmed_id: str
    captured: bool  # Whether this ID was in the query results
    article: Optional[CanonicalResearchArticle] = None  # Article data if found


class PubMedIdCheckResponse(BaseModel):
    """Response from PubMed ID check"""
    total_ids: int = Field(..., description="Total number of IDs checked")
    captured_count: int = Field(..., description="Number of IDs captured by query")
    missed_count: int = Field(..., description="Number of IDs missed by query")
    results: List[PubMedIdCheckResult] = Field(..., description="Results for each ID")
    query_total_results: int = Field(..., description="Total results from query")


@router.post("/pubmed/test-query", response_model=PubMedQueryTestResponse)
async def test_pubmed_query(
    request: PubMedQueryTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a PubMed query and return results.

    Standalone tool for testing PubMed queries without requiring a research stream.
    """
    from services.pubmed_service import PubMedService

    try:
        # Use dates as provided (None means no date filtering)
        start_date = request.start_date
        end_date = request.end_date

        # Execute query
        pubmed_service = PubMedService()
        articles, metadata = pubmed_service.search_articles(
            query=request.query_expression,
            max_results=request.max_results,
            offset=0,
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type,
            sort_by=request.sort_by
        )

        return PubMedQueryTestResponse(
            articles=articles,
            total_results=metadata.get("total_results", len(articles)),
            returned_count=len(articles)
        )

    except Exception as e:
        logger.error(f"PubMed query test failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed query test failed: {str(e)}"
        )


@router.post("/pubmed/check-ids", response_model=PubMedIdCheckResponse)
async def check_pubmed_ids(
    request: PubMedIdCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Check which PubMed IDs from a list are captured by a query.

    This tool runs a query and checks which of the provided PubMed IDs
    appear in the results, helping validate query coverage.

    This is optimized for speed: it only fetches article IDs from the query
    (very fast), then fetches full metadata only for the captured IDs.
    """
    from services.pubmed_service import PubMedService
    from schemas.canonical_types import CanonicalPubMedArticle
    from schemas.research_article_converters import pubmed_to_research_article

    try:
        # Apply default date range if not provided
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=365)  # 1 year for ID checking
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

        # FAST: Get just the IDs from the query (no article fetching)
        pubmed_service = PubMedService()
        logger.info(f"Fetching IDs for query with date_type={request.date_type}: {request.query_expression}")

        # Use same max_results as pipeline to ensure consistency
        pmids_from_query, total_count = pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=500,  # Match pipeline's MAX_ARTICLES_PER_SOURCE
            sort_by='relevance',
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type
        )

        # Build set of captured PubMed IDs
        captured_pmids_set = set(pmids_from_query)
        logger.info(f"Query returned {total_count} total results, got {len(pmids_from_query)} IDs")

        # Determine which user IDs were captured
        user_pmids_clean = [pmid.strip() for pmid in request.pubmed_ids]
        captured_user_pmids = [pmid for pmid in user_pmids_clean if pmid in captured_pmids_set]

        logger.info(f"User provided {len(user_pmids_clean)} IDs, {len(captured_user_pmids)} were captured")

        # SLOW: Fetch full article metadata ONLY for captured IDs
        article_lookup = {}
        if captured_user_pmids:
            logger.info(f"Fetching full article data for {len(captured_user_pmids)} captured IDs")
            articles = pubmed_service.get_articles_from_ids(captured_user_pmids)

            # Convert to canonical format and build lookup
            for article in articles:
                try:
                    canonical_pubmed = CanonicalPubMedArticle(
                        pmid=article.PMID,
                        title=article.title or "[No title available]",
                        abstract=article.abstract or "[No abstract available]",
                        authors=article.authors.split(', ') if article.authors else [],
                        journal=article.journal or "[Unknown journal]",
                        publication_date=article.pub_date if article.pub_date else None,
                        keywords=[],
                        mesh_terms=[],
                        metadata={
                            "volume": article.volume,
                            "issue": article.issue,
                            "pages": article.pages,
                        }
                    )
                    research_article = pubmed_to_research_article(canonical_pubmed)
                    article_lookup[article.PMID] = research_article
                except Exception as e:
                    logger.error(f"Error converting article {article.PMID}: {e}")

        # Build results for each user-provided ID
        results = []
        for pmid_clean in user_pmids_clean:
            is_captured = pmid_clean in captured_pmids_set

            result = PubMedIdCheckResult(
                pubmed_id=pmid_clean,
                captured=is_captured,
                article=article_lookup.get(pmid_clean) if is_captured else None
            )
            results.append(result)

        captured_count = sum(1 for r in results if r.captured)

        return PubMedIdCheckResponse(
            total_ids=len(request.pubmed_ids),
            captured_count=captured_count,
            missed_count=len(request.pubmed_ids) - captured_count,
            results=results,
            query_total_results=total_count
        )

    except Exception as e:
        logger.error(f"PubMed ID check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed ID check failed: {str(e)}"
        )
