"""
Report Summary Service - Generates executive summaries for reports using LLM

This service generates:
1. Executive summary for all articles in the report
2. Category-specific summaries for each presentation category

Supports custom prompts via enrichment_config with slug replacement.
"""

from typing import List, Dict, Tuple, Optional, Any

from agents.prompts.base_prompt_caller import BasePromptCaller
from schemas.llm import ChatMessage, MessageRole


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
    },
    "article_summary": {
        "system_prompt": """You are an expert research analyst who synthesizes scientific literature.

        Your task is to write a concise summary of a research article that highlights its key contributions.

        The summary should:
        - Be 2-4 sentences (50-100 words)
        - Capture the main research question or objective
        - Highlight key findings or contributions
        - Note any significant methodology or implications
        - Be written for a technical audience familiar with the field

        Write in a professional, analytical tone. Include only the summary with no heading or other text.""",
        "user_prompt_template": """Summarize this research article:

        # Article Information
        Title: {article.title}
        Authors: {article.authors}
        Journal: {article.journal} ({article.year})

        # Abstract
        {article.abstract}

        Generate a concise summary that captures the key contributions and findings of this article."""
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
        {"slug": "{articles.summaries}", "description": "AI-generated summaries for articles in this category"},
    ],
    "article_summary": [
        {"slug": "{stream.name}", "description": "Name of the research stream"},
        {"slug": "{stream.purpose}", "description": "Purpose/description of the stream"},
        {"slug": "{article.title}", "description": "Title of the article"},
        {"slug": "{article.authors}", "description": "Authors of the article"},
        {"slug": "{article.journal}", "description": "Journal where published"},
        {"slug": "{article.year}", "description": "Publication year"},
        {"slug": "{article.abstract}", "description": "Article abstract"},
    ]
}


