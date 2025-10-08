"""
Implementation Configuration Service

Handles business logic for Workflow 2 - configuring and testing
query expressions and semantic filters for research stream channels.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from schemas.research_stream import ResearchStream
from schemas.sources import INFORMATION_SOURCES
from schemas.canonical_types import CanonicalResearchArticle
from schemas.smart_search import FilteredArticle
from services.research_stream_service import ResearchStreamService
from services.smart_search_service import SmartSearchService
from agents.prompts.base_prompt_caller import LLMUsage

logger = logging.getLogger(__name__)


class ImplementationConfigService:
    """Service for implementation configuration workflow"""

    def __init__(self, db: Session):
        self.db = db
        self.stream_service = ResearchStreamService(db)
        self.search_service = SmartSearchService()

    def verify_stream_and_channel(
        self,
        stream_id: int,
        user_id: str,
        channel_name: str
    ) -> Tuple[ResearchStream, Dict[str, Any]]:
        """
        Verify stream ownership and channel existence.

        Returns:
            Tuple of (stream, channel)

        Raises:
            ValueError: If stream not found or user doesn't own it
            ValueError: If channel not found in stream
        """
        stream = self.stream_service.get_research_stream(stream_id, user_id)
        if not stream:
            raise ValueError("Research stream not found")

        channel = next((ch for ch in stream.channels if ch.get('name') == channel_name), None)
        if not channel:
            raise ValueError(f"Channel '{channel_name}' not found in stream")

        return stream, channel

    def validate_source_id(self, source_id: str) -> None:
        """
        Validate that source_id is valid.

        Raises:
            ValueError: If source_id is not valid
        """
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if source_id not in valid_sources:
            raise ValueError(f"Invalid source_id. Must be one of: {', '.join(valid_sources)}")

    async def generate_query_expression(
        self,
        stream: ResearchStream,
        channel: Dict[str, Any],
        source_id: str
    ) -> Tuple[str, str]:
        """
        Generate a query expression for a channel and source.

        This method is specifically designed for implementation configuration workflow,
        taking channel keywords, focus, and stream purpose to create an optimized
        source-specific query expression.

        Args:
            stream: The research stream
            channel: The channel dict
            source_id: Target source (e.g., 'pubmed', 'google_scholar')

        Returns:
            Tuple of (query_expression, reasoning)
        """
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Extract channel and stream information
        channel_keywords = channel.get('keywords', [])
        channel_focus = channel.get('focus', '')
        channel_name = channel.get('name', '')
        stream_purpose = stream.purpose

        # Get source information
        source_info = next(
            (src for src in INFORMATION_SOURCES if src.source_id == source_id),
            None
        )
        if not source_info:
            raise ValueError(f"Unknown source: {source_id}")

        # Create source-specific system prompt
        if source_id == 'pubmed':
            system_prompt = """You are a PubMed search query expert. Generate an optimized boolean search query for PubMed based on the provided channel information.

            REQUIREMENTS:
            1. Use PubMed boolean syntax (AND, OR, NOT with parentheses)
            2. Combine the channel keywords with OR within concept groups
            3. Use AND to connect different concept groups if applicable
            4. Keep the query focused and precise - aim for 100-2000 results
            5. Use medical/scientific terminology appropriate for PubMed

            STRUCTURE:
            - If keywords are all related to one concept: (keyword1 OR keyword2 OR keyword3)
            - If keywords span multiple concepts: (concept1_kw1 OR concept1_kw2) AND (concept2_kw1 OR concept2_kw2)

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        elif source_id == 'google_scholar':
            system_prompt = """You are a Google Scholar search query expert. Generate an optimized natural language search query for Google Scholar based on the provided channel information.

            REQUIREMENTS:
            1. Use simple natural language - NO complex boolean operators
            2. Use quoted phrases for specific concepts: "machine learning"
            3. Keep it concise - maximum 3-5 key terms or quoted phrases
            4. Focus on the most distinctive keywords
            5. Aim for focused results (hundreds to low thousands, not millions)

            GOOD EXAMPLES:
            - "CRISPR gene editing" cancer therapy
            - "machine learning" healthcare diagnostics
            - "climate change" agriculture adaptation

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        else:
            # Generic fallback for other sources
            system_prompt = f"""You are a search query expert for {source_info.name}. Generate an optimized search query based on the provided channel information.

            Query syntax to use: {source_info.query_syntax}

            Create a focused query that will retrieve relevant articles (aim for 100-2000 results).
            Combine the channel keywords appropriately for this source.

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        # Build user prompt with channel context
        user_prompt = f"""Generate a search query for the following research stream channel:

        Channel Name: {channel_name}
        Channel Focus: {channel_focus}
        Stream Purpose: {stream_purpose}

        Keywords: {', '.join(channel_keywords)}

        Create a {source_info.name} query that will find articles matching this channel's focus.
        The query should be precise enough to avoid overwhelming results but broad enough to capture relevant research."""

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
                    "description": "Explanation of why this query was generated"
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
                # Fallback: simple OR combination of keywords
                query_expression = ' OR '.join(channel_keywords[:5])
                reasoning = f"Fallback query using top {min(5, len(channel_keywords))} keywords"

            logger.info(f"Generated query for channel '{channel_name}' on {source_id}: {query_expression[:100]}")

            return query_expression, reasoning

        except Exception as e:
            logger.error(f"Query generation failed: {e}")
            # Fallback to simple keyword combination
            if source_id == 'pubmed':
                query_expression = '(' + ' OR '.join(channel_keywords[:5]) + ')'
            else:
                query_expression = ' '.join(f'"{kw}"' for kw in channel_keywords[:3])

            reasoning = f"Generated fallback query due to error: {str(e)}"
            return query_expression, reasoning

    async def test_query_expression(
        self,
        source_id: str,
        query_expression: str,
        max_results: int = 10,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        date_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Test a query expression against a source.

        For PubMed, defaults to trailing 7 days if no dates provided.

        Args:
            source_id: Source to test against
            query_expression: Query to test
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
                    'date_type': date_type or 'entrez'  # Use entry date for most reliable recent results
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

    async def generate_semantic_filter(
        self,
        stream: ResearchStream,
        channel: Dict[str, Any]
    ) -> Tuple[str, str]:
        """
        Generate a semantic filter criteria prompt for a channel.

        This creates a prompt that can be used with an LLM to evaluate whether
        an article is relevant to the stream/channel purpose.

        Args:
            stream: The research stream
            channel: The channel dict

        Returns:
            Tuple of (filter_criteria, reasoning)
        """
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Extract channel and stream information
        channel_keywords = channel.get('keywords', [])
        channel_focus = channel.get('focus', '')
        channel_name = channel.get('name', '')
        stream_purpose = stream.purpose

        system_prompt = """You are an expert at creating semantic filtering criteria for research articles.

Your task is to generate a clear, concise filtering criteria statement that can be used by an LLM to evaluate whether a research article is relevant to a specific research stream and channel.

The filtering criteria should:
1. Be specific enough to exclude irrelevant articles
2. Be broad enough to capture all relevant research
3. Focus on the PURPOSE and FOCUS rather than just keywords
4. Be written as evaluation criteria (what makes an article relevant?)
5. Be 2-4 sentences long

GOOD EXAMPLE:
"Articles should focus on novel CRISPR-based gene editing techniques applied to cancer therapy. Relevant articles discuss mechanisms, clinical trials, or preclinical studies of CRISPR modifications targeting oncogenes or tumor suppressor genes. Exclude articles that only mention CRISPR tangentially or focus on other diseases."

BAD EXAMPLE:
"Articles about CRISPR and cancer." (too vague)

Respond in JSON format with "filter_criteria" and "reasoning" fields."""

        user_prompt = f"""Generate semantic filtering criteria for this research stream channel:

Stream Purpose: {stream_purpose}

Channel Name: {channel_name}
Channel Focus: {channel_focus}
Keywords: {', '.join(channel_keywords)}

Create filtering criteria that will help identify articles truly relevant to this channel's focus within the broader stream purpose."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "filter_criteria": {
                    "type": "string",
                    "description": "The semantic filtering criteria statement"
                },
                "reasoning": {
                    "type": "string",
                    "description": "Explanation of why this criteria was chosen"
                }
            },
            "required": ["filter_criteria", "reasoning"]
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

            filter_criteria = response_data.get('filter_criteria', '')
            reasoning = response_data.get('reasoning', '')

            if not filter_criteria:
                # Fallback: simple criteria based on channel focus
                filter_criteria = f"Articles should be directly relevant to {channel_focus}. They should discuss research, methods, applications, or findings related to: {', '.join(channel_keywords[:5])}. Exclude tangential mentions."
                reasoning = "Generated fallback criteria based on channel focus and keywords"

            logger.info(f"Generated semantic filter for channel '{channel_name}': {filter_criteria[:100]}")

            return filter_criteria, reasoning

        except Exception as e:
            logger.error(f"Semantic filter generation failed: {e}")
            # Fallback to simple criteria
            filter_criteria = f"Articles should be directly relevant to {channel_focus}. They should discuss research, methods, applications, or findings related to: {', '.join(channel_keywords[:5])}. Exclude tangential mentions."
            reasoning = f"Generated fallback criteria due to error: {str(e)}"
            return filter_criteria, reasoning

    async def test_semantic_filter(
        self,
        articles: List[CanonicalResearchArticle],
        filter_criteria: str,
        threshold: float = 0.7
    ) -> Dict[str, Any]:
        """
        Test a semantic filter on articles.

        Args:
            articles: Articles to filter
            filter_criteria: Filter criteria text
            threshold: Confidence threshold

        Returns:
            Dict with filtered_articles, pass_count, fail_count, average_confidence
        """
        if not articles:
            raise ValueError("At least one article is required for testing")

        # Use SmartSearchService to filter articles
        filtered_articles, usage = await self.search_service.filter_articles_with_criteria(
            articles=articles,
            filter_condition=filter_criteria
        )

        # Apply threshold to determine pass/fail
        passing_articles = [
            fa for fa in filtered_articles
            if fa.passed and fa.confidence >= threshold
        ]

        pass_count = len(passing_articles)
        fail_count = len(filtered_articles) - pass_count

        # Calculate average confidence of passing articles
        average_confidence = (
            sum(fa.confidence for fa in passing_articles) / pass_count
            if pass_count > 0 else 0.0
        )

        return {
            'filtered_articles': filtered_articles,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'average_confidence': round(average_confidence, 3)
        }

    def update_channel_config_progress(
        self,
        stream_id: int,
        user_id: str,
        channel_name: str,
        completed_steps: List[str],
        configuration_data: Dict[str, Any]
    ) -> ResearchStream:
        """
        Update implementation configuration progress for a channel.

        Args:
            stream_id: Stream ID
            user_id: User ID
            channel_name: Channel name
            completed_steps: List of completed step IDs
            configuration_data: Configuration data for this channel

        Returns:
            Updated ResearchStream
        """
        # Verify stream and channel
        stream, channel = self.verify_stream_and_channel(stream_id, user_id, channel_name)

        # Get current workflow_config or create empty one
        workflow_config = stream.workflow_config or {}

        # Initialize or update configuration_history
        config_history = workflow_config.get('configuration_history', [])

        # Find existing entry for this channel or create new one
        channel_config = next(
            (entry for entry in config_history if entry.get('channel_name') == channel_name),
            None
        )

        from datetime import datetime
        if channel_config:
            # Update existing entry
            channel_config['completed_steps'] = completed_steps
            channel_config['configuration_data'] = configuration_data
            channel_config['last_updated'] = datetime.utcnow().isoformat()
        else:
            # Create new entry
            config_history.append({
                'channel_name': channel_name,
                'completed_steps': completed_steps,
                'configuration_data': configuration_data,
                'last_updated': datetime.utcnow().isoformat()
            })

        # Update workflow_config
        workflow_config['configuration_history'] = config_history
        workflow_config['implementation_config_status'] = 'draft'

        # Save to database
        updated_stream = self.stream_service.update_research_stream(
            stream_id,
            {'workflow_config': workflow_config}
        )

        return updated_stream

    def complete_implementation_config(
        self,
        stream_id: int,
        user_id: str
    ) -> ResearchStream:
        """
        Mark implementation configuration as complete.

        Validates that all channels have been configured.

        Args:
            stream_id: Stream ID
            user_id: User ID

        Returns:
            Updated ResearchStream

        Raises:
            ValueError: If configuration is incomplete
        """
        # Verify stream ownership
        stream = self.stream_service.get_research_stream(stream_id, user_id)
        if not stream:
            raise ValueError("Research stream not found")

        # Verify all channels have configuration
        workflow_config = stream.workflow_config or {}
        config_history = workflow_config.get('configuration_history', [])

        configured_channels = {entry['channel_name'] for entry in config_history}
        all_channels = {ch.get('name') for ch in stream.channels}

        missing_channels = all_channels - configured_channels
        if missing_channels:
            raise ValueError(f"Configuration incomplete. Missing channels: {', '.join(missing_channels)}")

        # Mark as complete
        workflow_config['implementation_config_status'] = 'complete'

        updated_stream = self.stream_service.update_research_stream(
            stream_id,
            {'workflow_config': workflow_config}
        )

        return updated_stream
