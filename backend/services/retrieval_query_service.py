"""
Retrieval Query Service

Generates source-specific queries from semantic space topics for Layer 2 retrieval configuration.
This replaces the old channel-based query generation with topic-based generation.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.semantic_space import Topic, Entity, Relationship, SemanticSpace, SemanticContext
from schemas.sources import INFORMATION_SOURCES
from schemas.canonical_types import CanonicalResearchArticle
from services.research_stream_service import ResearchStreamService

logger = logging.getLogger(__name__)


class RetrievalQueryService:
    """Service for generating retrieval queries from semantic space topics"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.stream_service = ResearchStreamService(db)


    def _generate_fallback_query(
        self,
        topic_name: str,
        entity_terms: List[str],
        source_id: str
    ) -> str:
        """
        Generate a simple fallback query.

        Args:
            topic_name: Name of the topic
            entity_terms: List of entity terms
            source_id: Source identifier

        Returns:
            Simple query expression
        """
        all_terms = [topic_name] + entity_terms

        if source_id == 'pubmed':
            # Boolean OR of all terms
            return '(' + ' OR '.join(all_terms[:5]) + ')'
        else:
            # Natural language with quotes
            return ' '.join(f'"{term}"' for term in all_terms[:3])

    def _generate_fallback_query_for_group(
        self,
        topic_names: List[str],
        entity_terms: List[str],
        source_id: str
    ) -> str:
        """
        Generate a simple fallback query for multiple topics.

        Args:
            topic_names: Names of all topics in the group
            entity_terms: List of entity terms across all topics
            source_id: Source identifier

        Returns:
            Simple combined query expression
        """
        if source_id == 'pubmed':
            # Combine topics with OR, include some entity terms
            topic_parts = [f'({name})' for name in topic_names[:5]]
            entity_parts = entity_terms[:5]
            all_parts = topic_parts + entity_parts
            return '(' + ' OR '.join(all_parts) + ')'
        else:
            # Natural language combining topic names
            all_terms = topic_names[:3] + entity_terms[:3]
            return ' '.join(f'"{term}"' for term in all_terms)

    async def generate_filter_for_broad_query(
        self,
        broad_query,  # BroadQuery from research_stream schema
        semantic_space: SemanticSpace
    ) -> Tuple[str, float, str]:
        """
        Generate semantic filter criteria for a broad query.

        Args:
            broad_query: BroadQuery object
            semantic_space: Complete semantic space for context

        Returns:
            Tuple of (criteria, threshold, reasoning)
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Get covered topics
        covered_topics = [
            t for t in semantic_space.topics
            if t.topic_id in broad_query.covered_topics
        ]

        topics_summary = "\n".join([
            f"- {t.name}: {t.description}"
            for t in covered_topics
        ])

        terms_summary = ", ".join(broad_query.search_terms)

        system_prompt = """You are an expert at creating semantic filter criteria for research article screening.

        Your task is to define clear criteria that distinguish truly relevant articles from false positives for a BROAD SEARCH.

        A broad search casts a wide net and may capture many irrelevant articles. The filter should identify articles
        that are genuinely relevant to the covered topics while filtering out unrelated results.

        Good filter criteria:
        - Focus on the topics and domain context
        - Consider what makes an article truly relevant vs tangentially related
        - Are written in clear, natural language
        - Account for the broad nature of the search

        Respond in JSON format with "criteria", "threshold", and "reasoning" fields.

        Threshold should be between 0.5 (permissive) and 0.9 (strict). For broad searches, default to 0.6-0.7."""

        user_prompt = f"""Create semantic filter criteria for this broad search:

        SEARCH TERMS: {terms_summary}
        QUERY: {broad_query.query_expression}
        RATIONALE: {broad_query.rationale}

        TOPICS COVERED:
        {topics_summary}

        DOMAIN: {semantic_space.domain.name}

        Define filter criteria that will help identify articles truly relevant to these topics while filtering out false positives from this broad search."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "criteria": {"type": "string"},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"}
            },
            "required": ["criteria", "threshold", "reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
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

            # Extract result
            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            criteria = response_data.get('criteria', '')
            threshold = response_data.get('threshold', 0.7)
            reasoning = response_data.get('reasoning', '')

            logger.info(f"Generated filter for broad query '{broad_query.query_id}': threshold={threshold}")
            return criteria, threshold, reasoning

        except Exception as e:
            logger.error(f"Filter generation for broad query failed: {e}")
            # Fallback to simple filter
            topic_names = [t.name for t in covered_topics]
            criteria = f"Articles must be directly relevant to one or more of these topics: {', '.join(topic_names)}."
            threshold = 0.6
            reasoning = f"Generated fallback filter for broad query due to error: {str(e)}"
            return criteria, threshold, reasoning
