# General Purpose Chat System - Design Specification

## Core Concept

A general-purpose chat interface that supports rich, context-aware conversations where:

1. **Frontend sends**: message + user context + interaction type
2. **Backend returns**: conversational text + suggestions/actions + custom payload
3. **Custom payloads**: Arbitrary data structures that frontend interprets (forms, configs, search results, etc.)

---

## Request Structure (Frontend → Backend)

### ChatRequest

```typescript
interface ChatRequest {
    message: string;                    // What the user typed or action they took
    context: Record<string, any>;       // User's current orientation in the system
    interaction_type: InteractionType;  // How this message was initiated
    conversation_history: Message[];    // Full chat transcript
}

enum InteractionType {
    TEXT_INPUT = 'text_input',         // User typed in input field
    BUTTON_CLICK = 'button_click',     // User clicked a suggestion button
    OPTION_SELECT = 'option_select',   // User selected from dropdown/chips
    FORM_SUBMIT = 'form_submit'        // User submitted a form
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}
```

### Context Object

Flexible metadata about user's current state:

```typescript
interface ChatContext {
    // Current location
    current_page?: string;              // e.g., "reports", "research_streams"
    current_route?: string;             // e.g., "/research-streams/123/edit"

    // Current entity being viewed/edited
    entity_type?: string;               // e.g., "report", "research_stream", "article"
    entity_id?: number;                 // ID of entity

    // User action that triggered chat
    action?: string;                    // e.g., "create_stream", "search_articles"
    action_context?: Record<string, any>; // Action-specific data

    // Error context (if user is troubleshooting)
    error?: {
        message: string;
        code?: string;
        context?: Record<string, any>;
    };

    // Arbitrary metadata
    [key: string]: any;                 // Anything else frontend wants to send
}
```

**Example Context - User on Reports Page**:
```typescript
{
    current_page: "reports",
    current_route: "/reports?stream_id=5",
    entity_type: "research_stream",
    entity_id: 5,
    filters: { stream_id: 5, unread_only: true }
}
```

**Example Context - User Hit an Error**:
```typescript
{
    current_page: "pipeline",
    entity_type: "research_stream",
    entity_id: 3,
    action: "run_pipeline",
    error: {
        message: "No articles retrieved",
        code: "EMPTY_RESULT_SET",
        context: { query: "melanocortin[Title]", source: "pubmed" }
    }
}
```

---

## Response Structure (Backend → Frontend)

### ChatResponse

```typescript
interface ChatResponse {
    message: string;                    // Conversational text to display
    suggestions?: Suggestion[];         // Clickable options for user
    payload?: CustomPayload;            // Structured data for frontend to interpret
}

interface Suggestion {
    label: string;                      // Display text
    value: string;                      // Value to send back if clicked
    style?: 'primary' | 'secondary' | 'warning'; // Visual style hint
}

interface CustomPayload {
    type: string;                       // Payload type (frontend uses this to route)
    data: any;                          // Arbitrary structured data
}
```

---

## Custom Payload Pattern

### How It Works

1. **Backend** sends structured data with a `type` identifier
2. **Frontend** has registered "payload handlers" for different types
3. **Frontend** interprets the payload and renders appropriate UI
4. **User** interacts with the rendered UI
5. **Frontend** sends result back through chat

### Example: Form Pre-Population

**User**: "Help me create a research stream for melanocortin research"

**Backend Response**:
```json
{
    "message": "I've prepared a stream configuration based on your request. Review the form below and click Accept to create the stream.",
    "suggestions": [
        { "label": "Accept & Create", "value": "accept_stream_config" },
        { "label": "Modify", "value": "modify_stream_config" }
    ],
    "payload": {
        "type": "research_stream_form",
        "data": {
            "stream_name": "Melanocortin Research Intelligence",
            "purpose": "Monitor melanocortin pathway research for competitive intelligence",
            "report_frequency": "weekly",
            "channels": [
                {
                    "name": "Melanocortin Pathways",
                    "focus": "Track scientific research on melanocortin receptors",
                    "type": "scientific",
                    "keywords": ["melanocortin", "MCR1", "MCR4", "alpha-MSH"]
                },
                {
                    "name": "Clinical Developments",
                    "focus": "Monitor clinical trials",
                    "type": "clinical",
                    "keywords": ["bremelanotide", "clinical trial", "phase 2"]
                }
            ]
        }
    }
}
```

