# Article Date Field Analysis

This document analyzes all date fields across our article data structures, identifies inconsistencies, and provides a reconciliation plan.

---

## 1. Data Structures Overview

We have four key article data structures, each with date fields:

| Structure | Location | Purpose |
|-----------|----------|---------|
| **PubMed XML Response** | PubMed eFetch API | Raw source data |
| **PubMedArticle** | `services/pubmed_service.py` | Internal parsing class |
| **CanonicalPubMedArticle** | `schemas/canonical_types.py` | PubMed-specific schema |
| **CanonicalResearchArticle** | `schemas/canonical_types.py` | Unified schema for all sources |

Additionally, we have database models:
| Structure | Location | Purpose |
|-----------|----------|---------|
| **WipArticle** | `models.py` | Pipeline intermediate storage |
| **Article** | `models.py` | Permanent article storage |

---

## 2. Date Fields by Structure

### 2.1 PubMed XML Response (Source)

| XML Element | Example (PMID 41501212) | Semantic Meaning |
|-------------|-------------------------|------------------|
| `Article/ArticleDate[@DateType="Electronic"]` | 2026-01-07 | **When article went online** (ahead of print) |
| `JournalIssue/PubDate` | 2026-02 (Feb) | Official journal issue date (print) |
| `MedlineCitation/DateCompleted` | 2026-01-28 | When MEDLINE indexing completed |
| `MedlineCitation/DateRevised` | 2026-01-28 | When record was last revised |
| `PubmedData/History/PubMedPubDate[@PubStatus="entrez"]` | 2026-01-07 | When added to PubMed |
| `PubmedData/History/PubMedPubDate[@PubStatus="pubmed"]` | 2026-01-08 | When PubMed record was created |
| `PubmedData/History/PubMedPubDate[@PubStatus="received"]` | 2025-09-12 | When journal received manuscript |
| `PubmedData/History/PubMedPubDate[@PubStatus="accepted"]` | 2025-12-15 | When journal accepted manuscript |

**Key insight**: `ArticleDate` (electronic) is when users can actually access the article. `PubDate` (print) may be weeks or months later.

### 2.2 PubMedArticle (Internal Class)

Location: `services/pubmed_service.py`

| Field | XML Source | Format | Example |
|-------|-----------|--------|---------|
| `article_date` | `ArticleDate` | YYYY-MM-DD | "2026-01-07" |
| `pub_date` | `JournalIssue/PubDate` | YYYY-MM-DD | "2026-02-01" |
| `entry_date` | `PubMedPubDate[@PubStatus="entrez"]` | YYYY-MM-DD | "2026-01-07" |
| `comp_date` | `DateCompleted` | YYYY-MM-DD | "2026-01-28" |
| `date_revised` | `DateRevised` | YYYY-MM-DD | "2026-01-28" |
| `year` | `PubDate/Year` | YYYY | "2026" |

**Note**: All dates are parsed and normalized to YYYY-MM-DD format. Missing day defaults to "01".

### 2.3 CanonicalPubMedArticle (PubMed Schema)

Location: `schemas/canonical_types.py`

| Field | Currently Set From | Semantic |
|-------|-------------------|----------|
| `publication_date` | `pub_date` | Generic publication date |
| `metadata.article_date` | `article_date` | Electronic publication |
| `metadata.pub_date` | `pub_date` | Print publication |
| `metadata.entry_date` | `entry_date` | PubMed entry |
| `metadata.comp_date` | `comp_date` | MEDLINE completion |
| `metadata.date_revised` | `date_revised` | Last revision |

**Issue**: `publication_date` uses `pub_date` (print), but `article_date` (electronic) is often more relevant.

### 2.4 CanonicalResearchArticle (Unified Schema)

Location: `schemas/canonical_types.py`

