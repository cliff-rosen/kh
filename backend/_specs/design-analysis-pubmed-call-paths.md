# Design Analysis: PubMed Call Paths - Architectural Issues

This document analyzes the architectural design issues around how different parts of the system call into PubMed, identifying inconsistencies, duplication, and coupling problems.

---

## Executive Summary

**Problem**: Two completely different architectural paths to reach the same PubMed service, creating:
- Inconsistent layering and abstractions
- Duplicated logic for date handling, parameter conversion, error handling
- Tight coupling between services
- Unclear separation of concerns
- Difficult to maintain and extend

**Impact**:
- High maintenance burden (changes must be made in multiple places)
- Inconsistent behavior between query testing and pipeline execution
- Hard to add new sources uniformly
- Confusing for developers (which path to use when?)

---

## Call Path 1: Query Testing (Test & Preview)

### Flow Diagram
```
research_streams.py (Router)
    ↓
    POST /{stream_id}/topics/test-query
    ↓
RetrievalQueryService.test_query_for_source()
    ↓ [Line 381]
SmartSearchService.search_articles()
    ↓ [Line 579]
SmartSearchService._search_pubmed()
    ↓ [Line 601-603]
search_pubmed_articles() [module function]
    ↓
PubMedService.search_articles()
    ↓
PubMedService._get_article_ids()
    ↓
PubMed API (esearch)
```

### Code Chain

**Step 1: Router** (`research_streams.py:513-560`)
```python
@router.post("/{stream_id}/topics/test-query")
async def test_query_for_source(
    stream_id: int,
    request: QueryTestRequest,  # Has source_id, query, max_results, dates
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = RetrievalQueryService(db)
    result = await service.test_query_for_source(
        query_expression=request.query_expression,
        source_id=request.source_id,
        max_results=request.max_results,  # Default 10, max 50
        start_date=request.start_date,     # YYYY-MM-DD format
        end_date=request.end_date,         # YYYY-MM-DD format
        date_type=request.date_type        # Default 'entrez'
    )
```

**Step 2: RetrievalQueryService** (`retrieval_query_service.py:339-403`)
```python
async def test_query_for_source(
    self,
    query_expression: str,
    source_id: str,
    max_results: int = 10,
    start_date: Optional[str] = None,  # YYYY-MM-DD
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> Dict[str, Any]:
    # Applies default 7-day range if not provided
    if source_id == 'pubmed':
        if not start_date or not end_date:
            # Defaults to 7-day range
            end_date_obj = datetime.utcnow()
            start_date_obj = end_date_obj - timedelta(days=7)
            start_date = start_date_obj.strftime('%Y-%m-%d')  # YYYY-MM-DD
            end_date = end_date_obj.strftime('%Y-%m-%d')

        date_params = {
            'start_date': start_date,
            'end_date': end_date,
            'date_type': date_type or 'entrez'
        }

    # Calls SmartSearchService
    result = await self.search_service.search_articles(
        search_query=query_expression,
        max_results=max_results,
        offset=0,
        selected_sources=[source_id],
        **date_params
    )
```

**Step 3: SmartSearchService** (`smart_search_service.py:542-583`)
```python
async def search_articles(
    self,
    search_query: str,
    max_results: int = 50,
    offset: int = 0,
    count_only: bool = False,
    selected_sources: Optional[List[str]] = None,
    start_date: Optional[str] = None,  # YYYY-MM-DD
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> SearchServiceResult:
    source = selected_sources[0]

    if source == 'pubmed':
        return await self._search_pubmed(
            search_query, max_results, offset, count_only,
            start_date, end_date, date_type
        )
```

**Step 4: SmartSearchService._search_pubmed** (`smart_search_service.py:585-639`)
```python
async def _search_pubmed(
    self,
    search_query: str,
    max_results: int,
    offset: int,
    count_only: bool,
    start_date: Optional[str] = None,  # YYYY-MM-DD
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> SearchServiceResult:
    loop = asyncio.get_event_loop()
    results_to_fetch = 1 if count_only else max_results

    # Calls module-level function (wrapper)
    pubmed_articles, metadata = await loop.run_in_executor(
        None,
        lambda: search_pubmed_articles(  # Module function
            query=search_query,
            max_results=results_to_fetch,
            offset=offset,
            start_date=start_date,      # YYYY-MM-DD
            end_date=end_date,
            date_type=date_type
        )
    )
```

