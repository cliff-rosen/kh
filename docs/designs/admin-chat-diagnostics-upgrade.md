# Admin Chat Diagnostics Upgrade Design

> Saved: 2026-02-01

## Overview

Upgrade the admin ConversationList to match the rich diagnostic features available in the chat tray's DiagnosticsPanel.

## Current State

### DiagnosticsPanel (Chat Tray) - 1360 lines, feature-rich:
- 3 tabs: Messages, Config, Metrics
- Rich content block rendering (text, tool_use, tool_result with proper styling)
- Collapsible sections with fullscreen buttons
- Iteration cards with input/response/tool calls
- Tool call fullscreen viewer with tabs (input/output/payload)
- Agent Response card with message/payload/tools tabs
- Fullscreen viewer with rendered/raw JSON toggle
- Per-iteration token breakdown table

### ConversationList (Admin) - 847 lines, basic:
- Lists conversations, two-panel view
- MessageDetailPanel with basic tabs
- Shows raw JSON for most content
- No rich content block rendering
- No fullscreen viewer
- Simpler iteration display
- Missing Agent Response section

## Key Gaps

| Feature | DiagnosticsPanel | ConversationList |
|---------|------------------|------------------|
| Content block rendering | ✅ Styled text/tool_use/tool_result | ❌ Raw JSON |
| Fullscreen viewer | ✅ With rendered/raw toggle | ❌ None |
| Collapsible sections | ✅ Throughout | ❌ None |
| Iteration details | ✅ Rich cards with messages | ⚠️ Basic |
| Tool call viewer | ✅ Fullscreen with tabs | ⚠️ Inline only |
| Agent Response card | ✅ With payload/tools tabs | ❌ None |
| Token breakdown table | ✅ Per-iteration | ❌ Totals only |
| System prompt display | ✅ Collapsible | ⚠️ Inline |

## Recommended Approach

### Extract shared components to `components/chat/diagnostics/`:

```
components/chat/diagnostics/
├── index.ts                    # Barrel export
├── FullscreenViewer.tsx        # Modal with rendered/raw toggle
├── CollapsibleSection.tsx      # Expandable section with fullscreen btn
├── ContentBlockRenderer.tsx    # Renders text/tool_use/tool_result
├── MessagesList.tsx            # Renders message arrays
├── IterationCard.tsx           # Iteration display
├── ToolCallCard.tsx            # Tool call with fullscreen
├── AgentResponseCard.tsx       # Final response tabs
├── ConfigCard.tsx              # Simple metric card
├── types.ts                    # Shared types (ContentBlock, etc.)
└── utils.ts                    # normalizeContent, getContentSummary
```

### Then update both:
1. `DiagnosticsPanel.tsx` - Import from shared, becomes thinner
2. `ConversationList.tsx` - Import same components, gains all features

## Implementation Steps

1. **Create `components/chat/diagnostics/` directory**
2. **Extract types and utilities** (`types.ts`, `utils.ts`)
3. **Extract components one by one**, starting with leaf components:
   - `ConfigCard`
   - `ContentBlockRenderer`
   - `CollapsibleSection`
   - `FullscreenViewer`
   - `MessagesList` / `MessageItem`
   - `ToolCallCard` / `ToolCallFullscreen`
   - `IterationCard`
   - `AgentResponseCard`
4. **Update DiagnosticsPanel** to import from shared
5. **Update ConversationList MessageDetailPanel** to use shared components
6. **Add missing features to admin** (Agent Response, token table)

## Benefits

- **Consistency** - Same rich UI in both places
- **Maintainability** - Fix bugs once, improve both
- **Less code** - ~500 lines of shared components vs. duplicated logic
- **Better admin UX** - Admins get the same quality debugging as users

## Alternative: Quick Win

If full extraction is too much, a simpler approach:

1. **Import DiagnosticsPanel into admin**
2. **Show it in a modal** when clicking "View Trace" on a message
3. Pass the trace data directly

This reuses 100% of DiagnosticsPanel with minimal changes, but the UX might feel disconnected from the conversation list context.

## Key Files

- `frontend/src/components/chat/DiagnosticsPanel.tsx` - Source of rich components
- `frontend/src/components/admin/ConversationList.tsx` - Target for upgrade
- `frontend/src/types/chat.ts` - AgentTrace, AgentIteration, ToolCall types
