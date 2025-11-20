# PubMed Result Count Parameters - Complete Call Chain Analysis

This document traces all parameters that control how many results are returned from PubMed queries vs. the total number of matching results.

## Summary

**Total Results that Match**: Returned by PubMed API in `esearchresult.count` field (no limits applied)

**Actual Results Returned**: Controlled by a chain of `max_results` parameters that get progressively limited at each layer

---

## Call Chain (Top to Bottom)

### Layer 1: Pipeline Service (`pipeline_service.py`)

**Location**: `_execute_source_query` method (line 355-362)

```python
# Hard limit constants
MAX_ARTICLES_PER_SOURCE = 50  # Line 55
MAX_TOTAL_ARTICLES = 200      # Line 56

# Call to PubMed service
articles, metadata = self.pubmed_service.search_articles(
    query=query_expression,
    max_results=min(self.MAX_ARTICLES_PER_SOURCE, 50),  # Line 357 - Always 50
    start_date=start_date,
    end_date=end_date,
    date_type="entry",
    sort_by="relevance"
)
```

**Parameters controlling returned results:**
- `max_results` = `min(50, 50)` = **50 articles max**

**Notes:**
- The `min(self.MAX_ARTICLES_PER_SOURCE, 50)` is redundant since both values are 50
- `MAX_TOTAL_ARTICLES = 200` is defined but not used in this call (likely used elsewhere in pipeline)

---

### Layer 2: PubMed Service - `search_articles` Method (`pubmed_service.py`)

**Location**: `search_articles` method (line 315-397)

```python
def search_articles(
    self,
    query: str,
    max_results: int = 100,    # Default, but overridden by caller
    offset: int = 0,
    sort_by: str = "relevance",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> tuple[List['CanonicalResearchArticle'], Dict[str, Any]]:

    # Get article IDs with total count
    article_ids, total_count = self._get_article_ids(
        search_term=query,
        max_results=offset + max_results,  # Line 336 - Request enough IDs for pagination
        sort_by=sort_by,
        start_date=start_date,
        end_date=end_date,
        date_type=date_type
    )

    # Apply pagination to IDs
    paginated_ids = article_ids[offset:offset + max_results]  # Line 346 - Slice to actual page
```

**Parameters controlling returned results:**
- `max_results`: Received from caller (50 from pipeline)
- `offset`: Pagination offset (0 from pipeline)
- Requests `offset + max_results` IDs from PubMed (0 + 50 = 50)
- Then slices to `article_ids[0:50]` to get the actual page

**Returned metadata** (line 349-353):
```python
{
    "total_results": total_count,  # Total matches from PubMed (unlimited)
    "offset": offset,              # Pagination offset
    "returned": len(paginated_ids) # Actual number returned
}
```

**Notes:**
- This layer handles pagination by requesting enough IDs and then slicing
- Returns both articles AND metadata containing total count

---

### Layer 3: PubMed Service - `_get_article_ids` Method (`pubmed_service.py`)

**Location**: `_get_article_ids` method (line 423-522)

```python
def _get_article_ids(
    self,
    search_term: str,
    max_results: int = 100,  # Receives 50 from search_articles
    sort_by: str = "relevance",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: str = "publication"
) -> tuple[List[str], int]:

    params = {
        'db': 'pubmed',
        'term': full_term,
        'retmax': min(max_results, self._get_max_results_per_call()),  # Line 444
        'retmode': 'json'
    }

    response = requests.get(url, params, headers=headers, timeout=30)
    content = response.json()

    count = int(content['esearchresult']['count'])    # Line 511 - Total matches
    ids = content['esearchresult']['idlist']          # Line 512 - IDs returned

    return ids, count  # Line 515
```

**Parameters controlling returned results:**
- `retmax` = `min(max_results, self._get_max_results_per_call())`
  - `max_results` = 50 (from caller)
  - `self._get_max_results_per_call()` = 10,000 (from settings)
  - **Result: retmax = 50**

**PubMed API Response**:
- `esearchresult.count`: **Total number of articles matching the query** (unlimited)
- `esearchresult.idlist`: **List of PMIDs returned** (limited by `retmax` parameter)

---

### Layer 4: Configuration Settings (`config/settings.py`)

**Location**: `config/settings.py` (line 39)

```python
PUBMED_MAX_RESULTS_PER_CALL: int = int(os.getenv("PUBMED_MAX_RESULTS_PER_CALL", "10000"))
```

**Default**: 10,000 results per API call
**Can be overridden**: Via `PUBMED_MAX_RESULTS_PER_CALL` environment variable
**PubMed API maximum**: 10,000 (enforced by NCBI)

**Notes:**
- This is a safety cap to prevent requesting more than PubMed allows
- In practice, pipeline limits to 50, so this cap is never reached

---

### Layer 5: Article Fetching - `_get_articles_from_ids` Method

**Location**: `_get_articles_from_ids` method (line 524+)

```python
def _get_articles_from_ids(self, ids: List[str]) -> List[PubMedArticle]:
    """Fetch full article data from PubMed IDs."""
    BATCH_SIZE = 100  # Line 526
    articles = []
    batch_size = BATCH_SIZE
    low = 0
    high = low + batch_size

    while low < len(ids):
        id_batch = ids[low: high]  # Process in batches of 100
        # ... fetch article details ...
```

