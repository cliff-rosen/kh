"""
Retrieval Query Service

Generates source-specific queries from semantic space topics for Layer 2 retrieval configuration.
This replaces the old channel-based query generation with topic-based generation.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from schemas.semantic_space import Topic, Entity, Relationship, SemanticSpace, SemanticContext
from schemas.sources import INFORMATION_SOURCES
from schemas.canonical_types import CanonicalResearchArticle
from services.research_stream_service import ResearchStreamService
from services.smart_search_service import SmartSearchService

logger = logging.getLogger(__name__)


class RetrievalQueryService:
    """Service for generating retrieval queries from semantic space topics"""

    def __init__(self, db: Session):
        self.db = db
        self.stream_service = ResearchStreamService(db)
        self.search_service = SmartSearchService()

    async def generate_query_for_topic(
        self,
        topic: Topic,
        source_id: str,
        semantic_space: SemanticSpace,
        related_entities: Optional[List[Entity]] = None
    ) -> Tuple[str, str]:
        """
        Generate a source-specific query for a topic.

        This uses the topic itself plus related entities and the broader semantic context
        to create an optimized query for the target source.

        Args:
            topic: The topic to generate a query for
            source_id: Target source (e.g., 'pubmed', 'google_scholar')
            semantic_space: Complete semantic space for context
            related_entities: Optional list of entities related to this topic

        Returns:
            Tuple of (query_expression, reasoning)
        """
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Validate source
        source_info = next(
            (src for src in INFORMATION_SOURCES if src.source_id == source_id),
            None
        )
        if not source_info:
            raise ValueError(f"Unknown source: {source_id}")

        # Extract topic information
        topic_name = topic.name
        topic_description = topic.description
        topic_importance = topic.importance

        # Find related entities if not provided
        if related_entities is None:
            related_entities = self._find_related_entities(topic, semantic_space)

        # Extract entity terms
        entity_terms = []
        for entity in related_entities[:10]:  # Limit to top 10 entities
            entity_terms.extend(entity.canonical_forms[:3])  # Top 3 forms per entity

        # Get broader context
        domain_name = semantic_space.domain.name
        business_context = semantic_space.context.business_context

        # Create source-specific system prompt
        if source_id == 'pubmed':
            system_prompt = """You are a PubMed search query expert. Generate an optimized boolean search query for PubMed based on the provided topic and semantic context.

            REQUIREMENTS:
            1. Use PubMed boolean syntax (AND, OR, NOT with parentheses)
            2. Structure the query to capture the topic's key concepts
            3. Use OR to combine synonymous or related terms
            4. Use AND to require multiple distinct concepts if appropriate
            5. Keep the query focused and precise - aim for 100-2000 results
            6. Use medical/scientific terminology appropriate for PubMed
            7. Consider the topic's importance level when deciding query breadth

            STRUCTURE EXAMPLES:
            - Single concept: (term1 OR term2 OR term3)
            - Multiple concepts: (concept1_term1 OR concept1_term2) AND (concept2_term1 OR concept2_term2)
            - With exclusions: (include_terms) NOT (exclude_terms)

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        elif source_id == 'google_scholar':
            system_prompt = """You are a Google Scholar search query expert. Generate an optimized natural language search query for Google Scholar based on the provided topic and semantic context.

            REQUIREMENTS:
            1. Use simple natural language - NO complex boolean operators
            2. Use quoted phrases for specific concepts: "machine learning"
            3. Keep it concise - maximum 3-5 key terms or quoted phrases
            4. Focus on the most distinctive keywords
            5. Aim for focused results (hundreds to low thousands, not millions)
            6. Consider the topic's importance when selecting terms

            GOOD EXAMPLES:
            - "CRISPR gene editing" cancer therapy
            - "machine learning" healthcare diagnostics
            - "climate change" agriculture adaptation

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        else:
            # Generic fallback for other sources
            system_prompt = f"""You are a search query expert for {source_info.name}. Generate an optimized search query based on the provided topic and semantic context.

            Query syntax to use: {source_info.query_syntax}

            Create a focused query that will retrieve relevant articles (aim for 100-2000 results).
            Consider the topic importance and related concepts when building the query.

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        # Build user prompt with rich semantic context
        entity_section = ""
        if entity_terms:
            entity_section = f"\n\nRelated Entities/Terms:\n{', '.join(entity_terms)}"

        user_prompt = f"""Generate a search query for the following topic within this research domain:

        Domain: {domain_name}
        Context: {business_context}

        TOPIC TO QUERY:
        Name: {topic_name}
        Description: {topic_description}
        Importance: {topic_importance.value}
        Rationale: {topic.rationale}{entity_section}

        Create a {source_info.name} query that will find articles relevant to this topic.
        The query should be precise enough to avoid overwhelming results but broad enough to capture relevant research.
        Consider the topic's importance level: {'critical' if topic_importance.value == 'critical' else 'important' if topic_importance.value == 'important' else 'relevant'} topics should be {'comprehensive' if topic_importance.value == 'critical' else 'balanced' if topic_importance.value == 'important' else 'focused'}."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "query_expression": {
                    "type": "string",
                    "description": "The generated search query expression"
                },
                "reasoning": {
                    "type": "string",
                    "description": "Explanation of why this query was generated and what concepts it captures"
                }
            },
            "required": ["query_expression", "reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
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
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            query_expression = response_data.get('query_expression', '')
            reasoning = response_data.get('reasoning', '')

            if not query_expression:
                # Fallback: simple combination based on topic name and entities
                query_expression = self._generate_fallback_query(
                    topic_name, entity_terms[:5], source_id
                )
                reasoning = f"Fallback query using topic name and related entities"

            logger.info(f"Generated query for topic '{topic_name}' on {source_id}: {query_expression[:100]}")

            return query_expression, reasoning

        except Exception as e:
            logger.error(f"Query generation failed: {e}")
            # Fallback to simple query
            query_expression = self._generate_fallback_query(
                topic_name, entity_terms[:5], source_id
            )
            reasoning = f"Generated fallback query due to error: {str(e)}"
            return query_expression, reasoning

    def _find_related_entities(
        self,
        topic: Topic,
        semantic_space: SemanticSpace
    ) -> List[Entity]:
        """
        Find entities related to a topic via relationships.

        Args:
            topic: The topic to find entities for
            semantic_space: Complete semantic space

        Returns:
            List of related entities
        """
        related_entity_ids = set()

        # Find relationships where topic is subject or object
        for relationship in semantic_space.relationships:
            if relationship.subject == topic.topic_id:
                # Check if object is an entity
                related_entity_ids.add(relationship.object)
            elif relationship.object == topic.topic_id:
                # Check if subject is an entity
                related_entity_ids.add(relationship.subject)

        # Filter to actual entities
        related_entities = [
            entity for entity in semantic_space.entities
            if entity.entity_id in related_entity_ids
        ]

        # If no explicit relationships, return all entities (limited by caller)
        if not related_entities:
            related_entities = semantic_space.entities

        return related_entities

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

    async def test_query_for_topic(
        self,
        query_expression: str,
        source_id: str,
        max_results: int = 10,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        date_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Test a query expression against a source.

        Args:
            query_expression: Query to test
            source_id: Source to test against
            max_results: Maximum sample articles to return
            start_date: Start date for filtering (YYYY-MM-DD) - PubMed only
            end_date: End date for filtering (YYYY-MM-DD) - PubMed only
            date_type: Date type for filtering - PubMed only

        Returns:
            Dict with success, article_count, sample_articles, error_message
        """
        try:
            # For PubMed, apply date filtering
            date_params = {}
            if source_id == 'pubmed':
                from datetime import datetime, timedelta

                # Default to 7-day range if not provided
                if not start_date or not end_date:
                    end_date_obj = datetime.utcnow()
                    start_date_obj = end_date_obj - timedelta(days=7)
                    start_date = start_date_obj.strftime('%Y-%m-%d')
                    end_date = end_date_obj.strftime('%Y-%m-%d')

                date_params = {
                    'start_date': start_date,
                    'end_date': end_date,
                    'date_type': date_type or 'entrez'
                }

            result = await self.search_service.search_articles(
                search_query=query_expression,
                max_results=max_results,
                offset=0,
                selected_sources=[source_id],
                **date_params
            )

            return {
                'success': True,
                'article_count': result.pagination.total_available,
                'sample_articles': result.articles,
                'error_message': None
            }

        except Exception as e:
            logger.error(f"Query test failed: {e}")
            return {
                'success': False,
                'article_count': 0,
                'sample_articles': [],
                'error_message': str(e)
            }
