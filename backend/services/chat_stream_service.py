"""
Chat Streaming Service

Handles LLM streaming interaction for the chat system with tool support.
Uses the agent_loop for agentic processing. Handles chat persistence automatically.
"""

from typing import Dict, Any, AsyncGenerator, List, Optional
from sqlalchemy.orm import Session
import anthropic
import os
import logging

from schemas.chat import (
    ChatResponsePayload,
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
)
from services.chat_page_config import (
    get_context_builder,
    get_client_actions,
    has_page_payloads,
    get_all_payloads_for_page,
)
from tools.registry import get_tools_for_page_dict
from agents.agent_loop import (
    run_agent_loop,
    CancellationToken,
    AgentThinking,
    AgentTextDelta,
    AgentToolStart,
    AgentToolProgress,
    AgentToolComplete,
    AgentComplete,
    AgentCancelled,
    AgentError,
)
from services.chat_service import ChatService

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 2000
MAX_TOOL_ITERATIONS = 5


class ChatStreamService:
    """Service for streaming chat interactions with tool support."""

    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.async_client = anthropic.AsyncAnthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        self.chat_service = ChatService(db)

    # =========================================================================
    # Public API
    # =========================================================================

    async def stream_chat_message(
        self,
        request,
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with tool support via SSE.

        Args:
            request: ChatRequest object (defined in routers.chat_stream)
            cancellation_token: Optional token to check for cancellation

        Yields JSON strings of StreamEvent types (discriminated union)
        """
        if cancellation_token is None:
            cancellation_token = CancellationToken()

        # Setup chat persistence
        chat_id = self._setup_chat(request)

        try:
            # Build prompts
            system_prompt = self._build_system_prompt(request.context)
            messages = self._build_messages(request)

            # Get tools for this page and tab (global + page + tab-specific)
            current_page = request.context.get("current_page", "unknown")
            active_tab = request.context.get("active_tab")
            tools_by_name = get_tools_for_page_dict(current_page, active_tab)

            # Send initial status
            yield StatusEvent(message="Thinking...").model_dump_json()

            # Run the agent loop
            collected_text = ""
            tool_call_history = []
            collected_payloads = []
            tool_call_index = 0

            async for event in run_agent_loop(
                client=self.async_client,
                model=CHAT_MODEL,
                max_tokens=CHAT_MAX_TOKENS,
                max_iterations=MAX_TOOL_ITERATIONS,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools_by_name,
                db=self.db,
                user_id=self.user_id,
                context=request.context,
                cancellation_token=cancellation_token,
                stream_text=True,
                temperature=0.0
            ):
                if isinstance(event, AgentThinking):
                    yield StatusEvent(message=event.message).model_dump_json()

                elif isinstance(event, AgentTextDelta):
                    collected_text += event.text
                    yield TextDeltaEvent(text=event.text).model_dump_json()

                elif isinstance(event, AgentToolStart):
                    yield ToolStartEvent(
                        tool=event.tool_name,
                        input=event.tool_input,
                        tool_use_id=event.tool_use_id
                    ).model_dump_json()

                elif isinstance(event, AgentToolProgress):
                    yield ToolProgressEvent(
                        tool=event.tool_name,
                        stage=event.stage,
                        message=event.message,
                        progress=event.progress,
                        data=event.data
                    ).model_dump_json()

                elif isinstance(event, AgentToolComplete):
                    tool_marker = f"[[tool:{tool_call_index}]]"
                    collected_text += tool_marker
                    yield TextDeltaEvent(text=tool_marker).model_dump_json()
                    yield ToolCompleteEvent(
                        tool=event.tool_name,
                        index=tool_call_index
                    ).model_dump_json()
                    tool_call_index += 1

                elif isinstance(event, (AgentComplete, AgentCancelled)):
                    tool_call_history = event.tool_calls
                    collected_payloads = event.payloads

                elif isinstance(event, AgentError):
                    yield ErrorEvent(message=event.error).model_dump_json()
                    return

            # Parse response and build final payload
            parsed = self._parse_llm_response(collected_text, request.context)
            custom_payload = collected_payloads[-1] if collected_payloads else parsed.get("custom_payload")

            # Persist assistant message
            self._save_assistant_message(chat_id, parsed["message"], request.context)

            # Emit complete event
            final_payload = ChatResponsePayload(
                message=parsed["message"],
                suggested_values=parsed.get("suggested_values"),
                suggested_actions=parsed.get("suggested_actions"),
                custom_payload=custom_payload,
                tool_history=tool_call_history if tool_call_history else None,
                conversation_id=chat_id
            )
            yield CompleteEvent(payload=final_payload).model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            yield ErrorEvent(message=f"Service error: {str(e)}").model_dump_json()

    # =========================================================================
    # Chat Persistence Helpers
    # =========================================================================

    def _setup_chat(self, request) -> Optional[int]:
        """
        Set up chat persistence and save user message.

        Returns chat_id or None if persistence fails.
        """
        try:
            chat_id = request.conversation_id

            if chat_id:
                chat = self.chat_service.get_chat(chat_id, self.user_id)
                if not chat:
                    chat_id = None

            if not chat_id:
                chat = self.chat_service.create_chat(self.user_id)
                chat_id = chat.id

            self.chat_service.add_message(
                chat_id=chat_id,
                user_id=self.user_id,
                role='user',
                content=request.message,
                context=request.context
            )
            return chat_id

        except Exception as e:
            logger.warning(f"Failed to persist user message: {e}")
            return None

    def _save_assistant_message(
        self,
        chat_id: Optional[int],
        content: str,
        context: Dict[str, Any]
    ) -> None:
        """Save assistant message to chat history."""
        if not chat_id:
            return
        try:
            self.chat_service.add_message(
                chat_id=chat_id,
                user_id=self.user_id,
                role='assistant',
                content=content,
                context=context
            )
        except Exception as e:
            logger.warning(f"Failed to persist assistant message: {e}")

    # =========================================================================
    # Message Building
    # =========================================================================

    def _build_messages(self, request) -> List[Dict[str, str]]:
        """Build message history for LLM from request."""
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]

        # Build user prompt with context
        context_summary = "\n".join([f"{k}: {v}" for k, v in request.context.items()])
        user_prompt = f"""User's current context:
        {context_summary}

        Interaction type: {request.interaction_type}

        User's message: {request.message}"""

        messages.append({"role": "user", "content": user_prompt})
        return messages

    # =========================================================================
    # System Prompt Building
    # =========================================================================

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build system prompt based on user's context."""
        current_page = context.get("current_page", "unknown")
        stream_instructions = self._load_stream_instructions(context) or ""

        if has_page_payloads(current_page):
            return self._build_payload_aware_prompt(current_page, context, stream_instructions)

        return f"""You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        {stream_instructions}

        The user is currently on: {current_page}

        {self._get_response_format_instructions()}

        Keep responses simple and conversational.
        Help users understand what they can do in the application.
        """

    def _build_payload_aware_prompt(
        self,
        current_page: str,
        context: Dict[str, Any],
        stream_instructions: str = ""
    ) -> str:
        """Build system prompt for pages with registered payload types."""
        # Get all payloads for this page and tab (global + page + tab)
        active_tab = context.get("active_tab")
        payload_configs = get_all_payloads_for_page(current_page, active_tab)

        page_context = self._build_page_context(current_page, context)
        payload_instructions = "\n\n".join([
            c.llm_instructions for c in payload_configs if c.llm_instructions
        ])

        # Build client actions section
        client_actions = get_client_actions(current_page)
        client_actions_text = ""
        if client_actions:
            actions_list = "\n".join([
                f"- {a.action}: {a.description}" +
                (f" (parameters: {', '.join(a.parameters)})" if a.parameters else "")
                for a in client_actions
            ])
            client_actions_text = f"""

            AVAILABLE CLIENT ACTIONS:
            You can suggest these client-side actions using SUGGESTED_ACTIONS format with handler='client':
            {actions_list}

            ONLY suggest client actions from the list above. Do not invent new client actions."""

        return f"""You are a helpful AI assistant for Knowledge Horizon.

        {stream_instructions}

        {page_context}

        YOUR ROLE:
        - Answer questions and help the user understand the page
        - When the user asks for recommendations, validation, or assistance, use the appropriate payload type
        - Use conversation history to understand context and provide relevant help
        - Be conversational and helpful

        AVAILABLE PAYLOAD TYPES:
        You can respond with structured payloads to provide rich interactions.
        Choose the appropriate payload type based on what the user needs:

        {payload_instructions}
        {client_actions_text}

        RESPONSE GUIDELINES:
        - Only use payloads when they add value to your response
        - For simple conversations, respond naturally without payloads
        - You can include multiple payloads in one response if relevant
        - Use conversation history to inform your responses
        """

    def _get_response_format_instructions(self) -> str:
        """Get common response format instructions."""
        return """
        RESPONSE FORMAT:

        Simply respond conversationally. Do NOT use any special formatting markers like MESSAGE:, SUGGESTED_VALUES:, or SUGGESTED_ACTIONS:.

        Just write your response naturally as you would in a conversation.
        """

    # =========================================================================
    # Context Loading
    # =========================================================================

    def _build_page_context(self, current_page: str, context: Dict[str, Any]) -> str:
        """Build page-specific context section of the prompt."""
        context_builder = get_context_builder(current_page)

        if context_builder:
            base_context = context_builder(context)
        else:
            base_context = f"The user is currently on: {current_page}"

        # For reports page, enrich with report data from database
        if current_page == "reports" and context.get("report_id"):
            report_id = context.get("report_id")
            try:
                report_data = self._load_report_context(report_id, context)
                if report_data:
                    base_context += "\n" + report_data
                else:
                    base_context += "\n\n(Unable to load report data - report may not exist or access denied)"
            except Exception as e:
                logger.warning(f"Failed to load report context for report_id={report_id}: {e}")
                base_context += f"\n\n(Error loading report data: {str(e)})"

        return base_context

    def _load_stream_instructions(self, context: Dict[str, Any]) -> Optional[str]:
        """Load stream-specific chat instructions based on stream_id in context."""
        from models import ResearchStream, Report

        stream_id = context.get("stream_id")

        # Try to get stream_id from report_id if not directly provided
        if not stream_id and context.get("report_id"):
            report = self.db.query(Report).filter(
                Report.report_id == context.get("report_id"),
                Report.user_id == self.user_id
            ).first()
            if report:
                stream_id = report.research_stream_id

        if not stream_id:
            return None

        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id,
            ResearchStream.user_id == self.user_id
        ).first()

        if not stream or not stream.chat_instructions:
            return None

        return f"""
        === STREAM-SPECIFIC INSTRUCTIONS ===
        The following instructions define how to analyze and respond about articles in this stream:

        {stream.chat_instructions}

        === END STREAM INSTRUCTIONS ===
        """

    def _load_report_context(self, report_id: int, context: Dict[str, Any]) -> Optional[str]:
        """Load report data from database and format it for LLM context."""
        from models import Report, ReportArticleAssociation, Article

        report = self.db.query(Report).filter(
            Report.report_id == report_id,
            Report.user_id == self.user_id
        ).first()

        if not report:
            return None

        # Load articles
        article_associations = self.db.query(ReportArticleAssociation, Article).join(
            Article, ReportArticleAssociation.article_id == Article.article_id
        ).filter(
            ReportArticleAssociation.report_id == report_id
        ).all()

        articles_context = []
        for assoc, article in article_associations:
            articles_context.append({
                "article_id": article.article_id,
                "title": article.title,
                "authors": article.authors or [],
                "abstract": article.abstract,
                "journal": article.journal,
                "year": str(article.publication_date.year) if article.publication_date else None,
                "relevance_score": assoc.relevance_score,
                "relevance_rationale": assoc.relevance_rationale,
                "category": assoc.presentation_categories[0] if assoc.presentation_categories else None
            })

        # Build enrichments context
        enrichments = report.enrichments or {}
        executive_summary = enrichments.get("executive_summary", "")
        category_summaries = enrichments.get("category_summaries", {})

        category_summaries_text = ""
        if category_summaries:
            formatted = [f"\n### {cat}\n{summary}" for cat, summary in category_summaries.items()]
            category_summaries_text = "\n".join(formatted)

        highlights_text = "No key highlights available."
        if report.key_highlights:
            highlights_text = "\n".join(f"- {h}" for h in report.key_highlights)

        current_article = context.get("current_article")
        current_article_section = self._format_current_article(current_article) if current_article else ""

        return f"""
        === REPORT DATA (loaded from database) ===

        Report Name: {report.report_name}
        Report Date: {report.report_date}
        Total Articles: {len(articles_context)}
        {current_article_section}

        === EXECUTIVE SUMMARY ===
        {executive_summary if executive_summary else "No executive summary available."}

        === KEY HIGHLIGHTS ===
        {highlights_text}

        === THEMATIC ANALYSIS ===
        {report.thematic_analysis if report.thematic_analysis else "No thematic analysis available."}

        === CATEGORY SUMMARIES ===
        {category_summaries_text if category_summaries_text else "No category summaries available."}

        === ARTICLES IN THIS REPORT ===
        {self._format_report_articles(articles_context)}
        """

    def _format_current_article(self, article: Dict[str, Any]) -> str:
        """Format the currently-viewed article for LLM context."""
        if not article:
            return ""

        title = article.get("title", "Unknown Title")
        authors = article.get("authors", [])
        authors_str = ", ".join(authors[:3]) if authors else "Unknown"
        if len(authors) > 3:
            authors_str += " et al."

        journal = article.get("journal", "Unknown Journal")
        year = article.get("year", "Unknown Year")
        pmid = article.get("pmid")
        doi = article.get("doi")
        abstract = article.get("abstract", "No abstract available.")
        relevance_score = article.get("relevance_score")
        relevance_rationale = article.get("relevance_rationale")
        stance = article.get("stance_analysis")

        sections = [f"""
        === CURRENTLY VIEWING ARTICLE ===
        The user has this specific article open and is asking about it.

        Title: {title}
        Authors: {authors_str}
        Journal: {journal} ({year})"""]

        if pmid:
            sections.append(f"        PMID: {pmid}")
        if doi:
            sections.append(f"        DOI: {doi}")

        sections.append(f"""
        Abstract:
        {abstract}""")

        if relevance_score is not None:
            sections.append(f"""
        Relevance Score: {int(relevance_score * 100)}%""")

        if relevance_rationale:
            sections.append(f"""        Why Relevant: {relevance_rationale}""")

        if stance:
            stance_type = stance.get("stance", "unknown")
            confidence = stance.get("confidence", 0)
            analysis = stance.get("analysis", "")
            key_factors = stance.get("key_factors", [])

            sections.append(f"""
        === STANCE ANALYSIS (from UI) ===
        Stance: {stance_type} (Confidence: {int(confidence * 100)}%)
        Analysis: {analysis}""")

            if key_factors:
                factors_str = "\n        - ".join(key_factors)
                sections.append(f"""        Key Factors:
        - {factors_str}""")

        sections.append("""
        === END CURRENT ARTICLE ===""")

        return "\n".join(sections)

    def _format_report_articles(self, articles: List[Dict[str, Any]]) -> str:
        """Format articles for the prompt, keeping it concise."""
        if not articles:
            return "No articles in this report."

        formatted = []
        for i, article in enumerate(articles[:30], 1):
            authors_str = ", ".join(article.get("authors", [])[:3])
            if len(article.get("authors", [])) > 3:
                authors_str += " et al."

            entry = f"""
            {i}. "{article.get('title', 'Untitled')}"
            Authors: {authors_str or 'Unknown'}
            Journal: {article.get('journal', 'Unknown')} ({article.get('year', 'Unknown')})
            Relevance: {f"{int(article.get('relevance_score', 0) * 100)}%" if article.get('relevance_score') else 'Not scored'}
            Category: {article.get('category', 'Uncategorized')}"""

            if article.get("relevance_rationale"):
                rationale = article["relevance_rationale"][:150]
                if len(article["relevance_rationale"]) > 150:
                    rationale += "..."
                entry += f"\n   Why relevant: {rationale}"

            if article.get("abstract"):
                abstract = article["abstract"][:200]
                if len(article["abstract"]) > 200:
                    abstract += "..."
                entry += f"\n   Abstract: {abstract}"

            formatted.append(entry)

        result = "\n".join(formatted)
        if len(articles) > 30:
            result += f"\n\n... and {len(articles) - 30} more articles"
        return result

    # =========================================================================
    # Response Parsing
    # =========================================================================

    def _parse_llm_response(self, response_text: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Parse LLM response to extract structured components."""
        current_page = context.get("current_page", "unknown")

        result = {
            "message": response_text.strip(),
            "suggested_values": None,
            "suggested_actions": None,
            "custom_payload": None
        }

        # Get all payloads for this page (global + page-specific)
        payload_configs = get_all_payloads_for_page(current_page)
        if not payload_configs:
            return result

        for config in payload_configs:
            marker = config.parse_marker
            # Skip payloads without a parse_marker (tool payloads don't need parsing)
            if not marker:
                continue
            if marker in response_text:
                marker_pos = response_text.find(marker)
                after_marker = response_text[marker_pos + len(marker):].strip()
                json_content = self._extract_json(after_marker)
                if json_content:
                    parsed = config.parser(json_content)
                    if parsed:
                        result["custom_payload"] = parsed
                        payload_text = marker + json_content
                        result["message"] = response_text.replace(payload_text, "").strip()
                        break

        return result

    def _extract_json(self, text: str) -> Optional[str]:
        """Extract a JSON object from the start of text, handling nested braces."""
        if not text.startswith('{'):
            return None

        depth = 0
        in_string = False
        escape_next = False

        for i, char in enumerate(text):
            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                continue

            if in_string:
                continue

            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    return text[:i + 1]

        return None
