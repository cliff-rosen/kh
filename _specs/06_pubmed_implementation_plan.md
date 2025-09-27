# PubMed Tool Set Implementation Plan

## Overview

This document provides a complete step-by-step implementation plan for the PubMed research tool set, including all required code files, dependencies, and integration points.

## Implementation Phases

### Phase 1: Core Infrastructure Setup

#### 1.1 Add Canonical Types

**File**: `backend/schemas/canonical_types.py`

Add new canonical types for PubMed pipeline:

```python
class CanonicalPubMedQuery(BaseModel):
    """Canonical PubMed Query schema - for query generator output"""
    query_string: str = Field(description="PubMed search query string")
    rationale: str = Field(description="Explanation of query construction")
    expected_scope: str = Field(description="Estimated result count range")
    confidence_score: float = Field(description="Confidence in query quality (0-1)")
    mesh_terms: List[str] = Field(default=[], description="Relevant MeSH terms")
    field_tags: List[str] = Field(default=[], description="PubMed field tags used")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional query metadata")

class CanonicalPubMedExtraction(BaseModel):
    """Canonical PubMed Extraction schema - for extracted features from articles"""
    item_id: str = Field(description="Unique identifier for the original article")
    original_article: CanonicalPubMedArticle = Field(description="Original PubMed article")
    extraction: Dict[str, Any] = Field(description="Extracted features/data fields")
    extraction_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Extraction processing metadata")

class CanonicalScoredArticle(BaseModel):
    """Canonical Scored Article schema - for scored PubMed articles"""
    article_with_features: CanonicalPubMedExtraction = Field(description="Article with extracted features")
    total_score: float = Field(description="Total calculated score")
    score_breakdown: Dict[str, float] = Field(description="Breakdown of score components")
    percentile_rank: Optional[float] = Field(default=None, description="Percentile rank among all scored articles")
    scoring_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Scoring methodology metadata")
```

**Update canonical type registry**:
```python
models = {
    # ... existing models ...
    'pubmed_query': CanonicalPubMedQuery,
    'pubmed_extraction': CanonicalPubMedExtraction,
    'scored_article': CanonicalScoredArticle
}
```

#### 1.2 Create PubMed Service

**File**: `backend/services/pubmed_service.py`

