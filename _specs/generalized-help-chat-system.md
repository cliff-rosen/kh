# Generalized Help Chat System - Design Specification

## Executive Summary

This document analyzes the current StreamChatInterface architecture and proposes a generalized HelpChatInterface system that adapts its proven conversational AI patterns for general-purpose application help and support.

## Current Architecture Analysis

### Stream Building Chat System

The existing stream building chat consists of:

#### Frontend Components:
1. **StreamChatInterface.tsx** - UI component for chat display
2. **StreamChatContext.tsx** - State management provider
3. **researchStreamApi.ts** - API client with SSE streaming
4. **Types**: StreamInProgress, StreamBuildStep, UserAction, ChatMessage

#### Backend Components:
1. **research_stream_chat.py** - FastAPI router with SSE endpoint
2. **research_stream_chat_service.py** - Business logic and LLM integration
3. **research_stream_creation_workflow.py** - Workflow state machine
4. **Schemas**: StreamInProgress, StreamBuildStep, UserAction

### Key Patterns (Generalizable)

#### 1. Context Carry-Through Architecture
The system maintains rich context across the conversation:
- **Current State**: StreamInProgress (configuration being built)
- **Workflow Position**: StreamBuildStep (where user is in the flow)
- **Conversation History**: Full chat transcript
- **User Actions**: Metadata about how user interacted (clicked suggestion, typed text, toggled option)

#### 2. LLM Response Modes
The LLM categorizes each response:
- **QUESTION**: Asking clarifying questions when more info needed
- **SUGGESTION**: Presenting concrete options (single-select chips)
- **REVIEW**: Showing summary and awaiting confirmation

#### 3. User Action Types
Structured interaction tracking:
- **text_input**: User typed free text
- **option_selected**: User clicked a suggestion chip (single select)
- **options_selected**: User selected checkboxes (multi-select)
- **accept_review**: User confirmed final configuration
- **skip_step**: User wants to skip current step

#### 4. SSE Streaming Pattern
Real-time streaming with two response types:
- **StatusResponse**: Tool usage, thinking indicators
- **AgentResponse**: Token-by-token streaming + final payload

#### 5. Structured LLM Output Parsing
The LLM returns structured format:
```
MODE: [QUESTION | SUGGESTION | REVIEW]
MESSAGE: [conversational text]
TARGET_FIELD: [field being populated]
EXTRACTED_DATA: field=value
SUGGESTIONS: option1, option2, option3
OPTIONS: checkbox1|checkbox2|checkbox3
PROPOSED_MESSAGE: [button text]
```

### What's Purpose-Built for Stream Creation

1. **StreamInProgress Schema**: Specific to channels, purposes, therapeutic areas
2. **ResearchStreamCreationWorkflow**: Hardcoded steps (exploration → channels → review)
3. **System Prompts**: Focus on biomedical research, competitive intelligence
4. **Field Validation**: Specific to stream configuration (channel structure, frequency options)
5. **Final Action**: Creates a ResearchStream database record

---

## Generalized Help Chat System Design

### Design Principles

1. **Topic-Agnostic**: Works for any help topic (navigation, configuration, troubleshooting)
2. **Context-Aware**: Carries user's current location, selected entities, recent actions
3. **Action-Oriented**: Can guide users through multi-step processes
4. **Adaptive**: Learns from user's expertise level and preferences

### Core Abstractions

#### 1. HelpContext (replaces StreamInProgress)
Flexible key-value store for conversation context:
```typescript
interface HelpContext {
    // User's current location in app
    current_page?: string;          // e.g., "reports", "research_streams", "home"
    current_entity_type?: string;   // e.g., "report", "research_stream", "article"
    current_entity_id?: number;     // ID of entity user is viewing

    // User's stated intent
    user_goal?: string;             // e.g., "create research stream", "find article", "fix error"
    help_topic?: HelpTopic;         // Category of help

    // Collected information during conversation
    preferences?: Record<string, any>;   // User preferences discovered
    filters?: Record<string, any>;       // Search/filter criteria
    steps_completed?: string[];          // Multi-step process tracking

    // Error context (if user is troubleshooting)
    error_message?: string;
    error_context?: Record<string, any>;

    // Arbitrary metadata for extensibility
    metadata?: Record<string, any>;
}
```

