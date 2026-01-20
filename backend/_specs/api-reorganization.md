# API Reorganization Spec

## Organizing Principles

1. **`/api/research-streams`** - Stream CRUD and configuration
   - Create, read, update, delete streams
   - All stream configuration: retrieval config, prompt config, LLM phase config
   - AI-assisted generation (propose queries, generate filters)

2. **`/api/operations`** - Pipeline execution and monitoring
   - All pipeline execution (direct SSE and queued via worker)
   - Execution queue management
   - Scheduler management

3. **`/api/retrieval-testing`** - Test retrieval mechanics
   - Test query expressions
   - Test filter criteria
   - Fetch articles by PMID
   - Compare PMID lists (recall/precision)

4. **`/api/prompt-testing`** - Test LLM prompts
   - Get default prompts and available slugs
   - Test summary prompts (article, category, executive)
   - Test categorization prompt
   - Test categorization on articles

5. **Frontend API files map 1:1 to backend routers**
   - `researchStreamApi.ts` → `/api/research-streams`
   - `operationsApi.ts` → `/api/operations`
   - `retrievalTestingApi.ts` → `/api/retrieval-testing`
   - `promptTestingApi.ts` → `/api/prompt-testing`

---

## Current State

### Backend: research_streams.py (`/api/research-streams`)
```
GET    /                                           # List streams
POST   /                                           # Create stream
GET    /{id}                                       # Get stream
PUT    /{id}                                       # Update stream
DELETE /{id}                                       # Delete stream
PATCH  /{id}/status                                # Toggle active
GET    /metadata/sources                           # Get information sources
PATCH  /{id}/retrieval-config/queries/{idx}        # Update query
PATCH  /{id}/retrieval-config/queries/{idx}/semantic-filter  # Update filter
POST   /{id}/retrieval/propose-concepts            # AI: propose concepts
POST   /{id}/retrieval/propose-broad-search        # AI: propose broad search
POST   /{id}/retrieval/generate-broad-filter       # AI: generate filter
POST   /{id}/retrieval/generate-concept-query      # AI: generate query
POST   /{id}/retrieval/generate-concept-filter     # AI: generate filter
POST   /{id}/retrieval/validate-concepts           # AI: validate concepts
POST   /{id}/test-query                            # Test a query        [WRONG PLACE]
POST   /{id}/execute-pipeline                      # Execute pipeline    [WRONG PLACE]
POST   /reports/{id}/compare                       # Compare reports
GET    /{id}/curation-notes                        # Get curation notes
```

### Backend: operations.py (`/api/operations`)
```
GET    /executions                                 # List executions
GET    /executions/{id}                            # Execution details
GET    /streams/scheduled                          # List scheduled streams
PATCH  /streams/{id}/schedule                      # Update schedule
POST   /runs                                       # Trigger queued run
GET    /runs/{id}                                  # Run status
GET    /runs/{id}/stream                           # SSE status updates
DELETE /runs/{id}                                  # Cancel run
```

### Backend: refinement_workbench.py (`/api/refinement-workbench`)
```
POST   /source/run-query                           # Test saved query
POST   /source/test-custom-query                   # Test custom query
POST   /source/manual-pmids                        # Fetch by PMIDs
POST   /filter                                     # Test filter
POST   /categorize                                 # Test categorization  [WRONG PLACE]
POST   /compare                                    # Compare PMIDs
```

### Backend: prompt_workbench.py (`/api/prompt-workbench`)
```
GET    /defaults                                   # Get default prompts
GET    /streams/{id}/enrichment                    # Get enrichment config [WRONG PLACE]
PUT    /streams/{id}/enrichment                    # Update enrichment     [WRONG PLACE]
POST   /test-summary                               # Test summary prompt
GET    /categorization/defaults                    # Get cat defaults
GET    /streams/{id}/categorization                # Get cat config       [WRONG PLACE]
PUT    /streams/{id}/categorization                # Update cat config    [WRONG PLACE]
POST   /categorization/test                        # Test cat prompt
```

