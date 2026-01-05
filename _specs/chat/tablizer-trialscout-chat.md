# Chat Integration for Tablizer and TrialScout

This document specifies how the chat system should integrate with Tablizer (PubMed article analysis) and TrialScout (clinical trials analysis).

## Philosophy

Chat in these apps serves as an **expert colleague** who can see what the user is doing and help them use the application effectively. Chat does **not** replace the application—it helps users discover and leverage features they might not find on their own.

---

## What Chat Can See (Context)

### Tablizer Context

```typescript
{
  current_page: "tablizer",

  // Current search state
  current_query: "EGFR lung cancer resistance",
  current_results_count: 87,
  total_matched: 1234,

  // History/snapshots
  snapshots: [
    { id: "1", label: "Original search", query: "EGFR lung cancer", count: 100, pmid_count: 100 },
    { id: "2", label: "Broader search", query: "EGFR NSCLC therapy", count: 250, pmid_count: 250 }
  ],
  selected_snapshot_id: "1",

  // Compare state
  compare_mode: false,
  compare_snapshots: null,  // or ["1", "2"] when comparing

  // AI columns
  ai_columns: [
    { name: "Mentions resistance mechanisms", type: "boolean", filter_active: true }
  ],

  // What user is looking at
  visible_articles_count: 20,
  filtered_count: 45  // after AI column filtering
}
```

### TrialScout Context

```typescript
{
  current_page: "trialscout",

  // Current search state
  current_search: {
    condition: "non-small cell lung cancer",
    intervention: "pembrolizumab",
    phase: ["PHASE3"],
    status: ["RECRUITING"]
  },
  current_results_count: 47,
  total_matched: 892,

  // AI columns
  ai_columns: [
    { name: "Allows brain mets", type: "boolean", filter_active: false }
  ],

  // What user is looking at
  selected_trial_nct_id: "NCT04613596"  // if viewing details
}
```

---

## Guide Mode: Helping Users Use the App

### 1. Query Development

Users often don't know optimal PubMed query syntax. Chat helps formulate effective queries.

**Tablizer Example:**
```
User: "I want to find articles about EGFR resistance in lung cancer"

Chat: "I can help you build an effective PubMed query. Here's a suggestion
that uses MeSH terms for better coverage:"

┌─────────────────────────────────────────────────────────────┐
│ Suggested PubMed Query                                      │
│                                                             │
│ (EGFR[MeSH] OR "ErbB-1" OR "epidermal growth factor        │
│ receptor") AND (drug resistance, neoplasm[MeSH] OR          │
│ "resistance" OR "resistant") AND (lung neoplasms[MeSH]      │
│ OR "non-small cell lung" OR "NSCLC")                        │
│                                                             │
│ [Accept]  [Modify]                                          │
└─────────────────────────────────────────────────────────────┘

User clicks Accept → Query populates the search field
```

**TrialScout Example:**
```
User: "Find Phase 3 trials for NSCLC with immunotherapy"

Chat: "Here are the search parameters I'd suggest:"

┌─────────────────────────────────────────────────────────────┐
│ Suggested Trial Search                                      │
│                                                             │
│ Condition: non-small cell lung cancer                       │
│ Intervention: immunotherapy OR checkpoint inhibitor OR      │
│              PD-1 OR PD-L1                                  │
│ Phase: Phase 3                                              │
│ Status: Recruiting, Active not recruiting                   │
│                                                             │
│ [Accept]  [Modify]                                          │
└─────────────────────────────────────────────────────────────┘
```

**Payload Type: `query_suggestion`**
- For Tablizer: Contains PubMed query string
- For TrialScout: Contains structured search parameters
- Accept action: Populates search fields and optionally triggers search

---

### 2. Comparison Workflow (Tablizer)

The comparison workflow is powerful but non-obvious. Chat guides users through it.

**The Use Case** (from help docs):
> You have Query A returning 100 results. You suspect you're missing relevant articles.
> You broaden to Query B (150 results). But are those extra 50 actually relevant?

**Chat Guidance:**
```
User: "I'm worried I'm missing relevant articles"

Chat: "I can help you validate your search coverage. Here's the process:

1. Your current search found 100 articles for 'EGFR lung cancer'
2. Run a broader search to catch what you might have missed
3. Use Compare Mode to see what's unique to each search
4. Add an AI column to quickly identify which 'new' articles are relevant

Would you like me to suggest a broader query to compare against?"

User: "Yes"

Chat: "Based on your current query, here's a broader alternative:"

┌─────────────────────────────────────────────────────────────┐
│ Suggested Comparison Query                                  │
│                                                             │
│ Your current (Query A):                                     │
│   EGFR lung cancer                                          │
│                                                             │
│ Suggested broader (Query B):                                │
│   (EGFR OR "epidermal growth factor receptor" OR HER1)     │
│   AND (lung OR pulmonary OR NSCLC) AND (cancer OR          │
│   carcinoma OR neoplasm OR tumor)                          │
│                                                             │
│ [Run Query B]                                               │
└─────────────────────────────────────────────────────────────┘

[After user runs Query B]

Chat: "Great, Query B found 180 articles. Now:

1. Click 'Compare Searches' in the history panel
2. Select your original search (Query A)
3. Select the new search (Query B)

This will show you what's unique to each. Would you like me to walk you through it?"
```

