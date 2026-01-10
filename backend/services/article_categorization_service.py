"""
Article Categorization Service - AI-powered article categorization

This service provides article categorization capabilities using LLMs to assign
articles to presentation categories. Used by pipeline execution and can be used
standalone for ad-hoc categorization tasks.
"""

from typing import List, Dict, Any, Tuple, Optional, TYPE_CHECKING
from datetime import datetime
import json
import asyncio
import logging

from models import WipArticle, Article
from schemas.research_stream import Category

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from schemas.canonical_types import CanonicalResearchArticle


class ArticleCategorizationService:
    """Service for categorizing articles into presentation categories using LLM"""

    async def categorize_article(
        self,
        article_title: str,
        article_abstract: str,
        article_journal: str = None,
        article_year: str = None,
        categories: List[Dict] = None
    ) -> str:
        """
        Use LLM to assign ONE presentation category to an article.

        Args:
            article_title: Title of the article
            article_abstract: Abstract text
            article_journal: Journal name (optional)
            article_year: Publication year (optional)
            categories: List of category definitions with id, name, topics, specific_inclusions

        Returns:
            Single category ID that best fits this article, or None if no good fit
        """
        if not categories:
            return None

        # Prepare article content
        article_content = f"""
        Title: {article_title}
        Abstract: {article_abstract or 'N/A'}
        Journal: {article_journal or 'N/A'}
        Year: {article_year or 'N/A'}
        """

        # Prepare prompt
        prompt = f"""You are categorizing a research article into presentation categories for a user report.

        ARTICLE:
        {article_content}

        AVAILABLE CATEGORIES:
        {json.dumps(categories, indent=2)}

        Analyze the article and determine which ONE category it belongs to. Each article should be placed in exactly one category - choose the category that best fits the article's primary focus.

        If the article clearly doesn't fit any category, return null for the category_id.

        Respond with JSON:
        {{
            "category_id": "the_best_matching_category_id"
        }}

        Or if no good fit:
        {{
            "category_id": null
        }}
        """

        # Call LLM using BasePromptCaller
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        response_schema = {
            "type": "object",
            "properties": {
                "category_id": {
                    "type": ["string", "null"],
                    "description": "The single category ID that best fits this article, or null if no good fit"
                }
            },
            "required": ["category_id"]
        }

        system_prompt = "You are categorizing research articles into presentation categories for user reports."

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

        return response_data.get("category_id", None)

    async def categorize_wip_article(
        self,
        article: WipArticle,
        categories: List[Dict]
    ) -> str:
        """
        Categorize a WipArticle into ONE presentation category.

        Args:
            article: WipArticle instance
            categories: List of category definitions

        Returns:
            Single category ID that best fits this article, or None
        """
        return await self.categorize_article(
            article_title=article.title,
            article_abstract=article.abstract,
            article_journal=article.journal,
            article_year=article.year,
            categories=categories
        )

    async def categorize_regular_article(
        self,
        article: Article,
        categories: List[Dict]
    ) -> str:
        """
        Categorize a regular Article into ONE presentation category.

        Args:
            article: Article instance
            categories: List of category definitions

        Returns:
            Single category ID that best fits this article, or None
        """
        return await self.categorize_article(
            article_title=article.title,
            article_abstract=article.abstract,
            article_journal=article.journal,
            article_year=article.year,
            categories=categories
        )

    @staticmethod
    def prepare_category_definitions(categories: List[Category]) -> List[Dict]:
        """
        Convert Category schema objects to dictionary format for LLM.

        Args:
            categories: List of Category schema objects

        Returns:
            List of category dictionaries with id, name, topics, specific_inclusions
        """
        categories_desc = []
        for cat in categories:
            cat_info = {
                "id": cat.id,
                "name": cat.name,
                "topics": cat.topics,
                "specific_inclusions": cat.specific_inclusions
            }
            categories_desc.append(cat_info)
        return categories_desc

    async def categorize_articles_batch(
        self,
        articles: List[Any],
        categories: List[Dict],
        max_concurrent: int = 10,
        on_progress: Optional[callable] = None
    ) -> List[Tuple[Any, str]]:
        """
        Categorize multiple articles in parallel with rate limiting.

        This method processes articles concurrently to improve performance while
        respecting LLM API rate limits through semaphore-based concurrency control.

        Args:
            articles: List of article objects (WipArticle, Article, CanonicalResearchArticle, or dict-like)
            categories: List of category definitions with id, name, topics, specific_inclusions
            max_concurrent: Maximum number of concurrent LLM categorizations (default: 10)
            on_progress: Optional callback(completed, total) called after each item completes

        Returns:
            List of tuples: (article, assigned_category_id)
            Each article gets exactly one category ID (or None).
            Results are in the same order as input articles.
        """
        if not articles or not categories:
            logger.info("categorize_articles_batch called with empty articles or categories")
            return [(article, None) for article in articles]

        logger.info(f"Starting batch categorization of {len(articles)} articles into {len(categories)} categories")

        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(max_concurrent)
        errors = 0

        async def categorize_single(idx: int, article: Any) -> Tuple[int, Any, str]:
            """Categorize a single article with rate limiting"""
            nonlocal errors
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

                    assigned_category = await self.categorize_article(
                        article_title=title,
                        article_abstract=abstract or "",
                        article_journal=journal,
                        article_year=str(year) if year else None,
                        categories=categories
                    )
                    return idx, article, assigned_category
                except Exception as e:
                    errors += 1
                    article_id = getattr(article, 'id', getattr(article, 'pmid', idx))
                    logger.error(f"Failed to categorize article {article_id}: {type(e).__name__}: {e}")
                    return idx, article, None

        # Execute with as_completed for progress reporting
        tasks = [categorize_single(i, article) for i, article in enumerate(articles)]
        results_by_idx = {}
        completed = 0

        for coro in asyncio.as_completed(tasks):
            idx, article, category = await coro
            results_by_idx[idx] = (article, category)

            completed += 1
            if on_progress:
                try:
                    await on_progress(completed, len(articles))
                except Exception as cb_err:
                    logger.warning(f"Progress callback failed: {cb_err}")

        logger.info(f"Batch categorization complete: {len(articles)} articles, {errors} errors")

        # Build final results in original order
        results = [results_by_idx[i] for i in range(len(articles))]

        # Return tuple of (results, error_count) for pipeline to report
        return results, errors

    async def categorize_wip_articles_batch(
        self,
        articles: List[WipArticle],
        categories: List[Dict],
        max_concurrent: int = 10,
        on_progress: Optional[callable] = None
    ) -> Tuple[List[Tuple[WipArticle, str]], int]:
        """
        Categorize multiple WipArticles in parallel.

        Args:
            articles: List of WipArticle instances
            categories: List of category definitions
            max_concurrent: Maximum number of concurrent categorizations
            on_progress: Optional callback(completed, total) called after each item completes

        Returns:
            Tuple of (results, error_count) where results is a list of (article, category_id) tuples.
            Each article gets exactly one category ID (or None if categorization failed).
        """
        return await self.categorize_articles_batch(
            articles=articles,
            categories=categories,
            max_concurrent=max_concurrent,
            on_progress=on_progress
        )

    async def categorize_canonical_articles_batch(
        self,
        articles: List['CanonicalResearchArticle'],
        categories: List[Dict],
        max_concurrent: int = 10
    ) -> Tuple[List[Tuple['CanonicalResearchArticle', str]], int]:
        """
        Categorize multiple CanonicalResearchArticles in parallel.

        Args:
            articles: List of CanonicalResearchArticle instances
            categories: List of category definitions
            max_concurrent: Maximum number of concurrent categorizations

        Returns:
            Tuple of (results, error_count) where results is a list of (article, category_id) tuples.
            Each article gets exactly one category ID (or None if categorization failed).
        """
        return await self.categorize_articles_batch(
            articles=articles,
            categories=categories,
            max_concurrent=max_concurrent
        )
