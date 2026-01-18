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
from models import User
from schemas.research_stream import EnrichmentConfig, PromptTemplate
from services.research_stream_service import (
    ResearchStreamService,
    get_async_research_stream_service
)
from services.prompt_workbench_service import PromptWorkbenchService
from services.report_summary_service import DEFAULT_PROMPTS, AVAILABLE_SLUGS
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
    stream_service: ResearchStreamService = Depends(get_async_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get enrichment config for a stream (or defaults if not set)"""
    # Verify ownership and get stream (raises 404 if not found/not authorized)
    stream = await stream_service.async_get_research_stream(current_user, stream_id)
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
    stream_service: ResearchStreamService = Depends(get_async_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update enrichment config for a stream (set to null to reset to defaults)"""
    logger.info(f"Updating enrichment config for stream {stream_id}: {request.enrichment_config}")

    # Verify ownership (raises 404 if not found/not authorized)
    stream = await stream_service.async_get_research_stream(current_user, stream_id)
    if not stream:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

    # Prepare enrichment config dict
    config_dict = request.enrichment_config.dict() if request.enrichment_config else None

    # Update via async method
    await stream_service.async_update_research_stream(stream_id, {"enrichment_config": config_dict})

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
