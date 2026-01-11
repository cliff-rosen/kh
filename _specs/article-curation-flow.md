# Article Curation Flow - State Transitions

## Overview

This document describes how articles flow through the pipeline and curation process, from initial retrieval to final report inclusion.

## Data Model Relationships

```
WipArticle (Pipeline Output)
    ↓
    ↓ promoted if included_in_report=True
    ↓
Article (Canonical Record)
    ↓
    ↓ linked via
    ↓
ReportArticleAssociation (What's IN the report)
```

## Key Invariant

```
WipArticle.included_in_report = True  ↔  ReportArticleAssociation EXISTS
WipArticle.included_in_report = False ↔  ReportArticleAssociation DOES NOT EXIST
```

The `included_in_report` field on WipArticle is the **single source of truth** for whether an article appears in the report.

---

## Pipeline Phase

### 1. Retrieval
```
PubMed Query → WipArticle created
  - included_in_report = NULL (not yet determined)
  - passed_semantic_filter = NULL
  - is_duplicate = False
```

### 2. Deduplication
```
WipArticle checked against other articles
  - is_duplicate = True/False
  - duplicate_of_pmid = "12345" (if duplicate)
```

### 3. Semantic Filtering
```
AI evaluates relevance
  - passed_semantic_filter = True/False
  - filter_score = 0.85
  - filter_score_reason = "Off topic - agricultural focus" (captured for all articles)
```

### 4. Mark for Inclusion
```
Non-duplicate articles that passed filter:
  - included_in_report = True

Filtered/duplicate articles:
  - included_in_report = False
```

### 5. Categorization
```
Included articles assigned to presentation categories:
  - presentation_categories = ["immunotherapy", "drug-delivery"]
```

### 6. Report Creation
```
For each WipArticle where included_in_report = True:
  1. Create/find Article record (canonical, deduplicated by DOI/PMID)
  2. Create ReportArticleAssociation linking Report ↔ Article
     - ranking = position in report
     - presentation_categories = from WipArticle
     - original_ranking = same (preserved for curation comparison)
     - original_presentation_categories = same
```

---

## Curation Phase

Report is now in `awaiting_approval` status. Curator reviews.

### Viewing Articles

**Included tab** (from ReportArticleAssociation):
- Articles currently in the report
- Can edit ranking, category, AI summary
- Can exclude (remove from report)

**Filtered Out tab** (from WipArticle where included_in_report=False AND is_duplicate=False):
- Articles pipeline rejected
- Shows filter_score, filter_score_reason
- Can include (add to report)

**Duplicates tab** (from WipArticle where is_duplicate=True):
- Articles marked as duplicates
- Shows duplicate_of_pmid
- Generally not actionable

**Curated tab** (derived):
- Articles where curator_included=True OR curator_excluded=True
- Shows what changed from pipeline output

---

## Curation Actions

### Action: Curator EXCLUDES a pipeline-included article

**Before:**
```
WipArticle:
  included_in_report = True
  curator_excluded = False

ReportArticleAssociation: EXISTS
```

**After:**
```
WipArticle:
  included_in_report = False  ← UPDATED
  curator_excluded = True     ← UPDATED (audit trail)
  curation_notes = "Not relevant to this week's focus"

ReportArticleAssociation: DELETED
```

### Action: Curator INCLUDES a pipeline-filtered article

**Before:**
```
WipArticle:
  included_in_report = False
  passed_semantic_filter = False
  curator_included = False

ReportArticleAssociation: DOES NOT EXIST
```

**After:**
```
WipArticle:
  included_in_report = True   ← UPDATED
  curator_included = True     ← UPDATED (audit trail)
  curation_notes = "Actually relevant - ML approach applies to oncology"

Article: CREATED (if not exists, found by DOI/PMID)

ReportArticleAssociation: CREATED
  - ranking = assigned by curator or appended
  - presentation_categories = assigned by curator
  - original_ranking = NULL (curator-added, no pipeline original)
  - original_presentation_categories = []
```

### Action: Curator changes article category

```
ReportArticleAssociation:
  presentation_categories = ["biomarkers"]  ← UPDATED
  original_presentation_categories = ["immunotherapy"]  (unchanged, for comparison)
  curated_by = user_id
  curated_at = now()
```

### Action: Curator changes article ranking

```
ReportArticleAssociation:
  ranking = 3  ← UPDATED
  original_ranking = 7  (unchanged, for comparison)
  curated_by = user_id
  curated_at = now()
```

### Action: Curator edits AI summary

