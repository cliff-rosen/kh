"""
Prompt Workbench Service

Handles business logic for:
- Stream enrichment config management
- Prompt testing with sample data or reports

Default prompts are sourced from ReportSummaryService (single source of truth).
"""

import logging
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List

from models import Report, WipArticle
from schemas.research_stream import EnrichmentConfig, PromptTemplate, ResearchStream as ResearchStreamSchema
from services.report_summary_service import ReportSummaryService, DEFAULT_PROMPTS, AVAILABLE_SLUGS
from services.research_stream_service import ResearchStreamService
from services.report_service import ReportService

logger = logging.getLogger(__name__)


class PromptWorkbenchService:
    """Service for prompt workbench operations"""

    def __init__(self, db: Session):
        self.db = db
        self.summary_service = ReportSummaryService()
        self.stream_service = ResearchStreamService(db)
        self.report_service = ReportService(db)

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

    def get_enrichment_config(self, stream_id: int) -> Dict[str, Any]:
        """Get enrichment config for a stream"""
        raw_config = self.stream_service.get_enrichment_config(stream_id)

        enrichment_config = None
        if raw_config:
            enrichment_config = EnrichmentConfig(**raw_config)

        return {
            "enrichment_config": enrichment_config,
            "is_using_defaults": enrichment_config is None,
            "defaults": self._convert_to_prompt_templates(DEFAULT_PROMPTS)
        }

    def update_enrichment_config(
        self,
        stream_id: int,
        enrichment_config: Optional[EnrichmentConfig]
    ) -> None:
        """Update enrichment config for a stream"""
        config_dict = enrichment_config.dict() if enrichment_config else None
        self.stream_service.update_enrichment_config(stream_id, config_dict)

    async def test_prompt(
        self,
        prompt_type: str,
        prompt: PromptTemplate,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        category_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Test a prompt with sample data or report data"""
        # Get context
        if report_id:
            context = self._get_context_from_report(
                report_id, user_id, prompt_type, category_id
            )
        elif sample_data:
            context = sample_data
        else:
            raise ValueError("Either sample_data or report_id must be provided")

        # Render prompts
        rendered_system = self._render_prompt(prompt.system_prompt, context)
        rendered_user = self._render_prompt(prompt.user_prompt_template, context)

        # Run through LLM
        llm_response = await self._run_prompt_through_llm(rendered_system, rendered_user)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": llm_response
        }

    def _get_context_from_report(
        self,
        report_id: int,
        user_id: int,
        prompt_type: str,
        category_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get context data from an existing report"""
        from fastapi import HTTPException

        # Get the report
        report = self.db.query(Report).filter(Report.report_id == report_id).first()
        if not report:
            raise ValueError("Report not found")

        # Verify user has access via ResearchStreamService
        try:
            stream = self.stream_service.get_research_stream(report.research_stream_id, user_id)
        except HTTPException:
            raise PermissionError("You don't have access to this report")

        # Get articles that were included in the report
        wip_articles = self.report_service.get_wip_articles_for_report(
            report_id, user_id, included_only=True
        )

        if prompt_type == "executive_summary":
            return self._build_executive_summary_context(stream, wip_articles, report)
        elif prompt_type == "category_summary":
            if not category_id:
                raise ValueError("category_id is required for category_summary prompt type")
            return self._build_category_summary_context(stream, wip_articles, category_id)
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

    async def _run_prompt_through_llm(self, system_prompt: str, user_prompt: str) -> str:
        """Run a prompt through the LLM"""
        response = await self.summary_service.client.chat.completions.create(
            model=self.summary_service.model,
            max_tokens=2000,
            temperature=0.3,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        return response.choices[0].message.content