| Field | Currently Set From | Semantic | Issue |
|-------|-------------------|----------|-------|
| `publication_date` | `metadata['pub_date']` | Primary display date | Uses print date, not electronic |
| `publication_year` | Extracted from year | Year only | OK |
| `date_completed` | `metadata['comp_date']` | MEDLINE completion | OK |
| `date_revised` | `metadata['date_revised']` | Last revision | OK |
| `date_entered` | `metadata['entry_date']` | PubMed entry | OK |
| `date_published` | `metadata['pub_date']` | "Full precision" | **REDUNDANT** with publication_date |

**Issues**:
1. `publication_date` and `date_published` are identical - redundant
2. `article_date` is not exposed at this level
3. No field for electronic vs print distinction

### 2.5 WipArticle (Database Model)

Location: `models.py`

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `publication_date` | Date | `CanonicalResearchArticle.publication_date` | Inherits issues above |
| `year` | String(4) | Separate field | OK |

**Frontend type** (`types/research-stream.ts`): Only has `year`, not `publication_date`.

### 2.6 Article (Database Model)

Location: `models.py`

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `publication_date` | Date | From WipArticle | Inherits issues |
| `comp_date` | Date | Completion date | OK |
| `year` | String(4) | Publication year | OK |

**Frontend type** (`types/article.ts`): Has `publication_date`, `comp_date`, `year`.

---

## 3. PubMed Search/API Date Handling

### 3.1 Search Date Types

| Search Tag | Field | Description |
|------------|-------|-------------|
| `[dp]` | Publication Date | **Matches BOTH ArticleDate and PubDate** when ArticleDate is earlier |
| `[edat]` | Entrez Date | When added to PubMed (used for "Most Recent" sort) |
| `[crdt]` | Create Date | When record created |
| `[epdat]` | Electronic Publication | ArticleDate only |
| `[ppdat]` | Print Publication | PubDate only |

### 3.2 Our Current Search Implementation

In `pubmed_service.py`, `_get_date_clause()`:

```python
date_field_map = {
    "completion": "DCOM",
    "publication": "DP",    # Default - matches both ArticleDate and PubDate
    "entry": "EDAT",
    "revised": "LR"
}
```

**Behavior**: When we search with `[dp]`, PubMed returns articles where ArticleDate OR PubDate falls in the range. For articles with early electronic publication, this means searching "Jan 1-7" returns articles with ArticleDate=Jan 7 even if PubDate=Feb.

---

## 4. UI Date Usage Points

### 4.1 Date Display (Showing to Users)

| Component | File | Date Field Used | Display Format |
|-----------|------|-----------------|----------------|
| Article Viewer Modal | `ArticleViewerModal.tsx` | `publication_date` | "Jan 7, 2026" |
| Report Article Card | `ReportArticleCard.tsx` | `publication_date` | "Jan 7, 2026" |
| PubMed Table | `PubMedTable.tsx` | `publication_date` | Column "Date" |
| Report Article Table | `ReportArticleTable.tsx` | `publication_date` | Varies |

### 4.2 Date Filtering/Search (User Input)

| Component | File | Date Fields | Purpose |
|-----------|------|-------------|---------|
| PubMed Search Form | `PubMedSearchForm.tsx` | `startDate`, `endDate`, `dateType` | Filter search results |
| Run Job Modal | `RunJobModal.tsx` | `start_date`, `end_date` | Pipeline date range |
| Query Refinement Workbench | `QueryRefinementWorkbench.tsx` | Date range inputs | Test queries |
| Retrieval Config | `RetrievalConfigForm.tsx` | Date configuration | Stream settings |

### 4.3 Date Type Selection

`PubMedSearchForm.tsx` allows users to choose:
- `publication` - Uses `[dp]` (matches ArticleDate and PubDate)
- `entry` - Uses `[edat]` (matches entry date)

---

## 5. The Problem

### 5.1 Mismatch Between Search and Display

```
User searches: "Articles from Jan 1-7, 2026"
PubMed returns: Article with ArticleDate=Jan 7, PubDate=Feb 2026
We display: publication_date = Feb 2026 (from PubDate)
User sees: "Why is this February article in my January results?"
```

