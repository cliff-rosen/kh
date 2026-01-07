# Tablizer Sample Data & Data Flow

This document shows concrete sample data at each stage of the Tablizer data pipeline.

---

## Stage 1: Input Data (Props)

The parent component passes in an array of objects. Example with 3 articles:

```typescript
// props.data: CanonicalResearchArticle[]
const inputArticles = [
  {
    pmid: "38901234",
    title: "Efficacy of Drug X in treating Type 2 Diabetes: A Randomized Controlled Trial",
    abstract: "BACKGROUND: Type 2 diabetes affects millions worldwide...",
    journal: "New England Journal of Medicine",
    publication_date: "2024-06-15",
    authors: ["Smith J", "Chen W", "Garcia M"],
    mesh_terms: ["Diabetes Mellitus, Type 2", "Drug Therapy"],
    // ... other fields
  },
  {
    pmid: "38902345",
    title: "Meta-analysis of cardiovascular outcomes in diabetic patients",
    abstract: "OBJECTIVE: To synthesize evidence on cardiovascular risk...",
    journal: "Lancet",
    publication_date: "2024-05-20",
    authors: ["Johnson R", "Williams K"],
    mesh_terms: ["Cardiovascular Diseases", "Diabetes Complications"],
  },
  {
    pmid: "38903456",
    title: "Review: Current guidelines for diabetes management",
    abstract: "This review summarizes the latest ADA guidelines...",
    journal: "Diabetes Care",
    publication_date: "2024-04-10",
    authors: ["Thompson L"],
    mesh_terms: ["Practice Guidelines", "Diabetes Mellitus"],
  }
];
```

Also passed in:

```typescript
// props.idField
const idField = "pmid";

// props.columns (base columns)
const inputColumns: TableColumn[] = [
  { id: "pmid",             label: "PMID",     accessor: "pmid",             type: "text",  visible: true },
  { id: "title",            label: "Title",    accessor: "title",            type: "text",  visible: true },
  { id: "abstract",         label: "Abstract", accessor: "abstract",         type: "text",  visible: false },
  { id: "journal",          label: "Journal",  accessor: "journal",          type: "text",  visible: true },
  { id: "publication_date", label: "Date",     accessor: "publication_date", type: "date",  visible: true },
];
```

---

## Stage 2: Base Rows (Derived from Input)

Tablizer converts `inputData` → `baseRows` using a `useMemo`:

```typescript
// baseRows: TableRow[] - derived, NOT stored in state
const baseRows = [
  {
    id: "38901234",                    // from idField
    pmid: "38901234",
    title: "Efficacy of Drug X in treating Type 2 Diabetes: A Randomized Controlled Trial",
    abstract: "BACKGROUND: Type 2 diabetes affects millions worldwide...",
    journal: "New England Journal of Medicine",
    publication_date: "2024-06-15",
    authors: "Smith J, Chen W, Garcia M",  // arrays joined with ", "
  },
  {
    id: "38902345",
    pmid: "38902345",
    title: "Meta-analysis of cardiovascular outcomes in diabetic patients",
    abstract: "OBJECTIVE: To synthesize evidence on cardiovascular risk...",
    journal: "Lancet",
    publication_date: "2024-05-20",
    authors: "Johnson R, Williams K",
  },
  {
    id: "38903456",
    pmid: "38903456",
    title: "Review: Current guidelines for diabetes management",
    abstract: "This review summarizes the latest ADA guidelines...",
    journal: "Diabetes Care",
    publication_date: "2024-04-10",
    authors: "Thompson L",
  }
];
```

**Key transformation**: Arrays (like `authors`) become comma-separated strings.

---

## Stage 3: User Adds an AI Column

User opens "Add AI Column" modal and configures:

```
Column Name: "Is RCT"
Prompt Template: "Is this article a randomized controlled trial? {title} {abstract}"
Output Type: boolean
```

This creates a new column definition:

```typescript
const newAIColumn: TableColumn = {
  id: "ai_1704067200000",        // generated: ai_<timestamp>
  label: "Is RCT",
  accessor: "ai_1704067200000",  // same as id
  type: "ai",
  aiConfig: {
    promptTemplate: "Is this article a randomized controlled trial? {title} {abstract}",
    inputColumns: ["title", "abstract"],
    outputType: "boolean",
  },
  visible: true,
};
```

Now `columns` state becomes:

```typescript
// columns: TableColumn[] - this IS state
const columns = [
  { id: "pmid",             label: "PMID",     accessor: "pmid",             type: "text",  visible: true },
  { id: "title",            label: "Title",    accessor: "title",            type: "text",  visible: true },
  { id: "abstract",         label: "Abstract", accessor: "abstract",         type: "text",  visible: false },
  { id: "journal",          label: "Journal",  accessor: "journal",          type: "text",  visible: true },
  { id: "publication_date", label: "Date",     accessor: "publication_date", type: "date",  visible: true },
  // NEW AI COLUMN ↓
  { id: "ai_1704067200000", label: "Is RCT",   accessor: "ai_1704067200000", type: "ai",
    aiConfig: { promptTemplate: "...", inputColumns: ["title", "abstract"], outputType: "boolean" },
    visible: true },
];
```

