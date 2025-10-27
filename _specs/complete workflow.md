# Knowledge Horizon: Complete Workflow from Interview to Report

## Phase 1: Conversational Mandate Creation

**Goal**: Extract complete semantic space through natural dialogue

**Process**:
- Conversational interview gathering business context, strategic priorities, competitive landscape, key concerns
- User describes what they need to know in natural language
- System asks clarifying questions to fill gaps and resolve ambiguities
- Validates understanding: "Based on what you've told me, here's what I'll be monitoring..."

**Output**: Unstructured natural language transcript capturing user's complete information needs

## Phase 2: Semantic Space Construction

**Goal**: Build canonical topic model from conversational input

**Process**:
- Extract core topics, entities, relationships from transcript
- Identify signal types that matter (breakthroughs, regulatory changes, competitive moves, etc.)
- Define temporal scope and quality requirements
- Map topic boundaries and exclusions
- Structure as knowledge graph or ontology

**Output**: Structured semantic space definition—the ground truth of what information matters and why

**Validation**: Review with user to confirm completeness and accuracy

## Phase 3: Retrieval Taxonomy Design

**Goal**: Map semantic space onto executable search strategies across available sources

**Process**:
- **Coverage Mapping**: For each semantic space element, identify which sources can reach it (PubMed, Google Scholar, ClinicalTrials.gov, news aggregators, etc.)
- **Query Strategy Generation**: 
  - Design source-specific Boolean queries optimized for each source's capabilities
  - Generate keyword variants, synonyms, source-specific vocabularies (MeSH terms, etc.)
  - Balance precision vs recall
- **Gap Analysis**: Identify parts of semantic space with weak/no coverage
- **Overlap Optimization**: Handle redundancy across sources strategically
- **Scheduling Design**: Determine query frequency per source (hourly, daily, weekly)

**Output**: Complete retrieval taxonomy with search strategies mapped to semantic space coverage

## Phase 4: Presentation Taxonomy Design

**Goal**: Organize information for user consumption and decision-making

**Process**:
- Analyze user workflows and decision patterns from Phase 1
- Cluster semantic space elements by how they're consumed together
- Design channels/categories aligned with stakeholder mental models
- Define within-channel prioritization logic
- Establish routing rules: which retrieval results flow to which presentation channels

**Output**: Presentation taxonomy (channels) with routing logic from retrieval strategies

**Validation**: Isomorphism check—confirm retrieval and presentation collectively cover identical semantic space

## Phase 5: Workflow Execution Configuration

**Goal**: Operationalize the retrieval and filtering pipeline

**Process**:

### 5A: Search Execution
- Execute scheduled queries against each source
- Handle rate limiting, pagination, timeouts
- Collect raw results (typically broader than final needs)

### 5B: Multi-Stage Filtering Pipeline
- **Stage 1: Keyword Match Validation**: Confirm Boolean query results actually contain expected terms
- **Stage 2: Semantic Relevance Scoring**: Score each result against semantic space using embeddings/LLM
  - "Does this actually relate to checkpoint inhibitors in the way we care about?"
  - Apply relevance thresholds per semantic filter model
- **Stage 3: Deduplication**: Identify same article across multiple sources
- **Stage 4: Novelty Detection**: Filter out content already in previous reports
- **Stage 5: Quality/Credibility Assessment**: Apply source authority and content quality filters
- **Stage 6: Channel Routing**: Direct results to appropriate presentation channels via routing rules

### 5C: Ranking and Prioritization
- Within each channel, apply prioritization logic from presentation taxonomy
- Surface highest-value content first based on:
  - Relevance score
  - Recency
  - Source authority
  - Strategic importance signals

**Output**: Filtered, ranked, and routed results ready for report generation

## Phase 6: Report Assembly

**Goal**: Generate final report organized by presentation taxonomy

**Process**:
- Group routed results by presentation channel
- Apply channel-specific formatting and summary generation
- Generate channel summaries/highlights
- Create cross-channel insights where patterns emerge
- Format according to user preferences (detail level, length, style)

**Output**: Complete weekly (or scheduled frequency) horizon scanning report

## Phase 7: Feedback Loop (Continuous Improvement)

**Process**:
- Track user engagement: which results marked relevant/irrelevant
- Monitor channel population rates (starved vs flooded channels)
- Adjust semantic filters based on feedback
- Refine keyword strategies to improve precision/recall
- Update semantic space as business priorities evolve

**Output**: Refined mandate and workflow configuration for next cycle

---

## Key Architectural Notes

**One-Time**: Phases 1-4 (mandate creation through taxonomy design)

**Recurring**: Phases 5-6 (execution and report generation on schedule)

**Continuous**: Phase 7 (learning and refinement)

**Critical Dependencies**:
- Phase 3 (Retrieval) and Phase 4 (Presentation) both depend on Phase 2 (Semantic Space)
- Phase 5 (Execution) requires both Phase 3 and Phase 4 outputs
- Isomorphism validation ensures Phases 3 & 4 cover identical semantic space