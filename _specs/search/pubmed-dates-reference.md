# PubMed Dates Reference

Single source of truth for PubMed date concepts, XML fields, and search behavior.

For how we handle dates in our application, see [Article Dates](../../backend/docs/article_dates.md).

---

## 1. XML Date Fields (Source of Truth)

Every date in PubMed originates from one of these XML fields. This is the ground truth that all search concepts and API parameters derive from.

### Article-Level Date Fields

These describe when the article was published.

| XML Element | Full Path | Required? | Precision | Meaning |
|-------------|-----------|-----------|-----------|---------|
| **PubDate** | `MedlineCitation/Article/Journal/JournalIssue/PubDate` | **Always present** | Variable (see below) | Official journal issue date — when the print/online issue was published. The only date field guaranteed to exist on every PubMed record. |
| **ArticleDate** | `MedlineCitation/Article/ArticleDate[@DateType="Electronic"]` | Optional | Always Y/M/D when present | Electronic publication date — when the article first became available online. Present on most modern articles (common from ~2005+), absent on older records and some journals. |

**PubDate precision variants** (all valid, any may appear):

| Format | Example XML | Resolved by `[dp]` as |
|--------|-------------|----------------------|
| Year + Month + Day | `<Year>2026</Year><Month>03</Month><Day>18</Day>` | March 18, 2026 |
| Year + Month | `<Year>2026</Year><Month>Mar</Month>` | **March 1, 2026** (day defaults to 1st) |
| Year only | `<Year>2026</Year>` | **January 1, 2026** (month defaults to Jan) |
| Year + Season | `<Year>2025</Year><Season>Oct-Dec</Season>` | **October 1, 2025** (first month of season) |
| MedlineDate | `<MedlineDate>2024 Jan-Mar</MedlineDate>` | **January 1, 2024** (first month of range) |

**Key fact:** When PubDate lacks a day (or month), `[dp]`/`pdat` searches slot it to the **earliest possible date** — the 1st of the month, or January 1 for year-only. This is confirmed by PubMed Help: "Publication dates without a day are set to the 1st of the month."

### Record-Level Date Fields

These describe when PubMed processed the record, not when the article was published.

| XML Element | Full Path | Required? | Precision | Meaning |
|-------------|-----------|-----------|-----------|---------|
| **DateCompleted** | `MedlineCitation/DateCompleted` | Optional | Always Y/M/D | When MEDLINE indexing was completed for this record |
| **DateRevised** | `MedlineCitation/DateRevised` | Optional | Always Y/M/D | When the record was last modified/updated |

### History Dates (PubMedPubDate)

These are under `PubmedData/History/PubMedPubDate[@PubStatus="..."]`. Each has full Y/M/D precision (plus hour/minute) when present.

