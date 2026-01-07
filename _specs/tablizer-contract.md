# Tablizer Component Contract

## Overview

**Tablizer** is a **generic, data-source-agnostic** table component for displaying and enriching data with AI-powered columns. It serves as the core "engine" that can be wrapped by different apps:

- **PubMed App** (`/pubmed`) - PubMed article search and analysis
- **TrialScout App** (`/trialscout`) - Clinical trials analysis
- **Reports** - Embedded in report views

Tablizer handles **presentation, sorting, filtering, and AI enrichment**. It does NOT handle data fetching, search execution, or navigation. It is completely data-source agnostic through:

1. **Configurable columns** - passed in, not hardcoded
2. **Pluggable RowViewer** - any modal/viewer component
3. **Direct AI processing** - Tablizer calls the API internally based on `itemType`
4. **Generic data type** - works with any record type

---

## Props Interface

```typescript
interface TablizerProps<T extends Record<string, unknown> = Record<string, unknown>> {
    // REQUIRED: Data to display in the table
    data: T[];

    // REQUIRED: Which field is the unique ID (e.g., 'pmid' or 'nct_id')
    idField: keyof T & string;

    // REQUIRED: Column definitions
    columns: TableColumn[];

    // Optional: Title shown in toolbar (default: "Tablizer")
    title?: string;

    // Optional: Label for row count (default: "rows")
    rowLabel?: string;  // e.g., "trials", "articles"

    // Optional: Close button handler (for modal/fullscreen mode)
    onClose?: () => void;

    // Optional: Fullscreen layout mode (default: false)
    isFullScreen?: boolean;

    // Optional: Callback when user saves filtered results to history
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;

    // Optional: Lazy-load more data before AI processing
    // Returns the expanded data array (parent updates its state too)
    onFetchMoreForAI?: () => Promise<T[]>;

    // REQUIRED for AI columns: Type of items being displayed
    // Determines which API endpoint to use for AI processing
    itemType?: 'article' | 'trial';

    // Optional: Original data for AI processing when display data is transformed
    // Use this when displayed data (T) differs from the API data structure
    // Example: TrialScoutTable flattens CanonicalClinicalTrial to TrialRowData
    originalData?: Record<string, unknown>[];

    // Optional: Report AI column state changes to parent
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;

    // Optional: Called when a column's visibility is toggled
    onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;

    // Optional: Custom component to render when a row is clicked
    // If not provided, row click is a no-op
    RowViewer?: React.ComponentType<RowViewerProps<T>>;

    // Optional: Callback when a row is clicked (alternative to RowViewer)
    // If provided, parent component manages the viewer - RowViewer is ignored
    onRowClick?: (data: T[], index: number, isFiltered: boolean) => void;

    // Optional: Custom cell renderer for special columns
    // Return null to use default rendering
    renderCell?: (row: TableRow, column: TableColumn) => React.ReactNode | null;
}

// Result from AI processing (returned by tablizerApi)
interface AIColumnResult {
    id: string;        // Row ID
    passed: boolean;   // For boolean output
    value: number;     // For number/score output
    confidence: number; // Confidence score (0.0-1.0)
    reasoning: string; // Explanation
    text_value?: string; // For text output
}

// Props passed to RowViewer component
interface RowViewerProps<T> {
    data: T[];           // Full dataset
    initialIndex: number; // Which item was clicked
    onClose: () => void;
    isFiltered?: boolean; // True if data is a filtered subset
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

return <Tablizer ref={tablizerRef} data={articles} itemType="article" ... />;
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
        inputColumns: string[];    // Which columns are used (metadata)
        outputType?: 'text' | 'number' | 'boolean';
        showReasoning?: boolean;   // Display reasoning in cells
    };
    visible?: boolean;    // Show/hide in table (default: true)
    excludeFromAITemplate?: boolean; // Hide from AI column field picker
}
```

---

## Responsibilities

### What Tablizer DOES

