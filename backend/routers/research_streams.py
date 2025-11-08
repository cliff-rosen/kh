"""
Research Streams API endpoints
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from database import get_db
from models import User

from schemas.research_stream import (
    ResearchStream,
    Category,
    StreamType,
    ReportFrequency,
    ExecutiveSummary,
    RetrievalConfig,
    PresentationConfig
)
from schemas.semantic_space import SemanticSpace
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle
from schemas.smart_search import FilteredArticle, SearchPaginationInfo

from services.research_stream_service import ResearchStreamService
from services.implementation_config_service import ImplementationConfigService
from services.retrieval_query_service import RetrievalQueryService
from services.retrieval_group_service import RetrievalGroupService

from routers.auth import get_current_user

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


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
async def get_research_stream(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific research stream by ID"""
    service = ResearchStreamService(db)
    stream = service.get_research_stream(stream_id, current_user.user_id)
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )
    return stream


@router.post("", response_model=ResearchStream, status_code=status.HTTP_201_CREATED)
async def create_research_stream(
    request: ResearchStreamCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new research stream with three-layer architecture"""
    service = ResearchStreamService(db)

    # Convert Pydantic models to dicts
    semantic_space_dict = request.semantic_space.dict() if hasattr(request.semantic_space, 'dict') else request.semantic_space
    retrieval_config_dict = request.retrieval_config.dict() if hasattr(request.retrieval_config, 'dict') else request.retrieval_config
    presentation_config_dict = request.presentation_config.dict() if hasattr(request.presentation_config, 'dict') else request.presentation_config

    return service.create_research_stream(
        user_id=current_user.user_id,
        stream_name=request.stream_name,
        purpose=request.purpose,
        report_frequency=request.report_frequency,
        semantic_space=semantic_space_dict,
        retrieval_config=retrieval_config_dict,
        presentation_config=presentation_config_dict
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

    return service.update_research_stream(stream_id, {"is_active": request.is_active})


# ============================================================================
# Implementation Configuration Endpoints (Workflow 2)
# ============================================================================

# Implementation Configuration Request/Response types
class QueryGenerationRequest(BaseModel):
    """Request to generate a query expression for a channel and source"""
    source_id: str = Field(..., description="Source to generate query for (e.g., 'pubmed', 'google_scholar')")

class QueryGenerationResponse(BaseModel):
    """Response from query generation"""
    query_expression: str = Field(..., description="Generated query expression")
    reasoning: str = Field(..., description="Explanation of why this expression was generated")

class QueryTestRequest(BaseModel):
    """Request to test a query expression against a source"""
    source_id: str = Field(..., description="Source to test against (e.g., 'pubmed', 'google_scholar')")
    query_expression: str = Field(..., description="Query expression to test")
    max_results: int = Field(10, ge=1, le=50, description="Maximum sample articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY-MM-DD) - PubMed only")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY-MM-DD) - PubMed only")
    date_type: Optional[str] = Field('entrez', description="Date type for filtering - PubMed only")

class QueryTestResponse(BaseModel):
    """Response from query testing"""
    success: bool = Field(..., description="Whether query executed successfully")
    article_count: int = Field(..., description="Total number of articles found")
    sample_articles: List[CanonicalResearchArticle] = Field(..., description="Sample articles")
    error_message: Optional[str] = Field(None, description="Error message if query failed")

class SemanticFilterGenerationResponse(BaseModel):
    """Response from semantic filter generation"""
    filter_criteria: str = Field(..., description="Generated semantic filter criteria")
    reasoning: str = Field(..., description="Explanation of why this criteria was generated")

class SemanticFilterTestRequest(BaseModel):
    """Request to test semantic filter on articles"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to filter")
    filter_criteria: str = Field(..., description="Semantic filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Confidence threshold for filtering")

class SemanticFilterTestResponse(BaseModel):
    """Response from semantic filter testing"""
    filtered_articles: List[FilteredArticle] = Field(..., description="Articles with filter results")
    pass_count: int = Field(..., description="Number of articles passing filter")
    fail_count: int = Field(..., description="Number of articles failing filter")
    average_confidence: float = Field(..., description="Average confidence of passing articles")

