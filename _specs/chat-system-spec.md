# Chat System Specification

## Overview

The chat system provides streaming LLM interactions with tool support. It uses Server-Sent Events (SSE) to stream typed events from backend to frontend, following a discriminated union pattern for type safety.

---

## Architecture

```
┌─────────────┐     SSE Stream      ┌──────────────────┐
│   Frontend  │ ◄────────────────── │  GeneralChatSvc  │
│  ChatTray   │                     │                  │
│  useGeneralChat                   │   agent_loop.py  │
└─────────────┘                     └──────────────────┘
                                            │
                                            ▼
                                    ┌──────────────────┐
                                    │  Anthropic API   │
                                    │  + Tool Execution│
                                    └──────────────────┘
```

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
  "tool": "search_articles",
  "input": {"query": "CRISPR"},
  "tool_use_id": "toolu_abc123"
}
```

### 4. `tool_progress`
Tool execution progress update (for long-running tools).
```json
{
  "type": "tool_progress",
  "tool": "search_articles",
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
  "tool": "search_articles",
  "index": 0
}
```
The `index` corresponds to `[[tool:N]]` markers in the text (see below).

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
    "message": "Let me search for that...\n\n[[tool:0]]\n\nI found 5 relevant articles.",
    "custom_payload": {
      "type": "tool_history",
      "data": [
        {
          "tool_name": "search_articles",
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
4. Tool cards should be collapsible (collapsed by default, showing just tool name)

---

## Response Payload Structure

The `complete` event contains a `ChatResponsePayload`:

```typescript
interface ChatResponsePayload {
  message: string;                    // The LLM's text response (may contain [[tool:N]] markers)
  suggested_values?: SuggestedValue[];
  suggested_actions?: SuggestedAction[];
  custom_payload?: CustomPayload;     // Includes tool_history or page-specific payloads
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
- `handler: "client"` - Execute on frontend (e.g., close modal, navigate)
- `handler: "server"` - Send action back to backend for processing
- `style`: "primary" | "secondary" | "warning"

### Custom Payload
Page-specific structured data for rich UI rendering.
```json
{
  "custom_payload": {
    "type": "tool_history",
    "data": [...]
  }
}
```
Other payload types (registered per-page):
- `schema_proposal` - Database schema suggestions
- `presentation_categories` - Article categorization
- `stream_suggestions` - Research stream recommendations

---

## Agent Loop Pattern

The backend uses an agentic loop for multi-turn tool execution:

```
┌─────────────────────────────────────────────────────┐
│                    Agent Loop                        │
│                                                      │
│  ┌──────────┐    ┌─────────────┐    ┌────────────┐ │
│  │ Call LLM │───►│ Check Tools │───►│  Complete  │ │
│  └──────────┘    └─────────────┘    └────────────┘ │
│       │               │ yes                         │
│       │               ▼                             │
│       │         ┌─────────────┐                     │
│       │         │Process Tools│                     │
│       │         └─────────────┘                     │
│       │               │                             │
│       │               ▼                             │
│       │         ┌─────────────┐                     │
│       └─────────│Update Msgs  │                     │
│                 └─────────────┘                     │
└─────────────────────────────────────────────────────┘
```

### Iteration Flow
1. **Call Model**: Stream text, yield `text_delta` events
2. **Check Tools**: If no tool_use blocks, yield `complete` and exit
3. **Process Tools**: For each tool:
   - Yield `tool_start`
   - Execute tool (yield `tool_progress` if streaming)
   - Yield `tool_complete`
   - Yield `text_delta` with `[[tool:N]]` marker
4. **Update Messages**: Append assistant content + tool results
5. **Loop**: Go back to step 1

### Max Iterations
Default: 5 iterations to prevent runaway loops.

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
    setStatusText(null);
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
4. **Tool Progress**: Amber card with spinner showing tool name
5. **Thinking Indicator**: Gray bubble with "Thinking..." (no streaming text yet)
6. **Final Message**: Left-aligned white bubble with:
   - Markdown-rendered text
   - Inline tool cards (replacing `[[tool:N]]` markers)
   - Suggested values as chips
   - Suggested actions as buttons

### Tool Card (Inline)
```
┌─────────────────────────────────────┐
│ 🔧 search_articles              [▼] │
├─────────────────────────────────────┤
│ Input: {"query": "CRISPR"}          │
│ Output: Found 5 articles...         │
└─────────────────────────────────────┘
```
- Collapsed by default (just header)
- Click to expand and see input/output
- Styled distinctly from message text

---

## File Structure

```
backend/
  schemas/
    general_chat.py          # Domain types + Stream event types
  services/
    agent_loop.py            # Generic agent loop (reusable)
    general_chat_service.py  # Chat service using agent loop
    chat_payloads/           # Page-specific payload configs
  routers/
    general_chat.py          # SSE endpoint

frontend/
  lib/api/
    generalChatApi.ts        # Stream event types + API client
  hooks/
    useGeneralChat.ts        # Chat state management
  components/chat/
    ChatTray.tsx             # Main chat UI
    ToolCallCard.tsx         # Inline tool call renderer (TODO)
  types/
    chat.ts                  # Domain types (Message, Action, etc.)
```

---

## TODO

1. **Backend**: Emit `[[tool:N]]` markers on tool_complete
2. **Backend**: Include `tool_history` in custom_payload
3. **Frontend**: Create `ToolCallCard` component
4. **Frontend**: Parse and replace `[[tool:N]]` markers in message text
5. **Frontend**: Handle `tool_history` payload type
