"""
Extraction Service API Router

This module provides REST API endpoints for the extraction service,
allowing external access to LLM-powered data extraction capabilities.

NOTE: The primary extraction usage is via /api/tablizer/extract endpoint.
These endpoints are kept for potential direct API usage.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import logging

from models import User
from services.auth_service import validate_token
from services.extraction_service import get_extraction_service


router = APIRouter(
    prefix="/extraction",
    tags=["extraction"]
)

logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================

class ExtractionRequest(BaseModel):
    """Request model for batch data extraction."""
    items: List[Dict[str, Any]] = Field(..., description="List of items to extract data from")
    result_schema: Dict[str, Any] = Field(..., description="JSON schema defining the structure of extraction results")
    extraction_instructions: str = Field(..., description="Natural language instructions for extraction")
    schema_key: Optional[str] = Field(None, description="Optional key for caching prompt caller")
    continue_on_error: bool = Field(True, description="Whether to continue processing if individual items fail")


class SingleExtractionRequest(BaseModel):
    """Request model for single item extraction."""
    item: Dict[str, Any] = Field(..., description="Item to extract data from")
    result_schema: Dict[str, Any] = Field(..., description="JSON schema defining the structure of extraction results")
    extraction_instructions: str = Field(..., description="Natural language instructions for extraction")
    schema_key: Optional[str] = Field(None, description="Optional key for caching prompt caller")


class ExtractionResponse(BaseModel):
    """Response model for batch extraction operations."""
    results: List[Dict[str, Any]] = Field(..., description="List of extraction results")
    metadata: Dict[str, Any] = Field(..., description="Extraction metadata including success/failure counts")
    success: bool = Field(..., description="Whether the extraction operation was successful")


class SingleExtractionResponse(BaseModel):
    """Response model for single item extraction."""
    result: Dict[str, Any] = Field(..., description="Extraction result")
    success: bool = Field(..., description="Whether the extraction was successful")


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/extract-multiple", response_model=ExtractionResponse)
async def extract_multiple_items(
    request: ExtractionRequest,
    current_user: User = Depends(validate_token)
):
    """
    Extract data from multiple items using LLM analysis.

    Args:
        request: Extraction parameters including items, schema, and instructions
        current_user: Authenticated user

    Returns:
        ExtractionResponse with results and metadata
    """
    logger.info(f"extract_multiple_items - user_id={current_user.user_id}, items={len(request.items)}")

    try:
        extraction_service = get_extraction_service()

        extraction_results = await extraction_service.extract_multiple_items(
            items=request.items,
            result_schema=request.result_schema,
            extraction_instructions=request.extraction_instructions,
            schema_key=request.schema_key,
            continue_on_error=request.continue_on_error
        )

        # Convert results to API format
        results = []
        successful = 0
        failed = 0

        for result in extraction_results:
            api_result = {
                "item_id": result.item_id,
                "original_item": result.original_item,
                "extraction": result.extraction,
                "extraction_timestamp": result.extraction_timestamp
            }

            if result.error:
                api_result["error"] = result.error
                failed += 1
            else:
                successful += 1

            if result.confidence_score is not None:
                api_result["confidence_score"] = result.confidence_score

            results.append(api_result)

        logger.info(f"extract_multiple_items complete - user_id={current_user.user_id}, successful={successful}, failed={failed}")

        return ExtractionResponse(
            results=results,
            metadata={
                "items_processed": len(request.items),
                "successful_extractions": successful,
                "failed_extractions": failed,
                "schema_key": request.schema_key
            },
            success=True
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"extract_multiple_items failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-single", response_model=SingleExtractionResponse)
async def extract_single_item(
    request: SingleExtractionRequest,
    current_user: User = Depends(validate_token)
):
    """
    Extract data from a single item using LLM analysis.

    Args:
        request: Extraction parameters including item, schema, and instructions
        current_user: Authenticated user

    Returns:
        SingleExtractionResponse with result
    """
    logger.info(f"extract_single_item - user_id={current_user.user_id}")

    try:
        extraction_service = get_extraction_service()

        extraction_result = await extraction_service.perform_extraction(
            item=request.item,
            result_schema=request.result_schema,
            extraction_instructions=request.extraction_instructions,
            schema_key=request.schema_key
        )

        api_result = {
            "item_id": extraction_result.item_id,
            "original_item": extraction_result.original_item,
            "extraction": extraction_result.extraction,
            "extraction_timestamp": extraction_result.extraction_timestamp
        }

        if extraction_result.error:
            api_result["error"] = extraction_result.error

        if extraction_result.confidence_score is not None:
            api_result["confidence_score"] = extraction_result.confidence_score

        logger.info(f"extract_single_item complete - user_id={current_user.user_id}, success={extraction_result.error is None}")

        return SingleExtractionResponse(
            result=api_result,
            success=extraction_result.error is None
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"extract_single_item failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.get("/test-connection")
async def test_extraction_service(
    current_user: User = Depends(validate_token)
):
    """
    Test the extraction service connection and functionality.
    """
    logger.info(f"test_extraction_service - user_id={current_user.user_id}")

    try:
        extraction_service = get_extraction_service()

        # Simple test extraction
        test_item = {"title": "Test Article", "content": "This is a test"}
        test_schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "confidence": {"type": "number"}
            },
            "required": ["summary", "confidence"]
        }

        result = await extraction_service.perform_extraction(
            item=test_item,
            result_schema=test_schema,
            extraction_instructions="Summarize the content and provide a confidence score between 0 and 1."
        )

        logger.info(f"test_extraction_service complete - user_id={current_user.user_id}")

        return {
            "status": "success",
            "message": "Extraction service is operational",
            "test_result": {
                "extraction_successful": result.error is None,
                "has_extraction": result.extraction is not None,
                "error": result.error
            }
        }

    except Exception as e:
        logger.error(f"test_extraction_service failed - user_id={current_user.user_id}: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Extraction service test failed: {str(e)}"
        }