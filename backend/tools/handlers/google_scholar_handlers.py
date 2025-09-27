"""
Handler implementation for Google Scholar search tool.

This module provides the handler that delegates to the GoogleScholarService
for searching academic literature through Google Scholar via SerpAPI.
"""

from typing import Dict, Any
from datetime import datetime

from schemas.tool_handler_schema import ToolHandlerInput, ToolExecutionHandler, ToolHandlerResult
from services.google_scholar_service import GoogleScholarService
from tools.tool_registry import register_tool_handler


async def handle_google_scholar_search(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Search Google Scholar for academic articles.
    
    Delegates to GoogleScholarService which handles the SerpAPI integration.
    
    Args:
        input: ToolHandlerInput containing:
            - query: Search query for academic literature
            - num_results: Number of results to return (1-20, default: 10)
            - year_low: Filter results from this year onwards
            - year_high: Filter results up to this year
            - sort_by: Sort by 'relevance' or 'date'
            
    Returns:
        ToolHandlerResult containing:
            - articles: List of Google Scholar articles
            - search_metadata: Search metadata including total results
    """
    try:
        # Extract parameters
        query = input.params.get("query")
        num_results = input.params.get("num_results", 10)
        year_low = input.params.get("year_low")
        year_high = input.params.get("year_high")
        sort_by = input.params.get("sort_by", "relevance")
        
        # Get API key from resource configs if provided
        api_key = None
        if input.resource_configs and "serpapi" in input.resource_configs:
            api_key = input.resource_configs["serpapi"].get("api_key")
        
        # Get or create service instance
        service = GoogleScholarService(api_key)
        
        # Perform search
        articles, search_metadata = service.search_articles(
            query=query,
            num_results=num_results,
            year_low=year_low,
            year_high=year_high,
            sort_by=sort_by
        )
        
        print(f"Successfully retrieved {len(articles)} Google Scholar articles")
        
        return ToolHandlerResult(
            success=True,
            outputs={
                "articles": articles,
                "search_metadata": search_metadata
            },
            metadata={
                "tool_id": "google_scholar_search",
                "query": query,
                "num_results": len(articles),
                "timestamp": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        print(f"Error in Google Scholar search: {e}")
        return ToolHandlerResult(
            success=False,
            outputs={},
            metadata={
                "tool_id": "google_scholar_search",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )


# Register the handler
register_tool_handler(
    "google_scholar_search",
    ToolExecutionHandler(
        handler=handle_google_scholar_search,
        description="Search Google Scholar for academic articles using SerpAPI"
    )
)