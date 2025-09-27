# Date Handling Specification

## Overview

This document specifies how the unified search system handles dates across different providers, including filtering, sorting, and display behavior.

## Date Types Available

### PubMed Date Types
- **Publication Date** (`pub_date`): The date the article was published
- **Completion Date** (`comp_date`): The date the article record was completed 
- **Entry Date** (`entry_date`): The date the article was first entered into PubMed
- **Revised Date** (`date_revised`): The date the article record was last revised

### Google Scholar Date Types  
- **Publication Year** only: Scholar provides only the publication year, no other date types

## User Interface Behavior

### Date Type Selection
- **PubMed**: User can select from 4 date types (Publication, Completion, Entry, Revised)
- **Google Scholar**: Only "Publication Date" available (disabled/hidden selector)

### Date Range Input
- **PubMed**: Full date precision (YYYY-MM-DD format)
  - From Date: Start of date range (YYYY-MM-DD)
  - To Date: End of date range (YYYY-MM-DD)
- **Google Scholar**: Year-only precision  
  - From Year: Start year (YYYY)
  - To Year: End year (YYYY)

### Sort Options  
- **Relevance**: Default ranking by search relevance
- **Publication Date**: Always sorts by publication date (most recent first)
  - Note: Even if filtering was done by completion/entry/revised date, sorting is always by publication date due to API limitations

## Backend API Behavior

### PubMed E-utilities Integration

#### Date Filtering
Maps user selections to PubMed field tags:
```
completion → DCOM (Date Completed)
publication → DP (Date of Publication)  
entry → EDAT (Entry Date)
revised → LR (Date Last Revised)
```

Query format: `"YYYY-MM-DD"[FIELD] : "YYYY-MM-DD"[FIELD]`

#### Date Sorting
- `sort=relevance` (default)
- `sort=pub_date` (publication date descending)
- **Limitation**: Only publication date sorting available, regardless of filter date type

### Google Scholar Integration

#### Date Filtering  
- Uses year-based filtering only
- Maps to Scholar's publication year field

#### Date Sorting
- Relevance-based (Scholar's default)
- Publication year sorting (when available)

## Data Storage and Retrieval

### Article Metadata Storage
Each `CanonicalResearchArticle` stores all available dates in `source_metadata`:

**PubMed articles:**
```json
{
  "source_metadata": {
    "pub_date": "2023-05-15",      // Publication date
    "comp_date": "2023-04-30",     // Completion date  
    "entry_date": "2023-04-25",    // Entry date
    "date_revised": "2023-06-01"   // Last revised date
  }
}
```

**Scholar articles:**
```json
{
  "source_metadata": {
    "publication_year": 2023
  }
}
```

### Date Format Standardization
- **PubMed**: YYYY-MM-DD format when full date available, YYYY when only year available
- **Scholar**: YYYY format only
- **Missing dates**: Stored as empty string or null

## Frontend Display Behavior

### Table Date Display
- Shows the date type that was selected for search filtering
- Falls back to publication date if selected date type is unavailable
- Format preservation: Shows full YYYY-MM-DD when available, YYYY when only year available

### Date Display Logic
```typescript
function getDisplayDate(article: CanonicalResearchArticle, selectedDateType: string): string {
  const metadata = article.source_metadata || {};
  
  // For PubMed articles
  if (article.source === 'pubmed') {
    switch (selectedDateType) {
      case 'completion': return metadata.comp_date || metadata.pub_date || article.publication_year?.toString() || '-';
      case 'entry': return metadata.entry_date || metadata.pub_date || article.publication_year?.toString() || '-';
      case 'revised': return metadata.date_revised || metadata.pub_date || article.publication_year?.toString() || '-';
      case 'publication':
      default: return metadata.pub_date || article.publication_year?.toString() || '-';
    }
  }
  
  // For Scholar articles - always publication year
  return article.publication_year?.toString() || '-';
}
```

## Search Parameter Flow

### Frontend to Backend
```typescript
UnifiedSearchParams {
  provider: "pubmed" | "scholar"
  query: string
  date_type?: "completion" | "publication" | "entry" | "revised"  // PubMed only
  year_low?: number      // Scholar compatibility  
  year_high?: number     // Scholar compatibility
  date_from?: string     // YYYY-MM-DD for PubMed
  date_to?: string       // YYYY-MM-DD for PubMed
  sort_by: "relevance" | "date"
}
```

### Backend Processing
1. **Date Range Conversion**: 
   - PubMed: `date_from/date_to` → E-utilities date range query
   - Scholar: `year_low/year_high` → year-based filtering

2. **Sort Parameter Mapping**:
   - `relevance` → default provider sorting
   - `date` → `sort=pub_date` for PubMed, year-based for Scholar

## User Experience Implications

### Expected Behavior
1. **Filtering**: User can filter PubMed by any date type with full date precision
2. **Sorting**: When "Sort by Date" is selected, results are always ordered by publication date
3. **Display**: Table shows the date type that was selected for filtering
4. **Consistency**: Date type selection affects both filtering and display, but not sort field

### Limitations to Communicate
1. **Sort Limitation**: "Sort by Date" always uses publication date, even when filtering by other date types
2. **Scholar Precision**: Google Scholar only supports year-level date precision
3. **Date Availability**: Not all articles have all date types; system falls back gracefully

## API Compatibility

### Backward Compatibility
- Maintains `year_low/year_high` parameters for existing Scholar integration
- Adds `date_from/date_to` for enhanced PubMed precision
- `date_type` parameter is optional (defaults to "publication")

### Provider-Specific Handling
- **PubMed**: Full feature support (4 date types, full date precision, limited sorting)
- **Scholar**: Limited support (publication year only, year precision, basic sorting)

## Error Handling

### Invalid Date Formats
- Frontend validates YYYY-MM-DD format before submission
- Backend rejects malformed dates with clear error messages

### Missing Dates
- System gracefully falls back to available date types
- Display shows "-" for completely missing dates
- Search continues with available date information

### Provider Limitations
- Clear user messaging about Scholar's year-only precision
- Explanation that sorting is always by publication date for PubMed

## Testing Scenarios

### Date Filtering Tests
1. PubMed search with completion date range → verify DCOM field usage
2. PubMed search with revised date range → verify LR field usage  
3. Scholar search with year range → verify year-based filtering
4. Mixed date availability → verify fallback behavior

### Sort Order Tests
1. PubMed "Sort by Date" with completion date filter → verify sorts by publication date
2. Scholar "Sort by Date" → verify year-based sorting
3. Relevance sorting → verify default provider behavior

### Display Tests
1. Display completion dates when available → verify correct metadata extraction
2. Display with missing date types → verify fallback to publication date
3. Date format preservation → verify YYYY-MM-DD vs YYYY display

## Future Enhancements

### Potential Improvements
1. **Enhanced Scholar Integration**: If Scholar API adds more date types
2. **Custom Sort Options**: Client-side sorting by other date types for display purposes
3. **Date Range Validation**: Smart validation based on selected provider capabilities
4. **Bulk Date Operations**: Efficient handling of large result sets with multiple date types

### API Evolution
- Monitor PubMed E-utilities for new sort options
- Track Scholar API changes for enhanced date support
- Consider caching strategies for date-heavy queries