class ImplementationConfigProgressUpdate(BaseModel):
    """Update implementation configuration progress"""
    channel_name: str = Field(..., description="Channel being configured")
    completed_steps: List[str] = Field(..., description="List of completed step IDs")
    configuration_data: Dict[str, Any] = Field(..., description="Configuration data for this channel")

class UpdateSourceQueryRequest(BaseModel):
    """Request to update a source query for a channel"""
    query_expression: str = Field(..., description="Query expression for the source")
    enabled: bool = Field(default=True, description="Whether this source is enabled")

class UpdateSemanticFilterRequest(BaseModel):
    """Request to update semantic filter for a channel"""
    enabled: bool = Field(..., description="Whether semantic filtering is enabled")
    criteria: str = Field(..., description="Filter criteria text")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Confidence threshold")


@router.post("/{stream_id}/channels/{channel_id}/generate-query", response_model=QueryGenerationResponse)
async def generate_channel_query(
    stream_id: int,
    channel_id: str,
    request: QueryGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a query expression for a channel based on its keywords, focus, and stream purpose.

    Uses LLM to create source-specific query expressions optimized for the target source
    (PubMed boolean syntax vs Google Scholar natural language).
    """
    service = ImplementationConfigService(db)

    try:
        # Verify stream and channel
        stream, channel = service.verify_stream_and_channel(
            stream_id, current_user.user_id, channel_id
        )

        # Validate source
        service.validate_source_id(request.source_id)

        # Generate query expression
        query_expression, reasoning = await service.generate_query_expression(
            stream, channel, request.source_id
        )

        return QueryGenerationResponse(
            query_expression=query_expression,
            reasoning=reasoning
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query generation failed: {str(e)}"
        )


@router.post("/{stream_id}/channels/{channel_id}/test-query", response_model=QueryTestResponse)
async def test_channel_query(
    stream_id: int,
    channel_id: str,
    request: QueryTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a query expression for a specific channel against a data source.

    This endpoint allows testing query expressions during implementation configuration
    to see how many articles would be returned and preview sample results.
    """
    service = ImplementationConfigService(db)

    try:
        # Verify stream and channel
        service.verify_stream_and_channel(stream_id, current_user.user_id, channel_id)

        # Validate source
        service.validate_source_id(request.source_id)

        # Test query expression
        result = await service.test_query_expression(
            request.source_id,
            request.query_expression,
            request.max_results,
            request.start_date,
            request.end_date,
            request.date_type
        )

        return QueryTestResponse(**result)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/{stream_id}/channels/{channel_id}/generate-filter", response_model=SemanticFilterGenerationResponse)
async def generate_channel_filter(
    stream_id: int,
    channel_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate semantic filter criteria for a channel.

    This endpoint generates a prompt/criteria that can be used to evaluate
    whether articles are relevant to this channel's purpose.
    """
    service = ImplementationConfigService(db)

    try:
        # Verify stream and channel
        stream, channel = service.verify_stream_and_channel(
            stream_id, current_user.user_id, channel_id
        )

        # Generate semantic filter
        filter_criteria, reasoning = await service.generate_semantic_filter(
            stream, channel
        )

        return SemanticFilterGenerationResponse(
            filter_criteria=filter_criteria,
            reasoning=reasoning
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Filter generation failed: {str(e)}"
        )


@router.post("/{stream_id}/channels/{channel_id}/test-filter", response_model=SemanticFilterTestResponse)
async def test_channel_filter(
    stream_id: int,
    channel_id: str,
    request: SemanticFilterTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a semantic filter for a specific channel on a set of articles.

    This endpoint applies the semantic filter to test articles and returns
    which articles pass/fail along with confidence scores.
    """
    service = ImplementationConfigService(db)

    try:
        # Verify stream and channel
        service.verify_stream_and_channel(stream_id, current_user.user_id, channel_id)

        # Test semantic filter
        result = await service.test_semantic_filter(
            request.articles,
            request.filter_criteria,
            request.threshold
        )

        return SemanticFilterTestResponse(**result)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic filter testing failed: {str(e)}"
        )


@router.put("/{stream_id}/channels/{channel_id}/sources/{source_id}/query", response_model=ResearchStream)
async def update_channel_source_query(
    stream_id: int,
    channel_id: str,
    source_id: str,
    request: UpdateSourceQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update a source query for a channel.

    This saves the query directly to workflow_config.channel_configs.
    Uses channel_id (UUID) instead of channel_name for stable references.
    """
    service = ImplementationConfigService(db)

    try:
        updated_stream = service.update_channel_source_query(
            stream_id=stream_id,
            user_id=current_user.user_id,
            channel_id=channel_id,
            source_id=source_id,
            query_expression=request.query_expression,
            enabled=request.enabled
        )
        return updated_stream
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update source query: {str(e)}"
        )


@router.put("/{stream_id}/channels/{channel_id}/semantic-filter", response_model=ResearchStream)
async def update_channel_semantic_filter(
    stream_id: int,
    channel_id: str,
    request: UpdateSemanticFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update semantic filter for a channel.

    This saves the filter directly to workflow_config.channel_configs.
    Uses channel_id (UUID) instead of channel_name for stable references.
    """
    service = ImplementationConfigService(db)

    try:
        updated_stream = service.update_channel_semantic_filter(
            stream_id=stream_id,
            user_id=current_user.user_id,
            channel_id=channel_id,
            enabled=request.enabled,
            criteria=request.criteria,
            threshold=request.threshold
        )
        return updated_stream
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if "not found" in str(e).lower() else status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update semantic filter: {str(e)}"
        )


@router.patch("/{stream_id}/implementation-config", response_model=ResearchStream)
async def update_implementation_config(
    stream_id: int,
    request: ImplementationConfigProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    DEPRECATED: Update implementation configuration progress for a specific channel.

    Use the new channel-centric endpoints instead:
    - PUT /{stream_id}/channels/{channel_name}/sources/{source_id}/query
    - PUT /{stream_id}/channels/{channel_name}/semantic-filter
    """
    # Verify stream ownership
    stream_service = ResearchStreamService(db)
    stream = stream_service.get_research_stream(stream_id, current_user.user_id)
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Verify channel exists
    channel_exists = any(ch.get('name') == request.channel_name for ch in stream.channels)
    if not channel_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Channel '{request.channel_name}' not found in stream"
        )

    # Get current workflow_config or create empty one
    workflow_config = stream.workflow_config or {}

    # Initialize or update configuration_history
    config_history = workflow_config.get('configuration_history', [])

    # Find existing entry for this channel or create new one
    channel_config = next(
        (entry for entry in config_history if entry.get('channel_name') == request.channel_name),
        None
    )

    from datetime import datetime
    if channel_config:
        # Update existing entry
        channel_config['completed_steps'] = request.completed_steps
        channel_config['configuration_data'] = request.configuration_data
        channel_config['last_updated'] = datetime.utcnow().isoformat()
    else:
        # Create new entry
        config_history.append({
            'channel_name': request.channel_name,
            'completed_steps': request.completed_steps,
            'configuration_data': request.configuration_data,
            'last_updated': datetime.utcnow().isoformat()
        })

    # Update workflow_config
    workflow_config['configuration_history'] = config_history
    workflow_config['implementation_config_status'] = 'draft'

    # Save to database
    updated_stream = stream_service.update_research_stream(
        stream_id,
        {'workflow_config': workflow_config}
    )

    return updated_stream


@router.post("/{stream_id}/implementation-config/complete", response_model=ResearchStream)
async def complete_implementation_config(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mark implementation configuration as complete.

    This endpoint validates that all channels have been configured and
    marks the implementation config as complete.
    """
    # Verify stream ownership
    stream_service = ResearchStreamService(db)
    stream = stream_service.get_research_stream(stream_id, current_user.user_id)
    if not stream:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Research stream not found"
        )

    # Verify all channels have configuration
    workflow_config = stream.workflow_config or {}
    config_history = workflow_config.get('configuration_history', [])

    configured_channels = {entry['channel_name'] for entry in config_history}
    all_channels = {ch.get('name') for ch in stream.channels}

    missing_channels = all_channels - configured_channels
    if missing_channels:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Configuration incomplete. Missing channels: {', '.join(missing_channels)}"
        )

    # Mark as complete
    workflow_config['implementation_config_status'] = 'complete'

    updated_stream = stream_service.update_research_stream(
        stream_id,
        {'workflow_config': workflow_config}
    )

    return updated_stream