```python
"""
PubMed Service for NCBI E-utilities API Integration

Handles all interactions with NCBI's E-utilities API including:
- Search operations (esearch)
- Article retrieval (efetch)
- Rate limiting and error handling
- Response parsing and validation
"""

import asyncio
import aiohttp
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import logging
from urllib.parse import urlencode

from config.settings import get_settings
from schemas.canonical_types import CanonicalPubMedArticle

logger = logging.getLogger(__name__)

class PubMedService:
    """Service for interacting with NCBI PubMed E-utilities API"""
    
    BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = getattr(self.settings, 'NCBI_API_KEY', None)
        self.rate_limit = 10 if self.api_key else 3  # requests per second
        self.last_request_time = datetime.now()
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def _rate_limit(self):
        """Enforce rate limiting"""
        now = datetime.now()
        time_since_last = (now - self.last_request_time).total_seconds()
        min_interval = 1.0 / self.rate_limit
        
        if time_since_last < min_interval:
            sleep_time = min_interval - time_since_last
            await asyncio.sleep(sleep_time)
        
        self.last_request_time = datetime.now()
    
    async def _make_request(self, endpoint: str, params: Dict[str, Any]) -> str:
        """Make HTTP request to NCBI API with rate limiting"""
        await self._rate_limit()
        
        # Add API key if available
        if self.api_key:
            params['api_key'] = self.api_key
        
        url = f"{self.BASE_URL}/{endpoint}"
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    raise Exception(f"NCBI API error: {response.status} - {await response.text()}")
        except Exception as e:
            logger.error(f"PubMed API request failed: {e}")
            raise
    
    async def search(
        self,
        query: str,
        max_results: int = 20,
        sort_order: str = "relevance",
        date_range: Optional[Dict[str, str]] = None,
        article_types: Optional[List[str]] = None
    ) -> Tuple[List[str], int, Dict[str, Any]]:
        """
        Search PubMed and return PMIDs
        
        Returns:
            Tuple of (pmid_list, total_results, search_metadata)
        """
        # Build search parameters
        params = {
            'db': 'pubmed',
            'term': query,
            'retmax': str(max_results),
            'retmode': 'xml',
            'usehistory': 'y'
        }
        
        # Add sort order
        if sort_order == "date":
            params['sort'] = 'pub_date'
        elif sort_order == "author":
            params['sort'] = 'first_author'
        elif sort_order == "journal":
            params['sort'] = 'journal'
        # Default is relevance (no sort param needed)
        
        # Add date range filter
        if date_range:
            start_date = date_range.get('start_date', '')
            end_date = date_range.get('end_date', '')
            if start_date or end_date:
                date_filter = f"({start_date}:{end_date}[PDAT])"
                params['term'] = f"{query} AND {date_filter}"
        
        # Add article type filter
        if article_types:
            type_filters = [f'"{article_type}"[Publication Type]' for article_type in article_types]
            type_filter = f"({' OR '.join(type_filters)})"
            params['term'] = f"{params['term']} AND {type_filter}"
        
        # Make search request
        response = await self._make_request('esearch.fcgi', params)
        
        # Parse XML response
        root = ET.fromstring(response)
        
        # Extract PMIDs
        pmids = []
        for id_elem in root.findall('.//Id'):
            pmids.append(id_elem.text)
        
        # Extract metadata
        count_elem = root.find('.//Count')
        total_results = int(count_elem.text) if count_elem is not None else 0
        
        query_translation_elem = root.find('.//QueryTranslation')
        query_translation = query_translation_elem.text if query_translation_elem is not None else query
        
        search_metadata = {
            'query_translation': query_translation,
            'search_time_ms': 0,  # Would need timing wrapper to measure
            'api_version': 'eutils/2.0'
        }
        
        return pmids, total_results, search_metadata
    
    async def fetch_articles(self, pmids: List[str]) -> List[CanonicalPubMedArticle]:
        """
        Fetch full article details for given PMIDs
        
        Args:
            pmids: List of PubMed IDs
            
        Returns:
            List of CanonicalPubMedArticle objects
        """
        if not pmids:
            return []
        
        # Build fetch parameters
        params = {
            'db': 'pubmed',
            'id': ','.join(pmids),
            'retmode': 'xml',
            'rettype': 'abstract'
        }
        
        # Make fetch request
        response = await self._make_request('efetch.fcgi', params)
        
        # Parse XML response
        return self._parse_articles_xml(response)
    
    def _parse_articles_xml(self, xml_content: str) -> List[CanonicalPubMedArticle]:
        """Parse XML response from efetch into CanonicalPubMedArticle objects"""
        articles = []
        
        try:
            root = ET.fromstring(xml_content)
            
            for article_elem in root.findall('.//PubmedArticle'):
                try:
                    article = self._parse_single_article(article_elem)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.warning(f"Failed to parse article: {e}")
                    continue
                    
        except ET.ParseError as e:
            logger.error(f"Failed to parse XML response: {e}")
            
        return articles
    
    def _parse_single_article(self, article_elem: ET.Element) -> Optional[CanonicalPubMedArticle]:
        """Parse a single PubmedArticle XML element"""
        try:
            # Extract PMID
            pmid_elem = article_elem.find('.//PMID')
            pmid = pmid_elem.text if pmid_elem is not None else ""
            
            # Extract title
            title_elem = article_elem.find('.//ArticleTitle')
            title = title_elem.text if title_elem is not None else ""
            
            # Extract abstract
            abstract_parts = []
            for abstract_elem in article_elem.findall('.//AbstractText'):
                text = abstract_elem.text or ""
                label = abstract_elem.get('Label', '')
                if label:
                    abstract_parts.append(f"{label}: {text}")
                else:
                    abstract_parts.append(text)
            abstract = " ".join(abstract_parts)
            
            # Extract authors
            authors = []
            for author_elem in article_elem.findall('.//Author'):
                last_name = author_elem.find('LastName')
                first_name = author_elem.find('ForeName')
                if last_name is not None:
                    name = last_name.text or ""
                    if first_name is not None:
                        name = f"{name}, {first_name.text or ''}"
                    authors.append(name)
            
            # Extract journal
            journal_elem = article_elem.find('.//Journal/Title')
            journal = journal_elem.text if journal_elem is not None else ""
            
            # Extract publication date
            pub_date_elem = article_elem.find('.//PubDate')
            publication_date = self._parse_pub_date(pub_date_elem)
            
            # Extract DOI
            doi_elem = article_elem.find('.//ELocationID[@EIdType="doi"]')
            doi = doi_elem.text if doi_elem is not None else None
            
            # Extract keywords
            keywords = []
            for keyword_elem in article_elem.findall('.//Keyword'):
                if keyword_elem.text:
                    keywords.append(keyword_elem.text)
            
            # Extract MeSH terms
            mesh_terms = []
            for mesh_elem in article_elem.findall('.//MeshHeading/DescriptorName'):
                if mesh_elem.text:
                    mesh_terms.append(mesh_elem.text)
            
            return CanonicalPubMedArticle(
                pmid=pmid,
                title=title,
                abstract=abstract,
                authors=authors,
                journal=journal,
                publication_date=publication_date,
                doi=doi,
                keywords=keywords,
                mesh_terms=mesh_terms,
                citation_count=None,  # Would need separate API call
                metadata={}
            )
            
        except Exception as e:
            logger.error(f"Error parsing article: {e}")
            return None
    
    def _parse_pub_date(self, pub_date_elem: Optional[ET.Element]) -> Optional[str]:
        """Parse publication date from PubDate XML element"""
        if pub_date_elem is None:
            return None
        
        try:
            year = pub_date_elem.find('Year')
            month = pub_date_elem.find('Month')
            day = pub_date_elem.find('Day')
            
            if year is not None:
                date_str = year.text
                if month is not None:
                    month_num = self._month_to_num(month.text)
                    date_str += f"-{month_num:02d}"
                    if day is not None:
                        date_str += f"-{int(day.text):02d}"
                return date_str
        except Exception:
            pass
        
        return None
    
    def _month_to_num(self, month_str: str) -> int:
        """Convert month name/abbreviation to number"""
        month_map = {
            'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
            'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12,
            'January': 1, 'February': 2, 'March': 3, 'April': 4,
            'June': 6, 'July': 7, 'August': 8, 'September': 9,
            'October': 10, 'November': 11, 'December': 12
        }
        return month_map.get(month_str, 1)


# Singleton instance
_pubmed_service = None

async def get_pubmed_service() -> PubMedService:
    """Get singleton PubMed service instance"""
    global _pubmed_service
    if _pubmed_service is None:
        _pubmed_service = PubMedService()
    return _pubmed_service
```

#### 1.3 Update Configuration

**File**: `backend/config/settings.py`

Add NCBI API configuration:

```python
# Add to existing settings class
NCBI_API_KEY: Optional[str] = None  # Optional API key for higher rate limits
NCBI_EMAIL: Optional[str] = None    # Required for API identification
NCBI_TOOL_NAME: str = "jam-bot"     # Tool name for API identification
```

**File**: `.env` (if using environment variables)

```bash
# NCBI Configuration (optional but recommended)
NCBI_API_KEY=your_api_key_here
NCBI_EMAIL=your_email@domain.com
```

### Phase 2: Tool Handler Implementation

#### 2.1 Create PubMed Tool Handlers

**File**: `backend/tools/handlers/pubmed_handlers.py`

