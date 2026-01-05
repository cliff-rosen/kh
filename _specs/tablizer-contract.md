# Tablizer Component Contract

## Overview

**Tablizer** is a reusable, data-source-agnostic table component for displaying and enriching research articles with AI-powered columns. It serves as the core "engine" that can be wrapped by different apps:

- **PubMed App** (`/pubmed`) - PubMed article search and analysis
- **TrialScout App** (`/trialscout`) - Clinical trials analysis
- **Reports** - Embedded in report views

Tablizer handles presentation and AI enrichment. It does NOT handle data fetching, search execution, or navigation.

---

## Props Interface

```typescript
interface TablizerProps {
    // REQUIRED: Articles to display in the table
    articles: TablizableArticle[];

    // Optional: Larger set for AI processing
    // Use case: Display 100 articles but process 500 with AI columns
    filterArticles?: TablizableArticle[];

    // Optional: Title shown in toolbar (default: "Tablizer")
    title?: string;

    // Optional: Close button handler (for modal/fullscreen mode)
    onClose?: () => void;

    // Optional: Fullscreen layout mode (default: false)
    isFullScreen?: boolean;

    // Optional: Callback when user saves filtered results to history
    // Called with array of article IDs and a description of the filter
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;

    // Optional: Lazy-load more articles before AI processing
    // Called when user adds an AI column and more articles are needed
    onFetchMoreForAI?: () => Promise<TablizableArticle[]>;

    // Optional: Report AI column state changes to parent
    // Useful for syncing column info to chat context
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;
}
```

---

## Ref Interface (Imperative API)

```typescript
interface TablizerRef {
    // Programmatically add an AI column
    // Used by chat suggestions to add columns without user opening modal
    addAIColumn: (name: string, criteria: string, type: 'boolean' | 'text') => void;
}
```

### Usage Example

```tsx
const tablizerRef = useRef<TablizerRef>(null);

// Add column from chat suggestion
const handleAIColumnSuggestion = (suggestion) => {
    tablizerRef.current?.addAIColumn(
        suggestion.name,
        suggestion.criteria,
        suggestion.type
    );
};

return <Tablizer ref={tablizerRef} articles={articles} />;
```

---

## Supported Article Types

```typescript
type TablizableArticle = CanonicalResearchArticle | ReportArticle;
```

Both types must have these fields:
- `pmid` or `id` - Unique identifier
- `title` - Article title
- `abstract` - Article abstract (optional but recommended)
- `journal` - Journal name
- `publication_date` - Publication date string
- `authors` - Author list (string or array)

---

## Responsibilities

### What Tablizer DOES

| Feature | Description |
|---------|-------------|
| **Table Display** | Renders articles in a sortable, filterable table |
| **Base Columns** | PMID, Title, Abstract, Authors, Journal, Date |
| **Column Visibility** | Toggle columns via dropdown menu |
| **Sorting** | Click column header to sort asc/desc |
| **Text Filtering** | Global search across all visible columns |
| **AI Columns** | Add custom AI-powered columns via modal |
| **Template Slugs** | AI prompts support `{title}`, `{abstract}`, etc. |
| **Boolean Filters** | Quick Yes/No/All filters for boolean AI columns |
| **Article Viewer** | Click row to open full article modal |
| **CSV Export** | Download visible columns as CSV |
| **Progress Indicator** | Shows AI processing progress |
| **Error Handling** | Displays "Error" for failed AI evaluations |

### What Tablizer Does NOT Do

