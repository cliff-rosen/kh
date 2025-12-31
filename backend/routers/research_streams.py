"""
Research Streams API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import json

logger = logging.getLogger(__name__)

from database import get_db
from models import User, RunType, StreamScope, UserRole

from schemas.research_stream import (
    ResearchStream,
    Category,
    StreamType,
    ReportFrequency,
    RetrievalConfig,
    PresentationConfig,
    Concept,
    BroadQuery,
    BroadSearchStrategy
)
from schemas.semantic_space import SemanticSpace
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle


from services.research_stream_service import ResearchStreamService
from services.retrieval_query_service import RetrievalQueryService
from services.concept_proposal_service import ConceptProposalService
from services.broad_search_service import BroadSearchService
from services.pipeline_service import PipelineService
from services.user_tracking_service import track_endpoint

from routers.auth import get_current_user

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


def _check_can_modify_stream(stream, current_user: User):
    """
    Check if user can modify (edit/delete/run) a stream.

    Rules:
    - Global streams: Only platform admins can modify
    - Organization streams: Only org admins of that org (or platform admins)
    - Personal streams: Only the creator (or platform admins)

    Raises HTTPException if not authorized.
    """
    # Normalize scope to string for comparison (handles both enum and string)
    scope = getattr(stream.scope, 'value', stream.scope) if stream.scope else 'personal'

    if scope == StreamScope.GLOBAL.value:
        if current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can modify global streams"
            )
    elif scope == StreamScope.ORGANIZATION.value:
        if current_user.role == UserRole.PLATFORM_ADMIN:
            return  # Platform admins can modify any stream
        if current_user.role != UserRole.ORG_ADMIN or current_user.org_id != stream.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only org admins can modify organization streams"
            )
    else:  # Personal stream
        if stream.user_id != current_user.user_id and current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own personal streams"
            )


@router.get("/metadata/sources", response_model=List[InformationSource])
async def get_information_sources():
    """Get the authoritative list of information sources"""
    return INFORMATION_SOURCES

# ============================================================================
# Research Stream CRUD Endpoints
# ============================================================================

class ResearchStreamCreateRequest(BaseModel):
    """Request schema for creating a research stream - three-layer architecture"""
    stream_name: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=1, description="Why this stream exists")
    report_frequency: ReportFrequency
    chat_instructions: Optional[str] = Field(None, description="Stream-specific instructions for the chat assistant")
    # Scope determines visibility (personal, organization, or global)
    # - personal: Only creator can see (default)
    # - organization: All org members can subscribe (org_admin only)
    # - global: Platform-wide, orgs subscribe to access (platform_admin only)
    scope: Optional[str] = Field("personal", description="Stream scope: personal, organization, or global")
    # Three-layer architecture
    semantic_space: SemanticSpace = Field(..., description="Layer 1: What information matters")
    retrieval_config: RetrievalConfig = Field(..., description="Layer 2: How to find & filter")
    presentation_config: PresentationConfig = Field(..., description="Layer 3: How to organize results")

class ResearchStreamUpdateRequest(BaseModel):
    """Request schema for updating a research stream - three-layer architecture"""
    stream_name: Optional[str] = Field(None, min_length=1, max_length=255)
    purpose: Optional[str] = None
    report_frequency: Optional[ReportFrequency] = None
    is_active: Optional[bool] = None
    chat_instructions: Optional[str] = Field(None, description="Stream-specific instructions for the chat assistant")
    # Three-layer architecture
    semantic_space: Optional[SemanticSpace] = None
    retrieval_config: Optional[RetrievalConfig] = None
    presentation_config: Optional[PresentationConfig] = None

class ToggleStatusRequest(BaseModel):
    is_active: bool


@router.get("", response_model=List[ResearchStream])
async def get_research_streams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all research streams for the current user"""
    service = ResearchStreamService(db)
    return service.get_user_research_streams(current_user.user_id)


