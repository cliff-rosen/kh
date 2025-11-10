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
    RetrievalConfig,
    PresentationConfig
)
from schemas.semantic_space import SemanticSpace
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle


from services.research_stream_service import ResearchStreamService
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


class QueryGenerationResponse(BaseModel):
    """Response from query generation"""
    query_expression: str = Field(..., description="Generated query expression")
    reasoning: str = Field(..., description="Explanation of why this expression was generated")


class QueryTestResponse(BaseModel):
    """Response from query testing"""
    success: bool = Field(..., description="Whether query executed successfully")
    article_count: int = Field(..., description="Total number of articles found")
    sample_articles: List[CanonicalResearchArticle] = Field(..., description="Sample articles")
    error_message: Optional[str] = Field(None, description="Error message if query failed")


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

        return result

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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

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

# ============================================================================
# Topic-Based Query Testing (Layer 2: Retrieval Config)
# ============================================================================

class TopicQueryTestRequest(BaseModel):
    """Request to test a query for a topic"""
    source_id: str = Field(..., description="Source to test against")
    query_expression: str = Field(..., description="Query expression to test")
    max_results: int = Field(10, ge=1, le=50, description="Maximum sample articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY-MM-DD) - PubMed only")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY-MM-DD) - PubMed only")
    date_type: Optional[str] = Field('entrez', description="Date type for filtering - PubMed only")


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
        # Get stream (raises 404 if not found or not authorized)
        stream = stream_service.get_research_stream(stream_id, current_user.user_id)

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
