# General Purpose Chat System - Design Specification

## Core Concept

A general-purpose chat interface that supports rich, context-aware conversations where:

1. **Frontend sends**: message + user context + interaction type + action metadata
2. **Backend returns**: conversational text + suggested values + suggested actions + custom payload
3. **Custom payloads**: Arbitrary data structures rendered by the embedding context
4. **Actions**: Can be client-side (local execution) or server-side (backend processing)

---

## Request Structure (Frontend → Backend)

### ChatRequest

```typescript
interface ChatRequest {
    message: string;                    // What the user typed or action they took
    context: Record<string, any>;       // User's current orientation in the system
    interaction_type: InteractionType;  // How this message was initiated
    action_metadata?: ActionMetadata;   // If action was executed
    conversation_history: Message[];    // Full chat transcript
}

enum InteractionType {
    TEXT_INPUT = 'text_input',         // User typed in input field
    VALUE_SELECTED = 'value_selected', // User clicked a suggested value
    ACTION_EXECUTED = 'action_executed' // User executed an action
}

interface ActionMetadata {
    action_identifier: string;          // e.g., "create_stream", "update_config"
    action_data?: any;                  // Data associated with the action
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

---

## Response Structure (Backend → Frontend)

### ChatResponse

```typescript
interface ChatResponse {
    message: string;                        // Conversational text to display
    suggested_values?: SuggestedValue[];    // Values user can select to continue conversation
    suggested_actions?: SuggestedAction[];  // Actions user can execute
    payload?: CustomPayload;                // Structured data for embedding context
}

interface SuggestedValue {
    label: string;                          // Display text
    value: string;                          // Message to send back if selected
}

interface SuggestedAction {
    label: string;                          // Display text
    action: string;                         // Action identifier
    handler: 'client' | 'server';           // Who handles this action
    data?: any;                             // Action-specific data
    style?: 'primary' | 'secondary' | 'warning'; // Visual style hint
}

interface CustomPayload {
    type: string;                           // Payload type (frontend uses this to route)
    data: any;                              // Arbitrary structured data
}
```

---

## Action Types & Handling

### Client-Side Actions

Handled entirely in the frontend, **no backend call**:

```typescript
const CLIENT_ACTIONS = {
    close: () => closeModal(),
    cancel: () => { resetState(); closeChat(); },
    navigate: (data) => router.push(data.route),
    copy: (data) => navigator.clipboard.writeText(data.text),
    highlight: (data) => highlightElement(data.selector),
    download: (data) => downloadFile(data.url, data.filename)
}
```

**Examples:**
- `{ label: "Close", action: "close", handler: "client" }`
- `{ label: "Cancel", action: "cancel", handler: "client" }`
- `{ label: "Go to Reports", action: "navigate", handler: "client", data: { route: "/reports" } }`

### Server-Side Actions

Require backend processing, **sent back to server**:

```typescript
// These trigger a new chat request with interaction_type='action_executed'
const SERVER_ACTIONS = [
    'create_stream',      // Create entity in database
    'update_config',      // Update configuration
    'execute_search',     // Run search query
    'delete_entity',      // Delete from database
    'apply_filters',      // Apply filters and fetch results
    'validate_form'       // Validate and process form data
]
```

**Examples:**
- `{ label: "Accept & Create", action: "create_stream", handler: "server", data: {...} }`
- `{ label: "Apply Filters", action: "execute_search", handler: "server", data: {...} }`

---

## User Interaction Flows

### Flow 1: User Types Message

```typescript
// User types "Help me create a research stream"
const request: ChatRequest = {
    message: "Help me create a research stream",
    context: { current_page: "home" },
    interaction_type: 'text_input',
    conversation_history: messages
};

