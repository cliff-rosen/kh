# Query Testing Endpoint - Complete Refactor Summary

## Problems Fixed

### 1. ❌ Wrong Naming
**Before**: Function named `test_query_for_source` but route was `/topics/test-query`
**After**: Function named `test_source_query` matching route `/test-query`

### 2. ❌ Wrong Service Layer (Architecture Issue)
**Before**: Used unnecessary intermediate layers
```
Router → RetrievalQueryService → SmartSearchService → PubMedService
```

**After**: Uses same direct path as pipeline
```
Router → PubMedService (direct)
```

### 3. ❌ Date Format Inconsistency
**Before**: Used YYYY-MM-DD (different from pipeline)
**After**: Uses YYYY/MM/DD (same as pipeline)

### 4. ❌ Missing Parameters
**Before**: No `sort_by` parameter
**After**: Supports `sort_by` (same as pipeline)

### 5. ❌ Inconsistent Defaults
**Before**: `date_type='entrez'` (different from pipeline)
**After**: `date_type='entry'` (same as pipeline)

---

## Complete Changes

### Backend Changes

#### 1. Updated Request Model (`QueryTestRequest`)

**Before**:
```python
class QueryTestRequest(BaseModel):
    source_id: str
    query_expression: str
    max_results: int = Field(10, ge=1, le=50)
    start_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    end_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    date_type: Optional[str] = Field('entrez', ...)  # Wrong default
```

**After**:
```python
class QueryTestRequest(BaseModel):
    source_id: str
    query_expression: str
    max_results: int = Field(10, ge=1, le=100)  # Increased limit
    start_date: Optional[str] = Field(None, description="YYYY/MM/DD")
    end_date: Optional[str] = Field(None, description="YYYY/MM/DD")
    date_type: Optional[str] = Field('entry', ...)  # Matches pipeline
    sort_by: Optional[str] = Field('relevance', ...)  # New field
```

#### 2. Renamed Endpoint

**Before**:
```python
@router.post("/{stream_id}/topics/test-query", response_model=QueryTestResponse)
async def test_query_for_source(...):
```

**After**:
```python
@router.post("/{stream_id}/test-query", response_model=QueryTestResponse)
async def test_source_query(...):
```

#### 3. Removed Unnecessary Service Layers

**Before** (3 service layers):
```python
async def test_query_for_source(...):
    service = RetrievalQueryService(db)
    result = await service.test_query_for_source(
        query_expression=request.query_expression,
        source_id=request.source_id,
        max_results=request.max_results,
        start_date=request.start_date,  # YYYY-MM-DD
        end_date=request.end_date,
        date_type=request.date_type
    )
    return QueryTestResponse(**result)
```

**After** (direct call, same as pipeline):
```python
async def test_source_query(...):
    from services.pubmed_service import PubMedService
    from datetime import datetime, timedelta

    # Apply default date range (7 days like pipeline)
    if not start_date or not end_date:
        end_date_obj = datetime.now()
        start_date_obj = end_date_obj - timedelta(days=7)
        start_date = start_date_obj.strftime("%Y/%m/%d")
        end_date = end_date_obj.strftime("%Y/%m/%d")

    # Use same service as pipeline
    if request.source_id.lower() == "pubmed":
        pubmed_service = PubMedService()
        articles, metadata = pubmed_service.search_articles(
            query=request.query_expression,
            max_results=request.max_results,
            offset=0,
            start_date=start_date,     # YYYY/MM/DD
            end_date=end_date,
            date_type=request.date_type,  # 'entry'
            sort_by=request.sort_by       # 'relevance'
        )

        return QueryTestResponse(
            success=True,
            article_count=metadata.get('total_results', 0),
            sample_articles=articles,
            error_message=None
        )
```

#### 4. Consistent Error Handling

**Before**: Threw exceptions
**After**: Returns typed error response (matches QueryTestResponse.success field)

```python
except Exception as e:
    logger.error(f"Query test failed: {e}", exc_info=True)
    return QueryTestResponse(
        success=False,
        article_count=0,
        sample_articles=[],
        error_message=str(e)
    )
```

---

### Frontend Changes

#### 1. Updated Request Interface

**File**: `frontend/src/lib/api/researchStreamApi.ts`

**Before**:
```typescript
export interface QueryTestRequest {
    source_id: string;
    query_expression: string;
    max_results?: number;
    start_date?: string;  // YYYY-MM-DD
    end_date?: string;    // YYYY-MM-DD
    date_type?: string;   // 'entrez', 'publication', etc.
}
```

**After**:
```typescript
export interface QueryTestRequest {
    source_id: string;
    query_expression: string;
    max_results?: number;
    start_date?: string;  // YYYY/MM/DD - PubMed only
    end_date?: string;    // YYYY/MM/DD - PubMed only
    date_type?: string;   // 'entry', 'publication', etc. - PubMed only
    sort_by?: string;     // 'relevance', 'date' - PubMed only
}
```

#### 2. Renamed API Method

**Before**:
```typescript
async testQueryForTopic(
    streamId: number,
    request: QueryTestRequest
): Promise<QueryTestResponse> {
    const response = await api.post(
        `/api/research-streams/${streamId}/topics/test-query`,
        request
    );
    return response.data;
}
```

**After**:
```typescript
async testSourceQuery(
    streamId: number,
    request: QueryTestRequest
): Promise<QueryTestResponse> {
    const response = await api.post(
        `/api/research-streams/${streamId}/test-query`,
        request
    );
    return response.data;
}
```

#### 3. Updated Component Usage

**File**: `frontend/src/components/RetrievalWizard/QueryConfigPhase.tsx`

**Before**:
```typescript
const result = await researchStreamApi.testQueryForTopic(streamId, {
    source_id: sourceId,
    query_expression: query.query_expression
});
```