```python
"""
PubMed Tool Handlers

Implements all PubMed research pipeline tools:
- pubmed_generate_query: Generate optimized search queries
- pubmed_search: Search PubMed database  
- pubmed_extract_features: Extract structured data from abstracts
- pubmed_score_articles: Score articles based on features
- pubmed_filter_rank: Filter and rank scored articles
"""

import asyncio
import json
import statistics
from typing import Dict, List, Any, Optional
import logging

from schemas.tool_handler_schema import ToolExecutionInput, ToolExecutionHandler, ToolExecutionResult
from tools.tool_registry import register_tool_handler
from tools.tool_stubbing import create_stub_decorator
from services.pubmed_service import get_pubmed_service
from services.llm.base import get_llm_service
from schemas.canonical_types import (
    CanonicalPubMedArticle,
    CanonicalPubMedQuery, 
    CanonicalPubMedExtraction,
    CanonicalScoredArticle
)

logger = logging.getLogger(__name__)

# ============================================================================
# Query Generation Tool
# ============================================================================

@create_stub_decorator("pubmed_generate_query")
async def handle_pubmed_generate_query(input: ToolExecutionInput) -> ToolExecutionResult:
    """Generate optimized PubMed search queries using LLM assistance"""
    
    try:
        # Extract parameters
        research_goal = input.params.get("research_goal")
        domain = input.params.get("domain", "general")
        time_frame = input.params.get("time_frame", "last_5_years")
        study_types = input.params.get("study_types", [])
        keywords = input.params.get("keywords", [])
        exclude_terms = input.params.get("exclude_terms", [])
        max_queries = input.params.get("max_queries", 3)
        query_strategy = input.params.get("query_strategy", "comprehensive")
        
        if not research_goal:
            raise ValueError("research_goal is required")
        
        # Build LLM prompt for query generation
        prompt = _build_query_generation_prompt(
            research_goal, domain, time_frame, study_types, 
            keywords, exclude_terms, max_queries, query_strategy
        )
        
        # Get LLM service and generate queries
        llm_service = await get_llm_service()
        response = await llm_service.generate_text(
            prompt=prompt,
            max_tokens=1500,
            temperature=0.7
        )
        
        # Parse LLM response into structured format
        query_data = _parse_query_generation_response(response)
        
        return ToolExecutionResult(
            outputs={
                "generated_queries": query_data["queries"],
                "mesh_terms": query_data["mesh_terms"],
                "field_tags": query_data["field_tags"],
                "query_metadata": query_data["metadata"]
            }
        )
        
    except Exception as e:
        logger.error(f"Query generation failed: {e}")
        return ToolExecutionResult(
            outputs={
                "generated_queries": [],
                "mesh_terms": [],
                "field_tags": [],
                "query_metadata": {"error": str(e)}
            }
        )

def _build_query_generation_prompt(
    research_goal: str, domain: str, time_frame: str, study_types: List[str],
    keywords: List[str], exclude_terms: List[str], max_queries: int, strategy: str
) -> str:
    """Build comprehensive prompt for LLM query generation"""
    
    prompt = f"""Generate optimized PubMed search queries for the following research goal:

RESEARCH GOAL: {research_goal}

PARAMETERS:
- Domain: {domain}
- Time frame: {time_frame}
- Study types: {', '.join(study_types) if study_types else 'Any'}
- Required keywords: {', '.join(keywords) if keywords else 'None'}
- Exclude terms: {', '.join(exclude_terms) if exclude_terms else 'None'}
- Strategy: {strategy}
- Number of queries: {max_queries}

INSTRUCTIONS:
1. Generate {max_queries} different PubMed search queries optimized for the research goal
2. Use proper PubMed syntax with field tags like [Title/Abstract], [MeSH Terms], [PDAT]
3. Include relevant Boolean operators (AND, OR, NOT)
4. Consider synonyms and alternative terms
5. Apply appropriate time filters based on the time frame
6. Include study type filters if specified

For each query, provide:
- query_string: The actual PubMed search string
- rationale: Explanation of the query construction approach
- expected_scope: Estimated result count range (e.g., "100-500 results")
- confidence_score: Your confidence in query quality (0.0-1.0)

Also identify:
- mesh_terms: Relevant MeSH terms for the topic
- field_tags: PubMed field tags used
- metadata: Domain context, synonyms used, complexity level

Respond with valid JSON in this exact format:
{{
  "queries": [
    {{
      "query_string": "example query",
      "rationale": "explanation",
      "expected_scope": "100-500 results",
      "confidence_score": 0.85
    }}
  ],
  "mesh_terms": ["Term 1", "Term 2"],
  "field_tags": ["Title/Abstract", "MeSH Terms"],
  "metadata": {{
    "domain_context": "description",
    "synonyms_used": ["synonym1", "synonym2"],
    "query_complexity": "moderate"
  }}
}}"""
    
    return prompt

def _parse_query_generation_response(response: str) -> Dict[str, Any]:
    """Parse LLM response into structured query data"""
    try:
        # Try to extract JSON from response
        start_idx = response.find('{')
        end_idx = response.rfind('}') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response[start_idx:end_idx]
            return json.loads(json_str)
        else:
            raise ValueError("No valid JSON found in response")
    
    except Exception as e:
        logger.warning(f"Failed to parse query generation response: {e}")
        # Return fallback structure
        return {
            "queries": [{
                "query_string": "search terms from goal",
                "rationale": "Fallback query due to parsing error",
                "expected_scope": "Unknown",
                "confidence_score": 0.3
            }],
            "mesh_terms": [],
            "field_tags": ["Title/Abstract"],
            "metadata": {
                "domain_context": "general",
                "synonyms_used": [],
                "query_complexity": "simple",
                "error": str(e)
            }
        }

# ============================================================================
# PubMed Search Tool
# ============================================================================

@create_stub_decorator("pubmed_search")
async def handle_pubmed_search(input: ToolExecutionInput) -> ToolExecutionResult:
    """Search PubMed database using NCBI E-utilities API"""
    
    try:
        # Extract parameters
        search_query = input.params.get("search_query")
        max_results = input.params.get("max_results", 20)
        sort_order = input.params.get("sort_order", "relevance")
        date_range = input.params.get("date_range")
        article_types = input.params.get("article_types", [])
        fields = input.params.get("fields", [])
        
        if not search_query:
            raise ValueError("search_query is required")
        
        # Get PubMed service and perform search
        async with await get_pubmed_service() as pubmed_service:
            # Search for PMIDs
            pmids, total_results, search_metadata = await pubmed_service.search(
                query=search_query,
                max_results=max_results,
                sort_order=sort_order,
                date_range=date_range,
                article_types=article_types
            )
            
            # Fetch full article details
            articles = await pubmed_service.fetch_articles(pmids)
        
        # Convert to dictionaries for JSON serialization
        articles_data = [article.model_dump() for article in articles]
        
        return ToolExecutionResult(
            outputs={
                "articles": articles_data,
                "total_results": total_results,
                "search_metadata": search_metadata
            }
        )
        
    except Exception as e:
        logger.error(f"PubMed search failed: {e}")
        return ToolExecutionResult(
            outputs={
                "articles": [],
                "total_results": 0,
                "search_metadata": {"error": str(e)}
            }
        )

# ============================================================================
# Feature Extraction Tool  
# ============================================================================

@create_stub_decorator("pubmed_extract_features")
async def handle_pubmed_extract_features(input: ToolExecutionInput) -> ToolExecutionResult:
    """Extract structured information from PubMed abstracts using LLM"""
    
    try:
        # Extract parameters
        articles = input.params.get("articles", [])
        extraction_schema = input.params.get("extraction_schema", {})
        extraction_instructions = input.params.get("extraction_instructions", "")
        batch_size = input.params.get("batch_size", 5)
        validation_mode = input.params.get("validation_mode", "strict")
        
        if not articles:
            raise ValueError("articles is required")
        if not extraction_schema:
            raise ValueError("extraction_schema is required")
        if not extraction_instructions:
            raise ValueError("extraction_instructions is required")
        
        # Process articles in batches
        extractions = []
        total_processed = 0
        successful_extractions = 0
        partial_extractions = 0
        failed_extractions = 0
        total_tokens = 0
        
        llm_service = await get_llm_service()
        
        for i in range(0, len(articles), batch_size):
            batch = articles[i:i + batch_size]
            
            try:
                batch_extractions, batch_tokens = await _process_extraction_batch(
                    batch, extraction_schema, extraction_instructions, 
                    llm_service, validation_mode
                )
                
                extractions.extend(batch_extractions)
                total_tokens += batch_tokens
                
                # Count extraction success rates
                for extraction in batch_extractions:
                    total_processed += 1
                    metadata = extraction.get("extraction_metadata", {})
                    if metadata.get("fields_missing", 0) == 0:
                        successful_extractions += 1
                    elif metadata.get("fields_extracted", 0) > 0:
                        partial_extractions += 1
                    else:
                        failed_extractions += 1
                        
            except Exception as e:
                logger.warning(f"Batch extraction failed: {e}")
                failed_extractions += len(batch)
                total_processed += len(batch)
        
        extraction_metadata = {
            "total_processed": total_processed,
            "successful_extractions": successful_extractions,
            "partial_extractions": partial_extractions,
            "failed_extractions": failed_extractions,
            "processing_time_ms": 0,  # Would need timing wrapper
            "tokens_used": total_tokens
        }
        
        return ToolExecutionResult(
            outputs={
                "extractions": extractions,
                "extraction_metadata": extraction_metadata
            }
        )
        
    except Exception as e:
        logger.error(f"Feature extraction failed: {e}")
        return ToolExecutionResult(
            outputs={
                "extractions": [],
                "extraction_metadata": {"error": str(e)}
            }
        )

async def _process_extraction_batch(
    articles: List[Dict], schema: Dict, instructions: str,
    llm_service, validation_mode: str
) -> tuple[List[Dict], int]:
    """Process a batch of articles for feature extraction"""
    
    # Build extraction prompt
    prompt = _build_extraction_prompt(articles, schema, instructions)
    
    # Get LLM response
    response = await llm_service.generate_text(
        prompt=prompt,
        max_tokens=2000,
        temperature=0.3
    )
    
    # Parse extractions from response
    extractions = _parse_extraction_response(response, articles, schema, validation_mode)
    
    # Estimate token usage (rough approximation)
    token_count = len(prompt.split()) + len(response.split())
    
    return extractions, token_count

def _build_extraction_prompt(articles: List[Dict], schema: Dict, instructions: str) -> str:
    """Build prompt for LLM extraction"""
    
    # Build schema description
    schema_desc = json.dumps(schema, indent=2)
    
    # Build articles text
    articles_text = ""
    for i, article in enumerate(articles):
        articles_text += f"\nARTICLE {i+1}:\n"
        articles_text += f"PMID: {article.get('pmid', 'unknown')}\n"
        articles_text += f"Title: {article.get('title', '')}\n"
        articles_text += f"Abstract: {article.get('abstract', '')}\n"
        articles_text += f"Journal: {article.get('journal', '')}\n"
        articles_text += "---"
    
    prompt = f"""Extract structured information from the following PubMed articles according to the specified schema and instructions.

EXTRACTION SCHEMA:
{schema_desc}

EXTRACTION INSTRUCTIONS:
{instructions}

ARTICLES TO PROCESS:
{articles_text}

For each article, provide the extracted data in JSON format following this structure:
{{
  "extractions": [
    {{
      "item_id": "pmid_XXXXXX",
      "extraction": {{
        // Fields according to schema
      }},
      "extraction_metadata": {{
        "confidence_score": 0.0-1.0,
        "fields_extracted": number,
        "fields_missing": number,
        "warnings": ["any warnings"]
      }}
    }}
  ]
}}

Return ONLY the JSON response, no additional text."""
    
    return prompt

def _parse_extraction_response(
    response: str, articles: List[Dict], schema: Dict, validation_mode: str
) -> List[Dict]:
    """Parse LLM extraction response into structured format"""
    
    try:
        # Extract JSON from response
        start_idx = response.find('{')
        end_idx = response.rfind('}') + 1
        
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response[start_idx:end_idx]
            data = json.loads(json_str)
            
            extractions = data.get("extractions", [])
            
            # Validate and enhance extractions
            processed_extractions = []
            for i, extraction in enumerate(extractions):
                if i < len(articles):
                    original_article = articles[i]
                    
                    # Build full extraction object
                    full_extraction = {
                        "item_id": f"pmid_{original_article.get('pmid', f'unknown_{i}')}",
                        "original_article": original_article,
                        "extraction": extraction.get("extraction", {}),
                        "extraction_metadata": extraction.get("extraction_metadata", {})
                    }
                    
                    processed_extractions.append(full_extraction)
            
            return processed_extractions
    
    except Exception as e:
        logger.warning(f"Failed to parse extraction response: {e}")
    
    # Fallback: create empty extractions for each article
    fallback_extractions = []
    for i, article in enumerate(articles):
        fallback_extractions.append({
            "item_id": f"pmid_{article.get('pmid', f'unknown_{i}')}",
            "original_article": article,
            "extraction": {},
            "extraction_metadata": {
                "confidence_score": 0.0,
                "fields_extracted": 0,
                "fields_missing": len(schema),
                "warnings": ["Extraction parsing failed"]
            }
        })
    
    return fallback_extractions

# ============================================================================
# Article Scoring Tool
# ============================================================================

@create_stub_decorator("pubmed_score_articles") 
async def handle_pubmed_score_articles(input: ToolExecutionInput) -> ToolExecutionResult:
    """Score articles based on extracted features using configurable criteria"""
    
    try:
        # Extract parameters
        articles_with_features = input.params.get("articles_with_features", [])
        scoring_criteria = input.params.get("scoring_criteria", {})
        score_function = input.params.get("score_function", "weighted_sum")
        include_percentiles = input.params.get("include_percentiles", True)
        
        if not articles_with_features:
            raise ValueError("articles_with_features is required")
        if not scoring_criteria:
            raise ValueError("scoring_criteria is required")
        
        # Score each article
        scored_articles = []
        all_scores = []
        
        for article_data in articles_with_features:
            scored_article = _score_single_article(
                article_data, scoring_criteria, score_function
            )
            scored_articles.append(scored_article)
            all_scores.append(scored_article["total_score"])
        
        # Calculate percentiles if requested
        if include_percentiles and all_scores:
            for i, scored_article in enumerate(scored_articles):
                percentile = _calculate_percentile(all_scores[i], all_scores)
                scored_article["percentile_rank"] = percentile
        
        # Generate scoring metadata
        scoring_metadata = _generate_scoring_metadata(
            all_scores, scoring_criteria, score_function
        )
        
        return ToolExecutionResult(
            outputs={
                "scored_articles": scored_articles,
                "scoring_metadata": scoring_metadata
            }
        )
        
    except Exception as e:
        logger.error(f"Article scoring failed: {e}")
        return ToolExecutionResult(
            outputs={
                "scored_articles": [],
                "scoring_metadata": {"error": str(e)}
            }
        )

def _score_single_article(
    article_data: Dict, scoring_criteria: Dict, score_function: str
) -> Dict:
    """Score a single article based on its extracted features"""
    
    extraction = article_data.get("extraction", {})
    weights = scoring_criteria.get("weights", {})
    scoring_functions = scoring_criteria.get("scoring_functions", {})
    
    # Calculate component scores
    score_breakdown = {}
    component_scores = []
    
    for feature, weight in weights.items():
        if feature in extraction:
            feature_value = extraction[feature]
            score_function_type = scoring_functions.get(feature, "direct")
            
            # Calculate feature score based on function type
            feature_score = _calculate_feature_score(
                feature_value, score_function_type
            )
            
            weighted_score = feature_score * weight
            score_breakdown[feature] = weighted_score
            component_scores.append(weighted_score)
    
    # Calculate total score
    if score_function == "weighted_sum":
        total_score = sum(component_scores)
    elif score_function == "composite":
        # More complex scoring - could include multiplicative factors
        total_score = sum(component_scores) * 0.8 + (len(component_scores) / len(weights)) * 0.2
    else:
        total_score = sum(component_scores)
    
    # Normalize to 0-1 range
    total_score = max(0.0, min(1.0, total_score))
    
    return {
        "article_with_features": article_data,
        "total_score": total_score,
        "score_breakdown": score_breakdown,
        "percentile_rank": None,  # Will be calculated later if requested
        "scoring_metadata": {
            "confidence": min(1.0, len(component_scores) / max(1, len(weights))),
            "components_used": len(component_scores)
        }
    }

def _calculate_feature_score(value: Any, function_type: str) -> float:
    """Calculate score for a single feature value"""
    
    if function_type == "categorical_score":
        # Map categorical values to scores
        category_scores = {
            "systematic review": 1.0,
            "meta-analysis": 0.95,
            "randomized controlled trial": 0.9,
            "clinical trial": 0.8,
            "observational study": 0.6,
            "case study": 0.4,
            "commentary": 0.2
        }
        return category_scores.get(str(value).lower(), 0.5)
    
    elif function_type == "log_scale":
        # Logarithmic scaling for numeric values like sample size
        if isinstance(value, (int, float)) and value > 0:
            import math
            return min(1.0, math.log10(value) / 4)  # Scale log10(10000) = 1.0
        return 0.0
    
    elif function_type == "text_similarity":
        # Text quality/similarity scoring - simplified
        if isinstance(value, str):
            return min(1.0, len(value.split()) / 50)  # Longer text = higher score
        return 0.0
    
    elif function_type == "keyword_match":
        # Keyword matching score
        if isinstance(value, (list, str)):
            items = value if isinstance(value, list) else [value]
            return min(1.0, len(items) / 10)  # More keywords = higher score
        return 0.0
    
    else:  # "direct" or unknown
        # Direct numeric conversion
        if isinstance(value, (int, float)):
            return max(0.0, min(1.0, value))
        elif isinstance(value, bool):
            return 1.0 if value else 0.0
        else:
            return 0.5  # Default for unknown types

def _calculate_percentile(score: float, all_scores: List[float]) -> float:
    """Calculate percentile rank of a score within the distribution"""
    if not all_scores:
        return 0.0
    
    rank = sum(1 for s in all_scores if s < score)
    percentile = (rank / len(all_scores)) * 100
    return round(percentile, 1)

def _generate_scoring_metadata(
    all_scores: List[float], scoring_criteria: Dict, score_function: str
) -> Dict:
    """Generate metadata about the scoring process"""
    
    if not all_scores:
        return {"error": "No scores calculated"}
    
    return {
        "score_distribution": {
            "min": min(all_scores),
            "max": max(all_scores),
            "mean": statistics.mean(all_scores),
            "std_dev": statistics.stdev(all_scores) if len(all_scores) > 1 else 0.0
        },
        "feature_correlations": {},  # Would need more complex analysis
        "scoring_method_used": score_function
    }

# ============================================================================
# Filter and Rank Tool
# ============================================================================

@create_stub_decorator("pubmed_filter_rank")
async def handle_pubmed_filter_rank(input: ToolExecutionInput) -> ToolExecutionResult:
    """Filter and rank scored articles based on thresholds and criteria"""
    
    try:
        # Extract parameters
        scored_articles = input.params.get("scored_articles", [])
        min_score_threshold = input.params.get("min_score_threshold")
        max_results = input.params.get("max_results", 10)
        ranking_criteria = input.params.get("ranking_criteria", {})
        filters = input.params.get("filters", {})
        output_format = input.params.get("output_format", "detailed")
        
        if not scored_articles:
            raise ValueError("scored_articles is required")
        
        initial_count = len(scored_articles)
        filtered_articles = scored_articles.copy()
        filters_applied = []
        
        # Apply score threshold filter
        if min_score_threshold is not None:
            filtered_articles = [
                article for article in filtered_articles 
                if article.get("total_score", 0) >= min_score_threshold
            ]
            filters_applied.append("min_score_threshold")
        
        # Apply additional filters
        if filters.get("min_citation_count"):
            min_citations = filters["min_citation_count"]
            filtered_articles = [
                article for article in filtered_articles
                if article.get("article_with_features", {})
                        .get("original_article", {})
                        .get("citation_count", 0) >= min_citations
            ]
            filters_applied.append("min_citation_count")
        
        if filters.get("journal_whitelist"):
            allowed_journals = set(filters["journal_whitelist"])
            filtered_articles = [
                article for article in filtered_articles
                if article.get("article_with_features", {})
                        .get("original_article", {})
                        .get("journal", "") in allowed_journals
            ]
            filters_applied.append("journal_whitelist")
        
        if filters.get("exclude_preprints"):
            filtered_articles = [
                article for article in filtered_articles
                if "preprint" not in article.get("article_with_features", {})
                                          .get("original_article", {})
                                          .get("journal", "").lower()
            ]
            filters_applied.append("exclude_preprints")
        
        # Apply ranking boosts
        ranking_method = "score_only"
        if ranking_criteria:
            filtered_articles = _apply_ranking_boosts(filtered_articles, ranking_criteria)
            ranking_method = "composite_score_with_boosts"
        
        # Sort by total score (descending)
        filtered_articles.sort(key=lambda x: x.get("total_score", 0), reverse=True)
        
        # Limit results
        if max_results:
            filtered_articles = filtered_articles[:max_results]
            if len(filtered_articles) == max_results and initial_count > max_results:
                filters_applied.append("max_results")
        
        # Format output based on requested detail level
        if output_format == "summary":
            ranked_articles = _format_summary_output(filtered_articles)
        elif output_format == "analysis_ready":
            ranked_articles = _format_analysis_output(filtered_articles)
        else:  # detailed
            ranked_articles = filtered_articles
        
        filter_metadata = {
            "initial_count": initial_count,
            "filtered_count": len(ranked_articles),
            "filters_applied": filters_applied,
            "ranking_method": ranking_method
        }
        
        return ToolExecutionResult(
            outputs={
                "ranked_articles": ranked_articles,
                "filter_metadata": filter_metadata
            }
        )
        
    except Exception as e:
        logger.error(f"Filter and rank failed: {e}")
        return ToolExecutionResult(
            outputs={
                "ranked_articles": [],
                "filter_metadata": {"error": str(e)}
            }
        )

def _apply_ranking_boosts(articles: List[Dict], ranking_criteria: Dict) -> List[Dict]:
    """Apply ranking boosts based on criteria"""
    
    for article in articles:
        original_score = article.get("total_score", 0)
        boost_multiplier = 1.0
        boosts_applied = []
        
        original_article = article.get("article_with_features", {}).get("original_article", {})
        
        # Boost recent articles
        if ranking_criteria.get("boost_recent"):
            pub_date = original_article.get("publication_date", "")
            if pub_date and pub_date.startswith(("2023", "2024")):
                boost_multiplier *= 1.1
                boosts_applied.append("recent")
        
        # Boost high-impact journals (simplified)
        if ranking_criteria.get("boost_high_impact"):
            journal = original_article.get("journal", "").lower()
            high_impact_journals = ["nature", "science", "cell", "lancet", "nejm"]
            if any(term in journal for term in high_impact_journals):
                boost_multiplier *= 1.15
                boosts_applied.append("high_impact")
        
        # Prefer review articles
        if ranking_criteria.get("prefer_review_articles"):
            title = original_article.get("title", "").lower()
            if "review" in title or "meta-analysis" in title:
                boost_multiplier *= 1.05
                boosts_applied.append("review_article")
        
        # Apply boost
        article["total_score"] = min(1.0, original_score * boost_multiplier)
        
        # Track boosts in metadata
        if "scoring_metadata" not in article:
            article["scoring_metadata"] = {}
        article["scoring_metadata"]["boosts_applied"] = boosts_applied
    
    return articles

def _format_summary_output(articles: List[Dict]) -> List[Dict]:
    """Format articles for summary output (minimal data)"""
    summary_articles = []
    
    for rank, article in enumerate(articles, 1):
        original_article = article.get("article_with_features", {}).get("original_article", {})
        
        summary_articles.append({
            "rank": rank,
            "pmid": original_article.get("pmid"),
            "title": original_article.get("title"),
            "journal": original_article.get("journal"),
            "publication_date": original_article.get("publication_date"),
            "total_score": article.get("total_score"),
            "percentile_rank": article.get("percentile_rank")
        })
    
    return summary_articles

def _format_analysis_output(articles: List[Dict]) -> List[Dict]:
    """Format articles for analysis (optimized structure)"""
    analysis_articles = []
    
    for rank, article in enumerate(articles, 1):
        original_article = article.get("article_with_features", {}).get("original_article", {})
        extraction = article.get("article_with_features", {}).get("extraction", {})
        
        analysis_articles.append({
            "rank": rank,
            "article_info": {
                "pmid": original_article.get("pmid"),
                "title": original_article.get("title"),
                "journal": original_article.get("journal"),
                "authors": original_article.get("authors", []),
                "publication_date": original_article.get("publication_date")
            },
            "extracted_features": extraction,
            "scoring": {
                "total_score": article.get("total_score"),
                "score_breakdown": article.get("score_breakdown", {}),
                "percentile_rank": article.get("percentile_rank")
            }
        })
    
    return analysis_articles

# ============================================================================
# Tool Registration
# ============================================================================

# Register all PubMed tool handlers
register_tool_handler(
    "pubmed_generate_query",
    ToolExecutionHandler(
        handler=handle_pubmed_generate_query,
        description="Generate optimized PubMed search queries using LLM assistance"
    )
)

register_tool_handler(
    "pubmed_search", 
    ToolExecutionHandler(
        handler=handle_pubmed_search,
        description="Search PubMed database using NCBI E-utilities API"
    )
)

register_tool_handler(
    "pubmed_extract_features",
    ToolExecutionHandler(
        handler=handle_pubmed_extract_features,
        description="Extract structured information from PubMed abstracts"
    )
)

register_tool_handler(
    "pubmed_score_articles",
    ToolExecutionHandler(
        handler=handle_pubmed_score_articles,
        description="Score articles based on extracted features"
    )
)

register_tool_handler(
    "pubmed_filter_rank",
    ToolExecutionHandler(
        handler=handle_pubmed_filter_rank,
        description="Filter and rank scored articles"
    )
)
```

