# PubMed Date Fields Reference

Reference for PubMed XML date fields and search behavior. For analysis of how these map to our data structures, see [Article Date Field Analysis](./article_date_field_analysis.md).

---

## XML Date Elements

### Primary Date Fields

| XML Element | Location | Description |
|-------------|----------|-------------|
| **ArticleDate** | `Article/ArticleDate[@DateType="Electronic"]` | When article was published online (ahead of print) |
| **PubDate** | `JournalIssue/PubDate` | Official journal issue date (print publication) |
| **DateCompleted** | `MedlineCitation/DateCompleted` | When MEDLINE indexing was completed |
| **DateRevised** | `MedlineCitation/DateRevised` | When the record was last revised |

### History Dates (in PubmedData/History)

| PubStatus | Description |
|-----------|-------------|
| `entrez` | When citation was added to PubMed |
| `pubmed` | When PubMed record was created |
| `medline` | When MEDLINE record was created |
| `received` | When journal received the manuscript |
| `revised` | When authors revised the manuscript |
| `accepted` | When journal accepted the manuscript |

### Example (PMID 41501212)

```xml
<!-- Electronic publication date - when users can access it -->
<ArticleDate DateType="Electronic">
  <Year>2026</Year><Month>01</Month><Day>07</Day>
</ArticleDate>

<!-- Print publication date - official journal issue -->
<JournalIssue CitedMedium="Internet">
  <PubDate><Year>2026</Year><Month>Feb</Month></PubDate>
</JournalIssue>

<!-- History dates -->
<PubMedPubDate PubStatus="entrez">
  <Year>2026</Year><Month>1</Month><Day>7</Day>
</PubMedPubDate>
<PubMedPubDate PubStatus="received">
  <Year>2025</Year><Month>9</Month><Day>12</Day>
</PubMedPubDate>
<PubMedPubDate PubStatus="accepted">
  <Year>2025</Year><Month>12</Month><Day>15</Day>
</PubMedPubDate>
```

---

## Date Precision

PubDate can have varying precision:

```xml
<!-- Full date -->
<PubDate>
  <Year>2023</Year>
  <Month>Jan</Month>
  <Day>15</Day>
</PubDate>

<!-- Month only (common) -->
<PubDate>
  <Year>2023</Year>
  <Month>Jan</Month>
</PubDate>

<!-- Year only -->
<PubDate>
  <Year>2023</Year>
</PubDate>

<!-- Date range -->
<PubDate>
  <MedlineDate>2023 Jan-Mar</MedlineDate>
</PubDate>
```

**Month formats**: Can be text ("Jan", "Feb") or numeric ("01", "1").

---

## Search Date Tags

| Tag | Field | Behavior |
|-----|-------|----------|
| `[dp]` | Publication Date | Matches **both** ArticleDate and PubDate when ArticleDate is earlier |
| `[edat]` | Entrez Date | When added to PubMed; used for "Most Recent" sort |
| `[crdt]` | Create Date | When record was first created |
| `[epdat]` | Electronic Publication | ArticleDate only |
| `[ppdat]` | Print Publication | PubDate only |

### Key Behavior: `[dp]` Dual Matching

When ArticleDate is **earlier** than PubDate:
- `[dp]` matches BOTH dates
- Searching "Jan 2026" finds articles with ArticleDate=Jan even if PubDate=Feb

When ArticleDate is **later** than PubDate:
- `[dp]` matches only PubDate

**This is why our search finds articles by their electronic date, but we need to display that date too.**

---

## API Query Format

### E-utilities Parameters

```
mindate=2023/01/01&maxdate=2023/12/31&datetype=pdat
```

Date types: `pdat` (publication), `edat` (entrez), `mdat` (modification)

### Inline Search Syntax

```
("2023/01/01"[dp] : "2023/12/31"[dp])
```

---

## Our Implementation

### Date Clause Builder

In `pubmed_service.py`, `_get_date_clause()`:

```python
date_field_map = {
    "completion": "DCOM",
    "publication": "DP",    # Default
    "entry": "EDAT",
    "revised": "LR"
}
```

### Date Parsing

We normalize all dates to YYYY-MM-DD format:
- Missing month defaults to "01" (January)
- Missing day defaults to "01"
- Text months ("Jan") converted to numeric ("01")

---

## Sources

- [PubMed Help - Searching by Date](https://pubmed.ncbi.nlm.nih.gov/help/#dp)
- [E-utilities In-Depth](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
- [NLM Technical Bulletin: Entrez Date](https://www.nlm.nih.gov/pubs/techbull/so08/so08_pm_edat.html)
- [NLM Technical Bulletin: Create Date](https://www.nlm.nih.gov/pubs/techbull/nd08/nd08_pm_new_date_field.html)