### Frontend: researchStreamApi.ts
```
getResearchStreams()                    → GET    /api/research-streams
getResearchStream(id)                   → GET    /api/research-streams/{id}
createResearchStream(data)              → POST   /api/research-streams
updateResearchStream(id, data)          → PUT    /api/research-streams/{id}
deleteResearchStream(id)                → DELETE /api/research-streams/{id}
toggleResearchStreamStatus(id, active)  → PATCH  /api/research-streams/{id}/status
getInformationSources()                 → GET    /api/research-streams/metadata/sources
proposeBroadSearch(id)                  → POST   /api/research-streams/{id}/retrieval/propose-broad-search
generateBroadFilter(id, query)          → POST   /api/research-streams/{id}/retrieval/generate-broad-filter
proposeRetrievalConcepts(id)            → POST   /api/research-streams/{id}/retrieval/propose-concepts
generateConceptQuery(id, concept, src)  → POST   /api/research-streams/{id}/retrieval/generate-concept-query
generateConceptFilter(id, concept)      → POST   /api/research-streams/{id}/retrieval/generate-concept-filter
validateConcepts(id, concepts)          → POST   /api/research-streams/{id}/retrieval/validate-concepts
updateBroadQuery(id, idx, expr)         → PATCH  /api/research-streams/{id}/retrieval-config/queries/{idx}
updateSemanticFilter(id, idx, filter)   → PATCH  /api/research-streams/{id}/retrieval-config/queries/{idx}/semantic-filter
getCurationNotes(id)                    → GET    /api/research-streams/{id}/curation-notes
testSourceQuery(id, request)            → POST   /api/research-streams/{id}/test-query           [WRONG FILE]
executePipeline(id, request)            → POST   /api/research-streams/{id}/execute-pipeline     [WRONG FILE]
runQuery(request)                       → POST   /api/refinement-workbench/source/run-query      [WRONG FILE]
testCustomQuery(request)                → POST   /api/refinement-workbench/source/test-custom-query [WRONG FILE]
fetchManualPMIDs(request)               → POST   /api/refinement-workbench/source/manual-pmids   [WRONG FILE]
filterArticles(request)                 → POST   /api/refinement-workbench/filter                [WRONG FILE]
categorizeArticles(request)             → POST   /api/refinement-workbench/categorize            [WRONG FILE]
comparePMIDs(request)                   → POST   /api/refinement-workbench/compare               [WRONG FILE]
```

### Frontend: operationsApi.ts
```
getExecutionQueue(params)               → GET    /api/operations/executions
getExecutionDetail(id)                  → GET    /api/operations/executions/{id}
getScheduledStreams()                   → GET    /api/operations/streams/scheduled
updateStreamSchedule(id, updates)       → PATCH  /api/operations/streams/{id}/schedule
triggerRun(request)                     → POST   /api/operations/runs
getRunStatus(id)                        → GET    /api/operations/runs/{id}
cancelRun(id)                           → DELETE /api/operations/runs/{id}
subscribeToRunStatus(id, callbacks)     → GET    /api/operations/runs/{id}/stream (SSE)
```

### Frontend: promptWorkbenchApi.ts
```
getDefaults()                           → GET    /api/prompt-workbench/defaults
getStreamEnrichmentConfig(id)           → GET    /api/prompt-workbench/streams/{id}/enrichment   [WRONG FILE]
updateStreamEnrichmentConfig(id, cfg)   → PUT    /api/prompt-workbench/streams/{id}/enrichment   [WRONG FILE]
testSummaryPrompt(request)              → POST   /api/prompt-workbench/test-summary
getCategorizationDefaults()             → GET    /api/prompt-workbench/categorization/defaults
getStreamCategorizationConfig(id)       → GET    /api/prompt-workbench/streams/{id}/categorization [WRONG FILE]
updateStreamCategorizationConfig(id, p) → PUT    /api/prompt-workbench/streams/{id}/categorization [WRONG FILE]
testCategorizationPrompt(request)       → POST   /api/prompt-workbench/categorization/test
```

---

## Target State