#### 2.2 Update Handler Imports

**File**: `backend/tools/handlers/__init__.py`

Add import for PubMed handlers:

```python
# Existing imports...
from . import pubmed_handlers  # This will register all PubMed tools
```

### Phase 3: Dependencies and Configuration

#### 3.1 Update Requirements

**File**: `backend/requirements.txt`

Add any new dependencies:

```txt
# Existing dependencies...
aiohttp>=3.8.0  # For HTTP requests to NCBI API
lxml>=4.9.0     # For robust XML parsing (alternative to xml.etree)
```

#### 3.2 Add Development Dependencies

For testing and development:

```txt
# Development dependencies
pytest-asyncio>=0.21.0  # For async test support
aioresponses>=0.7.0     # For mocking HTTP requests in tests
```

### Phase 4: Testing and Validation

#### 4.1 Create Integration Tests

**File**: `backend/tests/test_pubmed_integration.py`

```python
"""
Integration tests for PubMed tool set

Tests the complete pipeline with real API calls (when API key available)
and comprehensive stub testing.
"""

import pytest
import asyncio
from tools.tool_execution import execute_tool
from services.pubmed_service import get_pubmed_service

class TestPubMedIntegration:
    """Test PubMed tool integration"""
    
    @pytest.mark.asyncio
    async def test_query_generation(self):
        """Test query generation tool"""
        result = await execute_tool("pubmed_generate_query", {
            "research_goal": "Find recent studies on machine learning in medical diagnosis",
            "domain": "medical",
            "time_frame": "last_year",
            "max_queries": 2
        })
        
        assert result.outputs["generated_queries"]
        assert len(result.outputs["generated_queries"]) <= 2
        assert result.outputs["mesh_terms"]
        assert result.outputs["field_tags"]
    
    @pytest.mark.asyncio
    async def test_search_with_stub(self):
        """Test PubMed search with stub data"""
        result = await execute_tool("pubmed_search", {
            "search_query": "machine learning[Title/Abstract] AND medical diagnosis[Title/Abstract]",
            "max_results": 10
        })
        
        assert "articles" in result.outputs
        assert "total_results" in result.outputs
        assert "search_metadata" in result.outputs
    
    @pytest.mark.asyncio
    async def test_complete_pipeline(self):
        """Test complete pipeline from query generation to ranking"""
        
        # Step 1: Generate query
        query_result = await execute_tool("pubmed_generate_query", {
            "research_goal": "Machine learning applications in healthcare",
            "domain": "medical",
            "max_queries": 1
        })
        
        query_string = query_result.outputs["generated_queries"][0]["query_string"]
        
        # Step 2: Search
        search_result = await execute_tool("pubmed_search", {
            "search_query": query_string,
            "max_results": 5
        })
        
        # Step 3: Extract features
        extraction_result = await execute_tool("pubmed_extract_features", {
            "articles": search_result.outputs["articles"],
            "extraction_schema": {
                "methodology": "string",
                "sample_size": "number",
                "key_findings": "array[string]"
            },
            "extraction_instructions": "Extract methodology, sample size, and key findings from each abstract"
        })
        
        # Step 4: Score articles
        scoring_result = await execute_tool("pubmed_score_articles", {
            "articles_with_features": extraction_result.outputs["extractions"],
            "scoring_criteria": {
                "weights": {
                    "methodology": 0.4,
                    "sample_size": 0.3,
                    "key_findings": 0.3
                },
                "scoring_functions": {
                    "methodology": "categorical_score",
                    "sample_size": "log_scale",
                    "key_findings": "keyword_match"
                }
            }
        })
        
        # Step 5: Filter and rank
        final_result = await execute_tool("pubmed_filter_rank", {
            "scored_articles": scoring_result.outputs["scored_articles"],
            "min_score_threshold": 0.3,
            "max_results": 3
        })
        
        # Verify complete pipeline
        assert final_result.outputs["ranked_articles"]
        assert len(final_result.outputs["ranked_articles"]) <= 3
        assert final_result.outputs["filter_metadata"]["initial_count"] >= 0
    
    @pytest.mark.skip(reason="Requires NCBI API key for live testing")
    @pytest.mark.asyncio 
    async def test_live_api(self):
        """Test with live NCBI API (requires API key)"""
        async with await get_pubmed_service() as service:
            pmids, total, metadata = await service.search(
                "machine learning[Title/Abstract]",
                max_results=2
            )
            
            assert isinstance(pmids, list)
            assert isinstance(total, int)
            assert isinstance(metadata, dict)
            
            if pmids:
                articles = await service.fetch_articles(pmids[:1])
                assert len(articles) > 0
                assert articles[0].pmid
                assert articles[0].title
```