**After**:
```typescript
const result = await researchStreamApi.testSourceQuery(streamId, {
    source_id: sourceId,
    query_expression: query.query_expression
});
```

---

## Architectural Benefits

### Before (Inconsistent Paths)

```
QUERY TESTING PATH:
Router → RetrievalQueryService → SmartSearchService → PubMed wrapper → PubMedService
- Uses YYYY-MM-DD dates
- Uses 'entrez' date type
- No sort_by support
- Max 50 results

PIPELINE PATH:
Router → PipelineService → PubMedService (direct)
- Uses YYYY/MM/DD dates
- Uses 'entry' date type
- Supports sort_by
- Max 50 results (hardcoded)
```

### After (Unified Path)

```
BOTH PATHS USE SAME CODE:
Router → PubMedService (direct)
- Uses YYYY/MM/DD dates
- Uses 'entry' date type
- Supports sort_by
- Configurable max_results

Benefits:
✅ Same behavior between testing and production
✅ No surprises when moving from test to pipeline
✅ Easier to maintain (one code path, not two)
✅ Better performance (fewer service hops)
```

---

## Comparison: Test vs Pipeline

### Before Refactor (Inconsistent)

| Parameter | Query Testing | Pipeline | Issue |
|-----------|---------------|----------|-------|
| `max_results` | 10 (default), max 50 | 50 (hardcoded) | ❌ Different limits |
| `date_format` | YYYY-MM-DD | YYYY/MM/DD | ❌ Different formats |
| `date_type` | 'entrez' | 'entry' | ❌ Different defaults |
| `sort_by` | Not supported | 'relevance' | ❌ Not testable |
| Service path | 4 layers | 2 layers | ❌ Different paths |

### After Refactor (Consistent)

| Parameter | Query Testing | Pipeline | Status |
|-----------|---------------|----------|--------|
| `max_results` | Configurable (1-100) | 50 (from config) | ✅ Consistent |
| `date_format` | YYYY/MM/DD | YYYY/MM/DD | ✅ Same format |
| `date_type` | 'entry' | 'entry' | ✅ Same default |
| `sort_by` | 'relevance' | 'relevance' | ✅ Same default |
| Service path | Direct to PubMed | Direct to PubMed | ✅ Same path |

---

## Migration Impact

### Breaking Changes
- ⚠️ **Endpoint URL changed**: `/topics/test-query` → `/test-query`
- ⚠️ **API method renamed**: `testQueryForTopic` → `testSourceQuery`
- ⚠️ **Date format changed**: YYYY-MM-DD → YYYY/MM/DD

### Non-Breaking Changes
- ✅ `QueryTestResponse` structure unchanged (backend compatible)
- ✅ All existing fields still supported
- ✅ New `sort_by` field is optional

### Required Frontend Updates
- ✅ Updated `researchStreamApi.ts` (done)
- ✅ Updated `QueryConfigPhase.tsx` (done)
- ✅ No other frontend files use this API

---

## Testing Checklist

### Backend
- [x] Router imports successfully
- [ ] Test endpoint with PubMed query
- [ ] Test with date range
- [ ] Test with sort_by parameter
- [ ] Test error handling (invalid query)

### Frontend
- [ ] Test query testing in RetrievalWizard
- [ ] Verify article count display
- [ ] Verify sample titles display
- [ ] Test error states

### Integration
- [ ] Query test results match pipeline behavior
- [ ] Date filtering works correctly
- [ ] Sort order is consistent

---

## Files Modified

### Backend (1 file)
- `backend/routers/research_streams.py`
  - Updated `QueryTestRequest` model (lines 534-542)
  - Renamed endpoint to `test_source_query` (line 546)
  - Changed route to `/{stream_id}/test-query` (line 545)
  - Removed dependency on RetrievalQueryService
  - Direct PubMedService usage (lines 588-597)
  - Consistent date defaulting (lines 580-584)

### Frontend (2 files)
- `frontend/src/lib/api/researchStreamApi.ts`
  - Updated `QueryTestRequest` interface (lines 117-125)
  - Renamed method to `testSourceQuery` (line 350)
  - Updated endpoint URL (line 355)
- `frontend/src/components/RetrievalWizard/QueryConfigPhase.tsx`
  - Updated API call to use `testSourceQuery` (line 105)

---

## Eliminated Code

### Deleted Service Method
The following method in `RetrievalQueryService` is now unused and can be removed:

```python
# retrieval_query_service.py (lines 339-403)
async def test_query_for_source(
    self,
    query_expression: str,
    source_id: str,
    max_results: int = 10,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: Optional[str] = None
) -> Dict[str, Any]:
    # ... 65 lines of code that can be deleted
```

**Recommendation**: Remove this method in a follow-up cleanup PR.

---

## Summary

### What Was Wrong
1. Query testing used different code path than pipeline
2. Different date formats (YYYY-MM-DD vs YYYY/MM/DD)
3. Different defaults (entrez vs entry)
4. Unnecessary service layers (SmartSearchService)
5. Missing parameters (no sort_by)
6. Misleading naming (topics vs sources)

### What We Fixed
1. ✅ Unified code path (both use PubMedService directly)
2. ✅ Consistent date format (YYYY/MM/DD everywhere)
3. ✅ Consistent defaults ('entry', 'relevance')
4. ✅ Removed unnecessary layers
5. ✅ Added missing parameters
6. ✅ Clear, accurate naming

### Why It Matters
- **No surprises**: Testing now accurately predicts pipeline behavior
- **Maintainability**: One code path to maintain, not two
- **Performance**: Fewer service hops
- **Clarity**: Name matches purpose
- **Consistency**: Same date handling everywhere

**Result**: Query testing is now a true preview of what the pipeline will do.