**Frontend Rendering**:
```typescript
// Frontend has a payload handler registry
const payloadHandlers = {
    'research_stream_form': (data) => {
        // Render pre-populated form
        return <ResearchStreamFormPreview
            initialData={data}
            onAccept={() => createStream(data)}
            onModify={(field) => openChatWith(`Change ${field}`)}
        />
    },
    'search_results': (data) => {
        return <SearchResultsPreview results={data.results} />
    },
    'validation_errors': (data) => {
        return <ValidationErrorList errors={data.errors} />
    },
    // ... more handlers
}

// In chat component
if (response.payload) {
    const handler = payloadHandlers[response.payload.type];
    if (handler) {
        return handler(response.payload.data);
    }
}
```

### Example: Search Filter Suggestion

**User**: "Find articles about melanocortin from 2024"

**Backend Response**:
```json
{
    "message": "I'll search for melanocortin articles from 2024. Here are the filters I'll apply:",
    "suggestions": [
        { "label": "Search Now", "value": "execute_search" },
        { "label": "Refine Filters", "value": "refine_filters" }
    ],
    "payload": {
        "type": "search_filters",
        "data": {
            "entity_type": "articles",
            "filters": {
                "keywords": ["melanocortin"],
                "year": 2024,
                "date_range": {
                    "start": "2024-01-01",
                    "end": "2024-12-31"
                }
            },
            "sort": "relevance"
        }
    }
}
```

**Frontend Rendering**:
```typescript
payloadHandlers['search_filters'] = (data) => {
    return (
        <div className="search-preview">
            <h4>Suggested Search</h4>
            <FilterChips filters={data.filters} />
            <button onClick={() => executeSearch(data)}>
                Apply & Search
            </button>
        </div>
    )
}
```

### Example: Validation Feedback

**User**: Submits incomplete form

**Backend Response**:
```json
{
    "message": "I found some issues with the configuration. Please review the highlighted fields below.",
    "suggestions": [
        { "label": "Fix Automatically", "value": "auto_fix" },
        { "label": "Guide Me Through", "value": "guided_fix" }
    ],
    "payload": {
        "type": "validation_errors",
        "data": {
            "errors": [
                {
                    "field": "channels",
                    "message": "At least one channel is required",
                    "severity": "error"
                },
                {
                    "field": "channels[0].keywords",
                    "message": "Keywords list is empty",
                    "severity": "error"
                }
            ],
            "suggested_fixes": {
                "channels": [
                    {
                        "name": "Primary Research",
                        "type": "scientific",
                        "keywords": ["melanocortin", "research"]
                    }
                ]
            }
        }
    }
}
```

### Example: Navigation Guidance

**User**: "Where do I find my reports?"

**Backend Response**:
```json
{
    "message": "Your reports are on the Reports page. I can take you there now.",
    "suggestions": [
        { "label": "Go to Reports", "value": "navigate_reports" },
        { "label": "Show me unread reports", "value": "navigate_reports_unread" }
    ],
    "payload": {
        "type": "navigation",
        "data": {
            "target_route": "/reports",
            "query_params": {},
            "highlight_element": ".reports-list"
        }
    }
}
```

**Frontend Rendering**:
```typescript
payloadHandlers['navigation'] = (data) => {
    return (
        <div className="navigation-preview">
            <p>Destination: <code>{data.target_route}</code></p>
            <button onClick={() => {
                router.push(data.target_route);
                if (data.highlight_element) {
                    highlightElement(data.highlight_element);
                }
            }}>
                Navigate Now
            </button>
        </div>
    )
}
```

---

## System Architecture

### Frontend Components

#### 1. ChatInterface Component

**File**: `frontend/src/components/ChatInterface.tsx`

Generic chat UI that works with any payload type:

```typescript
interface ChatInterfaceProps {
    initialContext?: Record<string, any>;
    payloadHandlers?: PayloadHandlerRegistry;
    onAction?: (action: string, data?: any) => void;
}

function ChatInterface({
    initialContext,
    payloadHandlers = defaultHandlers,
    onAction
}: ChatInterfaceProps) {
    const { messages, sendMessage, isLoading } = useChat(initialContext);

    return (
        <div className="chat-interface">
            {/* Message List */}
            <MessageList>
                {messages.map(msg => (
                    <div key={msg.id}>
                        <MessageBubble message={msg.content} role={msg.role} />

                        {/* Render suggestions */}
                        {msg.suggestions && (
                            <SuggestionChips
                                suggestions={msg.suggestions}
                                onSelect={(value) => sendMessage(value, 'button_click')}
                            />
                        )}

                        {/* Render custom payload */}
                        {msg.payload && (
                            <PayloadRenderer
                                payload={msg.payload}
                                handlers={payloadHandlers}
                                onAction={onAction}
                            />
                        )}
                    </div>
                ))}
            </MessageList>

            {/* Input */}
            <ChatInput
                onSubmit={(text) => sendMessage(text, 'text_input')}
                disabled={isLoading}
            />
        </div>
    );
}
```

