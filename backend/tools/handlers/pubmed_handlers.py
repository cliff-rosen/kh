"""
Handler implementations for PubMed research tools.

This module provides the complete PubMed research pipeline with 5 tools:
1. pubmed_generate_query - Generate optimized PubMed search queries
2. pubmed_search - Search PubMed for articles using NCBI E-utilities
3. pubmed_extract_features - Extract structured information from articles
4. pubmed_score_articles - Score articles based on extracted features
5. pubmed_filter_rank - Filter and rank articles by scores
"""

import json
from typing import List, Dict, Any, Optional
from datetime import datetime

from schemas.tool_handler_schema import ToolHandlerInput, ToolExecutionHandler, ToolHandlerResult
from schemas.canonical_types import CanonicalPubMedArticle, CanonicalPubMedExtraction, CanonicalScoredArticle
from schemas.schema_utils import create_typed_response
from tools.tool_registry import register_tool_handler
from services.pubmed_service import PubMedService, PubMedArticle
from agents.prompts.base_prompt_caller import BasePromptCaller


# ===== Tool 1: PubMed Query Generator =====

async def handle_pubmed_generate_query(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Generate an optimized PubMed search query for a given research goal.
    
    Args:
        input: ToolHandlerInput containing:
            - research_goal: Research goal or question
            - focus_areas: Optional list of specific focus areas
            - time_period: Optional time period for search
            - article_types: Optional types of articles to include
            - exclusion_terms: Optional terms to exclude
            
    Returns:
        ToolHandlerResult containing:
            - generated_query: Single optimized PubMed search query string
    """
    # Extract parameters
    research_goal = input.params.get("research_goal")
    focus_areas = input.params.get("focus_areas", [])
    time_period = input.params.get("time_period", "5_years")
    article_types = input.params.get("article_types", ["research_article", "review"])
    exclusion_terms = input.params.get("exclusion_terms", [])
    
    if not research_goal:
        raise ValueError("research_goal is required")
    
    # Use BasePromptCaller to optimize the query
    from pydantic import BaseModel, Field
    
    class QueryOptimizationResult(BaseModel):
        optimized_query: str = Field(description="The optimized PubMed search query string")
    
    system_message = """You are a PubMed search expert. Your task is to generate a single optimized PubMed search query.
    
    Given a research goal, create an optimized PubMed search query using:
    - MeSH terms where appropriate
    - Boolean operators (AND, OR, NOT)
    - Field tags ([Title/Abstract], [MeSH Terms], etc.)
    - Publication type filters
    - Date restrictions
    
    Return ONLY the query string that will find the most relevant articles.
    
    Research Goal: {research_goal}
    Focus Areas: {focus_areas}
    Time Period: {time_period}
    Article Types: {article_types}
    Exclusion Terms: {exclusion_terms}
    
    Generate the optimized PubMed search query:"""
    
    prompt_caller = BasePromptCaller(
        response_model=QueryOptimizationResult,
        system_message=system_message
    )
    
    try:
        result = await prompt_caller.invoke(
            messages=[],
            research_goal=research_goal,
            focus_areas=', '.join(focus_areas) if focus_areas else 'None specified',
            time_period=time_period,
            article_types=', '.join(article_types),
            exclusion_terms=', '.join(exclusion_terms) if exclusion_terms else 'None'
        )
        optimized_query = result.optimized_query
    except Exception as e:
        # Fallback if LLM call fails - just use the research goal
        optimized_query = research_goal
    
    return ToolHandlerResult(
        success=True,
        outputs={
            "generated_query": optimized_query
        },
        metadata={
            "tool_id": "pubmed_generate_query",
            "research_goal": research_goal,
            "timestamp": datetime.now().isoformat()
        }
    )


# ===== Tool 2: PubMed Search =====

async def handle_pubmed_search(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Search PubMed for articles using the NCBI E-utilities API.
    
    Args:
        input: ToolHandlerInput containing:
            - query: PubMed search query
            - max_results: Maximum number of results to return
            - start_date: Optional start date for search (YYYY-MM-DD)
            - end_date: Optional end date for search (YYYY-MM-DD)
            - sort_order: Sort order for results
            
    Returns:
        ToolHandlerResult containing:
            - articles: List of CanonicalPubMedArticle objects
            - search_metadata: Metadata about the search
            - total_found: Total number of articles found
            - query_used: The query that was executed
    """
    try:
        # Extract parameters
        query = input.params.get("search_query")
        max_results = input.params.get("max_results", 50)
        start_date = input.params.get("start_date")
        end_date = input.params.get("end_date")
        sort_order = input.params.get("sort_order", "relevance")
        
        if not query:
            raise ValueError("search_query is required")
        
        # Use the new PubMedService class
        service = PubMedService()
        canonical_research_articles, metadata = service.search_articles(
            query=query,
            max_results=max_results,
            offset=0,
            sort_by=sort_order,
            start_date=start_date,
            end_date=end_date
        )
        
        total_found = metadata["total_results"]
        print(f"Retrieved {len(canonical_research_articles)} article details from PubMed")
        
        # Convert CanonicalResearchArticle back to CanonicalPubMedArticle for compatibility
        canonical_articles = []
        for i, article in enumerate(canonical_research_articles):
            try:
                # Extract PMID from the research article ID
                pmid = article.id.replace('pmid:', '') if article.id.startswith('pmid:') else article.id
                print(f"Converting article {i+1}: PMID={pmid}, title={article.title[:50]}...")
                
                canonical_article = CanonicalPubMedArticle(
                    pmid=pmid,
                    title=article.title,
                    abstract=article.abstract or "",
                    authors=article.authors,
                    journal=article.journal or "",
                    publication_date=article.publication_date,
                    keywords=article.keywords,
                    mesh_terms=article.mesh_terms,
                    metadata=article.source_metadata or {}
                )
                canonical_articles.append(canonical_article)
                print(f"Successfully converted article {i+1}")
            except Exception as e:
                print(f"Error converting article {i+1}: {e}")
                continue
        
        print(f"Final canonical_articles count: {len(canonical_articles)}")
        
        # Convert canonical articles to dictionaries for serialization
        articles_as_dicts = [article.model_dump() for article in canonical_articles]
        
        return ToolHandlerResult(
            success=True,
            outputs={
                "articles": articles_as_dicts,
                "search_metadata": {
                    "query_executed": query,
                    "date_range": f"{start_date} to {end_date}" if start_date and end_date else "No date filter",
                    "sort_order": sort_order,
                    "results_returned": len(canonical_articles),
                    "search_timestamp": datetime.now().isoformat()
                },
                "total_found": total_found,
                "query_used": query
            },
            metadata={
                "tool_id": "pubmed_search",
                "query": query,
                "results_count": len(canonical_articles),
                "timestamp": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        print(f"Exception in pubmed_search handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return ToolHandlerResult(
            success=False,
            errors=[f"PubMed search failed: {str(e)}"],
            outputs={},
            metadata={
                "tool_id": "pubmed_search",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )


# ===== Tool 3: PubMed Feature Extractor =====

async def handle_pubmed_extract_features(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Extract structured features from PubMed articles using LLM analysis.
    
    Args:
        input: ToolHandlerInput containing:
            - articles: List of CanonicalPubMedArticle objects
            - extraction_schema: Schema defining what features to extract
            - instructions: Custom instructions for extraction
            - include_metadata: Whether to include extraction metadata
            
    Returns:
        ToolHandlerResult containing:
            - extractions: List of CanonicalPubMedExtraction objects
            - extraction_summary: Summary of extraction process
    """
    # Extract parameters
    articles = input.params.get("articles", [])
    extraction_schema = input.params.get("extraction_schema", {})
    instructions = input.params.get("instructions", "")
    include_metadata = input.params.get("include_metadata", True)
    
    if not articles:
        raise ValueError("articles list is required")
    
    if not extraction_schema:
        # Default extraction schema
        extraction_schema = {
            "study_type": "Type of study (e.g., clinical trial, observational, review)",
            "sample_size": "Number of participants or samples",
            "methodology": "Brief description of methodology used",
            "key_findings": "Main findings or conclusions",
            "clinical_relevance": "Clinical relevance score (1-5)",
            "innovation_score": "Innovation/novelty score (1-5)",
            "quality_indicators": "Quality indicators (e.g., randomized, blinded, peer-reviewed)"
        }
    
    # Use BasePromptCaller to extract features with dynamic schema
    from pydantic import BaseModel, Field, create_model
    
    # Create dynamic response model based on extraction schema
    field_definitions = {}
    for field_name, field_description in extraction_schema.items():
        field_definitions[field_name] = (str, Field(description=field_description))
    
    DynamicExtractionModel = create_model('DynamicExtractionModel', **field_definitions)
    
    system_message = """You are a research analysis expert. Extract specific features from academic articles based on the provided schema.
    
    Analyze the article and extract the requested information according to the schema definitions.
    Return structured data that matches the schema format exactly.
    
    Article Title: {title}
    Abstract: {abstract}
    Authors: {authors}
    Journal: {journal}
    
    Instructions: {instructions}
    
    Please extract the requested features from this article."""
    
    prompt_caller = BasePromptCaller(
        response_model=DynamicExtractionModel,
        system_message=system_message
    )
    
    extractions = []
    
    for article in articles:
        try:
            result = await prompt_caller.invoke(
                messages=[],
                title=article.get('title', 'N/A'),
                abstract=article.get('abstract', 'N/A'),
                authors=', '.join(article.get('authors', [])) if article.get('authors') else 'N/A',
                journal=article.get('journal', 'N/A'),
                instructions=instructions
            )
            
            # Convert result to dict
            extracted_data = result.model_dump()
            
            # Create canonical extraction object
            extraction_metadata = {
                "extraction_timestamp": datetime.now().isoformat(),
                "schema_used": extraction_schema,
                "llm_model": "gpt-4o",
                "instructions": instructions
            } if include_metadata else None
            
            canonical_extraction = CanonicalPubMedExtraction(
                item_id=article.get('pmid', f"unknown_{len(extractions)}"),
                original_article=CanonicalPubMedArticle(**article),
                extraction=extracted_data,
                extraction_metadata=extraction_metadata
            )
            
            extractions.append(canonical_extraction)
            
        except Exception as e:
            # Create failed extraction record
            failed_extraction = CanonicalPubMedExtraction(
                item_id=article.get('pmid', f"failed_{len(extractions)}"),
                original_article=CanonicalPubMedArticle(**article),
                extraction={"error": f"Extraction failed: {str(e)}"},
                extraction_metadata={"error": str(e), "timestamp": datetime.now().isoformat()}
            )
            extractions.append(failed_extraction)
    
    return ToolHandlerResult(
        success=True,
        outputs={
            "extractions": extractions,
            "extraction_summary": {
                "total_articles": len(articles),
                "successful_extractions": len([e for e in extractions if "error" not in e.extraction]),
                "failed_extractions": len([e for e in extractions if "error" in e.extraction]),
                "schema_used": extraction_schema,
                "timestamp": datetime.now().isoformat()
            }
        },
        canonical_outputs={
            "extractions": create_typed_response(extractions, "pubmed_extraction", is_array=True)
        },
        metadata={
            "tool_id": "pubmed_extract_features",
            "articles_processed": len(articles),
            "extractions_created": len(extractions),
            "timestamp": datetime.now().isoformat()
        }
    )


# ===== Tool 4: PubMed Article Scorer =====

async def handle_pubmed_score_articles(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Score PubMed articles based on extracted features and custom criteria.
    
    Args:
        input: ToolHandlerInput containing:
            - extractions: List of CanonicalPubMedExtraction objects
            - scoring_criteria: Dict defining how to score different features
            - weights: Dict of weights for different score components
            - normalize_scores: Whether to normalize scores to 0-100 range
            
    Returns:
        ToolHandlerResult containing:
            - scored_articles: List of CanonicalScoredArticle objects
            - scoring_summary: Summary of scoring process
    """
    # Extract parameters
    extractions = input.params.get("extractions", [])
    scoring_criteria = input.params.get("scoring_criteria", {})
    weights = input.params.get("weights", {})
    normalize_scores = input.params.get("normalize_scores", True)
    
    if not extractions:
        raise ValueError("extractions list is required")
    
    # Default scoring criteria
    if not scoring_criteria:
        scoring_criteria = {
            "clinical_relevance": {"weight": 0.3, "max_score": 5},
            "innovation_score": {"weight": 0.25, "max_score": 5},
            "study_quality": {"weight": 0.2, "max_score": 5},
            "sample_size": {"weight": 0.15, "max_score": 5, "thresholds": {"high": 1000, "medium": 100, "low": 10}},
            "recency": {"weight": 0.1, "max_score": 5}
        }
    
    scored_articles = []
    all_scores = []
    
    for extraction in extractions:
        try:
            score_breakdown = {}
            total_score = 0.0
            
            # Extract features for scoring
            features = extraction.get('extraction', {}) if isinstance(extraction, dict) else extraction.extraction
            article = extraction.get('original_article', {}) if isinstance(extraction, dict) else extraction.original_article
            
            # Score each component
            for criterion, config in scoring_criteria.items():
                component_score = 0.0
                weight = config.get("weight", 0.1)
                max_score = config.get("max_score", 5)
                
                if criterion == "clinical_relevance":
                    # Look for clinical relevance in extracted features
                    relevance = features.get("clinical_relevance", "Not specified")
                    if isinstance(relevance, (int, float)):
                        component_score = float(relevance)
                    elif isinstance(relevance, str) and relevance.isdigit():
                        component_score = float(relevance)
                    else:
                        component_score = 3.0  # Default middle score
                
                elif criterion == "innovation_score":
                    # Look for innovation score in extracted features
                    innovation = features.get("innovation_score", "Not specified")
                    if isinstance(innovation, (int, float)):
                        component_score = float(innovation)
                    elif isinstance(innovation, str) and innovation.isdigit():
                        component_score = float(innovation)
                    else:
                        component_score = 3.0  # Default middle score
                
                elif criterion == "study_quality":
                    # Assess study quality based on methodology and quality indicators
                    quality_indicators = features.get("quality_indicators", "")
                    methodology = features.get("methodology", "")
                    
                    quality_score = 3.0  # Base score
                    if "randomized" in quality_indicators.lower():
                        quality_score += 0.5
                    if "blinded" in quality_indicators.lower():
                        quality_score += 0.5
                    if "controlled" in quality_indicators.lower():
                        quality_score += 0.5
                    if "peer-reviewed" in quality_indicators.lower():
                        quality_score += 0.5
                    
                    component_score = min(quality_score, max_score)
                
                elif criterion == "sample_size":
                    # Score based on sample size
                    sample_size_str = features.get("sample_size", "0")
                    try:
                        # Extract number from sample size string
                        import re
                        numbers = re.findall(r'\d+', str(sample_size_str))
                        sample_size = int(numbers[0]) if numbers else 0
                        
                        thresholds = config.get("thresholds", {"high": 1000, "medium": 100, "low": 10})
                        if sample_size >= thresholds["high"]:
                            component_score = 5.0
                        elif sample_size >= thresholds["medium"]:
                            component_score = 4.0
                        elif sample_size >= thresholds["low"]:
                            component_score = 3.0
                        else:
                            component_score = 2.0
                    except:
                        component_score = 2.0  # Default for unknown sample size
                
                elif criterion == "recency":
                    # Score based on publication recency
                    pub_date = article.get("publication_date", "") if isinstance(article, dict) else getattr(article, 'publication_date', '')
                    try:
                        if pub_date:
                            from datetime import datetime
                            pub_year = int(pub_date.split('-')[0])
                            current_year = datetime.now().year
                            years_old = current_year - pub_year
                            
                            if years_old <= 1:
                                component_score = 5.0
                            elif years_old <= 3:
                                component_score = 4.0
                            elif years_old <= 5:
                                component_score = 3.0
                            elif years_old <= 10:
                                component_score = 2.0
                            else:
                                component_score = 1.0
                        else:
                            component_score = 2.0  # Default for unknown date
                    except:
                        component_score = 2.0
                
                # Apply weight and add to total
                weighted_score = component_score * weight
                score_breakdown[criterion] = {
                    "raw_score": component_score,
                    "weight": weight,
                    "weighted_score": weighted_score
                }
                total_score += weighted_score
            
            all_scores.append(total_score)
            
            # Create scored article
            scored_article = CanonicalScoredArticle(
                article_with_features=CanonicalPubMedExtraction(**extraction) if isinstance(extraction, dict) else extraction,
                total_score=total_score,
                score_breakdown=score_breakdown,
                scoring_metadata={
                    "scoring_criteria_used": scoring_criteria,
                    "timestamp": datetime.now().isoformat(),
                    "normalization_applied": normalize_scores
                }
            )
            
            scored_articles.append(scored_article)
            
        except Exception as e:
            # Create failed scoring record
            failed_scored = CanonicalScoredArticle(
                article_with_features=CanonicalPubMedExtraction(**extraction) if isinstance(extraction, dict) else extraction,
                total_score=0.0,
                score_breakdown={"error": f"Scoring failed: {str(e)}"},
                scoring_metadata={"error": str(e), "timestamp": datetime.now().isoformat()}
            )
            scored_articles.append(failed_scored)
    
    # Calculate percentile ranks
    if all_scores and len(all_scores) > 1:
        import statistics
        for i, scored_article in enumerate(scored_articles):
            if hasattr(scored_article, 'total_score') and scored_article.total_score > 0:
                # Calculate percentile rank
                score = scored_article.total_score
                lower_scores = len([s for s in all_scores if s < score])
                percentile = (lower_scores / len(all_scores)) * 100
                scored_article.percentile_rank = percentile
    
    # Normalize scores if requested
    if normalize_scores and all_scores:
        max_score = max(all_scores)
        min_score = min(all_scores)
        score_range = max_score - min_score if max_score > min_score else 1
        
        for scored_article in scored_articles:
            if hasattr(scored_article, 'total_score') and scored_article.total_score > 0:
                normalized_score = ((scored_article.total_score - min_score) / score_range) * 100
                scored_article.total_score = normalized_score
    
    return ToolHandlerResult(
        success=True,
        outputs={
            "scored_articles": scored_articles,
            "scoring_summary": {
                "total_articles": len(extractions),
                "successfully_scored": len([a for a in scored_articles if not isinstance(a.score_breakdown.get("error"), str)]),
                "failed_scoring": len([a for a in scored_articles if isinstance(a.score_breakdown.get("error"), str)]),
                "score_statistics": {
                    "mean_score": statistics.mean(all_scores) if all_scores else 0,
                    "median_score": statistics.median(all_scores) if all_scores else 0,
                    "max_score": max(all_scores) if all_scores else 0,
                    "min_score": min(all_scores) if all_scores else 0
                } if all_scores else {},
                "criteria_used": scoring_criteria,
                "timestamp": datetime.now().isoformat()
            }
        },
        canonical_outputs={
            "scored_articles": create_typed_response(scored_articles, "scored_article", is_array=True)
        },
        metadata={
            "tool_id": "pubmed_score_articles",
            "articles_scored": len(scored_articles),
            "timestamp": datetime.now().isoformat()
        }
    )


# ===== Tool 5: PubMed Filter and Ranker =====

async def handle_pubmed_filter_rank(input: ToolHandlerInput) -> ToolHandlerResult:
    """
    Filter and rank scored PubMed articles based on score thresholds and criteria.
    
    Args:
        input: ToolHandlerInput containing:
            - scored_articles: List of CanonicalScoredArticle objects
            - min_score_threshold: Minimum score threshold for inclusion
            - max_results: Maximum number of results to return
            - sort_by: Field to sort by (score, percentile, date)
            - sort_order: Sort order (desc, asc)
            - additional_filters: Additional filtering criteria
            
    Returns:
        ToolHandlerResult containing:
            - filtered_articles: List of filtered and ranked articles
            - filter_summary: Summary of filtering process
    """
    # Extract parameters
    scored_articles = input.params.get("scored_articles", [])
    min_score_threshold = input.params.get("min_score_threshold", 0.0)
    max_results = input.params.get("max_results", 20)
    sort_by = input.params.get("sort_by", "total_score")
    sort_order = input.params.get("sort_order", "desc")
    additional_filters = input.params.get("additional_filters", {})
    
    if not scored_articles:
        raise ValueError("scored_articles list is required")
    
    try:
        # Start with all articles
        filtered_articles = list(scored_articles)
        
        # Apply score threshold filter
        filtered_articles = [
            article for article in filtered_articles 
            if hasattr(article, 'total_score') and article.total_score >= min_score_threshold
        ]
        
        # Apply additional filters
        for filter_key, filter_value in additional_filters.items():
            if filter_key == "journal_filter":
                # Filter by journal names
                allowed_journals = filter_value if isinstance(filter_value, list) else [filter_value]
                filtered_articles = [
                    article for article in filtered_articles
                    if hasattr(article, 'article_with_features') and 
                       hasattr(article.article_with_features, 'original_article') and
                       getattr(article.article_with_features.original_article, 'journal', '') in allowed_journals
                ]
            
            elif filter_key == "author_filter":
                # Filter by author names
                target_authors = filter_value if isinstance(filter_value, list) else [filter_value]
                filtered_articles = [
                    article for article in filtered_articles
                    if hasattr(article, 'article_with_features') and 
                       hasattr(article.article_with_features, 'original_article') and
                       any(author in getattr(article.article_with_features.original_article, 'authors', []) 
                           for author in target_authors)
                ]
            
            elif filter_key == "year_range":
                # Filter by publication year range
                start_year, end_year = filter_value.get("start", 1900), filter_value.get("end", 2030)
                filtered_articles = [
                    article for article in filtered_articles
                    if hasattr(article, 'article_with_features') and 
                       hasattr(article.article_with_features, 'original_article')
                ]
                # Implementation would need to parse publication dates
            
            elif filter_key == "study_type":
                # Filter by study type
                allowed_types = filter_value if isinstance(filter_value, list) else [filter_value]
                filtered_articles = [
                    article for article in filtered_articles
                    if hasattr(article, 'article_with_features') and 
                       hasattr(article.article_with_features, 'extraction') and
                       article.article_with_features.extraction.get('study_type', '').lower() in [t.lower() for t in allowed_types]
                ]
        
        # Sort articles
        if sort_by == "total_score":
            filtered_articles.sort(
                key=lambda x: getattr(x, 'total_score', 0), 
                reverse=(sort_order == "desc")
            )
        elif sort_by == "percentile":
            filtered_articles.sort(
                key=lambda x: getattr(x, 'percentile_rank', 0), 
                reverse=(sort_order == "desc")
            )
        elif sort_by == "publication_date":
            filtered_articles.sort(
                key=lambda x: getattr(getattr(getattr(x, 'article_with_features', None), 'original_article', None), 'publication_date', '1900-01-01') or '1900-01-01',
                reverse=(sort_order == "desc")
            )
        
        # Limit results
        filtered_articles = filtered_articles[:max_results]
        
        # Create summary
        filter_summary = {
            "input_articles": len(scored_articles),
            "after_score_filter": len([a for a in scored_articles if hasattr(a, 'total_score') and a.total_score >= min_score_threshold]),
            "final_results": len(filtered_articles),
            "filters_applied": {
                "min_score_threshold": min_score_threshold,
                "additional_filters": additional_filters,
                "sort_by": sort_by,
                "sort_order": sort_order,
                "max_results": max_results
            },
            "score_range": {
                "highest": max([getattr(a, 'total_score', 0) for a in filtered_articles]) if filtered_articles else 0,
                "lowest": min([getattr(a, 'total_score', 0) for a in filtered_articles]) if filtered_articles else 0
            },
            "timestamp": datetime.now().isoformat()
        }
        
        return ToolHandlerResult(
            success=True,
            outputs={
                "filtered_articles": filtered_articles,
                "filter_summary": filter_summary
            },
            canonical_outputs={
                "filtered_articles": create_typed_response(filtered_articles, "scored_article", is_array=True)
            },
            metadata={
                "tool_id": "pubmed_filter_rank",
                "input_count": len(scored_articles),
                "output_count": len(filtered_articles),
                "timestamp": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        return ToolHandlerResult(
            success=False,
            errors=[f"Filtering and ranking failed: {str(e)}"],
            outputs={},
            metadata={
                "tool_id": "pubmed_filter_rank",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )


# ===== Register all handlers =====

# Register the handlers with the tool registry
register_tool_handler("pubmed_generate_query", handle_pubmed_generate_query)
register_tool_handler("pubmed_search", handle_pubmed_search)
register_tool_handler("pubmed_extract_features", handle_pubmed_extract_features)
register_tool_handler("pubmed_score_articles", handle_pubmed_score_articles)
register_tool_handler("pubmed_filter_rank", handle_pubmed_filter_rank)