**Step 5: PubMed Module Function** (`pubmed_service.py:268-290`)
```python
def search_articles(
    query: str,
    max_results: int = 100,
    offset: int = 0,
    sort_by: str = "relevance",
    start_date: Optional[str] = None,  # YYYY-MM-DD or YYYY/MM/DD
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> tuple[List['CanonicalResearchArticle'], Dict[str, Any]]:
    """Module-level search function to match Google Scholar pattern."""
    service = PubMedService()
    return service.search_articles(...)  # Delegates to instance method
```

**Step 6: PubMedService.search_articles** (already documented in previous spec)

### Parameters at Each Layer

| Layer | max_results | Date Format | Date Type Default | Sort By |
|-------|-------------|-------------|-------------------|---------|
| Router | 10 (default), max 50 | YYYY-MM-DD | 'entrez' | N/A |
| RetrievalQueryService | 10 | YYYY-MM-DD | 'entrez' | N/A |
| SmartSearchService | 50 (default) | YYYY-MM-DD | None | N/A |
| PubMed Module | 100 (default) | YYYY-MM-DD or YYYY/MM/DD | None | 'relevance' |
| PubMedService | 100 (default) | YYYY/MM/DD | 'publication' | 'relevance' |

---

## Call Path 2: Pipeline Execution (Production Retrieval)

### Flow Diagram
```
research_streams.py (Router)
    ↓
    POST /{stream_id}/execute-pipeline
    ↓
PipelineService.run_pipeline()
    ↓
PipelineService._execute_source_query()
    ↓ [Line 355]
PubMedService.search_articles()
    ↓
PubMedService._get_article_ids()
    ↓
PubMed API (esearch)
```

### Code Chain

**Step 1: Router** (`research_streams.py:574-630`)
```python
@router.post("/{stream_id}/execute-pipeline")
async def execute_pipeline(
    stream_id: int,
    request: ExecutePipelineRequest,  # Has run_type, start_date, end_date
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Apply default dates (7 days ago to today)
    if request.end_date:
        end_date = request.end_date
    else:
        end_date = datetime.now().strftime("%Y/%m/%d")  # YYYY/MM/DD

    if request.start_date:
        start_date = request.start_date
    else:
        start_date = (datetime.now() - timedelta(days=7)).strftime("%Y/%m/%d")

    pipeline_service = PipelineService(db)
    async for status in pipeline_service.run_pipeline(
        research_stream_id=stream_id,
        user_id=current_user.user_id,
        run_type=run_type_value,
        start_date=start_date,  # YYYY/MM/DD
        end_date=end_date
    ):
        yield f"data: {json.dumps(status.to_dict())}\\n\\n"
```

**Step 2: PipelineService.run_pipeline** (`pipeline_service.py:65-240`)
```python
async def run_pipeline(
    self,
    research_stream_id: int,
    user_id: int,
    run_type: RunType = RunType.TEST,
    start_date: Optional[str] = None,  # YYYY/MM/DD
    end_date: Optional[str] = None
) -> AsyncGenerator[PipelineStatus, None]:
    # Calls _execute_source_query for each retrieval group
    for group in retrieval_groups:
        for source_config in group.sources:
            count = await self._execute_source_query(
                research_stream_id=research_stream_id,
                execution_id=execution_id,
                group_id=group.group_id,
                source_id=source_config.source_id,
                query_expression=source_config.query_expression,
                start_date=start_date,
                end_date=end_date
            )
```

