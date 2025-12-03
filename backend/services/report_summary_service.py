"""
Report Summary Service - Generates executive summaries for reports using LLM

This service generates:
1. Executive summary for all articles in the report
2. Category-specific summaries for each presentation category

Supports custom prompts via enrichment_config with slug replacement.
"""

from typing import List, Dict, Tuple, Optional, Any
from openai import AsyncOpenAI
import httpx


# =============================================================================
# Default Prompts - Single source of truth for all prompt defaults
# =============================================================================

DEFAULT_PROMPTS = {
    "executive_summary": {
        "system_prompt": """You are an expert research analyst who specializes in synthesizing scientific literature.

        Your task is to write a concise executive summary of a research report.

        The summary should:
        - Be 3-5 paragraphs (200-400 words total)
        - Highlight the most important findings and trends
        - Identify key themes across the literature
        - Note any significant developments or breakthroughs
        - Be written for an executive audience (technical but accessible)
        - Focus on insights and implications, not just listing papers

        Write in a professional, analytical tone. Include only the summary with no heading or other text.""",
        "user_prompt_template": """Generate an executive summary for this research report.

        # Research Stream Purpose
        {stream.purpose}

        # Report Statistics
        - Total articles: {articles.count}
        - Categories covered: {categories.count}

        # Category Summaries
        {categories.summaries}

        # Sample Articles (representative of the full report)
        {articles.formatted}

        Generate a comprehensive executive summary that synthesizes the key findings and themes across all articles."""
        },
    "category_summary": {
        "system_prompt": """You are an expert research analyst synthesizing scientific literature.

        Your task is to write a concise summary of articles in the "{category.name}" category.

        The summary should:
        - Be 2-3 paragraphs (150-250 words total)
        - Identify the main themes and findings in this category
        - Highlight the most significant or impactful articles
        - Note any emerging trends or patterns
        - Be written for a technical audience familiar with the field

        Write in a professional, analytical tone.""",
        "user_prompt_template": """Generate a summary for the "{category.name}" category.

        # Category Description
        {category.description}

        # Research Stream Purpose
        {stream.purpose}

        # Articles in This Category ({articles.count} total)
        {articles.formatted}

        Generate a focused summary that captures the key insights from articles in this category."""
    }
}

AVAILABLE_SLUGS = {
    "executive_summary": [
        {"slug": "{stream.name}", "description": "Name of the research stream"},
        {"slug": "{stream.purpose}", "description": "Purpose/description of the stream"},
        {"slug": "{articles.count}", "description": "Total number of articles in the report"},
        {"slug": "{articles.formatted}", "description": "Formatted list of articles (title, authors, journal, year, abstract)"},
        {"slug": "{categories.count}", "description": "Number of categories in the report"},
        {"slug": "{categories.summaries}", "description": "Formatted category summaries (if available)"},
    ],
    "category_summary": [
        {"slug": "{stream.name}", "description": "Name of the research stream"},
        {"slug": "{stream.purpose}", "description": "Purpose/description of the stream"},
        {"slug": "{category.name}", "description": "Name of the current category"},
        {"slug": "{category.description}", "description": "Description of what this category covers"},
        {"slug": "{category.topics}", "description": "List of topics in this category"},
        {"slug": "{articles.count}", "description": "Number of articles in this category"},
        {"slug": "{articles.formatted}", "description": "Formatted list of articles in this category"},
    ]
}


