# Report Curation & Approval System - Design Spec

## Problem Statement

The current report approval experience is scattered:
- Execution details and report approval are conflated in `/operations/executions/:id`
- No ability to add curation notes for improving future retrieval
- No ability to manually override article inclusion/exclusion decisions
- No ability to edit AI-generated summaries before approval
- No audit trail for manual interventions
- Unclear whether approval should happen from Operations or Reports

## What Is a Report?

A report consists of multiple editable components:

### Report-Level Content
| Component | Source | Editable? | Notes |
|-----------|--------|-----------|-------|
| Report title | Auto-generated or user-provided | ✅ Yes | Approver may want to refine |
| Executive summary | AI-generated | ✅ Yes | May need corrections, tone adjustments |
| Category summaries | AI-generated per category | ✅ Yes | May need corrections, additions |
| Report date | From execution config | ❌ No | Fixed at execution time |

### Article-Level Content
| Component | Source | Editable? | Notes |
|-----------|--------|-----------|-------|
| Inclusion status | Pipeline decision | ✅ Yes | Can override filter decisions |
| Category assignment | AI categorization | ✅ Yes | May miscategorize |
| Ranking/order | Pipeline scoring | ✅ Yes | Approver knows importance |
| AI article summary | AI-generated | ✅ Yes | May need corrections |
| Curation notes | Curator | ✅ Yes | NEW - feedback for retrieval improvement |
| Source data (title, abstract, etc.) | PubMed/source | ❌ No | Canonical, don't modify |

### Not Editable (Comes from Stream Config)
- Category definitions
- Retrieval queries
- Filter criteria

## Goals

1. **Full Content Editing**: Allow editing of report title, executive summary, category summaries, and article AI summaries
2. **Curation Notes**: Allow approvers to annotate articles with notes about why they should/shouldn't be included (distinct from user notes - these feed back into retrieval improvement)
3. **Manual Overrides**: Allow moving articles between states (filtered_out → included, included → excluded) with full tracking
4. **Re-categorization**: Allow moving articles between categories
5. **Reordering**: Allow changing article ranking within categories
6. **Audit Trail**: Track all manual interventions (who, when, what, why)
7. **Consolidated Experience**: Clear, focused approval workflow
8. **Flexibility**: Support different approval workflows (quick approve vs. deep curation)

---

## Data Model Changes

### Design Principles

1. **Current state directly on record** - no hunting through audit tables
2. **Originals stored** - easy to see if something changed (simple field comparison)
3. **Audit table for history** - how we got to current state, not needed for current state queries

### Report Model Changes

```python
class Report(Base):
    # Existing fields...
    report_name: str
    enrichments: dict  # Contains executive_summary, category_summaries

    # NEW: Original values (set once by pipeline, never modified after)
    original_report_name: str = None
    original_enrichments: dict = None  # Original executive_summary, category_summaries

    # NEW: Curation tracking
    has_curation_edits: bool = False   # Quick check: was anything manually changed?
    last_curated_by: int = None        # FK to User
    last_curated_at: datetime = None
```

**Easy checks:**
- `report_name != original_report_name` → title was edited
- `enrichments['executive_summary'] != original_enrichments['executive_summary']` → summary edited
- `has_curation_edits` → quick boolean check without comparing fields

### ReportArticleAssociation Model Changes

```python
class ReportArticleAssociation(Base):
    # Existing fields...
    report_id: int
    article_id: int
    presentation_categories: list      # Current category assignments
    ranking: int                        # Current ranking

    # NEW: Original values (set by pipeline, never modified after)
    original_presentation_categories: list = None
    original_ranking: int = None
    pipeline_decision: str = None      # 'included', 'filtered_out', 'duplicate'
    pipeline_score: float = None       # Relevance score from filter
    pipeline_rejection_reason: str = None  # Why it was filtered out

    # NEW: Current curation state (directly queryable)
    manually_included: bool = False    # Curator overrode to include
    manually_excluded: bool = False    # Curator overrode to exclude
    curation_notes: str = None         # Notes for retrieval improvement

    # NEW: AI summary with original
    ai_summary: str = None             # Current (possibly edited) summary
    original_ai_summary: str = None    # What AI originally generated

    # NEW: Curation metadata
    curated_by: int = None             # FK to User who last modified
    curated_at: datetime = None
```

**Easy checks:**
- `manually_included or manually_excluded` → curator overrode pipeline
- `ai_summary != original_ai_summary` → summary was edited
- `presentation_categories != original_presentation_categories` → recategorized
- `ranking != original_ranking` → reranked

### Audit Event Table (History Only)

```python
class CurationEvent(Base):
    """
    Audit trail - history of how we got to current state.
    NOT used to determine current state (that's on the records above).
    """
    id: int (PK)
    report_id: int (FK)
    article_id: int = None             # NULL for report-level events

    # What happened
    event_type: str                    # See event types below
    field_name: str = None             # Which field changed
    old_value: str = None              # JSON-serialized previous value
    new_value: str = None              # JSON-serialized new value
    notes: str = None                  # Curator's explanation

    # Who/When
    curator_id: int (FK)
    created_at: datetime
```

