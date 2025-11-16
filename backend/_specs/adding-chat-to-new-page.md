# Adding Chat Tray to a New Page

This guide walks through all steps required to add the modular chat tray to a new page in the application.

## Overview

Adding chat to a new page involves:
1. **Backend**: Define payload types and context for the page
2. **Frontend**: Create payload handler components and wire up ChatTray
3. **Integration**: Connect context and handlers

---

## Backend Setup

### 1. Create Page Payload Configuration

**File**: `backend/services/chat_payloads/{page_name}.py`

```python
"""
Payload configurations for the {page_name} page.
Defines all payload types and context builder this page supports.
"""

import json
import logging
from typing import Dict, Any
from .registry import PayloadConfig, register_page

logger = logging.getLogger(__name__)


def parse_example_payload(text: str) -> Dict[str, Any]:
    """Parse EXAMPLE_PAYLOAD JSON from LLM response."""
    try:
        data = json.loads(text.strip())
        return {
            "type": "example_payload",
            "data": data
        }
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse EXAMPLE_PAYLOAD JSON: {e}")
        return None


# Define payload configurations
PAGE_PAYLOADS = [
    PayloadConfig(
        type="example_payload",
        parse_marker="EXAMPLE_PAYLOAD:",
        parser=parse_example_payload,
        llm_instructions="""
        EXAMPLE_PAYLOAD - Description of when to use this:

        EXAMPLE_PAYLOAD: {
          "field1": "value",
          "field2": ["array", "values"]
        }

        Use this when:
        - User asks for X
        - User wants Y
        """
    ),
    # Add more payload types as needed
]


def build_context(context: Dict[str, Any]) -> str:
    """Build context section for {page_name} page."""
    # Extract relevant data from context
    entity_data = context.get("entity_data", {})

    return f"""The user is viewing the {page_name} page.

    Current state:
    - Entity: {entity_data.get('name', 'Unknown')}
    - Status: {entity_data.get('status', 'Unknown')}

    CONTEXT:
    Describe what the user can do on this page and how the chat can help.
    """


# Register page configuration on module import
register_page("{page_name}", PAGE_PAYLOADS, build_context)
```

**Key Points**:
- Each payload needs: type, parse_marker, parser function, LLM instructions
- Parser returns `{"type": "...", "data": {...}}` or None on error
- LLM instructions tell Claude when and how to use this payload type
- Context builder is a function that takes context dict and returns a formatted string
- `register_page` registers both payloads AND context builder together

### 2. Import in Chat Payloads Package

**File**: `backend/services/chat_payloads/__init__.py`

Add import to auto-register your page:
```python
from . import {page_name}
```

That's it! No changes needed to `general_chat_service.py` - the registry handles everything automatically.

---

## Frontend Setup

### 5. Create Payload Handler Components

For each payload type, create a card component.

**File**: `frontend/src/components/{PayloadType}Card.tsx`

```typescript
interface {PayloadType}Payload {
    // Define payload structure
    field1: string;
    field2: string[];
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
                    {Description}
                </p>
            </div>

            {/* Content */}
            <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
                {/* Display payload data */}
                <p>{payload.field1}</p>
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
// Import other payload cards...

export default function {PageName}() {
    const [pageData, setPageData] = useState<any>(null);

    // Load page data
    useEffect(() => {
        // Fetch data...
    }, []);

    // Define payload handlers as named functions
    const handleExamplePayloadAccept = (data: any) => {
        console.log('Payload accepted:', data);
        // Handle acceptance (e.g., update state, navigate)
    };

    const handleExamplePayloadReject = () => {
        console.log('Payload rejected');
    };

    return (
        <div className="container">
            {/* Page content */}
            <h1>Page Title</h1>

            {/* Chat Tray */}
            <ChatTray
                initialContext={{
                    current_page: "{page_name}",
                    entity_type: "{entity_type}",
                    entity_id: pageData?.id,
                    // Add relevant context data that updates when pageData changes
                    entity_data: {
                        name: pageData?.name,
                        status: pageData?.status,
                        // ... other fields the backend needs
                    }
                }}
                payloadHandlers={{
                    example_payload: {
                        render: (payload, callbacks) => (
                            <{PayloadType}Card
                                payload={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleExamplePayloadAccept,
                        onReject: handleExamplePayloadReject,
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Custom Title',
                            headerIcon: '🎯'
                        }
                    },
                    // Add more payload handlers...
                }}
            />
        </div>
    );
}
```

