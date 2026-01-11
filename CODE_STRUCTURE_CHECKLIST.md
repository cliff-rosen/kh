# Code Structure Checklist

## Backend

### `routers/` - API Layer
- Endpoint definitions (`@router.get`, `@router.post`, etc.)
- Calls services, does NOT contain business logic
- Does NOT make direct database queries

#### Routers Always Return Pydantic Schemas

Routers receive Models from services and convert them to Schemas before returning. These schemas come from one of two places:

**1. Domain schemas** (from `schemas/{domain}.py`):
- Represent business/domain concepts: `Report`, `Article`, `ResearchStream`
- Shared across multiple endpoints
- Import them, do NOT redefine them in the router

**2. Router-specific schemas** (defined in the router file):
- Named `{Action}Request` and `{Action}Response`
- Used for endpoint-specific shapes (pagination, combined responses, etc.)
- **Wrap domain objects** rather than duplicating their fields

```python
# ✅ CORRECT - Router-specific schema wraps domain object
class ReportsListResponse(BaseModel):
    reports: List[Report]  # Domain object from schemas/
    total: int
    page: int

# ✅ CORRECT - Return domain object directly when no wrapper needed
@router.get("/{report_id}", response_model=Report)
async def get_report(...):
    ...

# ❌ WRONG - Duplicating domain fields in router-specific schema
class ReportResponse(BaseModel):
    report_id: int        # Don't copy fields from Report
    report_name: str      # Just use Report directly
    ...
```

#### Schema Source Decision

| What you're returning | Schema source |
|----------------------|---------------|
| Single domain object | `schemas/{domain}.py` → use directly |
| List of domain objects | Router: `List[DomainObject]` or wrapper |
| Domain object + metadata | Router: wrapper that contains the domain object |
| Transformed/combined domain objects (API-only) | Router: `{Action}Response` with custom fields |
| Request payload | Router: `{Action}Request` |

### `services/` - Business Logic Layer
- All business logic lives here
- Database queries (via SQLAlchemy)
- Returns **SQLAlchemy Models** (from `models/`), NOT Pydantic schemas
- Routers convert Models to Schemas at the API boundary
- Does NOT define API-specific types

#### Services Return Models, Routers Convert to Schemas

**This is a hard rule.** Services work with SQLAlchemy models internally. Routers convert to Pydantic schemas at the API boundary.

```python
# ✅ CORRECT - Service returns Model
class ReportService:
    def get_report(self, report_id: int, user_id: int) -> Report:  # SQLAlchemy model
        return self.db.query(Report).filter(...).first()

# ✅ CORRECT - Router converts to Schema
@router.get("/{report_id}", response_model=ReportSchema)
async def get_report(report_id: int, ...):
    report = service.get_report(report_id, user_id)  # Model
    return ReportSchema.from_orm(report)             # Schema

# ❌ WRONG - Service returns Schema
class ReportService:
    def get_report(self, ...) -> ReportSchema:  # NO!
        report = self.db.query(Report).filter(...).first()
        return ReportSchema.from_orm(report)  # Conversion belongs in router
```

#### Service Return Types

| Data type | Service returns | Router conversion |
|-----------|-----------------|-------------------|
| Database entity | SQLAlchemy Model | `Schema.from_orm(model)` |
| Model + computed data | Dataclass containing Model | Manual field mapping |
| Computed/aggregated data (no Model) | Dataclass | `Schema(**asdict(dataclass))` |
| Never return | `dict`, Pydantic schema | - |

#### Computed Data Patterns

**Case 1: Model + computed data**

```python
# In service file
from dataclasses import dataclass

@dataclass
class ReportWithCount:
    report: Report       # SQLAlchemy model
    article_count: int   # Computed value

class ReportService:
    def get_report_with_count(self, report_id: int) -> ReportWithCount:
        report = self.db.query(Report).filter(...).first()
        count = self.association_service.count_visible(report_id)
        return ReportWithCount(report=report, article_count=count)
```

```python
# In router file
@router.get("/{report_id}", response_model=ReportWithCountResponse)
async def get_report(...):
    result = service.get_report_with_count(report_id)
    return ReportWithCountResponse(
        **ReportSchema.from_orm(result.report).dict(),  # Spread model fields
        article_count=result.article_count               # Add computed field
    )
```

**Case 2: Computed/aggregated data with no Model equivalent**

