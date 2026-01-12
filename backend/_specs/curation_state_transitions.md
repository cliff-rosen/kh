# Curation State Transitions

This document specifies all database state changes for curation operations.

---

## Tables Involved

| Table | Key Fields |
|-------|------------|
| `WipArticle` | `included_in_report`, `curator_included`, `curator_excluded` |
| `ReportArticleAssociation` | `curator_added`, `curator_excluded` |
| `Article` | (created when needed) |

---

## Starting States

### Pipeline Included
Article passed semantic filter and is visible in the report.

```
WipArticle:
  included_in_report: true
  passed_semantic_filter: true
  curator_included: false
  curator_excluded: false

ReportArticleAssociation:
  EXISTS
  curator_added: false
  curator_excluded: false

Article:
  EXISTS
```

**UI Location**: Included tab (no badge, or "Pipeline" indicator)

---

### Pipeline Filtered
Article failed semantic filter and is not in the report.

```
WipArticle:
  included_in_report: false
  passed_semantic_filter: false
  curator_included: false
  curator_excluded: false

ReportArticleAssociation:
  DOES NOT EXIST

Article:
  MAY OR MAY NOT EXIST
```

**UI Location**: Filtered Out tab (no badge)

---

## Transitions

### 1. Curator Adds Filtered Article

**Action**: User clicks "+" on article in Filtered Out tab
**Endpoint**: `POST /reports/{id}/articles/include`
**Method**: `include_article()`

**From State**: Pipeline Filtered
**To State**: Curator Added

```
WipArticle:
  included_in_report: false → true
  curator_included: false → true
  curator_excluded: (unchanged)

ReportArticleAssociation:
  DOES NOT EXIST → CREATED
  curator_added: true
  curator_excluded: false

Article:
  CREATED if doesn't exist
```

**UI Location After**: Included tab ("Curator Added" badge)

---

### 2. Curator Undoes Add (removes curator-added article)

**Action**: User clicks "-" on curator-added article in Included tab, OR clicks "Reset" in Curated tab
**Endpoint**: `POST /reports/{id}/articles/{id}/exclude` (detects curator_added) OR `POST /reports/{id}/articles/{wip_id}/reset-curation`
**Method**: `exclude_article()` (with curator_added detection) OR `reset_curation()`

**From State**: Curator Added
**To State**: Pipeline Filtered (restored to original)

```
WipArticle:
  included_in_report: true → false
  curator_included: true → false
  curator_excluded: (unchanged)

ReportArticleAssociation:
  EXISTS → DELETED

Article:
  UNCHANGED (not deleted)
```

**UI Location After**: Filtered Out tab (no badge)

---

### 3. Curator Excludes Pipeline-Included Article

**Action**: User clicks "-" on pipeline-included article in Included tab
**Endpoint**: `POST /reports/{id}/articles/{id}/exclude`
**Method**: `exclude_article()`

**From State**: Pipeline Included
**To State**: Curator Excluded

```
WipArticle:
  included_in_report: true → false
  curator_included: (unchanged)
  curator_excluded: false → true

ReportArticleAssociation:
  EXISTS (preserved for undo)
  curator_added: (unchanged, false)
  curator_excluded: false → true

Article:
  UNCHANGED
```

**UI Location After**: Filtered Out tab ("Curator Excluded" badge)

---

### 4. Curator Undoes Exclude (restores pipeline-included article)

**Action**: User clicks "+" on curator-excluded article in Filtered Out tab, OR clicks "Reset" in Curated tab
**Endpoint**: `POST /reports/{id}/articles/include` (detects existing association) OR `POST /reports/{id}/articles/{wip_id}/reset-curation`
**Method**: `include_article()` OR `reset_curation()`

**From State**: Curator Excluded
**To State**: Pipeline Included (restored to original)

```
WipArticle:
  included_in_report: false → true
  curator_included: (unchanged)
  curator_excluded: true → false

ReportArticleAssociation:
  EXISTS (was preserved)
  curator_added: (unchanged, false)
  curator_excluded: true → false

Article:
  UNCHANGED
```

**UI Location After**: Included tab (no badge, back to "Pipeline")

---

## State Summary Table

| State | WipArticle.included_in_report | WipArticle.curator_included | WipArticle.curator_excluded | Association Exists | Association.curator_added | Association.curator_excluded | UI Tab | Badge |
|-------|------------------------------|-----------------------------|-----------------------------|-------------------|---------------------------|------------------------------|--------|-------|
| Pipeline Included | true | false | false | YES | false | false | Included | (none) |
| Pipeline Filtered | false | false | false | NO | - | - | Filtered | (none) |
| Curator Added | true | true | false | YES | true | false | Included | "Curator Added" |
| Curator Excluded | false | false | true | YES | false | true | Filtered | "Curator Excluded" |

---

## Invalid States

These combinations should never occur:

| Invalid State | Why |
|---------------|-----|
| `curator_added=true` AND `curator_excluded=true` | Can't add and exclude same article |
| `curator_included=true` AND `curator_excluded=true` | Mutually exclusive flags |
| `included_in_report=true` AND `curator_excluded=true` | Excluded means not in report |
| `included_in_report=false` AND `curator_added=true` | Added means in report |

---

## Code Changes Required

### 1. `exclude_article()` - Handle curator-added articles

```python
# After getting association:
if association.curator_added:
    # Undo the add - delete association entirely
    self.association_service.delete(association)
    # Clear WipArticle flag
    if wip_article:
        self.wip_article_service.clear_curator_included(wip_article)
    # Return appropriate result
    return ExcludeArticleResult(
        article_id=article_id,
        excluded=True,
        wip_article_updated=True,
        was_curator_added=True  # NEW FIELD - tells UI this was an undo-add
    )
```

### 2. `get_curation_view()` - Include source indicators

Return `curator_added` and `curator_excluded` flags with each article so frontend can render badges.

### 3. Response models - Add source indicator fields

```python
class CurationIncludedArticle:
    # ... existing fields ...
    curator_added: bool  # True = curator override, False = pipeline included

class CurationFilteredArticle:
    # ... existing fields ...
    curator_excluded: bool  # True = was in report, curator removed
```
