# Chat System Architecture

## Overview

The chat system provides an intelligent, context-aware assistant that understands where the user is in the application and what they're working on. It combines streaming LLM interactions with tool execution to help users explore research, manage streams, and work with their data.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Page Context** | The assistant knows what page you're on, what report/stream/article you're viewing, and adapts its behavior accordingly |
| **Tool Execution** | The LLM can call tools (search PubMed, fetch articles, etc.) and the system streams progress updates in real-time |
| **Rich Payloads** | Tools and the LLM can return structured data that renders as interactive cards, tables, or custom UI |
| **Interactive Suggestions** | The assistant can offer clickable suggestions and action buttons to guide the conversation |
| **Conversation Persistence** | Conversations are saved and can be continued across sessions |

---

## 1. Page Context System

The chat adapts to the user's current location in the app. This is the foundation that makes the assistant useful.

### What Context Includes

```typescript
interface ChatContext {
    current_page: string;       // "reports", "streams", "dashboard", etc.
    report_id?: number;         // If viewing a specific report
    stream_id?: number;         // If viewing a specific stream
    current_article?: {...};    // If viewing an article detail
    active_tab?: string;        // Which tab is active on the page
}
```

### How Context is Used

Each page can register:
1. **Context Builder** - A function that generates page-specific LLM instructions
2. **Page Payloads** - Structured outputs the LLM can produce on this page
3. **Client Actions** - What actions the UI can handle from this page

```python
# backend/services/chat_page_config/streams.py

def build_streams_context(context: Dict[str, Any]) -> str:
    stream_id = context.get("stream_id")
    if stream_id:
        stream = get_stream(stream_id)
        return f"""
        The user is viewing stream "{stream.name}".
        Purpose: {stream.purpose}
        Topics: {stream.topics}

        Help them refine their stream configuration or understand their articles.
        """
    return "The user is on the streams list page."

register_page(
    page="streams",
    context_builder=build_streams_context,
    payloads=[...],
    client_actions=[...]
)
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/services/chat_page_config/registry.py` | Page registration framework |
| `backend/services/chat_page_config/<page>.py` | Per-page context and payload configs |
| `backend/services/chat_stream_service.py` | Assembles full system prompt with context |

---

## 2. Tool System

The LLM can call tools to perform actions and retrieve information. Tools are globally available regardless of which page the chat is on.

### Tool Registration

```python
# backend/tools/builtin/pubmed.py

register_tool(ToolConfig(
    name="search_pubmed",
    description="Search PubMed for research articles",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
            "max_results": {"type": "integer", "default": 10}
        },
        "required": ["query"]
    },
    executor=execute_search_pubmed,
    category="research",
    payload_type="pubmed_search_results"  # What structured data this tool returns
))
```

### Tool Execution Flow

```
User message → LLM decides to use tool → Agent loop executes tool
    ↓
Tool returns ToolResult(text=..., payload=...)
    ↓
LLM sees text result, formulates response
    ↓
Frontend receives payload, renders rich UI
```

### Streaming Tools

Tools can stream progress updates for long-running operations:

```python
def execute_long_search(params, db, user_id, context):
    yield ToolProgress(stage="searching", message="Searching...", progress=0.2)
    results = search(...)
    yield ToolProgress(stage="processing", message="Processing...", progress=0.8)
    return ToolResult(text="Found results", payload={...})
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/tools/registry.py` | ToolConfig, ToolResult, ToolProgress definitions |
| `backend/tools/builtin/*.py` | Tool implementations |
| `backend/agents/agent_loop.py` | Executes tools, handles streaming, collects results |

---

## 3. Rich Payloads

Beyond plain text, the chat can display structured data as interactive UI components. Payloads can come from either tools or the LLM itself.

### Payload Sources

**Tool Payloads**: Tools return structured data alongside text
```python
return ToolResult(
    text="Found 15 articles matching your query...",
    payload={
        "type": "pubmed_search_results",
        "data": {"query": "...", "articles": [...]}
    }
)
```

**LLM Payloads**: The LLM outputs a marker that gets parsed
```
LLM output: "Here's my proposed schema:
SCHEMA_PROPOSAL: {"stream_name": "...", "topics": [...]}"

→ Parsed into: custom_payload = {type: "schema_proposal", data: {...}}
```

### Frontend Rendering

The frontend has a payload handler registry that maps type names to React components:

```typescript
// frontend/src/lib/chat/payloads.ts

registerPayloadHandler('pubmed_search_results', {
    render: (data) => <PubMedSearchResultsCard data={data} />
});

registerPayloadHandler('schema_proposal', {
    render: (data, callbacks) => (
        <SchemaProposalCard
            proposal={data}
            onAccept={callbacks.onAccept}
            onReject={callbacks.onReject}
        />
    )
});
```

### Central Payload Registry

Payload types are defined centrally in `schemas/payloads.py`. This is the single source of truth for:
- Type name and description
- JSON schema for validation
- Whether the source is "tool" or "llm"

```python
# backend/schemas/payloads.py

register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "articles": {"type": "array", "items": {...}}
        },
        "required": ["query", "articles"]
    }
))
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/schemas/payloads.py` | Central payload type registry |
| `backend/services/chat_page_config/<page>.py` | LLM payload configs per page |
| `frontend/src/lib/chat/payloadRegistry.ts` | Frontend handler registry |
| `frontend/src/lib/chat/payloads.ts` | Handler registrations |

---

## 4. Suggested Values and Actions

The LLM can provide interactive elements that guide the user through a conversation.

### Suggested Values

Clickable chips that send a pre-filled message when clicked:

```typescript
suggested_values: [
    { label: "Yes", value: "Yes, please proceed with that" },
    { label: "No", value: "No, let me reconsider" },
    { label: "Show more", value: "Show me more results" }
]
```

The frontend renders these as chips below the assistant's message. Clicking one sends the `value` as the user's next message.

### Suggested Actions

Buttons that trigger specific handlers:

```typescript
suggested_actions: [
    { label: "View Report", action: "navigate_to_report", handler: "client" },
    { label: "Run Analysis", action: "run_analysis", handler: "server" }
]
```

- **Client handlers**: Execute in the frontend (navigation, UI changes)
- **Server handlers**: Send an action request back to the server

### How the LLM Provides Suggestions

The LLM is instructed to output suggestions in a parseable format. The backend extracts these and includes them in the response payload.

---

## 5. Streaming Protocol

The backend uses Server-Sent Events (SSE) to stream responses in real-time.

### Event Types

```
status          → { type: "status", message: "Thinking..." }
text_delta      → { type: "text_delta", text: "..." }
tool_start      → { type: "tool_start", tool: "search_pubmed", input: {...} }
tool_progress   → { type: "tool_progress", tool: "...", stage: "...", progress: 0.5 }
tool_complete   → { type: "tool_complete", tool: "...", index: 0 }
complete        → { type: "complete", payload: ChatResponsePayload }
error           → { type: "error", message: "..." }
```

### Complete Response Payload

```typescript
interface ChatResponsePayload {
    message: string;                    // The assistant's text response
    custom_payload?: {                  // Rich structured data
        type: string;
        data: any;
    };
    suggested_values?: Array<{          // Clickable chips
        label: string;
        value: string;
    }>;
    suggested_actions?: Array<{         // Action buttons
        label: string;
        action: string;
        handler: 'client' | 'server';
    }>;
    tool_history?: Array<{              // What tools were called
        tool_name: string;
        input: any;
        output: string;
    }>;
    conversation_id?: number;           // For persistence
}
```

---

## 6. Conversation Persistence

Conversations are saved to the database for continuity across sessions.

### What Gets Saved

- User messages and assistant responses
- Tool calls and their results
- Payloads (for potential replay)
- Timestamps

### Key Service

`ChatService` (in `services/chat.py`) handles conversation CRUD operations.

---

## Key Files Summary

| Category | File | Purpose |
|----------|------|---------|
| **Core Service** | `services/chat_stream_service.py` | Main streaming chat endpoint |
| **Persistence** | `services/chat.py` | Conversation storage |
| **Agent** | `agents/agent_loop.py` | Tool execution loop |
| **Tools** | `tools/registry.py` | Tool registration |
| **Tools** | `tools/builtin/*.py` | Tool implementations |
| **Payloads** | `schemas/payloads.py` | Central payload type registry |
| **Page Config** | `services/chat_page_config/registry.py` | Page registration framework |
| **Page Config** | `services/chat_page_config/<page>.py` | Per-page configs |
| **Frontend** | `lib/chat/payloadRegistry.ts` | Payload handler registry |
| **Frontend** | `lib/chat/payloads.ts` | Payload handler registrations |
| **Frontend** | `components/chat/ChatTray.tsx` | Main chat UI |

---

## Adding Chat Support to a New Page

See [adding-chat-to-page.md](adding-chat-to-page.md) for a step-by-step guide.
