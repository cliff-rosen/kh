"""
Refinement Workbench API endpoints

Endpoints for testing and refining queries, filters, and categorization.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

logger = logging.getLogger(__name__)

from database import get_db
from models import User
from routers.auth import get_current_user

from schemas.refinement_workbench import (
    RunQueryRequest,
    ManualPMIDsRequest,
    FilterArticlesRequest,
    CategorizeArticlesRequest,
    ComparePMIDsRequest,
    SourceResponse,
    FilterResponse,
    CategorizeResponse,
    ComparisonResult
)

from services.refinement_workbench_service import RefinementWorkbenchService

router = APIRouter(prefix="/api/refinement-workbench", tags=["refinement-workbench"])


# ============================================================================
# Source Operations
# ============================================================================

@router.post("/source/run-query", response_model=SourceResponse)
async def run_query(
    request: RunQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Execute a broad query from a stream's retrieval config.

    Args:
        request: Query parameters (stream_id, query_index, date range)

    Returns:
        SourceResponse with retrieved articles and metadata
    """
    try:
        service = RefinementWorkbenchService(db)
        result = await service.run_query(
            stream_id=request.stream_id,
            query_index=request.query_index,
            start_date=request.start_date,
            end_date=request.end_date
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error running query: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/source/manual-pmids", response_model=SourceResponse)
async def fetch_manual_pmids(
    request: ManualPMIDsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch articles by PMID list.

    Args:
        request: List of PubMed IDs

    Returns:
        SourceResponse with retrieved articles
    """
    try:
        service = RefinementWorkbenchService(db)
        result = await service.fetch_manual_pmids(pmids=request.pmids)
        return result
    except Exception as e:
        logger.error(f"Error fetching manual PMIDs: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ============================================================================
# Filter Operations
# ============================================================================

@router.post("/filter", response_model=FilterResponse)
async def filter_articles(
    request: FilterArticlesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply semantic filtering to articles.

    Args:
        request: Articles, filter criteria, and threshold

    Returns:
        FilterResponse with pass/fail results for each article
    """
    try:
        service = RefinementWorkbenchService(db)
        result = await service.filter_articles(
            articles=request.articles,
            filter_criteria=request.filter_criteria,
            threshold=request.threshold
        )
        return result
    except Exception as e:
        logger.error(f"Error filtering articles: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ============================================================================
# Categorize Operations
# ============================================================================

@router.post("/categorize", response_model=CategorizeResponse)
async def categorize_articles(
    request: CategorizeArticlesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Categorize articles using stream's Layer 3 categories.

    Args:
        request: Articles and stream_id (to get categories)

    Returns:
        CategorizeResponse with category assignments for each article
    """
    try:
        service = RefinementWorkbenchService(db)
        result = await service.categorize_articles(
            stream_id=request.stream_id,
            articles=request.articles
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error categorizing articles: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ============================================================================
# Compare Operations
# ============================================================================

@router.post("/compare", response_model=ComparisonResult)
async def compare_pmids(
    request: ComparePMIDsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Compare retrieved vs expected PMID lists.

    Args:
        request: Retrieved and expected PMID lists

    Returns:
        ComparisonResult with match statistics (recall, precision, F1)
    """
    try:
        service = RefinementWorkbenchService(db)
        result = service.compare_pmid_lists(
            retrieved_pmids=request.retrieved_pmids,
            expected_pmids=request.expected_pmids
        )
        return result
    except Exception as e:
        logger.error(f"Error comparing PMIDs: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
