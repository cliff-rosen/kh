# Simple Keyword Generation for SmartSearch2

## What We Actually Need

Just add a few endpoints to `smart_search2.py` that use BasePromptCaller to help build better search queries.

## New Endpoints

### 1. Extract Concepts from Text
```python
@router.post("/extract-concepts")
async def extract_concepts(request: ConceptExtractionRequest):
    """
    Take user's description and extract key searchable concepts.
    """
    # Input: "Studies on asbestos and cancer in engineered mice"
    # Output: ["asbestos", "cancer", "genetically engineered mice"]
```

### 2. Generate Boolean Query
```python
@router.post("/generate-boolean-query")
async def generate_boolean_query(request: BooleanQueryRequest):
    """
    Turn concepts into a PubMed Boolean search string.
    """
    # Input: ["asbestos", "cancer", "genetically engineered mice"]
    # Output: "(asbestos OR \"asbestos fibers\") AND (cancer OR carcinoma OR neoplasm) AND (\"genetically engineered mice\" OR \"transgenic mice\")"
```

### 3. Test Query Volume
```python
@router.post("/test-query-volume")
async def test_query_volume(request: QueryTestRequest):
    """
    Check how many results a query would return without running the full search.
    """
    # Uses existing search_pubmed_count function
```

## Simple Request/Response Models

```python
class ConceptExtractionRequest(BaseModel):
    description: str = Field(..., description="Natural language description of what user wants to find")

class ConceptExtractionResponse(BaseModel):
    concepts: List[str] = Field(..., description="List of key searchable concepts")

class BooleanQueryRequest(BaseModel):
    concepts: List[str] = Field(..., description="Concepts to turn into Boolean query")
    max_results: int = Field(500, description="Target maximum results")

class BooleanQueryResponse(BaseModel):
    query: str = Field(..., description="Generated Boolean search string")
    estimated_results: int = Field(..., description="Estimated result count")

class QueryTestRequest(BaseModel):
    query: str = Field(..., description="Boolean query to test")

class QueryTestResponse(BaseModel):
    result_count: int = Field(..., description="Number of results this query would return")
```

## Simple Service Functions

Just add these to SmartSearchService:

```python
async def extract_search_concepts(self, description: str) -> List[str]:
    """Extract key concepts using BasePromptCaller."""

    prompt = f"""Extract 2-4 key biomedical concepts from this description that would be good for a PubMed search:

    "{description}"

    Return only the most important, specific terms that define what studies they're looking for.
    Focus on: organisms, interventions, diseases, or study types.

    Examples:
    - "cancer studies in mice" → ["cancer", "mice"]
    - "diabetes treatment with insulin" → ["diabetes", "insulin", "treatment"]
    """

    # Use BasePromptCaller with simple string list response
    # Model: gpt-5-mini, reasoning_effort: "low"

async def generate_boolean_search(self, concepts: List[str], max_results: int = 500) -> str:
    """Turn concepts into Boolean search with synonyms."""

    prompt = f"""Create a PubMed Boolean search query from these concepts: {concepts}

    For each concept, include 2-3 relevant synonyms using OR.
    Connect concepts with AND.
    Target approximately {max_results} results.

    Example format:
    (concept1 OR synonym1 OR synonym2) AND (concept2 OR synonym3) AND (concept3 OR synonym4)
    """

    # Use BasePromptCaller to generate the query string
    # Then test it with search_pubmed_count and adjust if needed
```

## That's It

Three endpoints, two service functions. User can:

1. Put in "I want studies about X and Y"
2. Get back key concepts
3. Get back a Boolean query
4. Test how many results it would return
5. Use the query in regular SmartSearch2

No complicated architecture, no database tables, no complex orchestration. Just simple LLM calls that make better search queries.