#### 4.2 Tool Validation Script

**File**: `backend/tools/validate_pubmed_tools.py`

```python
"""
Validation script for PubMed tools

Checks tool definitions, handlers, and stub responses
"""

import asyncio
import json
from tools.tool_registry import get_tool_definition, get_available_tools
from tools.tool_execution import execute_tool

async def validate_pubmed_tools():
    """Validate all PubMed tools are properly configured"""
    
    pubmed_tools = [
        "pubmed_generate_query",
        "pubmed_search", 
        "pubmed_extract_features",
        "pubmed_score_articles",
        "pubmed_filter_rank"
    ]
    
    print("=== PubMed Tool Validation ===\n")
    
    # Check tool definitions
    available_tools = get_available_tools()
    for tool_id in pubmed_tools:
        if tool_id in available_tools:
            print(f"✓ {tool_id} - Definition loaded")
            
            # Check tool definition structure
            tool_def = get_tool_definition(tool_id)
            if tool_def.execution_handler:
                print(f"✓ {tool_id} - Handler registered")
            else:
                print(f"✗ {tool_id} - Handler missing")
                
            # Test stub execution
            try:
                result = await execute_tool(tool_id, {})
                print(f"✓ {tool_id} - Stub execution successful")
            except Exception as e:
                print(f"✗ {tool_id} - Stub execution failed: {e}")
        else:
            print(f"✗ {tool_id} - Definition not found")
        
        print()

if __name__ == "__main__":
    asyncio.run(validate_pubmed_tools())
```

