# Chat System Migration Plan

## Overview

This document outlines the migration from the current **page-aware chat_payloads** system to a **global tool registry** with proper streaming support and tool display in ChatTray.

---

## Features

### Backend: Streaming Protocol
- SSE stream with discriminated union events (`type` field)
- `status` - "Thinking..." indicators
- `text_delta` - Streaming text tokens
- `tool_start`, `tool_progress`, `tool_complete` - Tool lifecycle events
- `complete` - Final payload with message, custom_payload, tool_history
- `error` - Error handling
- `cancelled` - Cancellation acknowledgment

### Backend: Tool System
- Global tool registry (`backend/tools/`) replacing per-page `chat_payloads/`
- `ToolConfig` with name, description, input_schema, executor
- `ToolResult` with text (for LLM) and payload (structured data)
- `ToolProgress` for streaming updates (stage, message, progress %)
- Generator-based executors that yield `ToolProgress` before returning `ToolResult`

### Backend: Agent Loop
- Multi-turn tool execution (call model → tools → call model → ...)
- Max iterations limit
- Cancellation token support
- Tool result aggregation into `tool_history`

### Frontend: Chat Basics
- Message display (user and assistant messages)
- Streaming text display with typing indicator
- Chat input with send button
- Cancel button during streaming
- Conversation history sent with each request
- Context object passed to backend

### Frontend: Tool Progress
- Show progress card during tool execution
- Display stage name, message, progress percentage
- Update in real-time as `tool_progress` events arrive

### Frontend: Inline Tool Calls
- During streaming: Show active tool indicator with progress
- After complete: Parse `[[tool:N]]` markers in message text, replace with compact tool cards
- Tool cards show tool name and brief summary

### Frontend: Tool Interaction
- Click individual tool card → expand to see full input/output details
- Click "View all tools" → show all tool calls from the message together

### Frontend: Custom Payloads
- Global `payloadRegistry.ts` mapping payload types to components
- Render payload panel when `custom_payload.type` matches registry
- Existing components (PubMedArticleCard, SchemaProposalCard, etc.) reused

### Frontend: Suggested Values/Actions
- Render suggested values as clickable chips
- Render suggested actions as buttons
- Handle accept/reject callbacks

---

## Out of Scope (for now)

- MainPage 4-panel layout
- WorkspacePanel and view registries
- Conversation persistence
- ContextPanel

---

## Current State

### Backend

- Tools registered per-page in `backend/services/chat_payloads/`
- `ToolConfig` with basic `executor` returning `str | ToolResult`
- No streaming progress from tools

### Frontend

- `payloadHandlers` prop passed inline to ChatTray per page
- No dedicated ChatPanel component - rendering mixed into ChatTray
- Tool progress shown but not inline tool results
- No `[[tool:N]]` marker parsing

---

## Target State

### Backend

```python
# backend/tools/registry.py
@dataclass
class ToolProgress:
    stage: str
    message: str
    progress: float  # 0.0 to 1.0
    data: Optional[Dict] = None

@dataclass
class ToolResult:
    text: str                           # For LLM
    payload: Optional[Dict] = None      # Structured data
    workspace_payload: Optional[Dict] = None  # For future workspace display

@dataclass
class ToolConfig:
    name: str
    description: str
    input_schema: Dict
    executor: Callable  # Returns Generator[ToolProgress, None, ToolResult] | ToolResult | str
    streaming: bool = False
```

### Frontend

- **ChatPanel component** (within ChatTray) handles:
  - Message display (user and assistant)
  - Streaming text with typing indicator
  - Chat input with send/cancel buttons
  - **Tool progress**: Cards showing stage/message/progress % during execution
  - **Inline tool cards**: `[[tool:N]]` markers parsed and replaced with clickable cards
  - **Tool call list**: All tool calls visible in chat, clickable to expand details
  - **View all tools**: Button/link to see all tool calls together
  - **Suggested values**: Clickable chips for quick input
  - **Suggested actions**: Action buttons with callbacks
  - Payload rendering from tool results
- ChatTray orchestrates ChatPanel and provides context
- **Global payload registry** (`payloadRegistry.ts`):
  - Maps payload types to components: `{ 'pubmed_article': PubMedArticleCard, ... }`
  - Replaces per-page `payloadHandlers` prop
  - Existing payload components (PubMedArticleCard, SchemaProposalCard, etc.) reused

---

## Migration Steps

### Phase 1: Backend Tool Infrastructure

1. **Create `backend/tools/registry.py`**
   - `ToolProgress`, `ToolResult`, `ToolConfig` dataclasses
   - Global `_tool_registry` dict
   - `register_tool()`, `get_tool()`, `get_all_tools()` functions