**Payload Type: `workflow_guide`**
- Step-by-step instructions with current step highlighted
- Can include suggested actions at each step
- No direct "Accept" - guides user through app features

---

### 3. AI Column Suggestions

When users want to filter results, chat suggests appropriate AI column criteria.

**Example:**
```
User: "I only want trials that accept patients with brain metastases"

Chat: "I can help you filter for that. I'll suggest an AI column that
checks the eligibility criteria:"

┌─────────────────────────────────────────────────────────────┐
│ AI Column Suggestion                                        │
│                                                             │
│ Column Name: Allows Brain Mets                              │
│ Criteria: "Based on the eligibility criteria, does this    │
│           trial allow patients with brain metastases?       │
│           Consider both inclusion and exclusion criteria."  │
│ Output Type: Yes/No                                         │
│                                                             │
│ [Add Column]  [Modify Criteria]                             │
└─────────────────────────────────────────────────────────────┘

User clicks "Add Column" → AI column is created and processing begins
```

**Payload Type: `ai_column_suggestion`**
- Contains: column name, criteria prompt, output type (boolean/text/number)
- Accept action: Creates the AI column with specified configuration
- Chat should suggest boolean type when user wants to filter (enables quick filters)

---

### 4. Feature Discovery

Users may not know features exist. Chat proactively mentions relevant features.

**Example:**
```
User: "I have 200 articles, this is too many to review"

Chat: "You have several options to narrow down:

1. **AI Columns**: Add a column like 'Is this a clinical trial?' or
   'Does this discuss resistance mechanisms?' to quickly categorize
   and filter. Would you like me to suggest criteria?

2. **Date filters**: You can filter to recent publications only
   (last 2-3 years often captures the most relevant work)

3. **Compare searches**: If you ran a broad search, you could run
   a narrower one and compare to prioritize the 'core' articles

Which approach would you like to try?"
```

---

## Analyze Mode: Answering Questions About Results

When users have specific questions about their loaded data, chat can analyze directly.

### When to Use Analyze Mode

| Question Type | Mode | Why |
|---------------|------|-----|
| "How many trials are Phase 3?" | Analyze | Factual, derivable from loaded data |
| "What's the enrollment range?" | Analyze | Factual summary |
| "Which trials are in California?" | **Guide** | Ongoing filter need → suggest AI column |
| "Summarize the interventions" | Analyze | Synthesis across results |
| "Find only industry-sponsored" | **Guide** | Filter need → suggest column filter |

### Analysis Examples

**Factual Summary:**
```
User: "What phases are represented in my results?"

Chat: "Looking at your 47 trials:
- Phase 3: 23 trials (49%)
- Phase 2: 15 trials (32%)
- Phase 2/3: 6 trials (13%)
- Phase 1: 3 trials (6%)

The majority are late-stage trials. Would you like to filter to a specific phase?"
```

**Pattern Recognition:**
```
User: "What are the common primary endpoints?"

Chat: "Analyzing primary outcomes across your 47 trials:

Most common endpoints:
1. Overall Survival (OS) - 19 trials
2. Progression-Free Survival (PFS) - 14 trials
3. Objective Response Rate (ORR) - 8 trials
4. Disease Control Rate - 4 trials
5. Other/Study-specific - 2 trials

Interestingly, the Phase 3 trials predominantly use OS (15/23),
while Phase 2 trials favor ORR and PFS."
```

**Cross-Reference Insight:**
```
User: "Any trials from the same sponsor?"

Chat: "Looking at lead sponsors in your results:

- Merck Sharp & Dohme: 8 trials (all pembrolizumab combinations)
- Bristol-Myers Squibb: 6 trials (nivolumab-based)
- Roche/Genentech: 5 trials (atezolizumab)
- AstraZeneca: 4 trials (durvalumab)
- Academic/Other: 24 trials

The top 4 pharma sponsors account for 49% of your results."
```

---

## Payloads Specification

### `query_suggestion` (Tablizer)

```typescript
interface QuerySuggestionPayload {
  query: string;           // The PubMed query string
  explanation?: string;    // Why this query structure
  alternatives?: Array<{   // Optional alternatives
    query: string;
    description: string;
  }>;
}
```

**Accept Action**: Populate search field with query, optionally trigger search

### `trial_search_suggestion` (TrialScout)

```typescript
interface TrialSearchSuggestionPayload {
  condition?: string;
  intervention?: string;
  sponsor?: string;
  phase?: string[];
  status?: string[];
  location?: string;
  explanation?: string;
}
```

**Accept Action**: Populate search form fields, optionally trigger search

### `ai_column_suggestion`

```typescript
interface AIColumnSuggestionPayload {
  column_name: string;
  criteria: string;          // The prompt for the AI
  output_type: 'boolean' | 'text' | 'number';
  explanation?: string;      // Why this criteria
}
```