**Parameters controlling fetching:**
- `BATCH_SIZE = 100`: Fetches article details in batches of 100 PMIDs at a time
- Processes ALL IDs provided (which is limited to 50 by earlier layers)

**Notes:**
- This is purely for batch processing efficiency
- Doesn't limit total results, just batches the fetch requests
- Since we only pass 50 IDs, only 1 batch is needed

---

## Complete Parameter Flow for Pipeline Execution

### Current Pipeline Configuration (for weekly reports)

```
Pipeline Call
  ↓
max_results = min(50, 50) = 50
  ↓
PubMedService.search_articles(max_results=50, offset=0)
  ↓
_get_article_ids(max_results=50)
  ↓
PubMed API: retmax = min(50, 10000) = 50
  ↓
PubMed Returns:
  - count: 1,247 (example - total matches)
  - idlist: [50 PMIDs]
  ↓
_get_articles_from_ids([50 PMIDs])
  ↓
Fetch in batches of 100 (1 batch needed)
  ↓
Return: 50 CanonicalResearchArticle objects + metadata
```

### Metadata Returned to Pipeline

```python
{
    "total_results": 1247,    # Total articles matching query in PubMed
    "offset": 0,              # Starting position (pagination)
    "returned": 50            # Actual articles returned in this call
}
```

---

## All Parameters That Control Result Counts

### Parameters That Limit Actual Results Returned

1. **`PipelineService.MAX_ARTICLES_PER_SOURCE`** (line 55)
   - **Value**: 50
   - **Effect**: Hard limit on articles per source query
   - **Current impact**: Directly limits to 50 articles

2. **`pipeline_service._execute_source_query` max_results argument** (line 357)
   - **Value**: `min(50, 50)` = 50
   - **Effect**: Passed to PubMed service
   - **Current impact**: Limits to 50 articles

3. **`PubMedService.search_articles` max_results parameter** (line 318)
   - **Value**: Receives 50 from pipeline
   - **Effect**: Controls pagination and ID fetching
   - **Current impact**: Requests 50 IDs, returns 50 articles

4. **`PubMedService._get_article_ids` max_results parameter** (line 426)
   - **Value**: Receives 50 from search_articles
   - **Effect**: Used in min() with PUBMED_MAX_RESULTS_PER_CALL
   - **Current impact**: Results in retmax=50

5. **`PubMed API retmax parameter`** (line 444)
   - **Value**: `min(50, 10000)` = 50
   - **Effect**: Tells PubMed how many PMIDs to return
   - **Current impact**: PubMed returns 50 PMIDs max

6. **`settings.PUBMED_MAX_RESULTS_PER_CALL`** (config/settings.py line 39)
   - **Value**: 10,000 (default)
   - **Effect**: Safety cap for PubMed API limit
   - **Current impact**: Not reached (50 < 10,000)

### Parameters That DON'T Limit Results (informational only)

7. **`PubMedService._get_articles_from_ids` BATCH_SIZE** (line 526)
   - **Value**: 100
   - **Effect**: Batch size for fetching article details
   - **Current impact**: None (only 50 IDs to fetch)

8. **`PipelineService.MAX_TOTAL_ARTICLES`** (line 56)
   - **Value**: 200
   - **Effect**: Not used in _execute_source_query
   - **Current impact**: None for individual queries (may limit total across all groups)

### Metadata Fields (Total Count)

9. **`PubMed API esearchresult.count`** (line 511)
   - **Value**: Variable (total matches in PubMed database)
   - **Effect**: Informational - shows total available results
   - **Current impact**: Returned in metadata, not a limit

---

## Recommendations

### For Understanding Current Behavior

**Current effective limit**: **50 articles per source query**

The limiting factor is the pipeline's `MAX_ARTICLES_PER_SOURCE = 50` and the redundant `min(50, 50)` in the call.

### For Changing Limits

To increase/decrease articles returned, modify these in order of impact:

1. **Primary control**: `PipelineService.MAX_ARTICLES_PER_SOURCE` (line 55)
   - Change this to desired max (e.g., 100)

2. **Remove redundancy**: Update line 357 to just use the constant:
   ```python
   max_results=self.MAX_ARTICLES_PER_SOURCE,  # Remove redundant min()
   ```

3. **Verify config cap**: Ensure `PUBMED_MAX_RESULTS_PER_CALL` in settings is high enough
   - Default 10,000 should be fine for most cases
   - PubMed API hard limit is 10,000

### For Pagination Support

The infrastructure already supports pagination via the `offset` parameter:
- `search_articles` accepts `offset` parameter
- Metadata includes `total_results` and `offset`
- To get results 51-100: call with `offset=50, max_results=50`

Currently, pipeline only fetches first page (offset=0).

---

## Key Takeaways

1. **Actual results returned**: Limited by pipeline to **50 articles**
2. **Total matching results**: Available in metadata as `total_results` (unlimited)
3. **Main bottleneck**: `PipelineService.MAX_ARTICLES_PER_SOURCE = 50`
4. **Config ceiling**: `PUBMED_MAX_RESULTS_PER_CALL = 10,000` (not reached)
5. **PubMed API limit**: 10,000 results per call (not reached)
6. **Pagination ready**: Infrastructure supports fetching more pages via `offset` parameter
