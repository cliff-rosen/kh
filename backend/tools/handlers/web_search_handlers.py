"""
Handler implementation for the web_search tool.

This tool searches the web for real-time information about any topic.
"""

from typing import List, Dict, Any
from datetime import datetime
from schemas.tool_handler_schema import ToolHandlerInput, ToolExecutionHandler, ToolHandlerResult
from schemas.canonical_types import CanonicalSearchResult
from schemas.schema_utils import create_typed_response
from tools.tool_registry import register_tool_handler
from services.search_service import SearchService

# Singleton service instance
search_service = SearchService()

async def handle_web_search(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Search the web for real-time information about any topic.
    
    Args:
        input: ToolHandlerInput containing:
            - search_term: The search term to look up on the web
            - num_results: Number of search results to return
            - date_range: Date range for search results
            - region: Geographic region for search results
            - language: Language for search results
            
    Returns:
        ToolHandlerResult containing:
            - search_results: List of web search results (CanonicalSearchResult objects)
            - query: Original search query
            - total_results: Total number of results
            - search_time: Search time in milliseconds
            - timestamp: Search timestamp
            - search_engine: Search engine used
            - metadata: Additional search metadata
    """
    # Extract parameters
    search_term = input.params.get("search_term")
    num_results = input.params.get("num_results", 10)
    date_range = input.params.get("date_range", "all")
    region = input.params.get("region", "global")
    language = input.params.get("language", "en")
    
    if not search_term:
        raise ValueError("search_term is required")
    
    try:
        # Initialize search service (uses app-level API keys from settings)
        if not search_service.initialized:
            search_service.initialize()
        
        # Perform search
        result = await search_service.search(
            search_term=search_term,
            num_results=num_results,
            date_range=date_range,
            region=region,
            language=language
        )
        
        # Return properly typed canonical results
        # The service already returns CanonicalSearchResult objects, maintaining full type safety
        return ToolHandlerResult(
            outputs={
                "search_results": result["search_results"],  # List[CanonicalSearchResult]
                "query": result["query"],
                "total_results": result["total_results"],
                "search_time": result["search_time"],
                "timestamp": result["timestamp"],
                "search_engine": result["search_engine"],
                "metadata": result.get("metadata")
            }
        )
        
    except Exception as e:
        # Log error and return empty results with error metadata
        print(f"Error performing web search: {e}")
        
        return ToolHandlerResult(
            outputs={
                "search_results": [],  # Empty list, but still properly typed
                "query": search_term,
                "total_results": 0,
                "search_time": 0,
                "timestamp": datetime.utcnow().isoformat(),
                "search_engine": None,
                "metadata": {
                    "error": str(e)
                }
            }
        )

# Register the handler
register_tool_handler(
    "web_search",
    ToolExecutionHandler(
        handler=handle_web_search,
        description="Searches the web for real-time information about any topic"
    )
) 