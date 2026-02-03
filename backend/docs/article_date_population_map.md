# Article Date Population Map

Companion to `article_date_field_analysis.md`. This document maps every article type object, its date fields, and exactly where those values come from.

---

## 0. Architecture Overview: CanonicalPubMedArticle vs CanonicalResearchArticle

### The Two Canonical Types

| Type | Purpose | Lifespan | Used By |
|------|---------|----------|---------|
| **CanonicalPubMedArticle** | PubMed-specific intermediate | Transient (created then immediately converted) | Only converters |
| **CanonicalResearchArticle** | Universal article interface | Persistent (used everywhere) | All APIs, services, frontend |

### Why Both Exist

```
PubMedArticle (parsing)
       │
       ▼
CanonicalPubMedArticle ─────► Holds PubMed-specific metadata in structured form
       │                      (metadata dict with article_date, pub_date, etc.)
       │
       ▼
CanonicalResearchArticle ───► Universal interface for ALL article sources
       │                      (PubMed, Google Scholar, future sources)
       │
       ▼
[All downstream: APIs, WipArticle, Article, Frontend]
```

**CanonicalPubMedArticle exists to:**
1. Validate PubMed-specific data before conversion
2. Preserve source-specific metadata in the `metadata` dict
3. Allow reverse conversion back to source format if needed

**CanonicalResearchArticle is used because:**
1. Frontend components don't care if article is from PubMed or Scholar
2. Pipeline processes articles uniformly regardless of source
3. Storage (WipArticle, Article) uses same schema for all sources

### Backend Usage

| Type | Files Using It | Primary Use |
|------|----------------|-------------|
| CanonicalPubMedArticle | 5 files | Intermediate conversion step |
| CanonicalResearchArticle | 18 files | All API responses, services, storage |

**CanonicalPubMedArticle usage:**
- `research_article_converters.py` - created and converted
- `pubmed_service.py` - created during search
- `routers/tools.py` - created for tool responses
- `routers/tablizer.py` - created for tablizer
- `canonical_types.py` - definition + CanonicalExtractionItem.original_article

**CanonicalResearchArticle usage:**
- All `/api/pubmed/*` responses
- All `/api/google-scholar/*` responses
- All `/api/retrieval-testing/*` responses
- `wip_article_service.create_wip_articles()` input
- `article_service.get_article_by_pmid()` return type
- Frontend API types

### Frontend Usage

| Type | Defined | Actually Used |
|------|---------|---------------|
| CanonicalPubMedArticle | `types/canonical_types.ts:136` | **NEVER** (dead code) |
| CanonicalResearchArticle | `types/canonical_types.ts:39` | Everywhere |

The frontend only ever receives and uses `CanonicalResearchArticle`. The `CanonicalPubMedArticle` type exists in frontend types but is never imported or used by any component or API file.

### Frontend vs Backend Type Mapping

| Backend | Frontend | Notes |
|---------|----------|-------|
| CanonicalResearchArticle | CanonicalResearchArticle | 1:1 mirror, same fields |
| CanonicalPubMedArticle | (not on FE) | Backend-only transient type |
| CanonicalScholarArticle | (not on FE) | Backend-only transient type |
| WipArticle (model) | WipArticle | FE missing publication_date |
| Article (model) | Article | 1:1 mirror |
| ReportArticle | ReportArticle | 1:1 mirror |

### Implications for Date Fields

The conversion from CanonicalPubMedArticle → CanonicalResearchArticle is where date information gets lost:

```python
# research_article_converters.py:112
publication_date=metadata.get('pub_date') or pubmed_article.publication_date,
```

The `metadata` dict contains `article_date` (electronic publication), but it's never used. Only `pub_date` (print) flows through to CanonicalResearchArticle and everything downstream.

---

## 1. Object Summary Table

| # | Object | Location | Date Fields | Primary Source | Issue |
|---|--------|----------|-------------|----------------|-------|
| 1 | PubMedArticle | `services/pubmed_service.py:30` | article_date, pub_date, entry_date, comp_date, date_revised, year | PubMed XML | None - parses all dates |
| 2 | CanonicalPubMedArticle | `schemas/canonical_types.py:182` | publication_date, metadata{} | PubMedArticle | Uses pub_date, ignores article_date |
| 3 | CanonicalResearchArticle | `schemas/canonical_types.py:58` | publication_date, publication_year, date_completed, date_revised, date_entered, date_published | CanonicalPubMedArticle | publication_date=pub_date; date_published redundant |
| 4 | WipArticle (model) | `models.py:284` | publication_date, year | CanonicalResearchArticle | Inherits pub_date issue |
| 5 | WipArticle (schema) | `schemas/research_stream.py:318` | year | WipArticle model | Missing publication_date field |
| 6 | Article (model) | `models.py:346` | publication_date, comp_date, year | WipArticle | Inherits pub_date issue |
| 7 | Article (schema) | `schemas/article.py:12` | publication_date, comp_date, year | Article model | None |
| 8 | ReportArticle | `schemas/report.py:34` | publication_date, year | Article model | Uses year only, not publication_date |

