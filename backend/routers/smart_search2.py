"""
SmartSearch2 Router

Direct search endpoints for SmartSearch2 - no session management required.
Optimized for simple, direct search functionality.
"""

import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database import get_db

from schemas.canonical_types import CanonicalResearchArticle, CanonicalFeatureDefinition
from schemas.smart_search import SearchPaginationInfo, FilteredArticle

from services.auth_service import validate_token
from services.smart_search_service import SmartSearchService

# Event tracking imports
from utils.tracking_decorator import auto_track
from utils.tracking_helpers import (
    extract_search_data, extract_filter_data, extract_columns_data,
    extract_evidence_spec_data, extract_concepts_data, extract_concept_expansion_data, extract_keyword_test_data
)
from models import EventType

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/smart-search-2",
    tags=["smart-search-2"],
    dependencies=[Depends(validate_token)]
)

# ============================================================================
# API Request/Response Models
# ============================================================================

class DirectSearchRequest(BaseModel):
    """Request for direct search without session management"""
    query: str = Field(..., description="Search query")
    source: str = Field(..., description="Search source: 'pubmed' or 'google_scholar'")
    max_results: int = Field(50, ge=1, le=1000, description="Maximum results to return")
    offset: int = Field(0, ge=0, description="Offset for pagination")

class DirectSearchResponse(BaseModel):
    """Response from direct search"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Search results")
    pagination: SearchPaginationInfo = Field(..., description="Pagination information")
    source: str = Field(..., description="Source that was searched")
    query: str = Field(..., description="Query that was executed")

class ConceptExpansionRequest(BaseModel):
    """Request for expanding concepts to Boolean expressions"""
    concepts: List[str] = Field(..., description="Concepts to expand")
    source: str = Field(..., description="Target source: 'pubmed' or 'google_scholar'")

class ConceptExpansionResponse(BaseModel):
    """Response from concept expansion"""
    expansions: List[Dict[str, Any]] = Field(..., description="List of {concept, expression, count}")
    source: str = Field(..., description="Source")

class KeywordCombinationRequest(BaseModel):
    """Request for testing keyword combinations"""
    expressions: List[str] = Field(..., description="Boolean expressions to combine with AND")
    source: str = Field(..., description="Target source: 'pubmed' or 'google_scholar'")

class KeywordCombinationResponse(BaseModel):
    """Response from keyword combination testing"""
    combined_query: str = Field(..., description="Final combined Boolean query")
    estimated_results: int = Field(..., description="Estimated number of results")
    source: str = Field(..., description="Source")

class FeatureExtractionRequest(BaseModel):
    """Request for feature extraction from articles"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to extract features from")
    features: List[CanonicalFeatureDefinition] = Field(..., description="Feature definitions to extract")

class FeatureExtractionResponse(BaseModel):
    """Response from feature extraction"""
    results: dict = Field(..., description="Extracted features: article_id -> feature_name -> value")
    extraction_metadata: dict = Field(..., description="Metadata about the extraction process")

