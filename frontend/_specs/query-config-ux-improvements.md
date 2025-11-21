# Query Configuration UX Improvements

## Changes Made

### 1. ✅ Added Date Range Filter to Query Testing

**Location**: `frontend/src/components/RetrievalWizard/QueryConfigPhase.tsx`

#### New UI Features

**Collapsible Date Range Section**:
- Header with calendar icon
- Collapsible panel (default collapsed)
- Two date inputs (Start Date, End Date)
- Defaults to last 7 days
- Help text explaining the feature

**Visual Design**:
```
┌─────────────────────────────────────────────────┐
│ 📅 Date Range for Query Testing            ▼   │
├─────────────────────────────────────────────────┤
│ Test queries against articles that entered     │
│ PubMed during this date range.                 │
│                                                 │
│ ┌──────────────┐  ┌──────────────┐            │
│ │ Start Date   │  │ End Date     │            │
│ │ 2025-01-13   │  │ 2025-01-20   │            │
│ └──────────────┘  └──────────────┘            │
│                                                 │
│ Currently testing: 2025-01-13 to 2025-01-20   │
│ (last 7 days by default)                       │
└─────────────────────────────────────────────────┘
```

#### Implementation Details

**State Management**:
```typescript
// Calculate default dates (last 7 days)
const getDefaultDates = () => {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return {
        startDate: weekAgo.toISOString().split('T')[0], // YYYY-MM-DD
        endDate: today.toISOString().split('T')[0]
    };
};

// State
const defaults = getDefaultDates();
const [startDate, setStartDate] = useState(defaults.startDate);
const [endDate, setEndDate] = useState(defaults.endDate);
const [showDateFilter, setShowDateFilter] = useState(false);
```

**Date Conversion** (YYYY-MM-DD → YYYY/MM/DD):
```typescript
// In handleTestQuery
const formattedStartDate = startDate.replace(/-/g, '/');
const formattedEndDate = endDate.replace(/-/g, '/');

const result = await researchStreamApi.testSourceQuery(streamId, {
    source_id: sourceId,
    query_expression: query.query_expression,
    start_date: formattedStartDate,  // YYYY/MM/DD
    end_date: formattedEndDate,      // YYYY/MM/DD
    date_type: 'entry',
    sort_by: 'relevance',
    max_results: 10
});
```

### 2. ✅ Filtered Information Sources to PubMed and Google Scholar

**Before**: Showed all information sources from the backend
**After**: Only shows PubMed and Google Scholar

**Implementation**:
```typescript
// Filter to only show PubMed and Google Scholar
const filteredSources = sources.filter(
    source => source.source_id === 'pubmed' || source.source_id === 'google_scholar'
);

// Use in rendering
{filteredSources.map((source) => {
    // ... render source
})}
```

**Why**: These are the only two sources currently supported and tested. Showing others would be confusing.

---

## Benefits

### 1. Date Range Testing
- ✅ **Accurate Preview**: Tests show what pipeline will actually find
- ✅ **Flexible Testing**: Can test different time ranges to verify query coverage
- ✅ **Same as Pipeline**: Uses identical date range as production (7 days default)
- ✅ **User Control**: Can adjust dates to test different scenarios

### 2. Filtered Sources
- ✅ **Reduced Clutter**: Only shows working sources
- ✅ **Clear Options**: No confusion about unsupported sources
- ✅ **Future-Ready**: Easy to add more sources by updating the filter

---

## User Workflow

### Before Changes
```
1. User generates query
2. User tests query
3. ❌ Gets unpredictable results (unknown date range)
4. ❌ Sees all sources (some don't work)
5. User confused about which sources to use
```

### After Changes
```
1. User (optionally) adjusts date range for testing
2. User generates query
3. User tests query against RECENT articles (last 7 days)
4. ✅ Gets predictable, relevant results
5. ✅ Only sees working sources (PubMed, Google Scholar)
6. User confident the query will work in production
```

---

## Technical Details

### Date Range Behavior

| Component | Input Format | Backend Format | Default Range |
|-----------|-------------|----------------|---------------|
| Date Inputs | YYYY-MM-DD (HTML standard) | YYYY/MM/DD (PubMed API) | Last 7 days |
| Conversion | `.replace(/-/g, '/')` | Automatic | N/A |
| Date Type | N/A | 'entry' (when indexed) | N/A |
| Sort Order | N/A | 'relevance' | N/A |

### Query Test Parameters