**Best Practice**: Define handler functions as named functions at the component level rather than inline. This improves:
- **Readability**: Config stays clean and scannable
- **Debuggability**: Named functions appear in stack traces
- **Testability**: Can unit test handlers independently
- **Maintainability**: Logic changes don't clutter config structure

---

## Context Best Practices

### What to Include in Context

**Always include**:
- `current_page`: Unique identifier for the page (e.g., "streams_list")
- `entity_type`: Type of entity being viewed (e.g., "research_stream", "report")

**Include when relevant**:
- `entity_id`: ID of specific entity being edited/viewed
- Current form/schema values for edit pages
- List of entities for list pages
- Active tab/section for multi-tab pages
- User selections or filters

**Example - Edit Page**:
```typescript
initialContext={{
    current_page: "edit_stream",
    entity_type: "research_stream",
    entity_id: stream.id,
    current_schema: {
        stream_name: form.stream_name,
        purpose: form.purpose,
        // ... other form fields
    }
}}
```

**Example - List Page**:
```typescript
initialContext={{
    current_page: "reports_list",
    entity_type: "reports",
    reports: reports.map(r => ({
        id: r.id,
        title: r.title,
        status: r.status,
        created_at: r.created_at
    }))
}}
```

### Context Updates

The ChatTray automatically updates context when `initialContext` prop changes. Ensure context data is derived from state/props that update when data loads or changes.

---

## Checklist

### Backend
- [ ] Create `backend/services/chat_payloads/{page_name}.py`
- [ ] Define all payload types with parsers and LLM instructions
- [ ] Define `build_context()` function for the page
- [ ] Register page with `register_page("{page_name}", PAYLOADS, build_context)`
- [ ] Import module in `backend/services/chat_payloads/__init__.py`
- [ ] Test: `python -c "from services.chat_payloads import get_page_payloads, get_page_context_builder; print(get_page_payloads('{page_name}')); print(get_page_context_builder('{page_name}'))"`

### Frontend
- [ ] Create payload card components for each payload type
- [ ] Import ChatTray and card components in page
- [ ] Add ChatTray to page JSX
- [ ] Configure `initialContext` with relevant page data
- [ ] Register all `payloadHandlers` with render functions
- [ ] Implement `onAccept` callbacks for interactive payloads
- [ ] Set appropriate `renderOptions` (panel width, title, icon)
- [ ] Test TypeScript compilation
- [ ] Test with dev server

### Testing
- [ ] Verify context is sent correctly (check network tab)
- [ ] Verify LLM receives all payload type instructions in prompt
- [ ] Test each payload type generates and displays correctly
- [ ] Test accept/reject callbacks work as expected
- [ ] Test chat with empty state (before data loads)
- [ ] Test chat with loaded data

---

## Example: Working Implementations

**Streams List Page**:
- Backend: `backend/services/chat_payloads/streams_list.py`
- Frontend: `frontend/src/pages/StreamsPage.tsx`
- Complete example with 3 payload types (suggestions, insights, quick_setup)

**Edit Stream Page**:
- Backend: `backend/services/chat_payloads/edit_stream.py`
- Frontend: `frontend/src/pages/EditStreamPage.tsx`
- Complete example with 3 payload types (schema_proposal, validation_results, import_suggestions)

Key payload types to consider for common page patterns:

**List Pages**: suggestions, insights, bulk_actions, filters_help
**Edit Pages**: validation_results, field_suggestions, templates, import_options
**Detail Pages**: analysis, recommendations, export_options, related_items
**Dashboard Pages**: insights, trends, alerts, quick_actions

---

## Architecture Notes

### Backend - Fully Modular
- **Self-contained pages**: Each page configuration lives in `services/chat_payloads/{page_name}.py`
- **Registry-based**: All page configurations are automatically discovered and registered
- **Zero core changes**: Adding a new page NEVER requires modifying `general_chat_service.py`
- **Context builders included**: Each page defines its own context builder function
- **Automatic routing**: The service automatically finds and uses the right context builder

### Frontend - Reusable Components
- **Payload cards**: Reusable UI components for each payload type
- **Generic ChatTray**: No page-specific logic, completely configurable
- **Type-safe**: TypeScript interfaces ensure payload structure matches
- **Flexible handlers**: Pages can override accept/reject behavior per payload type

### Benefits
- **Scalable**: Add 100 pages without bloating core services
- **Maintainable**: Page logic stays with page configurations
- **Testable**: Each page configuration can be tested independently
- **Clear ownership**: One file per page contains all chat-related logic for that page
