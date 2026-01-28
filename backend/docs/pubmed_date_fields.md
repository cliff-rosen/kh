# PubMed Date Fields Reference

## Available Date Fields

| Field | Search Tag | Description |
|-------|------------|-------------|
| **DP** | `[dp]` | Publication Date |
| **EDAT** | `[edat]` | Entrez Date (when added to PubMed) |
| **CRDT** | `[crdt]` | Create Date (when record created) |
| **EPDAT** | `[epdat]` | Electronic Publication Date |
| **PPDAT** | `[ppdat]` | Print Publication Date |

## Field Semantics

### Publication Date (DP) - Currently Used
The article's publication date. Includes both electronic and print dates, with these rules:
- If electronic date is **earlier** than print date: both are searchable
- If electronic date is **later** than print date: only print date is searchable
- Searching `2023[dp]` may return articles with 2024 print dates if they have 2023 electronic dates

**Precision varies:**
- Year only: `2023`
- Year + month: `2023 Jan` or `2013 Jan-Mar`
- Full date: `2023 Jan 15`

**When incomplete:** PubMed normalizes to first of period (Jan 1 for year-only, 1st for month-only).

### Entrez Date (EDAT)
The date used for "Most Recent" sort order. Rules:
- **Normal case:** Date the citation was added to PubMed
- **12-month rule:** If article enters PubMed >12 months after publication, EDAT is set equal to Publication Date
- This prevents old articles from appearing as "new" in feeds

### Create Date (CRDT)
The date the PubMed record was first created. For practical purposes:
- CRDT and EDAT are usually identical
- Differs from EDAT only when the 12-month rule applies

## Date Precision in XML

PubMed XML returns dates with varying precision:

```xml
<!-- Full date -->
<PubDate>
  <Year>2023</Year>
  <Month>Jan</Month>
  <Day>15</Day>
</PubDate>

<!-- Month only -->
<PubDate>
  <Year>2023</Year>
  <Month>Jan</Month>
</PubDate>

<!-- Year only -->
<PubDate>
  <Year>2023</Year>
</PubDate>

<!-- Range (MedlineDate) -->
<PubDate>
  <MedlineDate>2023 Jan-Mar</MedlineDate>
</PubDate>
```

## API Query Format

E-utilities accepts dates as `YYYY/MM/DD` with month and day optional:
```
mindate=2023/01/01&maxdate=2023/12/31&datetype=pdat
```

Or inline in search term:
```
("2023/01/01"[dp] : "2023/12/31"[dp])
```

## Recommendation

**Use Publication Date (DP)** for report date ranges because:
1. It reflects when the research was published, which is what users care about
2. EDAT/CRDT reflect database operations, not scientific timeline
3. The 12-month EDAT rule would exclude legitimately old articles from searches

**Caveat:** Publication date precision varies. Our normalization (defaulting missing month/day to 01) handles this consistently.

## Current Implementation

In `pubmed_service.py`, `_get_date_clause()` maps date types:
```python
date_field_map = {
    "completion": "DCOM",
    "publication": "DP",    # Default
    "entry": "EDAT",
    "revised": "LR"
}
```

## Sources

- [NLM Technical Bulletin: Create Date Field](https://www.nlm.nih.gov/pubs/techbull/nd08/nd08_pm_new_date_field.html)
- [NLM Technical Bulletin: Entrez Date Modification](https://www.nlm.nih.gov/pubs/techbull/so08/so08_pm_edat.html)
- [PubMed Help](https://pubmed.ncbi.nlm.nih.gov/help/)
- [E-utilities In-Depth](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