@router.get("/{stream_id}", response_model=ResearchStream)
@track_endpoint("view_stream")
async def get_research_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific research stream by ID"""
    service = ResearchStreamService(db)
    # Service raises 404 if not found or not authorized
    return service.get_research_stream(stream_id, current_user.user_id)


@router.post("", response_model=ResearchStream, status_code=status.HTTP_201_CREATED)
async def create_research_stream(
    request: ResearchStreamCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new research stream with three-layer architecture.

    Scope determines visibility:
    - personal: Only creator can see (any user)
    - organization: Org members can subscribe (org_admin only)
    - global: Platform-wide (platform_admin only)
    """
    service = ResearchStreamService(db)

    # Parse and validate scope
    scope_str = (request.scope or "personal").lower()
    try:
        scope = StreamScope(scope_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scope: {scope_str}. Must be one of: personal, organization, global"
        )

    # Validate scope based on user role
    if scope == StreamScope.GLOBAL and current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only platform admins can create global streams"
        )

    if scope == StreamScope.ORGANIZATION:
        if current_user.role not in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only org admins can create organization streams"
            )
        if not current_user.org_id and current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must belong to an organization to create org streams"
            )

    # Convert Pydantic models to dicts
    semantic_space_dict = request.semantic_space.dict() if hasattr(request.semantic_space, 'dict') else request.semantic_space
    retrieval_config_dict = request.retrieval_config.dict() if hasattr(request.retrieval_config, 'dict') else request.retrieval_config
    presentation_config_dict = request.presentation_config.dict() if hasattr(request.presentation_config, 'dict') else request.presentation_config

    return service.create_research_stream(
        user_id=current_user.user_id,
        stream_name=request.stream_name,
        purpose=request.purpose,
        report_frequency=request.report_frequency,
        chat_instructions=request.chat_instructions,
        semantic_space=semantic_space_dict,
        retrieval_config=retrieval_config_dict,
        presentation_config=presentation_config_dict,
        scope=scope,
        org_id=current_user.org_id
    )