#### 2. PayloadRenderer Component

**File**: `frontend/src/components/PayloadRenderer.tsx`

Routes payloads to appropriate handlers:

```typescript
interface PayloadRendererProps {
    payload: CustomPayload;
    handlers: PayloadHandlerRegistry;
    onAction?: (action: string, data?: any) => void;
}

function PayloadRenderer({ payload, handlers, onAction }: PayloadRendererProps) {
    const handler = handlers[payload.type];

    if (!handler) {
        console.warn(`No handler registered for payload type: ${payload.type}`);
        return <pre>{JSON.stringify(payload.data, null, 2)}</pre>;
    }

    return handler(payload.data, onAction);
}

// Payload handler type
type PayloadHandler = (
    data: any,
    onAction?: (action: string, data?: any) => void
) => React.ReactNode;

type PayloadHandlerRegistry = Record<string, PayloadHandler>;
```

#### 3. useChat Hook

**File**: `frontend/src/hooks/useChat.ts`

State management for chat:

```typescript
function useChat(initialContext?: Record<string, any>) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [context, setContext] = useState(initialContext || {});
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async (
        content: string,
        interactionType: InteractionType = 'text_input'
    ) => {
        // Add user message
        setMessages(prev => [...prev, {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        }]);

        setIsLoading(true);

        try {
            // Call API
            const response = await chatApi.sendMessage({
                message: content,
                context,
                interaction_type: interactionType,
                conversation_history: messages
            });

            // Add assistant message
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.message,
                suggestions: response.suggestions,
                payload: response.payload,
                timestamp: new Date().toISOString()
            }]);

        } catch (error) {
            // Handle error
        } finally {
            setIsLoading(false);
        }
    };

    const updateContext = (updates: Record<string, any>) => {
        setContext(prev => ({ ...prev, ...updates }));
    };

    return {
        messages,
        context,
        isLoading,
        sendMessage,
        updateContext
    };
}
```

#### 4. Chat API Client

**File**: `frontend/src/lib/api/chatApi.ts`

```typescript
export const chatApi = {
    async sendMessage(request: ChatRequest): Promise<ChatResponse> {
        const response = await api.post('/api/chat', request);
        return response.data;
    },

    // For SSE streaming (optional)
    async* streamMessage(request: ChatRequest): AsyncGenerator<ChatStreamChunk> {
        const stream = makeStreamRequest('/api/chat/stream', request, 'POST');
        for await (const chunk of stream) {
            yield JSON.parse(chunk.data);
        }
    }
};
```

### Backend Components

#### 1. Chat Router

**File**: `backend/routers/chat.py`

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal

from database import get_db
from models import User
from routers.auth import get_current_user
from services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    timestamp: str

class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]
    interaction_type: Literal["text_input", "button_click", "option_select", "form_submit"]
    conversation_history: List[ChatMessage]

class Suggestion(BaseModel):
    label: str
    value: str
    style: Optional[Literal["primary", "secondary", "warning"]] = None

class CustomPayload(BaseModel):
    type: str
    data: Any

class ChatResponse(BaseModel):
    message: str
    suggestions: Optional[List[Suggestion]] = None
    payload: Optional[CustomPayload] = None

@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ChatResponse:
    """
    General purpose chat endpoint.

    Accepts user message with context and returns:
    - Conversational response
    - Optional suggestions
    - Optional custom payload for frontend to interpret
    """
    service = ChatService(db, current_user.user_id)
    return await service.handle_message(request)
```

#### 2. Chat Service

**File**: `backend/services/chat_service.py`

```python
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
import anthropic
import os

class ChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def handle_message(self, request: ChatRequest) -> ChatResponse:
        """
        Main entry point for handling chat messages.

        1. Analyze context to determine intent
        2. Call LLM with context-aware prompt
        3. Parse response for message, suggestions, and payload
        4. Return structured response
        """
        # Build context-aware system prompt
        system_prompt = self._build_system_prompt(request.context)

        # Build user prompt
        user_prompt = self._build_user_prompt(
            request.message,
            request.context,
            request.interaction_type
        )

        # Call LLM
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]
        messages.append({"role": "user", "content": user_prompt})

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            temperature=0.0,
            system=system_prompt,
            messages=messages
        )

        # Parse structured response
        parsed = self._parse_llm_response(response.content[0].text)

        return ChatResponse(
            message=parsed["message"],
            suggestions=parsed.get("suggestions"),
            payload=parsed.get("payload")
        )

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """
        Build system prompt based on user's context.

        Context-aware prompting allows LLM to:
        - Know where user is in the app
        - Understand what they're trying to do
        - Generate appropriate payloads for that context
        """
        current_page = context.get("current_page", "unknown")
        entity_type = context.get("entity_type")
        action = context.get("action")
        error = context.get("error")

        base_prompt = """You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        Your responses should be structured in this format:

        MESSAGE: [Your conversational response to the user]
        SUGGESTIONS: [Optional comma-separated clickable options]
        PAYLOAD_TYPE: [Optional payload type identifier]
        PAYLOAD: [Optional JSON payload]

        The PAYLOAD is arbitrary structured data that the frontend will interpret.
        Use payloads to send complex data structures like:
        - Form pre-fills: {"type": "research_stream_form", "data": {...}}
        - Search filters: {"type": "search_filters", "data": {...}}
        - Validation errors: {"type": "validation_errors", "data": {...}}
        - Navigation: {"type": "navigation", "data": {...}}
        - Any other structured data

        The frontend has handlers registered for different payload types.
        """

        # Add context-specific guidance
        if error:
            base_prompt += f"""

            USER ENCOUNTERED AN ERROR:
            Error: {error.get('message')}
            Code: {error.get('code')}

            Help them troubleshoot this issue.
            """

        if action == "create_stream":
            base_prompt += """

            USER WANTS TO CREATE A RESEARCH STREAM.
            Ask clarifying questions, then generate a payload of type "research_stream_form"
            with pre-populated data based on their answers.
            """

        if current_page == "reports":
            base_prompt += """

            USER IS ON THE REPORTS PAGE.
            If they ask about finding/filtering reports, generate a payload of type
            "search_filters" with appropriate filter criteria.
            """

        return base_prompt

    def _build_user_prompt(
        self,
        message: str,
        context: Dict[str, Any],
        interaction_type: str
    ) -> str:
        """Build user prompt with context."""
        context_summary = "\n".join([f"{k}: {v}" for k, v in context.items()])

        return f"""User's current context:
{context_summary}

Interaction type: {interaction_type}

User's message: {message}

Respond with MESSAGE, optional SUGGESTIONS, and optional PAYLOAD."""

    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse LLM response to extract:
        - MESSAGE: Conversational text
        - SUGGESTIONS: Comma-separated options
        - PAYLOAD_TYPE: Type identifier
        - PAYLOAD: JSON data
        """
        import json

        result = {
            "message": "",
            "suggestions": None,
            "payload": None
        }

        lines = response_text.split('\n')
        payload_type = None
        payload_lines = []
        in_payload = False

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                result["message"] = stripped.replace("MESSAGE:", "").strip()

            elif stripped.startswith("SUGGESTIONS:"):
                suggestions_str = stripped.replace("SUGGESTIONS:", "").strip()
                if suggestions_str:
                    result["suggestions"] = [
                        {"label": s.strip(), "value": s.strip()}
                        for s in suggestions_str.split(",")
                    ]

            elif stripped.startswith("PAYLOAD_TYPE:"):
                payload_type = stripped.replace("PAYLOAD_TYPE:", "").strip()

            elif stripped.startswith("PAYLOAD:"):
                in_payload = True
                payload_content = stripped.replace("PAYLOAD:", "").strip()
                if payload_content:
                    payload_lines.append(payload_content)

            elif in_payload:
                payload_lines.append(line)

        # Parse payload if we have one
        if payload_type and payload_lines:
            try:
                payload_json = "\n".join(payload_lines)
                payload_data = json.loads(payload_json)
                result["payload"] = {
                    "type": payload_type,
                    "data": payload_data
                }
            except json.JSONDecodeError:
                # If JSON parsing fails, include as string
                result["payload"] = {
                    "type": payload_type,
                    "data": {"raw": "\n".join(payload_lines)}
                }

        return result
```

---

## Example Payload Types

### 1. research_stream_form
Pre-populated research stream configuration

**Use Case**: User asks to create a stream

**Payload**:
```json
{
    "type": "research_stream_form",
    "data": {
        "stream_name": "...",
        "purpose": "...",
        "channels": [...],
        "report_frequency": "..."
    }
}
```

**Frontend Handler**: Renders form preview with accept/edit buttons

### 2. search_filters
Suggested search filters

**Use Case**: User asks to find specific articles/reports

**Payload**:
```json
{
    "type": "search_filters",
    "data": {
        "entity_type": "articles",
        "filters": {
            "keywords": ["melanocortin"],
            "year": 2024,
            "author": "Smith J"
        }
    }
}
```

**Frontend Handler**: Shows filter chips and "Search Now" button

### 3. validation_errors
Form validation feedback

**Use Case**: User submitted incomplete/invalid data

**Payload**:
```json
{
    "type": "validation_errors",
    "data": {
        "errors": [
            {"field": "channels", "message": "Required", "severity": "error"}
        ],
        "suggested_fixes": {
            "channels": [{"name": "Default", "type": "scientific"}]
        }
    }
}
```

**Frontend Handler**: Highlights errors and shows auto-fix option

### 4. navigation
Navigation instructions

**Use Case**: User asks "where is X?"

**Payload**:
```json
{
    "type": "navigation",
    "data": {
        "target_route": "/reports",
        "query_params": {"stream_id": 5},
        "highlight_element": ".report-card:first"
    }
}
```

**Frontend Handler**: Navigate button + element highlighting

### 5. comparison_table
Side-by-side comparison

**Use Case**: User asks to compare options

**Payload**:
```json
{
    "type": "comparison_table",
    "data": {
        "columns": ["Option A", "Option B", "Option C"],
        "rows": [
            {"label": "Cost", "values": ["$10", "$20", "$30"]},
            {"label": "Speed", "values": ["Fast", "Medium", "Slow"]}
        ]
    }
}
```

**Frontend Handler**: Renders comparison table

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Frontend**:
- `components/ChatInterface.tsx` - Generic chat UI
- `components/PayloadRenderer.tsx` - Payload routing
- `hooks/useChat.ts` - Chat state management
- `lib/api/chatApi.ts` - API client

**Backend**:
- `routers/chat.py` - Chat endpoint
- `services/chat_service.py` - Core service
- `schemas/chat.py` - Pydantic models

**Deliverable**: Basic chat working with text responses

### Phase 2: Payload System (Week 2)

**Frontend**:
- Create payload handler registry
- Implement 2-3 basic handlers (form, search_filters, navigation)
- Add payload rendering to ChatInterface

**Backend**:
- Update LLM prompts to generate payloads
- Add payload parsing logic
- Test payload generation for different contexts

**Deliverable**: Chat can send/receive custom payloads

### Phase 3: Use Case Implementation (Week 3)

Implement specific use cases:
- Stream creation assistant (research_stream_form payload)
- Search assistant (search_filters payload)
- Navigation helper (navigation payload)

**Deliverable**: 3 working use cases with custom payloads

### Phase 4: Polish & Extend (Week 4)

- Add SSE streaming support
- Add more payload types
- Improve error handling
- Add analytics

---

## File Structure

```
frontend/src/
├── components/
│   ├── ChatInterface.tsx          [NEW] - Main chat UI
│   ├── PayloadRenderer.tsx        [NEW] - Routes payloads to handlers
│   ├── MessageBubble.tsx          [NEW] - Individual message display
│   └── SuggestionChips.tsx        [NEW] - Clickable suggestions
├── hooks/
│   └── useChat.ts                 [NEW] - Chat state management
├── lib/api/
│   └── chatApi.ts                 [NEW] - API client
├── payloadHandlers/               [NEW]
│   ├── index.ts                   - Handler registry
│   ├── researchStreamForm.tsx     - Form pre-fill handler
│   ├── searchFilters.tsx          - Search filter handler
│   └── navigation.tsx             - Navigation handler
└── types/
    └── chat.ts                    [NEW] - Type definitions

backend/
├── routers/
│   └── chat.py                    [NEW] - Chat endpoint
├── services/
│   └── chat_service.py            [NEW] - Chat service
└── schemas/
    └── chat.py                    [NEW] - Pydantic models
```

---

## Key Advantages

1. **Maximum Flexibility**: Custom payloads can be anything - no hardcoded structure
2. **Simple Integration**: Just register a handler for new payload types
3. **Separation of Concerns**: Backend focuses on data, frontend on presentation
4. **Type Safety**: Each payload type has its own structure
5. **Extensible**: Add new payload types without changing core system
6. **Context-Aware**: LLM has full context about user's location and intent
7. **Action Tracking**: Know whether user typed vs. clicked suggestion
8. **Reusable**: Same infrastructure for help, forms, search, navigation, etc.

---

## Success Metrics

1. **Payload Coverage**: % of responses that include custom payloads
2. **Payload Acceptance Rate**: % of payloads user accepts vs. modifies
3. **Interaction Efficiency**: Avg messages to complete task (should decrease)
4. **Context Accuracy**: % of responses that use context appropriately
5. **Handler Coverage**: % of payload types with registered handlers