**Step 3: PipelineService._execute_source_query** (`pipeline_service.py:318-420`)
```python
async def _execute_source_query(
    self,
    research_stream_id: int,
    execution_id: str,
    group_id: str,
    source_id: str,
    query_expression: str,
    start_date: Optional[str] = None,  # YYYY/MM/DD
    end_date: Optional[str] = None
) -> int:
    if source_id.lower() == "pubmed":
        # Direct call to PubMedService instance
        articles, metadata = self.pubmed_service.search_articles(
            query=query_expression,
            max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50),  # Always 50
            start_date=start_date,     # YYYY/MM/DD
            end_date=end_date,
            date_type="entry",         # Hardcoded to 'entry'
            sort_by="relevance"        # Hardcoded to 'relevance'
        )
```

**Step 4: PubMedService.search_articles** (already documented)

### Parameters at Each Layer

| Layer | max_results | Date Format | Date Type | Sort By |
|-------|-------------|-------------|-----------|---------|
| Router | N/A | YYYY/MM/DD | N/A | N/A |
| PipelineService | 50 (hardcoded) | YYYY/MM/DD | 'entry' (hardcoded) | 'relevance' (hardcoded) |
| PubMedService | 50 | YYYY/MM/DD | 'entry' | 'relevance' |

---

## Design Issues Identified

### 1. **Inconsistent Abstraction Layers**

**Problem**: Path 1 has unnecessary intermediate layer (SmartSearchService), Path 2 goes direct.

**Why it's bad**:
- **Path 1**: Router → RetrievalQueryService → **SmartSearchService** → PubMed wrapper → PubMedService
- **Path 2**: Router → PipelineService → **PubMedService** (direct)
- SmartSearchService adds no value for PubMed (just passes parameters through)
- Creates confusion: when to use SmartSearchService vs. direct call?

**Evidence**:
```python
# SmartSearchService._search_pubmed - just a passthrough wrapper
async def _search_pubmed(self, ...):
    pubmed_articles, metadata = await loop.run_in_executor(
        None,
        lambda: search_pubmed_articles(...)  # Just wraps it in async
    )
```

### 2. **Duplicated Date Logic**

**Problem**: Date defaulting and formatting logic exists in THREE places.

**Locations**:
1. **research_streams.py router** (execute_pipeline endpoint, lines 594-609):
   - Defaults to 7 days ago, formats as YYYY/MM/DD

2. **RetrievalQueryService.test_query_for_source** (lines 368-373):
   - Defaults to 7 days ago, formats as YYYY-MM-DD

3. **ExecutePipelineTab.tsx** (frontend):
   - Defaults to 7 days ago, formats as YYYY-MM-DD, converts to YYYY/MM/DD

**Why it's bad**:
- Changing default range requires updating 3 files
- Different formats used (YYYY-MM-DD vs YYYY/MM/DD) create confusion
- Business logic (7-day default) scattered across layers

### 3. **Inconsistent Parameter Handling**

**Problem**: Different defaults and hardcoded values at different layers.

| Parameter | Query Testing Path | Pipeline Execution Path |
|-----------|-------------------|------------------------|
| max_results | 10 (user configurable, max 50) | 50 (hardcoded) |
| date_type | 'entrez' (default) | 'entry' (hardcoded) |
| sort_by | Not exposed | 'relevance' (hardcoded) |
| Date format | YYYY-MM-DD | YYYY/MM/DD |

