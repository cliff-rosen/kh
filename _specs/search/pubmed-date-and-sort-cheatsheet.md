# PubMed API: Date Range and Sorting Cheat Sheet

Quick reference for working with PubMed's E-utilities API date filtering and sorting options.

---

## Date Filtering

### Date Types (Field Tags)

PubMed tracks multiple dates for each article. These are the date types available for searching:

| Date Type | Field Tag | What It Means | Use When |
|-----------|-----------|---------------|----------|
| **Publication Date** | `[dp]` | Combined electronic + print date (see note below) | Default - most common for research monitoring |
| **Electronic Publication** | `[epdat]` | When article went online (e-publication) | Finding articles by online availability date |
| **Print Publication** | `[ppdat]` | Official journal issue date (print) | Finding articles by print issue date |
| **Entry Date** | `[edat]` | When record was added to PubMed | Finding newly indexed articles; used for "Most Recent" sort |
| **Create Date** | `[crdt]` | When PubMed record was first created | Usually same as entry date |
| **MeSH Date** | `[mhda]` | When citation was indexed with MeSH terms | Finding newly indexed MEDLINE articles |
| **Completion Date** | `[dcom]` | When MEDLINE indexing was completed | Looking for recently completed records |
| **Modification Date** | `[lr]` | When record was last updated | Tracking updates, corrections, retractions |

#### Publication Date `[dp]` Behavior

Publication Date combines electronic and print dates intelligently:
- If electronic date comes **before** print → `[dp]` matches BOTH dates
- If electronic date comes **after** print → `[dp]` matches only print date

**Example**: Article online Jan 7, print issue Feb 1
- Searching `[dp]` for January → FINDS the article (via electronic date)
- Searching `[epdat]` for January → FINDS the article
- Searching `[ppdat]` for January → Does NOT find the article

**Our Implementation**:
```python
# In pubmed_service.py
date_field_map = {
    "publication": "DP",   # Default - combined electronic + print
    "entry": "EDAT",
    "completion": "DCOM",
    "revised": "LR"
}
# Note: We don't currently expose [epdat], [ppdat], [crdt], or [mhda]
```

### Date Format

**Format**: `YYYY/MM/DD`

**Examples**:
- Full date: `2024/03/15`
- Year only: `2024/01/01`
- Year range: `2023/01/01` to `2024/12/31`

**API Usage**:
```python
# Date range query
start_date = "2024/01/01"
end_date = "2024/03/31"
date_type = "publication"

# Builds query clause:
# AND (("2024/01/01"[DP] : "2024/03/31"[DP]))
```

### Date Range Syntax

**PubMed Query Format**:
```
("start_date"[FIELD] : "end_date"[FIELD])
```

**Examples**:
- Publication date: `("2024/01/01"[DP] : "2024/12/31"[DP])`
- Entry date: `("2024/03/01"[EDAT] : "2024/03/31"[EDAT])`
- Completion date: `("2024/01/01"[DCOM] : "2024/03/31"[DCOM])`

---

## Sorting Options

### Available Sort Methods

PubMed supports different sorting methods through the `sort` parameter:

| Sort Value | What It Does | Use When |
|------------|--------------|----------|
| _(omitted)_ | **Relevance** (default) | Want most relevant results first (BM25 algorithm) |
| `pub_date` | **Publication Date** (newest first) | Want latest research, tracking new publications |
| `Author` | Author name (A-Z) | Browsing by author |
| `JournalName` | Journal title (A-Z) | Browsing by journal |

**Our Implementation**:
```python
# In pubmed_service.py
sort_mapping = {
    'relevance': None,      # Default, don't need to specify
    'date': 'pub_date'      # Sort by publication date
}
```

### API Usage

**Relevance (default)**:
```
# No sort parameter needed
?term=melanoma&retmax=100
```

**By Date**:
```
# Add sort parameter
?term=melanoma&retmax=100&sort=pub_date
```

---

## Common Use Cases

### 1. Recent Publications (Last 3 Months)

**Goal**: Get newest research on a topic

```python
from datetime import datetime, timedelta

end_date = datetime.now()
start_date = end_date - timedelta(days=90)

search_articles(
    query="CRISPR gene editing",
    start_date=start_date.strftime("%Y/%m/%d"),
    end_date=end_date.strftime("%Y/%m/%d"),
    date_type="publication",
    sort_by="date"  # Newest first
)
```

**Query**: `CRISPR gene editing AND ("2024/08/15"[DP] : "2024/11/15"[DP])`

### 2. Newly Indexed Articles

**Goal**: Find articles just added to PubMed (regardless of publication date)

```python
# Articles indexed in the last week
search_articles(
    query="immunotherapy",
    start_date="2024/11/08",
    end_date="2024/11/15",
    date_type="entry",  # Entry date!
    sort_by="date"
)
```

**Query**: `immunotherapy AND ("2024/11/08"[EDAT] : "2024/11/15"[EDAT])`

**Why**: An article published in 2020 might be indexed in PubMed in 2024.

### 3. Historical Research (Year Range)

**Goal**: Survey literature from a specific time period

```python
# All COVID research from 2020-2022
search_articles(
    query="COVID-19",
    start_date="2020/01/01",
    end_date="2022/12/31",
    date_type="publication",
    sort_by="relevance"  # Most relevant first
)
```

### 4. Recently Updated Records

**Goal**: Track corrections, retractions, or updates

```python
# Records updated in last month
search_articles(
    query="retinopathy",
    start_date="2024/10/15",
    end_date="2024/11/15",
    date_type="revised",  # Last revised!
    sort_by="date"
)
```

