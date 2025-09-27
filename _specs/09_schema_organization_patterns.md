# Schema Organization Patterns

This document outlines the established patterns for organizing schemas and types in the Jam Bot codebase.

## Overview

The codebase follows a clear separation between API-specific schemas and domain models, ensuring maintainability and reusability across the application.

## Schema Organization Pattern

### 1. Inline Router Schemas (Request/Response Models)

**Location**: Directly in router files (e.g., `backend/routers/hop.py`)

**Purpose**: API-specific request and response models for HTTP endpoints

**Characteristics**:
- Defined as Pydantic BaseModel classes within router files
- Specific to individual API endpoints
- Not intended for reuse outside their router

**Example**:
```python
# backend/routers/extraction.py
class ExtractionRequest(BaseModel):
    """Request model for data extraction."""
    items: List[Dict[str, Any]] = Field(..., description="List of items to extract data from")
    result_schema: Dict[str, Any] = Field(..., description="JSON schema defining the structure")
    extraction_instructions: str = Field(..., description="Natural language instructions")

class ExtractionResponse(BaseModel):
    """Response model for extraction operations."""
    results: List[Dict[str, Any]] = Field(..., description="List of extraction results")
    metadata: Dict[str, Any] = Field(..., description="Extraction metadata")
    success: bool = Field(..., description="Whether the extraction was successful")
```

### 2. Schemas Folder (Domain & Canonical Types)

**Location**: `/backend/schemas/` directory

**Purpose**: Core domain models and canonical types shared across the application

**Types of schemas in this folder**:

#### Domain Models
Represent core business entities used throughout the application:
- `workflow.py`: `Hop`, `Mission`, `ToolStep`
- `chat.py`: `Chat`, `ChatMessage`, `MessageRole`
- `user_session.py`: `UserSession`
- `asset.py`: `Asset`, `DatabaseEntityMetadata`

#### Canonical Types
Standardized data structures for common data types:
- `canonical_types.py`: 
  - `CanonicalEmail`
  - `CanonicalSearchResult`
  - `CanonicalWebpage`
  - `CanonicalPubMedArticle`
  - `CanonicalScholarArticle`

#### Shared Response Models
Reusable response structures used across multiple routers:
- `email.py`: `EmailAgentResponse`, `EmailSearchParams`
- `chat.py`: `AgentResponse`, `StatusResponse`

## Import Patterns

Routers import from the schemas folder when they need:

```python
# Importing domain models
from schemas.workflow import Hop, Mission, ToolStep

# Importing canonical types
from schemas.canonical_types import CanonicalSearchResult, CanonicalScholarArticle

# Importing shared response models
from schemas.chat import AgentResponse
```

## Decision Guide

### When to Define Schemas Inline in Routers

✅ **Use inline schemas when**:
- The schema is specific to a single API endpoint
- It's a request or response model for HTTP operations
- The schema won't be reused elsewhere in the codebase
- Examples: `CreateHopRequest`, `GoogleScholarSearchRequest`, `ExtractionResponse`

### When to Place Schemas in the Schemas Folder

✅ **Use the schemas folder when**:
- The schema represents a core domain entity (e.g., `Hop`, `Mission`)
- The schema defines a canonical data type (e.g., `CanonicalScholarArticle`)
- Multiple routers or services need to use the same schema
- The schema is part of the business logic layer
- Examples: `Asset`, `CanonicalEmail`, `UserSession`

## Example: Google Scholar Implementation

The Google Scholar feature correctly follows this pattern:

1. **Router schemas** (`backend/routers/google_scholar.py`):
   ```python
   class GoogleScholarSearchRequest(BaseModel):  # API-specific request
       query: str
       num_results: int = 10
   
   class GoogleScholarSearchResponse(BaseModel):  # API-specific response
       results: List[CanonicalScholarArticle]
       total_results: int
   ```

2. **Domain schemas** (`backend/schemas/canonical_types.py`):
   ```python
   class CanonicalScholarArticle(BaseModel):  # Canonical type
       title: str
       link: Optional[str]
       authors: List[str]
       # ... other fields
   ```

3. **Feature schemas** (`backend/schemas/scholar_features.py`):
   ```python
   class ScholarArticleFeatures(BaseModel):  # Domain-specific feature model
       poi_relevance: PoIRelevance
       doi_relevance: DoIRelevance
       # ... other fields
   ```

## Frontend Type Synchronization

Frontend TypeScript types should mirror backend schemas:

- Backend: `/backend/schemas/canonical_types.py`
- Frontend: `/frontend/src/types/canonical_types.ts`

Both files must be kept in sync, especially for canonical types that are used across the full stack.

## Benefits of This Pattern

1. **Separation of Concerns**: API contracts stay with their endpoints, domain models are centralized
2. **Maintainability**: Request/response models are easy to find and modify alongside their endpoints
3. **Reusability**: Domain models in schemas folder can be imported by multiple components
4. **Clear Intent**: It's obvious which schemas are API-specific vs. business logic
5. **Type Safety**: Centralized canonical types ensure consistency across the codebase

## Anti-Patterns to Avoid

❌ **Don't**:
- Define domain models inline in routers
- Create duplicate canonical types in multiple locations
- Put API-specific request/response models in the schemas folder
- Mix API contracts with business logic schemas

## Summary

The pattern is: **Keep API contracts local, centralize domain models**. This ensures that:
- Developers can quickly find and modify endpoint-specific schemas
- Domain models remain consistent and reusable
- The codebase maintains clear boundaries between API and business logic layers