When the API needs a custom shape that doesn't map to any Model (e.g., analytics, aggregations, transformations), define dataclasses in the service file:

```python
# In service file
from dataclasses import dataclass, asdict

@dataclass
class GroupAnalytics:
    group_id: str
    total: int
    duplicates: int

@dataclass
class PipelineAnalytics:
    report_id: int
    summary: PipelineAnalyticsSummary
    by_group: List[GroupAnalytics]

class ReportService:
    def get_pipeline_analytics(self, report_id: int) -> PipelineAnalytics:
        # ... compute analytics ...
        return PipelineAnalytics(report_id=report_id, summary=..., by_group=...)
```

```python
# In router file - define matching response schemas
class GroupAnalyticsResponse(BaseModel):
    group_id: str
    total: int
    duplicates: int

class PipelineAnalyticsResponse(BaseModel):
    report_id: int
    summary: PipelineAnalyticsSummaryResponse
    by_group: List[GroupAnalyticsResponse]

@router.get("/{report_id}/analytics", response_model=PipelineAnalyticsResponse)
async def get_analytics(...):
    analytics = service.get_pipeline_analytics(report_id)  # Returns dataclass
    return PipelineAnalyticsResponse(**asdict(analytics))  # Convert to schema
```

#### Entity Lookups: `find()` vs `get()`

Services MUST use consistent naming for retrieval methods:

| Method | Returns | Use Case |
|--------|---------|----------|
| `find(...)` | `Optional[Model]` | Existence checks, may not exist |
| `get(...)` | `Model` (raises 404 if not found) | Retrieval of known records |

```python
class ReportArticleAssociationService:
    def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Returns None if not found. Use for existence checks."""
        return self.db.query(...).first()

    def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Raises HTTPException 404 if not found. Use for known records."""
        association = self.find(report_id, article_id)
        if not association:
            raise HTTPException(status_code=404, detail="Not found")
        return association
```

Usage:
```python
# Checking if something exists
existing = self.association_service.find(report_id, article_id)
if existing:
    # Handle existing case
    ...

# Retrieving a record that must exist
association = self.association_service.get(report_id, article_id)  # Raises if not found
```

#### Service Boundaries - No Cross-Service Inline Queries

Each domain entity has an owning service. Services MUST use other services for tables they don't own.

```python
# ❌ WRONG - ReportService writing inline queries for WipArticle
class ReportService:
    def get_articles(self, execution_id: str):
        return self.db.query(WipArticle).filter(...).all()  # NO!

# ✅ CORRECT - ReportService uses WipArticleService
class ReportService:
    def get_articles(self, execution_id: str):
        return self.wip_article_service.get_by_execution_id(execution_id)
```

**Service ownership:**
| Table | Owning Service |
|-------|----------------|
| `Report` | `ReportService` |
| `WipArticle` | `WipArticleService` |
| `ReportArticleAssociation` | `ReportArticleAssociationService` |
| `Article` | `ArticleService` |
| `User` | `UserService` |
| `ResearchStream` | `ResearchStreamService` |

### `models/` - Database Layer
- SQLAlchemy ORM models (table definitions)
- Database relationships
- Enums used in database columns

### `schemas/` - Domain Objects
- Pydantic models representing **business/domain concepts**
- Shared across services
- NOT for API-specific response shapes (those go in routers)
- Examples: `Report`, `ReportArticle`, `ResearchStream`, `PipelineExecution`

---

## Logging

### Every Router Must Have

```python
import logging

logger = logging.getLogger(__name__)
```

### Endpoint Logging Pattern

Every endpoint MUST log:
1. **Entry** - When the endpoint is called (INFO level)
2. **Exit** - When returning successfully (INFO level)
3. **Errors** - Any exceptions (ERROR level with exc_info)

```python
@router.post("/analyze")
async def analyze_document(request: AnalyzeRequest, ...):
    logger.info(f"analyze_document called - user_id={current_user.user_id}")

    try:
        result = service.analyze(request.document_id)
        logger.info(f"analyze_document complete - user_id={current_user.user_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analyze_document failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

### Log Levels

| Level | When | Example |
|-------|------|---------|
| DEBUG | Detailed diagnostic info | `logger.debug(f"Token expires in {seconds}s")` |
| INFO | Normal operations | `logger.info(f"Report generated - report_id={id}")` |
| WARNING | Recoverable issues | `logger.warning(f"Stream not found - user_id={user_id}")` |
| ERROR | Failures with exc_info | `logger.error(f"Failed: {e}", exc_info=True)` |

### Log Message Format

Always include context: `user_id`, `resource_id`, `operation`

```python
# ✅ GOOD
logger.info(f"delete_report - user_id={user_id}, report_id={report_id}")

