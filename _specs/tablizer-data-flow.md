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
│                              baseRows                                       │
│              (derived from inputData, no state)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   aiColumnValues    │  │  aiColumnReasoning  │  │  aiColumnConfidence │
│      (state)        │  │      (state)        │  │      (state)        │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             displayRows                                     │
│              (merges baseRows + aiColumnValues)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              sortedData                                     │
│                    (applies sortConfig to displayRows)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             filteredData                                    │
│          (applies filterText + booleanFilters to sortedData)                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                              [ Rendered Table ]
```

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

### 2. baseRows (Derived)

Transforms each input item into a `TableRow` with `id` field and accessible column values:

```typescript
// TableRow[] - keyed by column accessor
[
  {
    id: "12345678",           // from idField (pmid)
    pmid: "12345678",
    title: "Effects of aspirin on cardiovascular outcomes",
    abstract: "Background: Aspirin is widely used...",
    journal: "NEJM",
    publication_date: "2024-01-15"
  },
  {
    id: "23456789",
    pmid: "23456789",
    title: "Novel cancer immunotherapy approaches",
    abstract: "Recent advances in immunotherapy...",
    journal: "Nature Medicine",
    publication_date: "2024-02-20"
  },
  {
    id: "34567890",
    pmid: "34567890",
    title: "Machine learning in drug discovery",
    abstract: "This review examines how ML...",
    journal: "Science",
    publication_date: "2024-03-10"
  }
]
```

---

### 3. AI Column State

When user adds an AI column (e.g., "Is Clinical Trial?" with boolean output), results are stored in three parallel structures:

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

**`aiColumnValues`:** `{ columnId: { rowId: value } }`
```typescript
{
  "ai_is_clinical_trial": {
    "12345678": "Yes",
    "23456789": "No",
    "34567890": "No"
  }
}
```

**`aiColumnReasoning`:** `{ columnId: { rowId: reasoning } }`
```typescript
{
  "ai_is_clinical_trial": {
    "12345678": "The article discusses cardiovascular outcomes which indicates a clinical study design.",
    "23456789": "This appears to be a review of immunotherapy approaches, not a clinical trial.",
    "34567890": "This is a review article about machine learning methods, not a clinical trial."
  }
}
```

**`aiColumnConfidence`:** `{ columnId: { rowId: confidence } }`
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

### 4. displayRows (Merged)

Merges `baseRows` with `aiColumnValues`:

```typescript
[
  {
    id: "12345678",
    pmid: "12345678",
    title: "Effects of aspirin on cardiovascular outcomes",
    abstract: "Background: Aspirin is widely used...",
    journal: "NEJM",
    publication_date: "2024-01-15",
    ai_is_clinical_trial: "Yes"              // <-- merged from aiColumnValues
  },
  {
    id: "23456789",
    pmid: "23456789",
    title: "Novel cancer immunotherapy approaches",
    abstract: "Recent advances in immunotherapy...",
    journal: "Nature Medicine",
    publication_date: "2024-02-20",
    ai_is_clinical_trial: "No"               // <-- merged
  },
  {
    id: "34567890",
    pmid: "34567890",
    title: "Machine learning in drug discovery",
    abstract: "This review examines how ML...",
    journal: "Science",
    publication_date: "2024-03-10",
    ai_is_clinical_trial: "No"               // <-- merged
  }
]
```

---

### 5. sortedData

If `sortConfig = { columnId: "publication_date", direction: "desc" }`:

```typescript
[
  { id: "34567890", ..., publication_date: "2024-03-10", ai_is_clinical_trial: "No" },
  { id: "23456789", ..., publication_date: "2024-02-20", ai_is_clinical_trial: "No" },
  { id: "12345678", ..., publication_date: "2024-01-15", ai_is_clinical_trial: "Yes" }
]
```

---

### 6. filteredData

If `booleanFilters = { "ai_is_clinical_trial": "yes" }`:

```typescript
[
  { id: "12345678", ..., publication_date: "2024-01-15", ai_is_clinical_trial: "Yes" }
]
// Only rows where ai_is_clinical_trial === "Yes"
```

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
