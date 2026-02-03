# Article Dates

Single source of truth for how we handle article dates in our application.

For PubMed date concepts and XML fields, see [PubMed Dates Reference](../../_specs/search/pubmed-dates-reference.md).

---

## 1. Overview

We handle dates for two purposes:
1. **Searching/sorting** - filtering articles by date range
2. **Display** - showing users when an article became available

The challenge: PubMed has multiple date concepts, and we need clear semantics for mapping them to our fields.

---

## 2. Our Article Type Objects

### Summary Table

| # | Object | Location | Date Fields | Source |
|---|--------|----------|-------------|--------|
| 1 | PubMedArticle | `services/pubmed_service.py` | article_date, pub_date, entry_date, comp_date, date_revised, year | PubMed XML |
| 2 | CanonicalPubMedArticle | `schemas/canonical_types.py` | publication_date, metadata{} | PubMedArticle |
| 3 | CanonicalResearchArticle | `schemas/canonical_types.py` | publication_date, publication_year, date_completed, date_revised, date_entered, date_published | CanonicalPubMedArticle |
| 4 | WipArticle (model) | `models.py` | publication_date, year | CanonicalResearchArticle |
| 5 | WipArticle (schema) | `schemas/research_stream.py` | year | WipArticle model |
| 6 | Article (model) | `models.py` | publication_date, comp_date, year | WipArticle |
| 7 | Article (schema) | `schemas/article.py` | publication_date, comp_date, year | Article model |
| 8 | ReportArticle | `schemas/report.py` | publication_date, year | Article model |

### Type Architecture

```
PubMedArticle (parsing)
       │
       ▼
CanonicalPubMedArticle ─────► Transient intermediate (validates PubMed data)
       │                      metadata dict preserves all dates
       │
       ▼
CanonicalResearchArticle ───► Universal interface for ALL sources
       │                      (PubMed, Google Scholar, future sources)
       │
       ▼
WipArticle ─────────────────► Pipeline intermediate storage
       │
       ▼
Article ────────────────────► Permanent storage
       │
       ▼
ReportArticle ──────────────► Report presentation
```

**Key point:** CanonicalPubMedArticle and CanonicalScholarArticle are backend-only transient types. The frontend only sees CanonicalResearchArticle.

---

## 3. Date Field Details

### 3.1 PubMedArticle

**Location:** `backend/services/pubmed_service.py`

| Field | XML Source | Semantic |
|-------|------------|----------|
| `article_date` | `ArticleDate[@DateType="Electronic"]` | When article went online |
| `pub_date` | `JournalIssue/PubDate` | Official print publication |
| `entry_date` | `PubMedPubDate[@PubStatus="entrez"]` | When added to PubMed |
| `comp_date` | `DateCompleted` | When MEDLINE indexing completed |
| `date_revised` | `DateRevised` | When record last revised |
| `year` | `PubDate/Year` | Publication year |

**Status:** Correctly parses all dates from XML.

### 3.2 CanonicalPubMedArticle

**Location:** `backend/schemas/canonical_types.py`

| Field | Semantic |
|-------|----------|
| `publication_date` | Currently set to pub_date (print) |
| `metadata` | Dict containing article_date, pub_date, entry_date, comp_date, date_revised |

**Population points:**
- `pubmed_service.py:540` - uses `article.pub_date`
- `routers/tools.py:203` - uses `article.pub_date`
- `routers/tablizer.py:97` - uses `article.pub_date`

### 3.3 CanonicalResearchArticle

**Location:** `backend/schemas/canonical_types.py`

| Field | Semantic | Currently Set From |
|-------|----------|-------------------|
| `publication_date` | Primary display date | metadata['pub_date'] |
| `publication_year` | Year only | Extracted from date |
| `date_completed` | MEDLINE completion | metadata['comp_date'] |
| `date_revised` | Last revision | metadata['date_revised'] |
| `date_entered` | PubMed entry | metadata['entry_date'] |
| `date_published` | "Full precision" | metadata['pub_date'] |

**Population point:** `research_article_converters.py:112`

### 3.4 WipArticle (model)

**Location:** `backend/models.py`

| Column | Type | Semantic |
|--------|------|----------|
| `publication_date` | Date | From CanonicalResearchArticle |
| `year` | String(4) | Publication year |

**Population point:** `wip_article_service.py:224`

### 3.5 Article (model)