#### 2. HelpTopic (replaces StreamBuildStep)
Categories of help the system can provide:
```typescript
enum HelpTopic {
    // Navigation & Discovery
    GENERAL = 'general',              // Initial greeting, unclear intent
    NAVIGATION = 'navigation',        // "How do I get to...?"
    SEARCH = 'search',                // "How do I find...?"

    // Feature Guidance
    FEATURE_OVERVIEW = 'feature_overview',     // "What can I do with...?"
    STEP_BY_STEP = 'step_by_step',            // Guided workflows
    CONFIGURATION = 'configuration',           // Settings and preferences

    // Troubleshooting
    TROUBLESHOOTING = 'troubleshooting',      // "Why isn't this working?"
    ERROR_RESOLUTION = 'error_resolution',    // Specific error help

    // Data Operations
    DATA_IMPORT = 'data_import',
    DATA_EXPORT = 'data_export',
    DATA_ANALYSIS = 'data_analysis',

    // Account & Settings
    ACCOUNT = 'account',
    PERMISSIONS = 'permissions',
    INTEGRATIONS = 'integrations'
}
```

#### 3. HelpIntent (new concept)
What the user is trying to accomplish:
```typescript
interface HelpIntent {
    type: 'question' | 'task' | 'troubleshoot' | 'learn';
    confidence: number;              // 0-1, how confident we are about intent
    keywords: string[];              // Extracted keywords
    entities_mentioned: string[];    // Entities user mentioned
}
```

#### 4. HelpAction (extends UserAction)
Actions the system can execute:
```typescript
enum HelpActionType {
    // User interaction (inherited)
    TEXT_INPUT = 'text_input',
    OPTION_SELECTED = 'option_selected',
    OPTIONS_SELECTED = 'options_selected',

    // System actions (new)
    NAVIGATE = 'navigate',           // Direct user to page
    EXECUTE_SEARCH = 'execute_search', // Run search with criteria
    APPLY_FILTER = 'apply_filter',   // Apply filters to current view
    OPEN_MODAL = 'open_modal',       // Open specific modal/dialog
    HIGHLIGHT_ELEMENT = 'highlight_element', // Show tooltip on UI element
    EXECUTE_ACTION = 'execute_action', // Perform action on behalf of user
}

interface HelpAction {
    type: HelpActionType;
    target?: string;                 // Target page, element, or entity
    payload?: Record<string, any>;   // Action-specific data
    display_message?: string;        // Message to show user
}
```

---

## System Architecture

### Frontend Components

#### 1. HelpChatInterface.tsx
**Purpose**: Generic chat UI for help interactions

**Location**: `frontend/src/components/HelpChatInterface.tsx`

**Key Features**:
- Renders messages with markdown support
- Displays suggestion chips (single-select)
- Displays checkbox options (multi-select)
- Displays action buttons (navigation, execution)
- Shows status indicators (thinking, searching, executing)
- Supports rich message types (text, links, code blocks, images)

**Props**:
```typescript
interface HelpChatInterfaceProps {
    initialContext?: Partial<HelpContext>;  // Pre-populate context
    onNavigate?: (path: string) => void;    // Navigate callback
    onExecuteAction?: (action: HelpAction) => void; // Action callback
    className?: string;
}
```

**Differences from StreamChatInterface**:
- No hardcoded "Research Stream Assistant" title - dynamic based on topic
- Support for action buttons (not just accept/review)
- Support for navigation suggestions
- Code block rendering for technical help
- Screenshot/image support for visual guidance

#### 2. HelpChatContext.tsx
**Purpose**: State management for help conversations

**Location**: `frontend/src/context/HelpChatContext.tsx`

