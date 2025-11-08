"""
Retrieval Group Service

Generates and manages retrieval groups from semantic space for Layer 2 configuration.
Provides LLM-assisted workflow for proposing, validating, and configuring retrieval groups.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from schemas.semantic_space import SemanticSpace, Topic, Entity, Relationship
from schemas.research_stream import RetrievalGroup, GenerationMetadata, SemanticFilter
from services.research_stream_service import ResearchStreamService

logger = logging.getLogger(__name__)


class RetrievalGroupService:
    """Service for managing retrieval groups"""

    def __init__(self, db: Session):
        self.db = db
        self.stream_service = ResearchStreamService(db)

    async def propose_groups(
        self,
        semantic_space: SemanticSpace
    ) -> Dict[str, Any]:
        """
        Phase 1: Propose retrieval groups based on semantic space analysis.

        Uses LLM to analyze topics, entities, and relationships to suggest
        optimal groupings for retrieval.

        Args:
            semantic_space: Complete semantic space

        Returns:
            Dict with proposed_groups and coverage_analysis
        """
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        # Build comprehensive context for LLM
        topics_summary = self._summarize_topics(semantic_space)
        entities_summary = self._summarize_entities(semantic_space)
        relationships_summary = self._summarize_relationships(semantic_space)

        system_prompt = """You are an expert at organizing scientific topics for efficient information retrieval.

        Your task is to analyze a semantic space (topics, entities, relationships) and propose retrieval groups that optimize search coverage.

        GROUPING PRINCIPLES:
        1. Topics that share terminology or retrieve well together should be grouped
        2. Topics with strong relationships (causal, correlational, therapeutic) should be considered for grouping
        3. Each group should be focused enough for coherent queries but broad enough to reduce total number of groups
        4. Aim for 3-8 groups total (fewer is better if coherent)
        5. Critical topics should get dedicated focus
        6. Consider how topics would be searched in databases like PubMed or Google Scholar

        AVOID:
        - Too many small groups (overhead in configuration)
        - Too few large groups (loses focus, hard to filter)
        - Mixing unrelated topics that wouldn't retrieve together

        OUTPUT FORMAT:
        Return JSON with:
        {
        "proposed_groups": [
            {
            "name": "Short descriptive name",
            "covered_topics": ["topic_id_1", "topic_id_2"],
            "rationale": "Why these topics retrieve well together",
            "confidence": 0.85
            }
        ],
        "reasoning": "Overall strategy explanation"
        }

        Ensure ALL topics are covered by at least one group."""

        user_prompt = f"""Analyze this semantic space and propose retrieval groups:

        DOMAIN: {semantic_space.domain.name}
        {semantic_space.domain.description}

        TOPICS ({len(semantic_space.topics)} total):
        {topics_summary}

        ENTITIES ({len(semantic_space.entities)} total):
        {entities_summary}

        RELATIONSHIPS ({len(semantic_space.relationships)} total):
        {relationships_summary}

        BUSINESS CONTEXT:
        {semantic_space.context.business_context}

        Propose optimal retrieval groups that ensure complete coverage while minimizing configuration overhead."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "proposed_groups": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "covered_topics": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "rationale": {"type": "string"},
                            "confidence": {"type": "number", "minimum": 0, "maximum": 1}
                        },
                        "required": ["name", "covered_topics", "rationale", "confidence"]
                    }
                },
                "reasoning": {"type": "string"}
            },
            "required": ["proposed_groups", "reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.3),  # Slightly higher for creativity
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
            # Get LLM response
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat",
                role=MessageRole.USER,
                content=user_prompt,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )

            # Extract result
            llm_response = result.result
            logger.info(f"LLM response type: {type(llm_response)}")
            logger.info(f"LLM response: {llm_response}")

            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            elif isinstance(llm_response, str):
                # Try to parse as JSON if it's a string
                import json
                try:
                    response_data = json.loads(llm_response)
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse LLM response as JSON: {llm_response[:200]}")
                    raise ValueError(f"LLM returned invalid JSON: {llm_response[:200]}")
            else:
                response_data = llm_response

            logger.info(f"Parsed response_data type: {type(response_data)}")

            # Ensure response_data is a dict
            if not isinstance(response_data, dict):
                raise ValueError(f"Expected dict from LLM, got {type(response_data)}: {response_data}")

            # Convert to RetrievalGroup objects with metadata
            proposed_groups = []
            groups_list = response_data.get('proposed_groups', [])
            logger.info(f"Found {len(groups_list)} proposed groups")

            for idx, group_data in enumerate(groups_list):
                metadata = GenerationMetadata(
                    generated_at=datetime.utcnow(),
                    generated_by=f"llm:{task_config['model']}",
                    reasoning=group_data.get('rationale', ''),
                    confidence=group_data.get('confidence'),
                    inputs_considered=group_data.get('covered_topics', []),
                    human_edited=False
                )

                group = RetrievalGroup(
                    group_id=f"grp_{datetime.utcnow().timestamp()}_{idx}",
                    name=group_data.get('name', f'Group {idx + 1}'),
                    covered_topics=group_data.get('covered_topics', []),
                    rationale=group_data.get('rationale', ''),
                    source_queries={},
                    semantic_filter=SemanticFilter(),
                    metadata=metadata
                )
                proposed_groups.append(group)

            # Analyze coverage
            coverage_analysis = self._analyze_coverage(semantic_space, proposed_groups)

            logger.info(f"Proposed {len(proposed_groups)} retrieval groups with {coverage_analysis['coverage_percentage']}% coverage")

            return {
                'proposed_groups': [g.model_dump() for g in proposed_groups],
                'coverage_analysis': coverage_analysis,
                'overall_reasoning': response_data.get('reasoning', '')
            }

        except Exception as e:
            logger.error(f"Group proposal failed: {e}", exc_info=True)
            # Fallback: one group per topic
            fallback_groups = self._create_fallback_groups(semantic_space)
            return {
                'proposed_groups': [g.model_dump() for g in fallback_groups],
                'coverage_analysis': self._analyze_coverage(semantic_space, fallback_groups),
                'overall_reasoning': f'Fallback grouping due to error: {str(e)}',
                'error': str(e)
            }

    def _summarize_topics(self, semantic_space: SemanticSpace) -> str:
        """Create a concise summary of topics for LLM"""
        lines = []
        for topic in semantic_space.topics:
            parent = f" (child of {topic.parent_topic})" if topic.parent_topic else ""
            lines.append(f"- {topic.topic_id}: \"{topic.name}\" [{topic.importance.value}]{parent}")
            lines.append(f"  {topic.description[:100]}...")
        return '\n'.join(lines[:50])  # Limit to avoid token overflow

    def _summarize_entities(self, semantic_space: SemanticSpace) -> str:
        """Create a concise summary of entities for LLM"""
        if not semantic_space.entities:
            return "No entities defined"

        entity_counts = {}
        for entity in semantic_space.entities:
            entity_counts[entity.entity_type.value] = entity_counts.get(entity.entity_type.value, 0) + 1

        summary = "Entity types: " + ", ".join([f"{k}({v})" for k, v in entity_counts.items()])

        # Add a few examples
        examples = []
        for entity in semantic_space.entities[:10]:
            examples.append(f"{entity.name} ({entity.entity_type.value})")

        if examples:
            summary += "\nExamples: " + ", ".join(examples)

        return summary

    def _summarize_relationships(self, semantic_space: SemanticSpace) -> str:
        """Create a concise summary of relationships for LLM"""
        if not semantic_space.relationships:
            return "No relationships defined"

        rel_counts = {}
        for rel in semantic_space.relationships:
            rel_counts[rel.type.value] = rel_counts.get(rel.type.value, 0) + 1

        summary = "Relationship types: " + ", ".join([f"{k}({v})" for k, v in rel_counts.items()])

        # Add a few examples
        examples = []
        for rel in semantic_space.relationships[:5]:
            examples.append(f"{rel.subject} → {rel.type.value} → {rel.object}")

        if examples:
            summary += "\nExamples:\n" + "\n".join(examples)

        return summary

    def _analyze_coverage(
        self,
        semantic_space: SemanticSpace,
        groups: List[RetrievalGroup]
    ) -> Dict[str, Any]:
        """Analyze how well the groups cover all topics"""
        all_topic_ids = {t.topic_id for t in semantic_space.topics}
        covered_topic_ids = set()

        for group in groups:
            covered_topic_ids.update(group.covered_topics)

        uncovered = all_topic_ids - covered_topic_ids
        over_covered = []

        # Check for topics in multiple groups
        topic_counts = {}
        for group in groups:
            for topic_id in group.covered_topics:
                topic_counts[topic_id] = topic_counts.get(topic_id, 0) + 1

        for topic_id, count in topic_counts.items():
            if count > 1:
                topic = next((t for t in semantic_space.topics if t.topic_id == topic_id), None)
                over_covered.append({
                    'topic_id': topic_id,
                    'topic_name': topic.name if topic else topic_id,
                    'group_count': count
                })

        uncovered_details = []
        for topic_id in uncovered:
            topic = next((t for t in semantic_space.topics if t.topic_id == topic_id), None)
            if topic:
                uncovered_details.append({
                    'topic_id': topic_id,
                    'name': topic.name,
                    'importance': topic.importance.value
                })

        coverage_percentage = (len(covered_topic_ids) / len(all_topic_ids) * 100) if all_topic_ids else 100

        warnings = []
        if uncovered:
            critical_uncovered = [u for u in uncovered_details if u['importance'] == 'critical']
            if critical_uncovered:
                warnings.append(f"{len(critical_uncovered)} critical topics have no coverage")
            warnings.append(f"{len(uncovered)} topics have no coverage")

        return {
            'total_topics': len(all_topic_ids),
            'covered_topics': len(covered_topic_ids),
            'coverage_percentage': round(coverage_percentage, 1),
            'uncovered': uncovered_details,
            'over_covered': over_covered,
            'warnings': warnings,
            'is_complete': len(uncovered) == 0
        }

    def _create_fallback_groups(self, semantic_space: SemanticSpace) -> List[RetrievalGroup]:
        """Create simple fallback groups (one per topic) if LLM fails"""
        groups = []
        for idx, topic in enumerate(semantic_space.topics):
            metadata = GenerationMetadata(
                generated_at=datetime.utcnow(),
                generated_by="system:fallback",
                reasoning="Fallback: one group per topic",
                confidence=0.5,
                inputs_considered=[topic.topic_id],
                human_edited=False
            )

            group = RetrievalGroup(
                group_id=f"grp_fallback_{idx}",
                name=topic.name,
                covered_topics=[topic.topic_id],
                rationale=f"Dedicated group for {topic.name}",
                source_queries={},
                semantic_filter=SemanticFilter(),
                metadata=metadata
            )
            groups.append(group)

        return groups

    def validate_groups(
        self,
        semantic_space: SemanticSpace,
        groups: List[RetrievalGroup]
    ) -> Dict[str, Any]:
        """
        Phase 4: Validate retrieval groups for completeness and readiness.

        Args:
            semantic_space: Complete semantic space
            groups: List of retrieval groups to validate

        Returns:
            Validation results with coverage, warnings, and readiness status
        """
        coverage = self._analyze_coverage(semantic_space, groups)

        # Check query configuration
        groups_without_queries = []
        groups_without_filters = []

        for group in groups:
            if not group.source_queries or all(q is None for q in group.source_queries.values()):
                groups_without_queries.append(group.name)

            if not group.semantic_filter or not group.semantic_filter.enabled:
                groups_without_filters.append(group.name)

        warnings = coverage['warnings'].copy()

        if groups_without_queries:
            warnings.append(f"{len(groups_without_queries)} groups have no queries configured")

        # Determine if ready to activate
        ready_to_activate = (
            coverage['is_complete'] and
            len(groups_without_queries) == 0
        )

        return {
            'is_complete': coverage['is_complete'],
            'coverage': coverage,
            'configuration_status': {
                'groups_without_queries': groups_without_queries,
                'groups_without_filters': groups_without_filters
            },
            'warnings': warnings,
            'ready_to_activate': ready_to_activate
        }
