# Smart Search Typing System Architecture

## Overview

The Smart Search feature implements a sophisticated typing system that separates concerns between API contracts and domain models. This system provides type safety, maintainability, and clear separation of responsibilities across the application layers.

## Architecture Principles

### 1. **Separation of Concerns**
- **API Contract Types**: Defined in the router file (`routers/smart_search.py`)
- **Domain Models**: Defined in the schemas file (`schemas/smart_search.py`)
- **Service Return Types**: Defined in schemas when they represent domain concepts

### 2. **Type Categories**

#### **API Request/Response Types (Router-Defined)**
These types are specific to HTTP endpoints and define the API contract:

**Location**: `routers/smart_search.py`
**Purpose**: Define the exact structure of data coming into and going out of API endpoints
**Naming Pattern**: `{Operation}{Request|Response}`

Examples:
```python
class EvidenceSpecificationRequest(BaseModel):
    query: str
    max_results: int = 50
    session_id: Optional[str] = None

class EvidenceSpecificationResponse(BaseModel):
    original_query: str
    evidence_specification: str
    session_id: str
```

#### **Domain Models (Schema-Defined)**
These represent core business objects that exist across the application:

**Location**: `schemas/smart_search.py`
**Purpose**: Define reusable business objects that multiple services/layers use
**Naming Pattern**: `{Entity}` or `{Concept}Model`

Examples:
```python
class SearchArticle(BaseModel):
    """Core article representation"""
    id: str
    title: str
    abstract: str
    authors: List[str]
    # ...

class FilteredArticle(BaseModel):
    """Article with filtering metadata"""
    article: SearchArticle
    passed: bool
    confidence: float
    reasoning: str
```

#### **Service Return Types (Schema-Defined)**
When services return complex structures that represent domain concepts:

**Location**: `schemas/smart_search.py`
**Purpose**: Provide type safety for service layer returns without exposing internals
**Naming Pattern**: `{Service}{Operation}Result`

Examples:
```python
class SearchServiceResult(BaseModel):
    """Result from search operations"""
    articles: List[SearchArticle]
    pagination: SearchPaginationInfo
    sources_searched: List[str]

class OptimizedQueryResult(BaseModel):
    """Result from query optimization"""
    initial_query: str
    initial_count: int
    final_query: str
    final_count: int
    refinement_description: str
    status: str
```

## File Organization

### Router File (`routers/smart_search.py`)

```python
# ============================================================================
# API Request/Response Models (ordered by endpoint flow)
# ============================================================================

# Step 1: Create Evidence Specification
class EvidenceSpecificationRequest(BaseModel): ...
class EvidenceSpecificationResponse(BaseModel): ...

# Step 2: Generate Keywords  
class KeywordGenerationRequest(BaseModel): ...
class KeywordGenerationResponse(BaseModel): ...

# Step N: ...
# (Organized by workflow step order)

# Session Management
class SessionResetRequest(BaseModel): ...

# Endpoint implementations follow...
@router.post("/create-evidence-spec", response_model=EvidenceSpecificationResponse)
async def create_evidence_specification(request: EvidenceSpecificationRequest): ...
```

**Organization Rules**:
1. **Header comment** clearly separates type definitions from endpoint code
2. **Step-based grouping** with clear step numbers and descriptions
3. **Request/Response pairs** defined together for each step
4. **Workflow order** - types appear in the order they're used in the user flow
5. **Session management** types at the end

### Schema File (`schemas/smart_search.py`)

```python
"""
Smart Search Schemas

Core domain models for the smart search feature.
These are shared data structures used across multiple services.
API-specific request/response models are defined in the router.
"""

# Core Domain Models
class SearchArticle(BaseModel): ...
class SearchPaginationInfo(BaseModel): ...
class FilteredArticle(BaseModel): ...
class FilteringProgress(BaseModel): ...

# Service Return Types  
class SearchServiceResult(BaseModel): ...
class OptimizedQueryResult(BaseModel): ...
```

**Organization Rules**:
1. **Clear header documentation** explaining the file's purpose
2. **Core domain models first** - the fundamental business objects
3. **Service return types second** - structured results from service operations
4. **No API-specific types** - these belong in the router

## Naming Conventions

### API Types (Router)
- **Requests**: `{Operation}Request`
  - `EvidenceSpecificationRequest`
  - `KeywordGenerationRequest`
  - `SearchExecutionRequest`

- **Responses**: `{Operation}Response`
  - `EvidenceSpecificationResponse`
  - `KeywordGenerationResponse`
  - `SearchExecutionResponse`

### Domain Models (Schema)
- **Entities**: `{Entity}`
  - `SearchArticle`
  - `FilteredArticle`

- **Value Objects**: `{Concept}Info`
  - `SearchPaginationInfo`
  - `FilteringProgress`

- **Service Results**: `{Service}{Operation}Result`
  - `SearchServiceResult`
  - `OptimizedQueryResult`

### Method Alignment
Each API endpoint follows the pattern:
- **Method**: `{operation}_{object}` (snake_case)
- **Request**: `{Operation}{Object}Request` (PascalCase)  
- **Response**: `{Operation}{Object}Response` (PascalCase)

Example:
```python
# Method: create_evidence_specification
# Request: EvidenceSpecificationRequest  
# Response: EvidenceSpecificationResponse
```

## Benefits of This System

### 1. **Clear Separation of Concerns**
- API contracts are isolated from domain logic
- Business objects can evolve independently of API structure
- Easy to identify what changes affect external contracts vs internal logic

### 2. **Type Safety**
- Full TypeScript-style type checking in Python
- IDE autocomplete and validation
- Compile-time error detection

### 3. **Maintainability** 
- Consistent naming makes code predictable
- Step-based organization matches user workflow
- Easy to find related types

### 4. **Documentation**
- Types serve as documentation
- Request/response pairs clearly show endpoint contracts
- Domain models document business concepts

### 5. **Refactoring Safety**
- Changes to internal types won't accidentally break API contracts
- Clear boundaries make large-scale changes safer
- Type system catches breaking changes early

## Anti-Patterns to Avoid

### ❌ Don't Define API Types in Schemas
```python
# BAD - API-specific type in domain schemas
class CreateEvidenceSpecRequest(BaseModel):  # This belongs in router
    query: str
```

### ❌ Don't Use Generic Return Types in Services
```python
# BAD - No type information
def search_articles() -> Dict[str, Any]: ...

# GOOD - Structured return type
def search_articles() -> SearchServiceResult: ...
```

### ❌ Don't Mix Naming Conventions
```python
# BAD - Inconsistent naming
class EvidenceRequest(BaseModel): ...      # Missing "Specification"
class KeywordGenerationReq(BaseModel): ... # Abbreviated "Request"
```

### ❌ Don't Put Service Logic in Router Types
```python
# BAD - Business logic in API contract
class SearchRequest(BaseModel):
    query: str
    
    def validate_query(self):  # Business logic doesn't belong here
        ...
```

## Summary

This typing system provides:
- **API Contract Types** in routers for endpoint definitions
- **Domain Models** in schemas for business objects  
- **Service Return Types** in schemas for complex service results
- **Consistent naming** that reflects the application workflow
- **Clear organization** that makes the codebase maintainable

The result is a type-safe, maintainable, and well-documented system that clearly separates API concerns from business logic.