# Chat Integration for Tablizer and TrialScout

This document specifies how the chat system integrates with Tablizer (PubMed article analysis) and TrialScout (clinical trials analysis).

## Philosophy

Chat serves as an **expert colleague** who can see what the user is doing. It has two roles:

### 1. Guide & Facilitate

Make it easier for users to navigate and use the app. This includes:
- Constructing queries the user doesn't know the syntax for
- Filling in search forms based on natural language ("find Phase 3 NSCLC trials")
- Setting up AI columns with well-crafted criteria
- Explaining features and walking through workflows

This is about **helping users drive the application**. Chat does the work, user approves—suggestions come as cards with Accept/Dismiss buttons.

### 2. Enhance

Add an intelligence layer over the data in the app. This includes:
- Analyzing loaded results and answering questions about them
- Synthesizing patterns across many items
- Cross-referencing and identifying relationships
- Providing insights the user would have to manually compute

This is about **capabilities beyond what the UI offers**—the LLM can see all the data and reason about it.

---

## Payloads

Following the existing pattern (see `QuerySuggestionCard.tsx`), we need these payload types:

### 1. `pubmed_query_suggestion` (Tablizer)

For suggesting PubMed search queries. Can reuse existing `query_suggestion` payload or create Tablizer-specific version.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="pubmed_query_suggestion",
    description="Suggested PubMed query for Tablizer",
    source="llm",
    is_global=False,
    parse_marker="PUBMED_QUERY:",
    parser=make_json_parser("pubmed_query_suggestion"),
    llm_instructions="""
PUBMED_QUERY - Use when user asks to search for articles or build a query:

PUBMED_QUERY: {
  "query": "The PubMed query string",
  "explanation": "What this query searches for"
}

Example:
User: "Find EGFR resistance articles in lung cancer"
PUBMED_QUERY: {
  "query": "(EGFR[MeSH] OR \"epidermal growth factor receptor\") AND (drug resistance[MeSH] OR resistant) AND (lung neoplasms[MeSH] OR NSCLC)",
  "explanation": "Searches for EGFR-related resistance in lung cancer using MeSH terms for better coverage"
}
""",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "explanation": {"type": "string"}
        },
        "required": ["query"]
    }
))
```

**Frontend Card** (`components/chat/PubMedQueryCard.tsx`):
- Shows the query in a code block
- Shows the explanation
- Accept button → calls `onAccept(payload)` which populates the search field
- Dismiss button

**Page Integration** (in Tablizer page):
```tsx
payloadHandlers={{
    pubmed_query_suggestion: {
        render: (payload, callbacks) => (
            <PubMedQueryCard
                query={payload.query}
                explanation={payload.explanation}
                onAccept={() => {
                    setSearchQuery(payload.query);
                    callbacks.onAccept?.(payload);
                }}
                onReject={callbacks.onReject}
            />
        )
    }
}}
```

---

### 2. `trial_search_suggestion` (TrialScout)

For suggesting ClinicalTrials.gov search parameters.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="trial_search_suggestion",
    description="Suggested trial search parameters for TrialScout",
    source="llm",
    is_global=False,
    parse_marker="TRIAL_SEARCH:",
    parser=make_json_parser("trial_search_suggestion"),
    llm_instructions="""
TRIAL_SEARCH - Use when user asks to search for clinical trials:

TRIAL_SEARCH: {
  "condition": "condition to search",
  "intervention": "intervention/drug to search",
  "phase": ["PHASE2", "PHASE3"],
  "status": ["RECRUITING", "ACTIVE_NOT_RECRUITING"],
  "explanation": "What this search will find"
}

All fields except explanation are optional. Only include fields the user specified or that are clearly implied.

Phase values: EARLY_PHASE1, PHASE1, PHASE2, PHASE3, PHASE4, NA
Status values: RECRUITING, ACTIVE_NOT_RECRUITING, COMPLETED, NOT_YET_RECRUITING, TERMINATED, WITHDRAWN, SUSPENDED

Example:
User: "Find Phase 3 immunotherapy trials for NSCLC"
TRIAL_SEARCH: {
  "condition": "non-small cell lung cancer",
  "intervention": "immunotherapy OR checkpoint inhibitor OR PD-1 OR PD-L1",
  "phase": ["PHASE3"],
  "status": ["RECRUITING", "ACTIVE_NOT_RECRUITING"],
  "explanation": "Phase 3 immunotherapy trials for NSCLC that are currently active"
}
""",
    schema={
        "type": "object",
        "properties": {
            "condition": {"type": "string"},
            "intervention": {"type": "string"},
            "sponsor": {"type": "string"},
            "phase": {"type": "array", "items": {"type": "string"}},
            "status": {"type": "array", "items": {"type": "string"}},
            "explanation": {"type": "string"}
        }
    }
))
```

**Frontend Card** (`components/chat/TrialSearchCard.tsx`):
- Shows each search field that has a value
- Shows explanation
- Accept button → populates the search form fields
- Dismiss button

