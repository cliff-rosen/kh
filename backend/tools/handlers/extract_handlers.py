"""
Handler implementation for the extract tool.

This tool applies extraction functions to items in a list.
Each extraction function has a schema for the result and natural language instructions
for how to produce that schema from the source record.
"""

from typing import List, Dict, Any
from datetime import datetime
import uuid
import json
from pydantic import BaseModel, Field

from tools.tool_registry import register_tool_handler

from schemas.tool_handler_schema import ToolHandlerInput, ToolHandlerResult, ToolExecutionHandler

from services.extraction_service import get_extraction_service

# Legacy class for backward compatibility - functionality moved to ExtractionService
class ExtractionResult(BaseModel):
    """Dynamic extraction result - the structure is defined by the schema"""
    # This is a placeholder - the actual schema will be dynamically set
    result: Dict[str, Any] = Field(description="The extracted result matching the provided schema")

async def handle_extract(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Apply extraction functions to items in a list.
    
    Args:
        input: ToolHandlerInput containing:
            - items: List of items to process
            - extraction_function: Function or prompt describing what to extract
            - extraction_fields: List of field names to extract
            - batch_process: Whether to process as batch or individual items
            
    Returns:
        Dict containing:
            - extractions: List of item ID and extraction pairs
    """
    # Extract parameters
    items = input.params.get("items", [])
    extraction_function = input.params.get("extraction_function")
    extraction_fields = input.params.get("extraction_fields", [])
    batch_process = input.params.get("batch_process", True)
    
    if not items:
        return ToolHandlerResult(
            success=True,
            outputs={"extractions": []},
            metadata={}
        )
    
    if not extraction_function:
        raise ValueError("extraction_function is required")
    
    if not extraction_fields:
        raise ValueError("extraction_fields is required")
    
    # Create a schema from the extraction fields
    result_schema = {
        "type": "object",
        "properties": {field: {"type": "string"} for field in extraction_fields},
        "required": extraction_fields
    }
    
    # Get the extraction service
    extraction_service = get_extraction_service()
    
    # Perform extractions using the service
    extraction_results = await extraction_service.extract_multiple_items(
        items=items,
        result_schema=result_schema,
        extraction_instructions=extraction_function,
        schema_key=None  # Let service generate key from schema
    )
    
    # Convert service results to the expected format
    extractions = []
    for result in extraction_results:
        extraction_record = {
            "item_id": result.item_id,
            "original_item": result.original_item,
            "extraction": result.extraction,
        }
        
        if result.error:
            extraction_record["error"] = result.error
            
        extractions.append(extraction_record)
    
    return ToolHandlerResult(
        success=True,
        outputs={"extractions": extractions},
        metadata={"items_processed": len(items), "timestamp": datetime.utcnow().isoformat()}
    )


# Register the handler
register_tool_handler(
    "extract",
    ToolExecutionHandler(
        handler=handle_extract,
        description="Applies extraction functions to items in a list using schema and instructions"
    )
) 