// Send to backend
const response = await chatApi.sendMessage(request);
```

**Backend Response:**
```json
{
    "message": "I'll help you create a research stream. What area are you focused on?",
    "suggested_values": [
        { "label": "Oncology", "value": "oncology research" },
        { "label": "Cardiology", "value": "cardiovascular research" },
        { "label": "Neurology", "value": "neuroscience research" }
    ]
}
```

### Flow 2: User Selects Suggested Value

```typescript
// User clicks "Oncology" chip
const handleValueSelect = async (value: string) => {
    const request: ChatRequest = {
        message: value,  // "oncology research"
        context: currentContext,
        interaction_type: 'value_selected',
        conversation_history: messages
    };

    const response = await chatApi.sendMessage(request);
};
```

**Backend knows:**
- User selected a value (didn't type it)
- Can adjust tone/response accordingly
- Continues building context

**Backend Response:**
```json
{
    "message": "Great! I've prepared an oncology research stream. Review the configuration below.",
    "suggested_values": [
        { "label": "Change name", "value": "change the stream name" },
        { "label": "Add channel", "value": "add another channel" }
    ],
    "suggested_actions": [
        {
            "label": "Accept & Create",
            "action": "create_stream",
            "handler": "server",
            "data": { "stream_name": "Oncology Research", "channels": [...] },
            "style": "primary"
        },
        {
            "label": "Cancel",
            "action": "cancel",
            "handler": "client",
            "style": "secondary"
        }
    ],
    "payload": {
        "type": "research_stream_form",
        "data": { /* form data for preview */ }
    }
}
```

### Flow 3: User Executes Client-Side Action

```typescript
// User clicks "Cancel" action
const handleActionClick = async (action: SuggestedAction) => {
    if (action.handler === 'client') {
        // Handle locally, no backend call
        switch (action.action) {
            case 'close':
                closeModal();
                break;
            case 'cancel':
                resetState();
                closeChat();
                break;
            case 'navigate':
                router.push(action.data.route);
                break;
            case 'copy':
                await navigator.clipboard.writeText(action.data.text);
                showToast('Copied!');
                break;
        }
        // No backend interaction
        return;
    }

    // ... handle server actions
};
```

### Flow 4: User Executes Server-Side Action

```typescript
// User clicks "Accept & Create" action
const handleActionClick = async (action: SuggestedAction) => {
    if (action.handler === 'server') {
        const request: ChatRequest = {
            message: action.label,  // "Accept & Create"
            context: currentContext,
            interaction_type: 'action_executed',
            action_metadata: {
                action_identifier: action.action,  // "create_stream"
                action_data: action.data  // Stream configuration
            },
            conversation_history: messages
        };

        const response = await chatApi.sendMessage(request);
    }
};
```

**Backend receives:**
```json
{
    "message": "Accept & Create",
    "context": { "current_page": "home" },
    "interaction_type": "action_executed",
    "action_metadata": {
        "action_identifier": "create_stream",
        "action_data": {
            "stream_name": "Oncology Research",
            "channels": [...]
        }
    },
    "conversation_history": [...]
}
```

**Backend processing:**
```python
async def handle_message(self, request: ChatRequest) -> ChatResponse:
    # Detect action execution
    if request.interaction_type == "action_executed":
        action_id = request.action_metadata.action_identifier
        action_data = request.action_metadata.action_data

        # Execute the action
        if action_id == "create_stream":
            stream = await self._create_research_stream(action_data)

            return ChatResponse(
                message=f"✓ Successfully created '{stream.stream_name}'! "
                        f"You can view it on the Research Streams page.",
                suggested_actions=[
                    SuggestedAction(
                        label="View Stream",
                        action="navigate",
                        handler="client",
                        data={"route": f"/research-streams/{stream.stream_id}"},
                        style="primary"
                    ),
                    SuggestedAction(
                        label="Create Another",
                        action="restart",
                        handler="client"
                    ),
                    SuggestedAction(
                        label="Close",
                        action="close",
                        handler="client"
                    )
                ]
            )

        elif action_id == "execute_search":
            results = await self._execute_search(action_data)
            return ChatResponse(
                message=f"Found {len(results)} articles matching your criteria.",
                suggested_actions=[
                    SuggestedAction(
                        label="View Results",
                        action="navigate",
                        handler="client",
                        data={"route": f"/articles?query={action_data['query']}"}
                    )
                ],
                payload=CustomPayload(
                    type="search_results",
                    data={"results": results[:10]}  # Preview
                )
            )

    # Otherwise, continue normal conversation...
    return await self._continue_conversation(request)
