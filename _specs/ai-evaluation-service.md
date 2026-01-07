# AI Evaluation Service Specification

## Overview

A unified service for all LLM-powered evaluation operations on data items. Consolidates the current `ExtractionService` and `SemanticFilterService` into a single, clean API.

## Operations

The service supports four distinct operations:

| Operation | Output | Use Case | Example |
|-----------|--------|----------|---------|
| **Filter** | boolean | Yes/No classification | "Is this about cancer treatment?" |
| **Score** | number (0-1) | Relevance or quality rating | "Rate relevance to cardiovascular research" |
| **Extract** | any single value | Pull one feature from items | "What is the study design?" |
| **Extract Fields** | schema-based (multiple values) | Pull multiple features per schema | Extract study_type, sample_size, outcome, etc. |

## Core Insight

All operations share the same underlying pattern:
1. Take item(s) + instruction(s)
2. Call LLM with appropriate prompt
3. Return value(s) + confidence + optional reasoning

## Two Levels of Extraction

### Single-Value Extraction (`extract`)
- Extract **one** feature from an item
- Output can be **any type**: text, number, boolean, enum, etc.
- Simple instruction describes what to extract
- Returns: value + confidence + optional reasoning

### Multi-Field Extraction (`extract_fields`)
- Extract **multiple** features according to a schema
- Schema defines the output structure and types
- Two levels of instructions:
  - **Overall instructions**: Context for the extraction task
  - **Per-field instructions**: How to populate each specific field
- Returns: dict of field values (matching schema)

## Reasoning

Reasoning is **optional** for all operations. Callers can request it via `include_reasoning=True`.

- When enabled: LLM provides brief explanation with each result
- When disabled: Faster, more token-efficient
- Default: Enabled (most callers want reasoning for auditability)

---

## Service API

### Service Name: `AIEvaluationService`

Located at: `backend/services/ai_evaluation_service.py`

### Output Types

All single-value operations (filter, score, extract) produce typed output.

```python
ExtractOutputType = Literal["text", "number", "boolean", "enum"]
```

**Filter**: Always boolean (yes/no)

**Score**: Always number, but with configurable range:
- `min_value`: Lower bound (default: 0)
- `max_value`: Upper bound (default: 1)
- `interval`: Optional step size (e.g., 0.5 for discrete steps)

**Extract**: Caller specifies output type:
- `"text"` - Free text string
- `"number"` - Numeric value (integer or float)
- `"boolean"` - True/false
- `"enum"` - Constrained to provided `enum_values` list

### Methods

```python
class AIEvaluationService:
    """Unified service for LLM-powered evaluation of data items."""

    # =========================================================================
    # Filter (boolean output)
    # =========================================================================

    async def filter(
        self,
        item: Dict[str, Any],
        criteria: str,
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """Evaluate whether item meets criteria (yes/no)."""

    async def filter_batch(
        self,
        items: List[Dict[str, Any]],
        criteria: str,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """Filter multiple items in parallel."""

    # =========================================================================
    # Score (number output with configurable range)
    # =========================================================================

    async def score(
        self,
        item: Dict[str, Any],
        criteria: str,
        min_value: float = 0,
        max_value: float = 1,
        interval: Optional[float] = None,  # e.g., 0.5 for discrete steps
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """Score item on a numeric scale based on criteria."""

    async def score_batch(
        self,
        items: List[Dict[str, Any]],
        criteria: str,
        min_value: float = 0,
        max_value: float = 1,
        interval: Optional[float] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """Score multiple items in parallel."""

    # =========================================================================
    # Extract (single value, any type)
    # =========================================================================

    async def extract(
        self,
        item: Dict[str, Any],
        instruction: str,
        output_type: OutputType = "text",
        enum_values: Optional[List[str]] = None,  # Required if output_type="enum"
        include_reasoning: bool = True
    ) -> EvaluationResult:
        """Extract a single value of any type from an item."""

    async def extract_batch(
        self,
        items: List[Dict[str, Any]],
        instruction: str,
        output_type: OutputType = "text",
        enum_values: Optional[List[str]] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[EvaluationResult]:
        """Extract single value from multiple items in parallel."""

    # =========================================================================
    # Extract Fields (schema-based, multiple values)
    # =========================================================================

    async def extract_fields(
        self,
        item: Dict[str, Any],
        schema: Dict[str, Any],
        instructions: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True
    ) -> FieldsResult:
        """
        Extract multiple fields from an item according to a schema.

        Args:
            item: Source data
            schema: JSON schema defining output structure
            instructions: Overall context/instructions for the extraction
            field_instructions: Optional per-field instructions
                               e.g., {"study_type": "Classify as RCT, cohort, etc.",
                                      "sample_size": "Extract the number of participants"}
            include_reasoning: Whether to include overall reasoning about the extraction
        """

    async def extract_fields_batch(
        self,
        items: List[Dict[str, Any]],
        schema: Dict[str, Any],
        instructions: str,
        field_instructions: Optional[Dict[str, str]] = None,
        include_reasoning: bool = True,
        max_concurrent: int = 50
    ) -> List[FieldsResult]:
        """Extract multiple fields from multiple items in parallel."""
```