# ============================================================================
# Executive Summary Generation
# ============================================================================

class ChannelTestData(BaseModel):
    """Test data for a single channel"""
    channel_id: str
    channel_name: str
    accepted_articles: List[Dict[str, Any]]


class GenerateExecutiveSummaryRequest(BaseModel):
    """Request to generate an executive summary"""
    channel_test_data: List[ChannelTestData]


@router.post("/{stream_id}/generate-executive-summary", response_model=ExecutiveSummary)
async def generate_executive_summary(
    stream_id: int,
    request: GenerateExecutiveSummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ExecutiveSummary:
    """
    Generate an AI-powered executive summary analyzing test results across all channels.

    Args:
        stream_id: Research stream ID
        request: Channel test data for all channels
        current_user: Authenticated user
        db: Database session

    Returns:
        ExecutiveSummary with overview, key_themes, channel_highlights, recommendations, generated_at
    """
    try:
        config_service = ImplementationConfigService(db)

        # Convert Pydantic models to dicts
        channel_test_data = [
            {
                'channel_id': channel.channel_id,
                'channel_name': channel.channel_name,
                'accepted_articles': channel.accepted_articles
            }
            for channel in request.channel_test_data
        ]

        summary = await config_service.generate_executive_summary(
            stream_id=stream_id,
            user_id=current_user.user_id,
            channel_test_data=channel_test_data
        )

        return summary
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate executive summary: {str(e)}"
        )


