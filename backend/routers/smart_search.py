"""
Smart Search Router

API endpoints for smart search functionality in the lab.
"""

import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from pydantic import BaseModel, Field

from models import SmartSearchSession
from database import get_db

# Import only core domain models from schemas
from schemas.smart_search import (
    SearchPaginationInfo,
    FilteredArticle,
    FilteringProgress,
    SmartSearchSessionDict,
    SessionListResponse,
    SessionResetResponse,
    SearchKeywordHistoryItem
)
from schemas.canonical_types import CanonicalResearchArticle
from schemas.features import FeatureDefinition, FeatureExtractionRequest as BaseFeatureExtractionRequest, FeatureExtractionResponse as BaseFeatureExtractionResponse

from services.auth_service import validate_token
from services.smart_search_service import SmartSearchService
from services.smart_search_session_service import SmartSearchSessionService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/lab/smart-search",
    tags=["smart-search"],
    dependencies=[Depends(validate_token)]
)

# ============================================================================
# API Request/Response Models (ordered by endpoint flow)
# ============================================================================

# Step 1: Create Evidence Specification
class EvidenceSpecificationRequest(BaseModel):
    """Request to create evidence specification from user query"""
    query: str = Field(..., description="User's document search query")
    session_id: Optional[str] = Field(None, description="Optional session ID to continue existing session")


class EvidenceSpecificationResponse(BaseModel):
    """Response from evidence specification creation"""
    original_query: str = Field(..., description="Original user query")
    evidence_specification: str = Field(..., description="Evidence specification for document search")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 2: Generate Search Keywords
class SearchKeywordsRequest(BaseModel):
    """Request to generate search keywords from evidence specification"""
    evidence_specification: str = Field(..., description="Evidence specification to convert to search terms")
    session_id: str = Field(..., description="Session ID for tracking")
    selected_sources: List[str] = Field(..., description="List of sources to search (e.g., ['pubmed', 'google_scholar'])")


class SearchKeywordsResponse(BaseModel):
    """Response from search keywords generation"""
    evidence_specification: str = Field(..., description="The evidence specification used")
    search_keywords: str = Field(..., description="Boolean search keywords for databases")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 3: Test Keywords Count
class KeywordsCountRequest(BaseModel):
    """Request to test search keywords result count"""
    search_keywords: str = Field(..., description="Boolean search keywords to test")
    session_id: str = Field(..., description="Session ID for tracking")
    selected_sources: List[str] = Field(..., description="List of sources to search")


class KeywordsCountResponse(BaseModel):
    """Response with search keywords count"""
    search_keywords: str = Field(..., description="The tested search keywords")
    total_count: int = Field(..., description="Total number of results found")
    sources_searched: List[str] = Field(..., description="List of sources that were searched")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 4: Generate Optimized Keywords
class OptimizedKeywordsRequest(BaseModel):
    """Request to generate optimized search keywords with volume control"""
    current_keywords: str = Field(..., description="Current search keywords to refine")
    evidence_specification: str = Field(..., description="Evidence specification for context")
    target_max_results: int = Field(250, description="Target maximum number of results")
    session_id: str = Field(..., description="Session ID for tracking")
    selected_sources: List[str] = Field(..., description="Sources to search")


class OptimizedKeywordsResponse(BaseModel):
    """Response from optimized keywords generation"""
    evidence_specification: str = Field(..., description="The evidence specification used")
    initial_keywords: str = Field(..., description="Initial broad search keywords")
    initial_count: int = Field(..., description="Result count for initial keywords")
    final_keywords: str = Field(..., description="Final optimized search keywords")
    final_count: int = Field(..., description="Result count for final keywords")
    refinement_applied: str = Field(..., description="Description of refinements made")
    refinement_status: str = Field(..., description="Status: 'optimal', 'refined', or 'manual_needed'")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 5: Execute Search
class SearchExecutionRequest(BaseModel):
    """Request to execute article search"""
    search_keywords: str = Field(..., description="Boolean search keywords")
    max_results: int = Field(50, description="Maximum results to return")
    offset: int = Field(0, description="Number of results to skip for pagination")
    session_id: str = Field(..., description="Session ID for tracking")
    selected_sources: List[str] = Field(..., description="List of sources to search")


class SearchExecutionResponse(BaseModel):
    """Response from article search execution"""
    articles: List[CanonicalResearchArticle] = Field(..., description="List of search results")
    pagination: SearchPaginationInfo = Field(..., description="Pagination information")
    sources_searched: List[str] = Field(..., description="List of sources that were searched")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 6: Generate Discriminator
