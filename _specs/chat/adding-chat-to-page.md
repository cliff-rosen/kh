# Chat System Architecture

This guide explains how the chat system works and how to add chat to a new page.

## Core Concepts

The chat system has four main building blocks:

| Concept | Purpose | Defined In |
|---------|---------|------------|
| **Page Config** | What context/tools/payloads are available on a page | `chat_page_config/{page}.py` |
| **Tools** | Actions the LLM can take (search, fetch data, etc.) | `tools/builtin/{category}.py` |
| **Payloads** | Structured data returned by tools for UI rendering | `schemas/payloads.py` |
| **Payload Manifest** | Tracks payloads from conversation history | Automatic |

## How It Works

```
User sends message
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  ChatStreamService builds system prompt from:               │
│                                                             │
│  1. Identity (page-specific or default)                     │
│  2. Context (what user is viewing - from context_builder)   │
│  3. Stream instructions (if applicable)                     │
│  4. Payload manifest (previous payloads in conversation)    │
│  5. Available tools (global + page + tab)                   │
│  6. Client actions (things LLM can suggest UI do)           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM processes message, may call tools                      │
│                                                             │
│  Tool returns ToolResult:                                   │
│    - text: What LLM sees                                    │
│    - payload: {type, data} for frontend rendering           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend receives response                                 │
│                                                             │
│  - Text streams to chat                                     │
│  - Payload rendered via payloadHandlers[type].render()      │
│  - Payload saved to conversation (for manifest next turn)   │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
backend/
├── services/chat_page_config/
│   ├── registry.py          # PageConfig, TabConfig, register_page()
│   ├── __init__.py           # Imports all page configs
│   ├── reports.py            # Example: reports page config
│   └── {page_name}.py        # Your new page config
├── schemas/
│   └── payloads.py           # PayloadType definitions + registry
├── tools/
│   ├── registry.py           # ToolConfig, register_tool()
│   └── builtin/
│       ├── reports.py        # Report tools
│       └── {category}.py     # Your tools
└── services/
    └── chat_stream_service.py  # Orchestrates everything

frontend/
└── src/components/chat/
    └── ChatTray.tsx          # Chat UI component
```

---

## Backend: Page Configuration

### PageConfig Structure

```python
register_page(
    page="my_page",                    # Unique page identifier
    context_builder=build_context,      # Function returning context string
    identity=CUSTOM_IDENTITY,           # Optional: custom system prompt
    tools=["tool_a", "tool_b"],         # Optional: page-wide tools (by name)
    payloads=["payload_a"],             # Optional: page-wide payloads (by name)
    tabs={                              # Optional: tab-specific config
        "tab1": TabConfig(
            tools=["tab1_tool"],
            payloads=["tab1_payload"],
            subtabs={                   # Optional: subtab-specific
                "subtab1": SubTabConfig(tools=["subtab_tool"])
            }
        )
    },
    client_actions=[                    # Optional: UI actions LLM can suggest
        ClientAction(action="navigate_to_item", description="...", parameters=["id"])
    ]
)
```

### Resolution Logic

Tools and payloads are resolved as: **global + page + tab + subtab**

- `is_global=True` on tool/payload → available everywhere
- `is_global=False` → must be listed in page/tab config

### Example Page Config

```python
# backend/services/chat_page_config/my_page.py

from typing import Dict, Any
from .registry import register_page, ClientAction

# Custom identity (optional - omit to use default)
MY_PAGE_IDENTITY = """You are an assistant helping users with...

You have access to tools that let you:
- Do X
- Do Y
"""

def build_context(context: Dict[str, Any]) -> str:
    """Tell the LLM what the user is currently viewing."""
    item_id = context.get("item_id")
    item_name = context.get("item_name")

    parts = ["Page: My Page"]
    if item_id:
        parts.append(f"Viewing: {item_name} (ID {item_id})")
    else:
        parts.append("No item selected")

    return "\n".join(parts)

register_page(
    page="my_page",
    context_builder=build_context,
    identity=MY_PAGE_IDENTITY,
    client_actions=[
        ClientAction(action="select_item", description="Select an item", parameters=["item_id"])
    ]
    # Tools are global, so not listed here
)
```

Don't forget to import in `__init__.py`:
```python
from . import my_page
```

---

## Backend: Tools

Tools are functions the LLM can call. Most tools are global (available everywhere).

### ToolConfig Structure