| Feature | Description |
|---------|-------------|
| **Table Display** | Renders data in a sortable, filterable table |
| **Column Visibility** | Toggle columns via dropdown menu |
| **Sorting** | Click column header to sort asc/desc |
| **Text Filtering** | Global search across all visible columns |
| **AI Columns** | Add custom AI-powered columns via modal |
| **AI API Calls** | Calls tablizerApi directly based on `itemType` |
| **Boolean Filters** | Quick Yes/No/All filters for boolean AI columns |
| **Row Viewer** | Click row to open pluggable viewer component |
| **CSV Export** | Download visible columns (including AI) as CSV |
| **Copy IDs** | Copy filtered item IDs to clipboard |
| **Progress Indicator** | Shows AI processing progress |
| **Error Handling** | Displays "Error" for failed AI evaluations |

### What Tablizer Does NOT Do

| Responsibility | Handled By |
|---------------|------------|
| Data fetching | Parent component |
| Search/query execution | Parent component |
| Authentication | Parent's auth context |
| URL routing | Parent's router |
| Snapshot/history management | Parent component |
| Compare mode | Parent component |
| Chat integration | Parent component |
| **Column definitions** | Parent via `columns` prop |
| **Row viewing** | Parent via `RowViewer` prop |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Parent App (e.g., PubMedTable, TrialScoutTable)            │
│                                                             │
│  Provides:                                                  │
│  ├── data (items to display)                                │
│  ├── columns (column definitions)                           │
│  ├── idField ('pmid' or 'nct_id')                          │
│  ├── itemType ('article' or 'trial')                        │
│  ├── originalData (optional, if display data is flattened)  │
│  ├── RowViewer (ArticleViewerModal or TrialViewerModal)    │
│  ├── onFetchMoreForAI (lazy load callback)                  │
│  ├── onSaveToHistory (save filtered set)                    │
│  └── onColumnsChange (sync AI column state)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Tablizer Component                                         │
│                                                             │
│  Manages:                                                   │
│  - Column visibility & AI columns                           │
│  - Sort state                                               │
│  - Filter text & boolean filters                            │
│  - AI column processing (calls tablizerApi directly)        │
│  - AI column values, reasoning, and confidence              │
│                                                             │
│  API Call:                                                  │
│  └── tablizerApi.processAIColumn({ items, itemType, ... })  │
└─────────────────────────────────────────────────────────────┘
```

---

## AI Column Processing

### Flow

1. User clicks "Add AI Column" button (only visible if `itemType` is set)
2. `AddColumnModal` opens with:
   - Column name input
   - Output type selection (Yes/No, Score, Text)
   - Available field slugs (derived from columns)
   - Prompt template textarea with live preview
   - Score range config (if Score type selected)
3. On submit, Tablizer:
   - Calls `onFetchMoreForAI()` if provided (lazy load)
   - Adds column definition to internal state
   - Calls `tablizerApi.processAIColumn()` directly with `itemType`
   - Uses `originalData` if provided, otherwise uses display data
   - Updates AI column values, reasoning, and confidence
   - Reports column changes via `onColumnsChange()`

### itemType vs originalData

| Scenario | itemType | originalData | Notes |
|----------|----------|--------------|-------|
| PubMedTable | `"article"` | not needed | Display data is same as API data |
| ReportArticleTable | `"article"` | not needed | Display data is same as API data |
| TrialScoutTable | `"trial"` | `trials` | Display data is flattened; API needs full trial objects |

### Template Slugs

The prompt template can include slugs that are replaced with data fields. Available slugs are derived from the `columns` prop.

**PubMed example:**
| Slug | Replaced With |
|------|---------------|
| `{title}` | Article title |
| `{abstract}` | Article abstract |
| `{journal}` | Journal name |
| `{pmid}` | PubMed ID |

**TrialScout example:**
| Slug | Replaced With |
|------|---------------|
| `{title}` | Trial title |
| `{nct_id}` | NCT ID |
| `{conditions}` | Conditions studied |
| `{phase}` | Trial phase |
| `{sponsor}` | Lead sponsor |

---

## Usage Examples

### PubMed App (Simple Case)

```tsx
import { Tablizer, TableColumn, RowViewerProps } from '../tools/Tablizer';
import ArticleViewerModal from '../articles/ArticleViewerModal';