### Result Models

```python
class EvaluationResult(BaseModel):
    """Result from filter, score, or single-value extract operations."""
    value: Union[str, bool, float, int, None]       # The result (type depends on operation)
    confidence: float                                # LLM's confidence in the result (0-1)
    reasoning: Optional[str] = None                  # Explanation (if include_reasoning=True)
    error: Optional[str] = None                      # Error message if evaluation failed
```

**Note:** Results do not include `item_id`. Batch methods return results in the same order as input items, so callers correlate by index: `for item, result in zip(items, results)`.

### Value Types by Operation

Each operation returns a specific type for `value`:

| Operation | Type | Notes |
|-----------|------|-------|
| **filter** | `bool` | Always True or False. If undeterminable, set `error`. |
| **score** | `float` | Always a number in the specified range. If unscorable, set `error`. |
| **extract** | `str \| float \| bool \| None` | Type depends on `output_type`. `None` means info not present. |

**When to use `None` vs `error`:**

- `value=None, error=None` → Information not present in source data (valid result)
- `value=None, error="..."` → Operation failed (API error, malformed response, etc.)

Example: Extracting "sample size" from an abstract that doesn't mention participants returns `value=None` with no error. But if the LLM API times out, that's `error="Request timed out"`.

### Value vs Confidence

These are two distinct concepts:

| Field | Meaning | Example |
|-------|---------|---------|
| **value** | The answer to the question asked | `True`, `0.7`, `"RCT"` |
| **confidence** | How certain the LLM is based on evidence quality | `0.95` |

### Confidence Rubric (Operational Definition)

Confidence is calibrated based on **evidence quality in the source data**, not subjective certainty:

| Range | Meaning | When to Use |
|-------|---------|-------------|
| **0.9–1.0** | Explicit statement | Source text directly states the answer |
| **0.7–0.89** | Strong inference | Answer derived from clear supporting context |
| **0.4–0.69** | Weak inference | Ambiguous or partial evidence; educated guess |
| **< 0.4** | Insufficient evidence | For extract: prefer `value=None` instead |

**Examples:**

- Abstract says "randomized controlled trial" → `value="RCT", confidence=0.95`
- Abstract describes randomization without naming study type → `value="RCT", confidence=0.75`
- Abstract is vague, mentions "participants were followed" → `value="cohort", confidence=0.5`
- Abstract doesn't mention study design at all → `value=None, confidence=0.0` (for extract)

**For filter/score** (where None is not valid): Low confidence (< 0.4) signals the answer is unreliable and callers should treat it cautiously.

This rubric is embedded in the system prompts to ensure consistent calibration across all operations.

```python
class FieldsResult(BaseModel):
    """Result from multi-field extraction."""
    fields: Optional[Dict[str, Any]] = None         # Extracted field values (matches schema)
    confidence: float                                # LLM's overall confidence in the extraction (0-1)
    reasoning: Optional[str] = None                  # Overall explanation (if include_reasoning=True)
    error: Optional[str] = None                      # Error message if extraction failed
```

Both result types have uniform quality indicators (confidence + optional reasoning), allowing callers to handle them consistently.

### Note on Filter vs Extract

**Filter** and **Score** are specialized operations with tailored prompts:
- Filter prompt: "Determine if this meets the criteria: Yes or No"
- Score prompt: "Rate this on a scale of 0.0 to 1.0"

**Extract** is general-purpose:
- Can extract any type (text, number, boolean, enum)
- But uses a different prompt structure: "Extract the following information..."