# ============================================================================
# Topic-Based Query Generation (Layer 2: Retrieval Config)
# ============================================================================

class TopicQueryGenerationRequest(BaseModel):
    """Request to generate a query for a topic"""
    topic_id: str = Field(..., description="ID of the topic to generate query for")
    source_id: str = Field(..., description="Source to generate query for (e.g., 'pubmed', 'google_scholar')")


class TopicQueryTestRequest(BaseModel):
    """Request to test a query for a topic"""
    source_id: str = Field(..., description="Source to test against")
    query_expression: str = Field(..., description="Query expression to test")
    max_results: int = Field(10, ge=1, le=50, description="Maximum sample articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY-MM-DD) - PubMed only")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY-MM-DD) - PubMed only")
    date_type: Optional[str] = Field('entrez', description="Date type for filtering - PubMed only")


@router.post("/{stream_id}/topics/generate-query", response_model=QueryGenerationResponse)
async def generate_query_for_topic(
    stream_id: int,
    request: TopicQueryGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a source-specific query for a topic in the semantic space.

    This uses the topic name, description, related entities, and broader semantic
    context to create an optimized query for the target source.
    """
    service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Find the topic
        topic = next(
            (t for t in semantic_space.topics if t.topic_id == request.topic_id),
            None
        )
        if not topic:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Topic '{request.topic_id}' not found in semantic space"
            )

        # Validate source
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if request.source_id not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_id. Must be one of: {', '.join(valid_sources)}"
            )

        # Generate query
        query_expression, reasoning = await service.generate_query_for_topic(
            topic=topic,
            source_id=request.source_id,
            semantic_space=semantic_space
        )

        return QueryGenerationResponse(
            query_expression=query_expression,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query generation failed: {str(e)}"
        )


@router.post("/{stream_id}/topics/test-query", response_model=QueryTestResponse)
async def test_query_for_topic(
    stream_id: int,
    request: TopicQueryTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test a query expression against a source for a topic.

    This allows testing query expressions to see how many articles would be
    returned and preview sample results.
    """
    service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Validate source
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if request.source_id not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_id. Must be one of: {', '.join(valid_sources)}"
            )

        # Test query
        result = await service.test_query_for_topic(
            query_expression=request.query_expression,
            source_id=request.source_id,
            max_results=request.max_results,
            start_date=request.start_date,
            end_date=request.end_date,
            date_type=request.date_type
        )

        return QueryTestResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query test failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query test failed: {str(e)}"
        )


# ============================================================================
# Retrieval Group Workflow (New Group-Based Architecture)
# ============================================================================