class ReportSummaryService:
    """Service for generating report summaries using LLM.

    Uses BasePromptCaller in text-only mode for all LLM calls.
    Model selection is the responsibility of the caller.
    """

    # Default model configuration
    DEFAULT_MODEL = "gpt-4.1"
    DEFAULT_TEMPERATURE = 0.3

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float,
        max_tokens: int
    ) -> str:
        """
        Call LLM using BasePromptCaller in text-only mode.

        Args:
            system_prompt: System message for the LLM
            user_prompt: User message for the LLM
            model: Model to use
            temperature: Temperature for generation
            max_tokens: Maximum tokens in response

        Returns:
            Generated text response
        """
        caller = BasePromptCaller(
            response_model=None,  # Text-only mode
            system_message=system_prompt,
            messages_placeholder=True,
            model=model,
            temperature=temperature
        )

        messages = [ChatMessage(role=MessageRole.USER, content=user_prompt)]
        result = await caller.invoke(messages=messages, max_tokens=max_tokens, log_prompt=False)
        return result

    async def generate_executive_summary(
        self,
        wip_articles: List,
        stream_purpose: str,
        category_summaries: Dict[str, str],
        stream_name: str = "",
        enrichment_config: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> str:
        """
        Generate an executive summary for the entire report.

        Args:
            wip_articles: List of WipArticle objects included in the report
            stream_purpose: Purpose of the research stream
            category_summaries: Dict mapping category_id to category summary
            stream_name: Name of the research stream (for custom prompts)
            enrichment_config: Optional custom prompts config
            model: Optional model override (defaults to gpt-4.1)
            temperature: Optional temperature override (defaults to 0.3)

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

        # Use provided model/temperature or defaults
        effective_model = model or self.DEFAULT_MODEL
        effective_temperature = temperature if temperature is not None else self.DEFAULT_TEMPERATURE

        return await self._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=effective_model,
            temperature=effective_temperature,
            max_tokens=2000
        )

    async def generate_category_summary(
        self,
        category_name: str,
        category_description: str,
        wip_articles: List,
        stream_purpose: str,
        stream_name: str = "",
        category_topics: Optional[List[str]] = None,
        enrichment_config: Optional[Dict[str, Any]] = None,
        article_summaries: Optional[List[str]] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None
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
            article_summaries: Optional list of AI-generated article summaries
            model: Optional model override (defaults to gpt-4.1)
            temperature: Optional temperature override (defaults to 0.3)

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

        # Format article summaries if provided
        summaries_text = ""
        if article_summaries:
            summaries_text = "\n\n".join([
                f"- {summary}" for summary in article_summaries if summary
            ])

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
                "formatted": self._format_articles_for_prompt(article_info),
                "summaries": summaries_text
            }
        }

        system_prompt = self._render_slugs(prompt.get("system_prompt", ""), context)
        user_prompt = self._render_slugs(prompt.get("user_prompt_template", ""), context)

        # Use provided model/temperature or defaults
        effective_model = model or self.DEFAULT_MODEL
        effective_temperature = temperature if temperature is not None else self.DEFAULT_TEMPERATURE

        return await self._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=effective_model,
            temperature=effective_temperature,
            max_tokens=1500
        )

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

    async def generate_article_summary(
        self,
        article: Any,
        stream_purpose: str = "",
        stream_name: str = "",
        enrichment_config: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> str:
        """
        Generate an AI summary for a single article.

        Args:
            article: Article or WipArticle object with title, authors, journal, year, abstract
            stream_purpose: Purpose of the research stream (for context)
            stream_name: Name of the research stream (for custom prompts)
            enrichment_config: Optional custom prompts config
            model: Optional model override (defaults to gpt-4.1)
            temperature: Optional temperature override (defaults to 0.3)

        Returns:
            AI-generated summary text
        """
        # Skip if no abstract
        if not article.abstract:
            return ""

        # Get prompt (custom or default)
        prompt = self._get_custom_prompt(enrichment_config, "article_summary") or DEFAULT_PROMPTS["article_summary"]

        # Format authors
        authors = article.authors if article.authors else []
        if isinstance(authors, list):
            if len(authors) > 3:
                authors_str = ", ".join(authors[:3]) + " et al."
            else:
                authors_str = ", ".join(authors)
        else:
            authors_str = str(authors)

        # Build context for slug replacement
        context = {
            "stream": {
                "name": stream_name,
                "purpose": stream_purpose
            },
            "article": {
                "title": article.title or "Untitled",
                "authors": authors_str or "Unknown",
                "journal": article.journal or "Unknown",
                "year": str(article.year) if article.year else "Unknown",
                "abstract": article.abstract or ""
            }
        }

        system_prompt = self._render_slugs(prompt.get("system_prompt", ""), context)
        user_prompt = self._render_slugs(prompt.get("user_prompt_template", ""), context)

        # Use provided model/temperature or defaults
        effective_model = model or self.DEFAULT_MODEL
        effective_temperature = temperature if temperature is not None else self.DEFAULT_TEMPERATURE

        return await self._call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=effective_model,
            temperature=effective_temperature,
            max_tokens=500
        )

    async def generate_article_summaries_batch(
        self,
        articles: List[Any],
        stream_purpose: str = "",
        stream_name: str = "",
        enrichment_config: Optional[Dict[str, Any]] = None,
        max_concurrency: int = 5,
        on_progress: Optional[callable] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> List[Tuple[Any, str]]:
        """
        Generate AI summaries for multiple articles with concurrency control.

        Args:
            articles: List of Article or WipArticle objects
            stream_purpose: Purpose of the research stream
            stream_name: Name of the research stream
            enrichment_config: Optional custom prompts config
            max_concurrency: Maximum concurrent API calls
            on_progress: Optional callback(completed, total) for progress updates
            model: Optional model override (defaults to gpt-4.1)
            temperature: Optional temperature override (defaults to 0.3)

        Returns:
            List of (article, summary) tuples
        """
        import asyncio

        if not articles:
            return []

        results: List[Tuple[Any, str]] = []
        semaphore = asyncio.Semaphore(max_concurrency)
        completed = 0

        async def process_article(article):
            nonlocal completed
            async with semaphore:
                try:
                    summary = await self.generate_article_summary(
                        article=article,
                        stream_purpose=stream_purpose,
                        stream_name=stream_name,
                        enrichment_config=enrichment_config,
                        model=model,
                        temperature=temperature
                    )
                    completed += 1
                    if on_progress:
                        on_progress(completed, len(articles))
                    return (article, summary)
                except Exception as e:
                    completed += 1
                    if on_progress:
                        on_progress(completed, len(articles))
                    # Return empty summary on error
                    return (article, "")

        # Process all articles concurrently with semaphore limiting
        tasks = [process_article(article) for article in articles]
        results = await asyncio.gather(*tasks)

        return results
