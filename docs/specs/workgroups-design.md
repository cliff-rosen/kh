# Multi-Tenancy / Organizations Design Spec

## Overview

Introduce organizations (groups) as a top-level container. Users belong to exactly one organization. Resources within an organization can be personal (visible only to creator) or shared (visible to all org members).

## Current State

- All resources keyed off `user_id`
- No concept of organizations or shared resources
- Notes stored as TEXT in `report_article_associations.notes`

## Goals

1. Users belong to exactly one organization
2. Research streams can be personal OR org-shared
3. Reports inherit visibility from their parent stream
4. Notes stored as JSON array supporting personal AND org-shared notes on the same article
5. Backward compatibility: existing users get placed in their own single-user org

---

## Data Model Changes

### New Table: `organizations`

| Column | Type | Description |
|--------|------|-------------|
| org_id | SERIAL PK | Unique identifier |
| name | VARCHAR(255) | Display name |
| created_at | TIMESTAMP | Creation timestamp |

### Modified Table: `users`

| New Column | Type | Description |
|------------|------|-------------|
| org_id | INT FK(organizations) NOT NULL | Organization user belongs to |

**Constraint:** Every user belongs to exactly one organization.

### Modified Table: `research_streams`

| Column | Change | Type | Description |
|--------|--------|------|-------------|
| org_id | ADD | INT FK(organizations) NOT NULL | Organization this stream belongs to |
| user_id | MODIFY | INT FK(users) NULL | If set → personal stream; if NULL → org stream |

**Access Rules:**
- `user_id IS NOT NULL` → personal stream, only that user can access
- `user_id IS NULL` → org stream, all users in `org_id` can access

**Key concept:** There is no "sharing" of personal streams. Org-level streams are created as org-level from the start.

### Modified Table: `reports`

No schema changes. Reports inherit visibility from their parent `research_stream`.

### Modified Table: `report_article_associations`

| Changed Column | Old Type | New Type | Description |
|----------------|----------|----------|-------------|
| notes | TEXT | JSON | Array of note objects |

**Notes JSON Structure:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": 123,
    "author_name": "Jane Smith",
    "content": "This is my private analysis note",
    "visibility": "personal",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "user_id": 456,
    "author_name": "John Doe",
    "content": "Team note: Important finding for the case",
    "visibility": "shared",
    "created_at": "2024-01-15T11:00:00Z",
    "updated_at": "2024-01-15T11:00:00Z"
  }
]
```

**Note Fields:**
- `id` - UUID for the individual note (for updates/deletes)
- `user_id` - Author of the note
- `author_name` - Denormalized for display (avoids joins)
- `content` - The note text
- `visibility` - 'personal' (only author sees) or 'shared' (all org members see)
- `created_at` / `updated_at` - Timestamps

---

## Access Control Logic

### Research Streams

```python
def can_access_stream(user, stream):
    if stream.user_id is not None:
        # Personal stream - only owner can access
        return stream.user_id == user.user_id
    else:
        # Org stream - any org member can access
        return stream.org_id == user.org_id
```

### Reports

```python
def can_access_report(user, report):
    return can_access_stream(user, report.research_stream)
```

### Notes

When fetching notes for an article in a report:

```python
def get_visible_notes(user, notes_json):
    visible = []
    for note in notes_json:
        if note['visibility'] == 'personal':
            if note['user_id'] == user.user_id:
                visible.append(note)
        else:  # 'shared'
            # If user can see the report, they can see shared notes
            visible.append(note)
    return visible
```

**Key insight:** If a user can access the report (via stream access control), they can see all shared notes on that report. Personal notes are always filtered to author-only.

---

## API Changes

### Organizations

```
GET  /api/org                    # Get current user's organization
PUT  /api/org                    # Update organization (name, etc.)
GET  /api/org/members            # List organization members
```

### Research Streams

```
# Creating streams
POST /api/research-streams
  Body: { ..., "is_org_stream": false }  # Personal stream (user_id = current user)
  Body: { ..., "is_org_stream": true }   # Org stream (user_id = NULL)

