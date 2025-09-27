"""
Handler implementation for the web_retrieve tool.

This tool retrieves and extracts content from webpages given their URLs.
"""

from typing import Dict, Any
from datetime import datetime
from schemas.tool_handler_schema import ToolHandlerInput, ToolExecutionHandler, ToolHandlerResult
from schemas.canonical_types import CanonicalWebpage
from schemas.schema_utils import create_typed_response
from tools.tool_registry import register_tool_handler
from services.web_retrieval_service import WebRetrievalService

# Singleton service instance
web_retrieval_service = WebRetrievalService()

async def handle_web_retrieve(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Retrieve and extract content from one or more webpages given their URLs.
    
    Args:
        input: ToolHandlerInput containing:
            - url: The URL(s) of the webpage(s) to retrieve (string or array)
            - extract_text_only: Whether to extract only text content or include HTML
            - timeout: Request timeout in seconds
            - user_agent: User agent string to use for the request
            
    Returns:
        ToolHandlerResult containing:
            - webpage: Retrieved webpage content (array of CanonicalWebpage objects)
            - status_code: HTTP status code from the request (or first request if multiple)
            - response_time: Response time in milliseconds (or total time if multiple)
            - timestamp: Retrieval timestamp
    """
    # Extract parameters
    url_param = input.params.get("url")
    extract_text_only = input.params.get("extract_text_only", True)
    timeout = input.params.get("timeout", 30)
    user_agent = input.params.get("user_agent")
    
    if not url_param:
        raise ValueError("url is required")
    
    # Handle both single URL and array of URLs
    if isinstance(url_param, str):
        # Single URL - convert to array for consistent processing
        urls = [url_param]
    elif isinstance(url_param, list):
        # Array of URLs
        urls = url_param
    else:
        raise ValueError("url must be a string or array of strings")
    
    if not urls:
        raise ValueError("At least one URL is required")
    
    try:
        # Retrieve webpage(s)
        if len(urls) == 1:
            # Single URL - use single retrieval method
            result = await web_retrieval_service.retrieve_webpage(
                url=urls[0],
                extract_text_only=extract_text_only,
                timeout=timeout,
                user_agent=user_agent
            )
            
            # Return as array to match schema
            return ToolHandlerResult(
                outputs={
                    "webpage": [result["webpage"]],  # Array of CanonicalWebpage
                    "status_code": result["status_code"],
                    "response_time": result["response_time"],
                    "timestamp": result["timestamp"]
                }
            )
        else:
            # Multiple URLs - use concurrent retrieval method
            results = await web_retrieval_service.retrieve_multiple_pages(
                urls=urls,
                extract_text_only=extract_text_only,
                timeout=timeout,
                user_agent=user_agent,
                max_concurrent=5
            )
            
            # Extract webpages and calculate aggregate metrics
            webpages = [result["webpage"] for result in results]
            total_response_time = sum(result["response_time"] for result in results)
            
            # Use status code from first successful request, or first request if all failed
            status_code = next((result["status_code"] for result in results if result["status_code"] > 0), 
                             results[0]["status_code"] if results else 0)
            
            return ToolHandlerResult(
                outputs={
                    "webpage": webpages,  # Array of CanonicalWebpage
                    "status_code": status_code,
                    "response_time": total_response_time,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
        
    except Exception as e:
        # Log error and return error webpage with error metadata
        print(f"Error retrieving webpage(s): {e}")
        
        # Create error webpage object(s)
        error_webpages = []
        for url in urls:
            error_webpage = CanonicalWebpage(
                url=url,
                title="Error",
                content=f"Error retrieving webpage: {str(e)}",
                html=None,
                last_modified=None,
                content_type="text/html",
                status_code=0,
                headers={},
                metadata={"error": str(e)}
            )
            error_webpages.append(error_webpage)
        
        return ToolHandlerResult(
            outputs={
                "webpage": error_webpages,
                "status_code": 0,
                "response_time": 0,
                "timestamp": datetime.utcnow().isoformat()
            }
        )

# Register the handler
register_tool_handler(
    "web_retrieve",
    ToolExecutionHandler(
        handler=handle_web_retrieve,
        description="Retrieves and extracts content from webpages given their URLs"
    )
) 