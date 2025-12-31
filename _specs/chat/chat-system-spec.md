# Chat System Specification

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Streaming Protocol](#3-streaming-protocol)
4. [Backend: Tool System](#4-backend-tool-system)
5. [Backend: Agent Loop](#5-backend-agent-loop)
6. [Frontend: ChatTray](#6-frontend-chattray)
7. [Frontend: Tool Display](#7-frontend-tool-display)
8. [Frontend: Payload Handlers](#8-frontend-payload-handlers)
9. [Response Payloads](#9-response-payloads)
10. [File Structure](#10-file-structure)

---

## 1. Overview

The chat system provides streaming LLM interactions with tool support. It can be embedded in any page via the **ChatTray** component, which contains a **ChatPanel** for all chat functionality.

### Key Features

**Backend**
- SSE streaming with discriminated union events
- Global tool registry (tools available regardless of page)
- Generator-based streaming tools with progress updates
- Multi-turn agent loop (call model → tools → repeat)

**Frontend**
- Message display with streaming text
- Tool progress display during execution
- Inline tool cards via `[[tool:N]]` markers
- Clickable tools to view details
- Custom payload rendering via global registry
- Suggested values/actions

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                  ANY PAGE                                     │
│                                                                               │
│   ┌───────────────────────────────────────────────────────────────────────┐  │
│   │                              ChatTray                                  │  │
│   │                                                                        │  │
│   │  ┌─────────────────────────┐   ┌────────────────────────────────────┐ │  │
│   │  │     Message Area        │   │      Floating Payload Panel        │ │  │
│   │  │                         │   │      (spawns when payload          │ │  │
│   │  │  - Messages             │   │       received)                    │ │  │
│   │  │  - Streaming text       │   │                                    │ │  │
│   │  │  - Tool progress        │   │  Renders via payloadHandler        │ │  │
│   │  │  - Inline tool cards    │   │  with onAccept/onReject callbacks  │ │  │
│   │  │  - Suggested values     │   │  that can update page state        │ │  │
│   │  │  - Suggested actions    │   │                                    │ │  │
│   │  ├─────────────────────────┤   └────────────────────────────────────┘ │  │
│   │  │     Input Area          │                                          │  │
│   │  │  - Text input           │                                          │  │
│   │  │  - Send/Cancel buttons  │                                          │  │
│   │  └─────────────────────────┘                                          │  │
│   └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│   Page can pass payloadHandlers with callbacks that update page state        │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ SSE Stream
                                      │
┌──────────────────────────────────────────────────────────────────────────────┐
│                                   BACKEND                                     │
│                                                                               │
│  ┌────────────────┐   ┌─────────────┐   ┌────────────────┐                   │
│  │ GeneralChatSvc │──►│ Agent Loop  │──►│ Tool Registry  │                   │
│  │                │   │             │   │                │                   │
│  │ Maps events    │   │ Call Model  │   │ Global tools   │                   │
│  │ to SSE format  │   │ → Tools     │   │ ToolProgress   │                   │
│  │                │   │ → Repeat    │   │ ToolResult     │                   │
│  └────────────────┘   └─────────────┘   └────────────────┘                   │
│                              │                                                │
│                              ▼                                                │
│                       ┌─────────────┐                                        │
│                       │ Anthropic   │                                        │
│                       │    API      │                                        │
│                       └─────────────┘                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **ChatTray** | Complete chat UI: messages, input, and spawnable payload panel |
| **useGeneralChat** | Hook for chat state management and SSE handling |
| **payloadHandlers** | Per-page handlers with render + callbacks (onAccept/onReject) that can update page state |
| **GeneralChatService** | Backend service, runs agent loop, streams SSE events |
| **Agent Loop** | Multi-turn tool execution |
| **Tool Registry** | Global tool definitions |

---

## 3. Streaming Protocol

### SSE Format

Events are sent as Server-Sent Events with JSON payloads. Each event has a `type` field for discrimination:

```
data: {"type": "status", "message": "Thinking..."}

data: {"type": "text_delta", "text": "Hello"}

data: {"type": "tool_start", "tool": "search_pubmed", "input": {...}, "tool_use_id": "toolu_123"}

data: {"type": "tool_progress", "tool": "search_pubmed", "stage": "searching", "message": "Found 15 results", "progress": 0.5}

data: {"type": "tool_complete", "tool": "search_pubmed", "index": 0}

data: {"type": "complete", "payload": {...}}
```

### Event Types

| Event | Description | Key Fields |
|-------|-------------|------------|
| `status` | Status indicator | `message` |
| `text_delta` | Streaming text token | `text` |
| `tool_start` | Tool execution begins | `tool`, `input`, `tool_use_id` |
| `tool_progress` | Tool progress update | `tool`, `stage`, `message`, `progress`, `data` |
| `tool_complete` | Tool execution finished | `tool`, `index` |
| `complete` | Final response | `payload` (ChatResponsePayload) |
| `error` | Error occurred | `message` |
| `cancelled` | Request cancelled | (none) |

### Event Flow

```
User sends message
        │
        ▼
┌───────────────┐
│    status     │  "Thinking..."
└───────────────┘
        │
        ▼
┌───────────────┐
│  text_delta   │  Streaming tokens...
│  text_delta   │
└───────────────┘
        │
        ▼ (if tool requested)
┌───────────────┐
│  tool_start   │  Tool begins
│ tool_progress │  Progress updates...
│ tool_complete │  Tool done
└───────────────┘
        │
        ▼ (agent may call more tools or generate more text)
┌───────────────┐
│  text_delta   │  More streaming...
└───────────────┘
        │
        ▼
┌───────────────┐
│   complete    │  Final payload with tool_history
└───────────────┘
```

---

## 4. Backend: Tool System

Tools are globally registered and available regardless of which page the chat is on.

### Tool Configuration

Location: `backend/tools/registry.py`

```python
@dataclass
class ToolProgress:
    """Progress update from a streaming tool."""
    stage: str                      # Current stage name
    message: str                    # Human-readable status
    progress: float                 # 0.0 to 1.0
    data: Optional[Dict] = None     # Structured data for UI

@dataclass
class ToolResult:
    """Result from tool execution."""
    text: str                       # Text result for LLM
    payload: Optional[Dict] = None  # Structured data for custom_payload

@dataclass
class ToolConfig:
    """Configuration for a tool."""
    name: str                       # Tool name
    description: str                # Description for LLM
    input_schema: Dict              # JSON schema for parameters
    executor: Callable              # Function that executes the tool
    streaming: bool = False         # If True, executor yields ToolProgress
```

### Tool Registry

```python
# Global registry
_tool_registry: Dict[str, ToolConfig] = {}

def register_tool(tool: ToolConfig):
    """Register a tool globally."""
    _tool_registry[tool.name] = tool

def get_tool(name: str) -> Optional[ToolConfig]:
    """Get a tool by name."""
    return _tool_registry.get(name)

def get_all_tools() -> List[ToolConfig]:
    """Get all registered tools."""
    return list(_tool_registry.values())
```

### Streaming Tools

Streaming tools yield `ToolProgress` before returning `ToolResult`:

```python
def execute_search_pubmed(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Generator[ToolProgress, None, ToolResult]:
    """Search PubMed with progress updates."""

    yield ToolProgress(
        stage="searching",
        message="Searching PubMed...",
        progress=0.2
    )

    results = pubmed_api.search(params["query"])

    yield ToolProgress(
        stage="processing",
        message=f"Found {len(results)} articles",
        progress=0.8
    )

    return ToolResult(
        text=f"Found {len(results)} articles matching '{params['query']}'",
        payload={
            "type": "pubmed_results",
            "data": results
        }
    )
```

### Non-Streaming Tools

Non-streaming tools return `ToolResult` directly (or just a string):

```python
def execute_get_article(params: Dict, db: Session, user_id: int, context: Dict) -> ToolResult:
    """Get a single article by PMID."""
    article = pubmed_api.get_article(params["pmid"])
    return ToolResult(
        text=f"Retrieved article: {article['title']}",
        payload={
            "type": "pubmed_article",
            "data": article
        }
    )
```

---

## 5. Backend: Agent Loop

The agent loop handles multi-turn tool execution.

Location: `backend/services/agent_loop.py`

### Event Types

```python
@dataclass
class AgentThinking(AgentEvent):
    message: str

@dataclass
class AgentTextDelta(AgentEvent):
    text: str

@dataclass
class AgentToolStart(AgentEvent):
    tool_name: str
    tool_input: Dict
    tool_use_id: str

@dataclass
class AgentToolProgress(AgentEvent):
    tool_name: str
    stage: str
    message: str
    progress: float
    data: Optional[Any] = None

@dataclass
class AgentToolComplete(AgentEvent):
    tool_name: str
    result_text: str
    result_data: Any

@dataclass
class AgentComplete(AgentEvent):
    text: str
    tool_calls: List[Dict]

@dataclass
class AgentError(AgentEvent):
    error: str
```

### Agent Loop Function

```python
async def run_agent_loop(
    client: AsyncAnthropic,
    model: str,
    max_tokens: int,
    max_iterations: int,
    system_prompt: str,
    messages: List[Dict],
    tools: Dict[str, ToolConfig],
    db: Session,
    user_id: int,
    context: Dict,
    cancellation_token: CancellationToken,
    stream_text: bool = True
) -> AsyncGenerator[AgentEvent, None]:
    """
    Run agent loop with tool execution.

    Loop:
    1. Call model
    2. If tool_use blocks, execute tools
    3. Add tool results to messages
    4. Repeat until no more tool calls or max iterations
    """
```

### GeneralChatService Integration

```python
class GeneralChatService:
    async def stream_chat_message(self, request, cancellation_token) -> AsyncGenerator[str, None]:
        # Build system prompt and messages
        # Get tools from global registry
        tools = {t.name: t for t in get_all_tools()}

        # Run agent loop and map events to SSE
        async for event in run_agent_loop(...):
            if isinstance(event, AgentTextDelta):
                yield TextDeltaEvent(text=event.text).model_dump_json()
            elif isinstance(event, AgentToolStart):
                yield ToolStartEvent(tool=event.tool_name, ...).model_dump_json()
            elif isinstance(event, AgentToolProgress):
                yield ToolProgressEvent(...).model_dump_json()
            # ... etc

        # Yield final complete event with tool_history
        yield CompleteEvent(payload=ChatResponsePayload(
            message=collected_text,
            custom_payload={"type": "tool_history", "data": tool_call_history}
        )).model_dump_json()
```

---

## 6. Frontend: ChatTray

ChatTray is a complete chat component that includes the message area, input, and a spawnable payload panel. It can be embedded in any page.

### ChatTray Props

```typescript
interface ChatTrayProps {
    initialContext?: Record<string, any>;
    payloadHandlers?: Record<string, PayloadHandler>;  // Handlers with render + callbacks
    hidden?: boolean;
    embedded?: boolean;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}
```

### ChatTray Structure

```typescript
function ChatTray({ initialContext, payloadHandlers, ... }: ChatTrayProps) {
    const chat = useGeneralChat({ initialContext });
    const [activePayload, setActivePayload] = useState<{ type: string; data: any } | null>(null);

    // Detect new payloads and show in floating panel
    useEffect(() => {
        const latestMessage = messages[messages.length - 1];
        if (latestMessage?.custom_payload?.type) {
            if (payloadHandlers?.[latestMessage.custom_payload.type]) {
                setActivePayload({
                    type: latestMessage.custom_payload.type,
                    data: latestMessage.custom_payload.data
                });
            }
        }
    }, [messages, payloadHandlers]);

    return (
        <>
            {/* Main Chat Panel */}
            <div className="chat-tray">
                {/* Message Area */}
                <div className="messages">
                    {messages.map(msg => <MessageBubble message={msg} />)}
                    {streamingText && <StreamingMessage text={streamingText} />}
                    {activeToolProgress && <ToolProgressCard progress={activeToolProgress} />}
                    {statusText && <StatusIndicator text={statusText} />}
                </div>

                {/* Input Area */}
                <ChatInput onSend={sendMessage} onCancel={cancelRequest} isLoading={isLoading} />
            </div>

            {/* Floating Payload Panel - spawns adjacent to chat */}
            {activePayload && (
                <PayloadPanel
                    payload={activePayload}
                    handler={payloadHandlers[activePayload.type]}
                    onClose={() => setActivePayload(null)}
                />
            )}
        </>
    );
}
```

### Floating Payload Panel

When a payload is received and a handler exists, a panel spawns next to the chat:

```typescript
function PayloadPanel({ payload, handler, onClose }) {
    return (
        <div className="fixed top-0 left-96 h-full bg-white shadow-2xl">
            <div className="header">
                <h3>{handler.renderOptions?.headerTitle}</h3>
                <button onClick={onClose}>×</button>
            </div>

            <div className="content">
                {handler.render(payload.data, {
                    onAccept: (data) => {
                        handler.onAccept?.(data);  // Callback can update page state
                        onClose();
                    },
                    onReject: () => {
                        handler.onReject?.(payload.data);  // Callback can update page state
                        onClose();
                    }
                })}
            </div>
        </div>
    );
}
```

### useGeneralChat Hook

```typescript
interface UseGeneralChatReturn {
    // State
    messages: GeneralChatMessage[];
    streamingText: string;
    statusText: string | null;
    activeToolProgress: ActiveToolProgress | null;
    isLoading: boolean;
    error: string | null;

    // Actions
    sendMessage: (content: string) => void;
    cancelRequest: () => void;
    updateContext: (updates: Record<string, any>) => void;
    reset: () => void;
}

interface ActiveToolProgress {
    toolName: string;
    updates: ToolProgressEvent[];
}
```

### Event Handling

```typescript
for await (const event of generalChatApi.streamMessage(request, signal)) {
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
            setActiveToolProgress({ toolName: event.tool, updates: [] });
            break;

        case 'tool_progress':
            setActiveToolProgress(prev => ({
                ...prev!,
                updates: [...prev!.updates, event]
            }));
            break;

        case 'tool_complete':
            setActiveToolProgress(null);
            break;

        case 'complete':
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: event.payload.message,
                custom_payload: event.payload.custom_payload,
                suggested_values: event.payload.suggested_values,
                suggested_actions: event.payload.suggested_actions
            }]);
            setStreamingText('');
            break;

        case 'error':
            setError(event.message);
            break;
    }
}
```

---

## 7. Frontend: Tool Display

### During Streaming: Tool Progress Card

While a tool is executing, show a progress card:

```typescript
function ToolProgressCard({ progress }: { progress: ActiveToolProgress }) {
    const latestUpdate = progress.updates[progress.updates.length - 1];

    return (
        <div className="tool-progress-card">
            <div className="tool-name">{progress.toolName}</div>
            {latestUpdate && (
                <>
                    <div className="stage">{latestUpdate.stage}</div>
                    <div className="message">{latestUpdate.message}</div>
                    <ProgressBar value={latestUpdate.progress} />
                </>
            )}
        </div>
    );
}
```

### After Complete: Inline Tool Cards

After the response is complete, parse `[[tool:N]]` markers and replace with inline cards:

```typescript
function MessageBubble({ message, toolHistory }: Props) {
    // Parse [[tool:N]] markers
    const parts = parseToolMarkers(message.content);

    return (
        <div className="message">
            {parts.map(part => {
                if (part.type === 'text') {
                    return <span>{part.text}</span>;
                } else {
                    // part.type === 'tool', part.index is N
                    const tool = toolHistory?.[part.index];
                    return <InlineToolCard tool={tool} />;
                }
            })}
        </div>
    );
}

function parseToolMarkers(text: string): Part[] {
    // Split on [[tool:N]] pattern
    const regex = /\[\[tool:(\d+)\]\]/g;
    // ... return array of {type: 'text', text} | {type: 'tool', index}
}
```

### Inline Tool Card

Compact card that can be expanded:

```typescript
function InlineToolCard({ tool }: { tool: ToolHistoryEntry }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="inline-tool-card" onClick={() => setExpanded(!expanded)}>
            <div className="tool-header">
                <ToolIcon name={tool.tool_name} />
                <span className="tool-name">{formatToolName(tool.tool_name)}</span>
            </div>

            {expanded && (
                <div className="tool-details">
                    <div className="input">
                        <strong>Input:</strong>
                        <pre>{JSON.stringify(tool.input, null, 2)}</pre>
                    </div>
                    <div className="output">
                        <strong>Output:</strong>
                        <pre>{typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
```

### View All Tools

Button to show all tool calls from a message:

```typescript
function MessageBubble({ message, toolHistory }: Props) {
    const [showAllTools, setShowAllTools] = useState(false);

    return (
        <div className="message">
            {/* Message content with inline tools */}

            {toolHistory && toolHistory.length > 0 && (
                <button onClick={() => setShowAllTools(true)}>
                    View all {toolHistory.length} tool calls
                </button>
            )}

            {showAllTools && (
                <ToolHistoryPanel
                    tools={toolHistory}
                    onClose={() => setShowAllTools(false)}
                />
            )}
        </div>
    );
}
```

---

## 8. Frontend: Payload Handlers

Payload handlers are passed per-page to ChatTray. They define how to render payloads AND provide callbacks that can update page state when the user accepts or rejects a payload.

### PayloadHandler Interface

```typescript
interface PayloadHandler {
    render: (data: any, callbacks: PayloadCallbacks) => React.ReactNode;
    onAccept?: (data: any) => void;   // Called when user accepts - can update page state
    onReject?: (data: any) => void;   // Called when user rejects - can update page state
    renderOptions?: {
        panelWidth?: string;
        headerTitle?: string;
        headerIcon?: string;
    };
}

interface PayloadCallbacks {
    onAccept: (data: any) => void;
    onReject: () => void;
}
```

### Passing Payload Handlers to ChatTray

Each page defines its own handlers with callbacks that integrate with the page's state:

```typescript
// Example: ReportsPage.tsx
function ReportsPage() {
    const [schema, setSchema] = useState(null);

    const payloadHandlers = useMemo(() => ({
        pubmed_article: {
            render: (data) => <PubMedArticleCard article={data} />,
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Article',
                headerIcon: '📄'
            }
        },
        schema_proposal: {
            render: (data, callbacks) => (
                <SchemaProposalCard
                    proposal={data}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: (data) => {
                setSchema(data);  // Updates page state!
                toast.success('Schema applied');
            },
            onReject: (data) => {
                toast.info('Schema rejected');
            },
            renderOptions: {
                headerTitle: 'Schema Proposal'
            }
        }
    }), []);

    return (
        <div>
            {/* Page content that uses schema state */}
            <ChatTray
                initialContext={{ current_page: 'reports' }}
                payloadHandlers={payloadHandlers}
            />
        </div>
    );
}
```

### How Payloads Flow

1. **Backend tool returns payload:**
   ```python
   return ToolResult(
       text="Here's the article...",
       payload={
           "type": "pubmed_article",
           "data": { "pmid": "12345", "title": "...", ... }
       }
   )
   ```

2. **ChatTray receives `custom_payload` in complete event**

3. **ChatTray checks if `payloadHandlers[payload.type]` exists**

4. **If handler exists, floating panel spawns with:**
   - The component from `handler.render(data, callbacks)`
   - Accept/reject callbacks wired up to `handler.onAccept` / `handler.onReject`

5. **When user accepts/rejects:**
   - Handler callback fires (can update page state)
   - Panel closes

### Global Payload Registry (Migration)

For the migration, we're moving from per-page `payloadHandlers` to a global registry:

```typescript
// lib/chat/payloadRegistry.ts
const payloadRegistry: Record<string, PayloadHandler> = {
    'pubmed_article': {
        render: (data) => <PubMedArticleCard article={data} />,
        renderOptions: { panelWidth: '550px', headerTitle: 'PubMed Article' }
    },
    'schema_proposal': {
        render: (data, callbacks) => <SchemaProposalCard proposal={data} {...callbacks} />,
        renderOptions: { headerTitle: 'Schema Proposal' }
    }
};

export function getPayloadHandler(type: string): PayloadHandler | null {
    return payloadRegistry[type] || null;
}
```

Pages can still provide `onAccept`/`onReject` callbacks for page-specific behavior while using global renderers.

---

## 9. Response Payloads

### ChatResponsePayload

```typescript
interface ChatResponsePayload {
    message: string;                              // LLM text (may contain [[tool:N]] markers)
    suggested_values?: SuggestedValue[];          // Quick input suggestions
    suggested_actions?: SuggestedAction[];        // Action buttons
    custom_payload?: {                            // Custom data
        type: string;                             // Payload type for registry lookup
        data: any;                                // Payload data
    };
}

interface SuggestedValue {
    label: string;
    value: string;
}

interface SuggestedAction {
    label: string;
    action: string;
    handler?: 'client' | 'server';
}
```

### Tool History

Tool calls are tracked in `custom_payload` with type `"tool_history"`:

```typescript
{
    "type": "tool_history",
    "data": [
        {
            "tool_name": "search_pubmed",
            "input": { "query": "..." },
            "output": "Found 15 articles..."
        },
        {
            "tool_name": "get_pubmed_article",
            "input": { "pmid": "12345678" },
            "output": { "title": "...", "abstract": "..." }
        }
    ]
}
```

The `[[tool:N]]` markers in the message text reference `tool_history[N]`.

---

## 10. File Structure

```
backend/
├── schemas/
│   └── general_chat.py              # Stream event types, ChatResponsePayload
├── services/
│   ├── agent_loop.py                # Agent loop with tool execution
│   └── general_chat_service.py      # Chat service, SSE streaming
├── tools/
│   ├── __init__.py
│   ├── registry.py                  # ToolConfig, ToolResult, ToolProgress
│   ├── executor.py                  # Tool execution (streaming + non-streaming)
│   └── builtin/
│       ├── __init__.py              # Auto-registers tools
│       └── pubmed.py                # PubMed tools
└── routers/
    └── general_chat.py              # SSE endpoint

frontend/
├── lib/
│   ├── api/
│   │   └── generalChatApi.ts        # Stream event types, API client
│   └── chat/
│       └── payloadRegistry.ts       # Global payload type → handler mapping (migration)
├── hooks/
│   └── useGeneralChat.ts            # Chat state management
├── components/
│   └── chat/
│       ├── ChatTray.tsx             # Complete chat UI + spawnable payload panel
│       ├── ToolProgressCard.tsx     # Tool progress during execution
│       ├── InlineToolCard.tsx       # Inline tool result card
│       ├── ToolHistoryPanel.tsx     # View all tools panel
│       ├── PubMedArticleCard.tsx    # Payload component
│       ├── SchemaProposalCard.tsx   # Payload component
│       └── ...                      # Other payload components
└── types/
    └── chat.ts                      # TypeScript interfaces
```
