# Three-Layer Architecture: Proposed Data Structures

## Overview

This document proposes concrete data structures for the three-layer architecture that separates semantic space from retrieval and presentation concerns.

**Flow:**
```
Chat Messages (unstructured)
    ↓
Extract → Semantic Space (canonical, source-agnostic)
    ↓
Derive → Retrieval Taxonomy (optimized for coverage)
    ↓
Derive → Presentation Taxonomy (optimized for decisions)
```

---

## Layer 1: Semantic Space (Canonical Topic Model)

**Purpose:** The ground truth information space - what the user actually cares about, independent of how we retrieve it or present it.

### Proposed Structure

```typescript
interface SemanticSpace {
  // Core Information Space
  domain: {
    name: string;                    // "Asbestos Litigation Science"
    description: string;             // High-level description of the domain
  };

  // What: Topics, Entities, Concepts
  topics: Topic[];                   // Core topics in this space
  entities: Entity[];                // Named entities (organizations, substances, diseases, etc.)
  relationships: Relationship[];     // Semantic relationships between topics/entities

  // Why: Context and Purpose
  context: {
    business_context: string;        // "Defense litigation support"
    decision_types: string[];        // ["Case strategy", "Expert witness prep", "Settlement analysis"]
    stakeholders: string[];          // ["Inside counsel", "Litigation support staff"]
    time_sensitivity: string;        // "Weekly review cadence"
  };

  // How: Coverage Requirements
  coverage: {
    signal_types: SignalType[];      // What kinds of information matter
    temporal_scope: TemporalScope;   // Time boundaries
    quality_criteria: QualityCriteria; // Quality thresholds
    completeness_requirement: string; // "Comprehensive vs. selective"
  };

  // Boundaries: What's In/Out
  boundaries: {
    inclusions: InclusionCriterion[];  // Positive criteria
    exclusions: ExclusionCriterion[];  // Negative criteria
    edge_cases: EdgeCase[];            // Ambiguous boundary cases
  };

  // Metadata
  extraction_metadata: {
    extracted_from: string;          // "chat_session_id" or "manual_entry"
    extracted_at: datetime;
    confidence_score?: number;       // AI confidence in extraction
    human_reviewed: boolean;
    review_notes?: string;
  };
}

// Supporting Types for Semantic Space

interface Topic {
  topic_id: string;                  // "asbestos_disease_mechanisms"
  name: string;                      // "Asbestos-Related Disease Mechanisms"
  description: string;               // What this topic encompasses
  synonyms: string[];                // Alternative names/terms
  parent_topic?: string;             // Optional hierarchy
  importance: "critical" | "important" | "relevant"; // Relative importance
  rationale: string;                 // Why this topic matters to the user
}

interface Entity {
  entity_id: string;                 // "mesothelioma"
  entity_type: EntityType;           // disease, substance, organization, regulation, etc.
  name: string;                      // "Mesothelioma"
  canonical_forms: string[];         // ["mesothelioma", "malignant mesothelioma"]
  context: string;                   // Why this entity matters
}

enum EntityType {
  DISEASE = "disease",
  SUBSTANCE = "substance",
  CHEMICAL = "chemical",
  ORGANIZATION = "organization",
  REGULATION = "regulation",
  STANDARD = "standard",
  METHODOLOGY = "methodology",
  BIOMARKER = "biomarker",
  GEOGRAPHIC = "geographic",
  POPULATION = "population"
}

interface Relationship {
  relationship_id: string;
  type: RelationshipType;            // causal, correlational, regulatory, etc.
  subject: string;                   // topic_id or entity_id
  object: string;                    // topic_id or entity_id
  description: string;               // "Asbestos exposure causes mesothelioma"
  strength: "strong" | "moderate" | "weak";
}

enum RelationshipType {
  CAUSAL = "causal",                 // X causes Y
  CORRELATIONAL = "correlational",   // X correlates with Y
  REGULATORY = "regulatory",         // X regulates/governs Y
  METHODOLOGICAL = "methodological", // X measures/assesses Y
  TEMPORAL = "temporal",             // X precedes/follows Y
  HIERARCHICAL = "hierarchical"      // X is a type of Y
}

interface SignalType {
  signal_id: string;
  name: string;                      // "Peer-reviewed research articles"
  description: string;               // What constitutes this signal type
  priority: "must_have" | "should_have" | "nice_to_have";
  examples: string[];                // Example publications/sources
}

interface TemporalScope {
  start_date?: string;               // "1970-01-01" or null for no limit
  end_date?: string;                 // Usually "present"
  focus_periods?: string[];          // Specific periods of interest
  recency_weight: number;            // 0-1, how much to weight recent vs. historical
  rationale: string;                 // Why this temporal scope
}

interface QualityCriteria {
  peer_review_required: boolean;
  minimum_citation_count?: number;
  journal_quality?: string[];        // Specific journals or tiers
  study_types: string[];             // ["RCT", "cohort", "case-control", "meta-analysis"]
  exclude_predatory: boolean;
  language_restrictions?: string[];  // ["English"] or null for any
  other_criteria: string[];          // Free-form quality requirements
}

interface InclusionCriterion {
  criterion_id: string;
  description: string;               // "Asbestos exposure assessment methodologies"
  rationale: string;                 // Why this is in scope
  mandatory: boolean;                // Must-have vs. nice-to-have
  related_topics: string[];          // topic_ids this criterion covers
  related_entities: string[];        // entity_ids this criterion covers
}

interface ExclusionCriterion {
  criterion_id: string;
  description: string;               // "Legal case decisions and trial transcripts"
  rationale: string;                 // Why this is out of scope
  strict: boolean;                   // Hard boundary vs. soft preference
  exceptions?: string[];             // When this exclusion might not apply
}

interface EdgeCase {
  case_id: string;
  description: string;               // "Studies of talc with asbestos contamination"
  resolution: "include" | "exclude" | "conditional";
  conditions?: string;               // If conditional, what determines in/out
  rationale: string;
}
```