### 5.2 Data Flow Showing the Issue

```
Search: [dp] matches ArticleDate (2026-01-07) ✓
    ↓
XML: ArticleDate = 2026-01-07, PubDate = 2026-02
    ↓
PubMedArticle: article_date = "2026-01-07", pub_date = "2026-02-01"
    ↓
CanonicalPubMedArticle: publication_date = pub_date = "2026-02-01"  ✗
    ↓
CanonicalResearchArticle: publication_date = "2026-02-01"  ✗
    ↓
WipArticle/Article: publication_date = 2026-02-01  ✗
    ↓
UI: Displays "Feb 1, 2026"  ✗
```

### 5.3 Redundant Fields

`CanonicalResearchArticle` has:
- `publication_date` - set to pub_date
- `date_published` - also set to pub_date

These are identical and the naming is confusing.

---

## 6. Reconciliation Plan

### 6.1 Semantic Definition

Define clear semantics for each date field:

| Field Name | Semantic | Source Priority |
|------------|----------|-----------------|
| `publication_date` | When article became available to users | ArticleDate > PubDate |
| `publication_date_print` | Official print publication date | PubDate only |
| `date_entered` | When entered into PubMed | entrez |
| `date_completed` | When MEDLINE indexing completed | DateCompleted |
| `date_revised` | When record last revised | DateRevised |

### 6.2 Code Changes Required

#### A. PubMedArticle Parsing (No change needed)
Already parses both `article_date` and `pub_date` correctly.

#### B. CanonicalPubMedArticle Creation

```python
# In pubmed_service.py, when creating CanonicalPubMedArticle:

# CURRENT:
publication_date=article.pub_date if article.pub_date else None,

# CHANGE TO:
publication_date=article.article_date if article.article_date else article.pub_date,
```

#### C. CanonicalResearchArticle Schema

Option 1: Repurpose `date_published`
```python
publication_date: str  # When available (ArticleDate or PubDate)
date_published_print: str  # Official print date (PubDate only)
```

Option 2: Remove `date_published` (it's redundant)
```python
publication_date: str  # When available (ArticleDate or PubDate)
# date_published removed - was duplicate
```

#### D. Converter Update

```python
# In research_article_converters.py:

# CURRENT:
publication_date=metadata.get('pub_date') or pubmed_article.publication_date,
date_published=metadata.get('pub_date') ...

# CHANGE TO:
publication_date=metadata.get('article_date') or metadata.get('pub_date') or pubmed_article.publication_date,
# Remove date_published OR rename to date_published_print=metadata.get('pub_date')
```

### 6.3 Migration Considerations

- Existing data in `wip_articles` and `articles` tables has PubDate values
- May need migration to update `publication_date` for articles where ArticleDate differs
- Or accept that historical data uses PubDate and only new data uses ArticleDate

---

## 7. Summary Table

| Layer | Current Behavior | Correct Behavior |
|-------|-----------------|------------------|
| **Search** | `[dp]` matches ArticleDate | ✓ Correct |
| **PubMedArticle** | Parses both dates | ✓ Correct |
| **CanonicalPubMedArticle** | Uses PubDate | ✗ Should prefer ArticleDate |
| **CanonicalResearchArticle** | Uses PubDate, has redundant field | ✗ Should prefer ArticleDate, remove redundancy |
| **WipArticle/Article** | Inherits PubDate | ✗ Will be fixed by upstream changes |
| **UI Display** | Shows publication_date | ✓ Will show correct date after fix |
| **UI Filter** | Uses `[dp]` | ✓ Correct |

---

## 8. Files to Modify

1. `backend/services/pubmed_service.py` - Line ~540, prefer article_date
2. `backend/schemas/research_article_converters.py` - Lines ~112-118, prefer article_date
3. `backend/schemas/canonical_types.py` - Consider removing/renaming date_published
4. `frontend/src/types/canonical_types.ts` - Mirror backend changes
5. `backend/docs/pubmed_date_fields.md` - Update to reflect new logic
