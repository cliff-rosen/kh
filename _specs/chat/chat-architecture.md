# Chat System Architecture

## Overview

The chat system provides streaming LLM interactions with tool support. The key architectural principle is that **payload types are defined centrally** and all touchpoints reference them:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        schemas/payloads.py                                   │
│                     (Central Payload Registry)                               │
│                                                                              │
│  PayloadType:                                                                │
│    - name: "pubmed_search_results"                                          │
│    - schema: { JSON schema for validation }                                 │
│    - llm_instructions: "When this payload is returned..."                   │
│    - frontend_config: { panel_width, title, icon }                          │
└─────────────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
         ┌──────────┴──────────┐        │         ┌──────────┴──────────┐
         ▼                     ▼        ▼         ▼                     ▼
┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────────────┐
│ ToolConfig      │  │ System Prompt       │  │ Frontend PayloadRegistry    │
│                 │  │                     │  │                             │
│ payload_type=   │  │ Auto-includes       │  │ Handler registered for      │
│ "pubmed_search_ │  │ llm_instructions    │  │ "pubmed_search_results"     │
│  results"       │  │ for all relevant    │  │                             │
│                 │  │ payload types       │  │ Uses frontend_config for    │
│ Must match      │  │                     │  │ panel dimensions            │
│ registered type │  │                     │  │                             │
└─────────────────┘  └─────────────────────┘  └─────────────────────────────┘
```

---

## 1. Central Payload Registry

All payload types are defined in `schemas/payloads.py`. This is the **single source of truth**.

```python
# schemas/payloads.py

@dataclass
class PayloadType:
    """Complete definition of a payload type."""
    name: str                              # "pubmed_search_results"
    description: str                       # Human-readable description
    source: str                            # "tool" or "llm"
    schema: Dict[str, Any]                 # JSON schema for data validation
    llm_instructions: str                  # Instructions for LLM (included in prompt)
    frontend_config: Optional[Dict] = None # { panel_width, title, icon }


# Example: Tool payload
register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "total_results": {"type": "integer"},
            "articles": {"type": "array", "items": {...}}
        },
        "required": ["query", "articles"]
    },
    llm_instructions="""
    When the search_pubmed tool returns this payload, a table of articles
    will be displayed to the user. Briefly summarize what was found and
    highlight any particularly relevant articles based on the user's question.
    """,
    frontend_config={
        "panel_width": "800px",
        "title": "PubMed Search Results",
        "icon": "🔍"
    }
))


# Example: LLM payload
register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to a research stream schema",
    source="llm",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "purpose": {"type": "string"},
            "topics": {"type": "array"},
            "rationale": {"type": "string"}
        }
    },
    llm_instructions="""
    SCHEMA_PROPOSAL - Use when the user asks for help improving their stream configuration.
    Output the marker followed by JSON:

    SCHEMA_PROPOSAL: {
        "stream_name": "...",
        "purpose": "...",
        "topics": [...],
        "rationale": "Why these changes improve the stream"
    }
    """,
    frontend_config={
        "panel_width": "500px",
        "title": "Schema Proposal",
        "icon": "📝"
    }
))
```

**What the registry provides:**
- `get_payload_type(name)` - Get a payload type by name
- `get_payload_types_for_tools(tool_names)` - Get payload types for a list of tools
- `get_payload_types_for_page(page)` - Get LLM payload types for a page
- `get_llm_instructions(payload_types)` - Get combined instructions for prompt

---

## 2. How Tools Reference Payload Types

Tools declare which payload type they return. The type must exist in the registry.

```python
# tools/builtin/pubmed.py

def execute_search_pubmed(params, db, user_id, context) -> ToolResult:
    results = pubmed_service.search(params["query"])

    return ToolResult(
        text=f"Found {len(results)} articles...",
        payload={
            "type": "pubmed_search_results",  # Must match registered type
            "data": {"query": ..., "articles": results}
        }
    )