**State**:
```typescript
interface HelpChatContextType {
    // Conversation state
    messages: ChatMessage[];
    helpContext: HelpContext;
    currentTopic: HelpTopic;
    isLoading: boolean;
    error: string | null;
    statusMessage: string | null;

    // Response metadata
    responseMode: 'QUESTION' | 'SUGGESTION' | 'ANSWER' | null;
    targetField: string | null;
    suggestedActions: HelpAction[];

    // User actions
    sendMessage: (content: string, userAction?: UserAction) => Promise<void>;
    selectSuggestion: (value: string) => void;
    toggleOption: (value: string) => void;
    executeAction: (action: HelpAction) => Promise<void>;
    updateContext: (updates: Partial<HelpContext>) => void;
    resetChat: () => void;

    // Navigation integration
    navigateTo: (path: string) => void;
}
```

**Key Differences**:
- `helpContext` instead of `streamConfig`
- `currentTopic` instead of `currentStep`
- `suggestedActions` for executable actions
- `executeAction` method for system actions

#### 3. helpApi.ts
**Purpose**: API client for help chat

**Location**: `frontend/src/lib/api/helpApi.ts`

**Key Types**:
```typescript
export interface HelpChatRequest {
    message: string;
    help_context: HelpContext;
    current_topic: HelpTopic;
    conversation_history: ApiMessage[];
    user_action?: UserAction;
}

export interface HelpChatPayload {
    message: string;
    mode: 'QUESTION' | 'SUGGESTION' | 'ANSWER';
    target_field: string | null;
    updated_context: HelpContext;
    next_topic: HelpTopic;
    suggestions?: Suggestion[];
    options?: MultiSelectOption[];
    actions?: HelpAction[];         // NEW: Executable actions
    proposed_message?: string;
}

export interface HelpAgentResponse {
    token: string | null;
    response_text: string | null;
    payload: HelpChatPayload | null;
    status: string | null;
    error: string | null;
    debug: string | object | null;
}
```

**API Methods**:
```typescript
export const helpApi = {
    /**
     * Stream help chat messages
     */
    streamChatMessage: async function* (
        request: HelpChatRequest
    ): AsyncGenerator<HelpAgentResponse> {
        // SSE streaming implementation
    },

    /**
     * Execute a help action (navigate, search, etc.)
     */
    executeHelpAction: async (action: HelpAction): Promise<{
        success: boolean;
        result?: any;
        error?: string;
    }> {
        // Execute action and return result
    }
}
```

### Backend Components

#### 1. help_chat.py (Router)
**Purpose**: FastAPI endpoint for help chat

**Location**: `backend/routers/help_chat.py`

**Endpoints**:
```python
@router.post("/api/help/chat/stream")
async def chat_stream_for_help(
    request: HelpChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    Stream help chat responses using Server-Sent Events.

    Returns:
        SSE stream with HelpAgentResponse or HelpStatusResponse
    """

@router.post("/api/help/execute-action")
async def execute_help_action(
    action: HelpAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Execute a help action (navigate, search, filter, etc.)

    Returns:
        Action result or error
    """
```

**Schemas**:
```python
class HelpChatRequest(BaseModel):
    message: str
    help_context: HelpContext
    current_topic: HelpTopic
    conversation_history: List[ApiMessage]
    user_action: Optional[UserAction] = None

class HelpChatPayload(BaseModel):
    message: str
    mode: Literal["QUESTION", "SUGGESTION", "ANSWER"]
    target_field: Optional[str] = None
    updated_context: HelpContext
    next_topic: HelpTopic
    suggestions: Optional[List[Suggestion]] = None
    options: Optional[List[MultiSelectOption]] = None
    actions: Optional[List[HelpAction]] = None
    proposed_message: Optional[str] = None
```

#### 2. help_chat_service.py (Service)
**Purpose**: Business logic and LLM integration for help

**Location**: `backend/services/help_chat_service.py`