| PubStatus value | Required? | Meaning |
|-----------------|-----------|---------|
| `entrez` | **Always present** (per [NLM Tech Bulletin](https://www.nlm.nih.gov/pubs/techbull/jf01/jf01_technote_small_number_of_pubmed_citations_beta.html): "All PubMed citations have an EDAT") | When the record was added to PubMed. ~4,000 older records had EDAT backfilled to Feb 7, 2001. For very old records, EDAT may be set to match PubDate. |
| `pubmed` | Present on all tested records | When the PubMed record was created. Usually same date as `entrez`. |
| `medline` | Present on MEDLINE-indexed records | When the MEDLINE record was created (MeSH terms added). |
| `received` | Optional | When the journal received the manuscript from authors |
| `revised` | Optional | When authors submitted a revision |
| `accepted` | Optional | When the journal accepted the manuscript |

**Presence guarantees:**
- `PubDate`: **Always present** (guaranteed by PubMed DTD). Variable precision — may be year-only or month-only.
- `ArticleDate`: Optional — absent on older records and some journals. When present, always has full Y/M/D.
- `entrez` (EDAT): **Always present** — confirmed by [NLM Tech Bulletin](https://www.nlm.nih.gov/pubs/techbull/jf01/jf01_technote_small_number_of_pubmed_citations_beta.html): "All PubMed citations have an EDAT." NLM backfilled ~4,000 records that lacked it. Always full Y/M/D precision.
- `pubmed`: Present on all tested records. Usually same date as `entrez`.
- `received`/`accepted`: Only present when publisher provides manuscript history.

**This means every PubMed record is guaranteed to have at least two searchable dates:**
1. `PubDate` → searchable via `[dp]`/`pdat` (variable precision)
2. `entrez` → searchable via `[edat]`/`edat` (always full Y/M/D)

This is the basis for our defensive `[DP] OR [EDAT]` search strategy — both fields are guaranteed to exist on every record.

---

## 2. Search Concepts (Derived from XML)

PubMed derives searchable date concepts from the raw XML fields. These are what you actually query against.

### Complete Search Field Reference

| Search Concept | Inline Tag | API `datetype` | Derived From | Behavior |
|---------------|-----------|---------------|--------------|----------|
| **Publication Date** | `[dp]` | `pdat` | **Computed:** uses ArticleDate if earlier than PubDate; otherwise PubDate only | Virtual field — matches the earlier of electronic vs print date. See detailed rules below. |
| **Electronic Publication** | `[epdat]` | _(none)_ | `ArticleDate` | Matches only the electronic date. Empty if no ArticleDate exists. |
| **Print Publication** | `[ppdat]` | _(none)_ | `PubDate` | Matches only the print/journal issue date. |
| **Entry Date** | `[edat]` | `edat` | `PubMedPubDate[@PubStatus="entrez"]` | When PubMed indexed the record. Always has full Y/M/D precision. |
| **Create Date** | `[crdt]` | _(none)_ | `PubMedPubDate[@PubStatus="pubmed"]` | When PubMed record was created. Usually same as entry date. |
| **MeSH Date** | `[mhda]` | _(none)_ | `PubMedPubDate[@PubStatus="medline"]` | When MeSH terms were added. Can lag months behind entry. |
| **Modification Date** | `[lr]` | `mdat` | `DateRevised` | When the record was last updated. |

### API `datetype` Mapping (Only 3 Values)

The E-utilities API `datetype` parameter (used with `mindate`/`maxdate`) only supports 3 values for PubMed:

| `datetype` value | Equivalent inline tag | Derived from XML |
|-----------------|----------------------|-----------------|
| `pdat` | `[dp]` | Computed: ArticleDate vs PubDate |
| `edat` | `[edat]` | `PubMedPubDate[@PubStatus="entrez"]` |
| `mdat` | `[lr]` | `DateRevised` |

The other 4 inline tags (`[epdat]`, `[ppdat]`, `[crdt]`, `[mhda]`) can **only** be used via inline search syntax — there is no `datetype` equivalent.

### Publication Date `[dp]`/`pdat` Derivation Rules

`[dp]` is a **virtual/computed field** — it doesn't exist in the XML. PubMed computes it as follows:

1. If `ArticleDate` exists AND is **earlier** than `PubDate` → `[dp]` matches **both** dates
2. If `ArticleDate` exists AND is **later** than `PubDate` → `[dp]` matches **only** `PubDate`
3. If `ArticleDate` does not exist → `[dp]` matches only `PubDate`

**Example:** Article online Jan 7 (`ArticleDate`), print issue Feb 1 (`PubDate`)
- `[dp]` for January → FINDS (ArticleDate is earlier, so dp matches it)
- `[dp]` for February → FINDS (dp also matches PubDate)
- `[epdat]` for January → FINDS
- `[ppdat]` for January → Does NOT find

**Imprecise date resolution for `[dp]`/`pdat`:**
- Month-only PubDate → day defaults to **1st of the month**
- Year-only PubDate → defaults to **January 1**
- Season (e.g., "Oct-Dec") → defaults to **1st of first month** (October 1)

---

## 3. API Usage

### Two Independent Date Filtering Mechanisms

The E-utilities `esearch` endpoint provides **two completely independent ways** to filter by date. They use the same underlying date fields but have different capabilities. You can use either one or both (they're additive — using both applies both filters).

#### Mechanism 1: API Parameters (`datetype` + `mindate` + `maxdate`)

Separate query parameters passed alongside `term`:

```
esearch.fcgi?db=pubmed&term=mesothelioma&datetype=edat&mindate=2026/03/15&maxdate=2026/03/21
```

- `datetype`, `mindate`, `maxdate` are top-level query parameters — separate from and in addition to `term`
- Only **3 `datetype` values** for PubMed: `pdat`, `edat`, `mdat`
- Only **one date range** per request
- Cannot combine date types (no OR logic)
- The API applies this as a filter on top of whatever `term` matches

#### Mechanism 2: Inline Date Tags (inside the `term` string)

Date filters written directly into the search query string:

```
esearch.fcgi?db=pubmed&term=mesothelioma AND ("2026/03/15"[edat] : "2026/03/21"[edat])
```

- All **7 inline tags** available: `[dp]`, `[edat]`, `[epdat]`, `[ppdat]`, `[crdt]`, `[mhda]`, `[lr]`
- Can use **OR** to combine multiple date types in one query
- Can have **multiple date clauses**
- PubMed treats these as part of the search expression — no different from any other search term

#### Why We Use Mechanism 2

Our defensive search strategy requires `[dp] OR [edat]` — catching articles by whichever date falls in the window. This is only possible with inline tags:

```
mesothelioma AND (("2026/03/15"[dp] : "2026/03/21"[dp]) OR ("2026/03/15"[edat] : "2026/03/21"[edat]))
```

The API parameter approach can only filter by one date type per request, so it would require two separate API calls and merging the results.

#### Date Format

`YYYY/MM/DD` — month and day are optional (`YYYY` and `YYYY/MM` also valid).

### Sorting

| Sort Value | What It Does |
|------------|--------------|
| _(omitted)_ | Relevance (default) |
| `pub_date` | Publication Date (newest first) |
| `Author` | Author name (A-Z) |
| `JournalName` | Journal title (A-Z) |

---

## 4. Timing Pitfalls

### Pitfall 1: Month-Only PubDate (Critical)

Many articles have PubDate with only year+month. `[dp]`/`pdat` treats these as the 1st of the month. If the article is indexed mid-month, a weekly pipeline searching that week's dates via `[dp]` misses it.

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

## 5. Our Implementation

### Pipeline Search Strategy

```python
# In pubmed_service.py — _get_date_clause()
# For date_type="publication", we search BOTH dp and edat:
AND (("start"[DP] : "end"[DP]) OR ("start"[EDAT] : "end"[EDAT]))
```

This defensive approach catches articles regardless of which date falls in the window.

Additionally, an **EDAT catch-up** step runs at the end of retrieval, searching EDAT-only for the prior 28 days to catch any articles missed by the primary search.

### How We Derive `pub_year`/`pub_month`/`pub_day`

Our stored publication date mirrors PubMed's `[dp]` computation. In `pubmed_service.py`, we use the **earlier** of:

| XML Field | Role |
|-----------|------|
| **PubDate** | Print/journal issue date (always present, variable precision) |
| **ArticleDate** | Electronic publication date (optional, full precision) |

**Algorithm:**
1. Parse year/month/day from PubDate (month may be text like "Jan", day may be absent)
2. If ArticleDate exists, parse its year/month/day
3. Compare using tuples — missing month/day default to 12/28 (biasing toward "later" so imprecise dates don't spuriously win)
4. Use whichever is earlier

### Search Date Field Mapping

```python
# In pubmed_service.py
date_field_map = {
    "publication": "DP",   # pdat — combined electronic + print (+ EDAT fallback)
    "entry": "EDAT",       # edat — when added to PubMed
    "completion": "DCOM",  # no API datetype equivalent
    "revised": "LR"        # mdat — last modified
}
```

### Function Signature

```python
def search_articles(
    query: str,
    max_results: int = 100,
    offset: int = 0,
    sort_by: str = "relevance",      # "relevance" or "date"
    start_date: Optional[str] = None, # Format: "YYYY/MM/DD"
    end_date: Optional[str] = None,   # Format: "YYYY/MM/DD"
    date_type: Optional[str] = None   # "publication", "completion", "entry", "revised"
) -> tuple[List[CanonicalResearchArticle], Dict[str, Any]]
```

---

## 6. Verified Behavior (PMID 41849731)

Tested March 29, 2026. Article: PubDate=Mar 2026 (no day), ArticleDate=Mar 18, EDAT=Mar 18.

| Method | Mar 1-7 | Mar 15-21 | Explanation |
|--------|---------|-----------|-------------|
| `pdat` / `[dp]` | **YES** | no | Month-only PubDate → treated as Mar 1 |
| `edat` / `[edat]` | no | **YES** | Entrez date = Mar 18 |
| `mdat` / `[lr]` | no | **YES** | Last revised = Mar 18 |
| `[epdat]` | no | **YES** | Electronic pub = Mar 18 |
| `[crdt]` | no | **YES** | Create date = Mar 18 |
| `[mhda]` | no | **YES** | MeSH date = Mar 18 |
| `[dp] OR [edat]` | **YES** | **YES** | Defensive: catches in both windows |

---

## 7. Audit Results

See [date-loophole-audit-2026-03-29.md](date-loophole-audit-2026-03-29.md) for a detailed audit of articles missed in March 2026 due to the `[dp]`-only search strategy. Summary: 39 articles (13.1%) were missed.

---

## 8. API Constraints

| Limit | Value |
|-------|-------|
| Max results per query | 10,000 |
| Rate limit | 3 req/sec (10 with API key) |

---

## 9. External Resources

- [PubMed Help - Date Searching](https://pubmed.ncbi.nlm.nih.gov/help/#date-search)
- [E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
- [Search Field Tags](https://www.ncbi.nlm.nih.gov/books/NBK49540/)
- [PubMedPubDate DTD](https://dtd.nlm.nih.gov/ncbi/pubmed/doc/out/180101/el-PubMedPubDate.html)