**Use Case**: Quality monitoring, tracking retractions

---

## Important Limitations

### PubMed API Constraints

| Limit | Value | Notes |
|-------|-------|-------|
| **Max results per query** | 10,000 | Hard limit from NCBI |
| **Rate limit** | 3 req/sec | 10 req/sec with API key |
| **Max results per request** | 10,000 | Use `retstart` for pagination |

### Date Coverage Gaps and Timing

**Electronic vs Print Publication:**
- Many articles are available online weeks/months before print issue
- Example: Online Jan 7, Print issue Feb 1
- `[dp]` will match January search (uses earlier date)
- This is why search results may show "February" articles in January results if we display print date

**Completion Date (`[dcom]`)** is not always available:
- Older records may not have completion dates
- Some record types don't get completion dates
- **Fallback**: Use publication date

**Entry Date (`[edat]`)** timing:
- May be days/weeks after publication
- Depends on journal indexing speed
- Used by PubMed for "Most Recent" sort order

**MeSH Date (`[mhda]`)** timing:
- Set when MeSH terms are added (article becomes MEDLINE)
- Until then, equals Entry Date
- Can be months after entry for some articles

---

## Query Building Examples

### Combined Filters

**Complex query with date + field filters**:
```python
# Cancer research from high-impact journals, published in 2024
search_term = '(cancer OR oncology) AND ("Nature"[Journal] OR "Science"[Journal])'
date_clause = 'AND (("2024/01/01"[DP] : "2024/12/31"[DP]))'
full_query = search_term + date_clause
```

**Result**: `(cancer OR oncology) AND ("Nature"[Journal] OR "Science"[Journal]) AND (("2024/01/01"[DP] : "2024/12/31"[DP]))`

### Multiple Date Types (Advanced)

**Articles published in 2023 but indexed in 2024**:
```
cancer AND ("2023/01/01"[DP] : "2023/12/31"[DP]) AND ("2024/01/01"[EDAT] : "2024/12/31"[EDAT])
```

**Use Case**: Finding backdated publications, delayed indexing

---

## Our Codebase Implementation

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

### Example Calls

**Basic search (relevance)**:
```python
articles, metadata = search_articles(
    query="melanoma treatment",
    max_results=50
)
```

**Recent articles by date**:
```python
articles, metadata = search_articles(
    query="melanoma treatment",
    max_results=100,
    start_date="2024/01/01",
    end_date="2024/12/31",
    date_type="publication",
    sort_by="date"
)
```

**Newly indexed this week**:
```python
from datetime import datetime, timedelta

today = datetime.now()
week_ago = today - timedelta(days=7)

articles, metadata = search_articles(
    query="retinopathy",
    start_date=week_ago.strftime("%Y/%m/%d"),
    end_date=today.strftime("%Y/%m/%d"),
    date_type="entry",
    sort_by="date"
)
```

---

## Quick Decision Tree

**Which date type should I use?**

```
START
  ↓
Do you want articles by when they became available?
  ├─ YES → date_type="publication" [dp] (most common)
  │        Note: This matches electronic date if earlier than print
  └─ NO → Continue
       ↓
    Do you need ONLY electronic publication date?
      ├─ YES → [epdat] (not in our implementation yet)
      └─ NO → Continue
           ↓
        Do you need ONLY print publication date?
          ├─ YES → [ppdat] (not in our implementation yet)
          └─ NO → Continue
               ↓
            Do you want newly indexed articles (regardless of pub date)?
              ├─ YES → date_type="entry" [edat]
              └─ NO → Continue
                   ↓
                Do you want recently updated/corrected articles?
                  ├─ YES → date_type="revised" [lr]
                  └─ NO → date_type="completion" [dcom]
```

**Which sort should I use?**

```
START
  ↓
Do you want the NEWEST articles?
  ├─ YES → sort_by="date"
  └─ NO → sort_by="relevance" (default)
```

---

## Related Documentation

**Internal docs:**
- [Article Date Field Analysis](../../backend/docs/article_date_field_analysis.md) - How PubMed dates map to our data structures
- [Article Date Population Map](../../backend/docs/article_date_population_map.md) - Where dates flow through the codebase
- [PubMed Date Fields Reference](../../backend/docs/pubmed_date_fields.md) - XML structure details

## Additional Resources

- **Official Docs**: https://www.ncbi.nlm.nih.gov/books/NBK25501/
- **Search Field Tags**: https://www.ncbi.nlm.nih.gov/books/NBK49540/
- **Date Searching**: https://pubmed.ncbi.nlm.nih.gov/help/#date-search
- **E-utilities API**: https://www.ncbi.nlm.nih.gov/books/NBK25499/

---

## Troubleshooting

### "No results found" with date filter

**Check**:
1. Date format is `YYYY/MM/DD` (not `YYYY-MM-DD`)
2. Date type matches available data (try `publication` if `completion` fails)
3. Date range makes sense (start < end, not in future)

### Results don't match expected count

**Reasons**:
- 10,000 result limit applied
- Some articles lack the requested date type
- Date range excludes articles you expected

**Fix**: Check metadata returned:
```python
articles, metadata = search_articles(...)
print(f"Total results: {metadata['total_results']}")
print(f"Returned: {len(articles)}")
```

### Slow queries

**Causes**:
- Large result sets (10,000 articles)
- Complex query terms
- Rate limiting (3 req/sec without API key)

**Solutions**:
- Use date ranges to narrow results
- Add API key for 10 req/sec
- Paginate with `offset` parameter