# ❌ BAD
logger.info("Deleting report")
```

---

## Exception Handling

### Router Exception Pattern

```python
@router.post("/operation", response_model=ResponseSchema)
async def operation(request: RequestSchema, ...):
    logger.info(f"operation called - user_id={current_user.user_id}")

    try:
        result = service.do_operation(request, current_user.user_id)
        logger.info(f"operation complete - user_id={current_user.user_id}")
        return result
    except HTTPException:
        # Let HTTP exceptions pass through unchanged
        raise
    except ValueError as e:
        # Known business logic errors → 400
        logger.warning(f"operation validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected errors → 500
        logger.error(f"operation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

### Service Exceptions

Services raise:
- `HTTPException(404)` - Resource not found
- `HTTPException(403)` - Access denied (but prefer 404 to avoid revealing existence)
- `ValueError` - Invalid input/state (router converts to 400)
- Regular exceptions for unexpected errors (router converts to 500)

### Security: Use 404 for Unauthorized Access

Don't reveal that a resource exists if user can't access it:

```python
# ✅ CORRECT - Don't reveal existence
raise HTTPException(status_code=404, detail="Report not found")

# ❌ WRONG - Reveals the report exists
raise HTTPException(status_code=403, detail="Not authorized to access this report")
```

---

## Frontend

### `lib/api/` - API Client Layer
- API client functions
- **Import and use domain types from `types/`** - do NOT duplicate them
- Only define NEW types when the API shape is genuinely different (e.g., paginated wrapper, combined response)
- Do NOT create duplicates of domain types - import them

#### API Request Methods

**Standard requests** - Use the `api` instance from `index.ts`:
```typescript
import { api } from './index';

// GET request
const response = await api.get<MyType>('/api/endpoint');
return response.data;

// POST request
const response = await api.post<MyType>('/api/endpoint', requestBody);
return response.data;
```

**Streaming responses (async generator)** - Use `makeStreamRequest` from `streamUtils.ts`:
```typescript
import { makeStreamRequest } from './streamUtils';

// For endpoints that stream chunks of data (e.g., LLM responses)
for await (const chunk of makeStreamRequest('/api/chat/stream', params, 'POST')) {
    // chunk.data contains the raw streamed data
    processChunk(chunk.data);
}
```

**Server-Sent Events (SSE)** - Use `subscribeToSSE` from `streamUtils.ts`:
```typescript
import { subscribeToSSE } from './streamUtils';

// For endpoints that push discrete events (e.g., job status updates)
const cleanup = subscribeToSSE<MyEventType>(
    '/api/events/stream',
    (event) => handleEvent(event),      // Called for each parsed event
    (error) => handleError(error),      // Called on error
    () => handleComplete()              // Called when stream ends
);

// Call cleanup() to close the connection
```

#### When to Use Each Method

| Method | Use Case | Data Format |
|--------|----------|-------------|
| `api.get/post/etc` | Standard request-response | JSON |
| `makeStreamRequest` | Continuous data stream (LLM output) | Raw chunks |
| `subscribeToSSE` | Discrete event notifications (status updates) | Parsed JSON events |

#### Token Handling

**NEVER access localStorage directly for tokens.** All methods above handle auth automatically:

- `api` instance: Token injected via axios interceptor
- `makeStreamRequest`: Uses `getAuthToken()` internally
- `subscribeToSSE`: Uses `getAuthToken()` internally

If you need the token for a special case (rare), use:
```typescript
import { getAuthToken } from './index';
const token = getAuthToken(); // Handles main app + standalone apps (pubmed, trialscout)
```

### `types/` - Domain Types
- TypeScript types representing **business/domain concepts**
- Shared across components
- NOT for API-specific response shapes (those go in api files)

---

## Quick Decision Guide

| What you're creating | Backend location | Frontend location |
|---------------------|------------------|-------------------|
| API response shape | `routers/` | `lib/api/` |
| API request shape | `routers/` | `lib/api/` |
| Business/domain object | `schemas/` | `types/` |
| Database table | `models/` | N/A |
| Business logic | `services/` | N/A |
| API endpoint | `routers/` | N/A |
| API client function | N/A | `lib/api/` |
