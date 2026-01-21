# Chat System Flow

This document describes how the chat help system works end-to-end, covering message flow, tool execution, and the agent loop.

---

## Flow 1: User Sends a Message

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ChatTray (or chat UI component)                                             │
│      │                                                                       │
│      ▼                                                                       │
│  useChatContext().sendMessage(content)               (ChatContext.tsx:55)    │
│      │                                                                       │
│      ├── Add user message to local state                                     │
│      ├── Set isLoading = true                                                │
│      │                                                                       │
│      ▼                                                                       │
│  chatApi.streamMessage(request, signal)              (chatApi.ts:79)         │
│      │                                                                       │
│      ├── request: { message, context, interaction_type, conversation_id }   │
│      │                                                                       │
│      ▼                                                                       │
│  makeStreamRequest('/api/chat/stream', ...)          (streamUtils.ts)        │
│      │                                                                       │
│      └── POST /api/chat/stream ──────────────────────────────────────────┼───┐
│                                                                              │   │
└─────────────────────────────────────────────────────────────────────────────┘   │
                                                                                   │
┌─────────────────────────────────────────────────────────────────────────────┐   │
│                              BACKEND                                         │   │
├─────────────────────────────────────────────────────────────────────────────┤   │
│                                                                              │   │
│  POST /api/chat/stream  ◄────────────────────────────────────────────────────┼───┘
│      │                                              (routers/chat_stream.py:48)
│      ▼
│  chat_stream(request, service_factory, current_user)
│      │
│      ├── Authenticate via get_current_user dependency
│      │
│      ▼
│  service = service_factory(user_id)                 Creates ChatStreamService
│      │
│      ▼
│  EventSourceResponse(event_generator())             SSE streaming response
│      │
│      ▼
│  service.stream_chat_message(request)               (chat_stream_service.py:78)
│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 2: Backend Processing (Agent Loop)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ChatStreamService.stream_chat_message()            (chat_stream_service.py)│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. SETUP PERSISTENCE                                                        │
│      │                                                                       │
│      ├── _setup_chat(request) ──► Get/create conversation (:334)            │
│      └── Save user message to database                                       │
│                                                                              │
│  2. BUILD CONTEXT                                                            │
│      │                                                                       │
│      ├── _build_system_prompt(context, chat_id) (:431)                      │
│      │       ├── Get identity (page-specific or default)                    │
│      │       ├── Build page context (loaded data)                            │
│      │       ├── Build payload manifest (prior payloads in conversation)    │
│      │       ├── Build capabilities (tools + payloads + actions)            │
│      │       └── Add guidelines                                              │
│      │                                                                       │
│      ├── _build_messages(request, chat_id) (:392)                           │
│      │       └── Load conversation history from database                     │
│      │                                                                       │
│      └── get_tools_for_page_dict(page, tab, subtab)  (tools/registry.py)    │
│              └── Global tools + page tools + tab tools + subtab tools        │
│                                                                              │
│  3. RUN AGENT LOOP                                                           │
│      │                                                                       │
│      ▼                                                                       │
│  run_agent_loop(client, model, messages, tools, ...)                        │
│      │                                              (agents/agent_loop.py:151)
│      │                                                                       │
│      │  ┌─── ITERATION LOOP ─────────────────────────────────────────────┐  │
│      │  │                                                                 │  │
│      │  │  1. Call Claude API (streaming or non-streaming)               │  │
│      │  │      └── Yields: AgentTextDelta (text tokens)                  │  │
│      │  │                                                                 │  │
│      │  │  2. Check for tool_use blocks in response                      │  │
│      │  │      └── If none: emit AgentComplete, return                   │  │
│      │  │                                                                 │  │
│      │  │  3. Execute each tool                                          │  │
│      │  │      ├── Yields: AgentToolStart                                │  │
│      │  │      ├── Yields: AgentToolProgress (for streaming tools)       │  │
│      │  │      └── Yields: AgentToolComplete                             │  │
│      │  │                                                                 │  │
│      │  │  4. Append tool results to message history                     │  │
│      │  │      └── Loop back to step 1 (up to MAX_ITERATIONS=5)         │  │
│      │  │                                                                 │  │
│      │  └────────────────────────────────────────────────────────────────┘  │
│      │                                                                       │
│      └── Final: AgentComplete with text + tool_calls + payloads             │
│                                                                              │
│  4. FINALIZE RESPONSE                                                        │
│      │                                                                       │
│      ├── _parse_llm_response(text, context) (:779)                          │
│      │       ├── Extract SUGGESTED_VALUES: [...]                            │
│      │       ├── Extract SUGGESTED_ACTIONS: [...]                           │
│      │       └── Parse custom payloads (SCHEMA_PROPOSAL:, etc.)             │
│      │                                                                       │
│      ├── _process_payloads(all_payloads) (:248)                             │
│      │       └── Assign IDs and summaries to each payload                   │
│      │                                                                       │
│      ├── Save assistant message to database                                  │
│      │                                                                       │
│      └── Yield CompleteEvent with final payload                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 3: SSE Events Back to Frontend

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND → FRONTEND (Server-Sent Events)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Event types streamed to frontend:                                           │
│                                                                              │
│  ┌──────────────────┬───────────────────────────────────────────────────┐   │
│  │ Event Type       │ Description                                        │   │
│  ├──────────────────┼───────────────────────────────────────────────────┤   │
│  │ status           │ "Thinking...", "Running search_pubmed..."          │   │
│  │ text_delta       │ Streaming text token                               │   │
│  │ tool_start       │ Tool execution begins (tool name, input)           │   │
│  │ tool_progress    │ Progress update (stage, message, progress %)       │   │
│  │ tool_complete    │ Tool finished (tool name, index)                   │   │
│  │ complete         │ Final response payload                             │   │
│  │ error            │ Error occurred                                     │   │
│  │ cancelled        │ Request was cancelled                              │   │
│  └──────────────────┴───────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND - ChatContext Event Handling                   (ChatContext.tsx)   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  for await (const event of chatApi.streamMessage(...)) {                    │
│      switch (event.type) {                                                   │
│          case 'text_delta':                                                  │
│              setStreamingText(prev => prev + event.text)   (:87-91)         │
│              break                                                           │
│                                                                              │
│          case 'status':                                                      │
│              setStatusText(event.message)                  (:93-95)         │
│              break                                                           │
│                                                                              │
│          case 'tool_start':                                                  │
│              setStatusText(`Running ${event.tool}...`)     (:97-99)         │
│              setActiveToolProgress({ toolName, updates: [] })               │
│              break                                                           │
│                                                                              │
│          case 'tool_progress':                                               │
│              setActiveToolProgress(prev => ...)            (:102-109)       │
│              break                                                           │
│                                                                              │
│          case 'complete':                                                    │
│              const assistantMessage = {                                      │
│                  role: 'assistant',                                          │
│                  content: payload.message,                                   │
│                  suggested_values,                                           │
│                  suggested_actions,                                          │
│                  custom_payload,                                             │
│                  tool_history                               (:116-136)      │
│              }                                                               │
│              setMessages(prev => [...prev, assistantMessage])               │
│              setChatId(payload.conversation_id)                              │
│              break                                                           │
│      }                                                                       │
│  }                                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Tool Resolution