---

## Layer 2: Retrieval Taxonomy

**Purpose:** Optimized for complete coverage across heterogeneous sources. Maps semantic space onto source capabilities.

### Proposed Structure

```typescript
interface RetrievalTaxonomy {
  // Derived from semantic space
  derived_from: {
    semantic_space_id: string;
    derived_at: datetime;
    derivation_method: "ai_generated" | "manual" | "hybrid";
  };

  // Search vectors - minimal set for complete coverage
  search_vectors: SearchVector[];

  // Coverage validation
  coverage_validation: {
    semantic_coverage_map: SemanticCoverageMap;  // Which semantic elements each vector covers
    coverage_completeness: number;               // 0-1 score
    coverage_redundancy: number;                 // 0-1 score (lower is better)
    uncovered_elements: string[];                // Semantic elements with no retrieval strategy
    validation_notes: string;
  };

  // Source-specific considerations
  source_adaptations: SourceAdaptation[];
}

interface SearchVector {
  vector_id: string;                    // "exposure_assessment_vector"
  name: string;                         // "Asbestos Exposure Assessment & Measurement"

  // Semantic grounding
  semantic_grounding: {
    covers_topics: string[];            // topic_ids from semantic space
    covers_entities: string[];          // entity_ids from semantic space
    covers_relationships: string[];     // relationship_ids from semantic space
    covers_inclusions: string[];        // inclusion_criterion_ids
  };

  // Search strategy
  search_strategy: {
    themes: string[];                   // High-level search themes
    key_terms: string[];                // Core search terms (source-agnostic)
    must_include: string[];             // Required concepts
    should_include: string[];           // Optional but valuable concepts
    must_exclude: string[];             // Terms to avoid
  };

  // Execution configuration (per source)
  source_queries: Record<string, SourceQuery>;  // source_id -> query config

  // Filtering
  semantic_filter: {
    enabled: boolean;
    criteria: string;                   // Natural language filter criteria
    threshold: number;                  // Confidence threshold
  };

  // Metadata
  priority: "high" | "medium" | "low";
  estimated_volume: string;             // "~1000 articles/month"
  rationale: string;                    // Why this vector exists
}

interface SourceQuery {
  source_id: string;                    // "pubmed", "google_scholar"
  enabled: boolean;
  query_expression: string;             // Source-specific syntax
  query_rationale: string;              // Why this specific query
  last_tested?: {
    tested_at: datetime;
    result_count: number;
    sample_articles: string[];          // Article IDs or titles
  };
}

interface SemanticCoverageMap {
  // Maps semantic space elements to vectors that cover them
  topic_coverage: Record<string, string[]>;        // topic_id -> vector_ids
  entity_coverage: Record<string, string[]>;       // entity_id -> vector_ids
  relationship_coverage: Record<string, string[]>; // relationship_id -> vector_ids
  inclusion_coverage: Record<string, string[]>;    // inclusion_id -> vector_ids
}

interface SourceAdaptation {
  source_id: string;
  adaptations: {
    vocabulary_mapping: Record<string, string>;    // Semantic term -> source term
    syntax_considerations: string[];               // Source-specific query syntax notes
    limitations: string[];                         // What this source can't do
    strengths: string[];                           // What this source does well
  };
}
```

