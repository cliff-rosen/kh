# Payload System Architecture

This document describes the integrated payload system for the chat feature, covering both tool-generated and LLM-generated payloads.

## Overview

Payloads are structured data that flow from the backend to the frontend for rich rendering. They can originate from two sources:

1. **Tool payloads** - Returned by tools via `ToolResult.payload`
2. **LLM payloads** - Parsed from structured text in LLM responses

Both sources converge to a single `custom_payload` field in the API response, and the frontend renders them using registered handlers.

```
┌─────────────────────────────────────────────────────────────────────┐
│                            BACKEND                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────┐              ┌──────────────────┐            │
│   │      TOOLS       │              │    LLM OUTPUT    │            │
│   │                  │              │                  │            │
│   │  ToolResult(     │              │  "Here's my      │            │
│   │    text="...",   │              │   proposal:      │            │
│   │    payload={     │              │   SCHEMA_PROPOSAL│            │
│   │      type,       │              │   {...json...}"  │            │
│   │      data        │              │                  │            │
│   │    }             │              └────────┬─────────┘            │
│   │  )               │                       │                      │
│   └────────┬─────────┘                       │                      │
│            │                                 ▼                      │
│            │                    ┌────────────────────────┐          │
│            │                    │  _parse_llm_response() │          │
│            │                    │  Extracts payload from │          │
│            │                    │  LLM text using        │          │
│            │                    │  PayloadConfig parsers │          │
│            │                    └────────────┬───────────┘          │
│            │                                 │                      │
│            └───────────────┬─────────────────┘                      │
│                            ▼                                        │
│                  ┌─────────────────┐                                │
│                  │  custom_payload │  ← Unified output              │
│                  │  {type, data}   │                                │
│                  └────────┬────────┘                                │
│                           │                                         │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼  API Response
┌───────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                     │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                  ┌─────────────────┐                                  │
│                  │  custom_payload │                                  │
│                  │  {type, data}   │                                  │
│                  └────────┬────────┘                                  │
│                           │                                           │
│                           ▼                                           │
│           ┌───────────────────────────────────┐                       │
│           │         Handler Lookup            │                       │
│           │                                   │                       │
│           │  1. Check page-specific handlers  │  ← Interactive        │
│           │     (payloadHandlers prop)        │    (need callbacks)   │
│           │                                   │                       │
│           │  2. Check global registry         │  ← Read-only          │
│           │     (lib/chat/payloadRegistry)    │    (display only)     │
│           │                                   │                       │
│           └───────────────┬───────────────────┘                       │
│                           │                                           │
│                           ▼                                           │
│                  ┌─────────────────┐                                  │
│                  │  Render payload │                                  │
│                  │  with handler   │                                  │
│                  └─────────────────┘                                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Backend Architecture

### 1. Tools Registry (`backend/tools/`)

Global registry for tools that the LLM can call.

```
backend/tools/
├── __init__.py          # Exports: register_tool, get_all_tools, get_tools_dict
├── registry.py          # ToolConfig, ToolResult, ToolProgress definitions
├── executor.py          # Async tool execution with streaming support
└── builtin/
    ├── __init__.py      # Auto-imports tool modules
    └── pubmed.py        # PubMed tools (search_pubmed, get_pubmed_article)
```

**Key Types:**

```python
@dataclass
class ToolResult:
    """Result from tool execution."""
    text: str                              # Text for LLM context
    payload: Optional[Dict[str, Any]]      # Payload for frontend {type, data}