```
ReportArticleAssociation:
  ai_summary = "Edited summary..."  ← UPDATED
  original_ai_summary = "Original AI-generated..."  (unchanged)
  curated_by = user_id
  curated_at = now()
```

---

## Audit Trail

### WipArticle Fields (Pipeline + Curation Decision Audit)

| Field | Set By | Purpose |
|-------|--------|---------|
| `passed_semantic_filter` | Pipeline | Did AI filter pass this? |
| `filter_score` | Pipeline | Relevance score (0-1) |
| `filter_score_reason` | Pipeline | AI reasoning for score (all articles) |
| `is_duplicate` | Pipeline | Is this a duplicate? |
| `duplicate_of_pmid` | Pipeline | Which article is it a dupe of? |
| `included_in_report` | Pipeline/Curator | **Source of truth** - is it in the report? |
| `curator_included` | Curator | Did curator override filter to include? |
| `curator_excluded` | Curator | Did curator override pipeline to exclude? |
| `curation_notes` | Curator | Why curator made the decision |

### Deriving Article Status

```python
def get_article_status(wip: WipArticle) -> str:
    if wip.is_duplicate:
        return "duplicate"

    if wip.included_in_report:
        if wip.curator_included:
            return "curator_included"  # Pipeline filtered, curator overrode
        else:
            return "pipeline_included"  # Pipeline included, curator didn't touch
    else:
        if wip.curator_excluded:
            return "curator_excluded"  # Pipeline included, curator overrode
        else:
            return "pipeline_filtered"  # Pipeline filtered, curator didn't touch
```

### ReportArticleAssociation Fields (Content Edit Audit)

| Field | Purpose |
|-------|---------|
| `original_ranking` | What pipeline assigned |
| `original_presentation_categories` | What pipeline assigned |
| `original_ai_summary` | What AI generated |
| `ranking` | Current (may be edited) |
| `presentation_categories` | Current (may be edited) |
| `ai_summary` | Current (may be edited) |
| `curation_notes` | Curator notes for retrieval improvement |
| `curated_by` | Who last edited |
| `curated_at` | When last edited |

### Report Fields (Report-Level Edit Audit)

| Field | Purpose |
|-------|---------|
| `original_report_name` | What pipeline generated |
| `original_enrichments` | Original exec summary + category summaries |
| `report_name` | Current (may be edited) |
| `enrichments` | Current (may be edited) |
| `has_curation_edits` | Quick check: was anything changed? |
| `last_curated_by` | Who last edited |
| `last_curated_at` | When last edited |

---

## Approval Phase

When curator clicks "Approve":

1. Validate report has at least one article
2. Set `report.approval_status = 'approved'`
3. Set `report.approved_by = curator_id`
4. Set `report.approved_at = now()`

No structural changes needed - ReportArticleAssociation already contains exactly what should be in the report.

When curator clicks "Reject":

1. Set `report.approval_status = 'rejected'`
2. Set `report.rejection_reason = "..."`
3. Optionally notify stream owner

---

## API Endpoints

### GET /api/reports/{report_id}/curation
Returns full curation view data:
- Report content (title, summaries, originals for comparison)
- Included articles (from ReportArticleAssociation)
- Filtered articles (from WipArticle)
- Duplicate articles (from WipArticle)
- Categories (from stream config)

### PATCH /api/reports/{report_id}/content
Edit report title/summaries:
```json
{
  "title": "New Title",
  "executive_summary": "Edited summary...",
  "category_summaries": {"immunotherapy": "Edited..."}
}
```

### POST /api/reports/{report_id}/articles/{article_id}/exclude
Curator excludes an included article:
- Deletes ReportArticleAssociation
- Updates WipArticle: included_in_report=False, curator_excluded=True
```json
{
  "notes": "Not relevant to this week's focus"
}
```

### POST /api/reports/{report_id}/articles/include
Curator includes a filtered article:
- Creates Article (if needed) + ReportArticleAssociation
- Updates WipArticle: included_in_report=True, curator_included=True
```json
{
  "wip_article_id": 123,
  "category": "immunotherapy",
  "notes": "Actually relevant - ML approach applies to oncology"
}
```

### PATCH /api/reports/{report_id}/articles/{article_id}
Edit article within report:
```json
{
  "ranking": 3,
  "category": "biomarkers",
  "ai_summary": "Edited summary...",
  "curation_notes": "Key paper for this topic"
}
```

### POST /api/reports/{report_id}/approve
```json
{
  "notes": "Looks good"
}
```

### POST /api/reports/{report_id}/reject
```json
{
  "reason": "Missing key papers on X topic"
}
```
