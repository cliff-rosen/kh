# Chat, Help & Tool Updates for Explorer, Collections, and Tags

This spec covers all changes needed to integrate three new features into the chat system, help documentation, and tool layer.

## Background

Three features have been built but are not yet reflected in the chat system or help:

- **Explorer** (`/explorer`) — Unified article search across streams, collections, and PubMed with list and table views, article selection, and collection actions.
- **Collections** — Custom article groupings with personal/org/stream scopes. Accessible via the Collections page, Explorer selection actions, and the "Add to Collection" button in the Article Viewer.
- **Tags** — Arbitrary labels on articles with personal and org scopes. TagPicker in Article Viewer, TagBadge on ReportArticleCards, TagFilterBar on Reports and CollectionDetail, TagManager on Profile page.

### Current state

| Area | Explorer | Collections | Tags |
|------|----------|-------------|------|
| Backend models/service/router | Done | Done | Done |
| Frontend components | Done | Done | Done |
| Chat page config | Missing | Missing | N/A (not a page) |
| Chat tools | None | None | None |
| Help YAML | Missing | Missing | Missing |
| Global preamble mentions | No | No | No |
| Frontend HelpGuide sections | No | No | No |
| Help registry category labels | No | No | No |
| Persona updates (existing pages) | — | — | Reports & Article Viewer don't mention tags |
| ChatTray on page | Explorer has no ChatTray | Collections page TBD | N/A |

---

## Part A: New Chat Tools

### A1. `search_articles_by_tags` — New tool in `backend/tools/builtin/tags.py`

New file. A global tool that lets the LLM search for articles by tag.

```python
register_tool(ToolConfig(
    name="search_articles_by_tags",
    description="Search for articles that have specific tags assigned. Returns articles matching the given tag names or IDs. Useful when the user wants to find articles they or their team have tagged.",
    input_schema={
        "type": "object",
        "properties": {
            "tag_names": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Tag names to search for (case-insensitive). Articles matching ANY of the tags are returned."
            },
            "tag_ids": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Tag IDs to search for (alternative to names). Articles matching ANY of the tags are returned."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (default 20, max 50)",
                "default": 20
            }
        }
    },
    executor=execute_search_articles_by_tags,
    category="tags",
    is_global=True
))
```

**Executor**: Uses `TagService.get_articles_by_tags()`. Returns article list with tag badges. Payload type: `"tagged_articles"`.

### A2. `list_tags` — New tool in `backend/tools/builtin/tags.py`

Lets the LLM see what tags the user has available.

```python
register_tool(ToolConfig(
    name="list_tags",
    description="List all tags visible to the user (personal + organization tags). Shows tag names, colors, scopes, and article counts.",
    input_schema={
        "type": "object",
        "properties": {
            "include_counts": {
                "type": "boolean",
                "description": "Include article counts per tag (default true)",
                "default": true
            }
        }
    },
    executor=execute_list_tags,
    category="tags",
    is_global=True
))
```

**Executor**: Uses `TagService.list_tags()` (and optionally `get_aggregate_tags()` for counts). Returns text list of tags grouped by scope.

### A3. `list_collections` — New tool in `backend/tools/builtin/collections.py`

New file. A global tool for the LLM to see the user's collections.

```python
register_tool(ToolConfig(
    name="list_collections",
    description="List all collections visible to the user. Shows collection names, scopes, article counts, and descriptions.",
    input_schema={
        "type": "object",
        "properties": {
            "scope": {
                "type": "string",
                "enum": ["personal", "organization", "stream"],
                "description": "Filter by scope (optional - returns all if not specified)"
            }
        }
    },
    executor=execute_list_collections,
    category="collections",
    is_global=True
))
```

**Executor**: Uses `CollectionService.list_collections()`. Returns text list of collections grouped by scope.

### A4. `get_collection_articles` — New tool in `backend/tools/builtin/collections.py`

```python
register_tool(ToolConfig(
    name="get_collection_articles",
    description="Get all articles in a specific collection. Use list_collections first to find the collection ID.",
    input_schema={
        "type": "object",
        "properties": {
            "collection_id": {
                "type": "integer",
                "description": "The collection ID"
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (default 20, max 50)",
                "default": 20
            }
        },
        "required": ["collection_id"]
    },
    executor=execute_get_collection_articles,
    category="collections",
    is_global=True
))
```

**Executor**: Uses `CollectionService.get_articles()`. Returns article list. Payload type: `"collection_articles"`.

### A5. Add `tag_names` parameter to `search_articles_in_reports`

**File:** `backend/tools/builtin/reports.py`

Update the existing `search_articles_in_reports` tool schema to accept an optional `tag_names` filter:

```python
"tag_names": {
    "type": "array",
    "items": {"type": "string"},
    "description": "Optional: filter results to articles that have ALL of these tags assigned. Tag names are case-insensitive."
}
```

Update the executor to:
1. After getting search results, fetch tags for the result article IDs via `TagService.get_tags_for_articles()`
2. If `tag_names` is provided, filter results to only articles with matching tags
3. Include tag names in the text output for each article

This is the most impactful change — it lets the LLM combine text search with tag filtering in one call.

---

## Part B: Persona & Context Updates (Existing Page Configs)

### B1. Update Reports persona — `backend/services/chat_page_config/reports.py`

Add to `REPORTS_PERSONA` "Your tools let you" list:

```
- Filter and search articles by tags
- List and browse article collections
```

Add to "Page-specific guidance":

```
- Articles may have tags (personal or org-wide). Tags are shown as colored badges on article cards.
- Users can filter by tags using the tag filter bar above the article list.
- The search_articles_in_reports tool accepts optional tag_names to filter results.
```

### B2. Update Article Viewer persona — `backend/services/chat_page_config/article_viewer.py`

Add to `ARTICLE_VIEWER_PERSONA` "Your focus should be on" list:

```
- Helping manage tags and collections for the current article
```

Add to "Page-specific guidance":

```
- The article may have tags assigned (shown as badges). Users can add/remove tags via the TagPicker.
- Users can add the article to collections via the Collection button (shows which collections it's already in).
```

### B3. Update Article Viewer context builder — `backend/services/chat_page_config/article_viewer.py`

In `build_context()`, add tags and collections to the article context if present:

```python
# Tags
tags = current_article.get("tags")
if tags:
    tag_names = [t.get("name", "") for t in tags if t.get("name")]
    if tag_names:
        parts.append(f"Tags: {', '.join(tag_names)}")

# Collections
collections = current_article.get("collections")
if collections:
    coll_names = [c.get("name", "") for c in collections if c.get("name")]
    if coll_names:
        parts.append(f"In collections: {', '.join(coll_names)}")
```

Note: This requires the frontend to pass `tags` and `collections` in the `current_article` context object when opening the article viewer. The frontend already fetches tags via `tagApi.getArticleTags()` and collections via `collectionApi.getCollectionsForArticle()`.

### B4. Update Reports context builder — `backend/services/chat_page_config/reports.py`

Add tag filter state to context:

```python
# Tag filter state
active_tag_filters = context.get("active_tag_ids")
if active_tag_filters:
    parts.append(f"Active tag filters: {len(active_tag_filters)} tags selected")
```

Note: Requires frontend to pass `active_tag_ids` in the chat context from ReportsPage.

---

## Part C: New Page Configs

### C1. Explorer page config — `backend/services/chat_page_config/explorer.py`

New file. Follow `article_viewer.py` pattern.

**Persona:**
```
## Explorer

The user is on the Explorer page — a unified search interface for discovering articles
across streams, collections, and PubMed.

**Your tools let you:**
- Search PubMed for articles beyond what's loaded
- List available collections and their contents
- List available tags for filtering
- Search articles by tags

**Your focus should be on:**
- Helping refine search queries for better results
- Explaining what sources are being searched and how deduplication works
- Helping the user decide which articles to select or add to collections
- Answering questions about articles in the current results

**Page-specific guidance:**
- The user can toggle between list view and table view (Tablizer)
- Results come from a mix of local DB (streams/collections) and PubMed
- PubMed results load incrementally (20 at a time) — the user must click Load More
- Articles can be selected and added to existing collections or used to create new ones
- In table view, the user can add AI columns for analysis but must load all desired results first
```

**Context builder** — include:
- Current search query (if any)
- Active sources (streams/collections/pubmed)
- Selected stream IDs (if filtering by stream)
- Result count (local count + PubMed total)
- Number of selected articles
- Current view mode (list/table)

**Tools:** Global tools are sufficient (search_pubmed, list_collections, list_tags, search_articles_by_tags, get_help).

**Payloads:** None initially.

### C2. Collections page config — `backend/services/chat_page_config/collections.py`

New file. Defer if no dedicated Collections page exists yet. If it does:

**Persona:**
```
## Collections

The user is managing their article collections — custom groupings of articles
independent from automated reports.

**Your tools let you:**
- List collections and their contents
- Search articles by tags
- Search PubMed for articles to add

**Your focus should be on:**
- Helping organize articles into meaningful groupings
- Explaining collection scopes (personal, organization, stream) and visibility
- Answering questions about articles in the current collection
```

**Context builder** — include:
- Current collection name, scope, article count (if viewing one)
- List of user's collections with counts

---

## Part D: Help Content

### D1. New help YAML — `backend/help/explorer.yaml`

Category: `explorer`. Topics:

| Topic | Title | Summary | Roles | Order |
|-------|-------|---------|-------|-------|
| `overview` | Explorer Overview | Unified search across streams, collections, and PubMed | all | 10 |
| `searching` | Searching in Explorer | Source toggles, stream picker, clearing search | all | 20 |
| `pubmed-results` | PubMed Results & Pagination | Totals, Load More, overlap deduplication | all | 30 |
| `table-view` | Table View (Tablizer) | Switching views, AI columns, export; load results first | all | 40 |
| `selecting-articles` | Selecting & Organizing Articles | Checkbox selection, Add to Collection, Create Collection | all | 50 |

### D2. New help YAML — `backend/help/collections.yaml`

Category: `collections`. Topics:

| Topic | Title | Summary | Roles | Order |
|-------|-------|---------|-------|-------|
| `overview` | Collections Overview | Custom article groupings, scopes | all | 10 |
| `creating` | Creating Collections | From Explorer or Collections page | all | 20 |
| `adding-articles` | Adding Articles | From Explorer, Article Viewer, bulk PMID | all | 30 |
| `managing` | Managing Collections | Edit, remove articles, delete | all | 40 |

### D3. New help YAML — `backend/help/tags.yaml`

Category: `tags`. Topics:

| Topic | Title | Summary | Roles | Order |
|-------|-------|---------|-------|-------|
| `overview` | Tags Overview | Personal and org tags, what they're for | all | 10 |
| `assigning` | Assigning Tags to Articles | TagPicker in Article Viewer, inline creation | all | 20 |
| `filtering` | Filtering by Tags | TagFilterBar on Reports and Collections | all | 30 |
| `managing` | Managing Tags | Tag Manager in Profile, org tags (admin only) | all | 40 |
| `org-tags` | Organization Tags | Shared tags, admin creation, visible to all members | org_admin, platform_admin | 50 |

**Content guidance:**
- `overview`: Tags are colored labels you attach to articles. Personal tags are private; org tags are shared across the organization. Org tags can only be created by admins but any member can assign them.
- `assigning`: Click any article to open it, then use the TagPicker (tag icon area) to assign/remove tags. You can create new personal tags inline. Tags appear as colored badges.
- `filtering`: On the Reports page and Collection detail view, use the tag filter bar to show only articles with specific tags. Click a tag to toggle it. Multiple tags = articles matching any selected tag.
- `managing`: Go to Profile → Tags tab to manage your tags. Create, rename, change colors, or delete. Deleting a tag removes it from all articles.
- `org-tags`: Org admins can create shared tags visible to all organization members. Go to Profile → Tags → Organization Tags section. When any member assigns an org tag to an article, all members see it.

### D4. Update `backend/help/getting-started.yaml`

**`general/getting-started`** — add to "What You Can Do" list:
```yaml
- **Explorer** - Search and discover articles across all your streams, collections, and PubMed in one place
- **Collections** - Create custom article groupings to organize research beyond automated reports
- **Tags** - Label articles with custom tags for personal organization or team-wide categorization
```

**`general/navigation`** — add to "Top Navigation Bar" list:
```yaml
- **Collections** - Your custom article groupings
- **Explorer** - Unified article search and discovery
```

**`general/user-roles`** — add to each role:
- **Member**: Add `Tag articles with personal tags`, `Create personal collections`, `Search across sources with Explorer`
- **Org Admin**: Add `Create and manage organization-wide tags`, `Create org/stream-scoped collections`

### D5. Update `backend/help/article-viewer.yaml`

In `article-viewer/overview`, add to "What You'll See":
```yaml
- Tags assigned to this article (colored badges) with the ability to add/remove tags
- Collection button to add the article to one or more collections (shows which collections it's already in)
```

### D6. Update `backend/help/reports.yaml`

In the appropriate topic (likely `reports/view-modes` or `reports/overview`), add:
```yaml
**Tag Filtering:**
Articles in reports can have tags assigned. Use the tag filter bar above the article list to
filter by tags. Tags are colored badges — click to toggle. When tags are selected, only
articles matching at least one selected tag are shown.
```

### D7. Help Registry — `backend/services/help_registry.py`

Add new category labels:

```python
DEFAULT_CATEGORY_LABELS = {
    ...existing...
    'explorer': 'Explorer',
    'collections': 'Collections',
    'tags': 'Tags',
}
```

---

## Part E: Global Preamble Update

**File:** `backend/services/chat_stream_service.py`

In `GLOBAL_PREAMBLE`, update "What Knowledge Horizon Does":