---

### 3. `ai_column_suggestion` (Both)

For suggesting AI columns to add.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="ai_column_suggestion",
    description="Suggested AI column for filtering/analysis",
    source="llm",
    is_global=False,
    parse_marker="AI_COLUMN:",
    parser=make_json_parser("ai_column_suggestion"),
    llm_instructions="""
AI_COLUMN - Use when user wants to filter or categorize results:

AI_COLUMN: {
  "name": "Column display name",
  "criteria": "The criteria prompt for the AI to evaluate",
  "type": "boolean",
  "explanation": "What this column will help identify"
}

Type should be "boolean" for yes/no filtering, "text" for open-ended extraction.

Example:
User: "I only want trials that allow brain metastases"
AI_COLUMN: {
  "name": "Allows Brain Mets",
  "criteria": "Based on the eligibility criteria, does this trial allow patients with brain metastases? Consider both inclusion and exclusion criteria.",
  "type": "boolean",
  "explanation": "Will identify trials that accept patients with brain metastases, which you can then filter to show only 'Yes' results"
}

Example:
User: "Add a column for the primary endpoint"
AI_COLUMN: {
  "name": "Primary Endpoint",
  "criteria": "What is the primary endpoint of this trial? Summarize in a few words (e.g., 'Overall Survival', 'Progression-Free Survival', 'ORR').",
  "type": "text",
  "explanation": "Extracts the primary endpoint for each trial so you can quickly compare them"
}
""",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "criteria": {"type": "string"},
            "type": {"type": "string", "enum": ["boolean", "text"]},
            "explanation": {"type": "string"}
        },
        "required": ["name", "criteria", "type"]
    }
))
```

**Frontend Card** (`components/chat/AIColumnCard.tsx`):
- Shows column name
- Shows criteria in a text block
- Shows type (Yes/No vs Text)
- Shows explanation
- Accept button → calls the addAIColumn function
- Dismiss button

---

## Context

### Design Principle

**If the user sees it on screen and it's dynamic, include it in context.**

### Tablizer Context

```typescript
{
  current_page: "tablizer",

  // Search state
  query: "EGFR lung cancer",
  date_start: "2022-01-01",  // or null
  date_end: null,

  // Results
  total_matched: 1234,
  loaded_count: 100,

  // AI columns
  ai_columns: [
    { name: "Mentions resistance", type: "boolean", filter_active: true }
  ],

  // Article summaries (for analysis)
  articles: [
    { pmid: "12345", title: "EGFR mutations...", year: 2023, journal: "Nature" }
    // ... first 20-50 articles
  ]
}
```

### TrialScout Context

```typescript
{
  current_page: "trialscout",

  // Search state (all form fields)
  condition: "non-small cell lung cancer",
  intervention: "pembrolizumab",
  phase: ["PHASE3"],
  status: ["RECRUITING"],
  sponsor: "",

  // Results
  total_matched: 892,
  loaded_count: 50,

  // AI columns
  ai_columns: [
    { name: "Allows brain mets", type: "boolean", filter_active: false }
  ],

  // Trial summaries (for analysis)
  trials: [
    { nct_id: "NCT04613596", title: "Study of...", phase: "Phase 3", status: "Recruiting", enrollment: 450 }
    // ... first 20-50 trials
  ]
}
```

---

## Data Retrieval Tools

For analysis, the LLM needs to fetch full article/trial data on demand.

### `fetch_articles` (Tablizer)

Uses existing PubMed article retrieval. Already have `pubmed_article` payload type.

### `fetch_trials` (TrialScout - NEW)

**Backend Tool** (`tools/builtin/trials.py`):
```python
register_tool(ToolConfig(
    name="fetch_trials",
    description="Fetch full details for clinical trials by NCT ID",
    input_schema={
        "type": "object",
        "properties": {
            "nct_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "NCT IDs to fetch (max 5)"
            }
        },
        "required": ["nct_ids"]
    },
    executor=execute_fetch_trials,
    is_global=False,  # Only for TrialScout
    payload_type="trial_details"
))
```

---

## Implementation Checklist

### Backend
- [ ] Add `pubmed_query_suggestion` payload to `schemas/payloads.py`
- [ ] Add `trial_search_suggestion` payload to `schemas/payloads.py`
- [ ] Add `ai_column_suggestion` payload to `schemas/payloads.py`
- [ ] Create `chat_page_config/tablizer.py` with context builder
- [ ] Create `chat_page_config/trialscout.py` with context builder
- [ ] Add `fetch_trials` tool for TrialScout analysis

### Frontend
- [ ] Create `PubMedQueryCard.tsx` (or reuse QuerySuggestionCard)
- [ ] Create `TrialSearchCard.tsx`
- [ ] Create `AIColumnCard.tsx`
- [ ] Add ChatTray to Tablizer with payloadHandlers
- [ ] Add ChatTray to TrialScout with payloadHandlers