### Backend: research_streams.py (`/api/research-streams`)
```
# CRUD
GET    /                                           # List streams
POST   /                                           # Create stream
GET    /{id}                                       # Get stream
PUT    /{id}                                       # Update stream
DELETE /{id}                                       # Delete stream
PATCH  /{id}/status                                # Toggle active
GET    /metadata/sources                           # Get information sources

# Configuration
PATCH  /{id}/retrieval-config/queries/{idx}        # Update query
PATCH  /{id}/retrieval-config/queries/{idx}/semantic-filter  # Update filter
GET    /{id}/enrichment-config                     # Get enrichment config  [NEW]
PUT    /{id}/enrichment-config                     # Update enrichment      [NEW]
GET    /{id}/categorization-prompt                 # Get cat prompt config  [NEW]
PUT    /{id}/categorization-prompt                 # Update cat prompt      [NEW]

# AI-assisted generation
POST   /{id}/retrieval/propose-concepts
POST   /{id}/retrieval/propose-broad-search
POST   /{id}/retrieval/generate-broad-filter
POST   /{id}/retrieval/generate-concept-query
POST   /{id}/retrieval/generate-concept-filter
POST   /{id}/retrieval/validate-concepts

# Other
POST   /reports/{id}/compare
GET    /{id}/curation-notes
```

### Backend: operations.py (`/api/operations`)
```
# Execution queue
GET    /executions                                 # List executions
GET    /executions/{id}                            # Execution details

# Scheduler
GET    /streams/scheduled                          # List scheduled streams
PATCH  /streams/{id}/schedule                      # Update schedule

# Run management
POST   /runs                                       # Trigger queued run
POST   /runs/direct                                # Direct SSE execution   [NEW]
GET    /runs/{id}                                  # Run status
GET    /runs/{id}/stream                           # SSE status updates
DELETE /runs/{id}                                  # Cancel run
```

### Backend: retrieval_testing.py (`/api/retrieval-testing`)
```
POST   /query                                      # Test query expression
POST   /filter                                     # Test filter criteria
POST   /fetch-pmids                                # Fetch articles by PMID
POST   /compare                                    # Compare PMID lists
```

### Backend: prompt_testing.py (`/api/prompt-testing`)
```
GET    /defaults                                   # Get all default prompts
GET    /defaults/categorization                    # Get categorization defaults
POST   /test-summary                               # Test summary prompt
POST   /test-categorization-prompt                 # Test categorization prompt
POST   /test-categorization                        # Test categorization on articles
```

### Frontend: researchStreamApi.ts
```
getResearchStreams()                    → GET    /api/research-streams
getResearchStream(id)                   → GET    /api/research-streams/{id}
createResearchStream(data)              → POST   /api/research-streams
updateResearchStream(id, data)          → PUT    /api/research-streams/{id}
deleteResearchStream(id)                → DELETE /api/research-streams/{id}
toggleResearchStreamStatus(id, active)  → PATCH  /api/research-streams/{id}/status
getInformationSources()                 → GET    /api/research-streams/metadata/sources
updateBroadQuery(id, idx, expr)         → PATCH  /api/research-streams/{id}/retrieval-config/queries/{idx}
updateSemanticFilter(id, idx, filter)   → PATCH  /api/research-streams/{id}/retrieval-config/queries/{idx}/semantic-filter
getEnrichmentConfig(id)                 → GET    /api/research-streams/{id}/enrichment-config
updateEnrichmentConfig(id, config)      → PUT    /api/research-streams/{id}/enrichment-config
getCategorizationPrompt(id)             → GET    /api/research-streams/{id}/categorization-prompt
updateCategorizationPrompt(id, prompt)  → PUT    /api/research-streams/{id}/categorization-prompt
proposeBroadSearch(id)                  → POST   /api/research-streams/{id}/retrieval/propose-broad-search
generateBroadFilter(id, query)          → POST   /api/research-streams/{id}/retrieval/generate-broad-filter
proposeRetrievalConcepts(id)            → POST   /api/research-streams/{id}/retrieval/propose-concepts
generateConceptQuery(id, concept, src)  → POST   /api/research-streams/{id}/retrieval/generate-concept-query
generateConceptFilter(id, concept)      → POST   /api/research-streams/{id}/retrieval/generate-concept-filter
validateConcepts(id, concepts)          → POST   /api/research-streams/{id}/retrieval/validate-concepts
getCurationNotes(id)                    → GET    /api/research-streams/{id}/curation-notes
```