class DiscriminatorGenerationRequest(BaseModel):
    """Request to generate semantic discriminator"""
    evidence_specification: str = Field(..., description="Evidence specification for context")
    search_keywords: str = Field(..., description="Search keywords used")
    strictness: str = Field("medium", description="Filtering strictness: low, medium, or high")
    session_id: str = Field(..., description="Session ID for tracking")


class DiscriminatorGenerationResponse(BaseModel):
    """Response from discriminator generation"""
    evidence_specification: str = Field(..., description="The evidence specification used")
    search_keywords: str = Field(..., description="The search keywords used")
    strictness: str = Field(..., description="The strictness level used")
    discriminator_prompt: str = Field(..., description="Generated discriminator prompt")
    session_id: str = Field(..., description="Session ID for tracking")


# Step 7: Filter Articles
class ArticleFilterRequest(BaseModel):
    """Request for article filtering"""
    evidence_specification: str = Field(..., description="Evidence specification for filtering")
    search_keywords: str = Field(..., description="Search keywords for context")
    strictness: str = Field("medium", description="Filtering strictness")
    discriminator_prompt: str = Field(..., description="Discriminator prompt for filtering")
    session_id: str = Field(..., description="Session ID for tracking")
    selected_sources: List[str] = Field(..., description="Sources used in search")
    max_results: int = Field(..., description="Number of articles to retrieve and filter")


class ArticleFilterResponse(BaseModel):
    """Response from article filtering"""
    filtered_articles: List[FilteredArticle] = Field(..., description="Articles with filtering results")
    total_processed: int = Field(..., description="Total articles processed")
    total_accepted: int = Field(..., description="Number of articles accepted")
    total_rejected: int = Field(..., description="Number of articles rejected")
    total_available: int = Field(..., description="Total articles initially reported as available")
    total_retrieved: int = Field(..., description="Total articles actually retrieved for filtering")
    average_confidence: float = Field(..., description="Average confidence of accepted articles")
    duration_seconds: float = Field(..., description="Processing duration in seconds")
    token_usage: Dict[str, int] = Field(..., description="LLM token usage statistics")
    session_id: str = Field(..., description="Session ID for tracking")
    search_limitation_note: Optional[str] = Field(None, description="Note about search limitations if applicable")


# Step 8: Extract Features
class FeatureExtractionRequest(BaseFeatureExtractionRequest):
    """Request to extract custom features from filtered articles"""
    session_id: str = Field(..., description="Session ID for tracking")


class FeatureExtractionResponse(BaseFeatureExtractionResponse):
    """Response from feature extraction"""
    session_id: str = Field(..., description="Session ID for tracking")


# Session Management
class SessionResetRequest(BaseModel):
    """Request to reset session to a specific step"""
    step: str = Field(..., description="Step to reset to")


class UpdateSearchKeywordHistoryRequest(BaseModel):
    """Request to update search keyword history"""
    search_keyword_history: List[SearchKeywordHistoryItem] = Field(..., description="Search keyword history to persist")

