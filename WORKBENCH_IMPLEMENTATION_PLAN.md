# Query Refinement Workbench - Implementation Plan

## What We're Building

A testing workbench with three chainable operations:
1. **Source** - Get articles (run query OR manual PMIDs)
2. **Filter** - Apply semantic filtering
3. **Categorize** - Apply Layer 3 categories
4. **Compare** - Compare results to expected PMIDs

## Existing Infrastructure

### ✅ Services We Have

1. **PubMedService** (`services/pubmed_service.py`)
   - `fetch_articles_by_ids(pubmed_ids)` - Fetch by PMIDs
   - Has search capabilities via `PubMedAdapter`

2. **SemanticFilterService** (`services/semantic_filter_service.py`)
   - `evaluate_article_relevance(title, abstract, criteria, threshold)`
   - Returns: `(is_relevant, score, reasoning)`

3. **ArticleCategorizationService** (`services/article_categorization_service.py`)
   - `categorize_article(title, abstract, categories)`
   - Returns: `List[category_ids]`

### ✅ Models/Schemas We Have

- `PubMedArticle` - Article representation
- `SemanticFilter` - Filter config (in research_stream.py)
- `Category` - Category definition (in research_stream.py)
- `BroadQuery`, `Concept` - Query definitions

## What We Need to Build

### 1. New API Endpoints (`backend/routers/refinement_workbench.py`)

```python
# Source Operations
POST /api/refinement-workbench/source/run-query
- Input: query_id (from stream config), start_date, end_date
- Output: Articles[]

POST /api/refinement-workbench/source/manual-pmids
- Input: pmids[]
- Output: Articles[]

# Filter Operations
POST /api/refinement-workbench/filter
- Input: articles[], filter_criteria, threshold
- Output: FilterResult[] (article + passed/failed + score + reasoning)

# Categorize Operations
POST /api/refinement-workbench/categorize
- Input: articles[], categories[]
- Output: CategoryResult[] (article + assigned_categories[])

# Compare Operations
POST /api/refinement-workbench/compare
- Input: retrieved_pmids[], expected_pmids[]
- Output: ComparisonResult (matched[], missed[], extra[])
```

### 2. New Schemas (`backend/schemas/refinement_workbench.py`)

```python
# Request Schemas
class RunQueryRequest(BaseModel):
    stream_id: int
    query_type: str  # "broad_query" or "concept"
    query_index: int  # which query/concept from the config
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD

class ManualPMIDsRequest(BaseModel):
    pmids: List[str]

class FilterArticlesRequest(BaseModel):
    articles: List[Dict]  # article data
    filter_criteria: str
    threshold: float

class CategorizeArticlesRequest(BaseModel):
    stream_id: int  # to get categories from Layer 3
    articles: List[Dict]

class CompareResultsRequest(BaseModel):
    retrieved_pmids: List[str]
    expected_pmids: List[str]

# Response Schemas
class ArticleResult(BaseModel):
    pmid: str
    title: str
    abstract: str
    journal: Optional[str]
    pub_date: Optional[str]

class FilterResult(BaseModel):
    article: ArticleResult
    passed: bool
    score: float
    reasoning: str

class CategoryAssignment(BaseModel):
    article: ArticleResult
    assigned_categories: List[str]  # category IDs
    confidence: Optional[float]

class ComparisonResult(BaseModel):
    matched: List[str]  # PMIDs in both
    missed: List[str]   # In expected but not retrieved
    extra: List[str]    # In retrieved but not expected
    recall: float       # matched / expected
    precision: float    # matched / retrieved
```

### 3. New Service (`backend/services/refinement_workbench_service.py`)

```python
class RefinementWorkbenchService:
    def __init__(self, db: Session):
        self.db = db
        self.pubmed_service = PubMedService()
        self.filter_service = SemanticFilterService()
        self.categorization_service = ArticleCategorizationService()

    async def run_query(
        self,
        stream_id: int,
        query_type: str,
        query_index: int,
        start_date: str,
        end_date: str
    ) -> List[ArticleResult]:
        """Execute a query from the stream's retrieval config"""
        # 1. Get stream from DB
        # 2. Extract query (broad_query or concept)
        # 3. Build PubMed query string with date filter
        # 4. Execute search
        # 5. Return articles
        pass

    async def fetch_manual_pmids(
        self,
        pmids: List[str]
    ) -> List[ArticleResult]:
        """Fetch articles by PMID list"""
        # Use pubmed_service.fetch_articles_by_ids()
        pass

    async def filter_articles(
        self,
        articles: List[Dict],
        filter_criteria: str,
        threshold: float
    ) -> List[FilterResult]:
        """Apply semantic filtering to articles"""
        # For each article:
        #   - Call filter_service.evaluate_article_relevance()
        #   - Package as FilterResult
        pass

    async def categorize_articles(
        self,
        stream_id: int,
        articles: List[Dict]
    ) -> List[CategoryAssignment]:
        """Categorize articles using stream's Layer 3 categories"""
        # 1. Get stream from DB
        # 2. Extract categories from presentation_config
        # 3. For each article:
        #     - Call categorization_service.categorize_article()
        #     - Package as CategoryAssignment
        pass

    def compare_pmid_lists(
        self,
        retrieved: List[str],
        expected: List[str]
    ) -> ComparisonResult:
        """Compare two PMID lists"""
        # Set operations to find matched/missed/extra
        # Calculate recall & precision
        pass
```

### 4. Frontend API Client Updates

Add to `frontend/src/lib/api/researchStreamApi.ts`:

```typescript
// Refinement Workbench APIs
async runQuery(streamId: number, request: RunQueryRequest): Promise<ArticleResult[]>
async fetchManualPMIDs(pmids: string[]): Promise<ArticleResult[]>
async filterArticles(request: FilterArticlesRequest): Promise<FilterResult[]>
async categorizeArticles(request: CategorizeArticlesRequest): Promise<CategoryAssignment[]>
async comparePMIDs(request: CompareResultsRequest): Promise<ComparisonResult>
```

## Implementation Order

### Phase 1: Source Operations
1. Create schemas for requests/responses
2. Build `RefinementWorkbenchService.run_query()`
3. Build `RefinementWorkbenchService.fetch_manual_pmids()`
4. Create API endpoints
5. Wire up frontend

### Phase 2: Filter Operations
1. Build `RefinementWorkbenchService.filter_articles()`
2. Create API endpoint
3. Wire up frontend

### Phase 3: Categorize Operations
1. Build `RefinementWorkbenchService.categorize_articles()`
2. Create API endpoint
3. Wire up frontend

### Phase 4: Compare Operations
1. Build `RefinementWorkbenchService.compare_pmid_lists()`
2. Create API endpoint
3. Wire up frontend

## Key Questions to Resolve

1. **Query Execution**: How do we execute a `BroadQuery` or `Concept` to get a PubMed query string?
   - Do we have a service that converts BroadQuery → PubMed query syntax?
   - For Concepts, do we build query from entity_pattern + vocabulary_terms?

2. **Article Format**: What format should articles be in?
   - Use existing `PubMedArticle` class?
   - Convert to dict for JSON?
   - Need title, abstract, PMID minimum

3. **Caching**: Should we cache query results?
   - Probably not in Phase 1 (keep it simple)

4. **Rate Limiting**: PubMed has rate limits
   - Current handling sufficient?
   - Need to warn user about large queries?

## Next Steps

1. Look at how `pipeline_service.py` executes queries
2. Understand query → PubMed syntax conversion
3. Start building Phase 1 (Source operations)
