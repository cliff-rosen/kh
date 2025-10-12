"""
Research Streams API endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from database import get_db
from models import User

from schemas.research_stream import (
    ResearchStream,
    Channel,
    StreamType,
    ReportFrequency,
    ScoringConfig
)
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle
from schemas.smart_search import FilteredArticle, SearchPaginationInfo
from services.research_stream_service import ResearchStreamService
from services.implementation_config_service import ImplementationConfigService
from routers.auth import get_current_user

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])

# Request/Response types (API layer only)
class ResearchStreamCreateRequest(BaseModel):
    """Request schema for creating a research stream - channel-based"""
    stream_name: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=1, description="Why this stream exists")
    channels: List[Channel] = Field(..., min_items=1, description="Monitoring channels")
    report_frequency: ReportFrequency
    scoring_config: Optional[ScoringConfig] = None


class ResearchStreamUpdateRequest(BaseModel):
    """Request schema for updating a research stream"""
    stream_name: Optional[str] = Field(None, min_length=1, max_length=255)
    purpose: Optional[str] = None
    channels: Optional[List[Channel]] = None
    report_frequency: Optional[ReportFrequency] = None
    is_active: Optional[bool] = None
    scoring_config: Optional[ScoringConfig] = None
    workflow_config: Optional[Dict[str, Any]] = None

class ResearchStreamResponse(BaseModel):
    data: ResearchStream
    message: str = None

class ResearchStreamsListResponse(BaseModel):
    data: List[ResearchStream]
    message: str = None
    total: int

class ToggleStatusRequest(BaseModel):
    is_active: bool


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


@router.get("/metadata/sources", response_model=List[InformationSource])
async def get_information_sources():
    """Get the authoritative list of information sources"""
    return INFORMATION_SOURCES

 
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
    """Create a new research stream with channel-based structure"""
    import uuid
    service = ResearchStreamService(db)

    # Convert Pydantic models to dicts and add channel_id if missing
    channels_dict = []
    for ch in request.channels:
        ch_dict = ch.dict() if hasattr(ch, 'dict') else ch
        # Add channel_id if it doesn't exist
        if 'channel_id' not in ch_dict or not ch_dict['channel_id']:
            ch_dict['channel_id'] = str(uuid.uuid4())
        channels_dict.append(ch_dict)

    scoring_dict = request.scoring_config.dict() if request.scoring_config else None

    return service.create_research_stream(
        user_id=current_user.user_id,
        stream_name=request.stream_name,
        purpose=request.purpose,
        channels=channels_dict,
        report_frequency=request.report_frequency,
        scoring_config=scoring_dict
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

@router.post("/{stream_id}/channels/{channel_name}/generate-query", response_model=QueryGenerationResponse)
async def generate_channel_query(
    stream_id: int,
    channel_name: str,
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
            stream_id, current_user.user_id, channel_name
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


@router.post("/{stream_id}/channels/{channel_name}/test-query", response_model=QueryTestResponse)
async def test_channel_query(
    stream_id: int,
    channel_name: str,
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
        service.verify_stream_and_channel(stream_id, current_user.user_id, channel_name)

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


@router.post("/{stream_id}/channels/{channel_name}/generate-filter", response_model=SemanticFilterGenerationResponse)
async def generate_channel_filter(
    stream_id: int,
    channel_name: str,
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
            stream_id, current_user.user_id, channel_name
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


@router.post("/{stream_id}/channels/{channel_name}/test-filter", response_model=SemanticFilterTestResponse)
async def test_channel_filter(
    stream_id: int,
    channel_name: str,
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
        service.verify_stream_and_channel(stream_id, current_user.user_id, channel_name)

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


@router.post("/{stream_id}/generate-executive-summary")
async def generate_executive_summary(
    stream_id: int,
    request: GenerateExecutiveSummaryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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
            user_id=str(current_user.id),
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