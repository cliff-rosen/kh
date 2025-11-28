"""
Semantic Filter Service - AI-powered article relevance evaluation

This service provides semantic filtering capabilities using LLMs to evaluate
whether articles meet specific relevance criteria. Used by pipeline execution
and can be used standalone for ad-hoc filtering tasks.
"""

from typing import Tuple, List, Any
from datetime import datetime
import asyncio

from models import WipArticle, Article


class SemanticFilterService:
    """Service for evaluating article relevance using semantic filtering"""

    async def evaluate_article_relevance(
        self,
        article_title: str,
        article_abstract: str,
        article_journal: str = None,
        article_year: str = None,
        filter_criteria: str = "",
        threshold: float = 0.7
    ) -> Tuple[bool, float, str]:
        """
        Use LLM to evaluate if an article meets semantic filter criteria.

        Args:
            article_title: Title of the article
            article_abstract: Abstract text
            article_journal: Journal name (optional)
            article_year: Publication year (optional)
            filter_criteria: Natural language description of relevance criteria
            threshold: Minimum score (0-1) for article to pass filter

        Returns:
            Tuple of (is_relevant, score, reasoning)
        """
        # Prepare article content
        article_content = f"""
        Title: {article_title}

        Abstract: {article_abstract or 'N/A'}

        Journal: {article_journal or 'N/A'}
        Year: {article_year or 'N/A'}
        """

        # Prepare prompt for LLM
        prompt = f"""You are evaluating whether a research article is relevant based on specific criteria.

        FILTER CRITERIA:
        {filter_criteria}

        ARTICLE:
        {article_content}

        Evaluate whether this article meets the filter criteria. Consider the title, abstract, and context.

        Respond with:
        1. A relevance score from 0.0 to 1.0 (where 1.0 is highly relevant)
        2. A brief explanation (2-3 sentences) of why the article does or does not meet the criteria

        Format your response as JSON:
        {{
            "score": 0.0 to 1.0,
            "reasoning": "explanation here"
        }}
        """

        # Call LLM using BasePromptCaller
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

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
        if hasattr(llm_response, 'model_dump'):
            response_data = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_data = llm_response.dict()
        else:
            response_data = llm_response

        score = response_data.get("score", 0)
        reasoning = response_data.get("reasoning", "")

        is_relevant = score >= threshold
        return is_relevant, score, reasoning

    async def evaluate_wip_article(
        self,
        article: WipArticle,
        filter_criteria: str,
        threshold: float = 0.7
    ) -> Tuple[bool, float, str]:
        """
        Evaluate a WipArticle using semantic filtering.

        Args:
            article: WipArticle instance
            filter_criteria: Natural language description of relevance criteria
            threshold: Minimum score for article to pass

        Returns:
            Tuple of (is_relevant, score, reasoning)
        """
        return await self.evaluate_article_relevance(
            article_title=article.title,
            article_abstract=article.abstract,
            article_journal=article.journal,
            article_year=article.year,
            filter_criteria=filter_criteria,
            threshold=threshold
        )

    async def evaluate_article(
        self,
        article: Article,
        filter_criteria: str,
        threshold: float = 0.7
    ) -> Tuple[bool, float, str]:
        """
        Evaluate an Article using semantic filtering.

        Args:
            article: Article instance
            filter_criteria: Natural language description of relevance criteria
            threshold: Minimum score for article to pass

        Returns:
            Tuple of (is_relevant, score, reasoning)
        """
        return await self.evaluate_article_relevance(
            article_title=article.title,
            article_abstract=article.abstract,
            article_journal=article.journal,
            article_year=article.year,
            filter_criteria=filter_criteria,
            threshold=threshold
        )

    async def evaluate_articles_batch(
        self,
        articles: List[Any],
        filter_criteria: str,
        threshold: float = 0.7,
        max_concurrent: int = 10
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
                    # Extract article attributes (works with WipArticle, Article, CanonicalResearchArticle, or dict)
                    if hasattr(article, 'title'):
                        title = article.title
                        abstract = getattr(article, 'abstract', None)
                        journal = getattr(article, 'journal', None)
                        year = getattr(article, 'year', None)
                    elif isinstance(article, dict):
                        title = article.get('title', '')
                        abstract = article.get('abstract')
                        journal = article.get('journal')
                        year = article.get('year')
                    else:
                        raise ValueError(f"Unsupported article type: {type(article)}")

                    is_relevant, score, reasoning = await self.evaluate_article_relevance(
                        article_title=title,
                        article_abstract=abstract or "",
                        article_journal=journal,
                        article_year=str(year) if year else None,
                        filter_criteria=filter_criteria,
                        threshold=threshold
                    )
                    return article, is_relevant, score, reasoning
                except Exception as e:
                    # On error, reject the article with error message
                    return article, False, 0.0, f"Evaluation failed: {str(e)}"

        # Execute all evaluations in parallel
        results = await asyncio.gather(
            *[evaluate_single(article) for article in articles],
            return_exceptions=False
        )

        return results

    async def evaluate_wip_articles_batch(
        self,
        articles: List[WipArticle],
        filter_criteria: str,
        threshold: float = 0.7,
        max_concurrent: int = 10
    ) -> List[Tuple[WipArticle, bool, float, str]]:
        """
        Evaluate multiple WipArticles in parallel.

        Args:
            articles: List of WipArticle instances
            filter_criteria: Natural language description of relevance criteria
            threshold: Minimum score for article to pass
            max_concurrent: Maximum number of concurrent evaluations

        Returns:
            List of tuples: (article, is_relevant, score, reasoning)
        """
        return await self.evaluate_articles_batch(
            articles=articles,
            filter_criteria=filter_criteria,
            threshold=threshold,
            max_concurrent=max_concurrent
        )