@router.post("/{stream_id}/retrieval/propose-groups")
async def propose_retrieval_groups(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 1: Propose retrieval groups based on semantic space analysis.

    Uses LLM to analyze the semantic space and suggest optimal groupings
    for retrieval configuration.
    """
    service = RetrievalGroupService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Propose groups
        result = await service.propose_groups(semantic_space)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Group proposal failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Group proposal failed: {str(e)}"
        )


class ValidateGroupsRequest(BaseModel):
    """Request to validate retrieval groups"""
    groups: List[Dict[str, Any]]


@router.post("/{stream_id}/retrieval/validate")
async def validate_retrieval_groups(
    stream_id: int,
    request: ValidateGroupsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 4: Validate retrieval groups for completeness and readiness.

    Checks coverage, configuration status, and whether the retrieval
    config is ready to activate.
    """
    service = RetrievalGroupService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Parse groups from request
        from schemas.research_stream import RetrievalGroup
        groups = [RetrievalGroup(**g) for g in request.groups]

        # Validate
        result = service.validate_groups(semantic_space, groups)

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Group validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Group validation failed: {str(e)}"
        )


class GenerateGroupQueriesRequest(BaseModel):
    """Request to generate queries for a retrieval group"""
    group_id: str
    source_id: str
    covered_topics: List[str]


@router.post("/{stream_id}/retrieval/generate-group-queries")
async def generate_group_queries(
    stream_id: int,
    request: GenerateGroupQueriesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 2: Generate queries for a retrieval group.

    Uses topics in the group to generate optimized source-specific queries.
    """
    query_service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Get topics for this group
        group_topics = [
            t for t in semantic_space.topics
            if t.topic_id in request.covered_topics
        ]

        if not group_topics:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group has no valid topics"
            )

        # Use first topic as representative (could be enhanced to use all)
        representative_topic = group_topics[0]

        query_expression, reasoning = await query_service.generate_query_for_topic(
            topic=representative_topic,
            source_id=request.source_id,
            semantic_space=semantic_space,
            related_entities=None  # Will find automatically
        )

        return {
            'query_expression': query_expression,
            'reasoning': reasoning
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query generation failed: {str(e)}"
        )


class GenerateSemanticFilterRequest(BaseModel):
    """Request to generate semantic filter for a retrieval group"""
    group_id: str
    topics: List[Dict[str, str]]
    rationale: str


@router.post("/{stream_id}/retrieval/generate-semantic-filter")
async def generate_semantic_filter(
    stream_id: int,
    request: GenerateSemanticFilterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 3: Generate semantic filter criteria for a retrieval group.

    Uses LLM to create filter criteria based on group topics and rationale.
    """
    stream_service = ResearchStreamService(db)

    try:
        # Verify stream ownership
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Build prompt for LLM
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        topics_summary = "\n".join([
            f"- {t['name']}: {t['description']}"
            for t in request.topics
        ])

        system_prompt = """You are an expert at creating semantic filter criteria for research article screening.

        Your task is to define clear, specific criteria that distinguish relevant articles from irrelevant ones for a given topic group.

        Good filter criteria:
        - Are specific and actionable
        - Focus on key concepts and relationships
        - Consider what makes an article truly relevant vs tangentially related
        - Are written in clear, natural language

        OUTPUT FORMAT:
        Return JSON with:
        {
        "criteria": "Clear description of what makes an article relevant...",
        "threshold": 0.7,
        "reasoning": "Why this filter will work well..."
        }

        Threshold should be between 0.5 (permissive) and 0.9 (strict). Default to 0.7."""

        user_prompt = f"""Create semantic filter criteria for this retrieval group:

        GROUP RATIONALE:
        {request.rationale}

        TOPICS COVERED:
        {topics_summary}

        Define filter criteria that will help identify articles truly relevant to these topics."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "criteria": {"type": "string"},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"}
            },
            "required": ["criteria", "threshold", "reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.3),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        # Get LLM response
        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=user_prompt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        result = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=True
        )

        # Extract result
        llm_response = result.result
        if hasattr(llm_response, 'model_dump'):
            response_data = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_data = llm_response.dict()
        else:
            response_data = llm_response

        return {
            'criteria': response_data.get('criteria', ''),
            'threshold': response_data.get('threshold', 0.7),
            'reasoning': response_data.get('reasoning', '')
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic filter generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic filter generation failed: {str(e)}"
        )