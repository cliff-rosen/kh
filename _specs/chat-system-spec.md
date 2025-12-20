# Chat System Specification

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend: Page Configuration Registry](#backend-page-configuration-registry)
   - [Registry Location](#registry-location)
   - [Core Types](#core-types)
   - [Registration](#registration)
   - [Registry API](#registry-api)
4. [Backend: Context Builders](#backend-context-builders)
5. [Frontend: Payload Handlers](#frontend-payload-handlers)
   - [PayloadHandler Interface](#payloadhandler-interface)
   - [Registration Pattern](#registration-pattern)
   - [Handler Callbacks](#handler-callbacks)
6. [Stream Event Types](#stream-event-types-backend--frontend)
7. [Tool System](#tool-system)
   - [Tool Execution Flow](#tool-execution-flow)
   - [Tool Executors](#tool-executors)
   - [Tool Definition Example](#example-tool-definition)
8. [Tool Call Markers](#tool-call-markers)
   - [Marker Format](#format)
   - [Tool History Payload](#tool-history-payload)
9. [Response Payload Structure](#response-payload-structure)
   - [Suggested Values](#suggested-values)
   - [Suggested Actions](#suggested-actions)
   - [Custom Payload](#custom-payload)
10. [Agent Loop Pattern](#agent-loop-pattern)
    - [Loop Structure](#loop-structure)
    - [Helper Functions](#helper-functions)
11. [Frontend State Management](#frontend-state-management)
12. [UI Components](#ui-components)
13. [System Prompt Construction](#system-prompt-construction)
14. [File Structure](#file-structure)
15. [TODO](#todo)

---

## Overview

The chat system provides streaming LLM interactions with tool support. It uses Server-Sent Events (SSE) to stream typed events from backend to frontend, following a discriminated union pattern for type safety.

The system is **page-aware**: each page can register its own context builders, payload types, client actions, and tools via a central registry.

---

## Architecture

```
┌─────────────────┐     SSE Stream      ┌──────────────────────┐
│    Frontend     │ ◄────────────────── │   GeneralChatSvc     │
│    ChatTray     │                     │                      │
│  useGeneralChat │                     │     agent_loop.py    │
└─────────────────┘                     └──────────────────────┘
        │                                         │
        │                      ┌──────────────────┼──────────────────────┐
        │                      │                  │                      │
        ▼                      ▼                  ▼                      ▼
┌─────────────┐         ┌─────────────┐   ┌─────────────┐       ┌─────────────┐
│  Payload    │         │  Anthropic  │   │   Payload   │       │    Tool     │
│  Handlers   │         │     API     │   │  Registry   │       │  Executors  │
│ (per-page)  │         └─────────────┘   └─────────────┘       └─────────────┘
└─────────────┘
```

---

## Backend: Page Configuration Registry

Each page in the application can register configuration that controls chat behavior.

### Registry Location
```
backend/services/chat_payloads/
├── __init__.py          # Auto-imports all page configs
├── registry.py          # Core registry classes and functions
├── edit_stream.py       # Config for edit_research_stream page
├── streams_list.py      # Config for streams list page
├── new_stream.py        # Config for new stream page
└── reports.py           # Config for reports page
```

### Core Types

#### PageConfig
Complete configuration for a page.
```python
@dataclass
class PageConfig:
    payloads: List[PayloadConfig]           # Structured output types
    context_builder: Callable               # Builds system prompt context
    client_actions: List[ClientAction]      # Frontend-executable actions
    tools: List[ToolConfig]                 # LLM-callable tools
```

#### PayloadConfig
Defines a structured output type the LLM can emit.
```python
@dataclass
class PayloadConfig:
    type: str                               # e.g., "schema_proposal"
    parse_marker: str                       # e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str                   # Prompt instructions for LLM
    parser: Callable[[str], Dict]           # Parses LLM output to payload
    relevant_tabs: Optional[List[str]]      # Tab filtering (None = all)
```

#### ClientAction
Defines an action the frontend can execute.
```python
@dataclass
class ClientAction:
    action: str                             # e.g., "close_chat"
    description: str                        # For LLM context
    parameters: Optional[List[str]]         # e.g., ["tab_name"]
```

#### ToolConfig
Defines a tool the LLM can call.
```python
@dataclass
class ToolConfig:
    name: str                               # e.g., "search_pubmed"
    description: str                        # For LLM context
    input_schema: Dict[str, Any]            # JSON schema for parameters
    executor: Callable                      # (params, db, user_id, context) -> str | ToolResult
```

#### ToolResult
Return type for tools that produce both LLM text and frontend payload.
```python
@dataclass
class ToolResult:
    text: str                               # Text result for LLM
    payload: Optional[Dict[str, Any]]       # Structured data for frontend
```

### Registration
Pages register on module import:
```python
# In edit_stream.py
register_page(
    page="edit_research_stream",
    payloads=EDIT_STREAM_PAYLOADS,
    context_builder=build_context,
    client_actions=EDIT_STREAM_CLIENT_ACTIONS,
    tools=None  # or list of ToolConfig
)
```

### Registry API
```python
get_page_payloads(page: str) -> List[PayloadConfig]
get_page_context_builder(page: str) -> Optional[Callable]
get_page_client_actions(page: str) -> List[ClientAction]
get_page_tools(page: str) -> List[ToolConfig]
has_page_payloads(page: str) -> bool
```

---

## Backend: Context Builders

Each page provides a context builder function that generates the system prompt context section based on the current page state.

### Signature
```python
def build_context(context: Dict[str, Any]) -> str:
    """Build context section for system prompt."""
```

### Input Context (from frontend)
```python
{
    "current_page": "edit_research_stream",
    "active_tab": "semantic",
    "current_schema": {...},
    "report_id": 123,
    # ... page-specific data
}
```

### Tab-Specific Context
Context builders often route to tab-specific helpers:
```python
def build_context(context: Dict[str, Any]) -> str:
    active_tab = context.get("active_tab", "semantic")

    if active_tab == "semantic":
        return _build_semantic_tab_context(context)
    elif active_tab == "retrieval":
        return _build_retrieval_tab_context(context)
    # ...
```

### Example Context Output
```
The user is on the SEMANTIC SPACE tab (Layer 1: What information matters).

Current values:
- Stream Name: Cancer Research Monitor
- Purpose: Track oncology breakthroughs
- Domain Name: Oncology
- Topics: 5 topics defined

SEMANTIC SPACE defines the canonical, source-agnostic ground truth...
```

---

## Frontend: Payload Handlers

The frontend uses **inline registration** where each page passes payload handlers as props to ChatTray. This allows pages to define custom rendering and callbacks for each payload type.

### PayloadHandler Interface
```typescript
// In types/chat.ts
export interface PayloadHandler {
    render: (
        payload: any,
        callbacks: {
            onAccept?: (data: any) => void;
            onReject?: () => void;
        }
    ) => React.ReactNode;
    onAccept?: (payload: any, pageState?: any) => void;
    onReject?: (payload: any) => void;
    renderOptions?: {
        panelWidth?: string;      // e.g., "500px"
        headerTitle?: string;     // e.g., "Schema Proposal"
        headerIcon?: string;      // e.g., "📋"
    };
}
```

### Registration Pattern
Pages pass a `payloadHandlers` object to ChatTray, keyed by payload type:

```tsx
// In EditStreamPage.tsx
<ChatTray
    initialContext={{
        current_page: "edit_research_stream",
        active_tab: activeTab,
        current_schema: schema
    }}
    payloadHandlers={{
        schema_proposal: {
            render: (payload, callbacks) => (
                <SchemaProposalCard
                    proposal={payload}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: handleSchemaProposalAccept,
            onReject: handleSchemaProposalReject,
            renderOptions: {
                panelWidth: '500px',
                headerTitle: 'Schema Proposal',
                headerIcon: '📋'
            }
        },
        presentation_categories: {
            render: (payload, callbacks) => (
                <PresentationCategoriesCard
                    proposal={payload}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: handleCategoriesAccept,
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'Presentation Categories',
                headerIcon: '📊'
            }
        }
    }}
/>
```

### Handler Callbacks

When a payload is received, ChatTray:
1. Detects `custom_payload.type` in the message
2. Looks up the handler in `payloadHandlers[type]`
3. If found, opens a floating panel and calls `handler.render(payload.data, callbacks)`
4. When user clicks accept/reject, calls `handler.onAccept` or `handler.onReject`

```typescript
// In ChatTray.tsx
useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.custom_payload?.type && latestMessage.custom_payload.data) {
        const payloadType = latestMessage.custom_payload.type;

        if (payloadHandlers && payloadHandlers[payloadType]) {
            setActivePayload({
                type: payloadType,
                data: latestMessage.custom_payload.data
            });
        }
    }
}, [messages, payloadHandlers]);
```

### Existing Payload Handlers by Page

| Page | Payload Type | Card Component |
|------|--------------|----------------|
| EditStreamPage | `schema_proposal` | `SchemaProposalCard` |
| EditStreamPage | `presentation_categories` | `PresentationCategoriesCard` |
| EditStreamPage | `retrieval_proposal` | `RetrievalProposalCard` |
| StreamsPage | `stream_suggestions` | `StreamSuggestionsCard` |
| StreamsPage | `portfolio_insights` | `PortfolioInsightsCard` |
| CreateStreamPage | `stream_template` | `StreamTemplateCard` |
| CreateStreamPage | `topic_suggestions` | `TopicSuggestionsCard` |

---

## Stream Event Types (Backend → Frontend)

All events have a `type` field for discrimination. Events are JSON-serialized and sent as SSE `data:` lines.

### 1. `status`
Initial status or thinking indicator.
```json
{"type": "status", "message": "Thinking..."}
```

### 2. `text_delta`
Streaming text token from LLM.
```json
{"type": "text_delta", "text": "Hello"}
```

### 3. `tool_start`
Tool execution begins.
```json
{
  "type": "tool_start",
  "tool": "search_pubmed",
  "input": {"query": "CRISPR"},
  "tool_use_id": "toolu_abc123"
}
```

### 4. `tool_progress`
Tool execution progress update (for long-running tools).
```json
{
  "type": "tool_progress",
  "tool": "search_pubmed",
  "stage": "searching",
  "message": "Found 15 articles...",
  "progress": 0.5,
  "data": null
}
```

### 5. `tool_complete`
Tool execution finished.
```json
{
  "type": "tool_complete",
  "tool": "search_pubmed",
  "index": 0
}
```
The `index` corresponds to `[[tool:N]]` markers in the text.

### 6. `complete`
Final response with structured payload.
```json
{
  "type": "complete",
  "payload": {
    "message": "Here are the results...",
    "suggested_values": [...],
    "suggested_actions": [...],
    "custom_payload": {...}
  }
}
```

### 7. `error`
Error occurred.
```json
{"type": "error", "message": "API rate limit exceeded"}
```

### 8. `cancelled`
Request was cancelled by user.
```json
{"type": "cancelled"}
```

---

## Tool System

### Tool Execution Flow
1. LLM requests tool use in response
2. Backend detects `tool_use` blocks
3. For each tool:
   - Emit `tool_start` event
   - Look up `ToolConfig` from page registry
   - Execute tool via `asyncio.to_thread(executor, params, db, user_id, context)`
   - Emit `tool_progress` events (if streaming tool)
   - Emit `tool_complete` event
4. Append tool exchange to messages
5. Continue agent loop

### Tool Executors
Executors receive:
- `params: Dict[str, Any]` - Tool input from LLM
- `db: Session` - Database session
- `user_id: int` - Current user
- `context: Dict[str, Any]` - Page context from frontend

Return types:
- `str` - Simple text result for LLM
- `ToolResult(text, payload)` - Text for LLM + structured data for frontend

### Example Tool Definition
```python
ToolConfig(
    name="search_pubmed",
    description="Search PubMed for research articles.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "max_results": {"type": "integer", "default": 10}
        },
        "required": ["query"]
    },
    executor=execute_search_pubmed
)
```

### Example Tool Executor
```python
def execute_get_pubmed_article(params, db, user_id, context) -> ToolResult:
    pmid = params.get("pmid")
    article = fetch_article(pmid)

    # Text for LLM to reason about
    text = f"Title: {article.title}\nAbstract: {article.abstract}"

    # Structured payload for frontend card
    payload = {
        "type": "pubmed_article",
        "data": {"pmid": pmid, "title": article.title, ...}
    }

    return ToolResult(text=text, payload=payload)
```

---

## Tool Call Markers

When tools are executed, markers are inserted into the text stream to indicate where tool results should be displayed.

### Format
```
[[tool:N]]
```
Where `N` is a zero-indexed integer matching the `index` field in `tool_complete` events.

### Flow
1. LLM streams text: `"Let me search for that..."`
2. LLM requests tool use (detected from response)
3. Backend emits `tool_start` event
4. Backend executes tool
5. Backend emits `tool_complete` event with `index: 0`
6. Backend emits `text_delta` with `"[[tool:0]]"`
7. Backend continues with next LLM iteration
8. Final `complete` event includes `tool_history` in payload

### Tool History Payload
The `complete` event includes tool history for rendering:
```json
{
  "type": "complete",
  "payload": {
    "message": "Let me search...\n\n[[tool:0]]\n\nI found 5 articles.",
    "custom_payload": {
      "type": "tool_history",
      "data": [
        {
          "tool_name": "search_pubmed",
          "input": {"query": "CRISPR"},
          "output": "Found 5 articles: ..."
        }
      ]
    }
  }
}
```

### Frontend Rendering
The frontend should:
1. Parse `[[tool:N]]` markers in the message text
2. Replace each marker with an expandable tool call card
3. Use `tool_history[N]` to populate: tool name, input, output
4. Tool cards should be collapsible (collapsed by default)

---

## Response Payload Structure

The `complete` event contains a `ChatResponsePayload`:

```typescript
interface ChatResponsePayload {
  message: string;                    // LLM text (may contain [[tool:N]] markers)
  suggested_values?: SuggestedValue[];
  suggested_actions?: SuggestedAction[];
  custom_payload?: CustomPayload;     // tool_history or page-specific payloads
}
```

### Suggested Values
Quick-select options the user can click to send as their next message.
```json
{
  "suggested_values": [
    {"label": "Yes, proceed", "value": "yes"},
    {"label": "No, cancel", "value": "no"}
  ]
}
```
Rendered as clickable chips below the message.

### Suggested Actions
Action buttons that trigger client-side or server-side handlers.
```json
{
  "suggested_actions": [
    {
      "label": "Apply Changes",
      "action": "apply_schema",
      "handler": "server",
      "data": {"schema_id": 123},
      "style": "primary"
    },
    {
      "label": "Close Chat",
      "action": "close_chat",
      "handler": "client",
      "style": "secondary"
    }
  ]
}
```
- `handler: "client"` - Execute on frontend (registered via ClientAction)
- `handler: "server"` - Send action back to backend for processing
- `style`: "primary" | "secondary" | "warning"

### Custom Payload
Structured data for rich UI rendering. Types include:
- `tool_history` - Array of tool calls with inputs/outputs
- `schema_proposal` - Database schema suggestions
- `validation_results` - Errors, warnings, suggestions
- `presentation_categories` - Article categorization
- `retrieval_proposal` - Search query suggestions
- `pubmed_article` - Article card data (from tool)

```json
{
  "custom_payload": {
    "type": "schema_proposal",
    "data": {
      "proposed_changes": {...},
      "confidence": "high",
      "reasoning": "Based on..."
    }
  }
}
```

---

## Agent Loop Pattern

The backend uses an agentic loop for multi-turn tool execution.

### File: `backend/services/agent_loop.py`

Reusable async generator that yields `AgentEvent` types:
- `AgentThinking` - Status update
- `AgentTextDelta` - Streaming text
- `AgentToolStart` - Tool begins
- `AgentToolProgress` - Tool progress
- `AgentToolComplete` - Tool finished
- `AgentComplete` - Loop finished successfully
- `AgentCancelled` - User cancelled
- `AgentError` - Error occurred

### Loop Structure
```python
for iteration in range(1, max_iterations + 1):
    # 1. Call model
    async for event in _call_model(client, api_kwargs, stream_text):
        if isinstance(event, _ModelResult):
            response = event.response
        else:
            yield event  # AgentTextDelta

    # 2. Check for tool use
    tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
    if not tool_use_blocks:
        yield AgentComplete(text=collected_text, tool_calls=tool_call_history)
        return

    # 3. Process tools
    async for event in _process_tools(tool_use_blocks, tools, db, user_id, context):
        if isinstance(event, _ToolsResult):
            tool_results = event.tool_results
            tool_call_history.extend(event.tool_records)
        else:
            yield event  # AgentToolStart, AgentToolProgress, AgentToolComplete

    # 4. Update messages for next iteration
    _append_tool_exchange(messages, response, tool_results)
```

### Helper Functions
- `_build_api_kwargs()` - Build Anthropic API call kwargs
- `_call_model()` - Stream LLM response, yield text events
- `_process_tools()` - Execute tools, yield tool events
- `_append_tool_exchange()` - Add assistant + tool_result messages

### Usage in GeneralChatService
```python
async for event in run_agent_loop(
    client=self.async_client,
    model=CHAT_MODEL,
    max_tokens=CHAT_MAX_TOKENS,
    max_iterations=MAX_TOOL_ITERATIONS,
    system_prompt=system_prompt,
    messages=messages,
    tools=tools_by_name,
    db=self.db,
    user_id=self.user_id,
    context=request.context,
    stream_text=True
):
    # Map AgentEvent to SSE StreamEvent
    if isinstance(event, AgentTextDelta):
        yield TextDeltaEvent(text=event.text).model_dump_json()
    elif isinstance(event, AgentToolStart):
        yield ToolStartEvent(tool=event.tool_name, ...).model_dump_json()
    # ...
```

---

## Frontend State Management

### useGeneralChat Hook State
```typescript
{
  messages: GeneralChatMessage[];     // Conversation history
  isLoading: boolean;                 // Request in progress
  streamingText: string;              // Current streaming response
  statusText: string | null;          // "Thinking..." status
  activeToolProgress: {               // Current tool execution
    toolName: string;
    updates: ToolProgressEvent[];
  } | null;
  error: string | null;
}
```

### Event Handling
```typescript
switch (event.type) {
  case 'status':
    setStatusText(event.message);
    break;
  case 'text_delta':
    setStatusText(null);
    collectedText += event.text;
    setStreamingText(collectedText);
    break;
  case 'tool_start':
    setStatusText(`Running ${event.tool}...`);
    setActiveToolProgress({ toolName: event.tool, updates: [] });
    break;
  case 'tool_progress':
    // Append to activeToolProgress.updates
    break;
  case 'tool_complete':
    setActiveToolProgress(null);
    break;
  case 'complete':
    // Add message to history, clear streaming state
    break;
  case 'error':
    // Show error, add error message to history
    break;
}
```

---

## UI Components

### ChatTray States

1. **Empty State**: No messages, show welcome prompt
2. **User Message**: Right-aligned blue bubble
3. **Streaming Response**: Left-aligned white bubble with pulsing dots
4. **Tool Progress**: Amber card with spinner showing tool name (visible even during streaming)
5. **Thinking Indicator**: Gray bubble with "Thinking..." (no streaming text yet)
6. **Final Message**: Left-aligned white bubble with:
   - Markdown-rendered text
   - Inline tool cards (replacing `[[tool:N]]` markers)
   - Suggested values as chips
   - Suggested actions as buttons
   - Custom payload indicator (if handler registered)

### Tool Card (Inline)
```
┌─────────────────────────────────────┐
│ 🔧 search_pubmed              [▼]   │
├─────────────────────────────────────┤
│ Input: {"query": "CRISPR"}          │
│ Output: Found 5 articles...         │
└─────────────────────────────────────┘
```
- Collapsed by default (just header)
- Click to expand and see input/output
- Styled distinctly from message text

### Floating Payload Panel
When a custom payload with a registered handler is received:
```
┌─────────────────────────────────────┐
│ 📋 Schema Proposal              [×] │
├─────────────────────────────────────┤
│                                     │
│  [PayloadHandler.render() output]   │
│                                     │
│  ┌─────────┐  ┌──────────┐         │
│  │ Accept  │  │  Reject  │         │
│  └─────────┘  └──────────┘         │
└─────────────────────────────────────┘
```

---

## System Prompt Construction

The GeneralChatService builds system prompts dynamically:

1. **Check page registration**: `has_page_payloads(current_page)`
2. **Build context section**: `context_builder(context)`
3. **Filter payloads by tab**: Match `relevant_tabs` to `active_tab`
4. **Include payload instructions**: From each `PayloadConfig.llm_instructions`
5. **Include client actions**: From `ClientAction` definitions
6. **Include tool descriptions**: Passed to Anthropic API

### System Prompt Template
```
You are a helpful AI assistant for Knowledge Horizon.

{page_context from context_builder}

YOUR ROLE:
- Answer questions and help the user understand the page
- When appropriate, use payload types for structured responses
- Be conversational and helpful

RESPONSE FORMAT:
Simply respond conversationally...

AVAILABLE PAYLOAD TYPES:
{payload_instructions from PayloadConfig.llm_instructions}

AVAILABLE CLIENT ACTIONS:
{action descriptions from ClientAction}

IMPORTANT:
- Only use payloads when they add value
- Use conversation history to inform responses
```

---

## File Structure

```
backend/
  schemas/
    general_chat.py              # Domain types + Stream event types
  services/
    agent_loop.py                # Generic agent loop (reusable)
    general_chat_service.py      # Chat service using agent loop
    chat_payloads/
      __init__.py                # Auto-imports page configs
      registry.py                # Core registry classes
      edit_stream.py             # edit_research_stream page config
      streams_list.py            # streams list page config
      new_stream.py              # new stream page config
      reports.py                 # reports page config (has tools)
  routers/
    general_chat.py              # SSE endpoint

frontend/
  lib/api/
    generalChatApi.ts            # Stream event types + API client
  hooks/
    useGeneralChat.ts            # Chat state management
  components/chat/
    ChatTray.tsx                 # Main chat UI
    ToolCallCard.tsx             # Inline tool call renderer (TODO)
    SchemaProposalCard.tsx       # Payload handler card
    PresentationCategoriesCard.tsx
    StreamSuggestionsCard.tsx
    ...
  types/
    chat.ts                      # Domain types + PayloadHandler interface
```

---

## TODO

### Backend
1. Emit `[[tool:N]]` markers in text stream on `tool_complete`
2. Include `tool_history` in `custom_payload` of `complete` event
3. Consider streaming tool support (yield `tool_progress` during execution)

### Frontend
1. Create `ToolCallCard` component for inline rendering
2. Parse `[[tool:N]]` markers in message text
3. Replace markers with `ToolCallCard` using `tool_history[N]`
4. Register `tool_history` as a built-in payload handler in ChatTray
