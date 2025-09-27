# PubMed Tool Set Specification

## Overview

This specification defines a complete tool set for PubMed research workflow including search, feature extraction, scoring, and ranking. The tools are designed to work together in a pipeline to help users discover, analyze, and prioritize academic literature.

## Tool Set Architecture

### Pipeline Flow
```
Query Generation → PubMed Search → Feature Extraction → Article Scoring → Filter & Rank → Results
```

### Tool Dependencies
- **pubmed_generate_query**: Standalone (uses LLM for query optimization)
- **pubmed_search**: Can use generated queries or standalone (uses NCBI E-utilities API)
- **pubmed_extract_features**: Depends on pubmed_search output
- **pubmed_score_articles**: Depends on extraction output  
- **pubmed_filter_rank**: Depends on scoring output

## Tool Definitions

### 1. PubMed Query Generator Tool (`pubmed_generate_query`)

**Purpose**: Generate optimized PubMed search queries using LLM assistance based on research goals and requirements

**Category**: `data_processing`

**Parameters**:
- `research_goal` (string, required): High-level description of research objective
  - Example: `"Find recent studies on machine learning applications in medical diagnosis"`
- `domain` (string, optional): Research domain for context
  - Options: `"medical"`, `"technology"`, `"biology"`, `"psychology"`, `"general"`
- `time_frame` (string, optional): Desired publication timeframe
  - Options: `"last_year"`, `"last_5_years"`, `"last_10_years"`, `"all_time"`
- `study_types` (array[string], optional): Preferred study types
  - Options: `["Clinical Trial", "Review", "Meta-Analysis", "Case Study", "Observational Study"]`
- `keywords` (array[string], optional): Required keywords to include
- `exclude_terms` (array[string], optional): Terms to exclude from results
- `max_queries` (number, optional, default: 3): Number of alternative queries to generate
- `query_strategy` (string, optional, default: "comprehensive"): Query generation approach
  - `"comprehensive"`: Broad search with multiple synonyms
  - `"focused"`: Narrow, specific search
  - `"exploratory"`: Diverse queries for discovery

**Outputs**:
- `generated_queries` (array[object]): Generated PubMed query options
  - Each contains: `query_string`, `rationale`, `expected_scope`, `confidence_score`
- `mesh_terms` (array[string]): Relevant MeSH terms identified
- `field_tags` (array[string]): Recommended PubMed field tags to use
- `query_metadata` (object): Generation process information
  - `domain_context` (string): Domain-specific context applied
  - `synonyms_used` (array[string]): Alternative terms considered
  - `query_complexity` (string): Complexity level of generated queries

**Query Generation Strategy**:
1. **Domain Analysis**: Identify field-specific terminology and common search patterns
2. **MeSH Term Mapping**: Convert natural language to appropriate MeSH headings
3. **Synonym Expansion**: Include relevant alternative terms and abbreviations
4. **Field Tag Optimization**: Use appropriate PubMed field tags ([Title/Abstract], [MeSH Terms], etc.)
5. **Boolean Logic**: Construct optimal AND/OR/NOT combinations
6. **Validation**: Check query syntax and estimate result scope

**Example Output**:
```json
{
  "generated_queries": [
    {
      "query_string": "(\"machine learning\"[Title/Abstract] OR \"artificial intelligence\"[Title/Abstract]) AND (\"medical diagnosis\"[Title/Abstract] OR \"diagnostic imaging\"[MeSH Terms]) AND 2020:2024[PDAT]",
      "rationale": "Comprehensive search combining ML/AI terms with medical diagnosis, focused on recent publications",
      "expected_scope": "500-2000 results",
      "confidence_score": 0.92
    },
    {
      "query_string": "\"deep learning\"[Title/Abstract] AND (\"radiolog*\"[Title/Abstract] OR \"patholog*\"[Title/Abstract]) AND \"diagnosis\"[Title/Abstract] AND 2022:2024[PDAT]",
      "rationale": "Focused on deep learning in radiology/pathology diagnosis with very recent papers",
      "expected_scope": "100-500 results", 
      "confidence_score": 0.85
    }
  ],
  "mesh_terms": ["Artificial Intelligence", "Diagnosis", "Machine Learning", "Radiologic Image Interpretation"],
  "field_tags": ["Title/Abstract", "MeSH Terms", "PDAT"],
  "query_metadata": {
    "domain_context": "medical technology intersection",
    "synonyms_used": ["AI", "ML", "deep learning", "neural networks"],
    "query_complexity": "moderate"
  }
}
```