@dataclass
class ToolConfig:
    """Tool definition."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    executor: Callable[..., Union[str, ToolResult]]
```

**Example Tool with Payload:**

```python
# backend/tools/builtin/pubmed.py

def execute_get_pubmed_article(params, db, user_id, context):
    # ... fetch article ...

    return ToolResult(
        text="Article details for PMID 12345...",  # For LLM
        payload={
            "type": "pubmed_article",              # Payload type
            "data": {                              # Payload data
                "pmid": "12345",
                "title": "...",
                "authors": "...",
                # ...
            }
        }
    )
```

### 2. Chat Payloads (`backend/services/chat_payloads/`)

Page-specific LLM payload configurations. Enables the LLM to output structured payloads in its text response.

```
backend/services/chat_payloads/
├── __init__.py          # Package exports
├── registry.py          # PayloadConfig, ClientAction, PageConfig
├── edit_stream.py       # Payloads for edit_research_stream page
├── new_stream.py        # Payloads for new_stream page
├── streams_list.py      # Payloads for streams_list page
└── reports.py           # Context builder for reports page
```

**Key Types:**

```python
@dataclass
class PayloadConfig:
    """Configuration for LLM-generated payload."""
    type: str                    # e.g., "schema_proposal"
    parse_marker: str            # e.g., "SCHEMA_PROPOSAL:"
    llm_instructions: str        # Instructions for LLM
    parser: Callable             # Function to parse JSON to {type, data}
    relevant_tabs: Optional[List[str]]  # Tab filtering
```

**How It Works:**

1. `PayloadConfig.llm_instructions` is injected into the system prompt
2. LLM outputs text like: `"Here's my proposal: SCHEMA_PROPOSAL: {...json...}"`
3. `_parse_llm_response()` finds the marker and extracts JSON
4. Parser converts to `{type, data}` format
5. Flows to `custom_payload` in response

### 3. General Chat Service (`backend/services/general_chat_service.py`)

Orchestrates both payload sources:

```python
# Tool payloads collected during agent loop
if collected_payloads:
    custom_payload = collected_payloads[-1]

# LLM payloads parsed from response text
if not custom_payload:
    parsed = self._parse_llm_response(collected_text, request.context)
    custom_payload = parsed.get("custom_payload")

# Both flow to the same field
final_payload = ChatResponsePayload(
    message=parsed["message"],
    custom_payload=custom_payload,  # ← Unified output
    tool_history=tool_call_history
)
```

## Frontend Architecture

### 1. Global Payload Registry (`frontend/src/lib/chat/`)

```
frontend/src/lib/chat/
├── index.ts             # Exports and triggers registration
├── payloadRegistry.ts   # Registry implementation
└── payloads.ts          # Handler registrations
```

**Registry API:**

```typescript
// payloadRegistry.ts
interface PayloadHandler {
    render: (payload: any, callbacks: PayloadCallbacks) => React.ReactNode;
    renderOptions?: {
        panelWidth?: string;
        headerTitle?: string;
        headerIcon?: string;
    };
    onAccept?: (data: any) => void;
    onReject?: (data: any) => void;
}

function registerPayloadHandler(type: string, handler: PayloadHandler): void;
function getPayloadHandler(type: string): PayloadHandler | undefined;
```

**Registered Handlers:**

```typescript
// payloads.ts

// PubMed article card (from get_pubmed_article tool)
registerPayloadHandler('pubmed_article', {
    render: (data) => <PubMedArticleCard article={data} />,
    renderOptions: { panelWidth: '550px', headerTitle: 'PubMed Article' }
});

// PubMed search results table (from search_pubmed tool)
registerPayloadHandler('pubmed_search_results', {
    render: (data) => <PubMedSearchResultsCard data={data} />,
    renderOptions: { panelWidth: '800px', headerTitle: 'PubMed Search Results' }
});
```

### 2. Page-Specific Handlers

Passed via `payloadHandlers` prop to ChatTray. Used for interactive payloads that need page state and callbacks.

```typescript
// Example: EditStreamPage.tsx

<ChatTray
    payloadHandlers={{
        schema_proposal: {
            render: (payload, callbacks) => (
                <SchemaProposalCard
                    proposal={payload}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: handleSchemaProposalAccept,  // Has access to page state
            onReject: handleSchemaProposalReject,
        }
    }}
/>
```

### 3. Handler Lookup Order

In `ChatTray.tsx`:

```typescript
// 1. Check page-specific handlers first
const handler = payloadHandlers?.[payloadType];

// 2. Fall back to global registry
if (!handler) {
    handler = getPayloadHandler(payloadType);
}
```

## Adding New Payloads

### Adding a Tool Payload

1. **Create/update tool** (`backend/tools/builtin/`)

```python
def execute_my_tool(params, db, user_id, context):
    # ... do work ...

    return ToolResult(
        text="Description for LLM...",
        payload={
            "type": "my_payload_type",
            "data": { ... }
        }
    )
```

2. **Create frontend component** (`frontend/src/components/chat/`)

```typescript
// MyPayloadCard.tsx
export default function MyPayloadCard({ data }: { data: MyPayloadData }) {
    return <div>...</div>;
}
```

3. **Register handler** (`frontend/src/lib/chat/payloads.ts`)

```typescript
import MyPayloadCard from '../../components/chat/MyPayloadCard';

registerPayloadHandler('my_payload_type', {
    render: (data) => <MyPayloadCard data={data} />,
    renderOptions: { panelWidth: '600px', headerTitle: 'My Payload' }
});
```

### Adding an LLM Payload

1. **Define PayloadConfig** (`backend/services/chat_payloads/<page>.py`)

```python
def parse_my_payload(text: str) -> Dict[str, Any]:
    data = json.loads(text.strip())
    return {"type": "my_payload", "data": data}

MY_PAYLOADS = [
    PayloadConfig(
        type="my_payload",
        parse_marker="MY_PAYLOAD:",
        llm_instructions="""
        MY_PAYLOAD - Use when user asks for X:

        MY_PAYLOAD: {
            "field1": "value",
            "field2": "value"
        }
        """,
        parser=parse_my_payload
    )
]

register_page("my_page", MY_PAYLOADS, build_context)
```

2. **Create frontend component and register handler** (same as tool payload)

For interactive payloads that need page callbacks, register via `payloadHandlers` prop instead of global registry.

## Payload Type Reference

| Type | Source | Handler Location | Description |
|------|--------|------------------|-------------|
| `pubmed_article` | Tool | Global | Single PubMed article details |
| `pubmed_search_results` | Tool | Global | Table of search results |
| `schema_proposal` | LLM | Page (EditStream) | Proposed schema changes |
| `validation_results` | LLM | Page (EditStream) | Validation feedback |
| `presentation_categories` | LLM | Page (EditStream) | Category organization |
| `stream_template` | LLM | Page (CreateStream) | Full stream configuration |
| `stream_suggestions` | LLM | Page (StreamsList) | New stream suggestions |
| `portfolio_insights` | LLM | Page (StreamsList) | Portfolio analysis |
| `quick_setup` | LLM | Page (StreamsList) | Quick stream setup |

## File Reference

### Backend

| File | Purpose |
|------|---------|
| `backend/tools/registry.py` | Tool definitions (ToolConfig, ToolResult) |
| `backend/tools/builtin/*.py` | Tool implementations |
| `backend/services/chat_payloads/registry.py` | LLM payload definitions (PayloadConfig) |
| `backend/services/chat_payloads/<page>.py` | Page-specific payloads and context |
| `backend/services/general_chat_service.py` | Orchestrates both payload sources |
| `backend/services/agent_loop.py` | Executes tools, collects payloads |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/lib/chat/payloadRegistry.ts` | Global handler registry |
| `frontend/src/lib/chat/payloads.ts` | Handler registrations |
| `frontend/src/components/chat/ChatTray.tsx` | Renders payloads, checks both registries |
| `frontend/src/components/chat/*Card.tsx` | Payload rendering components |
