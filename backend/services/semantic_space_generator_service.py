"""
Semantic Space Generator Service

Generates a complete SemanticSpace from a natural language description using LLM.
Follows the BroadSearchService pattern: BasePromptCaller + JSON response schema.
"""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from schemas.semantic_space import SemanticSpace

logger = logging.getLogger(__name__)


class SemanticSpaceGeneratorService:
    """Service for generating complete semantic spaces from natural language descriptions."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def generate_semantic_space(
        self,
        description: str,
        user_context: Optional[str] = None
    ) -> SemanticSpace:
        """
        Generate a complete SemanticSpace from a natural language description.

        Args:
            description: Natural language description of the research domain
            user_context: Optional additional context

        Returns:
            A fully populated SemanticSpace object
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        logger.info(f"Generating semantic space from description: {description[:100]}...")

        system_prompt, user_prompt = self._build_prompts(description, user_context)

        response_schema = {
            "type": "object",
            "properties": {
                "domain": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["name", "description"]
                },
                "topics": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "topic_id": {"type": "string"},
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "parent_topic": {"type": ["string", "null"]},
                            "importance": {"type": "string", "enum": ["critical", "important", "relevant"]},
                            "rationale": {"type": "string"}
                        },
                        "required": ["topic_id", "name", "description", "importance", "rationale"]
                    }
                },
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "entity_id": {"type": "string"},
                            "entity_type": {"type": "string"},
                            "name": {"type": "string"},
                            "canonical_forms": {"type": "array", "items": {"type": "string"}},
                            "context": {"type": "string"}
                        },
                        "required": ["entity_id", "entity_type", "name", "canonical_forms", "context"]
                    }
                },
                "context": {
                    "type": "object",
                    "properties": {
                        "business_context": {"type": "string"},
                        "decision_types": {"type": "array", "items": {"type": "string"}},
                        "stakeholders": {"type": "array", "items": {"type": "string"}},
                        "time_sensitivity": {"type": "string"}
                    },
                    "required": ["business_context", "decision_types", "stakeholders", "time_sensitivity"]
                },
                "coverage": {
                    "type": "object",
                    "properties": {
                        "signal_types": {"type": "array", "items": {"type": "object"}},
                        "temporal_scope": {
                            "type": "object",
                            "properties": {
                                "start_date": {"type": ["string", "null"]},
                                "end_date": {"type": ["string", "null"]},
                                "focus_periods": {"type": "array", "items": {"type": "string"}},
                                "recency_weight": {"type": "number"},
                                "rationale": {"type": "string"}
                            }
                        },
                        "quality_criteria": {
                            "type": "object",
                            "properties": {
                                "peer_review_required": {"type": "boolean"},
                                "minimum_citation_count": {"type": ["integer", "null"]},
                                "journal_quality": {"type": "array", "items": {"type": "string"}},
                                "study_types": {"type": "array", "items": {"type": "string"}},
                                "exclude_predatory": {"type": "boolean"},
                                "language_restrictions": {"type": "array", "items": {"type": "string"}},
                                "other_criteria": {"type": "array", "items": {"type": "string"}}
                            }
                        },
                        "completeness_requirement": {"type": "string"}
                    }
                },
                "boundaries": {
                    "type": "object",
                    "properties": {
                        "inclusions": {"type": "array", "items": {"type": "object"}},
                        "exclusions": {"type": "array", "items": {"type": "object"}},
                        "edge_cases": {"type": "array", "items": {"type": "object"}}
                    }
                }
            },
            "required": ["domain", "topics", "entities", "context", "coverage", "boundaries"]
        }

        task_config = get_task_config("extraction", "complex")

        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.3),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
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

            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            # Add extraction metadata
            response_data["extraction_metadata"] = {
                "extracted_from": "chat",
                "extracted_at": datetime.utcnow().isoformat(),
                "human_reviewed": False,
                "derivation_method": "ai_generated"
            }

            # Ensure relationships field exists
            if "relationships" not in response_data:
                response_data["relationships"] = []

            # Validate via Pydantic
            semantic_space = SemanticSpace(**response_data)

            logger.info(
                f"Generated semantic space: domain='{semantic_space.domain.name}', "
                f"{len(semantic_space.topics)} topics, {len(semantic_space.entities)} entities"
            )

            return semantic_space

        except Exception as e:
            logger.error(f"Semantic space generation failed: {e}", exc_info=True)
            raise ValueError(f"Failed to generate semantic space: {e}")

    def _build_prompts(
        self,
        description: str,
        user_context: Optional[str]
    ) -> tuple[str, str]:
        """Build the LLM prompts for semantic space generation."""

        user_context_section = ""
        if user_context:
            user_context_section = f"\n## Additional Context:\n{user_context}\n"

        system_prompt = """You are an expert research domain analyst. Your task is to generate a complete semantic space definition from a natural language description.

A semantic space defines WHAT information matters for a research monitoring domain. It is source-agnostic — it describes the conceptual territory, not how to search for it.

# REQUIRED SECTIONS

1. **Domain**: A name and description for the overall research area.

2. **Topics**: The key topics to track. Each needs:
   - topic_id: Unique snake_case identifier (e.g., "crispr_therapeutics")
   - name: Human-readable topic name
   - description: What this topic encompasses
   - parent_topic: Optional parent topic_id for hierarchy (null if top-level)
   - importance: "critical", "important", or "relevant"
   - rationale: Why this topic matters

3. **Entities**: Named entities relevant to the domain (drugs, genes, diseases, organizations, etc.). Each needs:
   - entity_id: Unique snake_case identifier
   - entity_type: One of: disease, substance, chemical, organization, regulation, standard, methodology, biomarker, geographic, population, drug, gene, protein, pathway, therapy, device
   - name: Entity name
   - canonical_forms: List of name variations/synonyms
   - context: Why this entity matters

4. **Context**: Business context for the research:
   - business_context: Why this research matters
   - decision_types: What decisions this informs
   - stakeholders: Who uses this information
   - time_sensitivity: How often information needs review

5. **Coverage**: What types of information to capture:
   - signal_types: Types of publications/signals that matter (array of objects with signal_id, name, description, priority, examples)
   - temporal_scope: Time boundaries (start_date, end_date, focus_periods, recency_weight 0-1, rationale)
   - quality_criteria: Quality requirements (peer_review_required, study_types, exclude_predatory, language_restrictions, etc.)
   - completeness_requirement: Level of coverage needed

6. **Boundaries**: What's in and out of scope:
   - inclusions: What to include (array of objects with criterion_id, description, rationale, mandatory, related_topics, related_entities)
   - exclusions: What to exclude (array of objects with criterion_id, description, rationale, strict, exceptions)
   - edge_cases: Ambiguous cases (array of objects with case_id, description, resolution, conditions, rationale)

# GUIDELINES

- Generate 3-8 topics covering the main areas of the domain
- Generate relevant entities (drugs, diseases, key organizations, etc.)
- Be specific and actionable in descriptions
- Use appropriate importance levels (not everything is "critical")
- Topic IDs must be unique snake_case strings
- Entity types must match the allowed enum values exactly
- For signal_types, use priority values: "must_have", "should_have", or "nice_to_have"

Respond in JSON format matching the schema."""

        user_prompt = f"""Generate a complete semantic space for the following research domain:

{description}{user_context_section}

Create a thorough semantic space with appropriate topics, entities, context, coverage requirements, and boundaries. Make it specific and actionable for weekly literature monitoring."""

        return system_prompt, user_prompt
