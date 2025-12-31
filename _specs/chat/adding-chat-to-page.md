# Adding Chat Tray to a New Page

This guide walks through all steps required to add the modular chat tray to a new page in the application.

## Conceptual Overview

The chat system has a clean separation of concerns. Understanding these makes the whole system clear.

### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  schemas/payloads.py (SINGLE SOURCE OF TRUTH)                    │    │
│  │                                                                   │    │
│  │  PayloadType definition including:                               │    │
│  │  - name, description, schema                                     │    │
│  │  - is_global: True/False                                        │    │
│  │  - parse_marker, parser, llm_instructions (for LLM payloads)    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                      │                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  chat_page_config/{page_name}.py                                  │    │
│  │                                                                   │    │
│  │  1. Context Builder  ──────────►  Tells Claude what the user     │    │
│  │                                   is currently looking at         │    │
│  │                                                                   │    │
│  │  2. TabConfig        ──────────►  References payloads by name    │    │
│  │     payloads=["schema_proposal"]   for each tab                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                      │                                   │
│                                      ▼                                   │
│                        chat_stream_service.py                            │
│                     (automatically uses registries)                      │
│                                      │                                   │
└──────────────────────────────────────│───────────────────────────────────┘
                                       │
                          API returns: { custom_payload: { type, data } }
                                       │
                                       ▼
┌──────────────────────────────────────│───────────────────────────────────┐
│                              FRONTEND                                    │
│                                       │                                   │
│  ┌────────────────────────────────────▼────────────────────────────┐    │
│  │  ChatTray component                                              │    │
│  │                                                                   │    │
│  │  payloadHandlers={{                                              │    │
│  │    "payload_type": {                                             │    │
│  │       render: (data) => <Card />  ◄── How to display it          │    │
│  │       onAccept: (data) => {...}   ◄── What to do when accepted   │    │
│  │    }                                                             │    │
│  │  }}                                                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### The Key Backend Pieces

| Piece | Where | Purpose |
|-------|-------|---------|
| **PayloadType** | `schemas/payloads.py` | Complete payload definition including parse_marker, parser, llm_instructions |
| **Context Builder** | `chat_page_config/{page}.py` | Tell Claude what the user is currently viewing |
| **TabConfig** | `chat_page_config/{page}.py` | Reference which payloads are available on each tab |

### The One Frontend Piece

| Piece | Purpose | Example |
|-------|---------|---------|
| **Payload Handler** | Define how to render and act on each payload type | `render: (data) => <SchemaProposalCard />`, `onAccept: (data) => applyChanges(data)` |

### Key Files

- **Payloads**: `backend/schemas/payloads.py` - Single source of truth for all payload definitions
- **Page Config**: `backend/services/chat_page_config/{page_name}.py` - Context builder and tab configurations
- **Frontend**: `payloadHandlers` prop on `<ChatTray>` - Maps payload types to render functions

That's it. The registry handles wiring everything together automatically.

---

## Step-by-Step Guide

Adding chat to a new page involves:
1. **Backend**: Define any new payload types (if needed) and page configuration
2. **Frontend**: Create payload handler components and wire up ChatTray
3. **Integration**: Connect context and handlers

---

## Backend Setup

### 1. Define Payload Types (if creating new ones)

**File**: `backend/schemas/payloads.py`

If your page needs new payload types, add them to the central registry:

```python
# For an LLM payload (Claude generates structured output)
register_payload_type(PayloadType(
    name="my_page_suggestion",
    description="Suggestions for the user's configuration",
    source="llm",
    is_global=False,  # Page-specific, must be added to page config
    parse_marker="MY_PAGE_SUGGESTION:",
    parser=make_json_parser("my_page_suggestion"),
    llm_instructions="""
MY_PAGE_SUGGESTION - Use when user asks for suggestions:

MY_PAGE_SUGGESTION: {
  "suggestions": [
    {"name": "...", "description": "...", "rationale": "..."}
  ],
  "confidence": "high",
  "reasoning": "Based on..."
}

Use this when:
- User asks "what should I add?"
- User wants recommendations
""",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {"type": "array"},
            "confidence": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))
```

