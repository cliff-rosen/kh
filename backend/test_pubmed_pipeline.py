#!/usr/bin/env python3
"""
Test script for the PubMed research pipeline.

This script tests the complete 5-tool PubMed pipeline:
1. Generate Query -> 2. Search -> 3. Extract -> 4. Score -> 5. Filter
"""

import asyncio
import json
from tools.handlers.pubmed_handlers import (
    handle_pubmed_generate_query,
    handle_pubmed_search,
    handle_pubmed_extract_features,
    handle_pubmed_score_articles,
    handle_pubmed_filter_rank
)
from schemas.tool_handler_schema import ToolHandlerInput
from tools.tool_stubbing import disable_stubbing


async def test_pubmed_pipeline():
    """Test the complete PubMed research pipeline."""
    
    # Disable tool stubbing for this test
    disable_stubbing()
    
    print("=" * 60)
    print("TESTING PUBMED RESEARCH PIPELINE")
    print("=" * 60)
    
    # Step 1: Generate Query
    print("\n1. Testing PubMed Query Generator...")
    query_input = ToolHandlerInput(
        tool_id="pubmed_generate_query",
        params={
            "research_goal": "Find recent studies on machine learning applications in medical diagnosis",
            "focus_areas": ["deep learning", "neural networks", "medical imaging"],
            "time_period": "2_years",
            "article_types": ["research_article", "review"]
        },
        user_id="test_user",
        mission_id="test_mission"
    )
    
    try:
        query_result = await handle_pubmed_generate_query(query_input)
        print(f"[OK] Query generated successfully")
        print(f"  Generated query: {query_result.outputs.get('optimized_query', 'N/A')}")
        
        generated_query = query_result.outputs.get('optimized_query', 'machine learning medical diagnosis')
        
    except Exception as e:
        print(f"[ERROR] Query generation failed: {e}")
        generated_query = "machine learning medical diagnosis"  # Fallback
    
    # Step 2: Search PubMed
    print("\n2. Testing PubMed Search...")
    search_input = ToolHandlerInput(
        tool_id="pubmed_search",
        params={
            "query": "machine learning medical diagnosis",  # Use simple query for testing
            "max_results": 5,  # Small number for testing
        },
        user_id="test_user",
        mission_id="test_mission"
    )
    
    try:
        search_result = await handle_pubmed_search(search_input)
        print(f"[OK] Search completed successfully")
        print(f"  Search result outputs keys: {list(search_result.outputs.keys())}")
        articles = search_result.outputs.get('articles', [])
        print(f"  Found {len(articles)} articles")
        
        if articles:
            print(f"  First article: {articles[0].get('title', 'N/A')[:100]}...")
        
    except Exception as e:
        print(f"[ERROR] Search failed: {e}")
        # Create mock articles for testing downstream tools
        articles = [
            {
                "pmid": "12345678",
                "title": "Machine Learning in Medical Diagnosis: A Comprehensive Review",
                "abstract": "This review examines the application of machine learning techniques in medical diagnosis, focusing on deep learning approaches for medical imaging analysis...",
                "authors": ["Smith J", "Johnson A", "Williams B"],
                "journal": "Journal of Medical AI",
                "publication_date": "2023-01-15"
            }
        ]
        print(f"  Using {len(articles)} mock articles for testing")
    
    # Step 3: Extract Features
    print("\n3. Testing Feature Extraction...")
    extract_input = ToolHandlerInput(
        tool_id="pubmed_extract_features",
        params={
            "articles": articles,
            "extraction_schema": {
                "study_type": "Type of study",
                "sample_size": "Number of participants",
                "methodology": "Research methodology",
                "key_findings": "Main findings",
                "clinical_relevance": "Clinical relevance score (1-5)",
                "innovation_score": "Innovation score (1-5)"
            },
            "instructions": "Focus on machine learning and AI applications"
        },
        user_id="test_user",
        mission_id="test_mission"
    )
    
    try:
        extract_result = await handle_pubmed_extract_features(extract_input)
        print(f"[OK] Feature extraction completed successfully")
        extractions = extract_result.outputs.get('extractions', [])
        print(f"  Extracted features from {len(extractions)} articles")
        
        if extractions:
            first_extraction = extractions[0]
            if hasattr(first_extraction, 'extraction'):
                features = first_extraction.extraction
                print(f"  Sample extraction - Study type: {features.get('study_type', 'N/A')}")
                print(f"  Sample extraction - Clinical relevance: {features.get('clinical_relevance', 'N/A')}")
        
    except Exception as e:
        print(f"[ERROR] Feature extraction failed: {e}")
        # Create mock extractions
        extractions = [
            {
                "item_id": "12345678",
                "original_article": articles[0] if articles else {},
                "extraction": {
                    "study_type": "review",
                    "sample_size": "N/A",
                    "methodology": "systematic review",
                    "key_findings": "ML shows promise in medical diagnosis",
                    "clinical_relevance": "4",
                    "innovation_score": "3"
                }
            }
        ]
        print(f"  Using {len(extractions)} mock extractions for testing")
    
    # Step 4: Score Articles
    print("\n4. Testing Article Scoring...")
    score_input = ToolHandlerInput(
        tool_id="pubmed_score_articles",
        params={
            "extractions": extractions,
            "scoring_criteria": {
                "clinical_relevance": {"weight": 0.4, "max_score": 5},
                "innovation_score": {"weight": 0.3, "max_score": 5},
                "study_quality": {"weight": 0.3, "max_score": 5}
            },
            "normalize_scores": True
        },
        user_id="test_user",
        mission_id="test_mission"
    )
    
    try:
        score_result = await handle_pubmed_score_articles(score_input)
        print(f"[OK] Article scoring completed successfully")
        scored_articles = score_result.outputs.get('scored_articles', [])
        print(f"  Scored {len(scored_articles)} articles")
        
        if scored_articles:
            first_scored = scored_articles[0]
            if hasattr(first_scored, 'total_score'):
                print(f"  Sample score: {first_scored.total_score:.2f}")
                if hasattr(first_scored, 'score_breakdown'):
                    print(f"  Score breakdown: {first_scored.score_breakdown}")
        
    except Exception as e:
        print(f"[ERROR] Article scoring failed: {e}")
        # Create mock scored articles
        scored_articles = [
            {
                "article_with_features": extractions[0] if extractions else {},
                "total_score": 75.5,
                "score_breakdown": {
                    "clinical_relevance": {"raw_score": 4.0, "weight": 0.4, "weighted_score": 1.6},
                    "innovation_score": {"raw_score": 3.0, "weight": 0.3, "weighted_score": 0.9}
                },
                "percentile_rank": 85.0
            }
        ]
        print(f"  Using {len(scored_articles)} mock scored articles for testing")
    
    # Step 5: Filter and Rank
    print("\n5. Testing Filtering and Ranking...")
    filter_input = ToolHandlerInput(
        tool_id="pubmed_filter_rank",
        params={
            "scored_articles": scored_articles,
            "min_score_threshold": 50.0,
            "max_results": 10,
            "sort_by": "total_score",
            "sort_order": "desc"
        },
        user_id="test_user",
        mission_id="test_mission"
    )
    
    try:
        filter_result = await handle_pubmed_filter_rank(filter_input)
        print(f"[OK] Filtering and ranking completed successfully")
        filtered_articles = filter_result.outputs.get('filtered_articles', [])
        filter_summary = filter_result.outputs.get('filter_summary', {})
        
        print(f"  Input articles: {filter_summary.get('input_articles', 0)}")
        print(f"  Final results: {filter_summary.get('final_results', 0)}")
        print(f"  Score range: {filter_summary.get('score_range', {})}")
        
    except Exception as e:
        print(f"[ERROR] Filtering and ranking failed: {e}")
    
    print("\n" + "=" * 60)
    print("PUBMED PIPELINE TEST COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_pubmed_pipeline())