While `filter` could technically be `extract(output_type="boolean")`, keeping them separate allows for:
- Optimized prompts per operation
- Clearer API semantics
- Backward compatibility

---

## Prompt Structure

The service owns all prompt templates. Callers provide:
- **item**: The data to evaluate (as a dict)
- **instruction/criteria**: Natural language instruction
- **include_reasoning**: Whether to request explanation

### System Messages (Service-Owned)

All system prompts include the confidence rubric for consistent calibration:

```
CONFIDENCE RUBRIC (included in all prompts):
Rate your confidence based on evidence quality:
- 0.9–1.0: Explicit statement in source text
- 0.7–0.89: Strong inference with clear supporting context
- 0.4–0.69: Weak inference or ambiguous evidence
- Below 0.4: Insufficient evidence (for extraction, return null instead)
```

```
FILTER:
You are a classification function that answers yes/no questions about data.
Given source data and criteria, determine whether the answer is Yes or No.
You must provide an answer (True or False) even when uncertain—use low confidence to signal unreliability.

{CONFIDENCE RUBRIC}

SCORE:
You are a scoring function that rates data on a numeric scale.
Given source data and criteria, provide a score within the specified range.
{If interval specified: Use only values at the specified intervals.}
You must provide a score even when uncertain—use low confidence to signal unreliability.

{CONFIDENCE RUBRIC}

EXTRACT (single value):
You are an extraction function that extracts specific information from data.
Given source data and an instruction, extract the requested value.
If the information is not present in the source data, return null for value.

{CONFIDENCE RUBRIC}

EXTRACT FIELDS (schema-based):
You are an extraction function that extracts structured data.
Given source data and a schema, extract all requested fields.
Follow per-field instructions where provided.
For fields where information is not present, return null.

{CONFIDENCE RUBRIC}
```

### User Message (Constructed from Caller Input)

**For Filter/Score/Extract:**
```
## Source Data
title: Example Article Title
abstract: This is the abstract text...
authors: Smith J, Jones M
journal: Nature
publication_date: 2024-01-15

## Instruction
{instruction/criteria from caller}
```

**For Extract Fields:**
```
## Source Data
title: Example Article Title
abstract: This is the abstract text...
...

## Overall Instructions
{instructions from caller}

## Field Instructions
- study_type: Classify as RCT, cohort, case-control, or meta-analysis
- sample_size: Extract the number of participants as an integer
- primary_outcome: What was the main outcome measured?
```

### Response Schemas (Enforced via Structured Output)

**Filter (with reasoning):**
```json
{
  "value": true,
  "confidence": 0.95,
  "reasoning": "The article discusses cancer treatment protocols..."
}
```

**Filter (without reasoning):**
```json
{
  "value": true,
  "confidence": 0.95
}
```

**Score (0-1 range, with reasoning):**
```json
{
  "value": 0.85,
  "confidence": 0.90,
  "reasoning": "Highly relevant to cardiovascular research because..."
}
```

**Score (1-10 range, interval 0.5):**
```json
{
  "value": 7.5,
  "confidence": 0.88,
  "reasoning": "Strong methodology but limited sample size"
}
```

**Extract - text:**
```json
{
  "value": "randomized controlled trial",
  "confidence": 0.92,
  "reasoning": "The methods section explicitly states..."
}
```

**Extract - number:**
```json
{
  "value": 1250,
  "confidence": 0.88,
  "reasoning": "Sample size mentioned in participants section"
}
```

**Extract - enum:**
```json
{
  "value": "cohort",
  "confidence": 0.95,
  "reasoning": "Longitudinal follow-up of defined population"
}
```

**Extract Fields (with overall confidence and reasoning):**
```json
{
  "fields": {
    "study_type": "RCT",
    "sample_size": 1250,
    "primary_outcome": "Overall survival at 5 years",
    "intervention": "Drug X 100mg daily"
  },
  "confidence": 0.88,
  "reasoning": "All fields clearly stated in methods section except sample_size which required inference from results table"
}
```

---

## Item Format

All items must be passed as `Dict[str, Any]`. The service formats them automatically.

### Conversion Helpers

Callers with typed objects should convert before calling:

```python
# CanonicalResearchArticle (Pydantic)
item = article.model_dump()

# WipArticle (SQLAlchemy)
item = {
    "id": wip.pmid or str(wip.id),
    "title": wip.title,
    "abstract": wip.abstract,
    "authors": wip.authors,
    "journal": wip.journal,
    "publication_date": str(wip.publication_date) if wip.publication_date else None,
}

# Already a dict - use directly
item = {"title": "...", "abstract": "..."}
```

### Item ID Resolution

The service determines `item_id` by checking (in order):
1. `item.get("id")`
2. `item.get("pmid")`
3. `item.get("nct_id")`
4. `"unknown"`

---

## Backend Callers

### 1. Tablizer Router (`/api/tablizer/*`)

**Current:**
- `/filter` → SemanticFilterService (boolean/number)
- `/extract` → ExtractionService (text)

**New:** Keep endpoints, delegate to unified service:

```python
@router.post("/filter")
async def filter_items(request: FilterRequest, ...):
    service = get_ai_evaluation_service()

    if request.output_type == "boolean":
        results = await service.filter_batch(
            items=request.items,
            criteria=request.criteria,
            include_reasoning=True
        )
    else:  # "number"
        results = await service.score_batch(
            items=request.items,
            criteria=request.criteria,
            include_reasoning=True
        )

    return convert_to_response(results)


@router.post("/extract")
async def extract_from_items(request: ExtractRequest, ...):
    service = get_ai_evaluation_service()

    results = await service.extract_batch(
        items=request.items,
        instruction=request.prompt,
        output_type="text",  # Tablizer text columns
        include_reasoning=True
    )

    return convert_to_response(results)
```

### 2. Refinement Workbench Service

**Current:** Uses SemanticFilterService via evaluate_articles_batch

**New:**
```python
async def filter_articles(
    self,
    articles: List[CanonicalResearchArticle],
    filter_criteria: str,
    threshold: float,
    output_type: str = "boolean"
) -> List[Dict]:
    service = get_ai_evaluation_service()

    # Convert Pydantic models to dicts
    items = [article.model_dump() for article in articles]

    if output_type == "boolean":
        results = await service.filter_batch(items, filter_criteria)
    elif output_type == "number":
        results = await service.score_batch(items, filter_criteria)
    else:  # "text"
        results = await service.extract_batch(items, filter_criteria, output_type="text")

    # Combine with original articles
    return [
        {
            "article": articles[i],
            "passed": r.value if isinstance(r.value, bool) else r.value >= threshold,
            "score": r.confidence if output_type == "boolean" else r.value,
            "reasoning": r.reasoning or ""
        }
        for i, r in enumerate(results)
    ]
```

### 3. Pipeline Service

**Current:** Uses SemanticFilterService for semantic filter step

**New:**
```python
async def _filter_articles(
    self,
    execution_id: str,
    retrieval_unit_id: str,
    filter_criteria: str,
    threshold: float
) -> Tuple[int, int]:
    service = get_ai_evaluation_service()

    # Get articles to filter
    articles = self.wip_article_service.get_for_filtering(execution_id, retrieval_unit_id)
    if not articles:
        return 0, 0

    # Convert WipArticle objects to dicts
    items = [self._wip_to_dict(wip) for wip in articles]

    # Run filter
    results = await service.filter_batch(items, filter_criteria)

    # Update database
    passed, rejected = 0, 0
    for wip, result in zip(articles, results):
        is_relevant = result.value is True
        self.wip_article_service.update_filter_result(
            article=wip,
            passed=is_relevant,
            score=result.confidence,
            rejection_reason=result.reasoning if not is_relevant else None
        )
        if is_relevant:
            passed += 1
        else:
            rejected += 1

    return passed, rejected


def _wip_to_dict(self, wip: WipArticle) -> Dict[str, Any]:
    """Convert WipArticle to dict for AI evaluation."""
    return {
        "id": wip.pmid or str(wip.id),
        "title": wip.title,
        "abstract": wip.abstract,
        "authors": wip.authors,
        "journal": wip.journal,
        "publication_date": str(wip.publication_date) if wip.publication_date else None,
    }
```

---

## Frontend API

### Current State

`tablizerApi.ts` has:
- `filterItems()` → `/api/tablizer/filter`
- `extractFromItems()` → `/api/tablizer/extract`
- `processAIColumn()` → routes based on `outputType`

### Recommended Change

