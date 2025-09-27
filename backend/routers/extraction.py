"""
Extraction Service API Router

This module provides REST API endpoints for the extraction service,
allowing external access to LLM-powered data extraction capabilities.
"""

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ValidationError
import logging

from database import get_db
from models import User

from services.auth_service import validate_token
from services.extraction_service import get_extraction_service
from schemas.entity_extraction import (
    EntityExtractionResponse,
    ArticleArchetypeRequest,
    ArticleArchetypeResponse
)


router = APIRouter(
    prefix="/extraction",
    tags=["extraction"]
)

logger = logging.getLogger(__name__)


class ExtractionRequest(BaseModel):
    """Request model for data extraction."""
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
    """Response model for extraction operations."""
    results: List[Dict[str, Any]] = Field(..., description="List of extraction results")
    metadata: Dict[str, Any] = Field(..., description="Extraction metadata including success/failure counts")
    success: bool = Field(..., description="Whether the extraction operation was successful")


class SingleExtractionResponse(BaseModel):
    """Response model for single item extraction."""
    result: Dict[str, Any] = Field(..., description="Extraction result")
    success: bool = Field(..., description="Whether the extraction was successful")


class ResearchFeaturesRequest(BaseModel):
    """Request model for research feature extraction from academic articles."""
    articles: List[Dict[str, Any]] = Field(..., description="List of academic articles to analyze")


