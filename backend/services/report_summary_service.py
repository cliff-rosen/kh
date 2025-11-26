"""
Report Summary Service - Generates executive summaries for reports using LLM

This service generates:
1. Executive summary for all articles in the report
2. Category-specific summaries for each presentation category
"""

from typing import List, Dict, Tuple
from anthropic import Anthropic
import os


class ReportSummaryService:
    """Service for generating report summaries using LLM"""

    def __init__(self):
        self.client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.model = "claude-3-5-sonnet-20241022"

    async def generate_executive_summary(
        self,
        wip_articles: List,
        stream_purpose: str,
        category_summaries: Dict[str, str]
    ) -> str:
        """
        Generate an executive summary for the entire report.

        Args:
            wip_articles: List of WipArticle objects included in the report
            stream_purpose: Purpose of the research stream
            category_summaries: Dict mapping category_id to category summary

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

        system_prompt = """You are an expert research analyst who specializes in synthesizing scientific literature.

        Your task is to write a concise executive summary of a research report.

        The summary should:
        - Be 3-5 paragraphs (200-400 words total)
        - Highlight the most important findings and trends
        - Identify key themes across the literature
        - Note any significant developments or breakthroughs
        - Be written for an executive audience (technical but accessible)
        - Focus on insights and implications, not just listing papers

        Write in a professional, analytical tone."""

        user_prompt = f"""Generate an executive summary for this research report.

        # Research Stream Purpose
        {stream_purpose}

        # Report Statistics
        - Total articles: {len(wip_articles)}
        - Categories covered: {len(category_summaries)}

        # Category Summaries
        {category_summaries_text}

        # Sample Articles (representative of the full report)
        {self._format_articles_for_prompt(article_info)}

        Generate a comprehensive executive summary that synthesizes the key findings and themes across all articles."""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        return message.content[0].text

    async def generate_category_summary(
        self,
        category_name: str,
        category_description: str,
        wip_articles: List,
        stream_purpose: str
    ) -> str:
        """
        Generate a summary for a specific category.

        Args:
            category_name: Name of the category
            category_description: Description of what this category covers
            wip_articles: List of WipArticle objects in this category
            stream_purpose: Purpose of the research stream

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

        system_prompt = f"""You are an expert research analyst synthesizing scientific literature.

        Your task is to write a concise summary of articles in the "{category_name}" category.

        The summary should:
        - Be 2-3 paragraphs (150-250 words total)
        - Identify the main themes and findings in this category
        - Highlight the most significant or impactful articles
        - Note any emerging trends or patterns
        - Be written for a technical audience familiar with the field

        Write in a professional, analytical tone."""

        user_prompt = f"""Generate a summary for the "{category_name}" category.

        # Category Description
        {category_description}

        # Research Stream Purpose
        {stream_purpose}

        # Articles in This Category ({len(wip_articles)} total)
        {self._format_articles_for_prompt(article_info)}

        Generate a focused summary that captures the key insights from articles in this category."""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=1500,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )

        return message.content[0].text

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