**Why it's bad**:
- User can test with different parameters than production uses
- False confidence: "I tested with 10 results" but production fetches 50
- Hardcoded 'entry' in pipeline, but tests use 'entrez' (they're the same, but inconsistent naming)

### 4. **Tight Coupling and Circular Dependencies**

**Problem**: Services depend on each other in complex ways.

```
RetrievalQueryService
    ↓ depends on
SmartSearchService
    ↓ calls
search_pubmed_articles (module function)
    ↓ creates
PubMedService
    ↓ used by
PipelineService (directly)
```

**Why it's bad**:
- Can't change PubMedService without checking 3 different call paths
- Module-level function (`search_pubmed_articles`) is a leaky abstraction
- SmartSearchService is supposed to be "smart" but just wraps calls in async executor

### 5. **Mixed Responsibilities**

**Problem**: SmartSearchService has unclear purpose.

**What it does**:
- Wraps sync calls in async executor (infrastructure concern)
- Routes to different sources (routing concern)
- Returns unified SearchServiceResult (API concern)
- Source-specific logic in private methods (domain concern)

**Why it's bad**:
- Violates Single Responsibility Principle
- Hard to test (mixes async/sync, business logic, routing)
- Name suggests "smart" behavior but it's mostly plumbing

### 6. **No Unified Interface for Sources**

**Problem**: Each source handled differently with if/else chains.

```python
# In SmartSearchService.search_articles
if source == 'pubmed':
    return await self._search_pubmed(...)
elif source == 'google_scholar':
    return await self._search_google_scholar(...)

# In PipelineService._execute_source_query
if source_id.lower() == "pubmed":
    articles, metadata = self.pubmed_service.search_articles(...)
else:
    # Other sources not yet implemented
    pass
```

**Why it's bad**:
- Adding new source requires modifying multiple services
- No polymorphism or strategy pattern
- Conditional logic scattered across layers

### 7. **Date Format Inconsistency**

**Problem**: Two different date formats used interchangeably.

| Format | Used By | Example |
|--------|---------|---------|
| YYYY-MM-DD | Frontend, query testing, HTML inputs | 2024-01-15 |
| YYYY/MM/DD | Pipeline execution, PubMed API | 2024/01/15 |

**Why it's bad**:
- Conversion needed at boundaries
- Easy to forget conversion (bugs)
- Frontend does conversion, backend also does conversion (duplication)

### 8. **Hardcoded Business Logic in Infrastructure Layer**

**Problem**: Pipeline service hardcodes domain decisions.

```python
# pipeline_service.py:355-362
articles, metadata = self.pubmed_service.search_articles(
    query=query_expression,
    max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50),  # Why min(50, 50)?
    start_date=start_date,
    end_date=end_date,
    date_type="entry",      # Why hardcoded? What if user wants 'publication'?
    sort_by="relevance"     # Why hardcoded? What if user wants by date?
)
```

**Why it's bad**:
- Business decisions (entry date, relevance sort) buried in infrastructure code
- User can't configure behavior
- Different from query testing (which allows date_type selection)

---

## Architectural Recommendations

### Short-Term Fixes (Minimal Refactoring)

#### 1. **Unify Date Format**
Choose one format throughout backend: **YYYY/MM/DD** (PubMed API format)

**Changes**:
- Update `RetrievalQueryService` to use YYYY/MM/DD
- Update `QueryTestRequest` to accept YYYY/MM/DD
- Frontend already converts, keep doing that at API boundary

**Impact**: Eliminates confusion, reduces conversion logic

#### 2. **Extract Date Defaulting to Single Location**

Create a utility in `pubmed_service.py`:

```python
def get_default_date_range(days: int = 7) -> Tuple[str, str]:
    """Get default date range (N days ago to today) in YYYY/MM/DD format."""
    end = datetime.now()
    start = end - timedelta(days=days)
    return (
        start.strftime("%Y/%m/%d"),
        end.strftime("%Y/%m/%d")
    )
```

**Use in**:
- Router endpoints (if dates not provided)
- RetrievalQueryService (if dates not provided)
- Pipeline service (if dates not provided)

**Impact**: Single source of truth for default behavior

#### 3. **Make Pipeline Parameters Configurable**

Don't hardcode `date_type` and `sort_by` in pipeline:

```python
# In ResearchStream model or config
class RetrievalConfig:
    date_filter_type: str = 'entry'  # Make it configurable
    sort_preference: str = 'relevance'
    max_articles_per_source: int = 50

# In pipeline_service
articles, metadata = self.pubmed_service.search_articles(
    query=query_expression,
    max_results=retrieval_config.max_articles_per_source,
    start_date=start_date,
    end_date=end_date,
    date_type=retrieval_config.date_filter_type,  # From config
    sort_by=retrieval_config.sort_preference       # From config
)
```

**Impact**: Consistent behavior between testing and production

#### 4. **Remove Redundant min() in Pipeline**

```python
# BEFORE
max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50)  # Always 50

# AFTER
max_results=self.MAX_ARTICLES_PER_SOURCE  # Use the constant
```

**Impact**: Cleaner code, easier to change limit

---

### Medium-Term Refactoring (Better Architecture)

#### 1. **Introduce Source Provider Interface**

Define a clear interface for all sources:

```python
# New file: services/sources/base_provider.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple

class SourceProvider(ABC):
    """Base interface for all research article sources."""

    @abstractmethod
    async def search(
        self,
        query: str,
        max_results: int,
        offset: int,
        filters: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[CanonicalResearchArticle], Dict[str, Any]]:
        """
        Search for articles.

        Returns:
            Tuple of (articles, metadata)
            metadata includes: total_results, offset, returned
        """
        pass

    @abstractmethod
    def get_source_id(self) -> str:
        """Return source identifier (e.g., 'pubmed', 'google_scholar')."""
        pass

    @abstractmethod
    def get_capabilities(self) -> Dict[str, Any]:
        """Return source capabilities (date filtering, sort options, etc.)."""
        pass
```

#### 2. **Implement Providers**

```python
# services/sources/pubmed_provider.py
class PubMedProvider(SourceProvider):
    def __init__(self):
        self.service = PubMedService()

    async def search(
        self,
        query: str,
        max_results: int,
        offset: int,
        filters: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[CanonicalResearchArticle], Dict[str, Any]]:
        filters = filters or {}

        # Handle async in one place
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.service.search_articles(
                query=query,
                max_results=max_results,
                offset=offset,
                start_date=filters.get('start_date'),
                end_date=filters.get('end_date'),
                date_type=filters.get('date_type', 'entry'),
                sort_by=filters.get('sort_by', 'relevance')
            )
        )

    def get_source_id(self) -> str:
        return 'pubmed'

    def get_capabilities(self) -> Dict[str, Any]:
        return {
            'supports_date_filtering': True,
            'date_filter_types': ['entry', 'publication', 'completion', 'revision'],
            'supports_sorting': True,
            'sort_options': ['relevance', 'date'],
            'max_results_per_call': 10000,
            'supports_pagination': True
        }

# services/sources/scholar_provider.py
class GoogleScholarProvider(SourceProvider):
    # Similar implementation
    pass
```

#### 3. **Create Source Registry**

```python
# services/sources/registry.py
class SourceRegistry:
    """Registry of all available source providers."""

    def __init__(self):
        self._providers: Dict[str, SourceProvider] = {}

    def register(self, provider: SourceProvider):
        """Register a source provider."""
        self._providers[provider.get_source_id()] = provider

    def get_provider(self, source_id: str) -> SourceProvider:
        """Get a provider by source ID."""
        if source_id not in self._providers:
            raise ValueError(f"Unknown source: {source_id}")
        return self._providers[source_id]

    def list_sources(self) -> List[str]:
        """List all available source IDs."""
        return list(self._providers.keys())

# Global registry instance
_registry = SourceRegistry()
_registry.register(PubMedProvider())
_registry.register(GoogleScholarProvider())

def get_source_provider(source_id: str) -> SourceProvider:
    """Get a source provider by ID."""
    return _registry.get_provider(source_id)
```

#### 4. **Simplify SmartSearchService**

Make it a thin routing layer:

```python
# services/smart_search_service.py (simplified)
class SmartSearchService:
    """Unified interface for searching across sources."""

    async def search_articles(
        self,
        search_query: str,
        max_results: int = 50,
        offset: int = 0,
        selected_sources: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> SearchServiceResult:
        """Search articles from specified source(s)."""
        if not selected_sources:
            selected_sources = ['pubmed']

        source_id = selected_sources[0]
        provider = get_source_provider(source_id)

        # Let provider handle everything
        articles, metadata = await provider.search(
            query=search_query,
            max_results=max_results,
            offset=offset,
            filters=filters or {}
        )

        return SearchServiceResult(
            articles=articles,
            pagination=SearchPaginationInfo(
                total_available=metadata.get('total_results', 0),
                returned=len(articles),
                offset=offset,
                has_more=offset + len(articles) < metadata.get('total_results', 0)
            ),
            sources_searched=[source_id]
        )
```

#### 5. **Unify Pipeline and Query Testing**

Both should use the same code path:

```python
# In PipelineService
async def _execute_source_query(
    self,
    research_stream_id: int,
    execution_id: str,
    group_id: str,
    source_id: str,
    query_expression: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> int:
    # Use the provider interface
    provider = get_source_provider(source_id)

    articles, metadata = await provider.search(
        query=query_expression,
        max_results=self.MAX_ARTICLES_PER_SOURCE,
        offset=0,
        filters={
            'start_date': start_date,
            'end_date': end_date,
            'date_type': 'entry',
            'sort_by': 'relevance'
        }
    )

    # Store in wip_articles...
```

---

### Long-Term Vision (Clean Architecture)

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Presentation Layer                   │
│  (FastAPI Routers: research_streams.py, pubmed.py)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  - PipelineService (orchestration)                          │
│  - RetrievalQueryService (query generation)                 │
│  - SmartSearchService (unified search interface)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        Domain Layer                          │
│  - SourceProvider (interface)                               │
│  - SourceRegistry (factory)                                 │
│  - SearchFilters (value object)                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  - PubMedProvider (implements SourceProvider)               │
│  - GoogleScholarProvider (implements SourceProvider)        │
│  - PubMedService (low-level API wrapper)                    │
│  - GoogleScholarService (low-level API wrapper)             │
└─────────────────────────────────────────────────────────────┘
```

#### Key Principles

1. **Dependency Inversion**: High-level modules (Pipeline, Query) depend on abstractions (SourceProvider), not concrete implementations
2. **Single Responsibility**: Each layer has one clear purpose
3. **Open/Closed**: Adding new sources doesn't require modifying existing code
4. **Uniform Interface**: All sources accessed through same interface
5. **No Duplication**: Date logic, parameter handling in one place per concern

---

## Summary of Issues by Severity

### Critical (Fix Now)
1. ❌ Hardcoded parameters differ between testing and production
2. ❌ Date logic duplicated in 3 places
3. ❌ Inconsistent date formats (YYYY-MM-DD vs YYYY/MM/DD)

### High (Fix Soon)
4. ⚠️ SmartSearchService adds no value but adds complexity
5. ⚠️ No unified source interface (if/else chains everywhere)
6. ⚠️ Tight coupling between services

### Medium (Refactor When Possible)
7. 📋 Module-level wrapper function unnecessary
8. 📋 Mixed responsibilities in SmartSearchService
9. 📋 Redundant min() in pipeline

### Low (Long-term Improvement)
10. 💡 No clear separation of concerns across layers
11. 💡 Could benefit from proper dependency injection

---

## Recommended Action Plan

### Phase 1: Quick Wins (1-2 days)
- [ ] Fix redundant `min(50, 50)` to just use constant
- [ ] Extract date defaulting to single utility function
- [ ] Standardize on YYYY/MM/DD format throughout backend
- [ ] Make pipeline parameters configurable (not hardcoded)

### Phase 2: Interface Introduction (3-5 days)
- [ ] Create `SourceProvider` interface
- [ ] Implement `PubMedProvider` and `GoogleScholarProvider`
- [ ] Create `SourceRegistry`
- [ ] Update Pipeline and Query services to use providers

### Phase 3: Cleanup (2-3 days)
- [ ] Simplify SmartSearchService to use providers
- [ ] Remove module-level wrapper functions
- [ ] Consolidate duplicate logic
- [ ] Update tests to reflect new architecture

### Phase 4: Documentation & Testing (2 days)
- [ ] Document provider interface and capabilities
- [ ] Add integration tests for all providers
- [ ] Update architecture diagrams
- [ ] Create migration guide for adding new sources

**Total Estimated Effort**: 8-12 days for complete refactoring

**ROI**:
- Easier to add new sources (hours instead of days)
- Consistent behavior across testing and production
- Reduced maintenance burden (one place to change, not three)
- Better testability and code clarity