@router.post("/extract-multiple", response_model=ExtractionResponse)
async def extract_multiple_items(
    request: ExtractionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
):
    """
    Extract data from multiple items using LLM analysis.
    
    This endpoint provides access to the extraction service for processing
    multiple items with a custom schema and instructions.
    
    Args:
        request: Extraction parameters
        db: Database session
        current_user: Authenticated user
        
    Returns:
        ExtractionResponse with results and metadata
        
    Raises:
        HTTPException: If extraction fails or parameters are invalid
    """
    try:
        # Get the extraction service
        extraction_service = get_extraction_service()
        
        # Perform the extraction
        extraction_results = await extraction_service.extract_multiple_items(
            items=request.items,
            result_schema=request.result_schema,
            extraction_instructions=request.extraction_instructions,
            schema_key=request.schema_key,
            continue_on_error=request.continue_on_error
        )
        
        # Convert results to API format
        results = []
        successful_extractions = 0
        failed_extractions = 0
        
        for result in extraction_results:
            api_result = {
                "item_id": result.item_id,
                "original_item": result.original_item,
                "extraction": result.extraction,
                "extraction_timestamp": result.extraction_timestamp
            }
            
            if result.error:
                api_result["error"] = result.error
                failed_extractions += 1
            else:
                successful_extractions += 1
                
            if result.confidence_score is not None:
                api_result["confidence_score"] = result.confidence_score
                
            results.append(api_result)
        
        return ExtractionResponse(
            results=results,
            metadata={
                "items_processed": len(request.items),
                "successful_extractions": successful_extractions,
                "failed_extractions": failed_extractions,
                "schema_key": request.schema_key
            },
            success=True
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/extract-single", response_model=SingleExtractionResponse)
async def extract_single_item(
    raw_request: Request,
    request: SingleExtractionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
):
    """
    Extract data from a single item using LLM analysis.
    
    This endpoint provides access to the extraction service for processing
    a single item with a custom schema and instructions.
    
    Args:
        request: Extraction parameters
        db: Database session
        current_user: Authenticated user
        
    Returns:
        SingleExtractionResponse with result
        
    Raises:
        HTTPException: If extraction fails or parameters are invalid
    """
    try:
        # Log raw request body for debugging JSON issues
        body = await raw_request.body()
        logger.info(f"Raw request body: {body.decode()[:500]}...")
        
        # Log the parsed request for debugging
        logger.info(f"Extraction request received for user {current_user.user_id}")
        logger.info(f"Item keys: {list(request.item.keys())}")
        logger.info(f"Schema type: {request.result_schema.get('type', 'unknown')}")
        logger.info(f"Instructions length: {len(request.extraction_instructions)}")
        logger.info(f"Schema key: {request.schema_key}")
        
        # Get the extraction service
        extraction_service = get_extraction_service()
        
        # Perform the extraction
        extraction_result = await extraction_service.perform_extraction(
            item=request.item,
            result_schema=request.result_schema,
            extraction_instructions=request.extraction_instructions,
            schema_key=request.schema_key
        )
        
        # Convert result to API format
        api_result = {
            "item_id": extraction_result.item_id,
            "original_item": extraction_result.original_item,
            "extraction": extraction_result.extraction,
            "extraction_timestamp": extraction_result.extraction_timestamp
        }
        
        if extraction_result.error:
            api_result["error"] = extraction_result.error
            logger.warning(f"Extraction had error: {extraction_result.error}")
            
        if extraction_result.confidence_score is not None:
            api_result["confidence_score"] = extraction_result.confidence_score
        
        logger.info(f"Extraction completed successfully: {extraction_result.error is None}")
        
        return SingleExtractionResponse(
            result=api_result,
            success=extraction_result.error is None
        )
        
    except ValueError as ve:
        logger.error(f"Validation error in extraction: {str(ve)}")
        raise HTTPException(status_code=400, detail=f"Validation error: {str(ve)}")
    except Exception as e:
        logger.error(f"Unexpected error in extraction: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")


@router.post("/research-features", response_model=ExtractionResponse)
async def extract_research_features(
    request: ResearchFeaturesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
):
    """
    Extract research features from academic articles.
    
    This endpoint provides a convenient way to extract predefined research
    features from academic articles using the unified extraction service.
    
    Args:
        request: Academic articles to analyze
        db: Database session
        current_user: Authenticated user
        
    Returns:
        ExtractionResponse with enriched articles
        
    Raises:
        HTTPException: If extraction fails or parameters are invalid
    """
    try:
        from schemas.research_features import RESEARCH_FEATURES_SCHEMA, RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS
        
        # Get the extraction service
        extraction_service = get_extraction_service()
        
        # Perform feature extraction using predefined schema (includes scoring)
        predefined_schemas = {"research_features": RESEARCH_FEATURES_SCHEMA}
        predefined_instructions = {"research_features": RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS}
        
        extraction_results = await extraction_service.extract_with_predefined_schema(
            items=request.articles,
            schema_name="research_features",
            predefined_schemas=predefined_schemas,
            predefined_instructions=predefined_instructions
        )
        
        # Convert results to enriched articles format
        results = []
        successful_extractions = 0
        failed_extractions = 0
        
        for result in extraction_results:
            # Create enriched article
            enriched_article = result.original_item.copy()
            
            if "metadata" not in enriched_article:
                enriched_article["metadata"] = {}
            
            # Add extraction results to metadata (already includes relevance score)
            if result.extraction:
                enriched_article["metadata"]["features"] = result.extraction
                successful_extractions += 1
            
            if result.error:
                enriched_article["metadata"]["feature_extraction_error"] = result.error
                failed_extractions += 1
            
            enriched_article["metadata"]["feature_extraction_timestamp"] = result.extraction_timestamp
            
            results.append({
                "item_id": result.item_id,
                "enriched_article": enriched_article,
                "extraction_timestamp": result.extraction_timestamp
            })
        
        return ExtractionResponse(
            results=results,
            metadata={
                "articles_processed": len(request.articles),
                "successful_extractions": successful_extractions,
                "failed_extractions": failed_extractions,
                "schema_type": "research_features"
            },
            success=True
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Research feature extraction failed: {str(e)}")


@router.get("/schemas/research-features")
async def get_research_features_schema(
    current_user: User = Depends(validate_token)
):
    """
    Get the unified schema for research feature extraction.
    
    Returns the JSON schema and instructions used for extracting research
    features from academic articles.
    
    Args:
        current_user: Authenticated user
        
    Returns:
        Dictionary containing schema and instructions
    """
    try:
        from schemas.research_features import RESEARCH_FEATURES_SCHEMA, RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS
        
        return {
            "schema": RESEARCH_FEATURES_SCHEMA,
            "instructions": RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS,
            "description": "Unified schema for extracting research features from academic articles"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve schema: {str(e)}")


@router.get("/test-connection")
async def test_extraction_service(
    current_user: User = Depends(validate_token)
):
    """
    Test the extraction service connection and functionality.
    
    Performs a simple test extraction to verify the service is operational.
    
    Args:
        current_user: Authenticated user
        
    Returns:
        Status information about the extraction service
    """
    try:
        # Get the extraction service
        extraction_service = get_extraction_service()
        
        # Perform a simple test extraction
        test_item = {"title": "Test Article", "content": "This is a test"}
        test_schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "confidence": {"type": "number"}
            },
            "required": ["summary", "confidence"]
        }
        test_instructions = "Summarize the content and provide a confidence score between 0 and 1."
        
        result = await extraction_service.perform_extraction(
            item=test_item,
            result_schema=test_schema,
            extraction_instructions=test_instructions
        )
        
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
        return {
            "status": "error",
            "message": f"Extraction service test failed: {str(e)}"
        }


# ================== ARCHETYPE-DRIVEN EXTRACTION ==================

from pydantic import BaseModel, Field
from services.extraction_service import get_extraction_service


class ArchetypeToGraphRequest(BaseModel):
    article_id: str
    archetype: str
    study_type: str | None = None
    pattern_id: str | None = None


@router.post("/extract-article-archtype", response_model=ArticleArchetypeResponse)
async def extract_article_archtype(
    request: ArticleArchetypeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
):
    """Stage 1: Extract a plain natural-language study archetype from an article."""
    try:
        svc = get_extraction_service()
        archetype = await svc.extract_article_archetype(
            article_id=request.article_id,
            title=request.title,
            abstract=request.abstract,
            full_text=request.full_text,
        )
        return ArticleArchetypeResponse(
            article_id=request.article_id,
            archetype=archetype.archetype,
            study_type=archetype.study_type,
            pattern_id=archetype.pattern_id
        )
    except Exception as e:
        logger.error(f"Archetype extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Archetype extraction failed: {str(e)}")


@router.post("/archetype-to-er-graph", response_model=EntityExtractionResponse)
async def archetype_to_er_graph(
    request: ArchetypeToGraphRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(validate_token)
):
    """Stage 2: Convert an archetype sentence into an entity-relationship graph."""
    try:
        svc = get_extraction_service()
        return await svc.extract_er_graph_from_archetype(
            article_id=request.article_id,
            archetype_text=request.archetype,
            study_type=request.study_type,
            pattern_id=request.pattern_id
        )
    except Exception as e:
        logger.error(f"ER graph generation from archetype failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ER graph generation failed: {str(e)}")