### Phase 5: Documentation and Deployment

#### 5.1 API Integration Documentation

**File**: `backend/docs/pubmed_api_integration.md`

```markdown
# PubMed API Integration Guide

## NCBI E-utilities Setup

### API Key Registration
1. Visit: https://ncbiinsights.ncbi.nlm.nih.gov/2017/11/02/new-api-keys-for-the-e-utilities/
2. Register for free API key
3. Add to environment variables:
   ```bash
   NCBI_API_KEY=your_key_here
   NCBI_EMAIL=your_email@domain.com
   ```

### Rate Limiting
- Without API key: 3 requests/second
- With API key: 10 requests/second
- Service automatically handles rate limiting

### Error Handling
- Network timeouts: 30 second default
- API errors: Logged with fallback responses
- XML parsing errors: Graceful degradation

## Usage Examples

### Basic Search
```python
async with await get_pubmed_service() as service:
    pmids, total, metadata = await service.search(
        "machine learning[Title/Abstract]",
        max_results=10
    )
    articles = await service.fetch_articles(pmids)
```

### Advanced Search with Filters
```python
pmids, total, metadata = await service.search(
    query="diabetes[MeSH Terms]",
    max_results=50,
    date_range={"start_date": "2020/01/01", "end_date": "2024/12/31"},
    article_types=["Clinical Trial", "Review"]
)
```
```