---

## 2. Object Details

### 2.1 PubMedArticle

**Location:** `backend/services/pubmed_service.py:30`

**Purpose:** Parse raw PubMed XML into Python object

**Date Fields:**

| Field | XML Source | Format | Semantic |
|-------|------------|--------|----------|
| `article_date` | `ArticleDate[@DateType="Electronic"]` | YYYY-MM-DD | When article went online |
| `pub_date` | `JournalIssue/PubDate` | YYYY-MM-DD | Official print publication |
| `entry_date` | `PubMedPubDate[@PubStatus="entrez"]` | YYYY-MM-DD | When added to PubMed |
| `comp_date` | `DateCompleted` | YYYY-MM-DD | When MEDLINE indexing completed |
| `date_revised` | `DateRevised` | YYYY-MM-DD | When record last revised |
| `year` | `PubDate/Year` | YYYY | Publication year (from print) |

**Population Logic:**
```python
# from_xml() classmethod, lines 50-221
article_date_node = article_node.find(".//ArticleDate")
pubdate_node = journal_issue_node.find(".//PubDate")
entry_date_node = history_node.find('.//PubMedPubDate[@PubStatus="entrez"]')
```

**Status:** Correctly parses all date fields from XML.

---

### 2.2 CanonicalPubMedArticle

**Location:** `backend/schemas/canonical_types.py:182`

**Purpose:** Validated Pydantic schema for PubMed articles

**Date Fields:**

| Field | Type | Semantic |
|-------|------|----------|
| `publication_date` | Optional[str] | Generic publication date |
| `metadata` | Dict | Contains article_date, pub_date, entry_date, comp_date, date_revised |

**Population Points:**

| Location | Line | Code | Source Used |
|----------|------|------|-------------|
| `research_article_converters.py` | 55 | `publication_date=publication_date` | Year only (from article.year) |
| `pubmed_service.py` | 540 | `publication_date=article.pub_date` | pub_date (print) |
| `routers/tools.py` | 203 | `publication_date=article.pub_date` | pub_date (print) |
| `routers/tablizer.py` | 97 | `publication_date=article.pub_date` | pub_date (print) |

**Issue:** `article_date` is stored in metadata but never used for `publication_date`.

---

### 2.3 CanonicalResearchArticle

**Location:** `backend/schemas/canonical_types.py:58`

**Purpose:** Unified schema for all article sources (PubMed, Scholar, etc.)

**Date Fields:**

| Field | Type | Semantic | Populated From |
|-------|------|----------|----------------|
| `publication_date` | Optional[str] | Primary display date | metadata['pub_date'] |
| `publication_year` | Optional[int] | Year only | Extracted from publication_date |
| `date_completed` | Optional[str] | MEDLINE completion | metadata['comp_date'] |
| `date_revised` | Optional[str] | Last revision | metadata['date_revised'] |
| `date_entered` | Optional[str] | PubMed entry | metadata['entry_date'] |
| `date_published` | Optional[str] | "Full precision" | metadata['pub_date'] |

**Population Points:**

| Location | Line | Code |
|----------|------|------|
| `research_article_converters.py` | 112 | `publication_date=metadata.get('pub_date') or pubmed_article.publication_date` |
| `research_article_converters.py` | 118 | `date_published=metadata.get('pub_date')` |
| `retrieval_testing_service.py` | 210 | `publication_date=pm_article.pub_date` |

**Issues:**
1. `publication_date` uses pub_date (print), ignoring article_date (electronic)
2. `date_published` is identical to `publication_date` - redundant
3. `article_date` from metadata is never exposed

---

### 2.4 WipArticle (model)

**Location:** `backend/models.py:284`

**Purpose:** Pipeline intermediate storage in database

**Date Fields:**

| Column | Type | Semantic |
|--------|------|----------|
| `publication_date` | Date | Publication date |
| `year` | String(4) | Publication year |
| `retrieved_at` | DateTime | When we retrieved it |
| `created_at` | DateTime | When DB record created |

**Population Point:**

| Location | Line | Code |
|----------|------|------|
| `wip_article_service.py` | 224 | `publication_date=pub_date` |

Where `pub_date` comes from:
```python
# wip_article_service.py:209-212
pub_date = None
if article.publication_date:  # article is CanonicalResearchArticle
    pub_date = datetime.fromisoformat(article.publication_date).date()
```

**Issue:** Inherits pub_date from CanonicalResearchArticle.

---

### 2.5 WipArticle (schema)

**Location:** `backend/schemas/research_stream.py:318`

**Purpose:** API response schema for WIP articles

**Date Fields:**

| Field | Type | Semantic |
|-------|------|----------|
| `year` | Optional[str] | Publication year |