2. **Create `backend/tools/executor.py`**
   - `execute_tool()` - handles both streaming and non-streaming
   - Runs generator tools, yields `ToolProgress`, returns `ToolResult`

3. **Create `backend/tools/builtin/`**
   - `__init__.py` - auto-imports to register tools
   - Migrate `search_pubmed`, `get_pubmed_article`, `get_full_text` from `chat_payloads/reports.py`

### Phase 2: Agent Loop Updates

1. **Update `backend/services/agent_loop.py`**
   - Import from `tools.registry` instead of `chat_payloads`
   - In `_process_tools()`, handle generator executors
   - Yield `AgentToolProgress` events during tool execution

2. **Update `backend/services/general_chat_service.py`**
   - Use global tool registry: `get_all_tools()` instead of `get_page_tools()`
   - Remove page-aware tool lookup

### Phase 3: Frontend ChatPanel

1. **Create ChatPanel component**
   - Extract message rendering from ChatTray into ChatPanel
   - Handle message display, streaming text, input
   - ChatTray wraps ChatPanel and provides context/handlers

2. **Tool progress display**
   - Show progress cards during tool execution
   - Display stage, message, progress percentage
   - Update in real-time as `tool_progress` events arrive

3. **Add `[[tool:N]]` marker parsing**
   - Parse markers in assistant message text
   - Replace with inline ToolResultCard using `tool_history[N]`

4. **Create ToolResultCard component**
   - Shows tool name, input summary, output/result
   - Clickable to expand full details
   - Compact inline view vs expanded view

5. **Tool call list and navigation**
   - Show all tool calls in chat message
   - Click individual tool → show details
   - "View all tools" option → show all tool calls together

6. **Add payload rendering via global registry**
   - Create `payloadRegistry.ts` mapping payload types to components
   - Same pattern as current `payloadHandlers`, but global instead of per-page
   - Example: `{ 'pubmed_article': PubMedArticleCard, 'schema_proposal': SchemaProposalCard }`
   - ChatPanel looks up component by `custom_payload.type` and renders it
   - Existing payload components (PubMedArticleCard, etc.) migrate unchanged

7. **Suggested values and actions**
   - Render suggested values as clickable chips below message
   - Render suggested actions as buttons
   - Wire up accept/reject callbacks

8. **Ensure tool_history in custom_payload**
   - Backend already collects this in `CompleteEvent`
   - Frontend uses it for `[[tool:N]]` replacement and tool list

### Phase 4: Cleanup

1. **Remove old system**
   - Delete `backend/services/chat_payloads/`
   - Remove `payloadHandlers` prop from page components
   - Remove per-page tool imports

---

## Key Files

### New Files

| File | Purpose |
|------|---------|
| `backend/tools/__init__.py` | Package init |
| `backend/tools/registry.py` | ToolConfig, ToolResult, ToolProgress, registry |
| `backend/tools/executor.py` | Streaming tool execution |
| `backend/tools/builtin/__init__.py` | Auto-register tools |
| `backend/tools/builtin/pubmed.py` | Migrated PubMed tools |
| `frontend/src/components/chat/ChatPanel.tsx` | Message display, streaming, payloads |
| `frontend/src/components/chat/ToolResultCard.tsx` | Inline tool display |
| `frontend/src/lib/chat/payloadRegistry.ts` | Global payload type → component mapping |

### Modified Files

| File | Changes |
|------|---------|
| `backend/services/agent_loop.py` | Support generator tools, yield ToolProgress |
| `backend/services/general_chat_service.py` | Use global registry |
| `frontend/src/components/chat/ChatTray.tsx` | Use ChatPanel, remove inline rendering |
| `frontend/src/hooks/useGeneralChat.ts` | Ensure tool_history available |

### Deleted Files

| File | Reason |
|------|--------|
| `backend/services/chat_payloads/registry.py` | Replaced by tools/registry.py |
| `backend/services/chat_payloads/reports.py` | Tools migrated to tools/builtin/ |
| `backend/services/chat_payloads/edit_stream.py` | No longer needed |
| `backend/services/chat_payloads/streams_list.py` | No longer needed |
| `backend/services/chat_payloads/new_stream.py` | No longer needed |
| `backend/services/chat_payloads/__init__.py` | Directory removed |

---

## Decisions Needed

1. **Context builders** - The current system has per-page context builders for system prompts. Keep them or move context entirely to frontend-provided `context` object?

2. **PayloadConfig parsing** - Current system parses `SCHEMA_PROPOSAL:` markers from LLM output. Drop this capability? (New system relies on tools returning structured data instead)

3. **ClientAction system** - LLM can suggest client-side actions. Keep or drop?

---

## Notes

- Both systems can coexist during migration (tools can be registered in both places temporarily)
- No database changes required
- No breaking API changes - response format stays the same