**Key Methods**:
```python
class HelpChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def stream_chat_message(
        self,
        message: str,
        help_context: HelpContext,
        current_topic: HelpTopic,
        conversation_history: List[Dict],
        user_action: Optional[UserAction] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream help response with SSE updates.
        """

    def _build_system_prompt(
        self,
        current_topic: HelpTopic,
        help_context: HelpContext
    ) -> str:
        """
        Build system prompt based on help topic and context.
        Topic-specific prompts provide domain knowledge.
        """

    def _build_user_prompt(
        self,
        message: str,
        help_context: HelpContext
    ) -> str:
        """
        Build user prompt with context.
        """

    def _parse_llm_response(
        self,
        response_text: str
    ) -> Dict[str, Any]:
        """
        Parse LLM response for structured data.
        Extracts MODE, MESSAGE, EXTRACTED_DATA, SUGGESTIONS, OPTIONS, ACTIONS.
        """

    def _classify_intent(
        self,
        message: str,
        help_context: HelpContext
    ) -> HelpIntent:
        """
        Use LLM to classify user's intent.
        Determines if this is a question, task, troubleshooting, or learning.
        """

    def _determine_topic(
        self,
        intent: HelpIntent,
        help_context: HelpContext
    ) -> HelpTopic:
        """
        Determine appropriate help topic based on intent and context.
        """

    async def execute_action(
        self,
        action: HelpAction,
        user_id: int
    ) -> Dict[str, Any]:
        """
        Execute a help action (search, navigate, filter, etc.)
        """
```

#### 3. help_topic_prompts.py (new)
**Purpose**: Topic-specific system prompts

**Location**: `backend/services/help_topic_prompts.py`

**Structure**:
```python
class HelpTopicPrompts:
    """
    Provides specialized system prompts for different help topics.
    Each topic has domain-specific knowledge and guidance patterns.
    """

    @staticmethod
    def get_prompt_for_topic(topic: HelpTopic, context: HelpContext) -> str:
        """Get specialized prompt for a help topic."""
        prompts = {
            HelpTopic.NAVIGATION: HelpTopicPrompts._navigation_prompt,
            HelpTopic.SEARCH: HelpTopicPrompts._search_prompt,
            HelpTopic.FEATURE_OVERVIEW: HelpTopicPrompts._feature_overview_prompt,
            HelpTopic.STEP_BY_STEP: HelpTopicPrompts._step_by_step_prompt,
            HelpTopic.TROUBLESHOOTING: HelpTopicPrompts._troubleshooting_prompt,
            # ... more topics
        }
        return prompts.get(topic, HelpTopicPrompts._general_prompt)(context)

    @staticmethod
    def _navigation_prompt(context: HelpContext) -> str:
        current_page = context.get('current_page', 'unknown')
        return f"""You are a navigation assistant for Knowledge Horizon.

        User is currently on: {current_page}

        Your role is to help users navigate to the right place in the application.

        Available pages and their purposes:
        - /home: Dashboard with stream overview
        - /research-streams: Manage research streams
        - /reports: View generated reports
        - /articles: Search and manage articles
        - /pipeline: Test and execute pipelines
        - /settings: User preferences and configuration

        When providing navigation help:
        1. Understand what the user wants to accomplish
        2. Suggest the appropriate page(s)
        3. Provide ACTIONS with type=NAVIGATE and target=/path
        4. Explain what they can do on that page

        MODE: SUGGESTION with ACTIONS
        ACTIONS: navigate|/path|Display text for button
        """

    @staticmethod
    def _search_prompt(context: HelpContext) -> str:
        entity_type = context.get('current_entity_type', 'articles')
        return f"""You are a search assistant for Knowledge Horizon.

        User wants to search for: {entity_type}

        Your role is to help construct effective search queries and filters.

        Available search capabilities:
        - Articles: By title, author, journal, keywords, date range, PMID, DOI
        - Reports: By stream, date range, read status
        - Research Streams: By name, purpose, frequency

        When helping with search:
        1. Understand what the user is looking for
        2. Extract search criteria from their natural language
        3. Suggest filters and keywords
        4. Provide ACTIONS with type=EXECUTE_SEARCH and criteria

        MODE: SUGGESTION with ACTIONS
        ACTIONS: execute_search|{{filters}}|Search with these criteria
        EXTRACTED_DATA: search_query=..., filters={{...}}
        """

    @staticmethod
    def _troubleshooting_prompt(context: HelpContext) -> str:
        error_msg = context.get('error_message', 'Unknown error')
        error_ctx = context.get('error_context', {})
        return f"""You are a troubleshooting assistant for Knowledge Horizon.

        User encountered an issue:
        Error: {error_msg}
        Context: {error_ctx}

        Your role is to diagnose and resolve issues.

        Common issues and solutions:
        - Pipeline failures: Check query syntax, API limits, permissions
        - Search not working: Verify filters, check data availability
        - Can't create stream: Ensure all required fields filled

        Troubleshooting approach:
        1. Acknowledge the problem
        2. Ask clarifying questions if needed
        3. Provide step-by-step resolution
        4. Offer ACTIONS to execute fixes if possible

        MODE: QUESTION → SUGGESTION with step-by-step guidance
        """

    # ... more topic-specific prompts
```

