"""
Refinement Workbench API endpoints

Endpoints for testing and refining queries, filters, and categorization.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle
from services.refinement_workbench_service import RefinementWorkbenchService

router = APIRouter(prefix="/api/refinement-workbench", tags=["refinement-workbench"])


# ============================================================================
# Request/Response Models
# ============================================================================

class RunQueryRequest(BaseModel):
    """Request to execute a broad query from a stream's retrieval config"""
    stream_id: int = Field(..., description="Research stream ID")
    query_index: int = Field(..., description="Index of the broad query (0-based)")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")


class ManualPMIDsRequest(BaseModel):
    """Request to fetch articles by PMID list"""
    pmids: List[str] = Field(..., description="List of PubMed IDs")


class SourceResponse(BaseModel):
    """Response from source operations"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Retrieved articles")
    count: int = Field(..., description="Number of articles retrieved")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class FilterArticlesRequest(BaseModel):
    """Request to apply semantic filtering to articles"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to filter")
    filter_criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Minimum score to pass (0.0-1.0)")


class FilterResult(BaseModel):
    """Result of filtering a single article"""
    article: CanonicalResearchArticle = Field(..., description="The article")
    passed: bool = Field(..., description="Whether article passed the filter")
    score: float = Field(..., description="Relevance score (0.0-1.0)")
    reasoning: str = Field(..., description="Explanation of the score")


class FilterResponse(BaseModel):
    """Response from filter operation"""
    results: List[FilterResult] = Field(..., description="Filter results for each article")
    count: int = Field(..., description="Total articles processed")
    passed: int = Field(..., description="Number of articles that passed")
    failed: int = Field(..., description="Number of articles that failed")


class CategorizeArticlesRequest(BaseModel):
    """Request to categorize articles using stream's Layer 3 categories"""
    stream_id: int = Field(..., description="Research stream ID (to get categories)")
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to categorize")


class CategoryAssignment(BaseModel):
    """Result of categorizing a single article"""
    article: CanonicalResearchArticle = Field(..., description="The article")
    assigned_categories: List[str] = Field(..., description="Assigned category IDs")


class CategorizeResponse(BaseModel):
    """Response from categorize operation"""
    results: List[CategoryAssignment] = Field(..., description="Categorization results")
    count: int = Field(..., description="Total articles processed")
    category_distribution: Dict[str, int] = Field(..., description="Count per category")


class ComparePMIDsRequest(BaseModel):
    """Request to compare retrieved vs expected PMIDs"""
    retrieved_pmids: List[str] = Field(..., description="PMIDs that were retrieved")
    expected_pmids: List[str] = Field(..., description="PMIDs that were expected")


class ComparisonResult(BaseModel):
    """Result of PMID comparison"""
    matched: List[str] = Field(..., description="PMIDs in both lists")
    missed: List[str] = Field(..., description="Expected PMIDs that were not retrieved")
    extra: List[str] = Field(..., description="Retrieved PMIDs that were not expected")
    matched_count: int = Field(..., description="Number of matches")
    missed_count: int = Field(..., description="Number missed")
    extra_count: int = Field(..., description="Number extra")
    recall: float = Field(..., description="Recall = matched / expected")
    precision: float = Field(..., description="Precision = matched / retrieved")
    f1_score: float = Field(..., description="F1 score = 2 * (precision * recall) / (precision + recall)")


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
        articles, metadata = await service.run_query(
            stream_id=request.stream_id,
            query_index=request.query_index,
            start_date=request.start_date,
            end_date=request.end_date
        )
        return SourceResponse(
            articles=articles,
            count=len(articles),
            metadata=metadata
        )
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
        articles, metadata = await service.fetch_manual_pmids(pmids=request.pmids)
        return SourceResponse(
            articles=articles,
            count=len(articles),
            metadata=metadata
        )
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
        results_list = await service.filter_articles(
            articles=request.articles,
            filter_criteria=request.filter_criteria,
            threshold=request.threshold
        )

        # Convert dicts to FilterResult models
        filter_results = [
            FilterResult(**result_dict)
            for result_dict in results_list
        ]

        # Count passed/failed
        passed_count = sum(1 for r in filter_results if r.passed)

        return FilterResponse(
            results=filter_results,
            count=len(filter_results),
            passed=passed_count,
            failed=len(filter_results) - passed_count
        )
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
        results_list = await service.categorize_articles(
            stream_id=request.stream_id,
            articles=request.articles
        )

        # Convert dicts to CategoryAssignment models
        category_results = [
            CategoryAssignment(**result_dict)
            for result_dict in results_list
        ]

        # Calculate category distribution
        category_distribution = {}
        for result in category_results:
            for cat_id in result.assigned_categories:
                category_distribution[cat_id] = category_distribution.get(cat_id, 0) + 1

        return CategorizeResponse(
            results=category_results,
            count=len(category_results),
            category_distribution=category_distribution
        )
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
        result_dict = service.compare_pmid_lists(
            retrieved_pmids=request.retrieved_pmids,
            expected_pmids=request.expected_pmids
        )
        return ComparisonResult(**result_dict)
    except Exception as e:
        logger.error(f"Error comparing PMIDs: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
