# Research Stream Backend Architecture

## Current State Analysis

### Existing Files:
- `schemas/research_stream.py` - Domain models + some workflow types (mixed concerns)
- `schemas/agent_responses.py` - Generic streaming response types
- `routers/research_stream_chat.py` - Chat endpoint with embedded request types
- `services/research_stream_chat_service.py` - Business logic
- `services/research_stream_creation_workflow.py` - Workflow controller

### Issues:
1. **Mixed concerns** - Domain models (`ResearchStream`) mixed with workflow types (`PartialStreamConfig`, `UserAction`)
2. **Embedded types** - `ChatMessage`, `CheckboxOption` defined in router file
3. **Generic payload** - `AgentResponse.payload` is `str | object | None`, not typed for stream building
4. **Naming inconsistency** - Uses `current_config`, `PartialStreamConfig` instead of `current_stream`, `StreamInProgress`
5. **No separation** - API request/response types not clearly separated from domain

---

## Proposed Architecture (4 Layers)

### Layer 1: Domain Models (`schemas/research_stream.py`)
**Purpose:** Core domain - the stream itself

```python
# Keep only:
class StreamType(str, Enum): ...
class ReportFrequency(str, Enum): ...
class ScoringConfig(BaseModel): ...
class ResearchStream(BaseModel): ...  # The complete stream
```

**Remove:** `PartialStreamConfig`, `UserAction` (move to Layer 2)

---

### Layer 2: Stream Building (`schemas/stream_building.py`)
**Purpose:** Stream building workflow, state, and interactions

```python
from typing import List, Optional, Literal
from pydantic import BaseModel
from .research_stream import ScoringConfig

# ============================================================================
# Stream being built (all fields optional)
# ============================================================================

class StreamInProgress(BaseModel):
    """Stream being built - all fields optional as they're filled progressively"""
    purpose: Optional[str] = None
    business_goals: Optional[List[str]] = None
    expected_outcomes: Optional[str] = None
    stream_name: Optional[str] = None
    stream_type: Optional[str] = None  # string during building
    description: Optional[str] = None
    focus_areas: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    competitors: Optional[List[str]] = None
    report_frequency: Optional[str] = None  # string during building
    scoring_config: Optional[dict] = None

# ============================================================================
# Build workflow steps
# ============================================================================

class StreamBuildStep(str, Enum):
    EXPLORATION = "exploration"
    PURPOSE = "purpose"
    BUSINESS_GOALS = "business_goals"
    EXPECTED_OUTCOMES = "expected_outcomes"
    STREAM_NAME = "stream_name"
    STREAM_TYPE = "stream_type"
    FOCUS_AREAS = "focus_areas"
    KEYWORDS = "keywords"
    COMPETITORS = "competitors"
    REPORT_FREQUENCY = "report_frequency"
    REVIEW = "review"
    COMPLETE = "complete"

# ============================================================================
# User actions during building
# ============================================================================

class UserActionType(str, Enum):
    SELECT_SUGGESTION = "select_suggestion"
    CONFIRM_SELECTION = "confirm_selection"
    TEXT_INPUT = "text_input"
    SKIP_STEP = "skip_step"
    ACCEPT_REVIEW = "accept_review"
    OPTION_SELECTED = "option_selected"
    OPTIONS_SELECTED = "options_selected"

class UserAction(BaseModel):
    type: UserActionType
    target_field: Optional[str] = None
    selected_value: Optional[str] = None
    selected_values: Optional[List[str]] = None

# ============================================================================
# Interactive UI elements
# ============================================================================

class Suggestion(BaseModel):
    label: str
    value: str

class MultiSelectOption(BaseModel):
    label: str
    value: str
    checked: bool
```

---

### Layer 3: Stream Building API (`schemas/stream_building_api.py`)
**Purpose:** API contracts for stream building chat