#### 4. help_action_executor.py (new)
**Purpose**: Execute help actions on behalf of user

**Location**: `backend/services/help_action_executor.py`

```python
class HelpActionExecutor:
    """
    Executes help actions that modify application state.
    """

    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id

    async def execute(self, action: HelpAction) -> Dict[str, Any]:
        """
        Execute a help action and return result.
        """
        handlers = {
            HelpActionType.NAVIGATE: self._execute_navigate,
            HelpActionType.EXECUTE_SEARCH: self._execute_search,
            HelpActionType.APPLY_FILTER: self._execute_apply_filter,
            HelpActionType.EXECUTE_ACTION: self._execute_custom_action,
        }

        handler = handlers.get(action.type)
        if not handler:
            return {"success": False, "error": f"Unknown action type: {action.type}"}

        return await handler(action)

    async def _execute_search(self, action: HelpAction) -> Dict:
        """Execute a search based on extracted criteria."""
        criteria = action.payload or {}
        entity_type = criteria.get('entity_type', 'articles')

        if entity_type == 'articles':
            # Use article search service
            results = await self._search_articles(criteria)
        elif entity_type == 'reports':
            results = await self._search_reports(criteria)
        # ... more entity types

        return {
            "success": True,
            "result": results,
            "message": f"Found {len(results)} {entity_type}"
        }

    # ... more execution methods
```

---

## Context Carry-Through Design

### What Context Travels Through the System

#### Request Flow (Frontend → Backend):
1. **User Message**: What user typed/selected
2. **HelpContext**: Current state (page, entity, goal, metadata)
3. **Current Topic**: Which help category we're in
4. **Conversation History**: Full chat transcript
5. **User Action**: How user interacted (text vs selection vs action)

#### Response Flow (Backend → Frontend):
1. **Message**: LLM's conversational response
2. **Mode**: QUESTION | SUGGESTION | ANSWER
3. **Updated Context**: Any extracted data merged into context
4. **Next Topic**: Where conversation should go next
5. **Suggestions/Options**: UI elements to display
6. **Actions**: Executable actions user can trigger

### Context Updates During Conversation

#### Example Flow: "How do I find articles about melanocortin?"

**Initial State**:
```typescript
helpContext = {
    current_page: "home"
}
currentTopic = "general"
```

**User**: "How do I find articles about melanocortin?"

**Backend Processing**:
1. Classify intent → `{ type: 'task', confidence: 0.9 }`
2. Determine topic → `HelpTopic.SEARCH`
3. Extract data → `{ search_query: 'melanocortin', entity_type: 'articles' }`

**Response**:
```json
{
    "mode": "SUGGESTION",
    "message": "I can help you search for articles about melanocortin. Here are your options:",
    "updated_context": {
        "current_page": "home",
        "user_goal": "find articles about melanocortin",
        "help_topic": "search",
        "search_query": "melanocortin",
        "entity_type": "articles"
    },
    "next_topic": "search",
    "suggestions": [
        { "label": "Search all articles", "value": "search_all" },
        { "label": "Search within a specific stream", "value": "search_stream" }
    ],
    "actions": [
        {
            "type": "execute_search",
            "payload": { "query": "melanocortin", "entity_type": "articles" },
            "display_message": "Search for melanocortin articles now"
        },
        {
            "type": "navigate",
            "target": "/articles?q=melanocortin",
            "display_message": "Go to articles page with search"
        }
    ]
}
```