register_tool(ToolConfig(
    name="search_pubmed",
    description="Search PubMed for articles",
    input_schema={...},
    executor=execute_search_pubmed,
    payload_type="pubmed_search_results"  # References registry
))
```

**Validation (in agent_loop.py):**
- When tool returns, verify `payload.type` matches `ToolConfig.payload_type`
- Optionally validate `payload.data` against the registered schema

---

## 3. How the System Prompt Includes Instructions

The `ChatStreamService` builds the system prompt and automatically includes LLM instructions for all relevant payload types.

```python
# services/chat_stream_service.py

def _build_system_prompt(self, context: Dict[str, Any]) -> str:
    # Get tools being used
    tools = get_tools_dict()
    tool_payload_types = [t.payload_type for t in tools.values() if t.payload_type]

    # Get page-specific LLM payload types
    page = context.get("current_page")
    page_payload_types = get_payload_types_for_page(page)

    # Combine all payload types
    all_payload_types = set(tool_payload_types + page_payload_types)

    # Get instructions for all payload types
    payload_instructions = get_llm_instructions(all_payload_types)

    return f"""You are a helpful AI assistant...

    {payload_instructions}

    {page_context}
    """
```

**The prompt now includes:**
- Instructions for tool payloads (what to say when `pubmed_search_results` is returned)
- Instructions for LLM payloads (how to output `SCHEMA_PROPOSAL:` JSON)

---

## 4. How Frontend Handlers Connect

Frontend handlers are registered by payload type name. The registry can provide config.

```typescript
// lib/chat/payloads.ts

import { getPayloadConfig } from './payloadRegistry';

// Handler registration references the same type name
registerPayloadHandler('pubmed_search_results', {
    render: (data) => <PubMedSearchResultsCard data={data} />,
    // renderOptions can come from backend config or be overridden
    renderOptions: getPayloadConfig('pubmed_search_results')?.frontend_config
});

registerPayloadHandler('schema_proposal', {
    render: (data, callbacks) => (
        <SchemaProposalCard
            proposal={data}
            onAccept={callbacks.onAccept}
            onReject={callbacks.onReject}
        />
    ),
    renderOptions: getPayloadConfig('schema_proposal')?.frontend_config
});
```

**Optional: API endpoint for payload configs**
```typescript
// On app init, fetch payload configs from backend
const configs = await fetch('/api/chat/payload-types');
// Use for validation, panel sizing, etc.
```

---

## 5. Request/Response Flow

### What the Frontend Sends

```typescript
interface ChatRequest {
    message: string;
    context: {
        current_page: string;       // "reports", "streams", etc.
        report_id?: number;
        stream_id?: number;
        current_article?: {...};
        active_tab?: string;
    };
    conversation_history: Array<{role, content, timestamp}>;
    conversation_id?: number;
}
```

### What the Backend Returns (SSE)

```
status          → { type: "status", message: "Thinking..." }
text_delta      → { type: "text_delta", text: "..." }
tool_start      → { type: "tool_start", tool: "search_pubmed", input: {...} }
tool_progress   → { type: "tool_progress", tool: "...", stage: "...", progress: 0.5 }
tool_complete   → { type: "tool_complete", tool: "...", index: 0 }
complete        → { type: "complete", payload: ChatResponsePayload }
error           → { type: "error", message: "..." }
```

### ChatResponsePayload

```typescript
interface ChatResponsePayload {
    message: string;
    custom_payload?: {
        type: string;    // Matches registered PayloadType.name
        data: any;       // Matches registered PayloadType.schema
    };
    suggested_values?: Array<{ label: string; value: string }>;
    suggested_actions?: Array<{ label: string; action: string; handler: 'client' | 'server' }>;
    tool_history?: Array<{ tool_name: string; input: any; output: string }>;
    conversation_id?: number;
}
```

---

## 6. Payload Sources: Tools vs LLM

Both sources produce the same `custom_payload` structure:

**Tool payloads:**
1. Tool executes and returns `ToolResult(text=..., payload={type, data})`
2. Agent loop collects payloads
3. Last payload becomes `custom_payload` in response

**LLM payloads:**
1. LLM outputs text with marker: `"SCHEMA_PROPOSAL: {...json...}"`
2. `_parse_llm_response()` finds marker, extracts JSON
3. Becomes `custom_payload` in response

**Priority:** Tool payloads take precedence over LLM-parsed payloads.

---

## 7. Suggestions and Actions

The LLM can include interactive elements:

```typescript
// Suggested values - clickable chips that send the value as a message
suggested_values: [
    { label: "Yes", value: "Yes, please proceed" },
    { label: "No", value: "No, let me reconsider" }
]