---

## Layer 3: Presentation Taxonomy

**Purpose:** Optimized for user decision-making. Organizes results into channels aligned with user workflows.

### Proposed Structure

```typescript
interface PresentationTaxonomy {
  // Derived from semantic space
  derived_from: {
    semantic_space_id: string;
    derived_at: datetime;
    derivation_method: "ai_generated" | "manual" | "hybrid";
  };

  // Categories/Channels - organized for user consumption
  categories: PresentationCategory[];

  // Workflow alignment
  workflow_alignment: {
    decision_workflows: DecisionWorkflow[];       // Which decisions use which categories
    stakeholder_views: StakeholderView[];         // How different stakeholders consume info
  };

  // Classification configuration
  classification: {
    method: "semantic_similarity" | "keyword_match" | "ai_classify" | "rule_based";
    confidence_threshold: number;
    allow_multiple_categories: boolean;
    classification_rules?: ClassificationRule[];
  };

  // Coverage validation
  coverage_validation: {
    semantic_coverage_map: SemanticCoverageMap;  // Which semantic elements each category represents
    coverage_completeness: number;               // 0-1 score
    uncovered_elements: string[];                // Semantic elements with no presentation category
    validation_notes: string;
  };
}

interface PresentationCategory {
  category_id: string;                  // "medical_health"
  name: string;                         // "Medical & Health Sciences"

  // Semantic grounding
  semantic_grounding: {
    represents_topics: string[];        // topic_ids from semantic space
    represents_entities: string[];      // entity_ids from semantic space
    represents_relationships: string[]; // relationship_ids from semantic space
  };

  // User-facing description
  description: string;                  // What this category contains
  user_questions: string[];             // Questions this category helps answer
  decision_support: string[];           // Decisions this category informs

  // Presentation configuration
  presentation: {
    display_order: number;              // Sort order in UI
    icon?: string;                      // UI icon
    color?: string;                     // UI color coding
    summary_style: "detailed" | "concise" | "headline";
  };

  // Importance
  priority: "critical" | "important" | "reference";
  intended_frequency: string;           // "Review daily" vs "Review as needed"

  // Cross-references
  related_categories: string[];         // Other category_ids often consulted together

  // Metadata
  rationale: string;                    // Why this category exists
}

interface DecisionWorkflow {
  workflow_id: string;
  name: string;                         // "Preparing for Daubert hearing"
  description: string;
  required_categories: string[];        // category_ids needed for this decision
  typical_sequence: string[];           // Typical order of consultation
  stakeholders: string[];               // Who uses this workflow
}

interface StakeholderView {
  stakeholder_id: string;
  name: string;                         // "Inside counsel"
  primary_categories: string[];         // Categories they check regularly
  secondary_categories: string[];       // Categories they check occasionally
  notification_preferences: {
    immediate: string[];                // category_ids for immediate alerts
    daily_digest: string[];             // category_ids for daily summaries
    weekly_summary: string[];           // category_ids for weekly reviews
  };
}

interface ClassificationRule {
  rule_id: string;
  category_id: string;
  rule_type: "keyword" | "entity_presence" | "topic_match" | "semantic_similarity";
  condition: string;                    // Rule expression
  confidence: number;                   // How confident we are in this rule
  priority: number;                     // For conflict resolution
}
```

---

## Validation: Isomorphic Coverage

Both retrieval and presentation taxonomies should cover the same semantic space.