```

**Backend Response:**
```json
{
    "message": "✓ Successfully created 'Oncology Research'! You can view it on the Research Streams page.",
    "suggested_actions": [
        {
            "label": "View Stream",
            "action": "navigate",
            "handler": "client",
            "data": { "route": "/research-streams/123" },
            "style": "primary"
        },
        {
            "label": "Create Another",
            "action": "restart",
            "handler": "client"
        },
        {
            "label": "Close",
            "action": "close",
            "handler": "client"
        }
    ]
}
```

---

## Complete Example: Stream Creation Flow

### Turn 1: Initial Request

**User Types:** "Help me create a research stream"

**Request:**
```json
{
    "message": "Help me create a research stream",
    "context": { "current_page": "home" },
    "interaction_type": "text_input",
    "conversation_history": []
}
```

**Response:**
```json
{
    "message": "I'll help you create a research stream. What therapeutic area are you focused on?",
    "suggested_values": [
        { "label": "Oncology", "value": "oncology research" },
        { "label": "Cardiology", "value": "cardiovascular research" },
        { "label": "Neurology", "value": "neuroscience research" },
        { "label": "Immunology", "value": "immunology research" }
    ]
}
```

### Turn 2: Value Selection

**User Clicks:** "Oncology" chip

**Request:**
```json
{
    "message": "oncology research",
    "context": { "current_page": "home" },
    "interaction_type": "value_selected",
    "conversation_history": [
        { "role": "user", "content": "Help me create a research stream", "timestamp": "..." },
        { "role": "assistant", "content": "I'll help you...", "timestamp": "..." }
    ]
}
```

**Response:**
```json
{
    "message": "Perfect! I've prepared an oncology research stream configuration. Review it below and let me know if you'd like any changes.",
    "suggested_values": [
        { "label": "Change name", "value": "I want to change the stream name" },
        { "label": "Add more channels", "value": "add more channels" },
        { "label": "Different frequency", "value": "change the report frequency" }
    ],
    "suggested_actions": [
        {
            "label": "Accept & Create Stream",
            "action": "create_stream",
            "handler": "server",
            "data": {
                "stream_name": "Oncology Research Intelligence",
                "purpose": "Monitor oncology research and drug development",
                "report_frequency": "weekly",
                "channels": [
                    {
                        "name": "Lung Cancer Research",
                        "type": "scientific",
                        "keywords": ["lung cancer", "NSCLC", "SCLC"]
                    },
                    {
                        "name": "Breast Cancer Trials",
                        "type": "clinical",
                        "keywords": ["breast cancer", "clinical trial"]
                    }
                ]
            },
            "style": "primary"
        },
        {
            "label": "Cancel",
            "action": "cancel",
            "handler": "client",
            "style": "secondary"
        }
    ],
    "payload": {
        "type": "research_stream_form",
        "data": {
            "stream_name": "Oncology Research Intelligence",
            "purpose": "Monitor oncology research and drug development",
            "report_frequency": "weekly",
            "channels": [...]
        }
    }
}
```

**Frontend Rendering:**
- Chat window shows message + suggested values + action buttons
- Embedding context renders `research_stream_form` payload as form preview

### Turn 3a: User Requests Change (Value Selection)

**User Clicks:** "Change name" chip

**Request:**
```json
{
    "message": "I want to change the stream name",
    "context": { "current_page": "home" },
    "interaction_type": "value_selected",
    "conversation_history": [...]
}
```

**Response:**
```json
{
    "message": "What would you like to name the stream?",
    "suggested_values": [
        { "label": "Cancer Research Monitor", "value": "Cancer Research Monitor" },
        { "label": "Oncology Intelligence", "value": "Oncology Intelligence" },
        { "label": "Let me type it", "value": "I'll type the name" }
    ]
}
```

### Turn 3b: User Accepts (Action Execution)

**User Clicks:** "Accept & Create Stream" button

**Request:**
```json
{
    "message": "Accept & Create Stream",
    "context": { "current_page": "home" },
    "interaction_type": "action_executed",
    "action_metadata": {
        "action_identifier": "create_stream",
        "action_data": {
            "stream_name": "Oncology Research Intelligence",
            "purpose": "Monitor oncology research and drug development",
            "report_frequency": "weekly",
            "channels": [...]
        }
    },
    "conversation_history": [...]
}
```

**Backend:**
- Creates research stream in database
- Returns success response

**Response:**
```json
{
    "message": "✓ Success! Created 'Oncology Research Intelligence'. The stream is now active and will generate weekly reports.",
    "suggested_actions": [
        {
            "label": "View Stream",
            "action": "navigate",
            "handler": "client",
            "data": { "route": "/research-streams/123" },
            "style": "primary"
        },
        {
            "label": "Run Test Report",
            "action": "navigate",
            "handler": "client",
            "data": { "route": "/research-streams/123/pipeline" }
        },
        {
            "label": "Close",
            "action": "close",
            "handler": "client"
        }
    ]
}
```

**User Clicks:** "View Stream" button
- Client-side action, navigates to `/research-streams/123`
- Chat can close or remain open

---

## System Architecture

### Frontend Components

#### 1. ChatInterface Component

**File**: `frontend/src/components/ChatInterface.tsx`

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

    const handleValueSelect = (value: string) => {
        sendMessage(value, 'value_selected');
    };

    const handleActionClick = async (action: SuggestedAction) => {
        if (action.handler === 'client') {
            // Execute client-side action
            executeClientAction(action.action, action.data);
            onAction?.(action.action, action.data);
        } else {
            // Send to server
            await sendMessage(
                action.label,
                'action_executed',
                {
                    action_identifier: action.action,
                    action_data: action.data
                }
            );
        }
    };

    return (
        <div className="chat-interface">
            <MessageList>
                {messages.map(msg => (
                    <div key={msg.id}>
                        <MessageBubble message={msg.content} role={msg.role} />

                        {/* Suggested Values */}
                        {msg.suggested_values && (
                            <SuggestedValues
                                values={msg.suggested_values}
                                onSelect={handleValueSelect}
                            />
                        )}

                        {/* Suggested Actions */}
                        {msg.suggested_actions && (
                            <SuggestedActions
                                actions={msg.suggested_actions}
                                onAction={handleActionClick}
                            />
                        )}

                        {/* Custom Payload (rendered by parent context) */}
                        {msg.payload && (
                            <PayloadRenderer
                                payload={msg.payload}
                                handlers={payloadHandlers}
                            />
                        )}
                    </div>
                ))}
            </MessageList>

            <ChatInput
                onSubmit={(text) => sendMessage(text, 'text_input')}
                disabled={isLoading}
            />
        </div>
    );
}
```