**Key Points**:
- Use `make_json_parser("payload_name")` for standard JSON parsing
- `is_global=False` means it must be explicitly added to page/tab config
- `llm_instructions` tells Claude exactly when and how to use this payload

### 2. Create Page Configuration

**File**: `backend/services/chat_page_config/{page_name}.py`

```python
"""
Chat page config for the {page_name} page.

Defines context builder and tab-specific configuration.
Payload definitions are in schemas/payloads.py.
"""

from typing import Dict, Any
from .registry import TabConfig, ClientAction, register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context section for {page_name} page."""
    entity_data = context.get("entity_data", {})
    active_tab = context.get("active_tab", "default")

    return f"""The user is viewing the {page_name} page.

Current state:
- Entity: {entity_data.get('name', 'Unknown')}
- Status: {entity_data.get('status', 'Unknown')}
- Active tab: {active_tab}

CONTEXT:
Describe what the user can do on this page and how the chat can help.
"""


# =============================================================================
# Client Actions
# =============================================================================

CLIENT_ACTIONS = [
    ClientAction(
        action="close_chat",
        description="Close the chat tray"
    ),
]


# =============================================================================
# Register Page
# =============================================================================

# Option A: Page with tabs (payloads vary by tab)
register_page(
    page="{page_name}",
    context_builder=build_context,
    tabs={
        "tab1": TabConfig(
            payloads=["my_page_suggestion", "validation_feedback"],
        ),
        "tab2": TabConfig(
            payloads=["other_payload"],
        ),
    },
    client_actions=CLIENT_ACTIONS
)

# Option B: Simple page without tabs (payloads available everywhere)
register_page(
    page="{page_name}",
    context_builder=build_context,
    payloads=["my_page_suggestion", "validation_feedback"],  # Page-wide payloads
    client_actions=CLIENT_ACTIONS
)
```

