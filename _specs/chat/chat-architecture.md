# Chat System Architecture

## Overview

The chat system provides streaming LLM interactions with tool support. It consists of:

- **Frontend**: ChatTray component with payload rendering
- **Backend**: Streaming service with agent loop and tool execution
- **Contract**: Payloads flow via `custom_payload` field, matched by `type`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                     │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ ChatTray                                                              │   │
│  │                                                                       │   │
│  │  context: {                      ┌─────────────────────────────────┐  │   │
│  │    current_page: "reports",      │  Payload Panel (spawns when     │  │   │
│  │    report_id: 123,        ───────│  payload received)              │  │   │
│  │    stream_id: 456,               │                                 │  │   │
│  │    ...                           │  Looks up handler by type:      │  │   │
│  │  }                               │  1. Page-specific handlers      │  │   │
│  │                                  │  2. Global registry             │  │   │
│  │  Messages + Input                └─────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                         ▲                                    │
└─────────────────────────────────────────┼────────────────────────────────────┘
                                          │ SSE Stream
┌─────────────────────────────────────────┼────────────────────────────────────┐
│ BACKEND                                 │                                    │
│                                         │                                    │
│  ┌──────────────────┐    ┌─────────────────────────┐    ┌────────────────┐  │
│  │ ChatStreamService│───▶│      Agent Loop         │───▶│ Tool Registry  │  │
│  │                  │    │                         │    │                │  │
│  │ Builds prompts   │    │ Call LLM → Execute      │    │ Global tools   │  │
│  │ from context     │    │ tools → Repeat          │    │ Return payloads│  │
│  └──────────────────┘    └─────────────────────────┘    └────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Frontend Context

When sending a message, the frontend provides context about the user's current state:

```typescript
// Sent with every chat request
interface ChatRequest {
    message: string;
    context: {
        current_page: string;       // "reports", "streams", "edit_stream", etc.
        report_id?: number;         // If viewing a report
        stream_id?: number;         // If in a stream context
        current_article?: {...};    // If viewing a specific article
        active_tab?: string;        // Current UI tab
        // ... any page-specific data
    };
    conversation_history: [...];    // Previous messages
    conversation_id?: number;       // For persistence
}
```

The backend uses this context to:
- Build appropriate system prompts
- Load relevant data (reports, streams)
- Pass to tool executors

---

## 2. Backend: Tool Registration

Tools are globally registered and available regardless of page.

**Location**: `backend/tools/`

```python
# tools/registry.py

@dataclass
class ToolResult:
    text: str                              # Text for LLM to see
    payload: Optional[Dict[str, Any]]      # {type, data} for frontend

@dataclass
class ToolConfig:
    name: str                              # "search_pubmed"
    description: str                       # For LLM
    input_schema: Dict[str, Any]           # JSON schema
    executor: Callable                     # Function to execute

# Global registry
def register_tool(tool: ToolConfig): ...
def get_tools_dict() -> Dict[str, ToolConfig]: ...
```

**Example Tool**:

```python
# tools/builtin/pubmed.py

def execute_search_pubmed(params, db, user_id, context) -> ToolResult:
    results = pubmed_service.search(params["query"])

    return ToolResult(
        text=f"Found {len(results)} articles...",  # LLM sees this
        payload={
            "type": "pubmed_search_results",       # Frontend matches on this
            "data": {"query": ..., "articles": results}
        }
    )

register_tool(ToolConfig(
    name="search_pubmed",
    description="Search PubMed for articles",
    input_schema={...},
    executor=execute_search_pubmed
))
```

---

## 3. Backend: LLM Payloads (chat_payloads)

The LLM can also output structured payloads in its text response.

**Location**: `backend/services/chat_payloads/`

```python
# chat_payloads/registry.py

@dataclass
class PayloadConfig:
    type: str                    # "schema_proposal"
    parse_marker: str            # "SCHEMA_PROPOSAL:"
    llm_instructions: str        # Added to system prompt
    parser: Callable             # Extracts {type, data} from JSON

def register_page(page: str, payloads: List[PayloadConfig], context_builder): ...
def get_page_payloads(page: str) -> List[PayloadConfig]: ...
```

**How it works**:

1. `llm_instructions` is injected into system prompt
2. LLM outputs: `"Here's my proposal: SCHEMA_PROPOSAL: {...json...}"`
3. `_parse_llm_response()` finds marker, extracts JSON
4. Parser returns `{type: "schema_proposal", data: {...}}`

---

## 4. Payload Flow: Tools vs LLM

Both sources converge to `custom_payload`:

```python
# chat_stream_service.py

# Tool payloads collected during agent loop
collected_payloads = event.payloads  # From tool ToolResult.payload

# LLM payloads parsed from response text
parsed = self._parse_llm_response(collected_text, context)

# Tool payloads take precedence
custom_payload = collected_payloads[-1] if collected_payloads else parsed.get("custom_payload")

# Unified output
ChatResponsePayload(
    message=...,
    custom_payload=custom_payload,  # Same field regardless of source
    ...
)
```

---

## 5. Frontend: Payload Handlers

Handlers render payloads and optionally provide callbacks.

**Global Registry** (`lib/chat/payloadRegistry.ts`):

```typescript
interface PayloadHandler {
    render: (data: any) => React.ReactNode;
    renderOptions?: {
        panelWidth?: string;
        headerTitle?: string;
    };
}

registerPayloadHandler('pubmed_search_results', {
    render: (data) => <PubMedSearchResultsCard data={data} />,
    renderOptions: { panelWidth: '800px', headerTitle: 'Search Results' }
});
```

**Page-Specific Handlers** (for interactive payloads needing callbacks):

```typescript
// In page component
<ChatTray
    payloadHandlers={{
        schema_proposal: {
            render: (data, callbacks) => (
                <SchemaProposalCard
                    proposal={data}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: (data) => setSchema(data),  // Updates page state
            onReject: () => toast.info('Rejected'),
        }
    }}
/>
```

**Lookup Order** (in ChatTray):

1. Check `payloadHandlers` prop (page-specific)
2. Fall back to global registry

---

## 6. Suggestions and Actions

The LLM can include suggestions in its response:

```typescript
interface ChatResponsePayload {
    message: string;
    custom_payload?: { type: string; data: any };

    // Quick input suggestions (chips user can click to send)
    suggested_values?: Array<{
        label: string;      // "Yes"
        value: string;      // "Yes, please proceed"
    }>;

    // Action buttons
    suggested_actions?: Array<{
        label: string;      // "View Report"
        action: string;     // Action identifier
        handler: 'client' | 'server';
    }>;
}
```

- **suggested_values**: Rendered as clickable chips, clicking sends the value as a message
- **suggested_actions**: Rendered as buttons, `client` actions are handled by frontend, `server` actions sent to backend

---

## 7. SSE Event Types

```
status          → "Thinking..."
text_delta      → Streaming text token
tool_start      → Tool execution begins
tool_progress   → Tool progress update (for streaming tools)
tool_complete   → Tool finished, includes [[tool:N]] marker
complete        → Final payload with message, custom_payload, suggestions
error           → Error message
```

---

## Key Files

| Location | Purpose |
|----------|---------|
| `backend/tools/registry.py` | ToolConfig, ToolResult, tool registration |
| `backend/tools/builtin/*.py` | Tool implementations |
| `backend/services/chat_payloads/` | LLM payload configs per page |
| `backend/services/chat_stream_service.py` | Orchestrates both payload sources |
| `backend/agents/agent_loop.py` | Multi-turn tool execution |
| `frontend/src/lib/chat/payloadRegistry.ts` | Global handler registry |
| `frontend/src/lib/chat/payloads.ts` | Handler registrations |
| `frontend/src/components/chat/ChatTray.tsx` | Main chat UI, payload detection |
| `frontend/src/context/ChatContext.tsx` | Chat state management |

---

## Adding a New Payload

### From a Tool:

1. Return `ToolResult` with payload in your tool executor
2. Create a card component in `frontend/src/components/chat/`
3. Register handler in `frontend/src/lib/chat/payloads.ts`

### From LLM:

1. Add `PayloadConfig` in `backend/services/chat_payloads/<page>.py`
2. Create card component and register handler (same as tool)
3. For interactive payloads, pass handler via `payloadHandlers` prop instead