**Accept Action**: Create AI column with specified configuration

### `workflow_guide`

```typescript
interface WorkflowGuidePayload {
  title: string;
  steps: Array<{
    number: number;
    title: string;
    description: string;
    status: 'completed' | 'current' | 'upcoming';
    action?: {               // Optional action button
      label: string;
      type: 'navigate' | 'suggest';
      data?: any;
    };
  }>;
  context?: string;          // Additional context
}
```

**Accept Action**: None (informational), but individual steps may have actions

---

## Context Builder Requirements

The page config context builder must provide rich context for effective assistance.

### Tablizer Context Builder

```python
def build_tablizer_context(context: Dict[str, Any]) -> str:
    query = context.get("current_query", "")
    results_count = context.get("current_results_count", 0)
    total_matched = context.get("total_matched", 0)
    snapshots = context.get("snapshots", [])
    compare_mode = context.get("compare_mode", False)
    ai_columns = context.get("ai_columns", [])

    return f"""The user is using Tablizer to search and analyze PubMed articles.

CURRENT STATE:
- Query: {query or "No search yet"}
- Results: {results_count} articles loaded (of {total_matched} total matches)
- Search history: {len(snapshots)} saved searches
- Compare mode: {"Active" if compare_mode else "Inactive"}
- AI columns: {len(ai_columns)} custom columns

CAPABILITIES YOU CAN HELP WITH:
1. Query formulation: Help build effective PubMed queries with MeSH terms
2. Comparison workflow: Guide through comparing searches to find missed articles
3. AI columns: Suggest criteria for filtering/categorizing articles
4. Feature discovery: Explain available features

WHEN SUGGESTING QUERIES:
- Use proper PubMed syntax (MeSH terms, field tags, boolean operators)
- Explain why the suggested structure improves results
- Offer to create both narrow and broad versions for comparison

WHEN USER ASKS ABOUT RESULTS:
- If factual/summary question: Analyze the loaded data directly
- If filtering need: Suggest an AI column with appropriate criteria
"""
```

### TrialScout Context Builder

```python
def build_trialscout_context(context: Dict[str, Any]) -> str:
    search = context.get("current_search", {})
    results_count = context.get("current_results_count", 0)
    total_matched = context.get("total_matched", 0)
    ai_columns = context.get("ai_columns", [])
    selected_trial = context.get("selected_trial_nct_id")

    return f"""The user is using TrialScout to search and analyze clinical trials from ClinicalTrials.gov.

CURRENT STATE:
- Search: {search or "No search yet"}
- Results: {results_count} trials loaded (of {total_matched} total matches)
- AI columns: {len(ai_columns)} custom columns
- Viewing trial: {selected_trial or "None selected"}

CAPABILITIES YOU CAN HELP WITH:
1. Search formulation: Help construct effective trial searches
2. AI columns: Suggest criteria for filtering trials (eligibility, endpoints, etc.)
3. Trial analysis: Answer questions about loaded trials
4. Feature discovery: Explain available features

WHEN SUGGESTING SEARCHES:
- Use appropriate condition/intervention terminology
- Consider phase and status filters for relevance
- Explain trade-offs between narrow and broad searches

WHEN USER ASKS ABOUT RESULTS:
- If factual/summary question: Analyze the loaded trial data directly
- If filtering need: Suggest an AI column with appropriate criteria

KEY TRIAL FIELDS FOR ANALYSIS:
- primary_outcomes, secondary_outcomes (endpoints)
- eligibility_criteria (inclusion/exclusion)
- phase, status, enrollment_count
- lead_sponsor, conditions, interventions
"""
```

---

## Implementation Checklist

### Backend

- [ ] Create `backend/services/chat_page_config/tablizer.py`
- [ ] Create `backend/services/chat_page_config/trialscout.py`
- [ ] Define payload types in `backend/schemas/payloads.py`:
  - [ ] `query_suggestion` (or extend existing)
  - [ ] `trial_search_suggestion`
  - [ ] `ai_column_suggestion`
  - [ ] `workflow_guide`
- [ ] Import page configs in `chat_page_config/__init__.py`

### Frontend

- [ ] Create `QuerySuggestionCard.tsx`
- [ ] Create `TrialSearchSuggestionCard.tsx`
- [ ] Create `AIColumnSuggestionCard.tsx`
- [ ] Create `WorkflowGuideCard.tsx`
- [ ] Add ChatTray to Tablizer page with:
  - [ ] Rich context including search state, snapshots, AI columns
  - [ ] Payload handlers with accept callbacks
- [ ] Add ChatTray to TrialScout page with:
  - [ ] Rich context including search params, results, AI columns
  - [ ] Payload handlers with accept callbacks

### Integration

- [ ] Implement accept handlers:
  - [ ] Query suggestion → populate search field
  - [ ] AI column suggestion → create column via existing function
  - [ ] Trial search suggestion → populate form fields
- [ ] Test workflows:
  - [ ] Query development flow
  - [ ] Comparison guidance flow
  - [ ] AI column suggestion flow
  - [ ] Direct analysis of results
