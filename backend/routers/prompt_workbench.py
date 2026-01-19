"""
Prompt Workbench API endpoints

Provides endpoints for:
- Getting default prompts
- Getting/updating stream enrichment config
- Testing prompts against sample data or existing reports
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

from database import get_async_db
from models import User, Report, ReportArticleAssociation
from schemas.research_stream import EnrichmentConfig, PromptTemplate, CategorizationPrompt
from services.research_stream_service import (
    ResearchStreamService,
    get_research_stream_service
)
from services.prompt_workbench_service import PromptWorkbenchService
from services.report_summary_service import DEFAULT_PROMPTS, AVAILABLE_SLUGS
from services.article_categorization_service import ArticleCategorizationService
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompt-workbench", tags=["prompt-workbench"])


# =============================================================================
# Request/Response Models
# =============================================================================

class DefaultPromptsResponse(BaseModel):
    """Response containing default prompts and available slugs"""
    prompts: Dict[str, PromptTemplate]
    available_slugs: Dict[str, List[Dict[str, str]]]


class EnrichmentConfigResponse(BaseModel):
    """Response containing stream's enrichment config or defaults"""
    enrichment_config: Optional[EnrichmentConfig]
    is_using_defaults: bool
    defaults: Dict[str, PromptTemplate]


class UpdateEnrichmentConfigRequest(BaseModel):
    """Request to update enrichment config"""
    enrichment_config: Optional[EnrichmentConfig] = Field(
        None,
        description="Set to null to reset to defaults"
    )


class TestPromptRequest(BaseModel):
    """Request to test a prompt"""
    prompt_type: str = Field(..., description="'executive_summary' or 'category_summary'")
    prompt: PromptTemplate = Field(..., description="The prompt to test")
    sample_data: Optional[Dict[str, Any]] = Field(None, description="Sample data with articles and context")
    report_id: Optional[int] = Field(None, description="Reference to an existing report to use as test data")
    category_id: Optional[str] = Field(None, description="Category ID for category_summary test")


class TestPromptResponse(BaseModel):
    """Response from testing a prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    error: Optional[str] = None


# Categorization prompt models
class CategorizationDefaultsResponse(BaseModel):
    """Response containing default categorization prompt and available slugs"""
    prompt: CategorizationPrompt
    available_slugs: List[Dict[str, str]]


class CategorizationConfigResponse(BaseModel):
    """Response containing stream's categorization prompt or defaults"""
    categorization_prompt: Optional[CategorizationPrompt]
    is_using_defaults: bool
    defaults: CategorizationPrompt


class UpdateCategorizationPromptRequest(BaseModel):
    """Request to update categorization prompt"""
    categorization_prompt: Optional[CategorizationPrompt] = Field(
        None,
        description="Set to null to reset to defaults"
    )


class TestCategorizationPromptRequest(BaseModel):
    """Request to test a categorization prompt"""
    prompt: CategorizationPrompt = Field(..., description="The categorization prompt to test")
    sample_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Sample article data with title, abstract, journal, year, categories_json"
    )
    report_id: Optional[int] = Field(None, description="Reference to an existing report to get an article from")
    article_index: Optional[int] = Field(0, description="Which article to use from the report (default: first)")


class TestCategorizationPromptResponse(BaseModel):
    """Response from testing a categorization prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    parsed_category_id: Optional[str] = None
    error: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/defaults", response_model=DefaultPromptsResponse)
async def get_default_prompts():
    """Get the default prompts and available slugs for each prompt type"""
    # No db needed - just return static defaults
    prompts = {
        key: PromptTemplate(
            system_prompt=value["system_prompt"],
            user_prompt_template=value["user_prompt_template"]
        )
        for key, value in DEFAULT_PROMPTS.items()
    }
    return DefaultPromptsResponse(
        prompts=prompts,
        available_slugs=AVAILABLE_SLUGS
    )


@router.get("/streams/{stream_id}/enrichment", response_model=EnrichmentConfigResponse)
async def get_stream_enrichment_config(
    stream_id: int,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get enrichment config for a stream (or defaults if not set)"""
    # Verify ownership and get stream (raises 404 if not found/not authorized)
    stream = await stream_service.get_research_stream(current_user, stream_id)
    if not stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

    # Build response
    enrichment_config = None
    if stream.enrichment_config:
        enrichment_config = EnrichmentConfig(**stream.enrichment_config)

    defaults = {
        key: PromptTemplate(
            system_prompt=value["system_prompt"],
            user_prompt_template=value["user_prompt_template"]
        )
        for key, value in DEFAULT_PROMPTS.items()
    }

    return EnrichmentConfigResponse(
        enrichment_config=enrichment_config,
        is_using_defaults=enrichment_config is None,
        defaults=defaults
    )


@router.put("/streams/{stream_id}/enrichment")
async def update_stream_enrichment_config(
    stream_id: int,
    request: UpdateEnrichmentConfigRequest,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update enrichment config for a stream (set to null to reset to defaults)"""
    logger.info(f"Updating enrichment config for stream {stream_id}: {request.enrichment_config}")

    # Verify ownership (raises 404 if not found/not authorized)
    stream = await stream_service.get_research_stream(current_user, stream_id)
    if not stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

    # Prepare enrichment config dict
    config_dict = request.enrichment_config.dict() if request.enrichment_config else None

    # Update via async method
    await stream_service.update_research_stream(stream_id, {"enrichment_config": config_dict})

    logger.info(f"Enrichment config saved for stream {stream_id}")
    return {"status": "success", "message": "Enrichment config updated"}


@router.post("/test", response_model=TestPromptResponse)
async def test_prompt(
    request: TestPromptRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Test a prompt by rendering it with sample data and running it through the LLM"""
    if not request.sample_data and not request.report_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sample_data or report_id must be provided"
        )

    service = PromptWorkbenchService(db)

    try:
        result = await service.test_prompt(
            prompt_type=request.prompt_type,
            prompt=request.prompt,
            user_id=current_user.user_id,
            sample_data=request.sample_data,
            report_id=request.report_id,
            category_id=request.category_id
        )
        return TestPromptResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing prompt: {e}", exc_info=True)
        return TestPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )


# =============================================================================
# Categorization Prompt Endpoints
# =============================================================================

@router.get("/categorization/defaults", response_model=CategorizationDefaultsResponse)
async def get_categorization_defaults():
    """Get the default categorization prompt and available slugs"""
    defaults = ArticleCategorizationService.get_default_prompts()
    slugs = ArticleCategorizationService.get_available_slugs()

    return CategorizationDefaultsResponse(
        prompt=CategorizationPrompt(
            system_prompt=defaults["system_prompt"],
            user_prompt_template=defaults["user_prompt_template"]
        ),
        available_slugs=slugs
    )


@router.get("/streams/{stream_id}/categorization", response_model=CategorizationConfigResponse)
async def get_stream_categorization_config(
    stream_id: int,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get categorization prompt for a stream (or defaults if not set)"""
    # Verify ownership and get stream
    stream = await stream_service.get_research_stream(current_user, stream_id)
    if not stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

    # Get categorization prompt from presentation_config
    categorization_prompt = None
    if stream.presentation_config and isinstance(stream.presentation_config, dict):
        cat_prompt_data = stream.presentation_config.get("categorization_prompt")
        if cat_prompt_data:
            categorization_prompt = CategorizationPrompt(**cat_prompt_data)

    # Get defaults
    defaults_data = ArticleCategorizationService.get_default_prompts()
    defaults = CategorizationPrompt(
        system_prompt=defaults_data["system_prompt"],
        user_prompt_template=defaults_data["user_prompt_template"]
    )

    return CategorizationConfigResponse(
        categorization_prompt=categorization_prompt,
        is_using_defaults=categorization_prompt is None,
        defaults=defaults
    )


@router.put("/streams/{stream_id}/categorization")
async def update_stream_categorization_config(
    stream_id: int,
    request: UpdateCategorizationPromptRequest,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update categorization prompt for a stream (set to null to reset to defaults)"""
    logger.info(f"Updating categorization prompt for stream {stream_id}")

    # Verify ownership
    stream = await stream_service.get_research_stream(current_user, stream_id)
    if not stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

    # Get current presentation_config
    current_config = stream.presentation_config or {}
    if isinstance(current_config, dict):
        # Update categorization_prompt within presentation_config
        if request.categorization_prompt:
            current_config["categorization_prompt"] = request.categorization_prompt.dict()
        else:
            current_config.pop("categorization_prompt", None)

    # Update via async method
    await stream_service.update_research_stream(stream_id, {"presentation_config": current_config})

    logger.info(f"Categorization prompt saved for stream {stream_id}")
    return {"status": "success", "message": "Categorization prompt updated"}


@router.post("/categorization/test", response_model=TestCategorizationPromptResponse)
async def test_categorization_prompt(
    request: TestCategorizationPromptRequest,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Test a categorization prompt by rendering it with sample data and optionally running it through the LLM"""
    import json
    from sqlalchemy import select

    if not request.sample_data and not request.report_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sample_data or report_id must be provided"
        )

    try:
        # Prepare sample data
        sample_data: Dict[str, Any] = request.sample_data or {}
        categories_for_context = []

        if request.report_id:
            # Get article from report
            report_result = await db.execute(
                select(Report).where(Report.report_id == request.report_id)
            )
            report = report_result.scalar_one_or_none()
            if not report:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

            # Verify access to stream
            stream = await stream_service.get_research_stream(current_user, report.research_stream_id)
            if not stream:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this report")

            # Get articles from report
            articles_result = await db.execute(
                select(ReportArticleAssociation).where(ReportArticleAssociation.report_id == request.report_id)
            )
            articles = articles_result.scalars().all()

            if not articles:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Report has no articles")

            # Get the requested article (default to first)
            article_index = request.article_index or 0
            if article_index >= len(articles):
                article_index = 0

            article = articles[article_index]

            # Get categories from stream presentation_config
            if stream.presentation_config and isinstance(stream.presentation_config, dict):
                categories = stream.presentation_config.get("categories", [])
                categories_for_context = ArticleCategorizationService.prepare_category_definitions(
                    [type('Category', (), cat) for cat in categories]
                ) if categories else []

            # Build sample data from article
            sample_data = {
                "title": article.title or "",
                "abstract": article.abstract or "",
                "journal": article.journal or "",
                "year": str(article.publication_year) if article.publication_year else "",
                "categories_json": json.dumps(categories_for_context, indent=2)
            }

        # Render prompts
        rendered_system = request.prompt.system_prompt
        rendered_user = request.prompt.user_prompt_template

        for key, value in sample_data.items():
            rendered_user = rendered_user.replace(f"{{{key}}}", str(value))

        # Call LLM for actual categorization
        service = ArticleCategorizationService()
        result = await service.categorize(
            items=sample_data,
            custom_prompt=request.prompt
        )

        # Extract response
        llm_response = None
        parsed_category_id = None
        error = None

        if result.error:
            error = result.error
        elif result.data:
            parsed_category_id = result.data.get("category_id")
            llm_response = json.dumps(result.data, indent=2)

        return TestCategorizationPromptResponse(
            rendered_system_prompt=rendered_system,
            rendered_user_prompt=rendered_user,
            llm_response=llm_response,
            parsed_category_id=parsed_category_id,
            error=error
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing categorization prompt: {e}", exc_info=True)
        return TestCategorizationPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )
