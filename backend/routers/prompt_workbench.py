"""
Prompt Workbench API endpoints

Provides endpoints for:
- Getting default prompts
- Getting/updating stream enrichment config
- Testing prompts against sample data or existing reports
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

from database import get_db
from models import User
from schemas.research_stream import EnrichmentConfig, PromptTemplate
from services.research_stream_service import ResearchStreamService
from services.prompt_workbench_service import PromptWorkbenchService
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
async def get_default_prompts(db: Session = Depends(get_db)):
    """Get the default prompts and available slugs for each prompt type"""
    service = PromptWorkbenchService(db)
    return service.get_defaults()


@router.get("/streams/{stream_id}/enrichment", response_model=EnrichmentConfigResponse)
async def get_stream_enrichment_config(
    stream_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get enrichment config for a stream (or defaults if not set)"""
    # Verify ownership (raises 404 if not found/not authorized)
    stream_service = ResearchStreamService(db)
    stream_service.get_research_stream(stream_id, current_user.user_id)

    service = PromptWorkbenchService(db)
    return service.get_enrichment_config(stream_id)


@router.put("/streams/{stream_id}/enrichment")
async def update_stream_enrichment_config(
    stream_id: int,
    request: UpdateEnrichmentConfigRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update enrichment config for a stream (set to null to reset to defaults)"""
    logger.info(f"Updating enrichment config for stream {stream_id}: {request.enrichment_config}")

    # Verify ownership (raises 404 if not found/not authorized)
    stream_service = ResearchStreamService(db)
    stream_service.get_research_stream(stream_id, current_user.user_id)

    service = PromptWorkbenchService(db)
    service.update_enrichment_config(stream_id, request.enrichment_config)

    logger.info(f"Enrichment config saved for stream {stream_id}")
    return {"status": "success", "message": "Enrichment config updated"}


@router.post("/test", response_model=TestPromptResponse)
async def test_prompt(
    request: TestPromptRequest,
    db: Session = Depends(get_db),
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
