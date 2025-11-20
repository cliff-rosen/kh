# Research Streams Router - Type Cleanup Analysis

## Issues Found

### 1. Unused Types
- **`QueryGenerationResponse`** (line 197-200): Defined but never used as `response_model`
  - However, endpoint `generate_group_queries` (line 312) returns a dict matching this structure
  - **Fix**: Add `response_model=QueryGenerationResponse` to the endpoint

### 2. Missing Response Models

| Endpoint | Line | Status | Fix Needed |
|----------|------|--------|------------|
| `POST /retrieval/propose-groups` | 215 | ❌ No response_model | Add `ProposeGroupsResponse` |
| `POST /retrieval/validate` | 262 | ❌ No response_model | Add `ValidateGroupsResponse` |
| `POST /retrieval/generate-group-queries` | 312 | ❌ No response_model | Use existing `QueryGenerationResponse` |
| `POST /retrieval/generate-semantic-filter` | 378 | ❌ No response_model | Add `SemanticFilterResponse` |

### 3. Inconsistent Return Patterns
- Some endpoints return raw dicts (lines 356-359, 484-488)
- Should use Pydantic models for type safety and OpenAPI documentation

### 4. Request Types Without Proper Field Descriptions
- `GenerateSemanticFilterRequest.topics` uses `List[Dict[str, str]]` instead of typed model
- Should create `TopicSummary` model for better type safety

## Recommended Changes

### New Response Models to Add

```python
class ProposeGroupsResponse(BaseModel):
    """Response from retrieval group proposal"""
    proposed_groups: List[Dict[str, Any]] = Field(..., description="Proposed retrieval groups")
    coverage_analysis: Dict[str, Any] = Field(..., description="Analysis of topic coverage")
    overall_reasoning: str = Field(..., description="Explanation of grouping strategy")
    error: Optional[str] = Field(None, description="Error message if proposal used fallback")

class SemanticFilterResponse(BaseModel):
    """Response from semantic filter generation"""
    criteria: str = Field(..., description="Filter criteria description")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Relevance threshold (0-1)")
    reasoning: str = Field(..., description="Explanation of filter design")

class ValidateGroupsResponse(BaseModel):
    """Response from retrieval group validation"""
    is_complete: bool = Field(..., description="Whether all topics are covered")
    coverage: Dict[str, Any] = Field(..., description="Topic coverage details")
    configuration_status: Dict[str, Any] = Field(..., description="Configuration completeness status")
    warnings: List[str] = Field(..., description="Validation warnings")
    ready_to_activate: bool = Field(..., description="Whether config is ready for production")

class TopicSummary(BaseModel):
    """Summary of a topic for filter generation"""
    topic_id: str
    name: str
    description: str
```

### Updated Endpoint Signatures

```python
# Use existing QueryGenerationResponse
@router.post("/{stream_id}/retrieval/generate-group-queries", response_model=QueryGenerationResponse)
async def generate_group_queries(...):
    return QueryGenerationResponse(
        query_expression=query_expression,
        reasoning=reasoning
    )

# Add new ProposeGroupsResponse
@router.post("/{stream_id}/retrieval/propose-groups", response_model=ProposeGroupsResponse)
async def propose_retrieval_groups(...):
    result = await service.propose_groups(semantic_space)
    return ProposeGroupsResponse(**result)

# Add new ValidateGroupsResponse
@router.post("/{stream_id}/retrieval/validate", response_model=ValidateGroupsResponse)
async def validate_retrieval_groups(...):
    result = service.validate_groups(semantic_space, groups)
    return ValidateGroupsResponse(**result)

# Add new SemanticFilterResponse
@router.post("/{stream_id}/retrieval/generate-semantic-filter", response_model=SemanticFilterResponse)
async def generate_semantic_filter(...):
    return SemanticFilterResponse(
        criteria=response_data.get('criteria', ''),
        threshold=response_data.get('threshold', 0.7),
        reasoning=response_data.get('reasoning', '')
    )
```

### Type Safety Improvements

```python
# BEFORE (line 371-375)
class GenerateSemanticFilterRequest(BaseModel):
    group_id: str
    topics: List[Dict[str, str]]  # Unclear structure
    rationale: str

# AFTER
class GenerateSemanticFilterRequest(BaseModel):
    group_id: str = Field(..., description="Retrieval group ID")
    topics: List[TopicSummary] = Field(..., description="Topics in the group")
    rationale: str = Field(..., description="Why these topics are grouped together")
```

## Summary of All Types

### Request Models (Input)
1. ✅ `ResearchStreamCreateRequest` - Used in POST /
2. ✅ `ResearchStreamUpdateRequest` - Used in PUT /{stream_id}
3. ✅ `ToggleStatusRequest` - Used in PATCH /{stream_id}/status
4. ✅ `ValidateGroupsRequest` - Used in POST /retrieval/validate
5. ✅ `GenerateGroupQueriesRequest` - Used in POST /retrieval/generate-group-queries
6. 🔧 `GenerateSemanticFilterRequest` - Needs typed topics field
7. ✅ `QueryTestRequest` - Used in POST /topics/test-query
8. ✅ `ExecutePipelineRequest` - Used in POST /execute-pipeline

### Response Models (Output)
1. ✅ `ResearchStream` - Used in CRUD endpoints
2. ✅ `InformationSource` - Used in GET /metadata/sources
3. ✅ `QueryTestResponse` - Used in POST /topics/test-query
4. ✅ `QueryGenerationResponse` - **Should be used** in POST /retrieval/generate-group-queries
5. ➕ `ProposeGroupsResponse` - **Missing** for POST /retrieval/propose-groups
6. ➕ `ValidateGroupsResponse` - **Missing** for POST /retrieval/validate
7. ➕ `SemanticFilterResponse` - **Missing** for POST /retrieval/generate-semantic-filter

### Helper Models
8. ➕ `TopicSummary` - **Missing** for typed topic references

## Benefits of These Changes

1. **Type Safety**: Pydantic validation on responses
2. **Better OpenAPI Docs**: Auto-generated docs will show exact response structure
3. **IDE Support**: Autocomplete and type hints when calling these APIs
4. **Consistency**: All endpoints follow same pattern
5. **Maintainability**: Clear contracts between frontend and backend
