"""
Article Categorization Service - AI-powered article categorization

This service provides article categorization capabilities using LLMs to assign
articles to presentation categories. Used by pipeline execution and can be used
standalone for ad-hoc categorization tasks.
"""

from typing import List, Dict
from datetime import datetime
import json

from models import WipArticle, Article
from schemas.research_stream import Category


class ArticleCategorizationService:
    """Service for categorizing articles into presentation categories using LLM"""

    async def categorize_article(
        self,
        article_title: str,
        article_abstract: str,
        article_journal: str = None,
        article_year: str = None,
        categories: List[Dict] = None
    ) -> List[str]:
        """
        Use LLM to assign presentation categories to an article.

        Args:
            article_title: Title of the article
            article_abstract: Abstract text
            article_journal: Journal name (optional)
            article_year: Publication year (optional)
            categories: List of category definitions with id, name, topics, specific_inclusions

        Returns:
            List of category IDs that apply to this article
        """
        if not categories:
            return []

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

Analyze the article and determine which categories it belongs to. An article can belong to multiple categories or none.

Return the list of category IDs that apply. Return an empty list if none apply.

Respond with JSON:
{{
    "category_ids": ["category_id_1", "category_id_2", ...]
}}
"""

        # Call LLM using BasePromptCaller
        from schemas.chat import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        response_schema = {
            "type": "object",
            "properties": {
                "category_ids": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["category_ids"]
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

        return response_data.get("category_ids", [])

    async def categorize_wip_article(
        self,
        article: WipArticle,
        categories: List[Dict]
    ) -> List[str]:
        """
        Categorize a WipArticle into presentation categories.

        Args:
            article: WipArticle instance
            categories: List of category definitions

        Returns:
            List of category IDs that apply to this article
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
    ) -> List[str]:
        """
        Categorize a regular Article into presentation categories.

        Args:
            article: Article instance
            categories: List of category definitions

        Returns:
            List of category IDs that apply to this article
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