const PUBMED_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

function ArticleRowViewer({ data, initialIndex, onClose }: RowViewerProps<Article>) {
    return <ArticleViewerModal articles={data} initialIndex={initialIndex} onClose={onClose} />;
}

function PubMedTable({ articles }) {
    return (
        <Tablizer
            data={articles}
            idField="pmid"
            columns={PUBMED_COLUMNS}
            rowLabel="articles"
            RowViewer={ArticleRowViewer}
            itemType="article"
        />
    );
}
```

### TrialScout App (With originalData)

When display data is transformed/flattened, pass `originalData` so the API gets the full objects:

```tsx
import { Tablizer, TableColumn } from '../tools/Tablizer';
import TrialViewerModal from './TrialViewerModal';

const TRIAL_COLUMNS: TableColumn[] = [
    { id: 'nct_id', label: 'NCT ID', accessor: 'nct_id', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'status', label: 'Status', accessor: 'status', type: 'text', visible: true },
    { id: 'phase', label: 'Phase', accessor: 'phase', type: 'text', visible: true },
    // ... more columns
];

function TrialScoutTable({ trials }) {
    // Flatten trials for display
    const trialData = useMemo(() =>
        trials.map(trial => ({
            nct_id: trial.nct_id,
            title: trial.brief_title || trial.title,
            status: trial.status,
            phase: trial.phase || 'N/A',
            sponsor: trial.lead_sponsor?.name || 'Unknown',
            // ... flatten other fields
        })),
        [trials]
    );

    // Custom cell renderer for status badges
    const renderCell = (row, column) => {
        if (column.id === 'status') {
            return <StatusBadge status={row.status} />;
        }
        return null;
    };

    return (
        <Tablizer
            data={trialData}
            idField="nct_id"
            columns={TRIAL_COLUMNS}
            rowLabel="trials"
            RowViewer={TrialViewer}
            itemType="trial"
            originalData={trials}  // Pass full objects for AI processing
            renderCell={renderCell}
        />
    );
}
```

---

## State Management

### Internal State

```typescript
// Column definitions (base + AI columns)
const [columns, setColumns] = useState<TableColumn[]>(props.columns);

// AI column values: { columnId: { rowId: value } }
const [aiColumnValues, setAiColumnValues] = useState<Record<string, Record<string, unknown>>>({});

// AI column reasoning: { columnId: { rowId: reasoning } }
const [aiColumnReasoning, setAiColumnReasoning] = useState<Record<string, Record<string, string>>>({});

// AI column confidence: { columnId: { rowId: confidence } }
const [aiColumnConfidence, setAiColumnConfidence] = useState<Record<string, Record<string, number>>>({});

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

When `data` prop changes:
- **New dataset** (different IDs): Reset everything
- **Same dataset** (e.g., more loaded): Preserve AI column values

Detection uses first 3 item IDs as fingerprint.

---

## Files

```
frontend/src/components/tools/Tablizer/
├── Tablizer.tsx        # Main generic component
├── AddColumnModal.tsx  # AI column configuration modal
└── index.tsx           # Exports
```

---

## Wrapper Components

Tablizer is wrapped by domain-specific components that provide the appropriate configuration:

| Wrapper | Location | itemType | originalData |
|---------|----------|----------|--------------|
| `PubMedTable` | `components/pubmed/` | `"article"` | not needed |
| `ReportArticleTable` | `components/reports/` | `"article"` | not needed |
| `TrialScoutTable` | `components/trialscout/` | `"trial"` | `trials` (full objects) |
| `TablizeButton` | `components/tools/Tablizer/` | `"article"` | not needed |

These wrappers are thin (~50-80 lines) and primarily:
1. Define column configurations
2. Provide the appropriate `itemType`
3. Handle data transformation if needed (TrialScoutTable)
4. Provide custom `renderCell` for domain-specific formatting
5. Wire up the `RowViewer` component
