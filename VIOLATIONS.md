# Operations Code Violations Analysis

## Checklist Reference

| Layer | Location | Contains |
|-------|----------|----------|
| **Backend Router** | `routers/` | Endpoint definitions, Pydantic request/response models, input validation |
| **Backend Service** | `services/` | Business logic, DB queries, returns **typed domain objects from schemas/** |
| **Backend Schemas** | `schemas/` | Domain/business Pydantic models (NOT API response shapes) |
| **Frontend API** | `lib/api/` | API client functions, API-specific TypeScript types |
| **Frontend Types** | `types/` | Domain TypeScript types (NOT API response shapes) |

---

## Backend Router: `routers/operations.py`

| Rule | Status | Notes |
|------|--------|-------|
| Endpoint definitions | ✅ PASS | Has @router.get, @router.post, etc. |
| Pydantic response models | ✅ PASS | 15 response models defined |
| Input validation | ✅ PASS | Uses Pydantic request models |
| Calls services (no business logic) | ✅ PASS | Delegates to OperationsService |
| No direct DB queries | ✅ PASS | No db.query() calls |

**Router is CORRECT.**

---

## Backend Service: `services/operations_service.py`

| Rule | Status | Notes |
|------|--------|-------|
| Contains business logic | ✅ PASS | All logic here |
| Database queries | ✅ PASS | Uses SQLAlchemy |
| Returns typed domain objects | ❌ **FAIL** | Returns `Dict[str, Any]` everywhere |
| No API-specific types | ✅ PASS | No response models |

### VIOLATIONS:

**Every method returns `Dict[str, Any]` instead of typed domain objects:**

```python
# Line 46 - VIOLATION
def get_execution_queue(...) -> Dict[str, Any]:

# Line 156 - VIOLATION
def get_execution_detail(...) -> Dict[str, Any]:

# Line 308 - VIOLATION
def approve_report(...) -> Dict[str, Any]:

# Line 330 - VIOLATION
def reject_report(...) -> Dict[str, Any]:

# Line 354 - VIOLATION
def get_scheduled_streams(...) -> List[Dict[str, Any]]:

# Line 429 - VIOLATION
def update_stream_schedule(...) -> Dict[str, Any]:
```

**Should return domain objects from `schemas/`** like:
- `schemas.research_stream.PipelineExecution`
- `schemas.report.Report`
- `schemas.research_stream.ScheduleConfig`

---

## Frontend API: `lib/api/operationsApi.ts`

| Rule | Status | Notes |
|------|--------|-------|
| API client functions | ✅ PASS | Has all fetch functions |
| API-specific response types | ✅ PASS | `ExecutionQueueResponse`, `ExecutionDetail` |
| Domain types imported from `types/` | ❌ **FAIL** | Duplicates domain types |

### VIOLATIONS:

**Duplicates domain types that already exist in `types/`:**

| Type in `operationsApi.ts` | Already exists in |
|----------------------------|-------------------|
| `ExecutionStatus` (line 9) | `types/research-stream.ts:22` |
| `ApprovalStatus` (line 10) | `types/report.ts:3` |
| `RunType` (line 11) | `types/research-stream.ts:25` |
| `ScheduleConfig` (line 112) | `types/research-stream.ts:47` |
| `ReportArticle` (line 44) | `types/report.ts:10` (DIFFERENT SHAPE!) |

**Should import from `types/` and only define API-specific response shapes.**

---

## Summary

| File | Violations |
|------|------------|
| `routers/operations.py` | 0 |
| `services/operations_service.py` | **6** (all methods return dicts) |
| `lib/api/operationsApi.ts` | **5** (duplicated domain types) |

---

## Fixes Required

### 1. Backend Service (HIGH PRIORITY)
Create or use domain objects in `schemas/` and return them instead of dicts:
- Need: `ExecutionQueueResult`, `ExecutionDetail`, `ApprovalResult`, `ScheduledStreamInfo`
- These are domain concepts, not API shapes

### 2. Frontend API (MEDIUM PRIORITY)
Import domain types from `types/`:
```typescript
import { ExecutionStatus, RunType, ScheduleConfig, PipelineExecution } from '../../types/research-stream';
import { ApprovalStatus, ReportArticle } from '../../types/report';
```

Keep only API-specific response shapes in `operationsApi.ts`:
- `ExecutionQueueResponse`
- `ExecutionDetail` (extends domain types)
- `ScheduledStream` (API response wrapper)
