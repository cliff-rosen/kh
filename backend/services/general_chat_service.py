"""
General-purpose chat service
Handles LLM interaction for the general chat system

Uses the generic agent_loop for agentic processing with tool support.
"""

from typing import Dict, Any, AsyncGenerator, List, Optional
from sqlalchemy.orm import Session
import anthropic
import os
import logging

from schemas.general_chat import (
    ChatResponsePayload,
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
)
# Import chat payloads package (for page context builders and payloads)
from services.chat_payloads import (
    get_page_payloads,
    get_page_context_builder,
    get_page_client_actions,
    has_page_payloads,
)
# Import global tool registry
from tools import get_all_tools, get_tools_dict
from services.agent_loop import (
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

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 2000
MAX_TOOL_ITERATIONS = 5  # Prevent runaway loops


class GeneralChatService:
    """Service for general chat interactions with tool support."""

    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.async_client = anthropic.AsyncAnthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def stream_chat_message(
        self,
        request,
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with tool support via SSE.

        Args:
            request: ChatRequest object (defined in routers.general_chat)
            cancellation_token: Optional token to check for cancellation

        Yields JSON strings of StreamEvent types (discriminated union)
        """
        # Create a no-op token if none provided
        if cancellation_token is None:
            cancellation_token = CancellationToken()

        try:
            # Build system prompt
            system_prompt = self._build_system_prompt(request.context)

            # Build user prompt
            user_prompt = self._build_user_prompt(
                request.message,
                request.context,
                request.interaction_type
            )

            # Build message history for LLM
            messages = [
                {"role": msg.role, "content": msg.content}
                for msg in request.conversation_history
            ]
            messages.append({"role": "user", "content": user_prompt})

            # Get all globally registered tools
            current_page = request.context.get("current_page", "unknown")
            tools_by_name = get_tools_dict()

            # Send initial status
            yield StatusEvent(message="Thinking...").model_dump_json()

            # Run the agent loop
            collected_text = ""
            tool_call_history = []
            collected_payloads = []  # Payloads from tools (separate from tool_history)
            tool_call_index = 0  # Track index for tool complete events

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
                    # Create marker token and inject into text stream
                    tool_marker = f"[[tool:{tool_call_index}]]"
                    collected_text += tool_marker

                    # Emit marker as text_delta so frontend sees it in stream
                    yield TextDeltaEvent(text=tool_marker).model_dump_json()

                    # Emit tool_complete event with matching index
                    yield ToolCompleteEvent(
                        tool=event.tool_name,
                        index=tool_call_index
                    ).model_dump_json()
                    tool_call_index += 1

                elif isinstance(event, (AgentComplete, AgentCancelled)):
                    tool_call_history = event.tool_calls
                    # Get payloads from tools (separate from tool_history which is for diagnostics)
                    collected_payloads = event.payloads

                elif isinstance(event, AgentError):
                    yield ErrorEvent(message=event.error).model_dump_json()
                    return

            # Parse the LLM response to extract structured data
            parsed = self._parse_llm_response(collected_text, request.context)

            # Use the last payload from tool execution, or parsed payload from LLM
            # Payloads are collected separately from tool_history (which is for diagnostics)
            custom_payload = None
            if collected_payloads:
                custom_payload = collected_payloads[-1]  # Use the most recent payload
            if not custom_payload:
                custom_payload = parsed.get("custom_payload")

            # Build final payload
            final_payload = ChatResponsePayload(
                message=parsed["message"],
                suggested_values=parsed.get("suggested_values"),
                suggested_actions=parsed.get("suggested_actions"),
                custom_payload=custom_payload,
                tool_history=tool_call_history if tool_call_history else None
            )

            # Emit complete event
            yield CompleteEvent(payload=final_payload).model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            yield ErrorEvent(message=f"Service error: {str(e)}").model_dump_json()

    def _load_report_context(self, report_id: int) -> Optional[str]:
        """
        Load report data from database and format it for the LLM context.
        Returns None if report not found or access denied.

        Note: Stream-specific chat instructions are loaded separately by
        _load_stream_instructions() based on stream_id in context.
        """
        from models import Report, ReportArticleAssociation, Article

        # Load report
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

        # Build article summaries
        articles_context = []
        for assoc, article in article_associations:
            articles_context.append({
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

        # Format category summaries
        category_summaries_text = ""
        if category_summaries:
            formatted = []
            for category, summary in category_summaries.items():
                formatted.append(f"\n### {category}\n{summary}")
            category_summaries_text = "\n".join(formatted)

        # Format highlights
        highlights_text = "No key highlights available."
        if report.key_highlights:
            highlights_text = "\n".join(f"- {h}" for h in report.key_highlights)

        # Build full report context
        return f"""
        === REPORT DATA (loaded from database) ===

        Report Name: {report.report_name}
        Report Date: {report.report_date}
        Total Articles: {len(articles_context)}

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

    def _get_response_format_instructions(self) -> str:
        """
        Get common response format instructions used by all prompts.
        This ensures consistent formatting across all chat modes.
        """
        return """
        RESPONSE FORMAT:

        Simply respond conversationally. Do NOT use any special formatting markers like MESSAGE:, SUGGESTED_VALUES:, or SUGGESTED_ACTIONS:.

        Just write your response naturally as you would in a conversation.
        """

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build system prompt based on user's context."""
        current_page = context.get("current_page", "unknown")

        # Check if this page has registered payload types
        if has_page_payloads(current_page):
            return self._build_payload_aware_prompt(current_page, context)

        # Regular conversational prompt
        return f"""You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        The user is currently on: {current_page}

        {self._get_response_format_instructions()}

        Keep responses simple and conversational.
        Help users understand what they can do in the application.
        """

    def _build_payload_aware_prompt(self, current_page: str, context: Dict[str, Any]) -> str:
        """Build system prompt dynamically based on registered payload types for this page."""
        # Get registered payload configurations
        all_payload_configs = get_page_payloads(current_page)

        # Filter payloads based on active_tab if present
        active_tab = context.get("active_tab")
        if active_tab:
            payload_configs = [
                config for config in all_payload_configs
                if config.relevant_tabs is None or active_tab in config.relevant_tabs
            ]
        else:
            payload_configs = all_payload_configs

        # Build page-specific context section
        page_context = self._build_page_context(current_page, context)

        # Build payload instructions from filtered configs
        payload_instructions = "\n\n".join([
            f"{config.llm_instructions}"
            for config in payload_configs
        ])

        # Get available client actions
        client_actions = get_page_client_actions(current_page)
        client_actions_text = ""
        if client_actions:
            actions_list = "\n".join([
                f"- {action.action}: {action.description}" +
                (f" (parameters: {', '.join(action.parameters)})" if action.parameters else "")
                for action in client_actions
            ])
            client_actions_text = f"""

            AVAILABLE CLIENT ACTIONS:
            You can suggest these client-side actions using SUGGESTED_ACTIONS format with handler='client':
            {actions_list}

            ONLY suggest client actions from the list above. Do not invent new client actions."""

        return f"""You are a helpful AI assistant for Knowledge Horizon.

        {page_context}

        YOUR ROLE:
        - Answer questions and help the user understand the page
        - When the user asks for recommendations, validation, or assistance, use the appropriate payload type
        - Use conversation history to understand context and provide relevant help
        - Be conversational and helpful

        {self._get_response_format_instructions()}

        AVAILABLE PAYLOAD TYPES:
        You can respond with structured payloads to provide rich interactions.
        Choose the appropriate payload type based on what the user needs:

        {payload_instructions}
        {client_actions_text}

        IMPORTANT:
        - Only use payloads when they add value
        - If just having a conversation, respond naturally without payloads
        - You can use multiple payloads in one response if relevant
        - Use conversation history to inform your responses
        """

    def _build_page_context(self, current_page: str, context: Dict[str, Any]) -> str:
        """Build page-specific context section of the prompt."""
        # Get the context builder from the registry
        context_builder = get_page_context_builder(current_page)

        base_context = ""
        if context_builder:
            base_context = context_builder(context)
        else:
            # Default context for unregistered pages
            base_context = f"The user is currently on: {current_page}"

        # Load stream-specific chat instructions if stream_id is in context
        stream_instructions = self._load_stream_instructions(context)
        if stream_instructions:
            base_context = stream_instructions + "\n" + base_context

        # For reports page, enrich with actual report data from database
        if current_page == "reports" and context.get("report_id"):
            report_id = context.get("report_id")
            try:
                report_data = self._load_report_context(report_id)
                if report_data:
                    base_context += "\n" + report_data
                else:
                    base_context += "\n\n(Unable to load report data - report may not exist or access denied)"
            except Exception as e:
                logger.warning(f"Failed to load report context for report_id={report_id}: {e}")
                base_context += f"\n\n(Error loading report data: {str(e)})"

        return base_context

    def _load_stream_instructions(self, context: Dict[str, Any]) -> Optional[str]:
        """
        Load stream-specific chat instructions based on stream_id in context.
        Returns formatted instructions section or None if not available.
        """
        from models import ResearchStream, Report

        stream_id = context.get("stream_id")

        # If no direct stream_id, try to get it from report_id
        if not stream_id and context.get("report_id"):
            report = self.db.query(Report).filter(
                Report.report_id == context.get("report_id"),
                Report.user_id == self.user_id
            ).first()
            if report:
                stream_id = report.research_stream_id

        if not stream_id:
            return None

        # Load the stream
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

    def _build_user_prompt(
        self,
        message: str,
        context: Dict[str, Any],
        interaction_type: str
    ) -> str:
        """Build user prompt with context."""
        context_summary = "\n".join([f"{k}: {v}" for k, v in context.items()])

        return f"""User's current context:
        {context_summary}

        Interaction type: {interaction_type}

        User's message: {message}"""

    def _parse_llm_response(self, response_text: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse LLM response to extract structured components.

        Looks for payload markers (e.g., SCHEMA_PROPOSAL:) in the LLM output
        and extracts structured payloads using registered parsers.
        """
        current_page = context.get("current_page", "unknown")

        result = {
            "message": response_text.strip(),
            "suggested_values": None,
            "suggested_actions": None,
            "custom_payload": None
        }

        # Get payload configurations for this page
        payload_configs = get_page_payloads(current_page)
        if not payload_configs:
            return result

        # Look for payload markers in the response
        for config in payload_configs:
            marker = config.parse_marker
            if marker in response_text:
                # Find the JSON content after the marker
                marker_pos = response_text.find(marker)
                after_marker = response_text[marker_pos + len(marker):].strip()

                # Extract JSON - find the matching braces
                json_content = self._extract_json(after_marker)
                if json_content:
                    # Parse using the registered parser
                    parsed = config.parser(json_content)
                    if parsed:
                        result["custom_payload"] = parsed
                        # Remove the payload from the message for cleaner display
                        payload_text = marker + json_content
                        result["message"] = response_text.replace(payload_text, "").strip()
                        break  # Only use first matched payload

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

    def _format_report_articles(articles: List[Dict[str, Any]]) -> str:
        """Format articles for the prompt, keeping it concise."""
        if not articles:
            return "No articles in this report."

        formatted = []
        for i, article in enumerate(articles[:30], 1):  # Limit to 30 articles to avoid token limits
            authors_str = ", ".join(article.get("authors", [])[:3])
            if len(article.get("authors", [])) > 3:
                authors_str += " et al."

            entry = f"""
            {i}. "{article.get('title', 'Untitled')}"
            Authors: {authors_str or 'Unknown'}
            Journal: {article.get('journal', 'Unknown')} ({article.get('year', 'Unknown')})
            Relevance: {f"{int(article.get('relevance_score', 0) * 100)}%" if article.get('relevance_score') else 'Not scored'}
            Category: {article.get('category', 'Uncategorized')}"""

            # Add relevance rationale if available (truncated)
            if article.get("relevance_rationale"):
                rationale = article["relevance_rationale"][:150]
                if len(article["relevance_rationale"]) > 150:
                    rationale += "..."
                entry += f"\n   Why relevant: {rationale}"

            # Add abstract snippet if available (first 200 chars)
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
