# AI-Guided Research Stream Creation

## Overview

An interactive chat-based system that guides users through creating a research stream configuration via conversational AI. The system combines workflow state management with LLM-powered conversation to collect all required information for a research stream.

## Core Concept

Instead of filling out a form, users have a natural conversation with an AI assistant that:
1. Asks clarifying questions
2. Makes intelligent suggestions based on domain knowledge
3. Extracts structured data from conversational responses
4. Tracks progress through required configuration fields
5. Advances to completion when all requirements are met

## Architecture

### Three-Layer Separation of Concerns

```
┌─────────────────────────────────────────┐
│  LLM (Claude)                           │
│  - Natural conversation                 │
│  - Extract data from user responses     │
│  - Provide domain-specific suggestions  │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│  Workflow Controller                    │
│  - Track which fields are complete      │
│  - Validate step requirements           │
│  - Determine next step via dependencies │
│  - Manage state transitions             │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│  Configuration State                    │
│  - stream_name                          │
│  - stream_type                          │
│  - focus_areas                          │
│  - competitors                          │
│  - report_frequency                     │
└─────────────────────────────────────────┘
```

### Responsibilities

**LLM (Conversation Layer)**
- Generates conversational responses
- Asks appropriate questions for current context
- Extracts structured data from natural language input
- Suggests therapeutic areas, companies, etc. based on domain knowledge
- Does NOT manage workflow state or determine next steps

**Workflow Controller (State Machine)**
- Maintains dependency graph of workflow steps
- Validates whether required fields are filled
- Determines which steps are available based on dependencies
- Selects next optimal step from available options
- Provides guidance to LLM about current step objectives

**Configuration State**
- Stores partially complete stream configuration
- Persisted in frontend state, sent with each request
- Updated incrementally as LLM extracts information
- Used by workflow to determine completeness

## Data Flow

### Request Flow (User Message → Response)

1. **User sends message** (e.g., "I want to track cardiovascular therapeutics")

2. **Frontend packages request:**
   - Current message
   - Full conversation history
   - Current configuration state
   - Current step identifier

3. **Backend initializes workflow:**
   - Creates workflow instance with current config & step
   - Workflow analyzes which fields are complete
   - Provides guidance for current step

4. **LLM generates response:**
   - Receives conversation history for context
   - Gets workflow guidance (what to collect, example questions)
   - Generates conversational response
   - Returns structured format:
     ```
     MESSAGE: [conversational text]
     EXTRACTED_DATA: field_name=value
     SUGGESTIONS: option1, option2, option3
     OPTIONS: checkbox1|checkbox2|checkbox3
     ```

5. **Backend parses & transitions:**
   - Extracts structured data from LLM response
   - Updates configuration with extracted fields
   - Workflow determines next step based on:
     - Dependency graph
     - Completed fields
     - Business rules
   - Returns final payload to frontend

6. **Frontend updates state:**
   - Displays conversational message to user
   - Shows suggestions/options as interactive UI
   - Updates configuration preview
   - Stores updated step for next request

## Workflow Dependency Graph

The workflow uses a **dependency-based state machine** rather than a linear sequence.

### Steps & Dependencies

```
INTRO (no dependencies)
  ↓
BUSINESS_FOCUS (requires: INTRO)
  ↓
[Flexible middle steps - can happen in any order after INTRO]
├─ STREAM_NAME (requires: INTRO)
├─ STREAM_TYPE (requires: INTRO)
├─ FOCUS_AREAS (requires: INTRO)
├─ COMPETITORS (requires: INTRO, optional for some stream types)
└─ REPORT_FREQUENCY (requires: INTRO)
  ↓
REVIEW (requires: INTRO, STREAM_NAME, STREAM_TYPE, FOCUS_AREAS, REPORT_FREQUENCY)
  ↓
COMPLETE (requires: REVIEW)
```

### Step Completion Logic

A step is "complete" when its **required fields are filled**, not when it's been "visited".

Example:
- `STREAM_NAME` is complete when `config.stream_name` exists
- `FOCUS_AREAS` is complete when `config.focus_areas` is a non-empty array
- User can provide multiple fields in one message, completing several steps at once

### Next Step Selection

The workflow determines the next step by:

1. Getting all steps whose dependencies are satisfied
2. Filtering out already-complete steps
3. Prioritizing in this order:
   - If `COMPLETE` is available → go there
   - If `REVIEW` is available → go there
   - Otherwise → first incomplete step from preferred order
4. Applying business rules (e.g., skip competitors for scientific streams)

## Required Configuration Fields

| Field              | Type          | Required | Description                                    |
|--------------------|---------------|----------|------------------------------------------------|
| stream_name        | string        | Yes      | Descriptive name for the stream                |
| stream_type        | enum          | Yes      | competitive, regulatory, clinical, market, scientific, mixed |
| focus_areas        | string[]      | Yes      | Therapeutic areas or topics to monitor         |
| report_frequency   | enum          | Yes      | daily, weekly, biweekly, monthly               |
| competitors        | string[]      | No       | Companies to monitor (if applicable)           |
| description        | string        | No       | Optional detailed description                  |

## Communication Protocol

### Server-Sent Events (SSE) Streaming

The backend streams responses in real-time using SSE:

**Status Updates:**
```json
{
  "status": "Thinking about your response...",
  "payload": {"tool": "claude_api", "step": "focus_areas"},
  "error": null
}
```

**Streaming Tokens:**
```json
{
  "token": "Hello! ",
  "status": "streaming",
  "error": null
}
```

**Final Payload:**
```json
{
  "payload": {
    "message": "Full conversational response",
    "next_step": "competitors",
    "updated_config": {...},
    "suggestions": {"therapeutic_areas": [...]},
    "options": [...]
  },
  "status": "complete",
  "error": null
}
```

### Frontend Display

- **Token streaming:** Extract and display MESSAGE portion in real-time using regex
- **Status updates:** Show loading indicator with status text
- **Suggestions:** Render as clickable chips
- **Options:** Render as checkboxes
- **Final payload:** Update configuration state and transition to next step

## Key Files

### Backend
- `backend/services/research_stream_creation_workflow.py` - Workflow state machine
- `backend/services/research_stream_chat_service.py` - LLM integration & orchestration
- `backend/routers/research_stream_chat.py` - SSE endpoint
- `backend/schemas/research_stream.py` - PartialStreamConfig schema

### Frontend
- `frontend/src/context/StreamChatContext.tsx` - Business logic & state management
- `frontend/src/lib/api/researchStreamApi.ts` - API layer
- `frontend/src/components/StreamChatInterface.tsx` - Chat UI
- `frontend/src/components/StreamConfigPreview.tsx` - Live configuration preview
- `frontend/src/pages/NewStreamChatPage.tsx` - Page container

## Example Interaction Flow

**Turn 1:**
- User: "I want to track cardiovascular therapeutics"
- System extracts: `focus_areas = ["cardiovascular therapeutics"]`
- FOCUS_AREAS step complete
- Next step: STREAM_NAME (first incomplete from preferred order)

**Turn 2:**
- LLM: "Great! How about we call this 'Cardiovascular Intelligence Stream'?"
- User: "Sounds good"
- System extracts: `stream_name = "Cardiovascular Intelligence Stream"`
- STREAM_NAME step complete
- Next step: STREAM_TYPE

**Turn 3:**
- LLM: "What type of monitoring are you interested in? Competitive intelligence, regulatory changes, clinical trials, or scientific research?"
- User: "Competitive intelligence"
- System extracts: `stream_type = "competitive"`
- STREAM_TYPE step complete
- Next step: COMPETITORS (relevant for competitive type)

**...continues until all required fields are filled...**

**Final Turn:**
- All required fields complete
- Next step: REVIEW
- LLM shows summary, asks for confirmation
- User confirms
- Next step: COMPLETE
- System creates research stream and redirects

## Suggestions vs Options

The system provides two types of interactive elements that users can engage with:

### Suggestions (Clickable Chips)

**Purpose:** Provide intelligent, context-aware recommendations that users can select with a single click.

**Behavior:**
- Displayed as clickable chips/badges below the assistant's message
- Clicking a suggestion **sends it as a new user message**
- Acts like the user typed and sent that text
- LLM receives the suggestion text and can extract data from it
- **Single-select** - clicking one sends it immediately