**Location:** `backend/models.py`

| Column | Type | Semantic |
|--------|------|----------|
| `publication_date` | Date | From WipArticle |
| `comp_date` | Date | MEDLINE completion |
| `year` | String(4) | Publication year |

**Population point:** `article_service.py:125`

### 3.6 ReportArticle

**Location:** `backend/schemas/report.py`

| Field | Type | Semantic |
|-------|------|----------|
| `publication_date` | Optional[str] | Display date |
| `year` | Optional[str] | Publication year |

**Population points:**
- `report_service.py:1088` - uses `str(article.year)` (year only)
- `routers/reports.py:179` - uses `article.publication_date.isoformat()` (full date)

---

## 4. Data Flow Diagram

```
PubMed XML
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ PubMedArticle                                           │
│   article_date = "2026-01-07" (electronic)              │
│   pub_date = "2026-02-01" (print)                       │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ CanonicalPubMedArticle                                  │
│   publication_date = pub_date ← USES PRINT DATE        │
│   metadata = {                                          │
│     'article_date': '2026-01-07',  ← AVAILABLE         │
│     'pub_date': '2026-02-01',                          │
│   }                                                     │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ CanonicalResearchArticle                                │
│   publication_date = pub_date ← PRINT DATE             │
│   date_published = pub_date ← REDUNDANT                │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ WipArticle → Article → ReportArticle                    │
│   publication_date = 2026-02-01 ← INHERITS PRINT DATE  │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Current Issues

### 5.1 Search/Display Mismatch

```
User searches: "Articles from Jan 1-7, 2026"
PubMed returns: Article with ArticleDate=Jan 7, PubDate=Feb 2026
We display: publication_date = Feb 2026 (from PubDate)
User sees: "Why is this February article in my January results?"
```

The `[dp]` search tag matches electronic date, but we display print date.

### 5.2 Issue Summary

| Issue | Affected Objects | Root Cause |
|-------|------------------|------------|
| article_date ignored | All downstream | `research_article_converters.py:112` uses pub_date |
| date_published redundant | CanonicalResearchArticle | Same value as publication_date |
| WipArticle schema missing publication_date | Frontend WIP display | `schemas/research_stream.py:318` |
| ReportArticle inconsistent | Report display | Different code paths use year vs full date |

---

## 6. Recommended Fix

### Semantic Definition

| Field | Should Mean | Source Priority |
|-------|-------------|-----------------|
| `publication_date` | When article became available | ArticleDate > PubDate |
| `date_entered` | When entered into PubMed | entrez |
| `date_completed` | When MEDLINE indexing completed | DateCompleted |
| `date_revised` | When record last revised | DateRevised |

### Code Changes

**1. research_article_converters.py:112**
```python
# Current:
publication_date=metadata.get('pub_date') or pubmed_article.publication_date,

# Change to:
publication_date=metadata.get('article_date') or metadata.get('pub_date') or pubmed_article.publication_date,
```

**2. pubmed_service.py:540**
```python
# Current:
publication_date=article.pub_date if article.pub_date else None,

# Change to:
publication_date=article.article_date if article.article_date else article.pub_date,
```

**3. Similar changes in:**
- `routers/tools.py:203`
- `routers/tablizer.py:97`
- `retrieval_testing_service.py:210`

**4. Remove redundant field:**
- Remove `date_published` from CanonicalResearchArticle (or rename to `date_published_print`)

---

## 7. Files Reference

| File | Purpose |
|------|---------|
| `services/pubmed_service.py` | PubMedArticle parsing, CanonicalPubMedArticle creation |
| `schemas/canonical_types.py` | CanonicalPubMedArticle, CanonicalResearchArticle definitions |
| `schemas/research_article_converters.py` | Conversion between types |
| `services/wip_article_service.py` | WipArticle creation |
| `services/article_service.py` | Article creation |
| `schemas/report.py` | ReportArticle definition |
| `services/report_service.py` | ReportArticle population |

---

## 8. Frontend Types

| Backend | Frontend | Notes |
|---------|----------|-------|
| CanonicalResearchArticle | CanonicalResearchArticle | 1:1 mirror |
| CanonicalPubMedArticle | (not on FE) | Backend-only |
| WipArticle (model) | WipArticle | FE missing publication_date |
| Article (model) | Article | 1:1 mirror |
| ReportArticle | ReportArticle | 1:1 mirror |