### Frontend: operationsApi.ts
```
getExecutionQueue(params)               → GET    /api/operations/executions
getExecutionDetail(id)                  → GET    /api/operations/executions/{id}
getScheduledStreams()                   → GET    /api/operations/streams/scheduled
updateStreamSchedule(id, updates)       → PATCH  /api/operations/streams/{id}/schedule
triggerRun(request)                     → POST   /api/operations/runs
executeRunDirect(id, request)           → POST   /api/operations/runs/direct
getRunStatus(id)                        → GET    /api/operations/runs/{id}
cancelRun(id)                           → DELETE /api/operations/runs/{id}
subscribeToRunStatus(id, callbacks)     → GET    /api/operations/runs/{id}/stream (SSE)
```

### Frontend: retrievalTestingApi.ts (new)
```
testQuery(request)                      → POST   /api/retrieval-testing/query
testFilter(request)                     → POST   /api/retrieval-testing/filter
fetchByPmids(request)                   → POST   /api/retrieval-testing/fetch-pmids
comparePmids(request)                   → POST   /api/retrieval-testing/compare
```

### Frontend: promptTestingApi.ts (renamed from promptWorkbenchApi.ts)
```
getDefaults()                           → GET    /api/prompt-testing/defaults
getCategorizationDefaults()             → GET    /api/prompt-testing/defaults/categorization
testSummaryPrompt(request)              → POST   /api/prompt-testing/test-summary
testCategorizationPrompt(request)       → POST   /api/prompt-testing/test-categorization-prompt
testCategorization(request)             → POST   /api/prompt-testing/test-categorization
```

---

## Changes Required

### Backend

| File | Change |
|------|--------|
| `research_streams.py` | Add: enrichment-config and categorization-prompt endpoints |
| `research_streams.py` | Remove: `/{id}/test-query`, `/{id}/execute-pipeline` |
| `operations.py` | Add: `POST /runs/direct` (moved from research_streams) |
| `refinement_workbench.py` | Rename file to `retrieval_testing.py` |
| `retrieval_testing.py` | Rename router prefix to `/api/retrieval-testing` |
| `retrieval_testing.py` | Rename endpoints: simplify `/source/*` paths |
| `retrieval_testing.py` | Remove: `/categorize` |
| `prompt_workbench.py` | Rename file to `prompt_testing.py` |
| `prompt_testing.py` | Rename router prefix to `/api/prompt-testing` |
| `prompt_testing.py` | Remove: stream config endpoints |
| `prompt_testing.py` | Add: `/test-categorization` |

### Frontend

| File | Change |
|------|--------|
| `researchStreamApi.ts` | Remove: testSourceQuery, executePipeline |
| `researchStreamApi.ts` | Remove: runQuery, testCustomQuery, fetchManualPMIDs, filterArticles, categorizeArticles, comparePMIDs |
| `researchStreamApi.ts` | Add: getEnrichmentConfig, updateEnrichmentConfig, getCategorizationPrompt, updateCategorizationPrompt |
| `operationsApi.ts` | Add: executeRunDirect |
| `promptWorkbenchApi.ts` | Rename file to `promptTestingApi.ts` |
| `promptTestingApi.ts` | Remove: stream config functions |
| `promptTestingApi.ts` | Add: testCategorization |
| `retrievalTestingApi.ts` | Create new file with: testQuery, testFilter, fetchByPmids, comparePmids |

### Service Layer

| File | Change |
|------|--------|
| `refinement_workbench_service.py` | Rename to `retrieval_testing_service.py` |
| `refinement_workbench_service.py` | Remove: `categorize_articles` method |
| `prompt_workbench_service.py` | Rename to `prompt_testing_service.py` |
| `prompt_testing_service.py` | Add: `test_categorization` method |
