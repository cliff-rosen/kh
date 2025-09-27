"""
Schema Utilities for Canonical Type Handling

This module provides utilities for seamless conversion between canonical types
and various serialization formats (JSON, tool outputs, API responses).
"""

from typing import Any, Dict, List, Optional, Type, Union
from pydantic import BaseModel, ValidationError
from schemas.canonical_types import (
    CanonicalEmail,
    CanonicalSearchResult,
    CanonicalWebpage,
    CanonicalPubMedArticle,
    CanonicalNewsletter,
    CanonicalDailyNewsletterRecap,
    get_canonical_model,
    list_canonical_types
)

# Type mapping for canonical models
CANONICAL_TYPE_MAP = {
    "email": CanonicalEmail,
    "search_result": CanonicalSearchResult,
    "webpage": CanonicalWebpage,
    "pubmed_article": CanonicalPubMedArticle,
    "newsletter": CanonicalNewsletter,
    "daily_newsletter_recap": CanonicalDailyNewsletterRecap
}

def serialize_canonical_object(obj: Any, preserve_search_results: bool = False) -> Any:
    """
    Recursively serialize canonical Pydantic objects to dictionaries.
    
    Args:
        obj: Object to serialize (can be Pydantic model, list, dict, or primitive)
        preserve_search_results: If True, preserves CanonicalSearchResult objects without serializing them
        
    Returns:
        Serialized object with Pydantic models converted to dictionaries (except search results if preserved)
    """
    if isinstance(obj, BaseModel):
        # Skip serialization for CanonicalSearchResult objects if preserve_search_results is True
        if preserve_search_results and isinstance(obj, CanonicalSearchResult):
            return obj
        return obj.model_dump()
    elif isinstance(obj, list):
        return [serialize_canonical_object(item, preserve_search_results) for item in obj]
    elif isinstance(obj, dict):
        return {key: serialize_canonical_object(value, preserve_search_results) for key, value in obj.items()}
    else:
        return obj

def deserialize_canonical_object(data: Any, canonical_type: Optional[str] = None) -> Any:
    """
    Recursively deserialize dictionaries to canonical Pydantic objects.
    
    Args:
        data: Data to deserialize (can be dict, list, or primitive)
        canonical_type: Optional canonical type name to force deserialization
        
    Returns:
        Deserialized object with dictionaries converted to Pydantic models where appropriate
    """
    if isinstance(data, dict):
        # Try to detect canonical type from data structure
        if canonical_type:
            try:
                model_class = get_canonical_model(canonical_type)
                return model_class.model_validate(data)
            except (ValueError, ValidationError):
                pass
        
        # Recursively deserialize nested structures
        return {key: deserialize_canonical_object(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [deserialize_canonical_object(item, canonical_type) for item in data]
    else:
        return data

def validate_canonical_data(data: Any, canonical_type: str) -> BaseModel:
    """
    Validate data against a canonical schema and return a typed object.
    
    Args:
        data: Data to validate
        canonical_type: Canonical type name
        
    Returns:
        Validated canonical object
        
    Raises:
        ValueError: If canonical type is not recognized
        ValidationError: If data doesn't match schema
    """
    model_class = get_canonical_model(canonical_type)
    return model_class.model_validate(data)

def convert_tool_output_to_canonical(
    outputs: Dict[str, Any], 
    tool_schema: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Convert tool outputs to canonical types based on tool schema definitions.
    
    Args:
        outputs: Raw tool outputs
        tool_schema: Tool schema definition with canonical type hints
        
    Returns:
        Outputs with canonical objects where specified
    """
    converted_outputs = {}
    
    for output_name, output_value in outputs.items():
        # Check if this output has a canonical type specified
        output_def = tool_schema.get("outputs", {}).get(output_name)
        if output_def and "canonical_type" in output_def:
            canonical_type = output_def["canonical_type"]
            
            # Convert based on canonical type
            if canonical_type in CANONICAL_TYPE_MAP:
                model_class = CANONICAL_TYPE_MAP[canonical_type]
                
                if isinstance(output_value, list):
                    # Handle array of canonical objects
                    converted_outputs[output_name] = [
                        model_class.model_validate(item) if isinstance(item, dict) else item
                        for item in output_value
                    ]
                elif isinstance(output_value, dict):
                    # Handle single canonical object
                    converted_outputs[output_name] = model_class.model_validate(output_value)
                else:
                    # Non-dict/list values pass through unchanged
                    converted_outputs[output_name] = output_value
            else:
                converted_outputs[output_name] = output_value
        else:
            # No canonical type specified, pass through unchanged
            converted_outputs[output_name] = output_value
    
    return converted_outputs

def ensure_canonical_types_in_response(
    response: Dict[str, Any],
    preserve_serialized: bool = True
) -> Dict[str, Any]:
    """
    Ensure canonical types are properly handled in API responses.
    
    Args:
        response: Response dictionary
        preserve_serialized: Whether to keep serialized versions alongside canonical objects
        
    Returns:
        Response with canonical types properly handled
    """
    if "outputs" in response:
        # Ensure both serialized and canonical versions exist
        if "canonical_outputs" not in response:
            response["canonical_outputs"] = response["outputs"]
        
        if preserve_serialized:
            # Ensure serialized outputs exist
            response["outputs"] = serialize_canonical_object(response["canonical_outputs"])
    
    return response

def get_canonical_type_from_schema(schema_def: Dict[str, Any]) -> Optional[str]:
    """
    Extract canonical type name from schema definition.
    
    Args:
        schema_def: Schema definition dictionary
        
    Returns:
        Canonical type name if found, None otherwise
    """
    return schema_def.get("canonical_type")

def is_canonical_type(obj: Any) -> bool:
    """
    Check if an object is a canonical type (Pydantic model).
    
    Args:
        obj: Object to check
        
    Returns:
        True if object is a canonical Pydantic model
    """
    return isinstance(obj, BaseModel) and type(obj) in CANONICAL_TYPE_MAP.values()

def get_canonical_type_name(obj: Any) -> Optional[str]:
    """
    Get the canonical type name for an object.
    
    Args:
        obj: Object to identify
        
    Returns:
        Canonical type name if object is a canonical type, None otherwise
    """
    if not is_canonical_type(obj):
        return None
    
    obj_type = type(obj)
    for type_name, model_class in CANONICAL_TYPE_MAP.items():
        if obj_type == model_class:
            return type_name
    
    return None

def create_typed_response(
    success: bool,
    outputs: Dict[str, Any],
    errors: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a standardized response with both serialized and canonical outputs.
    
    Args:
        success: Whether the operation was successful
        outputs: Output data (may contain canonical objects)
        errors: List of error messages
        metadata: Additional metadata
        
    Returns:
        Standardized response dictionary
    """
    # Check if outputs contain search results that should be preserved
    preserve_search_results = _has_search_results(outputs)
    
    response = {
        "success": success,
        "errors": errors or [],
        "outputs": serialize_canonical_object(outputs, preserve_search_results=preserve_search_results),
        "canonical_outputs": outputs,
        "metadata": metadata
    }
    
    return response

def _has_search_results(obj: Any) -> bool:
    """
    Check if an object or its nested structures contain CanonicalSearchResult objects.
    
    Args:
        obj: Object to check
        
    Returns:
        True if search results are found, False otherwise
    """
    if isinstance(obj, CanonicalSearchResult):
        return True
    elif isinstance(obj, list):
        return any(_has_search_results(item) for item in obj)
    elif isinstance(obj, dict):
        return any(_has_search_results(value) for value in obj.values())
    else:
        return False 