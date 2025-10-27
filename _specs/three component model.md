Knowledge Horizon: Updated Architecture for Mandate → Workflow Translation
Previous Approach
Interview user → Extract structured mandate with channels/categories → Derive search strategies per channel
Updated Three-Layer Model
We now use a more robust architecture that ensures completeness and coherence of coverage:
Layer 1: Semantic Space (Canonical Topic Model)
From conversational onboarding, we extract a canonical topic model representing the complete, source-agnostic information space the user cares about:

Core topics, entities, relationships, and contexts
Coverage requirements (signal types, temporal scope, quality thresholds)
Explicit boundaries and exclusions

This semantic space is the ground truth—the underlying information space that matters to this user's business.
Layer 2: Retrieval Taxonomy
Derives from semantic space, optimized for complete coverage across heterogeneous sources:

Maps semantic requirements onto source capabilities (PubMed, Google Scholar, news, etc.)
Designs minimal query set that collectively covers the semantic space
Handles source-specific vocabularies and query languages
Validates coverage: ensures every element of semantic space has retrieval strategy

Layer 3: Presentation Taxonomy
Also derives from semantic space, optimized for user decision-making:

Organizes results into channels aligned with user workflows
Groups information consumed together for specific decisions
Reflects stakeholder mental models and priorities

Key Insight: Isomorphic Projections
Retrieval and presentation taxonomies are isomorphic—both are different projections of the same semantic space. They should produce the same subset of articles from the domain, just organized differently:

Retrieval taxonomy → optimized for efficient source coverage
Presentation taxonomy → optimized for cognitive fit and action

Validation
We ensure both taxonomies completely and coherently cover the semantic space through bidirectional validation:

Forward: every semantic element has retrieval coverage and presentation destination
Reverse: no orphaned searches, no starved channels
Coverage metrics track completeness and redundancy

This architecture guarantees we cast a fence around the right information holistically, rather than hoping channel-by-channel search design achieves complete coverage.