// Suggested actions - buttons that trigger handlers
suggested_actions: [
    { label: "View Report", action: "navigate_to_report", handler: "client" },
    { label: "Run Analysis", action: "run_analysis", handler: "server" }
]
```

---

## Key Files

| Location | Purpose |
|----------|---------|
| `backend/schemas/payloads.py` | **Central payload type registry** (schema, LLM instructions, frontend config) |
| `backend/tools/registry.py` | ToolConfig with `payload_type` field |
| `backend/tools/builtin/*.py` | Tool implementations |
| `backend/services/chat_stream_service.py` | Builds prompt with payload instructions |
| `backend/agents/agent_loop.py` | Executes tools, validates payloads |
| `frontend/src/lib/chat/payloadRegistry.ts` | Handler registry (keyed by payload type name) |
| `frontend/src/lib/chat/payloads.ts` | Handler registrations |
| `frontend/src/components/chat/ChatTray.tsx` | Renders payloads using handlers |

---

## Adding a New Payload Type

### 1. Register the Payload Type

```python
# backend/schemas/payloads.py

register_payload_type(PayloadType(
    name="my_payload",
    description="What this payload contains",
    source="tool",  # or "llm"
    schema={
        "type": "object",
        "properties": {...},
        "required": [...]
    },
    llm_instructions="""
    [For tools]: When this payload is returned, explain to the user...
    [For LLM]: MY_PAYLOAD - Use when user asks for X. Output:
    MY_PAYLOAD: { "field": "value" }
    """,
    frontend_config={
        "panel_width": "500px",
        "title": "My Payload",
        "icon": "📦"
    }
))
```

### 2a. For Tool Payloads

```python
# backend/tools/builtin/my_tool.py

register_tool(ToolConfig(
    name="my_tool",
    description="...",
    input_schema={...},
    executor=execute_my_tool,
    payload_type="my_payload"  # Must match registered type
))

def execute_my_tool(params, db, user_id, context) -> ToolResult:
    return ToolResult(
        text="...",
        payload={"type": "my_payload", "data": {...}}
    )
```

### 2b. For LLM Payloads

```python
# backend/services/chat_payloads/<page>.py

# The PayloadConfig references the registered type
PAGE_PAYLOADS = [
    PayloadConfig(
        type="my_payload",           # Must match registered type
        parse_marker="MY_PAYLOAD:",  # What to look for in LLM output
        parser=parse_my_payload      # Extracts JSON from text
        # llm_instructions come from the central registry
    )
]
```

### 3. Create Frontend Handler

```typescript
// frontend/src/lib/chat/payloads.ts

registerPayloadHandler('my_payload', {
    render: (data) => <MyPayloadCard data={data} />,
    renderOptions: getPayloadConfig('my_payload')?.frontend_config
});
```

---

## Validation Points

The system validates at multiple points:

1. **Tool registration** - Warns if `payload_type` doesn't exist in registry
2. **Tool execution** - Validates returned `payload.type` matches `ToolConfig.payload_type`
3. **Schema validation** - Optionally validates `payload.data` against registered schema
4. **Frontend** - Handler lookup fails gracefully if type not registered

This ensures the payload type name is the **single contract** that connects:
- Tool output → LLM instructions → Frontend rendering