#### 5.2 User Guide

**File**: `backend/docs/pubmed_tools_user_guide.md`

```markdown
# PubMed Research Tools User Guide

## Overview

The PubMed tool set provides a complete research pipeline for discovering, analyzing, and ranking academic literature from PubMed.

## Pipeline Workflow

```
Query Generation → Search → Feature Extraction → Scoring → Filtering & Ranking
```

## Tool Usage

### 1. Generate Research Queries
```python
query_result = await execute_tool("pubmed_generate_query", {
    "research_goal": "Find recent studies on AI in medical diagnosis",
    "domain": "medical",
    "time_frame": "last_year",
    "study_types": ["Clinical Trial", "Review"],
    "max_queries": 3
})
```

### 2. Search PubMed
```python
search_result = await execute_tool("pubmed_search", {
    "search_query": query_result["generated_queries"][0]["query_string"],
    "max_results": 50,
    "sort_order": "date"
})
```

### 3. Extract Features
```python
extraction_result = await execute_tool("pubmed_extract_features", {
    "articles": search_result["articles"],
    "extraction_schema": {
        "methodology": "string",
        "sample_size": "number",
        "primary_outcome": "string",
        "statistical_significance": "boolean"
    },
    "extraction_instructions": """
    Extract the following from each abstract:
    - methodology: Research design/approach used
    - sample_size: Number of participants/samples
    - primary_outcome: Main result or finding
    - statistical_significance: Whether results were statistically significant
    """
})
```

### 4. Score Articles
```python
scoring_result = await execute_tool("pubmed_score_articles", {
    "articles_with_features": extraction_result["extractions"],
    "scoring_criteria": {
        "weights": {
            "methodology": 0.3,
            "sample_size": 0.25,
            "statistical_significance": 0.25,
            "primary_outcome": 0.2
        },
        "scoring_functions": {
            "methodology": "categorical_score",
            "sample_size": "log_scale",
            "statistical_significance": "direct",
            "primary_outcome": "text_similarity"
        }
    }
})
```

### 5. Filter and Rank
```python
final_result = await execute_tool("pubmed_filter_rank", {
    "scored_articles": scoring_result["scored_articles"],
    "min_score_threshold": 0.6,
    "max_results": 10,
    "ranking_criteria": {
        "boost_recent": true,
        "boost_high_impact": true
    },
    "output_format": "detailed"
})
```

## Configuration Templates

### Medical Research
```python
medical_config = {
    "extraction_schema": {
        "study_design": "string",
        "participant_count": "number",
        "intervention": "string",
        "primary_endpoint": "string",
        "adverse_events": "array[string]"
    },
    "scoring_criteria": {
        "weights": {
            "study_design": 0.3,
            "participant_count": 0.25,
            "primary_endpoint": 0.25,
            "intervention": 0.2
        }
    }
}
```

### Technology Research
```python
tech_config = {
    "extraction_schema": {
        "methodology": "string",
        "dataset_size": "number",
        "performance_metrics": "array[string]",
        "code_availability": "boolean"
    },
    "scoring_criteria": {
        "weights": {
            "methodology": 0.3,
            "dataset_size": 0.2,
            "performance_metrics": 0.3,
            "code_availability": 0.2
        }
    }
}
```
```

## Implementation Timeline

### Phase 1: Core Infrastructure (Week 1)
- [ ] Add canonical types to `schemas/canonical_types.py`
- [ ] Create `services/pubmed_service.py`
- [ ] Update configuration files
- [ ] Test service integration

### Phase 2: Tool Handlers (Week 2-3)
- [ ] Implement `tools/handlers/pubmed_handlers.py`
- [ ] Add handler registration
- [ ] Test individual tool execution
- [ ] Validate stub responses

### Phase 3: Integration & Testing (Week 4)
- [ ] Create integration tests
- [ ] Test complete pipeline
- [ ] Performance optimization
- [ ] Error handling refinement

### Phase 4: Documentation & Deployment (Week 5)
- [ ] Complete documentation
- [ ] User guides and examples
- [ ] Production deployment
- [ ] Monitoring setup

## Success Criteria

- [ ] All 5 PubMed tools functional with stubs
- [ ] Live API integration working
- [ ] Complete pipeline processing 50+ articles
- [ ] Error handling for all failure modes
- [ ] Performance under 30 seconds for full pipeline
- [ ] Comprehensive test coverage (>80%)

This implementation plan provides a complete roadmap for building the PubMed research tool set following your existing codebase patterns and architecture.