#### 2. Client Action Executor

**File**: `frontend/src/lib/clientActions.ts`

```typescript
export const executeClientAction = (action: string, data?: any) => {
    switch (action) {
        case 'close':
            // Close modal/chat
            window.dispatchEvent(new CustomEvent('chat:close'));
            break;

        case 'cancel':
            // Reset and close
            window.dispatchEvent(new CustomEvent('chat:reset'));
            window.dispatchEvent(new CustomEvent('chat:close'));
            break;

        case 'navigate':
            // Navigate to route
            if (data?.route) {
                const router = useRouter(); // Or your routing method
                router.push(data.route);
            }
            break;

        case 'copy':
            // Copy to clipboard
            if (data?.text) {
                navigator.clipboard.writeText(data.text);
            }
            break;

        case 'highlight':
            // Highlight element
            if (data?.selector) {
                const el = document.querySelector(data.selector);
                el?.classList.add('highlighted');
                setTimeout(() => el?.classList.remove('highlighted'), 3000);
            }
            break;

        case 'download':
            // Trigger download
            if (data?.url && data?.filename) {
                const a = document.createElement('a');
                a.href = data.url;
                a.download = data.filename;
                a.click();
            }
            break;

        case 'restart':
            // Restart conversation
            window.dispatchEvent(new CustomEvent('chat:restart'));
            break;

        default:
            console.warn(`Unknown client action: ${action}`);
    }
};
```

