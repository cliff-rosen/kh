"""
Prompt Workbench Service

Handles business logic for:
- Stream enrichment config management
- Prompt testing with sample data or reports

Default prompts are sourced from ReportSummaryService (single source of truth).
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List

from models import Report, WipArticle
from schemas.research_stream import EnrichmentConfig, PromptTemplate, CategorizationPrompt, ResearchStream as ResearchStreamSchema
from schemas.llm import ModelConfig, DEFAULT_MODEL_CONFIG
from services.report_summary_service import ReportSummaryService, DEFAULT_PROMPTS, AVAILABLE_SLUGS
from services.research_stream_service import ResearchStreamService
from services.report_service import ReportService
from services.report_article_association_service import ReportArticleAssociationService
from services.article_categorization_service import ArticleCategorizationService

logger = logging.getLogger(__name__)


class PromptWorkbenchService:
    """Service for prompt workbench operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._summary_service = None  # Lazy-loaded - only needed for testing prompts
        self.stream_service = ResearchStreamService(db)
        self.report_service = ReportService(db)
        self.association_service = ReportArticleAssociationService(db)

    @property
    def summary_service(self) -> ReportSummaryService:
        """Lazy-load summary service only when needed (for LLM calls)"""
        if self._summary_service is None:
            self._summary_service = ReportSummaryService()
        return self._summary_service

    def _convert_to_prompt_templates(self, prompts_dict: Dict[str, Dict]) -> Dict[str, PromptTemplate]:
        """Convert dict-based prompts to PromptTemplate objects"""
        return {
            key: PromptTemplate(
                system_prompt=value["system_prompt"],
                user_prompt_template=value["user_prompt_template"]
            )
            for key, value in prompts_dict.items()
        }

    def get_defaults(self) -> Dict[str, Any]:
        """Get default prompts and available slugs"""
        return {
            "prompts": self._convert_to_prompt_templates(DEFAULT_PROMPTS),
            "available_slugs": AVAILABLE_SLUGS
        }

    async def get_enrichment_config(self, stream_id: int) -> Dict[str, Any]:
        """Get enrichment config for a stream"""
        raw_config = await self.stream_service.get_enrichment_config(stream_id)

        enrichment_config = None
        if raw_config:
            enrichment_config = EnrichmentConfig(**raw_config)

        return {
            "enrichment_config": enrichment_config,
            "is_using_defaults": enrichment_config is None,
            "defaults": self._convert_to_prompt_templates(DEFAULT_PROMPTS)
        }

    async def update_enrichment_config(
        self,
        stream_id: int,
        enrichment_config: Optional[EnrichmentConfig]
    ) -> None:
        """Update enrichment config for a stream"""
        config_dict = enrichment_config.dict() if enrichment_config else None
        logger.info(f"PromptWorkbenchService.update_enrichment_config: stream_id={stream_id}, config_dict={config_dict}")
        await self.stream_service.update_enrichment_config(stream_id, config_dict)

    async def test_summary_prompt(
        self,
        prompt_type: str,
        prompt: PromptTemplate,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        category_id: Optional[str] = None,
        article_index: Optional[int] = 0,
        llm_config: Optional[ModelConfig] = None
    ) -> Dict[str, Any]:
        """Test a summary prompt (executive, category, or article) with sample data or report data"""
        # Get context
        if report_id:
            context = await self._get_context_from_report(
                report_id, user_id, prompt_type, category_id, article_index
            )
        elif sample_data:
            context = sample_data
        else:
            raise ValueError("Either sample_data or report_id must be provided")

        # Render prompts
        rendered_system = self._render_prompt(prompt.system_prompt, context)
        rendered_user = self._render_prompt(prompt.user_prompt_template, context)

        # Run through LLM
        llm_response = await self._run_prompt_through_llm(rendered_system, rendered_user, llm_config)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": llm_response
        }

    async def _get_context_from_report(
        self,
        report_id: int,
        user_id: int,
        prompt_type: str,
        category_id: Optional[str] = None,
        article_index: Optional[int] = 0
    ) -> Dict[str, Any]:
        """Get context data from an existing report"""
        from fastapi import HTTPException

        # Get the report with access check (raises HTTPException if not found or no access)
        try:
            result = await self.report_service.get_report_with_access(report_id, user_id, raise_on_not_found=True)
            report, _, stream = result
        except HTTPException:
            raise PermissionError("You don't have access to this report")

        # Get articles that were included in the report
        wip_articles = await self.report_service.get_wip_articles_for_report(
            report_id, user_id, included_only=True
        )

        if prompt_type == "executive_summary":
            return self._build_executive_summary_context(stream, wip_articles, report)
        elif prompt_type == "category_summary":
            if not category_id:
                raise ValueError("category_id is required for category_summary prompt type")
            return self._build_category_summary_context(stream, wip_articles, category_id)
        elif prompt_type == "article_summary":
            return self._build_article_summary_context(stream, wip_articles, article_index or 0)
        else:
            raise ValueError(f"Unknown prompt type: {prompt_type}")

    def _build_executive_summary_context(
        self,
        stream: ResearchStreamSchema,
        wip_articles: List[WipArticle],
        report: Report
    ) -> Dict[str, Any]:
        """Build context for executive summary prompt"""
        articles_formatted = self._format_articles([
            {
                "title": a.title,
                "authors": a.authors[:3] if a.authors else [],
                "journal": a.journal,
                "year": a.year,
                "abstract": a.abstract[:500] if a.abstract else None
            }
            for a in wip_articles[:20]
        ])

        category_summaries = ""
        if report.enrichments and report.enrichments.get("category_summaries"):
            category_summaries = "\n\n".join([
                f"**{cat_id}**: {summary}"
                for cat_id, summary in report.enrichments["category_summaries"].items()
            ])

        # Get category count from presentation_config (which is a Pydantic model)
        category_count = 0
        if stream.presentation_config:
            category_count = len(stream.presentation_config.categories)

        return {
            "stream": {
                "name": stream.stream_name,
                "purpose": stream.purpose
            },
            "articles": {
                "count": len(wip_articles),
                "formatted": articles_formatted
            },
            "categories": {
                "count": category_count,
                "summaries": category_summaries
            }
        }

    def _build_category_summary_context(
        self,
        stream: ResearchStreamSchema,
        wip_articles: List[WipArticle],
        category_id: str
    ) -> Dict[str, Any]:
        """Build context for category summary prompt"""
        # presentation_config is a Pydantic model, categories is a list of Category objects
        categories = stream.presentation_config.categories if stream.presentation_config else []
        category = next((c for c in categories if c.id == category_id), None)
        if not category:
            raise ValueError(f"Category {category_id} not found in stream")

        category_articles = [
            a for a in wip_articles
            if a.presentation_categories and category_id in a.presentation_categories
        ]

        articles_formatted = self._format_articles([
            {
                "title": a.title,
                "authors": a.authors[:3] if a.authors else [],
                "journal": a.journal,
                "year": a.year,
                "abstract": a.abstract[:400] if a.abstract else None
            }
            for a in category_articles[:15]
        ])

        return {
            "stream": {
                "name": stream.stream_name,
                "purpose": stream.purpose
            },
            "category": {
                "name": category.name,
                "description": ", ".join(category.topics),
                "topics": category.topics
            },
            "articles": {
                "count": len(category_articles),
                "formatted": articles_formatted
            }
        }

    def _build_article_summary_context(
        self,
        stream: ResearchStreamSchema,
        wip_articles: List[WipArticle],
        article_index: int = 0
    ) -> Dict[str, Any]:
        """Build context for article summary prompt (uses specified article by index)"""
        if not wip_articles:
            raise ValueError("No articles available for testing")

        # Clamp article_index to valid range
        if article_index < 0 or article_index >= len(wip_articles):
            article_index = 0

        test_article = wip_articles[article_index]

        # Format authors
        authors = test_article.authors if test_article.authors else []
        if isinstance(authors, list):
            if len(authors) > 3:
                authors_str = ", ".join(authors[:3]) + " et al."
            else:
                authors_str = ", ".join(authors)
        else:
            authors_str = str(authors) if authors else "Unknown"

        return {
            "stream": {
                "name": stream.stream_name,
                "purpose": stream.purpose
            },
            "article": {
                "title": test_article.title or "Untitled",
                "authors": authors_str or "Unknown",
                "journal": test_article.journal or "Unknown",
                "year": str(test_article.year) if test_article.year else "Unknown",
                "abstract": test_article.abstract or ""
            }
        }

    def _format_articles(self, articles: List[Dict]) -> str:
        """Format articles for inclusion in LLM prompt"""
        formatted = []
        for i, article in enumerate(articles, 1):
            authors_str = ", ".join(article.get("authors", [])) if article.get("authors") else "Unknown"
            if len(article.get("authors", [])) > 3:
                authors_str += " et al."

            journal_year = []
            if article.get("journal"):
                journal_year.append(article["journal"])
            if article.get("year"):
                journal_year.append(f"({article['year']})")

            location = " ".join(journal_year) if journal_year else "Unknown source"
            formatted.append(f"{i}. {article.get('title', 'Unknown')}\n   {authors_str} - {location}")

            if article.get("abstract"):
                formatted.append(f"   Abstract: {article['abstract']}")

        return "\n\n".join(formatted)

    def _render_prompt(self, template: str, context: Dict[str, Any]) -> str:
        """Render a prompt template by replacing slugs with context values"""
        result = template

        for top_key, top_value in context.items():
            if isinstance(top_value, dict):
                for sub_key, sub_value in top_value.items():
                    slug = f"{{{top_key}.{sub_key}}}"
                    if isinstance(sub_value, list):
                        result = result.replace(slug, ", ".join(str(v) for v in sub_value))
                    else:
                        result = result.replace(slug, str(sub_value))
            else:
                slug = f"{{{top_key}}}"
                result = result.replace(slug, str(top_value))

        return result

    async def _run_prompt_through_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        llm_config: Optional[ModelConfig] = None
    ) -> str:
        """Run a prompt through the LLM"""
        # Use provided config or fall back to defaults
        config = llm_config or DEFAULT_MODEL_CONFIG
        model = config.model_id or self.summary_service.model
        temperature = config.temperature if config.temperature is not None else DEFAULT_MODEL_CONFIG.temperature
        max_tokens = config.max_tokens or DEFAULT_MODEL_CONFIG.max_tokens

        response = await self.summary_service.client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.choices[0].message.content

    # =========================================================================
    # Categorization Prompt Testing
    # =========================================================================

    async def test_categorization_prompt(
        self,
        prompt: CategorizationPrompt,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        article_index: int = 0,
        llm_config: Optional[ModelConfig] = None
    ) -> Dict[str, Any]:
        """
        Test a categorization prompt with sample data or an article from a report.

        Args:
            prompt: The categorization prompt to test
            user_id: User ID for access verification
            sample_data: Optional sample data with title, abstract, journal, year, categories_json
            report_id: Optional report ID to get an article from
            article_index: Which article to use from the report (default: first)

        Returns:
            Dict with rendered_system_prompt, rendered_user_prompt, llm_response,
            parsed_category_id, and error (if any)
        """
        import json

        if not sample_data and not report_id:
            raise ValueError("Either sample_data or report_id must be provided")

        # Get sample data from report if needed
        if report_id:
            sample_data = await self._get_categorization_context_from_report(
                report_id, user_id, article_index
            )

        # Render prompts
        rendered_system = prompt.system_prompt
        rendered_user = prompt.user_prompt_template
        for key, value in sample_data.items():
            rendered_user = rendered_user.replace(f"{{{key}}}", str(value))

        # Call categorization service
        categorization_service = ArticleCategorizationService()

        result = await categorization_service.categorize(
            items=sample_data,
            model_config=llm_config,
            custom_prompt=prompt
        )

        # Extract response
        llm_response = None
        parsed_category_id = None
        error = None

        if result.error:
            error = result.error
        elif result.data:
            parsed_category_id = result.data.get("category_id")
            llm_response = json.dumps(result.data, indent=2)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": llm_response,
            "parsed_category_id": parsed_category_id,
            "error": error
        }

    async def _get_categorization_context_from_report(
        self,
        report_id: int,
        user_id: int,
        article_index: int = 0
    ) -> Dict[str, Any]:
        """
        Get categorization context data from an existing report.

        Args:
            report_id: Report ID
            user_id: User ID for access verification
            article_index: Which article to use (0-indexed)

        Returns:
            Dict with title, abstract, journal, year, categories_json
        """
        import json

        # Get the report with access check (returns report, user, stream)
        try:
            result = await self.report_service.get_report_with_access(
                report_id, user_id, raise_on_not_found=True
            )
            _, _, stream = result
        except Exception:
            raise PermissionError("You don't have access to this report")

        # Get visible articles via the association service
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise ValueError("Report has no articles")

        # Get the requested article
        if article_index >= len(associations):
            article_index = 0

        assoc = associations[article_index]
        article = assoc.article

        if not article:
            raise ValueError("Article not found")

        # Get categories from stream presentation_config (it's a dict from JSON column)
        categories_for_context = []
        if stream.presentation_config and isinstance(stream.presentation_config, dict):
            categories = stream.presentation_config.get("categories", [])
            if categories:
                # Categories are already dicts with id, name, topics, specific_inclusions
                # Just extract the fields we need for the LLM context
                categories_for_context = [
                    {
                        "id": cat.get("id", ""),
                        "name": cat.get("name", ""),
                        "topics": cat.get("topics", []),
                        "specific_inclusions": cat.get("specific_inclusions", []),
                    }
                    for cat in categories
                ]

        return {
            "title": article.title or "",
            "abstract": article.abstract or "",
            "ai_summary": assoc.ai_summary or "",  # Include AI summary if available
            "journal": article.journal or "",
            "year": str(article.year) if article.year else "",
            "categories_json": json.dumps(categories_for_context, indent=2)
        }


# Dependency injection provider for async prompt workbench service
from fastapi import Depends
from database import get_async_db


async def get_prompt_workbench_service(
    db: AsyncSession = Depends(get_async_db)
) -> PromptWorkbenchService:
    """Get a PromptWorkbenchService instance with async database session."""
    return PromptWorkbenchService(db)
