# Code Structure Checklist

## Backend

### `routers/` - API Layer
- Endpoint definitions (`@router.get`, `@router.post`, etc.)
- **Import and use domain types from `schemas/`** for response models when returning domain objects
- Only define NEW Pydantic models when the API shape is genuinely different (e.g., paginated wrapper, combined response)
- Do NOT duplicate domain types with "Response" suffix - use the actual domain type
- Input validation via Pydantic request models
- Calls services, does NOT contain business logic
- Does NOT make direct database queries

### `services/` - Business Logic Layer
- All business logic lives here
- Database queries (via SQLAlchemy)
- Returns **typed domain objects** from `schemas/` (NOT dicts, NOT Pydantic response models)
- Dicts only when genuine flexibility is needed (rare)
- Does NOT define API-specific types

#### Entity Lookups by ID
Each service that owns a domain object MUST provide canonical lookup methods:

```python
# ✅ GOOD - Canonical method in the owning service
class ResearchStreamService:
    def get_stream_by_id(self, stream_id: int) -> ResearchStream:
        """Raises ValueError if not found."""
        stream = self.db.query(ResearchStream).filter(...).first()
        if not stream:
            raise ValueError(f"Research stream {stream_id} not found")
        return stream

    def get_stream_or_404(self, stream_id: int) -> ResearchStream:
        """Raises HTTPException(404) if not found."""
        try:
            return self.get_stream_by_id(stream_id)
        except ValueError:
            raise HTTPException(status_code=404, detail="Research stream not found")
```

| Method | Exception | Use Case |
|--------|-----------|----------|
| `get_*_by_id(id)` | `ValueError` | Internal services |
| `get_*_or_404(id)` | `HTTPException(404)` | HTTP-facing code |

```python
# ❌ BAD - Inline query with null check (repeated everywhere)
stream = self.db.query(ResearchStream).filter(...).first()
if not stream:
    raise ValueError(f"Stream not found")

# ✅ GOOD - Use the owning service's method
stream = self.research_stream_service.get_stream_by_id(stream_id)
```

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