class ReportSummaryService:
    """Service for generating report summaries using LLM"""

    def __init__(self):
        # Create httpx client with higher connection limits
        http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
            ),
            timeout=httpx.Timeout(120.0)  # 2 minute timeout for summaries
        )
        self.client = AsyncOpenAI(http_client=http_client)
        self.model = "gpt-4.1"  # Use gpt-4.1 which supports temperature for summarization

    async def generate_executive_summary(
        self,
        wip_articles: List,
        stream_purpose: str,
        category_summaries: Dict[str, str],
        stream_name: str = "",
        enrichment_config: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate an executive summary for the entire report.

        Args:
            wip_articles: List of WipArticle objects included in the report
            stream_purpose: Purpose of the research stream
            category_summaries: Dict mapping category_id to category summary
            stream_name: Name of the research stream (for custom prompts)
            enrichment_config: Optional custom prompts config

        Returns:
            Executive summary text
        """
        # Prepare article information
        article_info = []
        for article in wip_articles[:20]:  # Limit to top 20 for context
            article_info.append({
                "title": article.title,
                "authors": article.authors[:3] if article.authors else [],  # First 3 authors
                "journal": article.journal,
                "year": article.year,
                "abstract": article.abstract[:500] if article.abstract else None  # First 500 chars
            })

        # Build category summaries text
        category_summaries_text = "\n\n".join([
            f"**{category_id}**: {summary}"
            for category_id, summary in category_summaries.items()
        ])

        # Get prompt (custom or default)
        prompt = self._get_custom_prompt(enrichment_config, "executive_summary") or DEFAULT_PROMPTS["executive_summary"]

        # Build context for slug replacement
        context = {
            "stream": {
                "name": stream_name,
                "purpose": stream_purpose
            },
            "articles": {
                "count": str(len(wip_articles)),
                "formatted": self._format_articles_for_prompt(article_info)
            },
            "categories": {
                "count": str(len(category_summaries)),
                "summaries": category_summaries_text
            }
        }

        system_prompt = self._render_slugs(prompt.get("system_prompt", ""), context)
        user_prompt = self._render_slugs(prompt.get("user_prompt_template", ""), context)

        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=2000,
            temperature=0.3,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )

        return response.choices[0].message.content

    async def generate_category_summary(
        self,
        category_name: str,
        category_description: str,
        wip_articles: List,
        stream_purpose: str,
        stream_name: str = "",
        category_topics: Optional[List[str]] = None,
        enrichment_config: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a summary for a specific category.

        Args:
            category_name: Name of the category
            category_description: Description of what this category covers
            wip_articles: List of WipArticle objects in this category
            stream_purpose: Purpose of the research stream
            stream_name: Name of the research stream (for custom prompts)
            category_topics: List of topics in this category (for custom prompts)
            enrichment_config: Optional custom prompts config

        Returns:
            Category summary text
        """
        if len(wip_articles) == 0:
            return "No articles in this category."

        # Prepare article information
        article_info = []
        for article in wip_articles[:15]:  # Limit to top 15 for context
            article_info.append({
                "title": article.title,
                "authors": article.authors[:3] if article.authors else [],
                "journal": article.journal,
                "year": article.year,
                "abstract": article.abstract[:400] if article.abstract else None
            })

        # Get prompt (custom or default)
        prompt = self._get_custom_prompt(enrichment_config, "category_summary") or DEFAULT_PROMPTS["category_summary"]

        # Build context for slug replacement
        context = {
            "stream": {
                "name": stream_name,
                "purpose": stream_purpose
            },
            "category": {
                "name": category_name,
                "description": category_description,
                "topics": ", ".join(category_topics) if category_topics else ""
            },
            "articles": {
                "count": str(len(wip_articles)),
                "formatted": self._format_articles_for_prompt(article_info)
            }
        }

        system_prompt = self._render_slugs(prompt.get("system_prompt", ""), context)
        user_prompt = self._render_slugs(prompt.get("user_prompt_template", ""), context)

        response = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=1500,
            temperature=0.3,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )

        return response.choices[0].message.content

    def _format_articles_for_prompt(self, articles: List[Dict]) -> str:
        """Format articles for inclusion in LLM prompt"""
        formatted = []
        for i, article in enumerate(articles, 1):
            authors_str = ", ".join(article["authors"]) if article["authors"] else "Unknown"
            if len(article["authors"]) > 3:
                authors_str += " et al."

            journal_year = []
            if article["journal"]:
                journal_year.append(article["journal"])
            if article["year"]:
                journal_year.append(f"({article['year']})")

            location = " ".join(journal_year) if journal_year else "Unknown source"

            formatted.append(f"{i}. {article['title']}\n   {authors_str} - {location}")

            if article["abstract"]:
                formatted.append(f"   Abstract: {article['abstract']}")

        return "\n\n".join(formatted)

    def _get_custom_prompt(
        self,
        enrichment_config: Optional[Dict[str, Any]],
        prompt_type: str
    ) -> Optional[Dict[str, str]]:
        """Get custom prompt from enrichment config if available"""
        if not enrichment_config:
            return None

        prompts = enrichment_config.get("prompts", {})
        return prompts.get(prompt_type)

    def _render_slugs(self, template: str, context: Dict[str, Any]) -> str:
        """Replace slugs in template with context values"""
        result = template

        # Replace nested slugs like {stream.name}, {articles.count}, etc.
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
