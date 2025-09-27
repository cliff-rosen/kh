## Smart Search 2 — Filtering and Retrieval Limits


On PubMed initial search
- we retrieve up to 50 records
- we show the total available
- if lt total and lt 500 have been retrieved, allow retrieve next page?
- we need to communicate if total >500 that only first 500 are filtered





### Summary
- Frontend pre-filter cap: MAX_ARTICLES_TO_FILTER = 500 in `frontend/src/context/SmartSearch2Context.tsx`.
- Backend SmartSearch2 filter endpoint: no server-side count cap; concurrency limited to 500 evaluations.
- Per-call search limits:
  - PubMed: `settings.PUBMED_MAX_RESULTS_PER_CALL` (default 10000) enforced as `retmax`.
  - Google Scholar: `settings.GOOGLE_SCHOLAR_MAX_RESULTS_PER_CALL` (default 20); service paginates.
  - SmartSearch2 `/search`: request model caps `max_results` ≤ 1000 per call.
- Frontend batching when retrieving before filtering: PubMed 50 initial / 100 load-more; Scholar 20 per call.

### Frontend caps and batching
- Cap used before filtering (auto-retrieval target):
  - `frontend/src/context/SmartSearch2Context.tsx`:
```24:25:frontend/src/context/SmartSearch2Context.tsx
const MAX_ARTICLES_TO_FILTER = 500;
```
- Auto-retrieval up to the cap; batches sized by source:
```896:906:frontend/src/context/SmartSearch2Context.tsx
// Calculate how many more articles to retrieve (up to MAX_ARTICLES_TO_FILTER total)
const currentCount = articles.length;
const availableCount = pagination.total_available;
const targetCount = Math.min(availableCount, MAX_ARTICLES_TO_FILTER);
const remainingToFetch = targetCount - currentCount;

// Check if we're hitting the MAX_ARTICLES_TO_FILTER limit
limitApplied = availableCount > MAX_ARTICLES_TO_FILTER;
```
```920:933:frontend/src/context/SmartSearch2Context.tsx
// Fetch remaining articles in batches - use max allowed by backend
const batchSize = selectedSource === 'google_scholar' ? 20 : 100;
let offset = currentCount;
const additionalArticles: SmartSearchArticle[] = [];

while (offset < targetCount) {
  const resultsToFetch = Math.min(batchSize, targetCount - offset);

  const batchResults = await smartSearch2Api.search({
      query: searchQuery,
      source: selectedSource,
      max_results: resultsToFetch,
      offset: offset
  });
```
- Initial and load-more request sizes:
```308:314:frontend/src/context/SmartSearch2Context.tsx
max_results: selectedSource === 'google_scholar' ? 20 : 50,
```
```348:356:frontend/src/context/SmartSearch2Context.tsx
const batchSize = count || (selectedSource === 'google_scholar' ? 20 : 100);
```

### Backend search per-call caps (providers)
- Settings (defaults):
```37:43:backend/config/settings.py
GOOGLE_SCHOLAR_MAX_RESULTS_PER_CALL: int = int(os.getenv("GOOGLE_SCHOLAR_MAX_RESULTS_PER_CALL", "20"))
PUBMED_MAX_RESULTS_PER_CALL: int = int(os.getenv("PUBMED_MAX_RESULTS_PER_CALL", "10000"))
```
- PubMed service clamps `retmax` to setting:
```312:316:backend/services/pubmed_service.py
def _get_max_results_per_call(self) -> int:
    from config.settings import settings
    return settings.PUBMED_MAX_RESULTS_PER_CALL
```
```443:448:backend/services/pubmed_service.py
'retmax': min(max_results, self._get_max_results_per_call()),
```
- Google Scholar service batches by setting and paginates:
```321:325:backend/services/google_scholar_service.py
def _get_max_results_per_call(self) -> int:
    from config.settings import settings
    return settings.GOOGLE_SCHOLAR_MAX_RESULTS_PER_CALL
```
```355:369:backend/services/google_scholar_service.py
batch_size = self._get_max_results_per_call()
while len(all_articles) < target_results:
    current_batch_size = min(batch_size, remaining)
```

### SmartSearch2 API request guard
- Per-call guard on request body (independent of providers):
```42:48:backend/routers/smart_search2.py
max_results: int = Field(50, ge=1, le=1000, description="Maximum results to return")
```

### Backend filtering behavior
- SmartSearch2 filtering endpoint filters whatever the client sends (no explicit count cap):
```87:96:backend/routers/smart_search2.py
class ArticleFilterRequest(BaseModel):
    articles: List[CanonicalResearchArticle]
    filter_condition: str
    strictness: str = "medium"
```
- Concurrency control (performance/cost):
```865:873:backend/services/smart_search_service.py
semaphore = asyncio.Semaphore(500)
```

### Differences vs legacy session-based workflow
- Legacy session flow caps overall filtering to `settings.MAX_ARTICLES_TO_FILTER` before searching:
```41:43:backend/config/settings.py
MAX_ARTICLES_TO_FILTER: int = int(os.getenv("MAX_ARTICLES_TO_FILTER", "500"))
```
```1447:1451:backend/services/smart_search_service.py
max_results = min(max_results, settings.MAX_ARTICLES_TO_FILTER)
```
- Smart Search 2 (session-less) currently enforces the overall cap only on the frontend via `MAX_ARTICLES_TO_FILTER`.

### Recommendations for revision
- Unify cap source: expose backend setting to frontend and remove hard-coded client constant.
- Consider server-side cap or chunking on `/smart-search-2/filter-articles` for safety.
- Tune batch sizes (e.g., PubMed 100–200; Scholar remains ~20) and raise per-call API guard if infra allows.
- Make concurrency configurable and rate-aware.