---

## Stage 4: AI Processing

Tablizer calls `onProcessAIColumn()`. The backend returns:

```typescript
// API Response: AIColumnResult[]
const aiResults = [
  {
    id: "38901234",
    passed: true,
    score: 0.95,
    reasoning: "The title explicitly mentions 'Randomized Controlled Trial' and the abstract describes randomization methodology.",
  },
  {
    id: "38902345",
    passed: false,
    score: 0.20,
    reasoning: "This is a meta-analysis, not a primary RCT. It synthesizes data from multiple studies.",
  },
  {
    id: "38903456",
    passed: false,
    score: 0.10,
    reasoning: "This is a review article summarizing guidelines, not an original RCT.",
  }
];
```

---

## Stage 5: AI Column Values (State)

Tablizer stores AI results in two separate state objects:

```typescript
// aiColumnValues: Record<columnId, Record<rowId, value>>
// This IS state (the ONLY state for row data)
const aiColumnValues = {
  "ai_1704067200000": {
    "38901234": "Yes",      // boolean → "Yes"/"No" strings for display
    "38902345": "No",
    "38903456": "No",
  }
};

// aiColumnReasoning: Record<columnId, Record<rowId, reasoning>>
// Separate state for reasoning
const aiColumnReasoning = {
  "ai_1704067200000": {
    "38901234": "The title explicitly mentions 'Randomized Controlled Trial'...",
    "38902345": "This is a meta-analysis, not a primary RCT...",
    "38903456": "This is a review article summarizing guidelines...",
  }
};
```

---

## Stage 6: Display Rows (Derived)

Base rows are merged with AI column values:

```typescript
// displayRows: TableRow[] - derived, NOT state
const displayRows = [
  {
    id: "38901234",
    pmid: "38901234",
    title: "Efficacy of Drug X in treating Type 2 Diabetes: A Randomized Controlled Trial",
    abstract: "BACKGROUND: Type 2 diabetes affects millions worldwide...",
    journal: "New England Journal of Medicine",
    publication_date: "2024-06-15",
    authors: "Smith J, Chen W, Garcia M",
    "ai_1704067200000": "Yes",    // ← AI column value merged in
  },
  {
    id: "38902345",
    pmid: "38902345",
    title: "Meta-analysis of cardiovascular outcomes in diabetic patients",
    abstract: "OBJECTIVE: To synthesize evidence on cardiovascular risk...",
    journal: "Lancet",
    publication_date: "2024-05-20",
    authors: "Johnson R, Williams K",
    "ai_1704067200000": "No",     // ← AI column value merged in
  },
  {
    id: "38903456",
    pmid: "38903456",
    title: "Review: Current guidelines for diabetes management",
    abstract: "This review summarizes the latest ADA guidelines...",
    journal: "Diabetes Care",
    publication_date: "2024-04-10",
    authors: "Thompson L",
    "ai_1704067200000": "No",     // ← AI column value merged in
  }
];
```

---

## Stage 7: User Adds Another AI Column

User adds a text extraction column:

```
Column Name: "Study Type"
Prompt Template: "Classify this study type (RCT, Meta-analysis, Review, Cohort, Case-control, etc.): {title}"
Output Type: text
```

After processing, the state grows:

```typescript
const aiColumnValues = {
  "ai_1704067200000": {           // Is RCT (boolean)
    "38901234": "Yes",
    "38902345": "No",
    "38903456": "No",
  },
  "ai_1704067300000": {           // Study Type (text)
    "38901234": "Randomized Controlled Trial",
    "38902345": "Meta-analysis",
    "38903456": "Narrative Review",
  }
};

const aiColumnReasoning = {
  "ai_1704067200000": { ... },
  "ai_1704067300000": {
    "38901234": "The title explicitly states 'Randomized Controlled Trial'",
    "38902345": "The title identifies this as a 'Meta-analysis'",
    "38903456": "The title begins with 'Review:' indicating a review article",
  }
};
```

And `displayRows` now includes both AI columns:

```typescript
const displayRows = [
  {
    id: "38901234",
    pmid: "38901234",
    title: "Efficacy of Drug X in treating Type 2 Diabetes...",
    journal: "New England Journal of Medicine",
    publication_date: "2024-06-15",
    "ai_1704067200000": "Yes",                        // Is RCT
    "ai_1704067300000": "Randomized Controlled Trial", // Study Type
  },
  // ...
];
```

---