**Issue:** No `publication_date` field - frontend cannot display full date for WIP articles.

---

### 2.6 Article (model)

**Location:** `backend/models.py:346`

**Purpose:** Permanent article storage in database

**Date Fields:**

| Column | Type | Semantic |
|--------|------|----------|
| `publication_date` | Date | Publication date |
| `comp_date` | Date | MEDLINE completion date |
| `year` | String(4) | Publication year |
| `first_seen` | DateTime | When first seen by system |
| `last_updated` | DateTime | When last updated |

**Population Point:**

| Location | Line | Code |
|----------|------|------|
| `article_service.py` | 125 | `publication_date=wip_article.publication_date` |

**Issue:** Inherits pub_date chain from WipArticle.

---

### 2.7 Article (schema)

**Location:** `backend/schemas/article.py:12`

**Purpose:** API response schema for articles

**Date Fields:**

| Field | Type | Semantic |
|-------|------|----------|
| `publication_date` | Optional[date] | Publication date |
| `comp_date` | Optional[date] | Completion date |
| `year` | Optional[str] | Publication year |
| `first_seen` | datetime | When first seen |
| `last_updated` | datetime | When last updated |

**Population:** Direct mapping from Article model via `from_attributes = True`.

---

### 2.8 ReportArticle

**Location:** `backend/schemas/report.py:34`

**Purpose:** Article representation within reports

**Date Fields:**

| Field | Type | Semantic |
|-------|------|----------|
| `publication_date` | Optional[str] | Publication date |
| `year` | Optional[str] | Publication year |

**Population Points:**

| Location | Line | Code | Source |
|----------|------|------|--------|
| `report_service.py` | 1088 | `publication_date=str(article.year)` | Year only |
| `routers/reports.py` | 179 | `publication_date=info.article.publication_date.isoformat()` | Full date |
| `operations_service.py` | 335 | `year=article.year` | Year only (no publication_date) |

**Issue:** Inconsistent - sometimes uses year only, sometimes full date.

---

## 3. Data Flow Diagram

```
PubMed XML
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ PubMedArticle                                           │
│   article_date = "2026-01-07" (electronic)              │
│   pub_date = "2026-02-01" (print)                       │
│   entry_date, comp_date, date_revised, year             │
└─────────────────────────────────────────────────────────┘
    │
    │  legacy_article_to_canonical_pubmed()
    │  pubmed_service.py:534
    │  routers/tools.py:197
    │  routers/tablizer.py:91
    ▼
┌─────────────────────────────────────────────────────────┐
│ CanonicalPubMedArticle                                  │
│   publication_date = pub_date ← USES PRINT DATE        │
│   metadata = {                                          │
│     'article_date': '2026-01-07',  ← IGNORED           │
│     'pub_date': '2026-02-01',                          │
│     'entry_date': ..., 'comp_date': ...                │
│   }                                                     │
└─────────────────────────────────────────────────────────┘
    │
    │  pubmed_to_research_article()
    ▼
┌─────────────────────────────────────────────────────────┐
│ CanonicalResearchArticle                                │
│   publication_date = metadata['pub_date'] ← PRINT DATE │
│   date_published = metadata['pub_date'] ← REDUNDANT    │
│   date_entered = metadata['entry_date']                │
│   date_completed = metadata['comp_date']               │
│   date_revised = metadata['date_revised']              │
└─────────────────────────────────────────────────────────┘
    │
    │  wip_article_service.create_wip_articles()
    ▼
┌─────────────────────────────────────────────────────────┐
│ WipArticle (model)                                      │
│   publication_date = 2026-02-01 ← INHERITS PRINT DATE  │
│   year = "2026"                                         │
└─────────────────────────────────────────────────────────┘
    │
    │  article_service.get_or_create_article()
    ▼
┌─────────────────────────────────────────────────────────┐
│ Article (model)                                         │
│   publication_date = 2026-02-01 ← INHERITS PRINT DATE  │
│   year = "2026"                                         │
│   comp_date = ...                                       │
└─────────────────────────────────────────────────────────┘
    │
    │  report_service (email builder)
    ▼
┌─────────────────────────────────────────────────────────┐
│ ReportArticle                                           │
│   publication_date = "2026" ← YEAR ONLY (line 1088)    │
│   OR                                                    │
│   publication_date = "2026-02-01" (line 179)           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Summary of Issues

| Issue | Affected Objects | Root Cause Location |
|-------|------------------|---------------------|
| article_date ignored | All downstream | `pubmed_service.py:540`, `research_article_converters.py:112` |
| date_published redundant | CanonicalResearchArticle | `research_article_converters.py:118` |
| WipArticle schema missing publication_date | Frontend WIP display | `schemas/research_stream.py:318` |
| ReportArticle inconsistent | Report display | `report_service.py:1088` vs `routers/reports.py:179` |