```typescript
interface IsomorphicValidation {
  // Compare retrieval and presentation coverage
  semantic_space_id: string;

  retrieval_coverage: {
    topics_covered: string[];           // topic_ids covered by retrieval
    entities_covered: string[];         // entity_ids covered by retrieval
    relationships_covered: string[];    // relationship_ids covered by retrieval
    inclusions_covered: string[];       // inclusion criteria covered
  };

  presentation_coverage: {
    topics_covered: string[];           // topic_ids represented in presentation
    entities_covered: string[];         // entity_ids represented in presentation
    relationships_covered: string[];    // relationship_ids represented in presentation
  };

  // Validation results
  validation: {
    retrieval_completeness: number;     // 0-1 score
    presentation_completeness: number;  // 0-1 score
    isomorphic: boolean;                // Do they cover the same space?

    // Gaps
    retrieval_gaps: string[];           // Semantic elements not retrieved
    presentation_gaps: string[];        // Semantic elements not presented

    // Orphans
    orphaned_vectors: string[];         // Vectors that don't map to semantic space
    orphaned_categories: string[];      // Categories that don't map to semantic space

    validation_report: string;
  };
}
```

---

## Complete Stream Configuration

Putting it all together:

```typescript
interface ResearchStream {
  // Identification
  stream_id: number;
  user_id: number;
  stream_name: string;

  // High-level metadata
  purpose: string;                      // One-line purpose statement
  created_at: datetime;
  updated_at: datetime;
  is_active: boolean;

  // === LAYER 1: SEMANTIC SPACE ===
  semantic_space: SemanticSpace;        // Ground truth information space

  // === LAYER 2: RETRIEVAL TAXONOMY ===
  retrieval_taxonomy?: RetrievalTaxonomy;  // Derived from semantic space

  // === LAYER 3: PRESENTATION TAXONOMY ===
  presentation_taxonomy?: PresentationTaxonomy;  // Derived from semantic space

  // === VALIDATION ===
  isomorphic_validation?: IsomorphicValidation;  // Validates taxonomies cover semantic space

  // Execution configuration
  report_frequency: ReportFrequency;
  scoring_config?: ScoringConfig;

  // Aggregated metrics
  report_count?: number;
  latest_report_date?: string | null;
}
```

---

## Workflow

### Phase 1: Extract Semantic Space (from chat)
```
User chat messages
    ↓
AI extraction service
    ↓
semantic_space (draft)
    ↓
User reviews & approves
    ↓
semantic_space (approved)
```

### Phase 2: Derive Retrieval Taxonomy
```
semantic_space (approved)
    ↓
AI derives search vectors
    ↓
retrieval_taxonomy (draft)
    ↓
Validate coverage of semantic space
    ↓
User reviews/adjusts vectors
    ↓
retrieval_taxonomy (approved)
```

### Phase 3: Derive Presentation Taxonomy
```
semantic_space (approved)
    ↓
AI derives categories
    ↓
presentation_taxonomy (draft)
    ↓
Validate coverage of semantic space
    ↓
User reviews/adjusts categories
    ↓
presentation_taxonomy (approved)
```

### Phase 4: Validate Isomorphism
```
semantic_space + retrieval_taxonomy + presentation_taxonomy
    ↓
Validate both cover same space
    ↓
isomorphic_validation
    ↓
Report any gaps or orphans
```

---

## Key Principles

1. **Semantic Space is Ground Truth** - Everything derives from this canonical representation

2. **Source-Agnostic Semantic Space** - No mention of PubMed, Google Scholar, etc. in Layer 1

3. **Explicit Derivation** - Track that taxonomies are derived from semantic space, including timestamps and methods

4. **Bidirectional Validation** - Ensure taxonomies cover semantic space AND don't include orphaned elements

5. **Isomorphic Coverage** - Retrieval and presentation should cover the same information space, just organized differently

6. **User Approval at Each Layer** - User reviews and approves:
   - The semantic space extraction
   - The derived retrieval taxonomy
   - The derived presentation taxonomy

---

## Questions for Discussion

1. **Semantic Space Granularity**: How detailed should topics/entities be? Should we aim for 10-20 core topics or allow 50+?

2. **Relationship Modeling**: How critical are explicit relationships vs. just topics + entities? Should relationships be first-class or optional?

3. **Extraction Method**: Should we extract semantic space from chat automatically, or provide a structured interview/form?

4. **Legacy Migration**: How do we migrate existing streams with `categories` directly in stream config to this three-layer model?

5. **Storage**: Should semantic space, retrieval taxonomy, and presentation taxonomy be stored as separate documents or as nested JSON in the research_stream record?

6. **Validation Strictness**: Should validation be a warning or block stream activation if coverage is incomplete?

7. **Classification**: In Layer 3, should articles be classified into presentation categories during retrieval or as a post-processing step?