## Visual: Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PARENT COMPONENT                                  │
│  (e.g., TablizePubMed)                                                      │
│                                                                             │
│  articles[]  ──────────────────────────────────────┐                        │
│  (raw API data)                                    │                        │
│                                                    │                        │
│  columns[]   ──────────────────────────────────────┤                        │
│  (base columns)                                    │                        │
│                                                    │                        │
│  idField     ──────────────────────────────────────┼──▶ TABLIZER PROPS      │
│  ("pmid")                                          │                        │
│                                                    │                        │
│  onProcessAIColumn()  ─────────────────────────────┤                        │
│  (API callback)                                    │                        │
└────────────────────────────────────────────────────┼────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TABLIZER COMPONENT                               │
│                                                                             │
│  ┌──────────────────┐      ┌──────────────────────────────────────────┐    │
│  │   props.data     │      │  useMemo: baseRows                       │    │
│  │   (articles)     │ ───▶ │  - Extract values for each column       │    │
│  │                  │      │  - Join arrays with ", "                 │    │
│  └──────────────────┘      │  - Add id from idField                   │    │
│                            └───────────────────┬──────────────────────┘    │
│                                                │                           │
│                                                ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  STATE: columns[]                                                 │     │
│  │  - Base columns from props                                        │     │
│  │  - AI columns added by user                                       │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  STATE: aiColumnValues                                            │     │
│  │  {                                                                │     │
│  │    "ai_xxx": { "pmid1": "Yes", "pmid2": "No", ... }              │     │
│  │  }                                                                │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  STATE: aiColumnReasoning                                         │     │
│  │  {                                                                │     │
│  │    "ai_xxx": { "pmid1": "Because...", "pmid2": "Since...", ... } │     │
│  │  }                                                                │     │
│  └──────────────────────────────────────────────────────────────────┘     │
│                                                │                           │
│                                                ▼                           │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  useMemo: displayRows                                             │     │
│  │  - Start with baseRows                                            │     │
│  │  - Merge in aiColumnValues for each row                           │     │
│  └───────────────────────────────────────────┬──────────────────────┘     │
│                                              │                             │
│                                              ▼                             │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  useMemo: sortedData                                              │     │
│  │  - Sort displayRows by sortConfig                                 │     │
│  └───────────────────────────────────────────┬──────────────────────┘     │
│                                              │                             │
│                                              ▼                             │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  useMemo: filteredData                                            │     │
│  │  - Apply filterText (search)                                      │     │
│  │  - Apply booleanFilters (Yes/No/All for AI columns)               │     │
│  └───────────────────────────────────────────┬──────────────────────┘     │
│                                              │                             │
│                                              ▼                             │
│  ┌──────────────────────────────────────────────────────────────────┐     │
│  │  RENDER TABLE                                                     │     │
│  │  - visibleColumns (from columns state)                            │     │
│  │  - filteredData (rows to display)                                 │     │
│  └──────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table View: What the User Sees

After both AI columns are added and the user filters to "Is RCT = Yes":

| PMID     | Title                                              | Journal                    | Date       | Is RCT | Study Type                   |
|----------|----------------------------------------------------|-----------------------------|------------|--------|------------------------------|
| 38901234 | Efficacy of Drug X in treating Type 2 Diabetes... | New England J. of Medicine | 2024-06-15 | ✓ Yes  | Randomized Controlled Trial  |

The other two rows are hidden because they have "Is RCT = No" and the filter is set to "Yes".

---

## Key State Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WHAT IS STATE vs DERIVED                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  STATE (useState):                                                      │
│  ─────────────────                                                      │
│  • columns[]            - Base + AI column definitions                  │
│  • aiColumnValues{}     - AI results: { colId: { rowId: value } }      │
│  • aiColumnReasoning{}  - AI reasoning: { colId: { rowId: text } }     │
│  • sortConfig           - Current sort column + direction               │
│  • filterText           - Global search string                          │
│  • booleanFilters{}     - AI column filters: { colId: 'all'|'yes'|'no' }│
│                                                                         │
│  DERIVED (useMemo):                                                     │
│  ──────────────────                                                     │
│  • baseRows[]           - Converted from props.data                     │
│  • displayRows[]        - baseRows + aiColumnValues merged              │
│  • sortedData[]         - displayRows sorted                            │
│  • filteredData[]       - sortedData filtered                           │
│  • visibleColumns[]     - columns where visible !== false               │
│                                                                         │
│  PROPS (from parent):                                                   │
│  ────────────────────                                                   │
│  • data[]               - Raw input data                                │
│  • idField              - Which field is the unique ID                  │
│  • columns[]            - Base column definitions                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Type Definitions Reference

```typescript
// Core row type (flexible key-value)
interface TableRow {
  id: string;              // Required: unique identifier
  [key: string]: unknown;  // Dynamic fields
}

// Column definition
interface TableColumn {
  id: string;                     // Unique column ID
  label: string;                  // Display name
  accessor: string;               // Key in TableRow to access
  type: 'text' | 'number' | 'date' | 'ai';
  visible?: boolean;              // Default: true
  aiConfig?: {
    promptTemplate: string;       // e.g., "Is this an RCT? {title}"
    inputColumns: string[];       // e.g., ["title", "abstract"]
    outputType: 'text' | 'number' | 'boolean';
    showReasoning?: boolean;      // Show reasoning in cell
  };
}

// AI processing result from API
interface AIColumnResult {
  id: string;              // Row ID (matches TableRow.id)
  passed: boolean;         // For boolean output
  score: number;           // For number output (or confidence)
  reasoning: string;       // AI explanation
  text_value?: string;     // For text output - the extracted answer
}
```