### 2. PubMed Search Tool (`pubmed_search`)

**Purpose**: Search PubMed database using NCBI's E-utilities API to retrieve academic articles

**Category**: `data_retrieval`

**Parameters**:
- `search_query` (string, required): PubMed search query using standard syntax
  - Example: `"machine learning[Title/Abstract] AND 2024[PDAT]"`
- `max_results` (number, optional, default: 20): Maximum articles to return
- `sort_order` (string, optional, default: "relevance"): Sort by relevance, date, author
- `date_range` (object, optional): Filter by publication date
  - `start_date` (string): Start date in YYYY/MM/DD format
  - `end_date` (string): End date in YYYY/MM/DD format
- `article_types` (array[string], optional): Filter by article types (Review, Clinical Trial, etc.)
- `fields` (array[string], optional): Additional fields to retrieve beyond standard set

**Outputs**:
- `articles` (array[CanonicalPubMedArticle]): Retrieved articles with full metadata
- `total_results` (number): Total articles found (may exceed returned count)
- `search_metadata` (object): Query performance and API response info
  - `query_translation` (string): How PubMed interpreted the query
  - `search_time_ms` (number): API response time
  - `api_version` (string): NCBI API version used

**Resource Dependencies**:
- NCBI E-utilities API (no authentication required for basic usage)
- Rate limiting: 3 requests/second without API key, 10/second with API key

**Error Scenarios**:
- Invalid query syntax
- API rate limiting
- Network connectivity issues
- No results found

### 2. PubMed Feature Extraction Tool (`pubmed_extract_features`)

**Purpose**: Extract structured information from PubMed abstracts using LLM processing with configurable extraction schemas

**Category**: `data_processing`

**Parameters**:
- `articles` (array[CanonicalPubMedArticle], required): Articles to process from search
- `extraction_schema` (object, required): JSON schema defining fields to extract
  - Example: `{"methodology": "string", "sample_size": "number", "key_findings": "array[string]"}`
- `extraction_instructions` (string, required): Detailed prompt for LLM extraction
  - Should specify field definitions, formatting requirements, handling of missing data
- `batch_size` (number, optional, default: 5): Articles processed per LLM call
- `validation_mode` (string, optional, default: "strict"): How to handle extraction errors
  - `"strict"`: Fail on any extraction error
  - `"partial"`: Return partial results, log errors
  - `"best_effort"`: Always return something, even if quality is poor

**Outputs**:
- `extractions` (array[CanonicalPubMedExtraction]): Extraction results
  - Each contains: `item_id`, `original_article`, `extraction`, `extraction_metadata`
- `extraction_metadata` (object): Processing statistics
  - `total_processed` (number): Articles attempted
  - `successful_extractions` (number): Clean extractions
  - `partial_extractions` (number): Extractions with some missing fields
  - `failed_extractions` (number): Complete failures
  - `processing_time_ms` (number): Total processing time
  - `tokens_used` (number): LLM tokens consumed

**Implementation Notes**:
- Uses existing LLM service infrastructure
- Implements retry logic for failed extractions
- Validates extracted data against provided schema
- Preserves original article data alongside extractions

### 3. Article Scoring Tool (`pubmed_score_articles`)

**Purpose**: Score articles based on extracted features using configurable scoring functions and criteria

**Category**: `data_analysis`

**Parameters**:
- `articles_with_features` (array[CanonicalPubMedExtraction], required): Articles with extracted features
- `scoring_criteria` (object, required): Scoring configuration
  - `weights` (object): Weight for each extracted feature (0.0-1.0)
  - `scoring_functions` (object): How to score each feature type
  - `normalization_method` (string): How to normalize scores ("min_max", "z_score", "none")
- `score_function` (string, optional, default: "weighted_sum"): Overall scoring algorithm
  - `"weighted_sum"`: Simple weighted sum of feature scores
  - `"composite"`: Complex multi-factor scoring
  - `"ml_model"`: Use trained model (if available)