@router.post("/evidence-spec", response_model=EvidenceSpecificationResponse)
async def create_evidence_spec(
    request: EvidenceSpecificationRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> EvidenceSpecificationResponse:
    """
    Step 2: Create evidence specification from user's query
    """
    try:
        logger.info(f"User {current_user.user_id} creating evidence specification: {request.query[:100]}...")
        
        # Create session service
        session_service = SmartSearchSessionService(db)
        
        # Get or create session
        session = session_service.get_or_create_session(
            user_id=current_user.user_id,
            original_question=request.query,
            session_id=request.session_id
        )
        
        # Create evidence specification
        service = SmartSearchService()
        evidence_spec, usage = await service.create_evidence_specification(request.query)
        
        # Update session with evidence specification results
        session_service.update_evidence_spec_step(
            session_id=session.id,
            user_id=current_user.user_id,
            generated_evidence_spec=evidence_spec,
            submitted_evidence_spec=None,  # Will be set when user actually submits in next step
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens
        )
        
        response = EvidenceSpecificationResponse(
            original_query=request.query,
            evidence_specification=evidence_spec,
            session_id=session.id
        )
        
        logger.info(f"Evidence specification completed for user {current_user.user_id}, session {session.id}")
        return response
        
    except Exception as e:
        logger.error(f"Query refinement failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Evidence specification failed: {str(e)}")


@router.post("/generate-keywords", response_model=SearchKeywordsResponse)
async def generate_keywords(
    request: SearchKeywordsRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> SearchKeywordsResponse:
    """
    Step 3: Generate search keywords from evidence specification
    """
    try:
        logger.info(f"User {current_user.user_id} generating keywords from: {request.evidence_specification[:100]}...")
        
        # Create session service
        session_service = SmartSearchSessionService(db)
        
        # Get session
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Generate search keywords
        service = SmartSearchService()
        search_keywords, usage = await service.generate_search_keywords(
            request.evidence_specification,
            selected_sources=request.selected_sources
        )
        
        # Store selected sources in session
        session.selected_sources = request.selected_sources
        db.commit()
        
        # Update session - this is when user actually submits their evidence specification
        session_service.update_search_keywords_step(
            session_id=session.id,
            user_id=current_user.user_id,
            generated_search_keywords=search_keywords,
            submitted_search_keywords=None,  # Will be set when user actually executes search
            submitted_evidence_spec=request.evidence_specification,  # What user actually submitted
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            total_tokens=usage.total_tokens
        )
        
        response = SearchKeywordsResponse(
            evidence_specification=request.evidence_specification,
            search_keywords=search_keywords,
            session_id=session.id
        )
        
        logger.info(f"Keyword generation completed for user {current_user.user_id}, session {session.id}")
        return response
        
    except Exception as e:
        logger.error(f"Search query generation failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search query generation failed: {str(e)}")


@router.post("/test-keywords-count", response_model=KeywordsCountResponse)
async def test_keywords_count(
    request: KeywordsCountRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> KeywordsCountResponse:
    """
    Test search keywords to get result count without retrieving articles
    """
    try:
        logger.info(f"User {current_user.user_id} testing keywords count: {request.search_keywords[:100]}...")
        
        # Create session service
        session_service = SmartSearchSessionService(db)
        
        # Verify session exists
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get search count
        service = SmartSearchService()
        total_count, sources_searched = await service.get_search_count(
            request.search_keywords,
            selected_sources=request.selected_sources
        )
        
        response = KeywordsCountResponse(
            search_keywords=request.search_keywords,
            total_count=total_count,
            sources_searched=sources_searched,
            session_id=session.id
        )
        
        logger.info(f"Keywords count test completed: {total_count} results")
        return response
        
    except Exception as e:
        logger.error(f"Query count test failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Query count test failed: {str(e)}")


@router.post("/generate-optimized-keywords", response_model=OptimizedKeywordsResponse)
async def generate_optimized_keywords(
    request: OptimizedKeywordsRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> OptimizedKeywordsResponse:
    """
    Generate optimized search query with volume control
    """
    try:
        logger.info(f"User {current_user.user_id} generating optimized query with target {request.target_max_results} results...")
        
        # Create session service
        session_service = SmartSearchSessionService(db)
        
        # Verify session exists
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Generate optimized keywords
        service = SmartSearchService()
        result = await service.generate_optimized_search_query(
            request.current_keywords,
            request.evidence_specification, 
            request.target_max_results,
            request.selected_sources
        )
        
        # Update session with optimized search keywords
        session_service.update_search_keywords_step(
            session_id=session.id,
            user_id=current_user.user_id,
            generated_search_keywords=result.final_keywords,
            submitted_search_keywords=None,
            submitted_evidence_spec=request.evidence_specification,
            prompt_tokens=0,  # Optimization doesn't use LLM tokens
            completion_tokens=0,
            total_tokens=0
        )
        
        response = OptimizedKeywordsResponse(
            evidence_specification=request.evidence_specification,
            initial_keywords=result.initial_keywords,
            initial_count=result.initial_count,
            final_keywords=result.final_keywords,
            final_count=result.final_count,
            refinement_applied=result.refinement_description,
            refinement_status=result.status,
            session_id=session.id
        )
        
        logger.info(f"Optimized keywords generation completed: {result.final_count} results, status: {result.status}")
        return response
        
    except Exception as e:
        logger.error(f"Optimized keywords generation failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Optimized keywords generation failed: {str(e)}")


@router.post("/search", response_model=SearchExecutionResponse)
async def search(
    request: SearchExecutionRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> SearchExecutionResponse:
    """
    Step 4: Execute search with boolean query
    """
    try:
        logger.info(f"User {current_user.user_id} executing search with keywords: {request.search_keywords[:100]}...")
        
        # Execute search and update session - orchestration handled by service
        service = SmartSearchService()
        result = await service.execute_search_with_session(
            session_id=request.session_id,
            user_id=current_user.user_id,
            search_keywords=request.search_keywords,
            max_results=request.max_results,
            offset=request.offset,
            selected_sources=request.selected_sources,
            db_session=db
        )
        
        return SearchExecutionResponse(
            articles=result.articles,
            pagination=result.pagination,
            sources_searched=result.sources_searched,
            session_id=request.session_id
        )
        
    except Exception as e:
        logger.error(f"Search execution failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Search execution failed: {str(e)}")


@router.post("/generate-discriminator", response_model=DiscriminatorGenerationResponse)
async def generate_discriminator(
    request: DiscriminatorGenerationRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Step 6: Generate semantic discriminator prompt for review
    """
    try:
        logger.info(f"User {current_user.user_id} generating semantic discriminator")
        
        # Create session service
        session_service = SmartSearchSessionService(db)
        
        # Get session
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Generate discriminator
        service = SmartSearchService()
        discriminator_prompt = await service.generate_semantic_discriminator(
            refined_question=request.evidence_specification,
            search_query=request.search_keywords,
            strictness=request.strictness
        )
        
        # Update session
        session_service.update_discriminator_step(
            session_id=session.id,
            user_id=current_user.user_id,
            generated_discriminator=discriminator_prompt,
            submitted_discriminator=None,  # Will be set when user actually starts filtering
            strictness=request.strictness
        )
        
        response = DiscriminatorGenerationResponse(
            evidence_specification=request.evidence_specification,
            search_keywords=request.search_keywords,
            strictness=request.strictness,
            discriminator_prompt=discriminator_prompt,
            session_id=session.id
        )
        
        logger.info(f"Discriminator generation completed for user {current_user.user_id}, session {session.id}")
        return response
        
    except Exception as e:
        logger.error(f"Discriminator generation failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Discriminator generation failed: {str(e)}")


@router.post("/filter-articles", response_model=ArticleFilterResponse)
async def filter_articles(
    request: ArticleFilterRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Step 7: Filter articles using semantic discriminator
    """
    try:
        logger.info(f"User {current_user.user_id} requesting article filtering")
        
        # Validate session exists
        session_service = SmartSearchSessionService(db)
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Execute complete workflow in service
        service = SmartSearchService()
        result = await service.execute_filtering_workflow(
            session_id=request.session_id,
            user_id=current_user.user_id,
            search_keywords=request.search_keywords,
            evidence_specification=request.evidence_specification,
            discriminator_prompt=request.discriminator_prompt,
            strictness=request.strictness,
            selected_sources=request.selected_sources,
            max_results=request.max_results,
            db_session=db
        )
        
        # Return response directly from service result
        return ArticleFilterResponse(**result)
        
    except Exception as e:
        logger.error(f"Failed to start parallel filtering for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start parallel filtering: {str(e)}")


@router.post("/extract-features", response_model=FeatureExtractionResponse)
async def extract_features(
    request: FeatureExtractionRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Extract custom AI features from Smart Search filtered articles.
    Uses parallel processing like filter_parallel.
    """
    try:
        logger.info(f"User {current_user.user_id} extracting {len(request.features)} features for session {request.session_id}")
        
        # Get session
        session_service = SmartSearchSessionService(db)
        session = session_service.get_session(request.session_id, current_user.user_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get filtered articles (accepted ones only)
        filtered_articles = session.filtered_articles or []
        accepted_articles = [fa for fa in filtered_articles if fa.get('passed', False)]
        
        if not accepted_articles:
            raise HTTPException(status_code=400, detail="No accepted articles found in session")
        
        logger.info(f"Extracting features from {len(accepted_articles)} accepted articles")
        
        # Convert request features to FeatureDefinition objects
        feature_definitions = [
            FeatureDefinition(
                id=f.id,
                name=f.name, 
                description=f.description,
                type=f.type,
                options=f.options
            ) for f in request.features
        ]
        
        # Initialize service and extract features
        service = SmartSearchService()
        start_time = datetime.utcnow()
        
        extracted_features = await service.extract_features_parallel(
            articles=accepted_articles,
            features=feature_definitions
        )
        
        duration = datetime.utcnow() - start_time
        
        # Save both the column definitions AND the extracted feature values to the session
        # Convert feature definitions to the format expected by update_custom_columns_and_features
        columns_data = [
            {
                'id': f.id,
                'name': f.name,
                'description': f.description,
                'type': f.type,
                'options': f.options
            } for f in feature_definitions
        ]
        
        # Update both metadata and feature values atomically
        session_service.update_custom_columns_and_features(
            session_id=request.session_id,
            user_id=current_user.user_id,
            custom_columns=columns_data,
            extracted_features=extracted_features
        )
        
        # Return response
        return FeatureExtractionResponse(
            session_id=request.session_id,
            results=extracted_features,
            extraction_metadata={
                "total_articles": len(accepted_articles),
                "features_extracted": len(request.features),
                "extraction_time": duration.total_seconds()
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to extract features for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to extract features: {str(e)}")


@router.get("/sessions", response_model=SessionListResponse)
async def get_search_sessions(
    current_user = Depends(validate_token),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0
) -> SessionListResponse:
    """
    Get user's smart search session history
    """
    try:
        session_service = SmartSearchSessionService(db)
        return session_service.get_user_sessions(
            user_id=current_user.user_id,
            limit=limit,
            offset=offset
        )
        
    except Exception as e:
        logger.error(f"Failed to retrieve sessions for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve sessions: {str(e)}")


@router.get("/admin/sessions", response_model=SessionListResponse)
async def get_all_search_sessions(
    current_user = Depends(validate_token),
    db: Session = Depends(get_db),
    limit: int = 50,
    offset: int = 0
) -> SessionListResponse:
    """
    Admin endpoint to get all users' smart search session history
    """
    # Check if user is admin
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        session_service = SmartSearchSessionService(db)
        return session_service.get_all_sessions(
            limit=limit,
            offset=offset
        )
        
    except Exception as e:
        logger.error(f"Failed to retrieve all sessions for admin {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve sessions: {str(e)}")


@router.get("/sessions/{session_id}", response_model=SmartSearchSessionDict)
async def get_search_session(
    session_id: str,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> SmartSearchSessionDict:
    """
    Get specific smart search session details
    """
    try:
        session_service = SmartSearchSessionService(db)
        session = session_service.get_session(session_id, current_user.user_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return SmartSearchSessionDict(**session.to_dict())
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve session {session_id} for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve session: {str(e)}")


@router.delete("/sessions/{session_id}")
async def delete_search_session(
    session_id: str,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Delete a smart search session
    """
    try:
        session_service = SmartSearchSessionService(db)
        session = session_service.get_session(session_id, current_user.user_id)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Delete the session
        db.delete(session)
        db.commit()
        
        logger.info(f"Session {session_id} deleted by user {current_user.user_id}")
        return {"message": "Session deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete session {session_id} for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@router.post("/sessions/{session_id}/reset-to-step", response_model=SessionResetResponse)
async def reset_session_to_step(
    session_id: str,
    request: SessionResetRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
) -> SessionResetResponse:
    """
    Reset session to a specific step, clearing all data forward of that step
    """
    try:
        logger.info(f"User {current_user.user_id} resetting session {session_id} to step {request.step}")
        
        session_service = SmartSearchSessionService(db)
        session = session_service.reset_to_step(session_id, current_user.user_id, request.step)
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        logger.info(f"Session {session_id} reset to step {request.step} for user {current_user.user_id}")
        return SessionResetResponse(
            message=f"Session reset to step {request.step}",
            session=SmartSearchSessionDict(**session.to_dict())
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reset session {session_id} to step {request.step} for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")


# ============================================================================
# Search Keyword History Management
# ============================================================================

@router.put("/sessions/{session_id}/search-keyword-history")
async def update_search_keyword_history(
    session_id: str,
    request: UpdateSearchKeywordHistoryRequest,
    current_user = Depends(validate_token),
    db: Session = Depends(get_db)
):
    """
    Update the search keyword history for a session.
    
    This endpoint persists the client-side query history when the user
    submits a search, allowing the history to be restored when the session
    is resumed later.
    """
    try:
        # Convert history items to dict for JSON storage
        history_dicts = [item.dict() for item in request.search_keyword_history]
        
        # Use service to update search keyword history
        session_service = SmartSearchSessionService(db)
        session = session_service.update_search_keyword_history(
            session_id=session_id,
            user_id=current_user.user_id,
            search_keyword_history=history_dicts
        )
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "message": "Search keyword history updated successfully",
            "history_count": len(history_dicts)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update search keyword history for session {session_id}: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update search keyword history: {str(e)}")


