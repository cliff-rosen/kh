# Tablizer Component Contract

## Overview

**Tablizer** is a **generic, data-source-agnostic** table component for displaying and enriching data with AI-powered columns. It serves as the core "engine" that can be wrapped by different apps:

- **PubMed App** (`/pubmed`) - PubMed article search and analysis
- **TrialScout App** (`/trialscout`) - Clinical trials analysis
- **Reports** - Embedded in report views

Tablizer handles **presentation, sorting, filtering, and AI enrichment**. It does NOT handle data fetching, search execution, or navigation. It is completely data-source agnostic through:

1. **Configurable columns** - passed in, not hardcoded
2. **Pluggable RowViewer** - any modal/viewer component
3. **Callback-based AI processing** - parent handles API calls
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

    // Optional: Larger set for AI processing
    // Use case: Display 100 items but process 500 with AI columns
    filterData?: T[];

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
    onFetchMoreForAI?: () => Promise<T[]>;

    // REQUIRED for AI columns: Process AI column on data
    // Returns results in same order as input data
    onProcessAIColumn?: (
        data: T[],
        promptTemplate: string,
        outputType: 'text' | 'number' | 'boolean'
    ) => Promise<AIColumnResult[]>;

    // Optional: Report AI column state changes to parent
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;

    // Optional: Custom component to render when a row is clicked
    // If not provided, row click is a no-op
    RowViewer?: React.ComponentType<RowViewerProps<T>>;

    // Optional: Custom cell renderer for special columns
    // Return null to use default rendering
    renderCell?: (row: TableRow, column: TableColumn) => React.ReactNode | null;
}

// Result from AI processing
interface AIColumnResult {
    id: string;        // Row ID
    passed: boolean;   // For boolean output
    score: number;     // For number output
    reasoning: string; // For text output
}

// Props passed to RowViewer component
interface RowViewerProps<T> {
    data: T[];           // Full dataset
    initialIndex: number; // Which item was clicked
    onClose: () => void;
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

return <Tablizer ref={tablizerRef} data={articles} ... />;
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
    };
    visible?: boolean;    // Show/hide in table (default: true)
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
| **Boolean Filters** | Quick Yes/No/All filters for boolean AI columns |
| **Row Viewer** | Click row to open pluggable viewer component |
| **CSV Export** | Download visible columns as CSV |
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
| **AI API calls** | Parent via `onProcessAIColumn` |
| **Column definitions** | Parent via `columns` prop |
| **Row viewing** | Parent via `RowViewer` prop |

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Parent App (e.g., PubMedTableView)                         │
│                                                             │
│  Provides:                                                  │
│  ├── data (items to display)                                │
│  ├── columns (column definitions)                           │
│  ├── idField ('pmid' or 'nct_id')                          │
│  ├── filterData (larger set for AI processing)              │
│  ├── RowViewer (ArticleViewerModal or TrialViewerModal)    │
│  ├── onProcessAIColumn (calls appropriate API)              │
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
│  - AI column processing orchestration                       │
│  - Row data with AI values                                  │
│                                                             │
│  Delegates:                                                 │
│  └── AI processing to parent via onProcessAIColumn          │
└─────────────────────────────────────────────────────────────┘
```

---

## AI Column Processing

### Flow

1. User clicks "Add AI Column" button
2. `AddColumnModal` opens with:
   - Column name input
   - Available field slugs (derived from columns)
   - Prompt template textarea
   - Output type selection (text/number/boolean)
3. On submit, Tablizer:
   - Calls `onFetchMoreForAI()` if provided (lazy load)
   - Adds column definition to internal state
   - Calls `onProcessAIColumn(data, template, outputType)`
   - Updates rows with AI values as results come in
   - Reports column changes via `onColumnsChange()`

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

### PubMed App

```tsx
import Tablizer from '../tools/Tablizer/Tablizer';
import ArticleViewerModal from '../articles/ArticleViewerModal';
import { researchStreamApi } from '../../lib/api';

const PUBMED_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

function PubMedTableView() {
    const handleProcessAIColumn = async (articles, template, outputType) => {
        const response = await researchStreamApi.filterArticles({
            articles,
            filter_criteria: template,
            threshold: 0.5
        });
        return response.results.map(r => ({
            id: r.pmid,
            passed: r.passed,
            score: r.score,
            reasoning: r.reasoning
        }));
    };

    return (
        <Tablizer
            data={articles}
            idField="pmid"
            columns={PUBMED_COLUMNS}
            rowLabel="articles"
            RowViewer={ArticleViewerModal}
            onProcessAIColumn={handleProcessAIColumn}
        />
    );
}
```

### TrialScout App

```tsx
import Tablizer from '../tools/Tablizer/Tablizer';
import TrialViewerModal from './TrialViewerModal';
import { toolsApi } from '../../lib/api/toolsApi';

const TRIAL_COLUMNS: TableColumn[] = [
    { id: 'nct_id', label: 'NCT ID', accessor: 'nct_id', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'status', label: 'Status', accessor: 'status', type: 'text', visible: true },
    { id: 'phase', label: 'Phase', accessor: 'phase', type: 'text', visible: true },
    { id: 'enrollment', label: 'Enrollment', accessor: 'enrollment', type: 'number', visible: true },
    // ... more columns
];

function TrialScoutSearch() {
    const handleProcessAIColumn = async (trials, template, outputType) => {
        const response = await toolsApi.filterTrials({
            trials,
            filter_criteria: template,
            threshold: 0.5
        });
        return response.results.map(r => ({
            id: r.nct_id,
            passed: r.passed,
            score: r.score,
            reasoning: r.reasoning
        }));
    };

    // Custom cell renderer for status/phase formatting
    const renderCell = (row, column) => {
        if (column.id === 'status') {
            return <StatusBadge status={row.status} />;
        }
        return null; // Use default rendering
    };

    return (
        <Tablizer
            data={trials}
            idField="nct_id"
            columns={TRIAL_COLUMNS}
            rowLabel="trials"
            RowViewer={TrialViewerModal}
            onProcessAIColumn={handleProcessAIColumn}
            renderCell={renderCell}
        />
    );
}
```

---

## State Management

### Internal State

```typescript
// Row data (base + AI values)
const [data, setData] = useState<TableRow[]>([]);

// Merged column definitions (base + AI columns)
const [columns, setColumns] = useState<TableColumn[]>(props.columns);

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

## Migration Path

### Converting TrialScoutTable to use Tablizer

Before (TrialScoutTable - ~700 lines of duplicated code):
```tsx
function TrialScoutTable({ trials }) {
    // Duplicated table logic, sorting, filtering, AI columns...
}
```

After (wrapper around Tablizer - ~50 lines):
```tsx
function TrialScoutTable({ trials }) {
    const data = useMemo(() => convertTrialsToRows(trials), [trials]);

    const handleProcessAI = async (data, template, outputType) => {
        const response = await toolsApi.filterTrials({ trials, filter_criteria: template });
        return response.results.map(r => ({ id: r.nct_id, ... }));
    };

    return (
        <Tablizer
            data={data}
            idField="nct_id"
            columns={TRIAL_COLUMNS}
            rowLabel="trials"
            RowViewer={TrialViewerModal}
            onProcessAIColumn={handleProcessAI}
            renderCell={trialCellRenderer}
        />
    );
}
```

This eliminates ~650 lines of duplicated code while maintaining identical functionality.
