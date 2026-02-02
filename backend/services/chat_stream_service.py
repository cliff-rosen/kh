"""
Chat Streaming Service

Handles LLM streaming interaction for the chat system with tool support.
Uses the agent_loop for agentic processing. Handles chat persistence automatically.
"""

from typing import Dict, Any, AsyncGenerator, List, Optional, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import anthropic
import os
import logging
import uuid
from schemas.chat import (
    ChatResponsePayload,
    AgentTrace,
    FinalResponse,
    SuggestedValue,
    SuggestedAction,
    CustomPayload,
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
)
from schemas.payloads import summarize_payload
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

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.async_client = anthropic.AsyncAnthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
        self.chat_service = ChatService(db)
        self._association_service = None

    @property
    def association_service(self):
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

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
        chat_id = await self._setup_chat(request)

        try:
            # Inject conversation_id into context for tools that need it
            context_with_chat = dict(request.context)
            context_with_chat["conversation_id"] = chat_id

            # Build prompts
            system_prompt = await self._build_system_prompt(context_with_chat, chat_id)
            messages, _ = await self._build_messages(request, chat_id)  # Trace captures messages internally

            # Get tools for this page, tab, and subtab (global + page + tab + subtab)
            current_page = context_with_chat.get("current_page", "unknown")
            active_tab = context_with_chat.get("active_tab")
            active_subtab = context_with_chat.get("active_subtab")
            tools_by_name = get_tools_for_page_dict(current_page, active_tab, active_subtab)

            # Send initial status
            yield StatusEvent(message="Thinking...").model_dump_json()

            # Run the agent loop - it captures full trace internally
            collected_text = ""
            tool_call_history = []
            collected_payloads = []
            trace: Optional[AgentTrace] = None
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
                context=context_with_chat,
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
                    trace = event.trace  # Get full trace from agent loop

                elif isinstance(event, AgentError):
                    trace = event.trace  # Capture trace even on error
                    yield ErrorEvent(message=event.error).model_dump_json()
                    return

            # Parse response and build final payload
            parsed = self._parse_llm_response(collected_text, request.context)

            # Process and merge all payloads (from tools + parsed LLM response)
            all_payloads = list(collected_payloads)
            if parsed.get("custom_payload"):
                all_payloads.append(parsed["custom_payload"])

            # Assign IDs and summaries to payloads
            payloads_with_ids = self._process_payloads(all_payloads)

            # The "active" payload for UI rendering (last one, if any)
            custom_payload = payloads_with_ids[-1] if payloads_with_ids else None

            # Build suggested values/actions from parsed response
            suggested_values = None
            if parsed.get("suggested_values"):
                suggested_values = [SuggestedValue(**sv) for sv in parsed["suggested_values"]]

            suggested_actions = None
            if parsed.get("suggested_actions"):
                suggested_actions = [SuggestedAction(**sa) for sa in parsed["suggested_actions"]]

            custom_payload_obj = CustomPayload(**custom_payload) if custom_payload else None

            # Build tool history for final response
            tool_history_entries = None
            if tool_call_history:
                from schemas.chat import ToolHistoryEntry
                tool_history_entries = [ToolHistoryEntry(**th) for th in tool_call_history]

            # Add final response to trace (what's being sent to frontend)
            if trace:
                trace.final_response = FinalResponse(
                    message=parsed["message"],
                    suggested_values=suggested_values,
                    suggested_actions=suggested_actions,
                    custom_payload=custom_payload_obj,
                    tool_history=tool_history_entries,
                    conversation_id=chat_id,
                )

            # Build extras for persistence
            extras = {
                "tool_history": tool_call_history if tool_call_history else None,
                "custom_payload": custom_payload,  # For UI rendering
                "payloads": payloads_with_ids if payloads_with_ids else None,  # Full list for retrieval
                "trace": trace.model_dump() if trace else None,  # Full execution trace
                "suggested_values": parsed.get("suggested_values"),
                "suggested_actions": parsed.get("suggested_actions"),
            }
            # Remove None values to keep extras clean
            extras = {k: v for k, v in extras.items() if v is not None}

            # Persist assistant message
            await self._save_assistant_message(
                chat_id,
                parsed["message"],
                request.context,
                extras=extras if extras else None
            )

            # Emit complete event
            final_payload = ChatResponsePayload(
                message=parsed["message"],
                suggested_values=suggested_values,
                suggested_actions=suggested_actions,
                custom_payload=custom_payload_obj,
                tool_history=tool_call_history if tool_call_history else None,
                conversation_id=chat_id,
                diagnostics=trace  # AgentTrace is aliased as ChatDiagnostics for backwards compat
            )
            yield CompleteEvent(payload=final_payload).model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            yield ErrorEvent(message=f"Service error: {str(e)}").model_dump_json()

    # =========================================================================
    # Payload Processing
    # =========================================================================

    def _process_payloads(self, payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process payloads by assigning unique IDs and generating summaries.

        Args:
            payloads: List of raw payloads ({"type": str, "data": dict})

        Returns:
            List of processed payloads with payload_id and summary added
        """
        processed = []
        for payload in payloads:
            if not payload:
                continue

            payload_type = payload.get("type", "unknown")
            payload_data = payload.get("data", {})

            # Generate a short unique ID (first 8 chars of UUID)
            payload_id = str(uuid.uuid4())[:8]

            # Generate summary using the registry
            summary = summarize_payload(payload_type, payload_data)

            processed.append({
                "payload_id": payload_id,
                "type": payload_type,
                "data": payload_data,
                "summary": summary
            })

        return processed

    async def _build_payload_manifest(self, chat_id: Optional[int]) -> Optional[str]:
        """
        Build a manifest of all payloads from the conversation history (async).

        The manifest provides brief summaries of all payloads that have been
        generated during this conversation, allowing the LLM to reference
        them by ID using the get_payload tool.

        Args:
            chat_id: The conversation ID

        Returns:
            Formatted manifest string, or None if no payloads exist
        """
        if not chat_id:
            return None

        # Get all messages from this conversation
        messages = await self.chat_service.get_messages(chat_id, self.user_id)

        manifest_entries = []
        for msg in messages:
            if msg.role != 'assistant' or not msg.extras:
                continue

            payloads = msg.extras.get("payloads", [])
            for payload in payloads:
                payload_id = payload.get("payload_id")
                summary = payload.get("summary")
                if payload_id and summary:
                    manifest_entries.append(f"- [{payload_id}] {summary}")

        if not manifest_entries:
            return None

        return "AVAILABLE PAYLOADS (use get_payload tool to retrieve full data):\n" + "\n".join(manifest_entries)

    # =========================================================================
    # Chat Persistence Helpers
    # =========================================================================

    def _get_app_from_context(self, context: Dict[str, Any]) -> str:
        """
        Derive app identifier from context.
        Maps current_page to app: tablizer -> tablizer, trialscout -> trialscout, else -> kh
        """
        current_page = context.get("current_page", "")
        if current_page == "tablizer":
            return "tablizer"
        elif current_page == "trialscout":
            return "trialscout"
        return "kh"

    async def _setup_chat(self, request) -> Optional[int]:
        """
        Set up chat persistence and save user message (async).

        Returns chat_id or None if persistence fails.
        """
        try:
            chat_id = request.conversation_id
            app = self._get_app_from_context(request.context)

            if chat_id:
                chat = await self.chat_service.get_chat(chat_id, self.user_id)
                if not chat:
                    chat_id = None

            if not chat_id:
                chat = await self.chat_service.create_chat(self.user_id, app=app)
                chat_id = chat.id

            await self.chat_service.add_message(
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

    async def _save_assistant_message(
        self,
        chat_id: Optional[int],
        content: str,
        context: Dict[str, Any],
        extras: Optional[Dict[str, Any]] = None
    ) -> None:
        """Save assistant message to chat history (async)."""
        if not chat_id:
            return
        try:
            await self.chat_service.add_message(
                chat_id=chat_id,
                user_id=self.user_id,
                role='assistant',
                content=content,
                context=context,
                extras=extras
            )
        except Exception as e:
            logger.warning(f"Failed to persist assistant message: {e}")

    # =========================================================================
    # Message Building
    # =========================================================================

    async def _build_messages(self, request, chat_id: Optional[int] = None) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
        """
        Build message history for LLM (async).

        Loads conversation history from database if chat_id is provided,
        otherwise starts fresh.

        Note: Context is provided in the system prompt via _build_page_context,
        so user messages are sent as-is without context wrapping.

        Returns:
            tuple: (messages_for_llm, clean_history)
                - messages_for_llm: Full messages including current request
                - clean_history: Just the prior conversation (for diagnostics display)
        """
        history = []

        # Load history from database if we have a conversation
        # Exclude the last message - it's the current user message we just saved
        # in _setup_chat, and we'll add it below
        if chat_id:
            db_messages = await self.chat_service.get_messages(chat_id, self.user_id)
            # Skip the last message (the one we just saved)
            prior_messages = db_messages[:-1] if db_messages else []
            for msg in prior_messages:
                if msg.role in ('user', 'assistant'):
                    history.append({"role": msg.role, "content": msg.content})

        # User message sent as-is - context is already in system prompt
        messages_for_llm = history + [{"role": "user", "content": request.message}]

        return messages_for_llm, history

    # =========================================================================
    # System Prompt Building
    # =========================================================================

    async def _build_system_prompt(self, context: Dict[str, Any], chat_id: Optional[int] = None) -> str:
        """
        Build system prompt with clean structure (async).
        1. IDENTITY - Who the assistant is (page-specific or default)
        2. CONTEXT - Current page and loaded data
        3. PAYLOAD MANIFEST - Available payloads from conversation history (if any)
        4. CAPABILITIES - Available tools and payloads (only if any)
        5. HELP TABLE OF CONTENTS - Available help sections (role-filtered)
        6. CUSTOM INSTRUCTIONS - Stream-specific instructions (only if defined)
        7. GUIDELINES - Brief response guidance
        """
        from services.help_registry import get_help_toc_for_role

        current_page = context.get("current_page", "unknown")
        active_tab = context.get("active_tab")
        active_subtab = context.get("active_subtab")
        user_role = context.get("user_role", "member")

        sections = []

        # 1. IDENTITY
        current_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        identity = await self._get_identity(current_page)
        sections.append(f"{identity}\n\nCurrent date and time: {current_time}")

        # 2. CONTEXT (page context + loaded data)
        page_context = await self._build_page_context(current_page, context)
        if page_context:
            sections.append(f"== CURRENT CONTEXT ==\n{page_context}")

        # 3. PAYLOAD MANIFEST (payloads from conversation history, if any)
        payload_manifest = await self._build_payload_manifest(chat_id)
        if payload_manifest:
            sections.append(f"== CONVERSATION DATA ==\n{payload_manifest}")

        # 4. CAPABILITIES (tools + payloads + client actions, only if any exist)
        capabilities = self._build_capabilities_section(current_page, active_tab, active_subtab)
        if capabilities:
            sections.append(f"== CAPABILITIES ==\n{capabilities}")

        # 5. HELP TABLE OF CONTENTS (role-filtered help sections)
        try:
            help_toc = get_help_toc_for_role(user_role)
            if help_toc:
                sections.append(
                    f"== HELP TABLE OF CONTENTS ==\n"
                    f"When users ask how to do something, use get_help_section with a section_id below:\n{help_toc}"
                )
        except Exception as e:
            logger.error(f"Failed to load help TOC: {e}")

        # 6. CUSTOM INSTRUCTIONS (stream-specific, only if defined)
        stream_instructions = await self._load_stream_instructions(context)
        if stream_instructions:
            sections.append(f"== CUSTOM INSTRUCTIONS ==\n{stream_instructions}")

        # 7. GUIDELINES (always present, with page/global hierarchy)
        guidelines = await self._get_guidelines(current_page)
        sections.append(guidelines)

        return "\n\n".join(sections)

    def _build_capabilities_section(
        self,
        current_page: str,
        active_tab: Optional[str],
        active_subtab: Optional[str]
    ) -> str:
        """Build capabilities section listing available tools, payloads, and client actions."""
        from tools.registry import get_tools_for_page

        parts = []

        # Tools
        tools = get_tools_for_page(current_page, active_tab, active_subtab)
        if tools:
            tool_lines = [f"- {t.name}: {t.description}" for t in tools]
            parts.append("TOOLS:\n" + "\n".join(tool_lines))

        # LLM Payloads (structured response formats the LLM can generate)
        payload_configs = get_all_payloads_for_page(current_page, active_tab, active_subtab)
        llm_payloads = [c for c in payload_configs if c.llm_instructions]
        if llm_payloads:
            payload_instructions = "\n\n".join([c.llm_instructions for c in llm_payloads])
            parts.append(f"STRUCTURED RESPONSES:\n{payload_instructions}")

        # Client Actions
        client_actions = get_client_actions(current_page)
        if client_actions:
            actions_list = "\n".join([
                f"- {a.action}: {a.description}" for a in client_actions
            ])
            parts.append(
                f"CLIENT ACTIONS (these are the ONLY actions you may suggest):\n{actions_list}\n"
                f"To suggest: SUGGESTED_ACTIONS:\n[{{\"label\": \"Close\", \"action\": \"close_chat\", \"handler\": \"client\"}}]"
            )

        return "\n\n".join(parts)

    # Default identity (used if page doesn't define its own)
    DEFAULT_IDENTITY = "You are a helpful AI assistant for Knowledge Horizon, a biomedical research intelligence platform."

    # Default behavioral guidelines (used if page doesn't define its own)
    DEFAULT_GUIDELINES = """## Style
Be conversational and helpful. Keep responses concise and factual.

## Suggestions
Most responses should NOT include SUGGESTED_VALUES or SUGGESTED_ACTIONS.
Only use them when they genuinely help the user take a next step - for example, offering a few clear choices after listing options."""

    # Fixed format instructions (always appended, not configurable)
    SUGGESTION_FORMAT_INSTRUCTIONS = """
SUGGESTED VALUES (optional):
To offer quick-select text options the user can click to send as their next message:
SUGGESTED_VALUES:
[{"label": "Display Text", "value": "text to send"}]
Use this sparingly when a few specific choices would help (e.g., selecting from options you've listed).

SUGGESTED ACTIONS (optional, ONLY use actions listed in CLIENT ACTIONS above):
To offer clickable buttons that trigger UI actions. You may ONLY use actions explicitly listed in the CLIENT ACTIONS section above. Do NOT invent new actions.
SUGGESTED_ACTIONS:
[{"label": "Button Text", "action": "action_from_list", "handler": "client"}]

IMPORTANT: Most responses should NOT include suggested values or actions. Only use them when genuinely helpful."""

    async def _get_identity(self, current_page: str) -> str:
        """
        Get identity with hierarchy:
        1. DB page override
        2. Code page default
        3. Code global default
        """
        from models import ChatConfig
        from services.chat_page_config import get_identity as get_code_identity

        identity = None

        # 1. Check DB for page-level override
        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "page",
                    ChatConfig.scope_key == current_page
                )
            )
            page_config = result.scalars().first()
            if page_config and page_config.identity:
                identity = page_config.identity
        except Exception as e:
            logger.warning(f"Failed to check page identity override: {e}")

        # 2. Fall back to code page default
        if not identity:
            identity = get_code_identity(current_page)

        # 3. Fall back to code global default
        if not identity:
            identity = self.DEFAULT_IDENTITY

        return identity

    async def _get_guidelines(self, current_page: str) -> str:
        """
        Get behavioral guidelines with hierarchy:
        1. DB page override
        2. Code page default
        3. Code global default

        Always appends fixed format instructions for suggestions.
        """
        from models import ChatConfig
        from services.chat_page_config import get_guidelines as get_code_guidelines

        guidelines = None

        # 1. Check DB for page-level override
        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "page",
                    ChatConfig.scope_key == current_page
                )
            )
            page_config = result.scalars().first()
            if page_config and page_config.guidelines:
                guidelines = page_config.guidelines
        except Exception as e:
            logger.warning(f"Failed to check page guidelines override: {e}")

        # 2. Fall back to code page default
        if not guidelines:
            guidelines = get_code_guidelines(current_page)

        # 3. Fall back to code global default
        if not guidelines:
            guidelines = self.DEFAULT_GUIDELINES

        # Combine behavioral guidelines with fixed format instructions
        return f"== GUIDELINES ==\n{guidelines}\n{self.SUGGESTION_FORMAT_INSTRUCTIONS}"

    # =========================================================================
    # Context Loading
    # =========================================================================

    async def _build_page_context(self, current_page: str, context: Dict[str, Any]) -> str:
        """Build page-specific context section of the prompt (async)."""
        context_builder = get_context_builder(current_page)

        if context_builder:
            base_context = context_builder(context)
        else:
            base_context = f"The user is currently on: {current_page}"

        # For reports page, enrich with report data from database
        if current_page == "reports" and context.get("report_id"):
            report_id = context.get("report_id")
            try:
                report_data = await self._load_report_context(report_id, context)
                if report_data:
                    base_context += "\n" + report_data
                else:
                    base_context += "\n\n(Unable to load report data - report may not exist or access denied)"
            except Exception as e:
                logger.warning(f"Failed to load report context for report_id={report_id}: {e}")
                base_context += f"\n\n(Error loading report data: {str(e)})"

        return base_context

    async def _load_stream_instructions(self, context: Dict[str, Any]) -> Optional[str]:
        """Load stream-specific chat instructions based on stream_id in context (async).

        Instructions are stored in the chat_config table (scope='stream').
        """
        from models import Report, ChatConfig

        stream_id = context.get("stream_id")

        # Try to get stream_id from report_id if not directly provided
        if not stream_id and context.get("report_id"):
            stmt = select(Report).where(
                Report.report_id == context.get("report_id"),
                Report.user_id == self.user_id
            )
            result = await self.db.execute(stmt)
            report = result.scalars().first()
            if report:
                stream_id = report.research_stream_id

        if not stream_id:
            return None

        # Get instructions from chat_config table
        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "stream",
                    ChatConfig.scope_key == str(stream_id)
                )
            )
            config = result.scalars().first()
            if config and config.instructions:
                return config.instructions.strip()
        except Exception as e:
            logger.warning(f"Failed to load stream instructions: {e}")

        return None

    async def _load_report_context(self, report_id: int, context: Dict[str, Any]) -> Optional[str]:
        """Load report data from database and format it for LLM context (async)."""
        from models import Report

        stmt = select(Report).where(
            Report.report_id == report_id,
            Report.user_id == self.user_id
        )
        result = await self.db.execute(stmt)
        report = result.scalars().first()

        if not report:
            return None

        # Load visible articles (excludes hidden) - association_service uses async
        visible_associations = await self.association_service.get_visible_for_report(report_id)

        articles_context = []
        for assoc in visible_associations:
            article = assoc.article
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
        import json
        import re

        current_page = context.get("current_page", "unknown")
        active_tab = context.get("active_tab")
        active_subtab = context.get("active_subtab")

        message = response_text.strip()
        result = {
            "message": message,
            "suggested_values": None,
            "suggested_actions": None,
            "custom_payload": None
        }

        # Parse SUGGESTED_VALUES marker - find marker and everything after it on same/following lines
        values_marker = "SUGGESTED_VALUES:"
        if values_marker in message:
            marker_pos = message.find(values_marker)
            after_marker = message[marker_pos + len(values_marker):]
            # Strip leading whitespace/newlines before the JSON
            after_marker_stripped = after_marker.lstrip()
            json_content = self._extract_json_array(after_marker_stripped)
            if json_content:
                try:
                    parsed = json.loads(json_content)
                    if isinstance(parsed, list):
                        result["suggested_values"] = parsed
                        # Calculate whitespace between marker and JSON
                        whitespace_len = len(after_marker) - len(after_marker_stripped)
                        # Remove everything from marker through end of JSON
                        end_pos = marker_pos + len(values_marker) + whitespace_len + len(json_content)
                        message = (message[:marker_pos] + message[end_pos:]).strip()
                        result["message"] = message
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse SUGGESTED_VALUES JSON: {json_content[:100]}")

        # Parse SUGGESTED_ACTIONS marker
        actions_marker = "SUGGESTED_ACTIONS:"
        if actions_marker in message:
            marker_pos = message.find(actions_marker)
            after_marker = message[marker_pos + len(actions_marker):]
            after_marker_stripped = after_marker.lstrip()
            json_content = self._extract_json_array(after_marker_stripped)
            if json_content:
                try:
                    parsed = json.loads(json_content)
                    if isinstance(parsed, list):
                        result["suggested_actions"] = parsed
                        whitespace_len = len(after_marker) - len(after_marker_stripped)
                        end_pos = marker_pos + len(actions_marker) + whitespace_len + len(json_content)
                        message = (message[:marker_pos] + message[end_pos:]).strip()
                        result["message"] = message
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse SUGGESTED_ACTIONS JSON: {json_content[:100]}")

        # Parse custom payloads (page-specific structured responses)
        payload_configs = get_all_payloads_for_page(current_page, active_tab, active_subtab)
        for config in payload_configs:
            marker = config.parse_marker
            # Skip payloads without a parse_marker (tool payloads don't need parsing)
            if not marker:
                continue
            if marker in message:
                marker_pos = message.find(marker)
                after_marker_raw = message[marker_pos + len(marker):]
                after_marker = after_marker_raw.strip()
                json_content = self._extract_json_object(after_marker)
                if json_content:
                    parsed = config.parser(json_content)
                    if parsed:
                        result["custom_payload"] = parsed
                        # Find where JSON starts in the raw after_marker (preserving whitespace)
                        json_start_in_raw = after_marker_raw.find(json_content)
                        # Calculate full payload text including any whitespace between marker and JSON
                        payload_text = message[marker_pos:marker_pos + len(marker) + json_start_in_raw + len(json_content)]
                        message = message.replace(payload_text, "").strip()
                        result["message"] = message
                        break

        return result

    def _extract_json_object(self, text: str) -> Optional[str]:
        """Extract a JSON object from the start of text, handling nested braces."""
        if not text.startswith('{'):
            return None
        return self._extract_balanced(text, '{', '}')

    def _extract_json_array(self, text: str) -> Optional[str]:
        """Extract a JSON array from the start of text, handling nested brackets."""
        if not text.startswith('['):
            return None
        return self._extract_balanced(text, '[', ']')

    def _extract_balanced(self, text: str, open_char: str, close_char: str) -> Optional[str]:
        """Extract balanced content between open and close characters."""
        if not text or text[0] != open_char:
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

            if char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[:i + 1]

        return None


# Dependency injection providers
from fastapi import Depends
from database import get_async_db


async def get_chat_stream_service(
    db: AsyncSession = Depends(get_async_db)
) -> ChatStreamService:
    """
    Get a ChatStreamService instance with async database session.

    Note: user_id is not available at DI time, so we return a partial service
    that the endpoint must complete with user_id.
    """
    # Return a factory function since we need user_id at call time
    raise NotImplementedError("Use get_chat_stream_service_factory instead")


def get_chat_stream_service_factory(
    db: AsyncSession = Depends(get_async_db)
):
    """
    Get a factory for creating ChatStreamService instances.

    Usage in endpoint:
        factory = Depends(get_chat_stream_service_factory)
        service = factory(current_user.user_id)
    """
    def create_service(user_id: int) -> ChatStreamService:
        return ChatStreamService(db, user_id)
    return create_service