### Why This Design?

| Query | How to Answer |
|-------|---------------|
| "Is this report edited?" | `report.has_curation_edits` |
| "Was the title changed?" | `report.report_name != report.original_report_name` |
| "Which articles were manually included?" | `WHERE manually_included = TRUE` |
| "Was this article's category changed?" | `assoc.presentation_categories != assoc.original_presentation_categories` |
| "Who made the last change?" | `report.last_curated_by` or `assoc.curated_by` |
| "What's the history of changes?" | Query `CurationEvent` table |

No complex joins or unreliable queries needed for current state.

---

## Audit Event Types

All curation actions should be logged with full context:

### Report-Level Events
| Event Type | Fields | Description |
|------------|--------|-------------|
| `report_title_edited` | old_value, new_value | Title was changed |
| `executive_summary_edited` | old_value, new_value | Exec summary manually edited |
| `executive_summary_regenerated` | old_value, new_value | AI regenerated exec summary |
| `category_summary_edited` | category_id, old_value, new_value | Category summary manually edited |
| `category_summary_regenerated` | category_id, old_value, new_value | AI regenerated category summary |
| `report_approved` | - | Report was approved |
| `report_rejected` | reason | Report was rejected |

### Article-Level Events
| Event Type | Fields | Description |
|------------|--------|-------------|
| `article_included` | previous_status, notes | Article manually included |
| `article_excluded` | previous_status, notes | Article manually excluded |
| `article_recategorized` | old_category, new_category | Category assignment changed |
| `article_reranked` | old_rank, new_rank | Ranking changed |
| `article_summary_edited` | old_value, new_value | AI summary manually edited |
| `curation_note_added` | notes | Curation note added/updated |

### Common Fields on All Events
- `report_id`
- `curator_id` (user who made the change)
- `created_at`
- `article_id` (for article-level events)

---

## Article States & Transitions

```
Pipeline Output:
┌─────────────┐    ┌──────────────┐    ┌────────────┐
│  Retrieved  │ →  │   Filtered   │ →  │  Included  │
│  (raw)      │    │   (passed)   │    │ (in report)│
└─────────────┘    └──────────────┘    └────────────┘
       │                  │                   │
       │                  │                   │
       ▼                  ▼                   ▼
   Duplicate          Filtered Out       In Report
   (excluded)         (excluded)         (visible)


Manual Curation Overrides:
┌──────────────┐                    ┌────────────┐
│ Filtered Out │ ←──── curator ────→│  Included  │
└──────────────┘    can move both   └────────────┘
                      directions

All moves tracked in ArticleCurationEvent
```

---

## UI/UX Design

### Consolidation Approach

**Current**:
- Operations → Execution Queue → Review Execution (approval happens here)
- Reports → View Reports (approved only, read-only)

**Proposed**:

#### 1. Execution Queue (Operations) - Keep for Monitoring
- Focus on pipeline execution status (running, failed, completed)
- Quick view of what's happening
- Link to "Review & Approve" for completed executions

#### 2. Report Approval Queue (New or Enhanced)
- Dedicated view for reports awaiting approval
- Shows: Report name, stream, article count, created date, time waiting
- Actions: Quick Approve, Review & Curate

#### 3. Report Curation View (Enhanced ReportReview)

**Two main sections:**

##### A. Report Content Section (Collapsible, at top)
```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Report Content                                    [Collapse] │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Report Title:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Weekly Cancer Research Update - Jan 2024                    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Executive Summary:                               [Regenerate 🔄] │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ This week's research highlights include breakthrough        │ │
│  │ findings in immunotherapy resistance mechanisms...          │ │
│  │ [editable text area]                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Category: Immunotherapy                          [Regenerate 🔄] │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Three studies this week focused on...                       │ │
│  │ [editable text area]                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Category: Drug Discovery                         [Regenerate 🔄] │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Researchers at MIT announced...                             │ │
│  │ [editable text area]                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

##### B. Articles Section (Main working area)
```
┌─────────────────────────────────────────────────────────────────┐
│  📚 Articles                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│  │  Included   │ │ Filtered Out│ │  Duplicates │ │   Curated   │ │
│  │    (24)     │ │    (156)    │ │    (12)     │ │     (3)     │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Article Card                         [Category ▼] [⊕ Include]│ │
│  │                                                              │ │
│  │ Title: "New CRISPR approach for..."                         │ │
│  │ Authors: Smith et al. │ Journal: Nature │ 2024              │ │
│  │                                                             │ │
│  │ ┌─ AI Summary ──────────────────────────────── [Edit ✏️] ──┐│ │
│  │ │ This study demonstrates a novel CRISPR-Cas9 approach...  ││ │
│  │ └──────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │ Filter Decision: Excluded (score: 0.42, threshold: 0.6)    │ │
│  │ Reason: "Topic drift - focuses on agricultural applications"│ │
│  │                                                             │ │
│  │ ┌─ Curation Notes ─────────────────────────────────────────┐│ │
│  │ │ Add notes about why this should/shouldn't be included... ││ │
│  │ │ These notes help improve future retrieval.               ││ │
│  │ └──────────────────────────────────────────────────────────┘│ │
│  │                                                             │ │
│  │ [↑ Move Up] [↓ Move Down]                   Rank: 3 of 24  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Interactions

