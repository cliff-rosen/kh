# Pipeline State Transitions

This document describes the key fields on `WipArticle` and `ReportArticleAssociation` and how they transition through the pipeline stages.

## WipArticle Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `is_duplicate` | bool | Whether this article is a duplicate of another |
| `passed_semantic_filter` | bool \| None | Whether the article passed AI relevance filtering |
| `included_in_report` | bool | Whether this article is included in the final report |
| `curator_included` | bool | Curator manually added this article to the report |
| `curator_excluded` | bool | Curator manually removed this article from the report |

## Pipeline Stages and State Transitions

### Stage 1: Retrieval

**Action:** Fetch articles from sources (PubMed, etc.) and create WipArticle records.

**Initial State:**
```
is_duplicate = False
passed_semantic_filter = None
included_in_report = False
curator_included = False
curator_excluded = False
```

**Commit:** Yes

---

### Stage 2: Deduplication

**Action:** Mark duplicates against historical reports and within the current execution.

**Queries Used:**
- `get_by_execution_id(execution_id)` — all articles for this execution

**State Transitions:**
```
Duplicate found:     is_duplicate = False → True
Not a duplicate:     (no change)
```

**Commit:** Yes

---

### Stage 3: Semantic Filter

**Action:** AI scores each non-duplicate article for relevance. Then marks passing articles for inclusion.

**Queries Used:**
- `get_for_filtering(execution_id, query_id)`:
  - `is_duplicate = False`
  - `passed_semantic_filter = None`
  - `retrieval_group_id = query_id`

**State Transitions (filtering):**
```
Score >= threshold:  passed_semantic_filter = None → True
Score < threshold:   passed_semantic_filter = None → False
Filter disabled:     passed_semantic_filter = None → True (auto-pass)
```

**After filtering completes:**

**Queries Used:**
- `get_passed_filter(execution_id)`:
  - `is_duplicate = False`
  - `passed_semantic_filter = True`

**State Transitions (marking for inclusion):**
```
Passed filter:       included_in_report = False → True
```

**Commit:** Yes

---

### Stage 4: Generate Report

**Action:** Create Report, Article, and ReportArticleAssociation records.

**Queries Used:**
- `get_included_articles(execution_id)`:
  - `included_in_report = True`

**Creates:**
- `Article` record (permanent, deduplicated by PMID/DOI)
- `ReportArticleAssociation` linking article to report

**Commit:** Yes

---

## Final WipArticle States

After the pipeline completes, every WipArticle is in one of these states:

| State | is_duplicate | passed_semantic_filter | included_in_report | Count Example |
|-------|--------------|------------------------|-------------------|---------------|
| Duplicate | `True` | `None` | `False` | 3 |
| Filtered Out | `False` | `False` | `False` | 16 |
| Included | `False` | `True` | `True` | 1 |

**Invariants:**
- Duplicates are never filtered (`passed_semantic_filter` stays `None`)
- Only non-duplicates that pass filtering are included
- `included_in_report = True` implies `is_duplicate = False AND passed_semantic_filter = True` (unless curator override)

---

## Curator Overrides

After the pipeline runs, curators can modify inclusion:

### Curator Includes a Filtered Article

```
curator_included = False → True
curator_excluded = (any) → False
included_in_report = False → True
```

This adds an article that the pipeline rejected.

### Curator Excludes an Included Article

```
curator_excluded = False → True
curator_included = (any) → False
included_in_report = True → False
```

This removes an article that the pipeline included.

### Reset to Pipeline Decision

```
curator_included = (any) → False
curator_excluded = (any) → False
included_in_report = (recalculated from pipeline decision)
```

Where pipeline decision is: `passed_semantic_filter = True AND is_duplicate = False`

---

## ReportArticleAssociation Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `is_hidden` | bool | Whether this article is hidden from the report view |
| `curator_added` | bool | Whether this article was added by curator (not pipeline) |
| `ranking` | int | Display order in the report |
| `presentation_categories` | list | Category assignments for display |
| `ai_summary` | str | AI-generated summary for this article in context |

### Relationship to WipArticle

```
ReportArticleAssociation.is_hidden ←→ WipArticle.included_in_report (inverse)
```

When curator excludes an article:
- `WipArticle.included_in_report = False`
- `ReportArticleAssociation.is_hidden = True`

When curator includes an article:
- `WipArticle.included_in_report = True`
- `ReportArticleAssociation.is_hidden = False`

---

## Stats Calculation

The curation view computes stats from WipArticle state:

```python
for wip in all_wip_articles:
    if wip.is_duplicate:
        pipeline_duplicate_count += 1
        continue  # Don't count in filtered
    elif wip.passed_semantic_filter:
        pipeline_included_count += 1
    else:
        pipeline_filtered_count += 1
```

**Display:** `{total} → -{duplicates} dup → -{filtered} filt → {included}`

**Example:** `20 → -3 dup → -16 filt → 1`

Verification: `20 - 3 - 16 = 1` ✓

---

## Query Reference

| Method | Criteria | Used By |
|--------|----------|---------|
| `get_by_execution_id(exec_id)` | All articles | Dedup stage, stats |
| `get_for_filtering(exec_id, query_id)` | Non-dup, not yet filtered, specific query | Filter stage |
| `get_passed_filter(exec_id)` | Non-dup, passed filter | Mark for inclusion |
| `get_included_articles(exec_id)` | `included_in_report=True` | Report generation |