- `include_percentiles` (boolean, optional, default: true): Calculate percentile rankings

**Scoring Criteria Example**:
```json
{
  "weights": {
    "methodology_quality": 0.3,
    "sample_size": 0.2,
    "novelty": 0.25,
    "relevance": 0.25
  },
  "scoring_functions": {
    "methodology_quality": "categorical_score",
    "sample_size": "log_scale",
    "novelty": "text_similarity",
    "relevance": "keyword_match"
  },
  "normalization_method": "min_max"
}
```

**Outputs**:
- `scored_articles` (array[CanonicalScoredArticle]): Articles with calculated scores
  - Each contains: `article_with_features`, `total_score`, `score_breakdown`, `percentile_rank`, `scoring_metadata`
- `scoring_metadata` (object): Scoring statistics
  - `score_distribution` (object): Min, max, mean, std dev of scores
  - `feature_correlations` (object): Correlation matrix between features
  - `scoring_method_used` (string): Which algorithm was applied

### 4. Article Filter and Rank Tool (`pubmed_filter_rank`)

**Purpose**: Filter and rank scored articles based on thresholds and additional criteria to produce final result set

**Category**: `data_analysis`

**Parameters**:
- `scored_articles` (array[CanonicalScoredArticle], required): Articles with scores
- `min_score_threshold` (number, optional): Minimum score to include (0.0-1.0)
- `max_results` (number, optional, default: 10): Maximum articles to return
- `ranking_criteria` (object, optional): Additional ranking factors
  - `boost_recent` (boolean): Boost recently published articles
  - `boost_high_impact` (boolean): Boost articles from high-impact journals
  - `prefer_review_articles` (boolean): Prefer review/meta-analysis articles
- `filters` (object, optional): Additional filter criteria
  - `min_citation_count` (number): Minimum citations required
  - `journal_whitelist` (array[string]): Only include these journals
  - `exclude_preprints` (boolean): Exclude preprint articles
- `output_format` (string, optional, default: "detailed"): Level of detail in results
  - `"summary"`: Basic article info + scores only
  - `"detailed"`: Full article data + features + scores
  - `"analysis_ready"`: Optimized for further analysis

**Outputs**:
- `ranked_articles` (array[CanonicalScoredArticle]): Final filtered and ranked articles
- `filter_metadata` (object): Filtering statistics
  - `initial_count` (number): Articles before filtering
  - `filtered_count` (number): Articles after filtering  
  - `filters_applied` (array[string]): Which filters were used
  - `ranking_method` (string): Ranking algorithm used

## Implementation Plan

### Phase 1: Core Infrastructure
1. **Add canonical types** to `schemas/canonical_types.py`:
   - `CanonicalPubMedQuery` (for query generator output)
   - `CanonicalPubMedExtraction`
   - `CanonicalScoredArticle`

2. **Create PubMed service** in `services/pubmed_service.py`:
   - NCBI E-utilities API integration
   - Rate limiting and error handling
   - Response parsing and validation

### Phase 2: Tool Implementations
1. **Tool definitions** in `tools/tools.json`:
   - Add all five tool configurations with full parameter/output schemas
   - Include comprehensive stub configurations for development

2. **Tool handlers** in `tools/handlers/pubmed_handlers.py`:
   - Implement all five tool handlers
   - Use async/await patterns
   - Proper error handling and validation

### Phase 3: Integration & Testing
1. **Tool registration** in `tools/handlers/__init__.py`:
   - Import pubmed_handlers to register tools

2. **Integration testing**:
   - Test full pipeline with real PubMed data
   - Validate scoring and ranking accuracy
   - Performance optimization

## Usage Examples

### Complete Pipeline with Query Generation
```python
# Generate optimized queries
query_result = await execute_tool("pubmed_generate_query", {
    "research_goal": "Find recent studies on machine learning applications in medical diagnosis",
    "domain": "medical",
    "time_frame": "last_year",
    "study_types": ["Clinical Trial", "Review"],
    "max_queries": 3
})

# Use the best generated query
best_query = query_result["generated_queries"][0]["query_string"]
search_result = await execute_tool("pubmed_search", {
    "search_query": best_query,
    "max_results": 50
})

# Extract key features
extraction_result = await execute_tool("pubmed_extract_features", {
    "articles": search_result["articles"],
    "extraction_schema": {
        "methodology": "string",
        "dataset_size": "number", 
        "key_contribution": "string",
        "limitations": "array[string]"
    },
    "extraction_instructions": """
    Extract the following from each abstract:
    - methodology: The main approach/algorithm used
    - dataset_size: Number of samples/data points if mentioned
    - key_contribution: Main novelty or contribution
    - limitations: Any limitations mentioned by authors
    """
})
```