GET /api/research-streams
  Returns: user's personal streams + org streams in user's org

# Personal streams can only be edited/deleted by owner
# Org streams can be edited/deleted by any org member (or restrict to admins?)
PUT /api/research-streams/:id
DELETE /api/research-streams/:id
```

### Notes

```
# Notes CRUD on report articles
POST   /api/reports/:rid/articles/:aid/notes
  Body: { "content": "...", "visibility": "personal" | "shared" }
  Returns: { "id": "uuid", ... }

PUT    /api/reports/:rid/articles/:aid/notes/:nid
  Body: { "content": "...", "visibility": "..." }

DELETE /api/reports/:rid/articles/:aid/notes/:nid

GET    /api/reports/:rid/articles/:aid/notes
  Returns: Array of visible notes (filtered by access rules)
```

---

## UI/UX Considerations

### Stream List

- Show type badge/icon on each stream
- Personal streams: user icon or "My Streams" section
- Org streams: team icon or "Team Streams" section
- When creating: toggle/radio for "Personal" vs "Team" stream
- Could organize as two sections in the sidebar

### Report View - Notes Section

```
┌─────────────────────────────────────────────┐
│ Notes                                       │
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ 🔒 My private note about this article  │ │
│ │    - You, Jan 15                        │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ 👥 Team note visible to everyone       │ │
│ │    - Jane Smith, Jan 15                 │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [+ Add Note]  ○ Private  ● Shared          │
└─────────────────────────────────────────────┘
```

- Visual distinction between personal (🔒) and shared (👥) notes
- Show author name on shared notes
- Toggle for visibility when adding new note
- Default visibility: shared (for collaboration) or personal (for privacy)?

### Organization Settings (if needed)

- Simple settings page for org name
- Member list (read-only? or allow admin to manage?)

---

## Migration Strategy

### Phase 1: Schema Migration

1. Create `organizations` table
2. For each existing user, create a single-user organization
3. Add `org_id` to users table, populate with their org
4. Add `org_id` column to `research_streams`
5. Make `user_id` nullable on `research_streams`
6. Populate `research_streams.org_id` from `user.org_id` for all existing streams
7. Migrate `notes` column from TEXT to JSON:
   - If notes is not empty: `[{"id": uuid, "user_id": stream.user_id, "content": notes, "visibility": "personal", ...}]`
   - If notes is empty: `[]` or NULL

### Phase 2: Backend

1. Update auth to include org context
2. Update stream queries to include visibility filtering
3. Update report queries to join through stream for access control
4. Implement notes CRUD with JSON manipulation
5. Update all relevant services

### Phase 3: Frontend

1. Add visibility toggle to stream creation/edit
2. Update notes UI for multiple notes with visibility
3. Add org context to relevant components
4. Show member names on shared notes

---

## Open Questions

1. **Naming**: "Organization" vs "Workspace" vs "Team" vs something else?

2. **User Invitations**: How do new users join an organization? (Out of scope for v1? Just seed via admin?)

3. **AI Enrichments**: Keep as-is (shared within report context) or also support personal/shared distinction?

4. **Roles within Org**: Do we need admin/member distinction, or is everyone equal within an org?

5. **Org Stream Permissions**: Can any org member edit/delete org streams, or only the creator/admins?

6. **Converting Streams**: Can a personal stream ever become an org stream (or vice versa)? Or are they fixed at creation?

---

## Scoping for v1

**In Scope:**
- Organizations table and user association
- Stream ownership model (personal vs org-level)
- JSON notes with personal/shared visibility
- Basic UI for stream type selection
- Notes UI with visibility toggle

**Out of Scope (v2+):**
- User invitation flow
- Org admin roles/permissions
- Org settings/management page
- Converting streams between personal/org