#### 3. useChat Hook

**File**: `frontend/src/hooks/useChat.ts`

```typescript
function useChat(initialContext?: Record<string, any>) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [context, setContext] = useState(initialContext || {});
    const [isLoading, setIsLoading] = useState(false);

    const sendMessage = async (
        content: string,
        interactionType: InteractionType = 'text_input',
        actionMetadata?: ActionMetadata
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
                action_metadata: actionMetadata,
                conversation_history: messages
            });

            // Add assistant message
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.message,
                suggested_values: response.suggested_values,
                suggested_actions: response.suggested_actions,
                payload: response.payload,
                timestamp: new Date().toISOString()
            }]);

        } catch (error) {
            // Handle error
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, something went wrong. Please try again.',
                timestamp: new Date().toISOString()
            }]);
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

class ActionMetadata(BaseModel):
    action_identifier: str
    action_data: Optional[Any] = None

class ChatRequest(BaseModel):
    message: str
    context: Dict[str, Any]
    interaction_type: Literal["text_input", "value_selected", "action_executed"]
    action_metadata: Optional[ActionMetadata] = None
    conversation_history: List[ChatMessage]

class SuggestedValue(BaseModel):
    label: str
    value: str

class SuggestedAction(BaseModel):
    label: str
    action: str
    handler: Literal["client", "server"]
    data: Optional[Any] = None
    style: Optional[Literal["primary", "secondary", "warning"]] = None

class CustomPayload(BaseModel):
    type: str
    data: Any

class ChatResponse(BaseModel):
    message: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
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
    - Optional suggested values (continue conversation)
    - Optional suggested actions (client or server)
    - Optional custom payload for embedding context
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
import logging

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def handle_message(self, request: ChatRequest) -> ChatResponse:
        """
        Main entry point for handling chat messages.

        Flow:
        1. Check if action_executed → execute action and return result
        2. Otherwise → continue conversation with LLM
        """
        # Handle action execution
        if request.interaction_type == "action_executed":
            return await self._handle_action_execution(request)

        # Continue conversation
        return await self._continue_conversation(request)

    async def _handle_action_execution(self, request: ChatRequest) -> ChatResponse:
        """
        Execute a server-side action and return result.
        """
        action_id = request.action_metadata.action_identifier
        action_data = request.action_metadata.action_data

        logger.info(f"Executing action: {action_id}")

        # Route to appropriate handler
        if action_id == "create_stream":
            return await self._execute_create_stream(action_data, request.context)

        elif action_id == "update_config":
            return await self._execute_update_config(action_data, request.context)

        elif action_id == "execute_search":
            return await self._execute_search(action_data, request.context)

        elif action_id == "delete_entity":
            return await self._execute_delete(action_data, request.context)

        else:
            return ChatResponse(
                message=f"Unknown action: {action_id}",
                suggested_actions=[
                    SuggestedAction(
                        label="Close",
                        action="close",
                        handler="client"
                    )
                ]
            )

    async def _execute_create_stream(
        self,
        stream_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ChatResponse:
        """
        Create a research stream from chat data.
        """
        from services.research_stream_service import ResearchStreamService

        stream_service = ResearchStreamService(self.db)

        # Create the stream
        stream = stream_service.create_research_stream(
            user_id=self.user_id,
            stream_data=stream_data
        )

        return ChatResponse(
            message=f"✓ Successfully created '{stream.stream_name}'! "
                    f"The stream is now active and will generate {stream.report_frequency} reports.",
            suggested_actions=[
                SuggestedAction(
                    label="View Stream",
                    action="navigate",
                    handler="client",
                    data={"route": f"/research-streams/{stream.stream_id}"},
                    style="primary"
                ),
                SuggestedAction(
                    label="Run Test Report",
                    action="navigate",
                    handler="client",
                    data={"route": f"/research-streams/{stream.stream_id}/pipeline"}
                ),
                SuggestedAction(
                    label="Create Another",
                    action="restart",
                    handler="client"
                ),
                SuggestedAction(
                    label="Close",
                    action="close",
                    handler="client"
                )
            ]
        )

    async def _execute_search(
        self,
        search_data: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ChatResponse:
        """
        Execute a search with filters.
        """
        # Execute search logic here
        results = []  # Fetch results

        return ChatResponse(
            message=f"Found {len(results)} articles matching your criteria.",
            suggested_actions=[
                SuggestedAction(
                    label="View All Results",
                    action="navigate",
                    handler="client",
                    data={"route": f"/articles?filters={search_data}"},
                    style="primary"
                ),
                SuggestedAction(
                    label="Refine Search",
                    action="restart",
                    handler="client"
                )
            ],
            payload=CustomPayload(
                type="search_results",
                data={"results": results[:10], "total": len(results)}
            )
        )

    async def _continue_conversation(self, request: ChatRequest) -> ChatResponse:
        """
        Continue conversation using LLM.
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
            suggested_values=parsed.get("suggested_values"),
            suggested_actions=parsed.get("suggested_actions"),
            payload=parsed.get("payload")
        )

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """
        Build system prompt based on user's context.
        """
        current_page = context.get("current_page", "unknown")
        entity_type = context.get("entity_type")
        action = context.get("action")
        error = context.get("error")

        base_prompt = """You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        Your responses should be structured in this format:

        MESSAGE: [Your conversational response to the user]
        SUGGESTED_VALUES: [Optional comma-separated values user can select]
        SUGGESTED_ACTIONS: [Optional actions with format: label|action|handler|data]
        PAYLOAD_TYPE: [Optional payload type identifier]
        PAYLOAD: [Optional JSON payload]

        SUGGESTED_VALUES are clickable chips that send a message back to continue conversation.
        Example: SUGGESTED_VALUES: Yes, No, Tell me more

        SUGGESTED_ACTIONS are buttons that execute actions (client or server).
        Format: label|action|handler|style|data_json
        Example: SUGGESTED_ACTIONS: Accept & Create|create_stream|server|primary|{"stream_name":"..."}
        Example: SUGGESTED_ACTIONS: Close|close|client|secondary

        Client actions (no backend call): close, cancel, navigate, copy, highlight, download, restart
        Server actions (processed by backend): create_stream, update_config, execute_search, delete_entity

        The PAYLOAD is arbitrary structured data rendered by the embedding context.
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
            Ask clarifying questions, then generate:
            - SUGGESTED_ACTIONS with create_stream server action
            - PAYLOAD of type "research_stream_form" with pre-populated data
            """

        if current_page == "reports":
            base_prompt += """

            USER IS ON THE REPORTS PAGE.
            If they ask about finding/filtering reports, generate:
            - PAYLOAD of type "search_filters" with filter criteria
            - SUGGESTED_ACTIONS with execute_search server action
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

Respond with MESSAGE, optional SUGGESTED_VALUES, optional SUGGESTED_ACTIONS, and optional PAYLOAD."""

    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse LLM response to extract structured components.
        """
        import json

        result = {
            "message": "",
            "suggested_values": None,
            "suggested_actions": None,
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

            elif stripped.startswith("SUGGESTED_VALUES:"):
                values_str = stripped.replace("SUGGESTED_VALUES:", "").strip()
                if values_str:
                    result["suggested_values"] = [
                        {"label": v.strip(), "value": v.strip()}
                        for v in values_str.split(",")
                    ]

            elif stripped.startswith("SUGGESTED_ACTIONS:"):
                actions_str = stripped.replace("SUGGESTED_ACTIONS:", "").strip()
                if actions_str:
                    actions = []
                    for action_str in actions_str.split(";"):
                        parts = action_str.split("|")
                        if len(parts) >= 3:
                            action = {
                                "label": parts[0].strip(),
                                "action": parts[1].strip(),
                                "handler": parts[2].strip()
                            }
                            if len(parts) > 3:
                                action["style"] = parts[3].strip()
                            if len(parts) > 4:
                                try:
                                    action["data"] = json.loads(parts[4])
                                except:
                                    pass
                            actions.append(action)
                    result["suggested_actions"] = actions

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
                result["payload"] = {
                    "type": payload_type,
                    "data": {"raw": "\n".join(payload_lines)}
                }

        return result
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Frontend**:
- `components/ChatInterface.tsx` - Chat UI with value/action handling
- `components/SuggestedValues.tsx` - Value chips
- `components/SuggestedActions.tsx` - Action buttons
- `hooks/useChat.ts` - State management with action support
- `lib/api/chatApi.ts` - API client
- `lib/clientActions.ts` - Client-side action executor

**Backend**:
- `routers/chat.py` - Chat endpoint
- `services/chat_service.py` - Core service with action routing
- `schemas/chat.py` - Pydantic models

**Deliverable**: Basic chat with text, values, and client actions working

### Phase 2: Server Actions (Week 2)

**Backend**:
- Implement action handlers (create_stream, execute_search, etc.)
- Add action execution logging
- Error handling for failed actions

**Frontend**:
- Test server action flow end-to-end
- Add loading states for actions
- Add success/error feedback

**Deliverable**: Server actions working (create stream, search, etc.)

### Phase 3: Payload System (Week 3)

**Frontend**:
- Create payload handler registry
- Implement handlers for key payload types
- Integrate payload rendering with chat

**Backend**:
- Update LLM prompts to generate payloads
- Test payload generation for different contexts

**Deliverable**: Payloads rendering correctly for different use cases

### Phase 4: Polish (Week 4)

- Add SSE streaming support
- Improve error handling
- Add action analytics
- Performance optimization

---

## File Structure

```
frontend/src/
├── components/
│   ├── ChatInterface.tsx          [NEW] - Main chat UI
│   ├── PayloadRenderer.tsx        [NEW] - Routes payloads to handlers
│   ├── MessageBubble.tsx          [NEW] - Message display
│   ├── SuggestedValues.tsx        [NEW] - Value chips
│   └── SuggestedActions.tsx       [NEW] - Action buttons
├── hooks/
│   └── useChat.ts                 [NEW] - Chat state management
├── lib/
│   ├── api/chatApi.ts             [NEW] - API client
│   └── clientActions.ts           [NEW] - Client action executor
├── payloadHandlers/               [NEW]
│   ├── index.ts                   - Handler registry
│   ├── researchStreamForm.tsx     - Form preview handler
│   ├── searchFilters.tsx          - Search filters handler
│   └── searchResults.tsx          - Results preview handler
└── types/
    └── chat.ts                    [NEW] - Type definitions

backend/
├── routers/
│   └── chat.py                    [NEW] - Chat endpoint
├── services/
│   └── chat_service.py            [NEW] - Chat service with actions
└── schemas/
    └── chat.py                    [NEW] - Pydantic models
```

---

## Key Design Principles

1. **Clear Separation**: Values continue conversation, actions execute operations
2. **Handler Flexibility**: Client actions for UX, server actions for data
3. **Context Awareness**: Backend knows how user interacted (typed vs clicked)
4. **Action Metadata**: Full data flows through action execution
5. **Extensibility**: Easy to add new client/server actions
6. **Type Safety**: Structured action identifiers and data
7. **Error Handling**: Actions can fail gracefully
8. **Analytics**: Track interaction types and action success rates