| Responsibility | Handled By |
|---------------|------------|
| Fetching articles from API | Parent component |
| Search/query execution | Parent component |
| Authentication | Parent's auth context |
| URL routing | Parent's router |
| Snapshot/history management | Parent component |
| Compare mode | Parent component |
| Chat integration | Parent component |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│  Parent App (e.g., PubMedTableView)                     │
│                                                         │
│  Manages:                                               │
│  - Search query & execution                             │
│  - Date filters                                         │
│  - Snapshots & history                                  │
│  - Compare mode                                         │
│  - Chat context                                         │
│                                                         │
│  Passes to Tablizer:                                    │
│  ├── articles (display set, e.g., first 100)           │
│  ├── filterArticles (AI set, e.g., all 500)            │
│  ├── onFetchMoreForAI (lazy load callback)             │
│  ├── onSaveToHistory (save filtered set)               │
│  └── onColumnsChange (sync AI column state)            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Tablizer Component                                     │
│                                                         │
│  Manages:                                               │
│  - Column definitions (base + AI)                       │
│  - Sort state                                           │
│  - Filter text                                          │
│  - Boolean filter state                                 │
│  - AI column processing                                 │
│  - Row data with AI values                              │
│                                                         │
│  Calls:                                                 │
│  └── SemanticFilterService API for AI evaluation        │
└─────────────────────────────────────────────────────────┘
```

---

## AI Column Processing

### Flow

1. User clicks "Add AI Column" button
2. `AddColumnModal` opens with:
   - Column name input
   - Available field slugs (`{title}`, `{abstract}`, etc.)
   - Prompt template textarea
   - Output type selection (text/number/boolean)
3. On submit, Tablizer:
   - Calls `onFetchMoreForAI()` if provided (lazy load)
   - Adds column definition to state
   - Calls `researchStreamApi.filterArticles()` with all articles
   - Updates rows with AI values as they complete
   - Reports column changes via `onColumnsChange()`

### Template Slugs

The prompt template can include slugs that are replaced with article data:

| Slug | Replaced With |
|------|---------------|
| `{title}` | Article title |
| `{abstract}` | Article abstract |
| `{journal}` | Journal name |
| `{year}` | Publication year |
| `{pmid}` | PubMed ID |
| `{doi}` | DOI |
| `{authors}` | Author list |
| `{publication_date}` | Full publication date |

### Example Template

```
Based on this research article:

Title: {title}
Abstract: {abstract}

Is this a randomized controlled trial (RCT)?
Answer only "Yes" or "No".
```

---

## Column Types

```typescript
interface TableColumn {
    id: string;           // Unique identifier
    label: string;        // Display name
    accessor: string;     // Key to access in row data
    type: 'text' | 'number' | 'date' | 'ai';
    aiConfig?: {
        promptTemplate: string;    // Template with {slugs}
        inputColumns: string[];    // Which columns are used (vestigial)
        outputType?: 'text' | 'number' | 'boolean';
    };
    visible?: boolean;    // Show/hide in table
}
```

### Base Columns (Always Present)

| ID | Label | Visible by Default |
|----|-------|-------------------|
| `pmid` | PMID | Yes |
| `title` | Title | Yes |
| `abstract` | Abstract | No |
| `authors` | Authors | No |
| `journal` | Journal | Yes |
| `publication_date` | Date | Yes |

---

## State Management

### Internal State

```typescript
// Row data (base + AI values)
const [data, setData] = useState<TableRow[]>([]);

// Column definitions (base + AI columns)
const [columns, setColumns] = useState<TableColumn[]>(BASE_COLUMNS);

// Sort configuration
const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

// Global text filter
const [filterText, setFilterText] = useState('');

// Boolean filters for AI columns (columnId -> 'all' | 'yes' | 'no')
const [booleanFilters, setBooleanFilters] = useState<Record<string, BooleanFilterState>>({});

// Processing state
const [processingColumn, setProcessingColumn] = useState<string | null>(null);
const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
```

### State Preservation

When `articles` prop changes:
- **New dataset** (different article IDs): Reset everything
- **Same dataset** (e.g., more loaded): Preserve AI column values

Detection uses first 3 article IDs as fingerprint.

---

## Events / Callbacks

| Callback | When Called | Payload |
|----------|-------------|---------|
| `onColumnsChange` | AI column added/removed | `AIColumnInfo[]` |
| `onSaveToHistory` | User clicks "Save to History" | `(ids[], description)` |
| `onFetchMoreForAI` | Before AI processing if more articles needed | Returns `Promise<Article[]>` |
| `onClose` | User clicks close button | None |

---

## Files

```
frontend/src/components/tools/Tablizer/
├── Tablizer.tsx        # Main component
├── AddColumnModal.tsx  # AI column configuration modal
├── TablizeButton.tsx   # Button to open Tablizer (for embedding)
└── index.tsx           # Exports
```

---

## Usage Examples

### Basic Usage (PubMed App)

```tsx
<Tablizer
    ref={tablizerRef}
    title="Search Results"
    articles={displayArticles}           // First 100
    filterArticles={allArticles}         // All 500
    onSaveToHistory={handleSaveFiltered}
    onFetchMoreForAI={fetchMoreForAI}
    onColumnsChange={setAiColumns}
/>
```

### Embedded in Report

```tsx
<Tablizer
    title={`${report.name} Articles`}
    articles={report.articles}
    isFullScreen={false}
/>
```

### Fullscreen Modal

```tsx
<Tablizer
    articles={articles}
    isFullScreen={true}
    onClose={() => setShowTablizer(false)}
/>
```
