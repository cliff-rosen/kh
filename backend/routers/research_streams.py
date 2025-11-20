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
from models import User, RunType

from schemas.research_stream import (
    ResearchStream,
    Category,
    StreamType,
    ReportFrequency,
    RetrievalConfig,
    PresentationConfig
)
from schemas.semantic_space import SemanticSpace
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle


from services.research_stream_service import ResearchStreamService
from services.retrieval_query_service import RetrievalQueryService
from services.retrieval_group_service import RetrievalGroupService
from services.pipeline_service import PipelineService

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
    # Service raises 404 if not found or not authorized
    return service.get_research_stream(stream_id, current_user.user_id)


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
# Shared Retrieval Response Models
# ============================================================================


class ProposeGroupsResponse(BaseModel):
    """Response from retrieval group proposal"""
    proposed_groups: List[Dict[str, Any]] = Field(..., description="Proposed retrieval groups")
    coverage_analysis: Dict[str, Any] = Field(..., description="Analysis of topic coverage")
    overall_reasoning: str = Field(..., description="Explanation of grouping strategy")
    error: Optional[str] = Field(None, description="Error message if proposal used fallback")


class ValidateGroupsResponse(BaseModel):
    """Response from retrieval group validation"""
    is_complete: bool = Field(..., description="Whether all topics are covered")
    coverage: Dict[str, Any] = Field(..., description="Topic coverage details")
    configuration_status: Dict[str, Any] = Field(..., description="Configuration completeness status")
    warnings: List[str] = Field(..., description="Validation warnings")
    ready_to_activate: bool = Field(..., description="Whether config is ready for production")


class QueryGenerationResponse(BaseModel):
    """Response from query generation"""
    query_expression: str = Field(..., description="Generated query expression")
    reasoning: str = Field(..., description="Explanation of why this expression was generated")


class SemanticFilterResponse(BaseModel):
    """Response from semantic filter generation"""
    criteria: str = Field(..., description="Filter criteria description")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Relevance threshold (0-1)")
    reasoning: str = Field(..., description="Explanation of filter design")


class QueryTestResponse(BaseModel):
    """Response from query testing"""
    success: bool = Field(..., description="Whether query executed successfully")
    article_count: int = Field(..., description="Total number of articles found")
    sample_articles: List[CanonicalResearchArticle] = Field(..., description="Sample articles")
    error_message: Optional[str] = Field(None, description="Error message if query failed")


class TopicSummary(BaseModel):
    """Summary of a topic for filter generation"""
    topic_id: str = Field(..., description="Unique topic identifier")
    name: str = Field(..., description="Topic name")
    description: str = Field(..., description="Topic description")


# ============================================================================
# Retrieval Group Workflow (New Group-Based Architecture)
# ============================================================================

@router.post("/{stream_id}/retrieval/propose-groups", response_model=ProposeGroupsResponse)
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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Propose groups
        result = await service.propose_groups(semantic_space)

        # Check if there was an error in the result
        if 'error' in result:
            logger.warning(f"Group proposal returned with fallback: {result.get('error')}")

        return ProposeGroupsResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Group proposal failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Group proposal failed: {str(e)}"
        )


class ValidateGroupsRequest(BaseModel):
    """Request to validate retrieval groups"""
    groups: List[Dict[str, Any]]


@router.post("/{stream_id}/retrieval/validate", response_model=ValidateGroupsResponse)
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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Parse groups from request
        from schemas.research_stream import RetrievalGroup
        groups = [RetrievalGroup(**g) for g in request.groups]

        # Validate
        result = service.validate_groups(semantic_space, groups)

        return ValidateGroupsResponse(**result)

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


@router.post("/{stream_id}/retrieval/generate-group-queries", response_model=QueryGenerationResponse)
async def generate_group_queries(
    stream_id: int,
    request: GenerateGroupQueriesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 2: Generate queries for a retrieval group.

    Uses ALL topics in the group to generate optimized source-specific queries
    that capture content relevant to any of the topics.
    """
    query_service = RetrievalQueryService(db)
    stream_service = ResearchStreamService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Parse semantic space
        semantic_space_dict = stream.semantic_space
        semantic_space = SemanticSpace(**semantic_space_dict)

        # Get ALL topics for this group
        group_topics = [
            t for t in semantic_space.topics
            if t.topic_id in request.covered_topics
        ]

        if not group_topics:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group has no valid topics"
            )

        # Generate query using ALL topics in the group
        query_expression, reasoning = await query_service.generate_query_for_retrieval_group(
            topics=group_topics,  # ✅ ALL topics, not just first one
            source_id=request.source_id,
            semantic_space=semantic_space,
            group_rationale=None  # Could pass request.group_rationale if available
        )

        return QueryGenerationResponse(
            query_expression=query_expression,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query generation failed: {str(e)}"
        )


class GenerateSemanticFilterRequest(BaseModel):
    """Request to generate semantic filter for a retrieval group"""
    group_id: str = Field(..., description="Retrieval group ID")
    topics: List[TopicSummary] = Field(..., description="Topics in the group")
    rationale: str = Field(..., description="Why these topics are grouped together")


@router.post("/{stream_id}/retrieval/generate-semantic-filter", response_model=SemanticFilterResponse)
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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

        # Build prompt for LLM
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        topics_summary = "\n".join([
            f"- {t.name}: {t.description}"
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
        {{
        "criteria": "Clear description of what makes an article relevant...",
        "threshold": 0.7,
        "reasoning": "Why this filter will work well..."
        }}

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

        return SemanticFilterResponse(
            criteria=response_data.get('criteria', ''),
            threshold=response_data.get('threshold', 0.7),
            reasoning=response_data.get('reasoning', '')
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic filter generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic filter generation failed: {str(e)}"
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
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.) - PubMed only")
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
    run_type: Optional[str] = Field("test", description="Type of run: test, scheduled, or manual")
    start_date: Optional[str] = Field(None, description="Start date for retrieval (YYYY/MM/DD). Defaults to 7 days ago.")
    end_date: Optional[str] = Field(None, description="End date for retrieval (YYYY/MM/DD). Defaults to today.")


@router.post("/{stream_id}/execute-pipeline")
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

        # Parse run type
        run_type_value = RunType.TEST
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
                    end_date=end_date
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
