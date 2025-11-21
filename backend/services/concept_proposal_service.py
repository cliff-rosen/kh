"""
Concept Proposal Service - Generate concept-based retrieval configuration from semantic space

Based on framework:
- Phase 1: Extract entities and relationships from semantic space
- Phase 2-3: Generate concepts (entity-relationship patterns)
- Each concept has single inclusion pattern
- Many-to-many mapping to topics
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import json

from schemas.semantic_space import SemanticSpace, Topic, Entity
from schemas.research_stream import Concept, VolumeStatus, SourceQuery, SemanticFilter
from services.general_chat_service import GeneralChatService

logger = logging.getLogger(__name__)


class ConceptProposalService:
    """Service for generating concept proposals from semantic space analysis"""

    def __init__(self):
        self.chat_service = GeneralChatService()

    async def propose_concepts(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Analyze semantic space and propose concepts for retrieval.

        Args:
            semantic_space: The semantic space to analyze
            user_context: Optional additional context from user

        Returns:
            Dict containing:
                - proposed_concepts: List[Concept]
                - analysis: Dict with entity/relationship extraction
                - reasoning: Overall rationale
        """
        logger.info(f"Proposing concepts for semantic space with {len(semantic_space.topics)} topics")

        # Build LLM prompt for concept generation
        prompt = self._build_concept_generation_prompt(semantic_space, user_context)

        # Call LLM for concept generation
        messages = [{"role": "user", "content": prompt}]
        response = await self.chat_service.chat_completion(
            messages=messages,
            response_format="json_object"
        )

        # Parse LLM response
        try:
            result = json.loads(response)
            concepts = self._parse_concept_proposals(result, semantic_space)

            return {
                "proposed_concepts": concepts,
                "analysis": result.get("phase1_analysis", {}),
                "reasoning": result.get("overall_reasoning", ""),
                "coverage_check": self._validate_coverage(concepts, semantic_space)
            }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            raise ValueError(f"Invalid JSON response from LLM: {e}")

    def _build_concept_generation_prompt(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str]
    ) -> str:
        """Build the LLM prompt for concept generation"""

        # Format topics for prompt
        topics_text = "\n".join([
            f"- {t.topic_id}: {t.name}\n  Description: {t.description}\n  Priority: {t.priority}"
            for t in semantic_space.topics
        ])

        # Format entities for prompt
        entities_text = "\n".join([
            f"- {e.entity_id}: {e.name} ({e.entity_type})\n  Synonyms: {', '.join(e.synonyms) if e.synonyms else 'None'}"
            for e in semantic_space.entities
        ])

        # Format relationships if any
        relationships_text = "None explicitly defined"
        if semantic_space.relationships:
            relationships_text = "\n".join([
                f"- {r.source_entity_id} -> {r.relationship_type} -> {r.target_entity_id}"
                for r in semantic_space.relationships
            ])

        prompt = f"""You are an expert at designing retrieval configurations for research monitoring systems.

Your task is to analyze a semantic space and propose CONCEPTS for retrieving relevant research articles.

# FRAMEWORK

A CONCEPT is a searchable entity-relationship pattern that covers one or more topics.

Key principles:
1. **Single Inclusion Pattern**: Each concept has ONE entity-relationship pattern (not multiple OR'd together)
2. **Vocabulary Expansion**: Add synonyms WITHIN entities (for OR clauses), not across patterns
3. **Many-to-Many Coverage**: A concept can cover multiple topics, and a topic can be covered by multiple concepts
4. **Volume-Driven**: Aim for 10-1000 articles/week per concept (will be refined later)
5. **Minimal Exclusions**: Avoid exclusions unless absolutely necessary

# SEMANTIC SPACE

## Topics:
{topics_text}

## Entities:
{entities_text}

## Relationships:
{relationships_text}

## Domain Context:
{semantic_space.domain_description}

{f"## Additional User Context:\n{user_context}\n" if user_context else ""}

# YOUR TASK

Generate concept proposals following this process:

## Phase 1: Analysis
1. Extract key entities across all topics
2. Identify relationship patterns between entities
3. Note any hierarchies or specializations

## Phase 2-3: Concept Generation
For each topic or cluster of related topics:
1. Identify the core entity-relationship pattern that captures it
2. Create a concept with:
   - A clear entity pattern (list of entity_ids)
   - The relationship between entities
   - Which topics it covers (can be multiple)
   - Rationale for why this pattern covers these topics

## Guidelines:
- Create 3-7 concepts total (balance coverage vs. manageability)
- Each concept should have a SINGLE clear pattern (not multiple OR'd patterns)
- A concept can cover multiple topics if they share the same pattern
- Multiple concepts can cover the same topic if it needs different patterns
- Use entity_ids from the semantic space
- Provide clear rationale for each concept

# OUTPUT FORMAT

Return JSON with this structure:
{{
  "phase1_analysis": {{
    "key_entities": ["entity_id1", "entity_id2", ...],
    "relationship_patterns": ["pattern1", "pattern2", ...],
    "entity_groupings": {{"group_name": ["entity_id1", "entity_id2"]}}
  }},
  "concepts": [
    {{
      "concept_id": "unique_id",
      "name": "Descriptive Name",
      "entity_pattern": ["entity_id1", "entity_id2"],
      "relationship_pattern": "how entities relate (e.g., 'treats', 'causes')",
      "covered_topics": ["topic_id1", "topic_id2"],
      "rationale": "Why this pattern covers these topics"
    }}
  ],
  "overall_reasoning": "High-level explanation of the concept design strategy"
}}

Generate the concepts now."""

        return prompt

    def _parse_concept_proposals(
        self,
        llm_result: Dict[str, Any],
        semantic_space: SemanticSpace
    ) -> List[Concept]:
        """Parse LLM response into Concept objects"""

        concepts = []
        concept_data_list = llm_result.get("concepts", [])

        for idx, concept_data in enumerate(concept_data_list):
            # Validate entity_ids exist in semantic space
            entity_ids = concept_data.get("entity_pattern", [])
            valid_entity_ids = [e.entity_id for e in semantic_space.entities]
            invalid_entities = [eid for eid in entity_ids if eid not in valid_entity_ids]

            if invalid_entities:
                logger.warning(f"Concept {concept_data.get('concept_id')} references invalid entities: {invalid_entities}")
                # Filter to valid entities only
                entity_ids = [eid for eid in entity_ids if eid in valid_entity_ids]

            # Validate topic_ids exist in semantic space
            topic_ids = concept_data.get("covered_topics", [])
            valid_topic_ids = [t.topic_id for t in semantic_space.topics]
            invalid_topics = [tid for tid in topic_ids if tid not in valid_topic_ids]

            if invalid_topics:
                logger.warning(f"Concept {concept_data.get('concept_id')} references invalid topics: {invalid_topics}")
                # Filter to valid topics only
                topic_ids = [tid for tid in topic_ids if tid in valid_topic_ids]

            # Build vocabulary_terms from entities
            vocabulary_terms = {}
            for entity_id in entity_ids:
                entity = next((e for e in semantic_space.entities if e.entity_id == entity_id), None)
                if entity and entity.synonyms:
                    vocabulary_terms[entity_id] = entity.synonyms

            concept = Concept(
                concept_id=concept_data.get("concept_id", f"concept_{idx+1}"),
                name=concept_data.get("name", f"Concept {idx+1}"),
                entity_pattern=entity_ids,
                relationship_pattern=concept_data.get("relationship_pattern"),
                covered_topics=topic_ids,
                vocabulary_terms=vocabulary_terms,
                expected_volume=None,  # Will be filled during volume estimation
                volume_status=VolumeStatus.UNKNOWN,
                last_volume_check=None,
                source_queries={},  # Will be filled during query generation
                semantic_filter=SemanticFilter(),  # Default no filtering
                exclusions=[],
                exclusion_rationale=None,
                rationale=concept_data.get("rationale", ""),
                human_edited=False
            )

            concepts.append(concept)

        return concepts

    def _validate_coverage(
        self,
        concepts: List[Concept],
        semantic_space: SemanticSpace
    ) -> Dict[str, Any]:
        """Check if proposed concepts cover all topics"""

        covered_topics = set()
        for concept in concepts:
            covered_topics.update(concept.covered_topics)

        all_topics = {t.topic_id for t in semantic_space.topics}
        uncovered_topics = all_topics - covered_topics

        # Also track many-to-many mapping
        topic_coverage_count = {t.topic_id: 0 for t in semantic_space.topics}
        for concept in concepts:
            for topic_id in concept.covered_topics:
                if topic_id in topic_coverage_count:
                    topic_coverage_count[topic_id] += 1

        return {
            "is_complete": len(uncovered_topics) == 0,
            "covered_topics": list(covered_topics),
            "uncovered_topics": list(uncovered_topics),
            "coverage_percentage": len(covered_topics) / len(all_topics) * 100 if all_topics else 100,
            "topic_coverage_count": topic_coverage_count,
            "concepts_per_topic": {
                "min": min(topic_coverage_count.values()) if topic_coverage_count else 0,
                "max": max(topic_coverage_count.values()) if topic_coverage_count else 0,
                "avg": sum(topic_coverage_count.values()) / len(topic_coverage_count) if topic_coverage_count else 0
            }
        }