Tools are resolved based on page, tab, and subtab context:

```
get_tools_for_page_dict(page, tab, subtab)                (tools/registry.py:149)
    │
    ├── 1. Start with GLOBAL tools (is_global=True)
    │       └── e.g., search_pubmed, web_search, fetch_webpage
    │
    ├── 2. Add PAGE-specific tools
    │       └── From page config's tool_names list
    │
    ├── 3. Add TAB-specific tools
    │       └── From tab config's tool_names list
    │
    └── 4. Add SUBTAB-specific tools
            └── From subtab config's tool_names list
```

### Payload Types

Payloads are structured data returned by tools or parsed from LLM output:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PayloadType                                         (schemas/payloads.py)   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  source="tool" (from tool execution):                                        │
│      pubmed_search_results, pubmed_article, web_search_results, etc.        │
│                                                                              │
│  source="llm" (parsed from LLM text):                                        │
│      schema_proposal, query_suggestion, ai_column_suggestion, etc.          │
│      - Has parse_marker: "SCHEMA_PROPOSAL:"                                 │
│      - Has parser: extracts JSON from LLM output                            │
│      - Has llm_instructions: tells LLM when/how to use                      │
│                                                                              │
│  is_global=True: Available on all pages                                      │
│  is_global=False: Must be declared in page/tab config                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### System Prompt Structure

The system prompt is built in sections:

```
1. IDENTITY       - Who the assistant is (page-specific or default)
2. CONTEXT        - Current page state and loaded data
3. PAYLOAD MANIFEST - Available payloads from conversation history
4. CAPABILITIES   - Tools, payloads (LLM can generate), client actions
5. CUSTOM INSTRUCTIONS - Stream-specific instructions (optional)
6. GUIDELINES     - Response formatting guidance
```

