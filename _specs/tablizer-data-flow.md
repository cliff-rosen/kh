# Tablizer Data Flow

This document illustrates how data flows through the Tablizer component, from input props to final rendered output.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUTS (Props)                                 │
│  data: T[]              columns: TableColumn[]        idField: string       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             sortedItems (T[])                               │
│                       (applies sortConfig to inputData)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            filteredItems (T[])                              │
│            (applies filterText + booleanFilters to sortedItems)             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                              [ Rendered Table ]
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
           ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
           │aiColumnValues│  │aiColumnReason│  │aiColumnConfid│
           │   (state)    │  │   (state)    │  │   (state)    │
           └──────────────┘  └──────────────┘  └──────────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
                           getCellValue(item, column)
                           (lookups at render time)
```

The data flow is now much simpler:
1. **inputData** (T[]) - original items from props
2. **sortedItems** (T[]) - sorted by sortConfig
3. **filteredItems** (T[]) - filtered by text search and boolean filters
4. **getCellValue()** - looks up values at render time:
   - Regular columns: `item[column.accessor]`
   - AI columns: `aiColumnValues[column.id][itemId]`

---

## Sample Data Walk-Through

### 1. Input Props

**`data` (array of articles):**
```typescript
[
  {
    pmid: "12345678",
    title: "Effects of aspirin on cardiovascular outcomes",
    abstract: "Background: Aspirin is widely used...",
    journal: "NEJM",
    publication_date: "2024-01-15"
  },
  {
    pmid: "23456789",
    title: "Novel cancer immunotherapy approaches",
    abstract: "Recent advances in immunotherapy...",
    journal: "Nature Medicine",
    publication_date: "2024-02-20"
  },
  {
    pmid: "34567890",
    title: "Machine learning in drug discovery",
    abstract: "This review examines how ML...",
    journal: "Science",
    publication_date: "2024-03-10"
  }
]
```

**`columns` (TableColumn[]):**
```typescript
[
  { id: "pmid", label: "PMID", accessor: "pmid", type: "text", visible: true },
  { id: "title", label: "Title", accessor: "title", type: "text", visible: true },
  { id: "abstract", label: "Abstract", accessor: "abstract", type: "text", visible: false },
  { id: "journal", label: "Journal", accessor: "journal", type: "text", visible: true },
  { id: "publication_date", label: "Date", accessor: "publication_date", type: "date", visible: true }
]
```

**`idField`:** `"pmid"`

---

### 2. AI Column State

When user adds an AI column (e.g., "Is Clinical Trial?" with boolean output), results are stored in three parallel structures keyed by item ID:

**`columns` (updated with AI column):**
```typescript
[
  // ... original columns ...
  {
    id: "ai_is_clinical_trial",
    label: "Is Clinical Trial?",
    accessor: "ai_is_clinical_trial",
    type: "ai",
    aiConfig: {
      promptTemplate: "Is this article about a clinical trial? {title} {abstract}",
      inputColumns: ["title", "abstract"],
      outputType: "boolean",
      showReasoning: false
    },
    visible: true
  }
]
```

**`aiColumnValues`:** `{ columnId: { itemId: value } }`
```typescript
{
  "ai_is_clinical_trial": {
    "12345678": "Yes",
    "23456789": "No",
    "34567890": "No"
  }
}
```

**`aiColumnReasoning`:** `{ columnId: { itemId: reasoning } }`
```typescript
{
  "ai_is_clinical_trial": {
    "12345678": "The article discusses cardiovascular outcomes which indicates a clinical study design.",
    "23456789": "This appears to be a review of immunotherapy approaches, not a clinical trial.",
    "34567890": "This is a review article about machine learning methods, not a clinical trial."
  }
}
```

**`aiColumnConfidence`:** `{ columnId: { itemId: confidence } }`
```typescript
{
  "ai_is_clinical_trial": {
    "12345678": 0.85,
    "23456789": 0.92,
    "34567890": 0.95
  }
}
```

---

### 3. sortedItems

If `sortConfig = { columnId: "publication_date", direction: "desc" }`:

```typescript
// T[] - original items, just reordered
[
  { pmid: "34567890", title: "Machine learning...", publication_date: "2024-03-10", ... },
  { pmid: "23456789", title: "Novel cancer...", publication_date: "2024-02-20", ... },
  { pmid: "12345678", title: "Effects of aspirin...", publication_date: "2024-01-15", ... }
]
```

---

### 4. filteredItems

If `booleanFilters = { "ai_is_clinical_trial": "yes" }`:

```typescript
// T[] - original items, filtered
[
  { pmid: "12345678", title: "Effects of aspirin...", publication_date: "2024-01-15", ... }
]
// Only items where aiColumnValues["ai_is_clinical_trial"]["12345678"] === "Yes"
```

---

### 5. Rendering with getCellValue()

At render time, `getCellValue(item, column)` looks up values:

```typescript
// For regular columns:
getCellValue(item, titleColumn)  // returns item.title

// For AI columns:
getCellValue(item, aiColumn)     // returns aiColumnValues[aiColumn.id][getItemId(item)]
```

This avoids creating intermediate merged objects - values are looked up on-demand.

---

## Key Type Definitions

```typescript
// Column definition
interface TableColumn {
  id: string;
  label: string;
  accessor: string;
  type: 'text' | 'number' | 'date' | 'ai';
  aiConfig?: {
    promptTemplate: string;
    inputColumns: string[];
    outputType?: 'text' | 'number' | 'boolean';
    showReasoning?: boolean;
  };
  visible?: boolean;
  excludeFromAITemplate?: boolean;
}

// Row after transformation (dynamic keys based on columns)
interface TableRow {
  id: string;
  [key: string]: unknown;
}

// Result from AI processing API
interface AIColumnResult {
  id: string;           // Row ID (matches TableRow.id)
  passed: boolean;      // For boolean output
  value: number;        // For number output
  confidence: number;   // Confidence score (0.0-1.0)
  reasoning: string;    // Explanation
  text_value?: string;  // For text output
}
```

---

## Rendering Logic

When rendering a cell for an AI column:

```typescript
const cellValue = row[column.accessor];        // e.g., "Yes" or "No"
const reasoning = aiColumnReasoning[column.id]?.[row.id];
const confidence = aiColumnConfidence[column.id]?.[row.id];
const confidencePercent = Math.round(confidence * 100);

// If showReasoning is enabled:
// Display: "Yes" badge + "85% The article discusses cardiovascular outcomes..."
```

---

## State Reset Behavior

When a new dataset is loaded (detected by comparing first 3 row IDs):

1. `aiColumnValues` → reset to `{}`
2. `aiColumnReasoning` → reset to `{}`
3. `aiColumnConfidence` → reset to `{}`
4. `columns` → reset to `inputColumns` (AI columns removed)
5. `sortConfig` → reset to `null`
6. `filterText` → reset to `""`
7. `booleanFilters` → reset to `{}`

This ensures AI column data doesn't persist when switching between different search results.