```python
# backend/tools/builtin/my_tools.py

from tools.registry import ToolConfig, ToolResult, register_tool

async def execute_my_tool(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> ToolResult:
    """Tool implementation."""
    item_id = params.get("item_id")

    # Do work...
    items = await some_service.get_items(item_id)

    # Return text for LLM + payload for frontend
    return ToolResult(
        text=f"Found {len(items)} items: {', '.join(i.name for i in items)}",
        payload={
            "type": "item_list",
            "data": {"items": [i.to_dict() for i in items], "total": len(items)}
        }
    )

register_tool(ToolConfig(
    name="get_items",
    description="Get items for a category",
    input_schema={
        "type": "object",
        "properties": {
            "item_id": {"type": "integer", "description": "Item ID"}
        },
        "required": ["item_id"]
    },
    executor=execute_my_tool,
    category="my_category",
    is_global=True  # Default - available on all pages
))
```

### Key Points

- Tools can be sync or async (async preferred)
- Return `ToolResult(text=..., payload=...)` for UI rendering
- Return plain string if no payload needed
- Use services, not raw DB queries

---

## Backend: Payloads

Payloads are structured data that tools return for frontend rendering.

### PayloadType Structure

```python
# backend/schemas/payloads.py

def _summarize_item_list(data: Dict[str, Any]) -> str:
    """Brief summary for payload manifest."""
    total = data.get("total", 0)
    return f"List of {total} items"

register_payload_type(PayloadType(
    name="item_list",
    description="List of items",
    source="tool",           # "tool" (common) or "llm" (parsed from LLM output)
    is_global=True,          # Available on all pages
    summarize=_summarize_item_list,  # For payload manifest
    schema={
        "type": "object",
        "properties": {
            "items": {"type": "array"},
            "total": {"type": "integer"}
        }
    }
))
```

### Payload Manifest

When a tool returns a payload, it's saved to the conversation. On subsequent turns, the LLM sees a manifest:

```
== CONVERSATION DATA ==
AVAILABLE PAYLOADS (use get_payload tool to retrieve full data):
- [abc123] List of 5 items
- [def456] Item details for "Widget"
```

The LLM can call `get_payload(payload_id="abc123")` to retrieve full data without stuffing the context.

---

## Frontend: ChatTray

The frontend renders payloads via `payloadHandlers`.

```tsx
<ChatTray
    initialContext={{
        current_page: "my_page",
        active_tab: activeTab,      // Important for tab-specific tools/payloads
        item_id: selectedItem?.id,
        item_name: selectedItem?.name,
    }}
    payloadHandlers={{
        item_list: {
            render: (payload, callbacks) => (
                <ItemListCard
                    data={payload}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: (data) => handleAccept(data),
            onReject: () => handleReject(),
        }
    }}
/>
```

### Payload Handler Options

```typescript
{
    render: (payload, callbacks) => ReactNode,  // How to display
    onAccept?: (data) => void,                   // Accept button handler
    onReject?: () => void,                       // Reject button handler
    renderOptions?: {
        panelWidth?: string,
        headerTitle?: string,
        headerIcon?: string,
    }
}
```

---

## Checklist: Adding Chat to a New Page

### Backend

1. **Create page config**: `backend/services/chat_page_config/{page}.py`
   - [ ] Define `build_context()` function
   - [ ] Define custom identity (optional)
   - [ ] Define client actions (optional)
   - [ ] Call `register_page()`

2. **Import in `__init__.py`**: `from . import {page}`

3. **Create tools** (if needed): `backend/tools/builtin/{category}.py`
   - [ ] Implement tool function (async)
   - [ ] Register with `register_tool()`
   - [ ] Return `ToolResult` with payload if frontend rendering needed

4. **Register payloads** (if tools return them): `backend/schemas/payloads.py`
   - [ ] Define `summarize` function for manifest
   - [ ] Register with `register_payload_type()`

### Frontend

5. **Add ChatTray to page component**
   - [ ] Pass `initialContext` with `current_page`, `active_tab`, relevant IDs
   - [ ] Define `payloadHandlers` for each payload type

6. **Create payload card components** (if needed)
   - [ ] Render payload data
   - [ ] Handle accept/reject actions

### Test

- [ ] Context appears correctly in diagnostics
- [ ] Tools are available (check diagnostics)
- [ ] Payloads render in chat
- [ ] Payload manifest appears on subsequent turns
