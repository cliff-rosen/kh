# Chat Config Table Redesign

## Problem

The current implementation has fragmented chat configuration:
- `research_streams.chat_instructions` - stream-specific instructions (in streams table)
- `page_identities` - page identity overrides (new table, narrow purpose)

This is near-sighted. A unified approach is needed.

## Proposed Schema

### New Table: `chat_config`

```sql
CREATE TABLE chat_config (
    scope VARCHAR(20) NOT NULL,      -- 'stream', 'page', 'global'
    scope_key VARCHAR(100) NOT NULL, -- stream_id (as string), page name, or 'default'
    identity TEXT,                   -- System prompt identity/persona
    instructions TEXT,               -- Custom instructions
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INT REFERENCES users(user_id),
    PRIMARY KEY (scope, scope_key)
);
```

### Scope Values

| Scope | scope_key | Identity | Instructions |
|-------|-----------|----------|--------------|
| `stream` | stream_id (e.g., "123") | N/A (uses page identity) | Stream-specific instructions for reports |
| `page` | page name (e.g., "reports") | Custom page persona | Page-specific instructions |
| `global` | "default" | Default identity for unknown pages | Global instructions (future) |

### Migration Path

1. Create `chat_config` table
2. Migrate existing `research_streams.chat_instructions` to `chat_config` (scope='stream')
3. Migrate existing `page_identities` rows to `chat_config` (scope='page')
4. Drop `page_identities` table
5. Mark `research_streams.chat_instructions` as deprecated (or drop if safe)

## Admin UI Tab Reorganization

Current order: Pages | Payloads | Tools | Stream Instructions | Help

Proposed order: **Streams | Pages** | Payloads | Tools | Help

### Tab Content

**Streams Tab** (first)
- List of all streams
- Shows: stream name, has_instructions badge
- Click to edit instructions (full-size modal)
- Preview of instructions in table

**Pages Tab** (second)
- List of all registered pages
- Shows: page name, has_identity_override badge, context_builder badge
- Click to edit identity (full-size modal)
- Expandable to show tabs/payloads/tools

## Backend Changes

### New Endpoints

```
GET  /api/admin/chat-config                    # List all config entries
GET  /api/admin/chat-config/{scope}/{key}      # Get specific config
PUT  /api/admin/chat-config/{scope}/{key}      # Update config
DELETE /api/admin/chat-config/{scope}/{key}    # Delete override
```

### Service Changes

1. Create `ChatConfigService` to manage the new table
2. Update `chat_stream_service._build_system_prompt()` to:
   - Get page identity from `chat_config` (scope='page')
   - Get stream instructions from `chat_config` (scope='stream')
3. Deprecate `ResearchStreamService.chat_instructions` usage

## Frontend Changes

1. Update `ChatConfigList.tsx`:
   - Reorder tabs: Streams, Pages, Payloads, Tools, Help
   - Stream tab shows streams with instructions editing
   - Pages tab shows pages with identity editing
2. Update `ChatInstructionsForm.tsx` in Edit Stream:
   - Either continue saving to stream table OR
   - Update to use new `chat_config` table (preferred)
3. All text editing modals: use near-maximized size

## Benefits

1. **Unified storage** - All chat customizations in one place
2. **Extensible** - Easy to add new scopes (org-level, user-level)
3. **Clear admin UI** - Streams first for the primary use case
4. **Consistent patterns** - Same table structure for all customizations
