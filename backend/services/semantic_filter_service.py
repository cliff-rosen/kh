"""
Semantic Filter Service - AI-powered article relevance evaluation

This service provides semantic filtering capabilities using LLMs to evaluate
whether articles meet specific relevance criteria. Used by pipeline execution
and can be used standalone for ad-hoc filtering tasks.

Supports two modes:
1. Simple criteria: "Is this about cancer treatment?" - article content added automatically
2. Template with slugs: "Based on {title}, classify the study design" - slugs replaced with article data
"""

import re
import logging
from typing import Tuple, List, Any, Dict
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class SemanticFilterService:
    """Service for evaluating article relevance using semantic filtering"""

    # Regex to find slug patterns like {title}, {abstract}, etc.
    SLUG_PATTERN = re.compile(r'\{(\w+)\}')

    def _has_slugs(self, template: str) -> bool:
        """Check if the template contains slug patterns like {title}"""
        return bool(self.SLUG_PATTERN.search(template))

    def _replace_slugs(self, template: str, article_data: Dict[str, str]) -> str:
        """Replace slugs in template with article data"""
        def replace_match(match):
            key = match.group(1)
            return article_data.get(key, f'[{key} not available]')
        return self.SLUG_PATTERN.sub(replace_match, template)

    async def _evaluate_single(
        self,
        article_title: str,
        article_abstract: str,
        article_journal: str = None,
        article_year: str = None,
        filter_criteria: str = "",
        threshold: float = 0.7,
        article_data: Dict[str, str] = None,
        output_type: str = "boolean"
    ) -> Tuple[bool, float, str, str]:
        """
        Evaluate a single article against filter criteria using LLM.
        Private method - use batch methods for production code.

        Supports two modes:
        1. Simple criteria: "Is this about cancer treatment?" - article content added automatically
        2. Template with slugs: "Based on {title}, classify the study design" - slugs replaced with article data

        Args:
            article_title: Title of the article
            article_abstract: Abstract text
            article_journal: Journal name (optional)
            article_year: Publication year (optional)
            filter_criteria: Natural language description of relevance criteria (may contain {slugs})
            threshold: Minimum score (0-1) for article to pass filter
            article_data: Dict of field name -> value for slug replacement
            output_type: Expected output type ('boolean', 'number', or 'text')

        Returns:
            Tuple of (is_relevant, score, reasoning, text_value)
            - text_value is the actual text answer for text output type, empty string otherwise
        """
        # Build article data dict if not provided
        if article_data is None:
            article_data = {
                'title': article_title or '',
                'abstract': article_abstract or 'N/A',
                'journal': article_journal or 'N/A',
                'year': article_year or 'N/A',
                'publication_date': article_year or 'N/A',  # alias
            }

        # Build output-type-specific response instructions
        if output_type == "boolean":
            response_instruction = """Respond with:
            1. A confidence score from 0.0 to 1.0 (where 1.0 is highest confidence in Yes)
            2. Your reasoning explaining why Yes or No

            Format your response as JSON:
            {
                "score": 0.0 to 1.0,
                "reasoning": "Yes/No with explanation"
            }"""
        elif output_type == "number":
            response_instruction = """Respond with:
            1. A numerical score from 0.0 to 1.0 representing your evaluation
            2. Your reasoning explaining the score

            Format your response as JSON:
            {
                "score": 0.0 to 1.0,
                "reasoning": "explanation of the score"
            }"""
        else:  # text
            response_instruction = """Respond with:
            1. Your text answer or classification (the actual value requested)
            2. A confidence score from 0.0 to 1.0 (where 1.0 is highest confidence)
            3. Brief reasoning explaining your answer

            Format your response as JSON:
            {
                "text_value": "your answer/classification here",
                "score": 0.0 to 1.0,
                "reasoning": "brief explanation"
            }"""

        # Check if criteria contains template slugs like {title}, {abstract}
        if self._has_slugs(filter_criteria):
            # Template mode: replace slugs with article data and use as user prompt
            user_prompt = self._replace_slugs(filter_criteria, article_data)
            prompt = f"""You are analyzing a research article. Follow the instructions below and respond.

            {user_prompt}

            {response_instruction}
            """
        else:
            # Simple criteria mode: prepend article content
            article_content = f"""
            Title: {article_title}

            Abstract: {article_abstract or 'N/A'}

            Journal: {article_journal or 'N/A'}
            Year: {article_year or 'N/A'}
            """

            prompt = f"""You are evaluating whether a research article is relevant based on specific criteria.

            FILTER CRITERIA:
            {filter_criteria}

            ARTICLE:
            {article_content}

            Evaluate whether this article meets the filter criteria. Consider the title, abstract, and context.

            {response_instruction}
            """

        # Call LLM using BasePromptCaller
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        # Build response schema based on output type
        if output_type == "text":
            response_schema = {
                "type": "object",
                "properties": {
                    "text_value": {"type": "string"},
                    "score": {"type": "number", "minimum": 0, "maximum": 1},
                    "reasoning": {"type": "string"}
                },
                "required": ["text_value", "score", "reasoning"]
            }
        else:
            response_schema = {
                "type": "object",
                "properties": {
                    "score": {"type": "number", "minimum": 0, "maximum": 1},
                    "reasoning": {"type": "string"}
                },
                "required": ["score", "reasoning"]
            }

        system_prompt = "You are evaluating research articles for relevance based on semantic filter criteria."

        task_config = get_task_config("smart_search", "keyword_generation")
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=0.3,
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=prompt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        result = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=True
        )

        # Extract result
        llm_response = result.result
        logger.info(f"LLM raw response type: {type(llm_response)}")

        if hasattr(llm_response, 'model_dump'):
            response_data = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_data = llm_response.dict()
        elif isinstance(llm_response, dict):
            response_data = llm_response
        elif isinstance(llm_response, str):
            # Try to parse as JSON if it's a string
            import json
            try:
                response_data = json.loads(llm_response)
            except json.JSONDecodeError:
                logger.error(f"Failed to parse LLM response as JSON: {llm_response[:200]}")
                response_data = {}
        else:
            logger.warning(f"Unexpected LLM response type: {type(llm_response)}, value: {llm_response}")
            response_data = {}

        logger.info(f"Parsed response_data: {response_data}")

        score = response_data.get("score", 0) if isinstance(response_data, dict) else 0
        reasoning = response_data.get("reasoning", "") if isinstance(response_data, dict) else ""
        text_value = response_data.get("text_value", "") if isinstance(response_data, dict) else ""

        # Ensure score is a number
        if not isinstance(score, (int, float)):
            logger.warning(f"Score is not a number: {score} (type: {type(score)})")
            try:
                score = float(score)
            except (ValueError, TypeError):
                score = 0

        logger.info(f"Final score: {score}, reasoning preview: {reasoning[:100] if reasoning else 'None'}...")

        is_relevant = score >= threshold
        return is_relevant, score, reasoning, text_value

    async def evaluate_articles_batch(
        self,
        articles: List[Any],
        filter_criteria: str,
        threshold: float = 0.7,
        max_concurrent: int = 10,
        output_type: str = "boolean"
    ) -> List[Tuple[Any, bool, float, str]]:
        """
        Evaluate multiple articles in parallel with rate limiting.

        This method processes articles concurrently to improve performance while
        respecting LLM API rate limits through semaphore-based concurrency control.

        Args:
            articles: List of article objects (WipArticle, Article, or dict-like with title/abstract)
            filter_criteria: Natural language description of relevance criteria
            threshold: Minimum score (0-1) for article to pass filter
            max_concurrent: Maximum number of concurrent LLM evaluations (default: 10)
            output_type: Expected output type ('boolean', 'number', or 'text')

        Returns:
            List of tuples: (article, is_relevant, score, reasoning)
            Results are in the same order as input articles.
        """
        if not articles:
            return []

        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(max_concurrent)

        async def evaluate_single(article: Any) -> Tuple[Any, bool, float, str]:
            """Evaluate a single article with rate limiting"""
            async with semaphore:
                try:
                    # Extract article attributes (works with WipArticle, Article, CanonicalResearchArticle, TrialAdapter, or dict)
                    if hasattr(article, 'title'):
                        title = article.title
                        abstract = getattr(article, 'abstract', None)
                        journal = getattr(article, 'journal', None)
                        year = getattr(article, 'year', None)
                        pmid = getattr(article, 'pmid', None)
                        doi = getattr(article, 'doi', None)
                        authors = getattr(article, 'authors', None)
                        publication_date = getattr(article, 'publication_date', None)
                    elif isinstance(article, dict):
                        title = article.get('title', '')
                        abstract = article.get('abstract')
                        journal = article.get('journal')
                        year = article.get('year')
                        pmid = article.get('pmid')
                        doi = article.get('doi')
                        authors = article.get('authors')
                        publication_date = article.get('publication_date')
                    else:
                        raise ValueError(f"Unsupported article type: {type(article)}")

                    # Build article_data dict for slug replacement
                    # Start with common fields
                    article_data = {
                        'title': title or '',
                        'abstract': abstract or 'N/A',
                        'journal': journal or 'N/A',
                        'year': str(year) if year else 'N/A',
                        'pmid': pmid or 'N/A',
                        'doi': doi or 'N/A',
                        'authors': ', '.join(authors) if isinstance(authors, list) else (authors or 'N/A'),
                        'publication_date': publication_date or str(year) if year else 'N/A',
                    }

                    # Extract additional attributes for slug replacement (e.g., trial-specific fields)
                    # This allows templates like "{nct_id}", "{phase}", "{conditions}" etc.
                    if hasattr(article, '__dict__'):
                        for key, value in article.__dict__.items():
                            if key.startswith('_') or key in article_data or key == 'trial':
                                continue  # Skip private attrs, already-added fields, and nested objects
                            if isinstance(value, str):
                                article_data[key] = value or 'N/A'
                            elif isinstance(value, (int, float)):
                                article_data[key] = str(value)
                            elif isinstance(value, list) and all(isinstance(v, str) for v in value):
                                article_data[key] = ', '.join(value) if value else 'N/A'
                    elif isinstance(article, dict):
                        for key, value in article.items():
                            if key in article_data:
                                continue
                            if isinstance(value, str):
                                article_data[key] = value or 'N/A'
                            elif isinstance(value, (int, float)):
                                article_data[key] = str(value)

                    is_relevant, score, reasoning, text_value = await self._evaluate_single(
                        article_title=title,
                        article_abstract=abstract or "",
                        article_journal=journal,
                        article_year=str(year) if year else None,
                        filter_criteria=filter_criteria,
                        threshold=threshold,
                        article_data=article_data,
                        output_type=output_type
                    )
                    # For text output type, use text_value as the reasoning (it's the actual answer)
                    final_reasoning = text_value if output_type == "text" and text_value else reasoning
                    return article, is_relevant, score, final_reasoning
                except Exception as e:
                    # On error, reject the article with error message
                    return article, False, 0.0, f"Evaluation failed: {str(e)}"

        # Execute all evaluations in parallel
        results = await asyncio.gather(
            *[evaluate_single(article) for article in articles],
            return_exceptions=False
        )

        return results