```
Current:
- Monitoring PubMed for new articles matching configured research streams
- Generating curated intelligence reports with AI summaries
- Organizing articles by themes and categories

Updated:
- Monitoring PubMed for new articles matching configured research streams
- Generating curated intelligence reports with AI summaries
- Organizing articles by themes and categories
- Explorer for unified search across streams, collections, and PubMed
- Collections for creating custom article groupings beyond automated reports
- Tags for labeling and filtering articles (personal and organization-wide)
```

---

## Part F: Frontend Wiring

### F1. Add ChatTray to ExplorerPage

**File:** `frontend/src/pages/ExplorerPage.tsx`

```tsx
import ChatTray from '../components/chat/ChatTray';

const chatContext = useMemo(() => ({
    current_page: 'explorer',
    search_query: lastSearchQuery || '',
    sources: { streams: searchStreams, collections: searchCollections, pubmed: searchPubmed },
    selected_stream_ids: selectedStreamIds,
    result_count: results.length,
    local_count: localCount,
    pubmed_total: pubmedTotal,
    selected_count: selectedIds.size,
    view_mode: viewMode,
}), [lastSearchQuery, searchStreams, searchCollections, searchPubmed,
     selectedStreamIds, results.length, localCount, pubmedTotal,
     selectedIds.size, viewMode]);

// In JSX:
<ChatTray initialContext={chatContext} />
```

### F2. Pass tags/collections in Article Viewer chat context

**File:** `frontend/src/pages/ReportsPage.tsx` (or wherever article viewer context is built)

When building the `current_article` object for chat context, include:
- `tags`: array of `{name, color, scope}` from the article's tags
- `collections`: array of `{name, scope}` from the article's collection memberships

### F3. Pass active tag filters in Reports chat context

**File:** `frontend/src/pages/ReportsPage.tsx`

Add `active_tag_ids` to the chat context so the LLM knows the user is filtering.

### F4. Update Frontend HelpGuide

**File:** `frontend/src/components/help/HelpGuide.tsx`

Add three new sections to the `sections` array:

**Explorer** (after "Working with Reports"):
- Subsections: Searching Across Sources, Working with Results, Selecting & Organizing

**Collections** (after Explorer):
- Subsections: What Are Collections, Adding Articles, Managing Collections

**Tags** (after Collections):
- Subsections: What Are Tags, Assigning Tags, Filtering by Tags, Managing Tags

---

## Implementation Order

| Phase | Work | Files |
|-------|------|-------|
| 1. Tools | Create `tags.py` and `collections.py` in `tools/builtin/`. Add `tag_names` param to `search_articles_in_reports`. | 3 files |
| 2. Page configs | Create `explorer.py`, optionally `collections.py` in `chat_page_config/`. | 1-2 files |
| 3. Persona updates | Update `reports.py` and `article_viewer.py` page configs. | 2 files |
| 4. Global preamble | Update `chat_stream_service.py`. | 1 file |
| 5. Help YAML | Create `explorer.yaml`, `collections.yaml`, `tags.yaml`. Update `getting-started.yaml`, `article-viewer.yaml`, `reports.yaml`. Update `help_registry.py`. | 7 files |
| 6. Frontend ChatTray | Wire ChatTray into ExplorerPage. Pass tags/collections in article viewer context. Pass tag filters in reports context. | 2-3 files |
| 7. Frontend HelpGuide | Add Explorer, Collections, Tags sections. | 1 file |

No database migrations needed. All changes are additive.

---

## Files Summary

| File | Action | Category |
|------|--------|----------|
| `backend/tools/builtin/tags.py` | **New** | Tools |
| `backend/tools/builtin/collections.py` | **New** | Tools |
| `backend/tools/builtin/reports.py` | Edit (add `tag_names` param) | Tools |
| `backend/services/chat_page_config/explorer.py` | **New** | Page config |
| `backend/services/chat_page_config/collections.py` | **New** (defer if no page) | Page config |
| `backend/services/chat_page_config/reports.py` | Edit (persona + context) | Persona |
| `backend/services/chat_page_config/article_viewer.py` | Edit (persona + context) | Persona |
| `backend/services/chat_stream_service.py` | Edit (global preamble) | Preamble |
| `backend/services/help_registry.py` | Edit (category labels) | Help |
| `backend/help/explorer.yaml` | **New** | Help |
| `backend/help/collections.yaml` | **New** | Help |
| `backend/help/tags.yaml` | **New** | Help |
| `backend/help/getting-started.yaml` | Edit | Help |
| `backend/help/article-viewer.yaml` | Edit | Help |
| `backend/help/reports.yaml` | Edit | Help |
| `frontend/src/pages/ExplorerPage.tsx` | Edit (ChatTray) | Frontend |
| `frontend/src/pages/ReportsPage.tsx` | Edit (context) | Frontend |
| `frontend/src/components/help/HelpGuide.tsx` | Edit (new sections) | Frontend |