**User clicks**: "Search for melanocortin articles now"

**New State**:
```typescript
helpContext = {
    current_page: "home",  // Or "articles" after navigation
    user_goal: "find articles about melanocortin",
    help_topic: "search",
    search_query: "melanocortin",
    entity_type: "articles",
    search_results: [...],  // Populated by action execution
    filters: { query: "melanocortin" }
}
currentTopic = "search"
```

**Response**:
```json
{
    "mode": "ANSWER",
    "message": "I found 47 articles about melanocortin. The results are displayed on the articles page. Would you like to refine your search with additional filters?",
    "updated_context": { /* same as above */ },
    "next_topic": "search",
    "suggestions": [
        { "label": "Add date filter", "value": "add_date_filter" },
        { "label": "Filter by journal", "value": "filter_journal" },
        { "label": "This is what I needed", "value": "done" }
    ]
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

#### Frontend Files to Create:
1. `frontend/src/types/help-chat.ts` - Core type definitions
2. `frontend/src/components/HelpChatInterface.tsx` - Chat UI component
3. `frontend/src/context/HelpChatContext.tsx` - State management
4. `frontend/src/lib/api/helpApi.ts` - API client

#### Backend Files to Create:
1. `backend/schemas/help_chat.py` - Pydantic models
2. `backend/routers/help_chat.py` - FastAPI endpoint
3. `backend/services/help_chat_service.py` - Core service
4. `backend/services/help_topic_prompts.py` - Topic-specific prompts

**Deliverable**: Basic help chat with GENERAL topic working end-to-end

### Phase 2: Topic Specialization (Week 2)

#### Backend Enhancements:
1. Implement topic-specific prompts for:
   - Navigation
   - Search
   - Feature Overview
   - Troubleshooting

#### Frontend Enhancements:
1. Add action button rendering
2. Add navigation integration
3. Add search integration

**Deliverable**: Help chat can handle navigation and search queries

### Phase 3: Action Execution (Week 3)

#### Backend Files to Create:
1. `backend/services/help_action_executor.py` - Action executor
2. Add execute action endpoint to router

#### Frontend Enhancements:
1. Implement `executeAction` in context
2. Add action confirmation UI
3. Add action result display

**Deliverable**: Help chat can execute actions (navigate, search, filter)

### Phase 4: Advanced Features (Week 4)

1. **Context Awareness**: Auto-populate context from URL/page
2. **Visual Guidance**: Highlight UI elements, show screenshots
3. **Step-by-Step Workflows**: Multi-step guided processes
4. **Error Integration**: Auto-trigger help when errors occur
5. **Analytics**: Track help usage, common questions

---

## File Structure Summary

### Frontend Files

```
frontend/src/
├── components/
│   └── HelpChatInterface.tsx          [NEW]
├── context/
│   └── HelpChatContext.tsx            [NEW]
├── lib/api/
│   └── helpApi.ts                     [NEW]
└── types/
    ├── help-chat.ts                   [NEW] - ChatMessage, HelpContext, HelpTopic
    └── help-actions.ts                [NEW] - HelpAction, HelpIntent
```

### Backend Files

```
backend/
├── routers/
│   └── help_chat.py                   [NEW]
├── services/
│   ├── help_chat_service.py           [NEW]
│   ├── help_topic_prompts.py          [NEW]
│   └── help_action_executor.py        [NEW]
└── schemas/
    └── help_chat.py                   [NEW]
