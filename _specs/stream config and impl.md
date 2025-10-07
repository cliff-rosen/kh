  Two Distinct Workflows

  Workflow 1: Research Stream Definition (Current - Complete)

  - Goal: Define WHAT to monitor
  - End state: Stream with name, purpose, channels, frequency
  - UX: Conversational, flexible, exploratory
  - Completion: "Your research stream is defined! [Create Stream] or [Configure Workflow]"

  Workflow 2: Implementation Configuration (New - Structured)

  - Goal: Define HOW to monitor (per channel)
  - End state: Fully configured sources, queries, scoring, tested & validated
  - UX: Structured, step-by-step, validation-focused
  - Entry point: After stream definition OR from edit form

  ---
  Workflow 2 Design: Per-Channel Implementation

  Structure: Channel-by-Channel Approach

  For each channel:
    1. SOURCE_SELECTION
    2. QUERY_CONFIGURATION (per source)
    3. QUERY_TESTING (per source)
    4. SEMANTIC_FILTER_CONFIG (if applicable)
    5. SEMANTIC_FILTER_TESTING
    → Next channel or finalize

  Detailed Flow

  Entry Screen:
  "Your stream definition is complete!

  Next, let's configure how we'll gather information for each channel.
  We'll work through each channel one at a time:

  📊 Channel 1: Melanocortin Pathway Research
  📊 Channel 2: Obesity & Metabolic Disease
  📊 Channel 3: Ocular Disease Research

  This will take about 5-10 minutes per channel.

  [Configure Now] [Skip - Use Defaults] [Do This Later]"

  ---
  Per-Channel Configuration UI

  Channel Progress Indicator:
  ┌─────────────────────────────────────────────┐
  │ Configuring: Melanocortin Pathway Research │
  │ Channel 1 of 3                              │
  │ ▓▓▓▓▓░░░░░ 50% Complete                    │
  └─────────────────────────────────────────────┘

  ---
  Step 1: SOURCE_SELECTION

  UI Style: Checkbox list with descriptions

  Select information sources for this channel:

  □ PubMed
    National Library of Medicine - Best for peer-reviewed biomedical research
    Query syntax: Boolean (AND, OR, NOT)

  ☑ Google Scholar
    Broad academic coverage - Includes citations, patents, preprints
    Query syntax: Natural language with | for OR

  □ bioRxiv
    Preprint server - Get early access to unpublished research
    Query syntax: Boolean (AND, OR, NOT)

  [Recommend Sources for Me]  [Continue with 1 selected]

  Backend Logic:
  - AI analyzes channel type (scientific → suggest PubMed, bioRxiv)
  - Shows source descriptions from authoritative list
  - Allows multi-select

  ---
  Step 2: QUERY_CONFIGURATION

  UI Style: Form with live preview

  ┌─────────────────────────────────────────┐
  │ Query Expression for Google Scholar    │
  ├─────────────────────────────────────────┤
  │ Channel: Melanocortin Pathway Research │
  │                                         │
  │ Base Keywords:                          │
  │ melanocortin, MCR1, MCR4, MCR5, ...    │
  │                                         │
  │ Query Expression:                       │
  │ ┌─────────────────────────────────────┐ │
  │ │ melanocortin | MCR1 | MCR4 | MCR5  │ │
  │ │ | "alpha-MSH" | "melanocortin       │ │
  │ │  receptor"                          │ │
  │ └─────────────────────────────────────┘ │
  │                                         │
  │ [Generate from Keywords] [Clear]       │
  │                                         │
  │ Syntax Help: Google Scholar uses |     │
  │ for OR, quotes for phrases             │
  └─────────────────────────────────────────┘

  [Test This Query →]

  Backend Logic:
  - Start with AI-generated query from keywords
  - User can edit
  - Show syntax hints based on source
  - "Generate from Keywords" button to reset

  ---
  Step 3: QUERY_TESTING

  UI Style: Test interface with live results

  ┌─────────────────────────────────────────────┐
  │ Test Query: melanocortin | MCR1 | MCR4     │
  │ Source: Google Scholar                      │
  ├─────────────────────────────────────────────┤
  │ [Run Test Query]                            │
  │                                             │
  │ Status: ✓ Query executed successfully      │
  │ Results: 847 articles found                 │
  │                                             │
  │ Sample Results (3 most recent):             │
  │ ┌─────────────────────────────────────────┐ │
  │ │ 1. "Melanocortin Receptor Signaling..." │ │
  │ │    Nature, 2024 | Relevant: High       │ │
  │ │ 2. "MC4R Agonists in Obesity..."        │ │
  │ │    Science, 2024 | Relevant: High      │ │
  │ │ 3. "Alpha-MSH and Appetite Control..."  │ │
  │ │    Cell, 2023 | Relevant: Medium       │ │
  │ └─────────────────────────────────────────┘ │
  │                                             │
  │ Too many results? [Refine Query]           │
  │ Too few results? [Broaden Query]           │
  │ Looks good? [Accept & Continue]            │
  └─────────────────────────────────────────────┘

  Backend Logic:
  - Execute query against live API (limited results)
  - Show count + sample articles
  - Quick relevance check (keyword matching)
  - Allow iteration

  ---
  Step 4: SEMANTIC_FILTER_CONFIG

  UI Style: Toggle + form

  ┌─────────────────────────────────────────────┐
  │ Semantic Filtering (Optional)               │
  ├─────────────────────────────────────────────┤
  │ ☑ Enable semantic filtering for this       │
  │   channel                                   │
  │                                             │
  │ Filter Criteria:                            │
  │ ┌─────────────────────────────────────────┐ │
  │ │ Only include articles that discuss      │ │
  │ │ melanocortin receptor mechanisms        │ │
  │ │ relevant to therapeutic development     │ │
  │ └─────────────────────────────────────────┘ │
  │                                             │
  │ Similarity Threshold:                       │
  │ ├────────●─────┤ 0.7                       │
  │ Strict   ↑   Permissive                    │
  │                                             │
  │ What does this do?                          │
  │ Articles will be filtered to only include  │
  │ those semantically similar to your         │
  │ criteria, reducing noise.                  │
  │                                             │
  │ [Test Semantic Filter →]                   │
  └─────────────────────────────────────────────┘

  ---
  Step 5: SEMANTIC_FILTER_TESTING

  UI Style: Before/after comparison

  ┌─────────────────────────────────────────────┐
  │ Semantic Filter Test Results                │
  ├─────────────────────────────────────────────┤
  │ Query returned: 847 articles                │
  │ After semantic filtering: 127 articles      │
  │ (85% filtered out)                          │
  │                                             │
  │ Sample Filtered IN (relevant):              │
  │ ✓ "MC4R Agonist Mechanisms in..."          │
  │ ✓ "Melanocortin Pathway Therapeutics..."   │
  │                                             │
  │ Sample Filtered OUT (not relevant):         │
  │ ✗ "Melanocortin and Skin Pigmentation..."  │
  │ ✗ "MC1R Genetics in Melanoma Risk..."      │
  │                                             │
  │ Too restrictive? [Adjust Threshold]         │
  │ Looks good? [Accept & Continue]             │
  └─────────────────────────────────────────────┘

  ---
  Channel Completion Summary

  ✓ Channel 1: Melanocortin Pathway Research - Configured

    Sources: Google Scholar, PubMed
    Queries: Tested and validated
    Semantic Filter: Enabled (threshold: 0.7)

  [Next Channel: Obesity & Metabolic Disease →]
  [Review All Channels]

  ---
  Workflow 2 Entry Points

  1. From Stream Definition workflow:
    - After "Accept & Create Stream" clicked
    - Show: "Stream created! Configure implementation now?"
  2. From edit form:
    - "Workflow Configuration" tab
    - Button: "Launch Configuration Wizard"
  3. From stream list:
    - Badge: "⚠️ Not Configured"
    - Click to launch Workflow 2

  ---
  Technical Implementation

  New Backend Components

  1. New workflow state machine (separate from stream definition):
  class WorkflowConfigStep(str, Enum):
      SOURCE_SELECTION = "source_selection"
      QUERY_CONFIG = "query_config"
      QUERY_TEST = "query_test"
      SEMANTIC_CONFIG = "semantic_config"
      SEMANTIC_TEST = "semantic_test"
      CHANNEL_COMPLETE = "channel_complete"

  2. Query testing service:
  async def test_query(source_id: str, query: str) -> QueryTestResult:
      # Execute live query
      # Return count + sample results
      # Cache results for 5 minutes

  3. Semantic filter testing service:
  async def test_semantic_filter(
      articles: List[Article],
      criteria: str,
      threshold: float
  ) -> FilterTestResult:
      # Apply semantic filtering
      # Return before/after comparison

  ---
  Key Design Principles

  1. Linear, not conversational - Step-by-step wizard, not chat
  2. Per-channel focus - One channel at a time, complete configuration
  3. Test-driven - Must test queries and filters before accepting
  4. Visual feedback - Show counts, sample results, before/after
  5. Escape hatches - Can skip, use defaults, or return later
  6. Progress tracking - Clear indication of where you are (Channel 1 of 3, 50% complete)