### Agent Loop Events

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Agent Loop Event Types                            (agents/agent_loop.py) │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  AgentThinking     - Starting/processing status (:36)                     │
│  AgentTextDelta    - Streaming text token (:42)                           │
│  AgentMessage      - Complete text (non-streaming) (:48)                  │
│  AgentToolStart    - Tool execution begins (:55)                          │
│  AgentToolProgress - Streaming tool progress (:63)                        │
│  AgentToolComplete - Tool execution finished (:73)                        │
│  AgentComplete     - Loop finished successfully (:81)                     │
│  AgentCancelled    - Loop was cancelled (:89)                             │
│  AgentError        - Error occurred (:97)                                 │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| Layer | File | Responsibility |
|-------|------|----------------|
| Frontend State | `context/ChatContext.tsx` | React chat state, sendMessage, event handling |
| Frontend API | `lib/api/chatApi.ts` | SSE streaming, request formatting |
| Frontend UI | `components/chat/ChatTray.tsx` | Chat UI component |
| Backend Endpoint | `routers/chat_stream.py` | POST /api/chat/stream endpoint |
| Backend Service | `services/chat_stream_service.py` | Orchestrates chat flow, builds prompts |
| Agent Loop | `agents/agent_loop.py` | Generic agentic loop with tool support |
| Tool Registry | `tools/registry.py` | Tool registration and resolution |
| Payload Types | `schemas/payloads.py` | Payload type definitions and parsers |
| Chat Persistence | `services/chat_service.py` | Chat/message CRUD operations |

---

## Chat Request Structure

```json
{
  "message": "User's message text",
  "context": {
    "current_page": "reports",
    "active_tab": "articles",
    "stream_id": 123,
    "report_id": 456,
    "current_article": { ... }
  },
  "interaction_type": "text_input",
  "conversation_id": 789
}
```

---

## Complete Response Payload

```json
{
  "message": "Cleaned message text (markers removed)",
  "suggested_values": [
    { "label": "Display", "value": "text to send" }
  ],
  "suggested_actions": [
    { "label": "Button", "action": "action_name", "handler": "client" }
  ],
  "custom_payload": {
    "payload_id": "abc12345",
    "type": "query_suggestion",
    "data": { ... },
    "summary": "Query suggestion: CRISPR..."
  },
  "tool_history": [
    { "tool_name": "search_pubmed", "input": {...}, "output": "..." }
  ],
  "conversation_id": 789,
  "diagnostics": {
    "model": "claude-sonnet-4-20250514",
    "system_prompt": "...",
    "tools": ["search_pubmed", "web_search"]
  }
}
```

---

## Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tool Execution                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. LLM returns tool_use block:                                              │
│     { "type": "tool_use", "name": "search_pubmed", "input": {...} }         │
│                                                                              │
│  2. Agent loop looks up tool in tools dict:                                  │
│     tool_config = tools.get("search_pubmed")                                │
│                                                                              │
│  3. Execute tool (async, in thread pool):                                    │
│     result = tool_config.executor(input, db, user_id, context)              │
│                                                                              │
│  4. Result types:                                                            │
│     ├── str: Plain text result for LLM                                      │
│     ├── ToolResult: { text, payload }                                       │
│     │       └── payload goes to frontend, text goes to LLM                  │
│     └── Generator[ToolProgress, None, ToolResult]: Streaming tool           │
│             └── Yields progress updates, returns final result               │
│                                                                              │
│  5. Tool result appended to messages:                                        │
│     { "role": "user", "content": [                                          │
│         { "type": "tool_result", "tool_use_id": "...", "content": "..." }  │
│     ]}                                                                       │
│                                                                              │
│  6. Loop continues until LLM responds without tool_use                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Adding Chat to a New Page

1. **Define page config** with identity, context builder, tools, payloads
2. **Register tools** in `tools/registry.py` (or use globals)
3. **Register payloads** in `schemas/payloads.py` (if custom responses needed)
4. **Add ChatTray** to the page component
5. **Pass context** to ChatContext via `updateContext()`

See `_specs/chat/adding-chat-to-page.md` for detailed guide.

---

## Diagnostics

Every response includes diagnostics for debugging:

```json
{
  "diagnostics": {
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 2000,
    "max_iterations": 5,
    "temperature": 0.0,
    "tools": ["search_pubmed", "web_search"],
    "system_prompt": "Full system prompt...",
    "messages": [
      { "role": "user", "content": "..." },
      { "role": "assistant", "content": "..." }
    ],
    "context": { "current_page": "...", ... },
    "raw_llm_response": "Full LLM response before parsing..."
  }
}
```

Access via UI: Click diagnostics button in chat to view full system prompt, tools, and conversation history.