**Use Cases:**
- Suggesting therapeutic areas: `["Oncology", "Cardiovascular", "Immunology"]`
- Suggesting companies: `["Pfizer", "Moderna", "Johnson & Johnson"]`
- Suggesting stream names: `["Cardio Intelligence Stream", "Heart Failure Monitor"]`

**Example Flow:**
```
Assistant: "Which therapeutic areas are you interested in?"
Suggestions: [Oncology] [Cardiovascular] [Immunology] [Rare Diseases]

User clicks [Cardiovascular]
→ System sends message: "Cardiovascular"
→ LLM extracts: focus_areas = ["Cardiovascular"]
```

**Data Structure:**
```typescript
suggestions: {
  therapeutic_areas?: string[]  // Array of suggestion strings
  companies?: string[]          // Array of suggestion strings
}
```

### Options (Checkboxes)

**Purpose:** Allow users to select multiple items from a predefined list before proceeding.

**Behavior:**
- Displayed as checkboxes below the assistant's message
- User can check/uncheck multiple items
- Checking updates the configuration **immediately in state** (no message sent)
- **Multi-select** - user builds a selection, then continues conversation
- State persists until user sends next message

**Use Cases:**
- Selecting multiple focus areas from a list
- Choosing multiple competitors to monitor
- Selecting content types or report preferences

**Example Flow:**
```
Assistant: "Which of these areas should we monitor?"
Options:
☐ Heart Failure
☐ Arrhythmia
☐ Hypertension
☐ Cardiomyopathy

User checks [Heart Failure] and [Arrhythmia]
→ Config updates immediately: focus_areas = ["Heart Failure", "Arrhythmia"]
→ No message sent yet

User types: "Those look good"
→ Message sent with updated config
→ LLM sees config already has focus_areas filled
```

**Data Structure:**
```typescript
options: Array<{
  label: string    // Display text
  value: string    // Value to store in config
  checked: boolean // Current selection state
}>
```

### Key Differences Summary

| Feature | Suggestions | Options |
|---------|------------|---------|
| **UI Element** | Clickable chips/badges | Checkboxes |
| **Selection** | Single-select | Multi-select |
| **Action** | Sends message immediately | Updates state, no message |
| **Use Case** | Quick single choice | Building a list of items |
| **LLM Awareness** | LLM sees suggestion as user message | LLM sees updated config fields |
| **State Update** | Via LLM extraction from message | Direct state update on toggle |

### Implementation Details

**Suggestions Implementation:**
```typescript
// frontend/src/context/StreamChatContext.tsx
const handleSelectSuggestion = useCallback((value: string) => {
    streamChatMessage(value);  // Send as new message
}, [streamChatMessage]);
```

**Options Implementation:**
```typescript
// frontend/src/context/StreamChatContext.tsx
const handleToggleOption = useCallback((value: string) => {
    // Update config state immediately
    if (currentStep === 'focus') {
        setStreamConfig(prev => ({
            ...prev,
            focus_areas: toggleArrayItem(prev.focus_areas, value)
        }));
    }
    // Update checkbox UI state
    setMessages(prev => {
        const updated = [...prev];
        const lastMessage = updated[updated.length - 1];
        if (lastMessage.options) {
            lastMessage.options = lastMessage.options.map(opt =>
                opt.value === value ? { ...opt, checked: !opt.checked } : opt
            );
        }
        return updated;
    });
}, [currentStep]);
```

### When to Use Each

**Use Suggestions when:**
- Offering a few (3-5) quick alternatives
- User should pick one and move on
- The choice itself provides context for the next question
- Example: "What's your primary focus?" → [Oncology] [Cardiology] [Neurology]

**Use Options when:**
- User should select multiple items from a list
- Building a comprehensive list (e.g., multiple therapeutic areas)
- User needs to see their selections build up
- Example: "Which of these 10 areas are relevant?" → Checkboxes for all 10

## Design Principles

1. **Separation of Concerns:** Workflow logic ≠ Conversation logic
2. **Stateless Backend:** Each request is independent; state lives in frontend
3. **Dependency-Driven:** Next step determined by what's complete, not fixed sequence
4. **Natural Conversation:** LLM focuses on good UX, not state management
5. **Progressive Enhancement:** Collect fields incrementally, allow flexibility in order
6. **Real-time Feedback:** Stream tokens for responsive feel, show status updates
7. **Type Safety:** Strict schemas on both frontend and backend
