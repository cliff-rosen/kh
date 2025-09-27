"""
Handler for Google Scholar feature extraction.

This handler uses the extraction service to extract research features
from Google Scholar articles using predefined schema and instructions.
"""

from typing import List, Dict, Any
from datetime import datetime

from schemas.tool_handler_schema import ToolHandlerInput, ToolHandlerResult, ToolExecutionHandler
from schemas.canonical_types import CanonicalScholarArticle
from schemas.research_features import RESEARCH_FEATURES_SCHEMA, RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS
from services.extraction_service import get_extraction_service
from tools.tool_registry import register_tool_handler


async def handle_google_scholar_extract_features(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Extract research features from Google Scholar articles.
    
    This handler uses the extraction service with predefined schema and 
    instructions specific to academic article analysis.
    
    Args:
        input: ToolHandlerInput containing:
            - articles: List of Google Scholar articles to analyze
            
    Returns:
        ToolHandlerResult containing:
            - enriched_articles: Articles with features added to metadata
    """
    # Extract parameters
    articles = input.params.get("articles", [])
    
    if not articles:
        return ToolHandlerResult(
            success=True,
            outputs={"enriched_articles": []},
            metadata={"articles_processed": 0, "timestamp": datetime.utcnow().isoformat()}
        )
    
    # Get the extraction service
    extraction_service = get_extraction_service()
    
    # Convert articles to dict format for extraction
    article_dicts = []
    for article in articles:
        article_dict = article if isinstance(article, dict) else article.dict()
        article_dicts.append(article_dict)
    
    # Perform feature extraction using the service with predefined schema
    # This will automatically include relevance scoring
    predefined_schemas = {"research_features": RESEARCH_FEATURES_SCHEMA}
    predefined_instructions = {"research_features": RESEARCH_FEATURES_EXTRACTION_INSTRUCTIONS}
    
    extraction_results = await extraction_service.extract_with_predefined_schema(
        items=article_dicts,
        schema_name="research_features",
        predefined_schemas=predefined_schemas,
        predefined_instructions=predefined_instructions
    )
    
    # Process results and create enriched articles
    enriched_articles = []
    for extraction_result in extraction_results:
        enriched_article = extraction_result.original_item.copy()
        
        # Ensure metadata exists
        if "metadata" not in enriched_article:
            enriched_article["metadata"] = {}
        
        # Add extraction results to metadata (service already added relevance score)
        if extraction_result.extraction:
            enriched_article["metadata"]["features"] = extraction_result.extraction
        
        if extraction_result.error:
            enriched_article["metadata"]["feature_extraction_error"] = extraction_result.error
        
        enriched_article["metadata"]["feature_extraction_timestamp"] = extraction_result.extraction_timestamp
        
        enriched_articles.append(enriched_article)
    
    # Calculate success metrics
    successful_extractions = len([r for r in extraction_results if r.extraction is not None])
    failed_extractions = len([r for r in extraction_results if r.error is not None])
    
    return ToolHandlerResult(
        success=True,
        outputs={"enriched_articles": enriched_articles},
        metadata={
            "articles_processed": len(articles),
            "successful_extractions": successful_extractions,
            "failed_extractions": failed_extractions,
            "timestamp": datetime.utcnow().isoformat()
        }
    )


# Register the handler
register_tool_handler(
    "google_scholar_extract_features",
    ToolExecutionHandler(
        handler=handle_google_scholar_extract_features,
        description="Extracts research features from Google Scholar articles using LLM analysis"
    )
)