### Advanced Scoring and Filtering
```python
# Score based on research quality factors
scoring_result = await execute_tool("pubmed_score_articles", {
    "articles_with_features": extraction_result["extractions"],
    "scoring_criteria": {
        "weights": {
            "methodology": 0.4,
            "dataset_size": 0.2,
            "novelty": 0.4
        },
        "scoring_functions": {
            "methodology": "categorical_score",
            "dataset_size": "log_scale", 
            "novelty": "text_quality"
        }
    }
})

# Filter and rank for final results
final_result = await execute_tool("pubmed_filter_rank", {
    "scored_articles": scoring_result["scored_articles"],
    "min_score_threshold": 0.7,
    "max_results": 10,
    "ranking_criteria": {
        "boost_recent": true,
        "boost_high_impact": true
    }
})
```

### Query Generation Examples

#### Exploratory Research
```python
# Generate diverse queries for discovery
query_result = await execute_tool("pubmed_generate_query", {
    "research_goal": "Explore connections between gut microbiome and mental health",
    "domain": "medical",
    "query_strategy": "exploratory",
    "max_queries": 5
})

# Try multiple approaches
for query_option in query_result["generated_queries"]:
    print(f"Query: {query_option['query_string']}")
    print(f"Rationale: {query_option['rationale']}")
    print(f"Expected scope: {query_option['expected_scope']}")
```

#### Focused Technical Search
```python
# Generate narrow, specific queries
query_result = await execute_tool("pubmed_generate_query", {
    "research_goal": "Find validation studies for BERT-based clinical text classification models",
    "domain": "technology", 
    "time_frame": "last_5_years",
    "keywords": ["BERT", "clinical text", "validation"],
    "exclude_terms": ["review", "opinion"],
    "query_strategy": "focused"
})
```

#### Multi-Domain Research
```python
# Generate queries spanning multiple research areas
query_result = await execute_tool("pubmed_generate_query", {
    "research_goal": "Investigate AI ethics in healthcare applications",
    "domain": "general",
    "keywords": ["artificial intelligence", "ethics", "healthcare"],
    "study_types": ["Review", "Meta-Analysis"],
    "query_strategy": "comprehensive"
})
```

### Medical Research Template
```json
{
  "extraction_schema": {
    "study_type": "string",
    "participant_count": "number",
    "primary_outcome": "string",
    "statistical_significance": "boolean",
    "effect_size": "number"
  },
  "scoring_criteria": {
    "weights": {
      "study_type": 0.3,
      "participant_count": 0.25,
      "statistical_significance": 0.25,
      "effect_size": 0.2
    }
  }
}
```

### Technology Research Template  
```json
{
  "extraction_schema": {
    "technology_domain": "string",
    "benchmarks_used": "array[string]",
    "performance_improvement": "number",
    "computational_cost": "string",
    "code_availability": "boolean"
  },
  "scoring_criteria": {
    "weights": {
      "performance_improvement": 0.4,
      "benchmarks_used": 0.3,
      "code_availability": 0.3
    }
  }
}
```

## API Rate Limits & Performance

- **NCBI E-utilities**: 3 req/sec (no key), 10 req/sec (with key)
- **LLM Processing**: Depends on provider, ~1000 articles/hour estimated
- **Recommended Batch Sizes**: 
  - Search: 50-100 articles per query
  - Extraction: 5-10 articles per LLM call
  - Scoring: No limit (local processing)
  - Filtering: No limit (local processing)

## Error Handling Strategy

1. **Graceful Degradation**: Tools continue with partial results when possible
2. **Retry Logic**: Automatic retries for transient failures (network, rate limits)
3. **Validation**: Schema validation at each step with clear error messages
4. **Fallback Options**: Alternative data sources or simplified processing when primary methods fail
5. **User Feedback**: Clear progress indicators and error explanations