**Key Points**:
- Reference payloads by name (they're defined in `schemas/payloads.py`)
- Use `tabs={}` for tab-specific configurations
- Use `payloads=[]` for page-wide payloads (available on all tabs)
- Can combine both: page-wide + tab-specific payloads

### 3. Import in Chat Page Config Package

**File**: `backend/services/chat_page_config/__init__.py`

Add import to auto-register your page:
```python
from . import {page_name}
```

That's it! No changes needed to `chat_stream_service.py` - the registry handles everything automatically.

### 4. Verify Backend Setup

```bash
python -c "
from services.chat_page_config import has_page, get_all_payloads_for_page, get_context_builder

# Verify page is registered
assert has_page('{page_name}'), 'Page not registered'

# Check payloads
payloads = get_all_payloads_for_page('{page_name}', 'tab1')
print('Payloads:', [p.name for p in payloads])

# Check context builder
builder = get_context_builder('{page_name}')
print('Context builder:', builder is not None)
"
```

---

## Frontend Setup

### 5. Create Payload Handler Components

For each payload type, create a card component.

**File**: `frontend/src/components/{PayloadType}Card.tsx`

```typescript
interface {PayloadType}Payload {
    // Define payload structure
    suggestions: Array<{
        name: string;
        description: string;
        rationale: string;
    }>;
    confidence: string;
    reasoning: string;
}

interface {PayloadType}CardProps {
    payload: {PayloadType}Payload;
    onAccept?: (data: any) => void;
    onReject?: () => void;
}

export default function {PayloadType}Card({ payload, onAccept, onReject }: {PayloadType}CardProps) {
    const handleAccept = () => {
        if (onAccept) {
            onAccept(payload);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">
                    {Payload Type Title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {payload.reasoning}
                </p>
            </div>

            {/* Content */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
                {payload.suggestions.map((s, i) => (
                    <div key={i} className="mb-2">
                        <strong>{s.name}</strong>: {s.description}
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                {onAccept && (
                    <button
                        onClick={handleAccept}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Accept
                    </button>
                )}
                {onReject && (
                    <button
                        onClick={onReject}
                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
```

### 6. Add ChatTray to Page Component

**File**: `frontend/src/pages/{PageName}.tsx`

```typescript
import { useState, useEffect } from 'react';
import ChatTray from '../components/ChatTray';
import {PayloadType}Card from '../components/{PayloadType}Card';

export default function {PageName}() {
    const [pageData, setPageData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState('tab1');

    // Load page data
    useEffect(() => {
        // Fetch data...
    }, []);

    // Define payload handlers
    const handleSuggestionAccept = (data: any) => {
        console.log('Suggestion accepted:', data);
        // Handle acceptance (e.g., update state, apply changes)
    };

    const handleSuggestionReject = () => {
        console.log('Suggestion rejected');
    };

    return (
        <div className="container">
            {/* Page content */}
            <h1>Page Title</h1>

            {/* Chat Tray */}
            <ChatTray
                initialContext={{
                    current_page: "{page_name}",
                    active_tab: activeTab,  // Important for tab-based payloads
                    entity_id: pageData?.id,
                    entity_data: {
                        name: pageData?.name,
                        status: pageData?.status,
                    }
                }}
                payloadHandlers={{
                    my_page_suggestion: {
                        render: (payload, callbacks) => (
                            <{PayloadType}Card
                                payload={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleSuggestionAccept,
                        onReject: handleSuggestionReject,
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Suggestions',
                            headerIcon: '💡'
                        }
                    },
                    // Add more payload handlers...
                }}
            />
        </div>
    );
}
```

**Important**: Pass `active_tab` in the context so the backend knows which tab-specific payloads to enable.

---

## Context Best Practices

### What to Include in Context

**Always include**:
- `current_page`: Unique identifier for the page (e.g., "streams_list")
- `active_tab`: Which tab is currently active (if using tabs)

**Include when relevant**:
- `entity_id`: ID of specific entity being edited/viewed
- Current form/schema values for edit pages
- List of entities for list pages
- User selections or filters

### Context Updates

The ChatTray automatically updates context when `initialContext` prop changes. Ensure context data is derived from state/props that update when data loads or changes.

---

## Checklist

### Backend
- [ ] Define any new payload types in `backend/schemas/payloads.py`
- [ ] Create `backend/services/chat_page_config/{page_name}.py`
- [ ] Define `build_context()` function for the page
- [ ] Register page with `register_page()` including tabs/payloads
- [ ] Import module in `backend/services/chat_page_config/__init__.py`
- [ ] Verify with Python test script

### Frontend
- [ ] Create payload card components for each payload type
- [ ] Import ChatTray and card components in page
- [ ] Add ChatTray to page JSX
- [ ] Configure `initialContext` with relevant page data (including `active_tab`)
- [ ] Register all `payloadHandlers` with render functions
- [ ] Implement `onAccept` callbacks for interactive payloads
- [ ] Test TypeScript compilation
- [ ] Test with dev server

### Testing
- [ ] Verify context is sent correctly (check network tab)
- [ ] Verify correct payloads appear for each tab
- [ ] Test each payload type generates and displays correctly
- [ ] Test accept/reject callbacks work as expected
- [ ] Test chat with empty state (before data loads)
- [ ] Test chat with loaded data

---

## Example: Working Implementations

**Edit Stream Page** (with tabs):
- Payloads: `schemas/payloads.py` - schema_proposal, validation_results, retrieval_proposal, etc.
- Config: `services/chat_page_config/edit_stream.py` - tabs for semantic, retrieval, execute
- Frontend: `pages/EditStreamPage.tsx`

**Streams List Page** (without tabs):
- Payloads: `schemas/payloads.py` - stream_suggestions, portfolio_insights, quick_setup
- Config: `services/chat_page_config/streams_list.py` - page-wide payloads
- Frontend: `pages/StreamsPage.tsx`

---

## Architecture Summary

### Single Source of Truth

**Payloads** (`schemas/payloads.py`):
- Complete definition including parse_marker, parser, llm_instructions
- `is_global=True` for payloads available everywhere
- `is_global=False` for page-specific payloads

**Tools** (`tools/registry.py`):
- `is_global=True` (default) for tools available everywhere
- `is_global=False` for page-specific tools

### Resolution Logic

Tools and payloads are resolved as: **global + page + tab**

1. Start with all global tools/payloads
2. Add page-wide tools/payloads
3. Add tab-specific tools/payloads

This means a payload defined with `is_global=False` won't appear unless explicitly added to a page or tab configuration.