@router.put("/{stream_id}", response_model=ResearchStream)
async def update_research_stream(
    stream_id: int,
    request: ResearchStreamUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing research stream with Phase 1 support"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Check if user can modify this stream (based on scope and role)
    _check_can_modify_stream(existing_stream, current_user)

    # Prepare update data (only non-None values)
    update_data = {k: v for k, v in request.dict().items() if v is not None}

    # Convert scoring_config from Pydantic model to dict if present
    if 'scoring_config' in update_data and update_data['scoring_config'] is not None:
        if hasattr(update_data['scoring_config'], 'dict'):
            update_data['scoring_config'] = update_data['scoring_config'].dict()

    return service.update_research_stream(stream_id, update_data)


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a research stream"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Check if user can modify this stream (based on scope and role)
    _check_can_modify_stream(existing_stream, current_user)

    service.delete_research_stream(stream_id)


@router.patch("/{stream_id}/status", response_model=ResearchStream)
async def toggle_research_stream_status(
    stream_id: int,
    request: ToggleStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Toggle research stream active status"""
    service = ResearchStreamService(db)

    # Verify ownership
    existing_stream = service.get_research_stream(stream_id, current_user.user_id)
    if not existing_stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Check if user can modify this stream (based on scope and role)
    _check_can_modify_stream(existing_stream, current_user)

    return service.update_research_stream(stream_id, {"is_active": request.is_active})


# ============================================================================
# Granular Update Endpoints (for Refinement Workbench)
# ============================================================================


class UpdateBroadQueryRequest(BaseModel):
    """Request to update a specific broad query"""
    query_expression: str = Field(..., description="Updated PubMed query expression")


class UpdateSemanticFilterRequest(BaseModel):
    """Request to update semantic filter for a broad query"""
    enabled: bool = Field(..., description="Whether semantic filter is enabled")
    criteria: str = Field("", description="Natural language filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Relevance threshold (0.0-1.0)")


@router.patch("/{stream_id}/retrieval-config/queries/{query_index}")
async def update_broad_query(
    stream_id: int,
    query_index: int,
    request: UpdateBroadQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a specific broad query's expression.
    Used by refinement workbench to apply tested queries back to stream config.

    Args:
        stream_id: Research stream ID
        query_index: Index of the query to update (0-based)
        request: Updated query expression

    Returns:
        Updated ResearchStream
    """
    service = ResearchStreamService(db)

    try:
        # Verify ownership (will raise if not found/unauthorized)
        stream = service.get_research_stream(stream_id, current_user.user_id)

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(stream, current_user)

        # Update via service
        updated_stream = service.update_broad_query(
            stream_id=stream_id,
            query_index=query_index,
            query_expression=request.query_expression
        )
        return updated_stream
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.patch("/{stream_id}/retrieval-config/queries/{query_index}/semantic-filter")
async def update_semantic_filter(
    stream_id: int,
    query_index: int,
    request: UpdateSemanticFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update semantic filter configuration for a specific broad query.
    Used by refinement workbench to apply tested filters back to stream config.

    Args:
        stream_id: Research stream ID
        query_index: Index of the query whose filter to update (0-based)
        request: Updated filter configuration

    Returns:
        Updated ResearchStream
    """
    service = ResearchStreamService(db)

    try:
        # Verify ownership (will raise if not found/unauthorized)
        stream = service.get_research_stream(stream_id, current_user.user_id)

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(stream, current_user)

        # Update via service
        updated_stream = service.update_semantic_filter(
            stream_id=stream_id,
            query_index=query_index,
            enabled=request.enabled,
            criteria=request.criteria,
            threshold=request.threshold
        )
        return updated_stream
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# ============================================================================
# Shared Retrieval Response Models
# ============================================================================


class QueryTestResponse(BaseModel):
    """Response from query testing"""
    success: bool = Field(..., description="Whether query executed successfully")
    article_count: int = Field(..., description="Total number of articles found")
    sample_articles: List[CanonicalResearchArticle] = Field(..., description="Sample articles")
    error_message: Optional[str] = Field(None, description="Error message if query failed")


class ProposeConceptsResponse(BaseModel):
    """Response from concept proposal based on semantic space analysis"""
    proposed_concepts: List[Concept] = Field(..., description="Proposed concepts for retrieval")
    analysis: Dict[str, Any] = Field(..., description="Phase 1 analysis (entities, relationships)")
    reasoning: str = Field(..., description="Overall strategy explanation")
    coverage_check: Dict[str, Any] = Field(..., description="Topic coverage validation")


class ProposeBroadSearchResponse(BaseModel):
    """Response from broad search proposal"""
    queries: List[BroadQuery] = Field(..., description="Proposed broad search queries (usually 1-3)")
    strategy_rationale: str = Field(..., description="Overall explanation of broad search strategy")
    coverage_analysis: Dict[str, Any] = Field(..., description="Analysis of how queries cover topics")


class GenerateBroadFilterRequest(BaseModel):
    """Request to generate semantic filter for a broad query"""
    broad_query: BroadQuery = Field(..., description="Broad query to generate filter for")


class GenerateConceptQueryRequest(BaseModel):
    """Request to generate a query for a specific concept"""
    concept: Concept = Field(..., description="Concept to generate query for")
    source_id: str = Field(..., description="Source to generate query for (e.g., 'pubmed')")


class GenerateConceptQueryResponse(BaseModel):
    """Response from concept query generation"""
    query_expression: str = Field(..., description="Generated query expression")
    reasoning: str = Field(..., description="Explanation of query design")


class GenerateConceptFilterRequest(BaseModel):
    """Request to generate semantic filter for a concept"""
    concept: Concept = Field(..., description="Concept to generate filter for")


class GenerateConceptFilterResponse(BaseModel):
    """Response from semantic filter generation"""
    criteria: str = Field(..., description="Filter criteria description")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Relevance threshold (0-1)")
    reasoning: str = Field(..., description="Explanation of filter design")


class ValidateConceptsRequest(BaseModel):
    """Request to validate concepts configuration"""
    concepts: List[Concept]


class ValidateConceptsResponse(BaseModel):
    """Response from concepts validation"""
    is_complete: bool = Field(..., description="Whether all topics are covered")
    coverage: Dict[str, Any] = Field(..., description="Topic coverage details")
    configuration_status: Dict[str, Any] = Field(..., description="Configuration completeness")
    warnings: List[str] = Field(..., description="Validation warnings")
    ready_to_activate: bool = Field(..., description="Whether config is ready for production")


# ============================================================================
# Retrieval Concept Workflow (Concept-Based Architecture)
# ============================================================================

@router.post("/{stream_id}/retrieval/propose-concepts", response_model=ProposeConceptsResponse)
async def propose_retrieval_concepts(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 1: Propose retrieval concepts based on semantic space analysis.

    Analyzes the semantic space and generates concept proposals following the framework:
    - Extracts entities and relationships
    - Generates entity-relationship patterns (concepts)
    - Many-to-many mapping to topics
    - Volume-driven design (will be refined in later phases)
    """
    concept_service = ConceptProposalService(db, current_user.user_id)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns Pydantic schema with semantic_space already parsed
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Propose concepts using parsed semantic_space
        result = await concept_service.propose_concepts(stream.semantic_space)

        return ProposeConceptsResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept proposal failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept proposal failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/propose-broad-search", response_model=ProposeBroadSearchResponse)
async def propose_broad_search(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Alternative to propose-concepts: Generate broad, simple search strategy.

    Analyzes the semantic space and proposes 1-3 broad search queries that
    cast a wide net to capture all relevant literature. Optimized for weekly
    monitoring where accepting false positives is better than missing papers.

    Philosophy:
    - Find the most general terms that cover all topics
    - Simple is better: 1-3 queries instead of many narrow concepts
    - Accept some false positives (better than missing papers)
    - Leverage that weekly volumes are naturally limited
    """
    broad_search_service = BroadSearchService(db, current_user.user_id)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Propose broad search using parsed semantic_space
        result = await broad_search_service.propose_broad_search(stream.semantic_space)

        return ProposeBroadSearchResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broad search proposal failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Broad search proposal failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-broad-filter", response_model=GenerateConceptFilterResponse)
async def generate_broad_filter(
    stream_id: int,
    request: GenerateBroadFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate semantic filter criteria for a broad query.

    Uses LLM to create filter criteria based on the broad query's covered topics
    and search terms.
    """
    query_service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Generate filter using service
        criteria, threshold, reasoning = await query_service.generate_filter_for_broad_query(
            broad_query=request.broad_query,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptFilterResponse(
            criteria=criteria,
            threshold=threshold,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broad filter generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Broad filter generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-concept-query", response_model=GenerateConceptQueryResponse)
async def generate_concept_query(
    stream_id: int,
    request: GenerateConceptQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a source-specific query for a concept.

    Uses the concept's entity pattern, relationship pattern, and vocabulary terms
    to generate an optimized query following framework principles:
    - Single inclusion pattern
    - Vocabulary expansion within entities
    - Minimal exclusions
    """
    query_service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns Pydantic schema with semantic_space already parsed
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Validate source
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if request.source_id not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_id. Must be one of: {', '.join(valid_sources)}"
            )

        # Generate query using concept from request and parsed semantic_space
        query_expression, reasoning = await query_service.generate_query_for_concept(
            concept=request.concept,
            source_id=request.source_id,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptQueryResponse(
            query_expression=query_expression,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept query generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept query generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-concept-filter", response_model=GenerateConceptFilterResponse)
async def generate_concept_filter(
    stream_id: int,
    request: GenerateConceptFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate semantic filter criteria for a concept.

    Uses LLM to create filter criteria based on the concept's covered topics,
    entity pattern, and rationale.
    """
    query_service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns Pydantic schema with semantic_space already parsed
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Generate filter using service with concept from request and parsed semantic_space
        criteria, threshold, reasoning = await query_service.generate_filter_for_concept(
            concept=request.concept,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptFilterResponse(
            criteria=criteria,
            threshold=threshold,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic filter generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic filter generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/validate-concepts", response_model=ValidateConceptsResponse)
async def validate_concepts(
    stream_id: int,
    request: ValidateConceptsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate concepts configuration for completeness and readiness.

    Checks coverage, configuration status, and whether the retrieval
    config is ready to activate.
    """
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns Pydantic schema with semantic_space already parsed
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        concepts = request.concepts

        # Check coverage using parsed semantic_space
        from schemas.research_stream import RetrievalConfig
        temp_config = RetrievalConfig(concepts=concepts)
        coverage = temp_config.validate_coverage(stream.semantic_space)

        # Check configuration status
        config_status = {
            "total_concepts": len(concepts),
            "concepts_with_queries": sum(
                1 for c in concepts if c.source_queries and len(c.source_queries) > 0
            ),
            "concepts_with_filters": sum(
                1 for c in concepts if c.semantic_filter.enabled or c.semantic_filter.criteria
            )
        }

        # Generate warnings
        warnings = []
        if not coverage["is_complete"]:
            warnings.append(f"Incomplete coverage: {len(coverage['uncovered_topics'])} topics not covered")

        if config_status["concepts_with_queries"] == 0:
            warnings.append("No concepts have queries configured")

        if config_status["concepts_with_queries"] < len(concepts):
            warnings.append(f"Only {config_status['concepts_with_queries']}/{len(concepts)} concepts have queries")

        # Determine if ready to activate
        ready_to_activate = (
            coverage["is_complete"] and
            config_status["concepts_with_queries"] == len(concepts) and
            len(concepts) > 0
        )

        return ValidateConceptsResponse(
            is_complete=coverage["is_complete"],
            coverage=coverage,
            configuration_status=config_status,
            warnings=warnings,
            ready_to_activate=ready_to_activate
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept validation failed: {str(e)}"
        )


# ============================================================================
# Query Testing (Same Path as Pipeline)
# ============================================================================

class QueryTestRequest(BaseModel):
    """Request to test a query against a source"""
    source_id: str = Field(..., description="Source to test against")
    query_expression: str = Field(..., description="Query expression to test")
    max_results: int = Field(10, ge=1, le=100, description="Maximum sample articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD) - PubMed only")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD) - PubMed only")
    date_type: Optional[str] = Field('publication', description="Date type for filtering (entry, publication, etc.) - PubMed only")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date) - PubMed only")


@router.post("/{stream_id}/test-query", response_model=QueryTestResponse)
async def test_source_query(
    stream_id: int,
    request: QueryTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a query expression against a source.

    Uses the SAME code path as pipeline execution to ensure consistency.
    This allows testing query expressions to see how many articles would be
    returned and preview sample results.
    """
    from services.pubmed_service import PubMedService
    from datetime import datetime, timedelta

    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Validate source
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if request.source_id not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_id. Must be one of: {', '.join(valid_sources)}"
            )

        # Apply default date range if not provided (7 days like pipeline)
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=7)
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

        # Execute query using same service as pipeline
        if request.source_id.lower() == "pubmed":
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

            return QueryTestResponse(
                success=True,
                article_count=metadata.get('total_results', 0),
                sample_articles=articles,
                error_message=None
            )
        else:
            # Other sources not yet implemented
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail=f"Source '{request.source_id}' not yet implemented for query testing"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query test failed: {e}", exc_info=True)
        return QueryTestResponse(
            success=False,
            article_count=0,
            sample_articles=[],
            error_message=str(e)
        )


# ============================================================================
# Layer 4: Pipeline Execution & Testing
# ============================================================================

class ExecutePipelineRequest(BaseModel):
    """Request to execute the full pipeline for a research stream"""
    run_type: Optional[str] = Field("manual", description="Type of run: manual or scheduled")
    start_date: Optional[str] = Field(None, description="Start date for retrieval (YYYY/MM/DD). Defaults to 7 days ago.")
    end_date: Optional[str] = Field(None, description="End date for retrieval (YYYY/MM/DD). Defaults to today.")
    report_name: Optional[str] = Field(None, description="Custom name for the generated report. Defaults to YYYY.MM.DD format.")


@router.post("/{stream_id}/execute-pipeline")
@track_endpoint("execute_pipeline")
async def execute_pipeline(
    stream_id: int,
    request: ExecutePipelineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Execute the full end-to-end pipeline for a research stream.

    This endpoint streams real-time progress updates using Server-Sent Events (SSE).

    Pipeline stages:
    1. Load configuration
    2. Execute retrieval queries
    3. Deduplicate within groups
    4. Apply semantic filters
    5. Deduplicate globally
    6. Categorize articles
    7. Generate report

    The response is a stream of JSON objects, one per line, each representing a status update.
    """
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream exists and user has access
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Check if user can run this stream (based on scope and role)
        _check_can_modify_stream(stream, current_user)

        # Parse run type
        run_type_value = RunType.MANUAL
        if request.run_type:
            try:
                run_type_value = RunType(request.run_type.lower())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid run_type. Must be one of: test, scheduled, manual"
                )

        # Calculate date range (default to last 7 days)
        from datetime import datetime, timedelta

        if request.end_date:
            end_date = request.end_date
        else:
            end_date = datetime.now().strftime("%Y/%m/%d")

        if request.start_date:
            start_date = request.start_date
        else:
            start_date = (datetime.now() - timedelta(days=7)).strftime("%Y/%m/%d")

        # Create pipeline service
        pipeline_service = PipelineService(db)

        # Define SSE generator
        async def event_generator():
            """Generate SSE events from pipeline status updates"""
            try:
                async for status in pipeline_service.run_pipeline(
                    research_stream_id=stream_id,
                    user_id=current_user.user_id,
                    run_type=run_type_value,
                    start_date=start_date,
                    end_date=end_date,
                    report_name=request.report_name
                ):
                    # Format as SSE event
                    status_dict = status.to_dict()
                    event_data = json.dumps(status_dict)
                    yield f"data: {event_data}\n\n"

                # Send final completion event
                yield "data: {\"stage\": \"done\"}\n\n"

            except Exception as e:
                # Send error event
                error_data = json.dumps({
                    "stage": "error",
                    "message": str(e),
                    "error_type": type(e).__name__
                })
                yield f"data: {error_data}\n\n"

        # Return streaming response
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline execution failed: {str(e)}"
        )


# ============================================================================
# Report Comparison Endpoint
# ============================================================================

class CompareReportRequest(BaseModel):
    """Request schema for comparing report to supplied PubMed IDs"""
    report_id: int = Field(..., description="Report ID to compare against")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to compare")


class SuppliedArticleStatus(BaseModel):
    """Status of a supplied PubMed ID in the pipeline"""
    pmid: str
    status: str = Field(..., description="not_found, filtered_out, or included")
    article_title: Optional[str] = None
    retrieval_unit_id: Optional[str] = Field(None, description="Concept ID or broad query ID that retrieved this article")
    filter_rejection_reason: Optional[str] = None


class ReportOnlyArticle(BaseModel):
    """Article that was in the report but not in supplied PMIDs"""
    pmid: str
    title: str
    retrieval_unit_id: str = Field(..., description="Concept ID or broad query ID that retrieved this article")
    url: Optional[str] = None


class CompareReportResponse(BaseModel):
    """Response for report comparison"""
    supplied_articles: List[SuppliedArticleStatus]
    report_only_articles: List[ReportOnlyArticle]
    statistics: Dict[str, int] = Field(
        ...,
        description="Statistics: total_supplied, not_found, filtered_out, included, report_only"
    )


@router.post("/reports/{report_id}/compare", response_model=CompareReportResponse)
async def compare_report_to_pubmed_ids(
    report_id: int,
    request: CompareReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Compare a pipeline report to a supplied set of PubMed IDs.

    For each supplied PMID, determines:
    - Was it retrieved in the search?
    - Did it pass the semantic filter?
    - Was it included in the report?

    Also returns articles in the report that weren't in the supplied list.
    """
    from models import Report, WipArticle, ReportArticleAssociation, Article
    from sqlalchemy import and_

    # Verify report exists and user has access
    report = db.query(Report).filter(
        and_(
            Report.report_id == report_id,
            Report.user_id == current_user.user_id
        )
    ).first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found"
        )

    if not report.pipeline_execution_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report does not have pipeline execution data"
        )

    # Get all wip_articles for this execution
    wip_articles = db.query(WipArticle).filter(
        WipArticle.pipeline_execution_id == report.pipeline_execution_id
    ).all()

    # Create PMID lookup map
    wip_by_pmid = {wip.pmid: wip for wip in wip_articles if wip.pmid}

    # Get all articles in the report
    report_associations = db.query(ReportArticleAssociation).join(Article).filter(
        ReportArticleAssociation.report_id == report_id
    ).all()

    report_pmids = set()
    report_articles_map = {}
    for assoc in report_associations:
        if assoc.article.pmid:
            report_pmids.add(assoc.article.pmid)
            report_articles_map[assoc.article.pmid] = assoc.article

    # Analyze each supplied PMID
    supplied_articles = []
    for pmid in request.pubmed_ids:
        pmid = pmid.strip()
        if not pmid:
            continue

        wip = wip_by_pmid.get(pmid)

        if not wip:
            # Not found in search results
            supplied_articles.append(SuppliedArticleStatus(
                pmid=pmid,
                status="not_found"
            ))
        elif wip.passed_semantic_filter == False:
            # Found but filtered out
            supplied_articles.append(SuppliedArticleStatus(
                pmid=pmid,
                status="filtered_out",
                article_title=wip.title,
                retrieval_unit_id=wip.retrieval_group_id,
                filter_rejection_reason=wip.filter_rejection_reason
            ))
        elif pmid in report_pmids:
            # Found and included in report
            supplied_articles.append(SuppliedArticleStatus(
                pmid=pmid,
                status="included",
                article_title=wip.title,
                retrieval_unit_id=wip.retrieval_group_id
            ))
        else:
            # Found in search but not in report (duplicate or other reason)
            supplied_articles.append(SuppliedArticleStatus(
                pmid=pmid,
                status="not_included",
                article_title=wip.title,
                retrieval_unit_id=wip.retrieval_group_id
            ))

    # Find articles in report but not in supplied list
    supplied_pmids_set = set(pmid.strip() for pmid in request.pubmed_ids if pmid.strip())
    report_only_articles = []

    for pmid in report_pmids:
        if pmid not in supplied_pmids_set:
            article = report_articles_map[pmid]
            wip = wip_by_pmid.get(pmid)
            report_only_articles.append(ReportOnlyArticle(
                pmid=pmid,
                title=article.title,
                retrieval_unit_id=wip.retrieval_group_id if wip else "unknown",
                url=article.url
            ))

    # Calculate statistics
    stats = {
        "total_supplied": len([a for a in supplied_articles if a.pmid]),
        "not_found": len([a for a in supplied_articles if a.status == "not_found"]),
        "filtered_out": len([a for a in supplied_articles if a.status == "filtered_out"]),
        "included": len([a for a in supplied_articles if a.status == "included"]),
        "not_included": len([a for a in supplied_articles if a.status == "not_included"]),
        "report_only": len(report_only_articles)
    }

    return CompareReportResponse(
        supplied_articles=supplied_articles,
        report_only_articles=report_only_articles,
        statistics=stats
    )
