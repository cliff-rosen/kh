"""
Tools API endpoints - Standalone utilities for testing and analysis
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
# PubMed Query Tester
# ============================================================================

class PubMedQueryTestRequest(BaseModel):
    """Request to test a PubMed query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.)")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date)")


class PubMedIdCheckRequest(BaseModel):
    """Request to check which PubMed IDs are captured by a query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to check")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.)")


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


@router.post("/pubmed/test-query", response_model=List[CanonicalResearchArticle])
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
        # Apply default date range if not provided
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=7)
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

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

        return articles

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
    """
    from services.pubmed_service import PubMedService

    try:
        # Apply default date range if not provided
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=365)  # 1 year for ID checking
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

        # Execute query with high limit to capture more results
        pubmed_service = PubMedService()
        articles, metadata = pubmed_service.search_articles(
            query=request.query_expression,
            max_results=1000,  # Get more results for better coverage
            offset=0,
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type,
            sort_by='relevance'
        )

        # Build set of captured PubMed IDs
        captured_pmids = {article.pubmed_id for article in articles if article.pubmed_id}

        # Create lookup for articles by PMID
        article_lookup = {article.pubmed_id: article for article in articles if article.pubmed_id}

        # Check each requested ID
        results = []
        for pmid in request.pubmed_ids:
            pmid_clean = pmid.strip()
            is_captured = pmid_clean in captured_pmids

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
            query_total_results=metadata.get('total_results', 0)
        )

    except Exception as e:
        logger.error(f"PubMed ID check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed ID check failed: {str(e)}"
        )
