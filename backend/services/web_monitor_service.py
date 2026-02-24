"""
Web Monitor Service - Agent-based web monitoring with config-time validation.

Three public methods:
  1. validate_url(url) — Classifies a URL as 'feed' or 'site' at config time
  2. fetch_feed(source, since_date, max_items) — Deterministic RSS/Atom parsing (no LLM)
  3. run_site_agent(source, since_date, max_items, db, user_id) — Agent-driven site exploration
"""

import hashlib
import logging
import os
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

import anthropic
import httpx
import feedparser
import trafilatura

from schemas.canonical_types import CanonicalResearchArticle
from schemas.research_stream import WebSource

logger = logging.getLogger(__name__)

# HTTP request timeout (seconds)
REQUEST_TIMEOUT = 30

# Agent configuration
SITE_AGENT_MODEL = "claude-sonnet-4-20250514"
SITE_AGENT_MAX_TOKENS = 4096
SITE_AGENT_MAX_ITERATIONS = 10


class WebMonitorService:
    """Validates URLs, fetches feeds, and runs site agents."""

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
                headers={
                    "User-Agent": "KnowledgeHorizon/1.0 (research aggregator)",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # =========================================================================
    # 1. CONFIG-TIME VALIDATION
    # =========================================================================

    async def validate_url(self, url: str) -> Dict[str, Any]:
        """
        Validate and classify a URL as 'feed' or 'site'.

        Returns:
            {
                "source_type": "feed" | "site",
                "title": "...",
                "entry_count": N  # (feed only)
            }
            — or —
            { "error": "Could not reach URL" }
        """
        try:
            client = await self._get_client()
            response = await client.get(url)
            response.raise_for_status()
        except Exception as e:
            logger.warning(f"validate_url: Could not reach {url}: {e}")
            return {"error": f"Could not reach URL: {e}"}

        content_type = response.headers.get("content-type", "").lower()
        text = response.text

        # Check if the content is an RSS/Atom feed
        if self._looks_like_feed(content_type, text):
            feed = feedparser.parse(text)
            title = feed.feed.get("title", "") if feed.feed else ""
            entry_count = len(feed.entries)
            return {
                "source_type": "feed",
                "title": title.strip() if title else None,
                "entry_count": entry_count,
            }

        # It's a regular HTML page — classify as site
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(text, "html.parser")
        title = None
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        if not title:
            og_title = soup.find("meta", property="og:title")
            if og_title and og_title.get("content"):
                title = og_title["content"].strip()

        return {
            "source_type": "site",
            "title": title,
        }

    def _looks_like_feed(self, content_type: str, text: str) -> bool:
        """Check if content is RSS/Atom based on content-type and body."""
        # Content-type check
        feed_types = ["xml", "rss", "atom"]
        if any(ft in content_type for ft in feed_types):
            return True

        # Body check (first 500 chars)
        snippet = text[:500].lower()
        return any(marker in snippet for marker in ["<rss", "<feed", "<channel"])

    # =========================================================================
    # 2. FEED PATH (deterministic, no LLM)
    # =========================================================================

    async def fetch_feed(
        self,
        source: WebSource,
        since_date: Optional[str] = None,
        max_items: int = 20,
    ) -> List[CanonicalResearchArticle]:
        """
        Parse an RSS/Atom feed URL and return articles.

        Args:
            source: WebSource with source_type='feed'
            since_date: Only return items after this date (YYYY-MM-DD or YYYY/MM/DD)
            max_items: Maximum items to return

        Returns:
            List of CanonicalResearchArticle
        """
        try:
            client = await self._get_client()
            response = await client.get(source.url)
            response.raise_for_status()
        except Exception as e:
            logger.warning(f"Failed to fetch feed {source.url}: {e}")
            return []

        feed = feedparser.parse(response.text)
        if not feed.entries:
            logger.debug(f"No entries found in feed: {source.url}")
            return []

        since_dt = _parse_since_date(since_date)
        articles = []

        for entry in feed.entries[:max_items * 2]:
            if len(articles) >= max_items:
                break

            entry_date = _parse_feed_entry_date(entry)
            if since_dt and entry_date and entry_date < since_dt:
                continue

            article = self._feed_entry_to_article(entry, source)
            if article:
                articles.append(article)

        logger.info(
            f"Web monitor feed [{source.source_id}]: {len(articles)} items from {source.url}"
        )
        return articles

    def _feed_entry_to_article(
        self, entry: Any, source: WebSource
    ) -> Optional[CanonicalResearchArticle]:
        """Convert a feedparser entry to a CanonicalResearchArticle."""
        title = getattr(entry, "title", None)
        if not title:
            return None

        link = getattr(entry, "link", None) or ""

        # Extract content/summary
        content = ""
        if hasattr(entry, "content") and entry.content:
            content = entry.content[0].get("value", "")
        summary = getattr(entry, "summary", "") or ""

        # Clean HTML content
        full_text = content or summary
        if full_text and "<" in full_text:
            cleaned = trafilatura.extract(
                full_text,
                include_comments=False,
                include_tables=False,
                no_fallback=True,
            )
            if cleaned:
                full_text = cleaned

        # Build abstract from first ~500 chars
        abstract = (summary or full_text or "")[:500]
        if abstract and len(summary or full_text or "") > 500:
            abstract += "..."

        # Parse date
        entry_date = _parse_feed_entry_date(entry)

        # Authors
        authors = []
        if hasattr(entry, "authors"):
            for a in entry.authors:
                name = a.get("name", "") if isinstance(a, dict) else str(a)
                if name:
                    authors.append(name)
        elif hasattr(entry, "author") and entry.author:
            authors.append(entry.author)

        # Categories/tags
        categories = []
        if hasattr(entry, "tags"):
            for tag in entry.tags:
                term = tag.get("term", "") if isinstance(tag, dict) else str(tag)
                if term:
                    categories.append(term)

        article_id = _url_hash(link or title)

        return CanonicalResearchArticle(
            id=article_id,
            source="web_monitor",
            title=title.strip(),
            authors=authors,
            abstract=abstract,
            full_text=full_text if full_text else None,
            url=link,
            pub_year=entry_date.year if entry_date else None,
            pub_month=entry_date.month if entry_date else None,
            pub_day=entry_date.day if entry_date else None,
            categories=categories,
            source_metadata={
                "site_url": source.url,
                "directive": source.directive,
                "discovery_method": "feed",
                "web_source_id": source.source_id,
            },
            retrieved_at=datetime.utcnow().isoformat(),
        )

    # =========================================================================
    # 3. SITE PATH (agent-driven)
    # =========================================================================

    async def run_site_agent(
        self,
        source: WebSource,
        since_date: Optional[str] = None,
        max_items: int = 20,
        db: Any = None,
        user_id: int = 0,
    ) -> Tuple[List[CanonicalResearchArticle], Optional[str]]:
        """
        Run an agent to explore a site and find articles matching the directive.

        Args:
            source: WebSource with source_type='site'
            since_date: Only find content published after this date
            max_items: Maximum articles to collect
            db: Database session (passed to agent loop)
            user_id: User ID (passed to agent loop)

        Returns:
            Tuple of (articles, updated_site_memo)
        """
        from tools.web_monitor_tools import create_web_monitor_tools
        from agents.agent_loop import run_agent_loop, AgentComplete, AgentError

        # Build article collector
        article_collector: List[CanonicalResearchArticle] = []

        # Create tools
        tools = create_web_monitor_tools(
            article_collector=article_collector,
            source_url=source.url,
        )

        # Build system prompt
        system_prompt = self._build_site_agent_prompt(source, since_date, max_items)

        # Create Anthropic client
        client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )

        # Initial message
        messages = [
            {
                "role": "user",
                "content": f"Please explore {source.url} and find articles matching the directive. Start by fetching the main page.",
            }
        ]

        # Run agent loop
        final_text = ""
        try:
            async for event in run_agent_loop(
                client=client,
                model=SITE_AGENT_MODEL,
                max_tokens=SITE_AGENT_MAX_TOKENS,
                max_iterations=SITE_AGENT_MAX_ITERATIONS,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools,
                db=db,
                user_id=user_id,
                context={"web_source_id": source.source_id},
                stream_text=False,
                temperature=0.0,
            ):
                if isinstance(event, AgentComplete):
                    final_text = event.text
                    logger.info(
                        f"Site agent [{source.source_id}] completed: "
                        f"{len(article_collector)} articles found"
                    )
                elif isinstance(event, AgentError):
                    logger.error(
                        f"Site agent [{source.source_id}] error: {event.error}"
                    )
                    final_text = event.text
        except Exception as e:
            logger.error(f"Site agent [{source.source_id}] exception: {e}", exc_info=True)

        # Extract site_memo from agent's final text
        updated_site_memo = self._extract_site_memo(final_text)

        logger.info(
            f"Web monitor site [{source.source_id}]: "
            f"{len(article_collector)} articles from {source.url}, "
            f"memo_updated={'yes' if updated_site_memo else 'no'}"
        )

        return article_collector[:max_items], updated_site_memo

    def _build_site_agent_prompt(
        self,
        source: WebSource,
        since_date: Optional[str],
        max_items: int,
    ) -> str:
        """Build the system prompt for the site exploration agent."""
        date_constraint = ""
        if since_date:
            date_constraint = f"\nOnly include articles published after {since_date}."

        memo_section = ""
        if source.site_memo:
            memo_section = f"""

## Previous Site Memo
The following memo was written by a previous run of this agent. Use it to navigate more efficiently:

{source.site_memo}
"""

        return f"""You are a web monitoring agent. Your job is to explore a website and find articles that match a specific directive.

## Target Site
URL: {source.url}

## Directive
{source.directive}
{date_constraint}

## Rules
1. Start by fetching the main page to understand the site structure.
2. Look for links to articles, blog posts, news items, or other content that matches the directive.
3. Fetch promising pages to read their full content.
4. For each article that matches the directive, call submit_article with the title, URL, full content, published date (if available), and authors (if available).
5. Submit up to {max_items} articles maximum.
6. Be efficient — don't fetch pages that are clearly irrelevant (e.g., about pages, contact pages, privacy policies).
7. If the site has pagination or archive pages, explore them to find more articles.
{memo_section}
## Final Output
After you have finished submitting articles, provide a SITE_MEMO block describing what you learned about navigating this site. This will be provided to you on the next run. Include: URL patterns for articles, pagination structure, how content is organized, any useful selectors or paths. Format:

<site_memo>
Your memo here
</site_memo>"""

    def _extract_site_memo(self, text: str) -> Optional[str]:
        """Extract <site_memo> block from agent's final text."""
        if not text:
            return None
        match = re.search(r"<site_memo>(.*?)</site_memo>", text, re.DOTALL)
        if match:
            memo = match.group(1).strip()
            return memo if memo else None
        return None


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================


def _url_hash(url: str) -> str:
    """Generate a stable hash ID from a URL."""
    return hashlib.sha256(url.encode()).hexdigest()[:16]


def _parse_since_date(since_date: Optional[str]) -> Optional[datetime]:
    """Parse a YYYY/MM/DD or YYYY-MM-DD date string to a datetime."""
    if not since_date:
        return None
    try:
        cleaned = since_date.replace("/", "-")
        return datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        return None


def _parse_feed_entry_date(entry: Any) -> Optional[datetime]:
    """Parse the publication date from a feedparser entry."""
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        time_struct = getattr(entry, attr, None)
        if time_struct:
            try:
                return datetime(*time_struct[:6])
            except (TypeError, ValueError):
                continue

    for attr in ("published", "updated", "created"):
        date_str = getattr(entry, attr, None)
        if date_str:
            try:
                from dateutil.parser import parse as dateutil_parse
                return dateutil_parse(date_str)
            except (ValueError, ImportError):
                continue

    return None