```python
from pydantic import BaseModel
from typing import List, Optional, Literal
from .stream_building import (
    StreamInProgress,
    StreamBuildStep,
    UserAction,
    Suggestion,
    MultiSelectOption
)

# ============================================================================
# Request/Response for stream building chat
# ============================================================================

class ApiMessage(BaseModel):
    """Simple message for API communication"""
    role: Literal["user", "assistant"]
    content: str

class StreamBuildChatRequest(BaseModel):
    """Request for stream building chat endpoint"""
    message: str
    current_stream: StreamInProgress
    current_step: StreamBuildStep
    conversation_history: List[ApiMessage] = []
    user_action: Optional[UserAction] = None

class StreamBuildChatPayload(BaseModel):
    """The specific typed payload for stream building responses"""
    message: str
    mode: Literal["QUESTION", "SUGGESTION", "REVIEW"]
    target_field: Optional[str] = None
    next_step: StreamBuildStep
    updated_stream: StreamInProgress
    suggestions: Optional[List[Suggestion]] = None
    options: Optional[List[MultiSelectOption]] = None
    proposed_message: Optional[str] = None

# ============================================================================
# SSE Streaming responses (specialized for stream building)
# ============================================================================

class StreamBuildAgentResponse(BaseModel):
    """Agent response with typed payload for stream building"""
    token: Optional[str] = None
    response_text: Optional[str] = None
    payload: Optional[StreamBuildChatPayload] = None
    status: Optional[str] = None
    error: Optional[str] = None
    debug: Optional[str | dict] = None

class StreamBuildStatusResponse(BaseModel):
    """Status response for stream building"""
    status: str
    payload: Optional[str | dict] = None
    error: Optional[str] = None
    debug: Optional[str | dict] = None
```

---

### Layer 4: Generic Streaming (`schemas/agent_responses.py`)
**Purpose:** Generic streaming responses (keep for other agents)

```python
# Keep as-is for generic use, but stream building should use typed versions
class AgentResponse(BaseModel): ...
class StatusResponse(BaseModel): ...
```

---

## Migration Steps

### Step 1: Create Layer 2
```bash
# Create schemas/stream_building.py
# Move PartialStreamConfig → StreamInProgress
# Move UserAction + add UserActionType enum
# Add StreamBuildStep enum
# Add Suggestion, MultiSelectOption
```

### Step 2: Create Layer 3
```bash
# Create schemas/stream_building_api.py
# Add ApiMessage
# Add StreamBuildChatRequest
# Add StreamBuildChatPayload (typed payload)
# Add StreamBuildAgentResponse (typed version)
# Add StreamBuildStatusResponse
```

### Step 3: Update Router
```bash
# routers/research_stream_chat.py
# Remove embedded ChatMessage, CheckboxOption
# Import from schemas/stream_building_api
# Update request model: StreamChatRequest → StreamBuildChatRequest
# Update field names: current_config → current_stream
```

### Step 4: Update Service
```bash
# services/research_stream_chat_service.py
# Update imports to use new schemas
# Update method signature: current_config → current_stream
# Use typed StreamBuildChatPayload for final response
# Yield StreamBuildAgentResponse instead of generic AgentResponse
```

### Step 5: Update Workflow
```bash
# services/research_stream_creation_workflow.py
# Update to use StreamInProgress instead of PartialStreamConfig
# Update step enum to use StreamBuildStep
```

### Step 6: Clean up Layer 1
```bash
# schemas/research_stream.py
# Remove PartialStreamConfig (moved to Layer 2)
# Remove UserAction (moved to Layer 2)
# Keep only: StreamType, ReportFrequency, ScoringConfig, ResearchStream
```

---

## Benefits

1. ✅ **Clear separation** - Domain → Building → API → Generic
2. ✅ **Type safety** - `StreamBuildChatPayload` is fully typed
3. ✅ **Consistency** - Matches frontend architecture exactly
4. ✅ **Reusability** - Generic `AgentResponse` still available for other features
5. ✅ **No naming collisions** - Each type has one clear home
6. ✅ **Better DX** - IDE autocomplete works correctly with typed payload