```

---

## Key Differences from Stream Building

| Aspect | Stream Building | Generalized Help |
|--------|----------------|------------------|
| **Purpose** | Create research stream config | General app help & support |
| **State Object** | StreamInProgress (fixed schema) | HelpContext (flexible key-value) |
| **Workflow** | Linear steps (exploration → channels → review) | Dynamic topic switching |
| **LLM Focus** | Domain-specific (biomedical research) | App functionality & navigation |
| **End Result** | Database record created | User gets answer/completes task |
| **User Actions** | Select options, type data | + Navigate, execute searches, apply filters |
| **Response Modes** | QUESTION, SUGGESTION, REVIEW | QUESTION, SUGGESTION, ANSWER |
| **Context Sources** | User conversation only | Conversation + page location + error state |
| **Extensibility** | Purpose-built, hard to extend | Designed for easy topic addition |

---

## Advantages of Generalized System

1. **Reusable Infrastructure**: SSE streaming, state management, LLM parsing all reused
2. **Consistent UX**: Same interaction patterns across different help topics
3. **Easy Extension**: Add new help topics by adding prompts, no code changes
4. **Context-Rich**: Can leverage user's current location and actions
5. **Action-Oriented**: Can execute tasks on behalf of user, not just answer questions
6. **Scalable**: Can handle any app feature as topic library grows
7. **Intelligent Routing**: Automatically determines appropriate help topic
8. **Multi-Modal**: Supports questions, tasks, troubleshooting, learning

---

## Example Prompts for Different Topics

### Navigation Topic
**User**: "Where do I create a new research stream?"

**System Response**:
```
MODE: SUGGESTION
MESSAGE: You can create a new research stream from the Research Streams page. Would you like me to take you there?
ACTIONS: navigate|/research-streams|Go to Research Streams
```

### Search Topic
**User**: "Find articles by John Smith published in 2024"

**System Response**:
```
MODE: SUGGESTION
MESSAGE: I'll search for articles by John Smith from 2024.
EXTRACTED_DATA: author=John Smith, year=2024
ACTIONS: execute_search|{"author": "John Smith", "year": 2024}|Search now
```

### Troubleshooting Topic
**User**: "The pipeline failed with 'no results found'"

**System Response**:
```
MODE: QUESTION
MESSAGE: I see the pipeline returned no results. This usually means:
1. The query might be too restrictive
2. The date range might be outside available data
3. The search terms might not match any articles

Can you share the query you used?
```

### Feature Overview Topic
**User**: "What's the pipeline analytics feature?"

**System Response**:
```
MODE: ANSWER
MESSAGE: Pipeline Analytics shows detailed metrics about how your test runs performed:

- **Retrieval Stats**: How many articles were retrieved from each source
- **Deduplication**: How many duplicates were found
- **Filter Performance**: Pass/reject rates for semantic filters
- **Category Distribution**: How articles were categorized

You can access it from any TEST report by clicking "Pipeline Analytics".
ACTIONS: navigate|/reports|View your reports
```

---

## Integration Points

### 1. Global Help Button
Add help button to app shell that opens HelpChatInterface with auto-populated context:
```typescript
<HelpChatInterface
    initialContext={{
        current_page: currentPath,
        current_entity_type: entityType,
        current_entity_id: entityId
    }}
/>
```

### 2. Contextual Help Triggers
Trigger help automatically in certain situations:
- User gets an error → Open help with error context
- User hovers on "?" icon → Show quick help
- User clicks "Get Help" in empty states

### 3. Error Boundary Integration
Catch errors and offer help:
```typescript
<ErrorBoundary
    fallback={(error) => (
        <HelpChatInterface
            initialContext={{
                help_topic: 'troubleshooting',
                error_message: error.message,
                error_context: { stack: error.stack }
            }}
        />
    )}
>
    <App />
</ErrorBoundary>
```

---

## Success Metrics

1. **Help Resolution Rate**: % of help sessions that end with user getting answer
2. **Action Execution Rate**: % of help sessions where user executes suggested action
3. **Topic Distribution**: Which help topics are most used
4. **Average Session Length**: Time from opening help to resolution
5. **Escalation Rate**: % of help sessions that require human support

---

## Future Enhancements

1. **Voice Interface**: Audio input/output for help
2. **Visual Guidance**: Animated arrows pointing to UI elements
3. **Video Tutorials**: Generated screen recordings
4. **Personalization**: Learn user's expertise level
5. **Proactive Help**: Offer help before user asks
6. **Multi-Language**: Support multiple languages
7. **Offline Help**: Cached responses for common questions
8. **Help Analytics Dashboard**: Admin view of help usage patterns