1. **Include/Exclude Buttons**: On each article card
   - Click to toggle
   - Prompts for curation note (optional but encouraged)
   - Shows inline confirmation

2. **Curation Notes**:
   - Expandable text area on each article
   - Auto-saves on blur
   - Shows "Last curated by X on date" if exists

3. **Bulk Actions**:
   - Select multiple articles
   - "Include Selected" / "Exclude Selected"
   - Bulk add note

4. **Curated Tab**:
   - Shows all manually modified articles
   - Easy to review what was changed before approving

5. **Approval Actions**:
   - "Approve Report" - finalizes, makes visible in Reports
   - "Reject Report" - requires reason, goes back to stream owner
   - "Save & Continue Later" - preserves curation state

---

## API Endpoints

### New Endpoints

```
# Report content editing
PATCH  /api/reports/{report_id}/title
       Body: { title: string }

PATCH  /api/reports/{report_id}/executive-summary
       Body: { summary: string }

PATCH  /api/reports/{report_id}/category-summary/{category_id}
       Body: { summary: string }

POST   /api/reports/{report_id}/regenerate-summary
       Body: { type: 'executive' | 'category', category_id?: string }
       Returns: { summary: string }  # Newly generated summary

# Article curation operations
POST   /api/reports/{report_id}/articles/{article_id}/curate
       Body: { action: 'include' | 'exclude', notes?: string }

PATCH  /api/reports/{report_id}/articles/{article_id}/curation-notes
       Body: { notes: string }

PATCH  /api/reports/{report_id}/articles/{article_id}/category
       Body: { category_id: string }

PATCH  /api/reports/{report_id}/articles/{article_id}/ranking
       Body: { ranking: number }

PATCH  /api/reports/{report_id}/articles/{article_id}/ai-summary
       Body: { summary: string }

# Audit trail
GET    /api/reports/{report_id}/curation-history
       Returns: List of all curation events for this report

GET    /api/reports/{report_id}/curated-articles
       Returns: All articles with manual overrides

# Bulk operations
POST   /api/reports/{report_id}/articles/bulk-curate
       Body: { article_ids: [], action: 'include' | 'exclude', notes?: string }

POST   /api/reports/{report_id}/articles/bulk-recategorize
       Body: { article_ids: [], category_id: string }
```

### Modified Endpoints

```
GET    /api/reports/{report_id}
       - Include curation_status and curation_notes in article data
       - Include curated_count in summary
       - Include edit history metadata

GET    /api/operations/executions/{id}
       - Include WIP articles with their curation state
```

---

## Migration Path

1. **Phase 1: Data Model**
   - Add ArticleCurationEvent table
   - Add curation fields to ReportArticleAssociation
   - Migrate existing data (set original_status based on current state)

2. **Phase 2: Backend API**
   - Add curation endpoints
   - Update existing endpoints to include curation data

3. **Phase 3: Frontend - Basic Curation**
   - Add Include/Exclude buttons to article cards
   - Add curation notes field
   - Add "Curated" tab

4. **Phase 4: Frontend - Enhanced Experience**
   - Bulk operations
   - Curation history view
   - Improved filtering/sorting

---

## Open Questions

1. **Should curation be allowed on approved reports?**
   - Option A: No - approval is final
   - Option B: Yes - can curate and re-approve (creates new version?)
   - Recommendation: Start with A, simpler

2. **Where does "Report Approval" live in the nav?**
   - Option A: Under Operations (current)
   - Option B: Under Reports with a filter for "Awaiting Approval"
   - Option C: Both - Operations for ops view, Reports for content view
   - Recommendation: C - different users have different mental models

3. **Should filtered-out articles be visible by default?**
   - They add noise but are needed for curation
   - Recommendation: Collapsed by default, expandable

4. **Curation notes vs. rejection reason?**
   - Curation notes: Per-article, for retrieval improvement
   - Rejection reason: Per-report, for stream owner
   - Keep separate - different purposes

---

## Success Metrics

- Time to approve a report (should decrease with better UX)
- Number of manual overrides (indicates pipeline accuracy)
- Curation notes added (indicates engagement with improvement process)
- Curator satisfaction (qualitative feedback)