class ArticleFilterRequest(BaseModel):
    """Request for filtering articles using semantic discriminator"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to filter")
    filter_condition: str = Field(..., description="Filter condition for evaluating articles")
    strictness: str = Field("medium", description="Filtering strictness: low, medium, or high")

class ArticleFilterResponse(BaseModel):
    """Response from article filtering"""
    filtered_articles: List[FilteredArticle] = Field(..., description="Articles with filtering results")
    total_processed: int = Field(..., description="Total articles processed")
    total_accepted: int = Field(..., description="Number of articles accepted")
    total_rejected: int = Field(..., description="Number of articles rejected")
    average_confidence: float = Field(..., description="Average confidence of accepted articles")
    duration_seconds: float = Field(..., description="Processing duration in seconds")
    token_usage: dict = Field(..., description="LLM token usage statistics")

class EvidenceSpecRequest(BaseModel):
    """Request for evidence specification refinement"""
    user_description: str = Field(..., description="User's description of what they want to find")
    conversation_history: Optional[List[Dict[str, str]]] = Field(None, description="Previous Q&A history")

class EvidenceSpecResponse(BaseModel):
    """Response from evidence specification refinement"""
    is_complete: bool = Field(..., description="Whether the evidence spec is ready to use")
    evidence_specification: Optional[str] = Field(None, description="Clean evidence spec if complete")
    clarification_questions: Optional[List[str]] = Field(None, description="Questions to ask user if incomplete")
    completeness_score: float = Field(..., description="How complete the spec is (0-1)")
    missing_elements: List[str] = Field(default=[], description="What elements are missing")

class ConceptExtractionRequest(BaseModel):
    """Request for concept extraction from evidence specification"""
    evidence_specification: str = Field(..., description="Evidence specification to extract concepts from")

class ConceptExtractionResponse(BaseModel):
    """Response from concept extraction"""
    concepts: List[str] = Field(..., description="Extracted searchable concepts")
    evidence_specification: str = Field(..., description="Input evidence specification")

# ============================================================================
# API Endpoints
# ============================================================================


@router.post("/evidence-spec", response_model=EvidenceSpecResponse)
@auto_track(EventType.KEYWORD_HELPER_EVIDENCE_SPEC, extract_data_fn=extract_evidence_spec_data)
async def create_evidence_spec(
    request: EvidenceSpecRequest,
    req: Request,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> EvidenceSpecResponse:
    """
    Refine user's description into a clean evidence specification.

    Takes a natural language description and either:
    1. Returns a clean evidence specification if complete, or
    2. Returns clarification questions to build up the specification

    Supports conversational refinement through conversation_history.
    """
    try:
        logger.info(f"User {current_user.user_id} refining evidence spec: '{request.user_description[:100]}...'")

        # Use SmartSearchService to refine the evidence specification
        service = SmartSearchService()
        result = await service.refine_evidence_specification(
            user_description=request.user_description,
            conversation_history=request.conversation_history or []
        )

        logger.info(f"Evidence spec refinement completed for user {current_user.user_id}, complete: {result['is_complete']}")

        return EvidenceSpecResponse(**result)

    except Exception as e:
        logger.error(f"Evidence specification refinement failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evidence specification refinement failed: {str(e)}")


@router.post("/search", response_model=DirectSearchResponse)
@auto_track(EventType.SEARCH_EXECUTE, extract_data_fn=extract_search_data)
async def search(
    request: DirectSearchRequest,
    req: Request,  # Added for tracking
    response: Response,  # Added for journey ID response header
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> DirectSearchResponse:
    """
    Direct search without session management - optimized for SmartSearch2
    
    This endpoint provides direct access to search functionality without
    requiring the full SmartSearch workflow or session management.
    
    Args:
        request: Search parameters
        current_user: Authenticated user
        db: Database session
        
    Returns:
        DirectSearchResponse with articles and metadata
        
    Raises:
        HTTPException: If search fails or parameters are invalid
    """
    try:
        logger.info(f"User {current_user.user_id} direct search: '{request.query[:100]}...' in {request.source}")
        
        # Validate source
        if request.source not in ['pubmed', 'google_scholar']:
            raise HTTPException(status_code=400, detail="Source must be 'pubmed' or 'google_scholar'")
        
        # Execute search using SmartSearchService.search_articles (no session required)
        service = SmartSearchService()
        result = await service.search_articles(
            search_query=request.query,
            max_results=request.max_results,
            offset=request.offset,
            selected_sources=[request.source]
        )
        
        return DirectSearchResponse(
            articles=result.articles,
            pagination=result.pagination,
            source=request.source,
            query=request.query
        )
        
    except ValueError as e:
        logger.error(f"Direct search validation error for user {current_user.user_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Direct search failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/filter-articles", response_model=ArticleFilterResponse)
@auto_track(EventType.FILTER_APPLY, extract_data_fn=extract_filter_data)
async def filter_articles(
    request: ArticleFilterRequest,
    req: Request,  # Added for tracking
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> ArticleFilterResponse:
    """
    Filter articles using semantic discriminator without session management.

    This endpoint allows direct filtering of a list of articles against an
    evidence specification using AI-powered semantic discrimination.

    Args:
        request: Filter request with articles and criteria
        current_user: Authenticated user
        db: Database session

    Returns:
        ArticleFilterResponse with filtering results for each article

    Raises:
        HTTPException: If filtering fails
    """
    try:
        import time
        start_time = time.time()

        logger.info(f"User {current_user.user_id} filtering {len(request.articles)} articles")

        # Validate strictness level
        if request.strictness not in ['low', 'medium', 'high']:
            raise HTTPException(status_code=400, detail="Strictness must be 'low', 'medium', or 'high'")

        if not request.articles:
            raise HTTPException(status_code=400, detail="At least one article is required")

        # Use SmartSearchService to filter articles with clean approach
        service = SmartSearchService()

        # Filter articles using the clean filtering method (no discriminator generation needed)
        filtered_articles, usage = await service.filter_articles_with_criteria(
            articles=request.articles,
            filter_condition=request.filter_condition
        )

        # Calculate statistics
        total_processed = len(filtered_articles)
        total_accepted = sum(1 for fa in filtered_articles if fa.passed)
        total_rejected = total_processed - total_accepted

        # Calculate average confidence (only for accepted articles)
        accepted_articles = [fa for fa in filtered_articles if fa.passed]
        average_confidence = (
            sum(fa.confidence for fa in accepted_articles) / len(accepted_articles)
            if accepted_articles else 0.0
        )

        # Build token usage from LLMUsage object
        token_usage = {
            'prompt_tokens': usage.prompt_tokens,
            'completion_tokens': usage.completion_tokens,
            'total_tokens': usage.total_tokens
        }

        duration_seconds = time.time() - start_time

        logger.info(f"Filtering completed for user {current_user.user_id}: "
                   f"{total_accepted}/{total_processed} accepted in {duration_seconds:.1f}s")

        return ArticleFilterResponse(
            filtered_articles=filtered_articles,
            total_processed=total_processed,
            total_accepted=total_accepted,
            total_rejected=total_rejected,
            average_confidence=round(average_confidence, 3),
            duration_seconds=round(duration_seconds, 2),
            token_usage=token_usage
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Article filtering failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Article filtering failed: {str(e)}")


@router.post("/extract-features", response_model=FeatureExtractionResponse)
@auto_track(EventType.COLUMNS_ADD, extract_data_fn=extract_columns_data)
async def extract_features(
    request: FeatureExtractionRequest,
    req: Request,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> FeatureExtractionResponse:
    """
    Extract AI features from articles without session management.
    
    This endpoint allows direct feature extraction from a list of articles
    using custom AI features - perfect for SmartSearch2's session-less approach.
    
    Args:
        request: Feature extraction request with articles and feature definitions
        current_user: Authenticated user
        db: Database session
        
    Returns:
        FeatureExtractionResponse with extracted feature data
        
    Raises:
        HTTPException: If extraction fails
    """
    try:
        logger.info(f"User {current_user.user_id} extracting {len(request.features)} features from {len(request.articles)} articles")
        
        if not request.features:
            raise HTTPException(status_code=400, detail="At least one feature definition is required")
        
        if not request.articles:
            raise HTTPException(status_code=400, detail="At least one article is required")
        
        # Convert articles to dict format expected by the service
        articles_dict = []
        for article in request.articles:
            article_dict = {
                'id': article.id,
                'title': article.title,
                'abstract': article.abstract or "",
                'authors': article.authors,
                'journal': article.journal,
                'publication_date': article.publication_date,
                'url': article.url
            }
            articles_dict.append(article_dict)
        
        # Use SmartSearchService to extract features
        service = SmartSearchService()
        results = await service.extract_features_parallel(
            articles=articles_dict,
            features=request.features
        )
        
        # Calculate metadata
        extraction_metadata = {
            'total_articles': len(request.articles),
            'features_extracted': len(request.features),
            'successful_extractions': len(results)
        }
        
        logger.info(f"Feature extraction completed for user {current_user.user_id}: {len(results)} successful extractions")
        
        return FeatureExtractionResponse(
            results=results,
            extraction_metadata=extraction_metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Feature extraction failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Feature extraction failed: {str(e)}")



# ============================================================================
# Keyword Helper
# ============================================================================

@router.post("/extract-concepts", response_model=ConceptExtractionResponse)
@auto_track(EventType.KEYWORD_HELPER_CONCEPTS, extract_data_fn=extract_concepts_data)
async def extract_concepts(
    request: ConceptExtractionRequest,
    req: Request,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> ConceptExtractionResponse:
    """
    Extract key searchable concepts from evidence specification.

    This endpoint takes a complete evidence specification and extracts
    the key biomedical concepts that can be used to build search queries.

    Args:
        request: Concept extraction request
        current_user: Authenticated user
        db: Database session

    Returns:
        ConceptExtractionResponse with extracted concepts

    Raises:
        HTTPException: If extraction fails
    """
    try:
        logger.info(f"User {current_user.user_id} extracting concepts from evidence spec")

        # Use SmartSearchService to extract concepts
        service = SmartSearchService()
        concepts, usage = await service.extract_search_concepts(
            evidence_specification=request.evidence_specification
        )

        logger.info(f"Concept extraction completed for user {current_user.user_id}: {len(concepts)} concepts")

        return ConceptExtractionResponse(
            concepts=concepts,
            evidence_specification=request.evidence_specification
        )

    except Exception as e:
        logger.error(f"Concept extraction failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Concept extraction failed: {str(e)}")


@router.post("/expand-concepts", response_model=ConceptExpansionResponse)
@auto_track(EventType.KEYWORD_HELPER_EXPRESSIONS, extract_data_fn=extract_concept_expansion_data)
async def expand_concepts(
    request: ConceptExpansionRequest,
    req: Request,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> ConceptExpansionResponse:
    """
    Expand concepts to Boolean expressions with result counts.

    Takes a list of concepts and expands each one into a comprehensive
    Boolean OR expression with synonyms, then tests each for result counts.

    Args:
        request: Concept expansion request
        current_user: Authenticated user
        db: Database session

    Returns:
        ConceptExpansionResponse with expansions and counts

    Raises:
        HTTPException: If expansion fails
    """
    try:
        logger.info(f"User {current_user.user_id} expanding {len(request.concepts)} concepts for {request.source}")

        if not request.concepts:
            raise HTTPException(status_code=400, detail="At least one concept is required")

        if request.source not in ['pubmed', 'google_scholar']:
            raise HTTPException(status_code=400, detail="Source must be 'pubmed' or 'google_scholar'")

        # Use SmartSearchService to expand concepts
        service = SmartSearchService()
        expansions = await service.expand_concepts_with_counts(
            concepts=request.concepts,
            source=request.source
        )

        logger.info(f"Concept expansion completed for user {current_user.user_id}: {len(expansions)} expansions")

        return ConceptExpansionResponse(
            expansions=expansions,
            source=request.source
        )

    except Exception as e:
        logger.error(f"Concept expansion failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Concept expansion failed: {str(e)}")


@router.post("/test-keyword-combination", response_model=KeywordCombinationResponse)
@auto_track(EventType.COVERAGE_TEST, extract_data_fn=extract_keyword_test_data)
async def test_keyword_combination(
    request: KeywordCombinationRequest,
    req: Request,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> KeywordCombinationResponse:
    """
    Test a combination of Boolean expressions with AND logic.

    Takes multiple Boolean expressions and combines them with AND,
    then tests the result count.

    Args:
        request: Keyword combination request
        current_user: Authenticated user
        db: Database session

    Returns:
        KeywordCombinationResponse with combined query and count

    Raises:
        HTTPException: If testing fails
    """
    try:
        logger.info(f"User {current_user.user_id} testing combination of {len(request.expressions)} expressions")

        if not request.expressions:
            raise HTTPException(status_code=400, detail="At least one expression is required")

        if request.source not in ['pubmed', 'google_scholar']:
            raise HTTPException(status_code=400, detail="Source must be 'pubmed' or 'google_scholar'")

        # Use SmartSearchService to test combination
        service = SmartSearchService()
        result = await service.test_expression_combination(
            expressions=request.expressions,
            source=request.source
        )

        logger.info(f"Combination test completed for user {current_user.user_id}: {result['estimated_results']} estimated results")

        return KeywordCombinationResponse(
            combined_query=result['combined_query'],
            estimated_results=result['estimated_results'],
            source=request.source
        )

    except Exception as e:
        logger.error(f"Keyword combination test failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Keyword combination test failed: {str(e)}")



# ============================================================================
# Analytics Endpoints
# ============================================================================

@router.get("/analytics/journey/{journey_id}")
async def get_journey_analytics(
    journey_id: str,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get analytics for a specific journey

    Returns timeline of events and metrics for the journey.
    """
    from services.event_tracking import EventTracker

    tracker = EventTracker(db)
    analytics = tracker.get_journey_analytics(journey_id)
    return analytics


@router.get("/analytics/my-journeys")
async def get_my_journeys(
    limit: int = Query(10, ge=1, le=50),
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get recent journeys for the current user

    Returns list of recent journey summaries.
    """
    from services.event_tracking import EventTracker

    tracker = EventTracker(db)
    # Use the authenticated user's ID
    user_id = current_user.user_id if hasattr(current_user, 'user_id') else str(current_user)
    journeys = tracker.get_user_journeys(user_id, limit)
    return {"journeys": journeys}


@router.get("/analytics/all-journeys")
async def get_all_journeys(
    limit: int = Query(50, ge=1, le=100),
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Get recent journeys from all users (admin only)

    Returns list of recent journey summaries from all users with user info.
    """
    # Check if user is admin
    if not hasattr(current_user, 'role') or current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")

    from services.event_tracking import EventTracker

    tracker = EventTracker(db)
    journeys = tracker.get_all_user_journeys(limit)
    return {"journeys": journeys}