**Full request sent to backend**:
```typescript
{
    source_id: 'pubmed',
    query_expression: '(mesothelioma OR asbestos) AND lung',
    start_date: '2025/01/13',     // Converted from 2025-01-13
    end_date: '2025/01/20',       // Converted from 2025-01-20
    date_type: 'entry',           // Articles that entered PubMed
    sort_by: 'relevance',         // Most relevant first
    max_results: 10               // Sample size
}
```

### Source Filtering Logic

**Included Sources**:
- `pubmed` - PubMed (biomedical literature)
- `google_scholar` - Google Scholar (academic papers)

**Excluded Sources** (for now):
- Any other sources defined in backend schemas
- Can be easily re-enabled by updating the filter

---

## UI/UX Considerations

### Date Range Section
- **Default State**: Collapsed (doesn't clutter the UI)
- **Visual Cue**: Calendar icon for easy recognition
- **Help Text**: Explains what the date range does
- **Smart Default**: Last 7 days (same as pipeline)
- **Current Range Display**: Shows active dates at bottom

### Source Selection
- **Checkbox**: Enable/disable each source
- **Clear Labeling**: Source name and type visible
- **Only Working Sources**: Prevents confusion
- **Future Expandable**: Easy to add more when ready

---

## Comparison: Before vs After

### Before
```tsx
// No date filtering
const result = await researchStreamApi.testSourceQuery(streamId, {
    source_id: sourceId,
    query_expression: query.query_expression
    // Missing: dates, sort order, max results
});

// All sources shown
{sources.map((source) => ...)}
```

### After
```tsx
// With date filtering
const formattedStartDate = startDate.replace(/-/g, '/');
const formattedEndDate = endDate.replace(/-/g, '/');

const result = await researchStreamApi.testSourceQuery(streamId, {
    source_id: sourceId,
    query_expression: query.query_expression,
    start_date: formattedStartDate,
    end_date: formattedEndDate,
    date_type: 'entry',
    sort_by: 'relevance',
    max_results: 10
});

// Only working sources shown
{filteredSources.map((source) => ...)}
```

---

## Files Modified

### Frontend
1. **`frontend/src/components/RetrievalWizard/QueryConfigPhase.tsx`**
   - Added `CalendarIcon` import
   - Added `getDefaultDates()` helper function
   - Added state: `startDate`, `endDate`, `showDateFilter`
   - Added `filteredSources` constant
   - Updated `handleTestQuery()` to include date parameters
   - Added collapsible date range UI section
   - Changed `sources.map` to `filteredSources.map`

---

## Testing Checklist

### Functional Testing
- [ ] Date picker shows correct default dates (7 days ago to today)
- [ ] Start date can be changed
- [ ] End date can be changed
- [ ] Date range collapses/expands correctly
- [ ] Query test uses selected dates
- [ ] Only PubMed and Google Scholar sources shown
- [ ] Test results reflect date-filtered articles

### Edge Cases
- [ ] Start date after end date (should still work, backend handles it)
- [ ] Very wide date range (1+ years)
- [ ] Very narrow date range (1 day)
- [ ] Future dates (should return 0 results)

### Integration Testing
- [ ] Date range matches pipeline behavior
- [ ] Test results are consistent with pipeline execution
- [ ] Article counts are accurate for date range

---

## Future Enhancements

### Potential Improvements
1. **Date Presets**: Buttons for "Last 7 days", "Last 30 days", "Last year"
2. **Date Validation**: Prevent start > end with UI feedback
3. **Visual Feedback**: Show date range in test results display
4. **More Sources**: Add more when supported (arXiv, bioRxiv, etc.)
5. **Source Capabilities**: Show which sources support date filtering
6. **Advanced Options**: Expose `date_type` and `sort_by` options

### Code Quality
- Consider extracting date range UI to separate component
- Add unit tests for date conversion logic
- Add visual regression tests for collapsed/expanded states

---

## Summary

### What We Added
1. ✅ Collapsible date range filter (last 7 days default)
2. ✅ Date inputs with conversion (YYYY-MM-DD → YYYY/MM/DD)
3. ✅ Date parameters passed to query testing
4. ✅ Filtered sources to only show PubMed and Google Scholar

### Why It Matters
- **Predictability**: Users know exactly what date range they're testing
- **Accuracy**: Test results match pipeline behavior
- **Clarity**: Only working sources shown
- **Confidence**: Users can verify queries before running pipeline

### Impact
- **User Experience**: Much clearer what's being tested
- **Fewer Surprises**: Test results align with production behavior
- **Better Queries**: Can test different date ranges to refine queries
- **Reduced Confusion**: Only see sources that actually work
