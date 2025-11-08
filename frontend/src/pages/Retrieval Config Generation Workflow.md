Retrieval Config Generation Workflow

  Phase 1: Group Proposal (LLM-Assisted)

  Input: SemanticSpace
  Action: LLM analyzes and proposes retrieval groups
  Output: List of proposed groups with justification

  POST /api/research-streams/{stream_id}/retrieval/propose-groups

  Response:
  {
    "proposed_groups": [
      {
        "group_id": "auto_gen_1",
        "name": "Genomic Medicine Technologies",
        "covered_topics": ["topic_1", "topic_2", "topic_4"],
        "rationale": "These topics share genomic/genetic terminology and retrieve efficiently with
  combined queries focusing on gene editing and modification techniques.",
        "confidence": 0.85
      },
      {
        "group_id": "auto_gen_2",
        "name": "Immuno-Oncology Treatments",
        "covered_topics": ["topic_3", "topic_5", "topic_6"],
        "rationale": "Cancer immunotherapy topics cluster together in medical literature. Combined
  retrieval captures cross-disciplinary research.",
        "confidence": 0.92
      }
    ],
    "coverage_analysis": {
      "total_topics": 12,
      "covered_topics": 10,
      "uncovered_topics": ["topic_7", "topic_8"],
      "warnings": ["Topics 7-8 have no proposed group"]
    }
  }

  User Actions:
  - ✅ Accept proposal
  - ✏️ Edit group (rename, change rationale)
  - ➕ Add topics to group
  - ➖ Remove topics from group
  - 🔀 Split group into multiple
  - 🔗 Merge groups
  - ➕ Create new group from scratch
  - ❌ Reject and start over

  ---
  Phase 2: Query Generation per Group (Iterative LLM)

  For each group, generate queries for selected sources:

  POST /api/research-streams/{stream_id}/retrieval/groups/{group_id}/generate-queries

  Request:
  {
    "group_id": "grp_1",
    "sources": ["pubmed", "google_scholar"]
  }

  Response:
  {
    "queries": [
      {
        "source_id": "pubmed",
        "query_expression": "(CRISPR OR \"gene editing\") AND (therapy OR therapeutic)",
        "reasoning": "Boolean query captures gene editing variants. Combines with therapy to focus on
   clinical applications.",
        "estimated_results": 2500,
        "topics_covered": ["topic_1", "topic_2", "topic_4"],
        "entities_used": ["CRISPR", "gene therapy", "Cas9"]
      },
      {
        "source_id": "google_scholar",
        "query_expression": "\"CRISPR gene editing\" therapy",
        "reasoning": "Natural language optimized for Scholar. Quoted phrase ensures precision.",
        "estimated_results": 1200
      }
    ]
  }

  User Actions:
  - ✅ Accept query
  - ✏️ Edit query expression manually
  - 🔄 Regenerate with different parameters
  - 🧪 Test query (see actual results)
  - 💾 Save for this group

  ---
  Phase 3: Semantic Filter Generation (LLM)

  For each group, generate semantic filter criteria:

  POST /api/research-streams/{stream_id}/retrieval/groups/{group_id}/generate-filter

  Response:
  {
    "filter_criteria": "Articles must focus on CRISPR or gene editing technologies applied to
  therapeutic interventions. Must discuss clinical applications, mechanisms, or outcomes. Exclude:
  purely agricultural applications, general genetic research without therapeutic focus.",
    "reasoning": "Filter derived from topics in group plus exclusion boundaries from semantic space.
  Ensures retrieved articles are therapeutically relevant.",
    "incorporates": {
      "topics": ["topic_1", "topic_2", "topic_4"],
      "inclusions": ["inclusion_1"],
      "exclusions": ["exclusion_3"],
      "entities": ["CRISPR", "Cas9", "gene therapy"]
    },
    "threshold": 0.7
  }

  User Actions:
  - ✅ Accept filter
  - ✏️ Edit criteria text
  - 🔄 Regenerate
  - 🧪 Test on sample articles
  - 🎚️ Adjust threshold
  - ❌ Disable filtering for this group

  ---
  Phase 4: Validation & Coverage Check (Automated)

  POST /api/research-streams/{stream_id}/retrieval/validate

  Response:
  {
    "is_complete": false,
    "coverage": {
      "total_topics": 12,
      "covered_topics": 10,
      "coverage_percentage": 83.3,
      "uncovered": [
        {
          "topic_id": "topic_7",
          "name": "Regulatory Pathways",
          "importance": "critical",
          "suggestion": "Create dedicated group or add to existing group 'Clinical Development'"
        }
      ]
    },
    "redundancy": {
      "over_covered": [
        {
          "topic_id": "topic_2",
          "groups": ["grp_1", "grp_3"],
          "note": "Topic appears in 2 groups - this may be intentional for comprehensive coverage"
        }
      ]
    },
    "warnings": [
      "Critical topic 'topic_7' has no coverage",
      "2 groups have no queries configured"
    ],
    "ready_to_activate": false
  }

  ---
  Phase 5: Finalize & Activate

  POST /api/research-streams/{stream_id}/retrieval/finalize

  # Saves the complete RetrievalConfig
  # Marks stream as ready for retrieval

  ---
  🎯 Auditability Features

  Every LLM decision includes:
  1. Reasoning - Why this decision was made
  2. Inputs Used - Which topics/entities/boundaries informed it
  3. Confidence - How confident the LLM is
  4. Timestamp - When generated
  5. Model Used - Which LLM model/version

  Store in metadata:
  class GenerationMetadata(BaseModel):
      generated_at: datetime
      generated_by: str  # "llm:gpt-4" or "user:manual"
      reasoning: str
      confidence: Optional[float]
      inputs_considered: List[str]  # topic_ids, entity_ids used
      human_edited: bool
      edit_history: List[Dict]  # Track all changes

  ---
  🎨 UI Flow

  [Semantic Space Defined]
         ↓
  [Click: "Generate Retrieval Config"]
         ↓
  [Step 1: Review Proposed Groups]
    - Show groups in cards
    - Coverage bar chart
    - Edit/merge/split controls
         ↓
  [Step 2: Configure Queries]
    - For each group:
      - Select sources
      - Generate → Review → Edit → Test
         ↓
  [Step 3: Configure Filters]
    - For each group:
      - Generate → Review → Edit → Test
         ↓
  [Step 4: Validation]
    - Coverage report
    - Fix gaps
         ↓
  [Finalize & Activate]

  Benefits:
  - ✅ User in control at each step
  - ✅ Can go back and revise
  - ✅ Clear audit trail
  - ✅ LLM explains its reasoning
  - ✅ Test before committing
  - ✅ Validate completeness

    User clicks "Configure Retrieval" from Edit Stream page
           ↓
  ┌─────────────────────────────────────────┐
  │ PHASE 1: Propose Groups                │
  │                                         │
  │ [Generate from Semantic Space]          │
  │                                         │
  │ ✓ Genomic Medicine (3 topics)          │
  │   Rationale: Share genomic terminology  │
  │   [Edit] [Split] [Merge]                │
  │                                         │
  │ ✓ Immuno-Oncology (4 topics)            │
  │   Rationale: Cancer immunotherapy...    │
  │   [Edit] [Split] [Merge]                │
  │                                         │
  │ Coverage: 95% (1 uncovered topic)       │
  │ [+ Add Group] [Continue]                │
  └─────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────┐
  │ PHASE 2: Configure Queries              │
  │                                         │
  │ Group: Genomic Medicine                 │
  │ ☑ PubMed  ☑ Google Scholar             │
  │                                         │
  │ PubMed Query:                           │
  │ (CRISPR OR "gene editing") AND therapy  │
  │ [Regenerate] [Edit] [Test (2,500 hits)]│
  │                                         │
  │ Scholar Query:                          │
  │ "CRISPR gene editing" therapy           │
  │ [Regenerate] [Edit] [Test (1,200 hits)]│
  │                                         │
  │ [Save & Next Group]                     │
  └─────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────┐
  │ PHASE 3: Configure Filters              │
  │                                         │
  │ Group: Genomic Medicine                 │
  │                                         │
  │ Filter Criteria:                        │
  │ Articles must focus on CRISPR or gene..│
  │ [Regenerate] [Edit]                     │
  │                                         │
  │ Threshold: 0.7 [Slider]                 │
  │ [Test on Sample Articles]               │
  │                                         │
  │ [Save & Next Group]                     │
  └─────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────┐
  │ PHASE 4: Validation                     │
  │                                         │
  │ ✓ Coverage: 100% (12/12 topics)        │
  │ ✓ All groups have queries               │
  │ ⚠ 2 groups have no filters              │
  │                                         │
  │ Ready to activate: No                   │
  │ [Back to Fix] [Save Draft] [Activate]   │
  └─────────────────────────────────────────┘
