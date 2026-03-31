# PubMed Dates Reference

Single source of truth for PubMed date concepts, XML fields, and search behavior.

For how we handle dates in our application, see [Article Dates](../../backend/docs/article_dates.md).

---

## 1. XML Date Fields

Every date in PubMed originates from one of these XML fields. This is the ground truth that all query terms and API parameters derive from.

| # | XML Element | Full Path | Required? | Precision | Meaning |
|---|-------------|-----------|-----------|-----------|---------|
| 1 | **PubDate** | `MedlineCitation/Article/Journal/JournalIssue/PubDate` | **Always present** | Variable (see below) | Official journal issue date. The only date field guaranteed on every record. |
| 2 | **ArticleDate** | `MedlineCitation/Article/ArticleDate[@DateType="Electronic"]` | Optional | Always Y/M/D | Electronic publication date — when the article first went online. Common from ~2005+, absent on older records. |
| 3 | **DateCompleted** | `MedlineCitation/DateCompleted` | Optional | Always Y/M/D | When MEDLINE indexing was completed. |
| 4 | **DateRevised** | `MedlineCitation/DateRevised` | Optional | Always Y/M/D | When the record was last modified/updated. |
| 5 | **PubMedPubDate** `entrez` | `PubmedData/History/PubMedPubDate[@PubStatus="entrez"]` | **Always present** | Always Y/M/D | When the record was added to PubMed. Confirmed by [NLM](https://www.nlm.nih.gov/pubs/techbull/jf01/jf01_technote_small_number_of_pubmed_citations_beta.html): "All PubMed citations have an EDAT." ~4,000 older records had EDAT backfilled to Feb 7, 2001. |
| 6 | **PubMedPubDate** `pubmed` | `PubmedData/History/PubMedPubDate[@PubStatus="pubmed"]` | Present on all tested records | Always Y/M/D | When the PubMed record was created. Usually same date as `entrez`. |
| 7 | **PubMedPubDate** `medline` | `PubmedData/History/PubMedPubDate[@PubStatus="medline"]` | Only on MEDLINE-indexed records | Always Y/M/D | When MeSH terms were added. Can lag months behind entry. |
| 8 | **PubMedPubDate** `received` | `PubmedData/History/PubMedPubDate[@PubStatus="received"]` | Optional | Always Y/M/D | When the journal received the manuscript. |
| 9 | **PubMedPubDate** `accepted` | `PubmedData/History/PubMedPubDate[@PubStatus="accepted"]` | Optional | Always Y/M/D | When the journal accepted the manuscript. |

**Guaranteed fields:** Every PubMed record has at least **PubDate** (#1) and **entrez** (#5). This means every record is searchable by both publication date and entry date.

**PubDate precision variants** (all valid, any may appear):

| Format | Example XML | Resolved as |
|--------|-------------|-------------|
| Year + Month + Day | `<Year>2026</Year><Month>03</Month><Day>18</Day>` | March 18, 2026 |
| Year + Month | `<Year>2026</Year><Month>Mar</Month>` | **March 1, 2026** (day defaults to 1st) |
| Year only | `<Year>2026</Year>` | **January 1, 2026** (month defaults to Jan) |
| Year + Season | `<Year>2025</Year><Season>Oct-Dec</Season>` | **October 1, 2025** (first month of season) |
| MedlineDate | `<MedlineDate>2024 Jan-Mar</MedlineDate>` | **January 1, 2024** (first month of range) |

PubMed Help confirms: "Publication dates without a day are set to the 1st of the month."

---

## 2. Query Date Terms

These are the date terms you can use inside a PubMed search query (inline in the `term` string). Each derives from one or more XML fields.

| Query Term | Derives From (XML) | Meaning | Notes |
|------------|-------------------|---------|-------|
| `[dp]` | **Computed** from #1 PubDate and #2 ArticleDate | Publication date — the earlier of electronic vs print | Virtual field. See derivation rules below. Variable precision inherited from PubDate. |
| `[epdat]` | #2 ArticleDate | Electronic publication date only | Empty/unsearchable if ArticleDate absent. |
| `[ppdat]` | #1 PubDate | Print/journal issue date only | Same variable precision as PubDate. |
| `[edat]` | #5 PubMedPubDate `entrez` | When added to PubMed | Always present, always Y/M/D. Most reliable for windowed searches. |
| `[crdt]` | #6 PubMedPubDate `pubmed` | When PubMed record was created | Usually same as `[edat]`. |
| `[mhda]` | #7 PubMedPubDate `medline` | When MeSH terms were added | Can lag months. Only on MEDLINE-indexed records. |
| `[lr]` | #4 DateRevised | When record was last updated | Tracks corrections and metadata changes. |

### `[dp]` Derivation Rules

`[dp]` is a **virtual/computed field** — it doesn't exist in the XML. PubMed computes it:

1. If ArticleDate exists AND is **earlier** than PubDate → `[dp]` matches **both** dates
2. If ArticleDate exists AND is **later** than PubDate → `[dp]` matches **only** PubDate
3. If ArticleDate does not exist → `[dp]` matches only PubDate

When PubDate lacks precision, `[dp]` inherits that imprecision:
- Month-only PubDate → `[dp]` resolves to the **1st of the month**
- Year-only PubDate → `[dp]` resolves to **January 1**

**This makes `[dp]` unreliable for narrow (weekly) date windows.** An article with PubDate "March 2026" resolves to March 1 even if it was indexed March 18.

---

## 3. API Date Type

The E-utilities API has a `datetype` parameter (used with `mindate`/`maxdate`) that maps to a subset of the query date terms.

| `datetype` value | Equivalent query term | Derives from XML |
|-----------------|----------------------|-----------------|
| `pdat` | `[dp]` | Computed: #2 ArticleDate vs #1 PubDate |
| `edat` | `[edat]` | #5 PubMedPubDate `entrez` |
| `mdat` | `[lr]` | #4 DateRevised |

**Only 3 values.** The other 4 query terms (`[epdat]`, `[ppdat]`, `[crdt]`, `[mhda]`) have no `datetype` equivalent.

---

## 4. Using Dates in the API

The E-utilities `esearch` endpoint supports **two independent date filtering mechanisms**. They use the same underlying fields but have different capabilities. Using both applies both filters (additive).

### Mechanism 1: API Parameters (`datetype` + `mindate` + `maxdate`)

Separate query parameters passed alongside `term`:

```
esearch.fcgi?db=pubmed&term=mesothelioma&datetype=edat&mindate=2026/03/15&maxdate=2026/03/21
```

- `datetype`, `mindate`, `maxdate` are top-level query parameters — separate from and in addition to `term`
- Only **3 `datetype` values** for PubMed: `pdat`, `edat`, `mdat` (see Section 3)
- Only **one date range** per request
- Cannot combine date types (no OR logic)
- The API applies this as a filter on top of whatever `term` matches

### Mechanism 2: Inline Query Date Terms (inside the `term` string)

Date filters written directly into the search query string:

```
esearch.fcgi?db=pubmed&term=mesothelioma AND ("2026/03/15"[edat] : "2026/03/21"[edat])
```

- All **7 query date terms** available (see Section 2)
- Can use **OR** to combine multiple date terms in one query
- Can have **multiple date clauses**
- PubMed treats these as part of the search expression — no different from any other search term

### Why We Use Mechanism 2

Our defensive search strategy requires combining date terms with OR logic, which is only possible with inline query terms:

```
mesothelioma AND (("2026/03/15"[edat] : "2026/03/21"[edat]))
```

The API parameter approach can only filter by one date type per request.

### Date Format

`YYYY/MM/DD` — month and day are optional (`YYYY` and `YYYY/MM` also valid).

### Sorting

| Sort Value | What It Does |
|------------|--------------|
| _(omitted)_ | Relevance (default) |
| `pub_date` | Publication Date (newest first) |
| `Author` | Author name (A-Z) |
| `JournalName` | Journal title (A-Z) |

---

## 5. Timing Pitfalls

### Pitfall 1: Month-Only PubDate

Many articles have PubDate with only year+month. `[dp]`/`pdat` treats these as the 1st of the month. If the article is indexed mid-month, a weekly pipeline searching via `[dp]` misses it.

**Example (PMID 41849731):**
- PubDate: `March 2026` (no day) → `[dp]` resolves to March 1
- EDAT: March 18 (actual indexing)
- Pipeline searching March 15-21 via `[dp]` → **misses the article**

### Pitfall 2: Entry Date Lag

Articles may be published days or weeks before PubMed indexes them. An article with PubDate `Feb 28` might not get an EDAT until `March 11`.

**Impact:** A February pipeline run can't find the article (not indexed yet). A March pipeline searching `[dp]` for March dates also can't find it (PubDate is in February).

### Pitfall 3: Future PubDates

Some articles have a PubDate in a **future** month (e.g., PubDate=April, but EDAT=March). The article is indexed and findable in March, but `[dp]` slots it into April.

### Pitfall 4: Electronic vs Print Ordering

When ArticleDate is **later** than PubDate, `[dp]` uses only PubDate. The electronic date is invisible to `[dp]` searches.

---

## 6. Our Implementation

### Pipeline Search Strategy

The pipeline searches by `[edat]` (entry date) — the date the article was actually added to PubMed. This avoids all pitfalls related to imprecise PubDates.

Additionally, an **EDAT catch-up** step runs at the end of retrieval, searching EDAT-only for the prior 28 days to catch articles that were indexed late.

### What We Store

| Stored Field | Source | Purpose |
|-------------|--------|---------|
| `pub_year`, `pub_month`, `pub_day` | Earlier of PubDate vs ArticleDate (mirrors `[dp]` logic) | Display — the date users see for the article |
| `entry_date` | PubMedPubDate `entrez` (EDAT) | Search/pipeline — when the article became findable in PubMed |

**pub_year/pub_month/pub_day algorithm:**
1. Parse year/month/day from PubDate (month may be text like "Jan", day may be absent)
2. If ArticleDate exists, parse its year/month/day
3. Compare using tuples — missing month/day default to 12/28 (biasing toward "later" so imprecise dates don't spuriously win)
4. Use whichever is earlier

### Search Date Field Mapping

```python
# In pubmed_service.py
date_field_map = {
    "publication": "DP",   # [dp] — combined electronic + print
    "entry": "EDAT",       # [edat] — when added to PubMed
    "completion": "DCOM",  # [dcom] — no API datetype equivalent
    "revised": "LR"        # [lr] — last modified
}
```

---

## 7. Verified Behavior (PMID 41849731)

Tested March 29, 2026. Article: PubDate=Mar 2026 (no day), ArticleDate=Mar 18, EDAT=Mar 18.

| Method | Mar 1-7 | Mar 15-21 | Explanation |
|--------|---------|-----------|-------------|
| `pdat` / `[dp]` | **YES** | no | Month-only PubDate → treated as Mar 1 |
| `edat` / `[edat]` | no | **YES** | Entrez date = Mar 18 |
| `mdat` / `[lr]` | no | **YES** | Last revised = Mar 18 |
| `[epdat]` | no | **YES** | Electronic pub = Mar 18 |
| `[crdt]` | no | **YES** | Create date = Mar 18 |
| `[mhda]` | no | **YES** | MeSH date = Mar 18 |

---

## 8. Audit Results

See [date-loophole-audit-2026-03-29.md](date-loophole-audit-2026-03-29.md) for a detailed audit of articles missed in March 2026 due to `[dp]`-only searching. Summary: 39 articles (13.1%) were missed.

---

## 9. API Constraints

| Limit | Value |
|-------|-------|
| Max results per query | 10,000 |
| Rate limit | 3 req/sec (10 with API key) |

---

## 10. External Resources

- [PubMed Help - Date Searching](https://pubmed.ncbi.nlm.nih.gov/help/#date-search)
- [E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
- [Search Field Tags](https://www.ncbi.nlm.nih.gov/books/NBK49540/)
- [PubMedPubDate DTD](https://dtd.nlm.nih.gov/ncbi/pubmed/doc/out/180101/el-PubMedPubDate.html)
- [NLM Tech Bulletin - EDAT requirement](https://www.nlm.nih.gov/pubs/techbull/jf01/jf01_technote_small_number_of_pubmed_citations_beta.html)