**Option A: Keep Frontend Unchanged**
- Backend endpoints `/filter` and `/extract` still work
- They just delegate to the unified service internally
- No frontend changes needed

**Option B: Unified Endpoint**
```typescript
// Single endpoint for all AI operations
async evaluateItems(request: {
    items: Record<string, unknown>[];
    itemType: 'article' | 'trial';
    instruction: string;
    operation: 'extract' | 'filter' | 'score';
}): Promise<EvaluationResult[]>
```

**Recommendation:** Option A for now (less disruption). Frontend already routes correctly via `processAIColumn()`.

---

## Migration Plan

### Phase 1: Create New Service
1. Create `ai_evaluation_service.py` with unified API
2. Add clean system messages and prompt structure
3. Add all three operations (extract, filter, score)
4. Add batch methods with parallel execution

### Phase 2: Update Tablizer Router
1. Update `/api/tablizer/filter` to use new service
2. Update `/api/tablizer/extract` to use new service
3. Keep endpoint signatures identical (no frontend changes)

### Phase 3: Update Refinement Workbench
1. Update `RefinementWorkbenchService.filter_articles()` to use new service
2. Convert CanonicalResearchArticle → dict before calling

### Phase 4: Update Pipeline Service
1. Update `PipelineService._filter_articles()` to use new service
2. Convert WipArticle → dict before calling

### Phase 5: Cleanup
1. Delete `SemanticFilterService`
2. Delete old `ExtractionService` (or merge into new service)
3. Remove unused adapter classes from tablizer router

---

## File Changes Summary

### New Files
- `backend/services/ai_evaluation_service.py`

### Modified Files
- `backend/routers/tablizer.py` - Use new service
- `backend/routers/refinement_workbench.py` - Use new service
- `backend/services/pipeline_service.py` - Use new service
- `backend/services/refinement_workbench_service.py` - Use new service

### Deleted Files
- `backend/services/semantic_filter_service.py`
- `backend/services/extraction_service.py` (merged into new service)

### Unchanged
- All frontend files (endpoints remain compatible)

---

## Testing

Each operation should be testable via:
```python
service = get_ai_evaluation_service()

# Filter
result = await service.filter(
    item={"title": "Cancer treatment study", "abstract": "..."},
    criteria="Is this about oncology?",
    include_reasoning=True
)
assert isinstance(result.value, bool)
assert result.reasoning is not None

# Score (default 0-1 range)
result = await service.score(
    item={"title": "Cancer treatment study", "abstract": "..."},
    criteria="Rate relevance to cardiovascular research",
    include_reasoning=False
)
assert isinstance(result.value, float)
assert 0 <= result.value <= 1
assert result.reasoning is None  # Not requested

# Score (custom range 1-10 with intervals)
result = await service.score(
    item={"title": "Cancer treatment study", "abstract": "..."},
    criteria="Rate the methodological quality",
    min_value=1,
    max_value=10,
    interval=0.5
)
assert 1 <= result.value <= 10
assert result.value % 0.5 == 0  # Respects interval

# Extract (text)
result = await service.extract(
    item={"title": "Cancer treatment study", "abstract": "..."},
    instruction="What is the study design?",
    output_type="text"
)
assert isinstance(result.value, str)

# Extract (enum)
result = await service.extract(
    item={"title": "Cancer treatment study", "abstract": "..."},
    instruction="Classify the study design",
    output_type="enum",
    enum_values=["RCT", "cohort", "case-control", "meta-analysis", "other"]
)
assert result.value in ["RCT", "cohort", "case-control", "meta-analysis", "other"]

# Extract Fields
result = await service.extract_fields(
    item={"title": "Cancer treatment study", "abstract": "..."},
    schema={
        "type": "object",
        "properties": {
            "study_type": {"type": "string"},
            "sample_size": {"type": "integer"},
            "primary_outcome": {"type": "string"}
        }
    },
    instructions="Extract key study characteristics",
    field_instructions={
        "study_type": "Classify as RCT, cohort, case-control, or meta-analysis",
        "sample_size": "Number of participants enrolled",
        "primary_outcome": "Main outcome measured"
    },
    include_reasoning=True
)
assert "study_type" in result.fields
assert "sample_size" in result.fields
assert 0 <= result.confidence <= 1
assert result.reasoning is not None  # Requested reasoning
```
