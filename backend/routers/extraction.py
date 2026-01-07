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
from services.ai_evaluation_service import get_ai_evaluation_service


router = APIRouter(
    prefix="/extraction",
    tags=["extraction"]
)

logger = logging.getLogger(__name__)


# ============================================================================
# Request/Response Models
# ============================================================================

class FieldsExtractionRequest(BaseModel):
    """Request model for schema-based extraction (multiple fields per item)"""
    items: List[Dict[str, Any]] = Field(..., description="List of items to extract data from")
    result_schema: Dict[str, Any] = Field(..., description="JSON schema defining the fields to extract")
    instructions: str = Field(..., description="Natural language instructions for extraction")


class SingleFieldsExtractionRequest(BaseModel):
    """Request model for single item schema-based extraction"""
    item: Dict[str, Any] = Field(..., description="Item to extract data from")
    result_schema: Dict[str, Any] = Field(..., description="JSON schema defining the fields to extract")
    instructions: str = Field(..., description="Natural language instructions for extraction")


class FieldsExtractionResponse(BaseModel):
    """Response model for schema-based extraction"""
    results: List[Dict[str, Any]] = Field(..., description="List of extraction results")
    metadata: Dict[str, Any] = Field(..., description="Extraction metadata")
    success: bool = Field(..., description="Whether the operation was successful")


class SingleFieldsExtractionResponse(BaseModel):
    """Response model for single item extraction"""
    result: Dict[str, Any] = Field(..., description="Extraction result")
    success: bool = Field(..., description="Whether the extraction was successful")


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/extract-fields-batch", response_model=FieldsExtractionResponse)
async def extract_fields_batch(
    request: FieldsExtractionRequest,
    current_user: User = Depends(validate_token)
):
    """
    Extract multiple fields from multiple items using a schema.

    Args:
        request: Extraction parameters including items, schema, and instructions
        current_user: Authenticated user

    Returns:
        FieldsExtractionResponse with results and metadata
    """
    logger.info(f"extract_fields_batch - user_id={current_user.user_id}, items={len(request.items)}")

    try:
        eval_service = get_ai_evaluation_service()

        extraction_results = await eval_service.extract_fields_batch(
            items=request.items,
            schema=request.result_schema,
            instructions=request.instructions,
            id_field="id"  # Callers should include "id" field in items
        )

        # Convert results to API format
        results = []
        successful = 0
        failed = 0

        for result in extraction_results:
            api_result = {
                "item_id": result.item_id,
                "fields": result.fields
            }

            if result.error:
                api_result["error"] = result.error
                failed += 1
            else:
                successful += 1

            results.append(api_result)

        logger.info(f"extract_fields_batch complete - user_id={current_user.user_id}, successful={successful}, failed={failed}")

        return FieldsExtractionResponse(
            results=results,
            metadata={
                "items_processed": len(request.items),
                "successful_extractions": successful,
                "failed_extractions": failed
            },
            success=True
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"extract_fields_batch failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-fields", response_model=SingleFieldsExtractionResponse)
async def extract_fields(
    request: SingleFieldsExtractionRequest,
    current_user: User = Depends(validate_token)
):
    """
    Extract multiple fields from a single item using a schema.

    Args:
        request: Extraction parameters including item, schema, and instructions
        current_user: Authenticated user

    Returns:
        SingleFieldsExtractionResponse with result
    """
    logger.info(f"extract_fields - user_id={current_user.user_id}")

    try:
        eval_service = get_ai_evaluation_service()

        extraction_result = await eval_service.extract_fields(
            item=request.item,
            schema=request.result_schema,
            instructions=request.instructions,
            id_field="id"  # Callers should include "id" field in item
        )

        api_result = {
            "item_id": extraction_result.item_id,
            "fields": extraction_result.fields
        }

        if extraction_result.error:
            api_result["error"] = extraction_result.error

        logger.info(f"extract_fields complete - user_id={current_user.user_id}, success={extraction_result.error is None}")

        return SingleFieldsExtractionResponse(
            result=api_result,
            success=extraction_result.error is None
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"extract_fields failed - user_id={current_user.user_id}: {e}", exc_info=True)
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
        eval_service = get_ai_evaluation_service()

        # Simple test extraction
        test_item = {"id": "test", "title": "Test Article", "content": "This is a test about machine learning."}
        test_result = await eval_service.extract(
            item=test_item,
            instruction="Is this article about technology?",
            id_field="id",
            output_type="boolean"
        )

        logger.info(f"test_extraction_service complete - user_id={current_user.user_id}")

        return {
            "status": "success",
            "message": "Extraction service is operational",
            "test_result": {
                "extraction_successful": test_result.error is None,
                "value": test_result.value,
                "confidence": test_result.confidence,
                "error": test_result.error
            }
        }

    except Exception as e:
        logger.error(f"test_extraction_service failed - user_id={current_user.user_id}: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Extraction service test failed: {str(e)}"
        }
