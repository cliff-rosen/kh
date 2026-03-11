# Tags — How They Work

## What Tags Are

Tags are user-created text labels that can be assigned to any article in Knowledge Horizon. They're independent of reports, collections, and streams — a tag applied to an article follows that article everywhere it appears.

## Scopes & Namespaces

Tags exist in **separate namespaces** per scope. A personal tag and an org tag can have the same name — they are distinct entities. An article can have both "Important" (personal) and "Important" (org) assigned simultaneously.

**Personal tags** — Created by any user. Only visible to that user. The user controls creation, naming, color, assignment, and deletion. Stored with `user_id` set.

**Organization tags** — Created by org admins only. Visible to all members of the organization. Any org member can assign/unassign org tags to articles, but only admins can create, rename, or delete them. When one member assigns an org tag to an article, every org member sees it. Stored with `org_id` set.

### Visual Distinction

Org tags are visually distinguished from personal tags in two ways:
1. A small **building icon** appears on org tag badges
2. Org tags have a **thicker border** (1.5px vs 1px)

This ensures that even when a personal and org tag share the same name and color, the user can tell them apart.

## Where You Manage Tags

**Settings > Tags tab** — Dedicated tab in the user settings page with two sections:
- **My Tags** — Create and manage personal tags (name, color, delete). Available to all users.
- **Organization Tags** — Create and manage org tags. Only visible to org admins.

**Inline in TagPicker** — When tagging an article, type a new name to create a personal tag on the spot. (Org tags can only be created from the Tags settings page.)

## Where You Assign Tags to Articles

**Article Viewer Modal** — Open any article from a report or collection. The TagPicker dropdown appears below the article metadata. Click it to see all available tags (personal + org), toggle them on/off, or create new personal tags inline.

## Where Tags Are Displayed

### On Article Cards
Every article card shows its tags as small colored badges below the journal/date/PMID line. Tags appear consistently across all contexts: reports (all views), favorites, and collections. All contexts use the same shared `ReportArticleCard` component.

### In the Article Viewer Modal
Tags are shown via the TagPicker component, which doubles as both display and editor.

### Consolidated Tag Summary (Reports & Collections)
When viewing a report or collection, a **TagFilterBar** appears in the header area alongside other controls (view toggles, card format). This bar shows only tags that are actually assigned to articles in that context, with article counts (e.g., "CRISPR (5)"). This serves as:
1. A summary — at a glance, see what topics are represented
2. A filter — click any tag to filter the article list to only articles with that tag

## How Tag Filtering Works

### In Reports
The TagFilterBar appears in the report header (third row, below view/format toggles). Click one or more tags to filter. The article count updates: "Articles (12 of 47)". Filtering works in both "All" and "By Category" views — categories with no matching articles disappear. Clear the filter to see all articles again.

### In Collections
Same behavior. The TagFilterBar appears in the collection header below the article count. Selecting tags filters the article list within that collection.

## Data Model

- `tags` table — tag_id, name, color, scope (personal/organization), user_id, org_id, created_by
- `article_tags` table — tag_id, article_id, tagged_by, tagged_at (composite PK)
- Unique constraint: `(name, scope, user_id, org_id)` — prevents duplicate tag names within a namespace

Tags are associated directly with articles (not with report-article or collection-article associations). A tag sticks with the article regardless of which report or collection you're viewing it in.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/tags` | List all visible tags (personal + org) |
| `POST /api/tags` | Create a tag (scope in body; org scope requires admin) |
| `PUT /api/tags/{id}` | Update name/color |
| `DELETE /api/tags/{id}` | Delete tag + all assignments |
| `POST /api/tags/assign` | Assign tag(s) to article(s) |
| `DELETE /api/tags/assign` | Remove a tag from an article |
| `GET /api/tags/articles/{id}` | Get tags for one article |
| `GET /api/tags/batch?article_ids=` | Get tags for multiple articles (batch, used by cards) |
| `GET /api/tags/aggregate?report_id=` | Get tags used in a report/collection with counts |
| `GET /api/tags/search?tag_ids=` | Find articles matching tags (supports report_id/stream_id) |

## Future: Chat Integration

Tags will eventually be actionable through chat tools — e.g., "tag all articles about CRISPR in this report" or "show me everything tagged 'high-priority' across all streams." This is not yet implemented.
