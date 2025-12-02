"""
General-purpose chat service
Handles LLM interaction for the general chat system
"""

from typing import Dict, Any, AsyncGenerator, List, Optional
from sqlalchemy.orm import Session
import anthropic
import os
import logging

from schemas.general_chat import (
    ChatResponsePayload
)
# Import chat payloads package (auto-registers all page configurations)
from services.chat_payloads import (
    get_page_payloads,
    get_page_context_builder,
    get_page_client_actions,
    get_page_tools,
    has_page_payloads,
    ToolConfig
)

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 2000
MAX_TOOL_ITERATIONS = 5  # Prevent runaway loops


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


def _tools_to_anthropic_format(tools: List[ToolConfig]) -> List[Dict[str, Any]]:
    """Convert ToolConfig objects to Anthropic API tool format."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema
        }
        for tool in tools
    ]


class GeneralChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    def _load_report_context(self, report_id: int) -> Optional[str]:
        """
        Load report data from database and format it for the LLM context.
        Returns None if report not found or access denied.
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
        {_format_report_articles(articles_context)}
        """

    async def stream_chat_message(self, request) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates via SSE.
        Supports an agentic loop where the LLM can call tools.

        Args:
            request: ChatRequest object (defined in routers.general_chat)

        Yields JSON strings matching ChatStreamChunk or ChatStatusResponse schemas
        (Response models defined in routers.general_chat)
        """
        # Late import to avoid circular dependency
        from routers.general_chat import ChatStreamChunk, ChatStatusResponse

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

            # Get tools for this page
            current_page = request.context.get("current_page", "unknown")
            page_tools = get_page_tools(current_page)
            tools_by_name = {tool.name: tool for tool in page_tools}
            anthropic_tools = _tools_to_anthropic_format(page_tools) if page_tools else None

            # Send status update that we're calling the LLM
            status_response = ChatStatusResponse(
                status="Thinking...",
                payload={"context": current_page},
                error=None,
                debug=None
            )
            yield status_response.model_dump_json()

            # Agentic loop - continue until we get a final response or hit max iterations
            iteration = 0
            collected_text = ""

            while iteration < MAX_TOOL_ITERATIONS:
                iteration += 1

                # Call Claude API - use non-streaming for tool calls, streaming for final response
                if anthropic_tools:
                    # When tools are available, we need to check for tool use
                    response = self.client.messages.create(
                        model=CHAT_MODEL,
                        max_tokens=CHAT_MAX_TOKENS,
                        temperature=0.0,
                        system=system_prompt,
                        messages=messages,
                        tools=anthropic_tools
                    )

                    # Check if the response contains tool use
                    tool_use_blocks = [block for block in response.content if block.type == "tool_use"]
                    text_blocks = [block for block in response.content if block.type == "text"]

                    if tool_use_blocks:
                        # Process tool calls
                        tool_block = tool_use_blocks[0]  # Handle one tool at a time
                        tool_name = tool_block.name
                        tool_input = tool_block.input
                        tool_use_id = tool_block.id

                        logger.info(f"Tool call: {tool_name} with input: {tool_input}")

                        # Send status update about tool execution
                        tool_status = ChatStatusResponse(
                            status=f"Using {tool_name}...",
                            payload={"tool": tool_name},
                            error=None,
                            debug=None
                        )
                        yield tool_status.model_dump_json()

                        # Execute the tool
                        tool_config = tools_by_name.get(tool_name)
                        if tool_config:
                            try:
                                tool_result = tool_config.executor(
                                    tool_input,
                                    self.db,
                                    self.user_id,
                                    request.context
                                )
                                tool_result_str = str(tool_result) if not isinstance(tool_result, str) else tool_result
                            except Exception as e:
                                logger.error(f"Tool execution error: {e}", exc_info=True)
                                tool_result_str = f"Error executing tool: {str(e)}"
                        else:
                            tool_result_str = f"Unknown tool: {tool_name}"

                        # Add assistant message with tool use and tool result to messages
                        messages.append({
                            "role": "assistant",
                            "content": response.content
                        })
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tool_use_id,
                                    "content": tool_result_str
                                }
                            ]
                        })

                        # Continue the loop to get the next response
                        continue

                    else:
                        # No tool use - extract text and finish
                        for block in text_blocks:
                            collected_text += block.text
                        # Stream the collected text token by token for UX
                        for char in collected_text:
                            token_response = ChatStreamChunk(
                                token=char,
                                response_text=None,
                                payload=None,
                                status="streaming",
                                error=None,
                                debug=None
                            )
                            yield token_response.model_dump_json()
                        break

                else:
                    # No tools - use streaming as before
                    stream = self.client.messages.stream(
                        model=CHAT_MODEL,
                        max_tokens=CHAT_MAX_TOKENS,
                        temperature=0.0,
                        system=system_prompt,
                        messages=messages
                    )

                    with stream as stream_manager:
                        for text in stream_manager.text_stream:
                            collected_text += text
                            # Stream each token as it arrives
                            token_response = ChatStreamChunk(
                                token=text,
                                response_text=None,
                                payload=None,
                                status="streaming",
                                error=None,
                                debug=None
                            )
                            yield token_response.model_dump_json()
                    break  # No tools means we're done after first response

            # Parse the LLM response to extract structured data
            parsed = self._parse_llm_response(collected_text, request.context)

            # Build final payload
            final_payload = ChatResponsePayload(
                message=parsed["message"],
                suggested_values=parsed.get("suggested_values"),
                suggested_actions=parsed.get("suggested_actions"),
                custom_payload=parsed.get("custom_payload")
            )

            # Send final response with structured data
            final_response = ChatStreamChunk(
                token=None,
                response_text=None,
                payload=final_payload,
                status="complete",
                error=None,
                debug=None
            )
            yield final_response.model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            error_response = ChatStreamChunk(
                token=None,
                response_text=None,
                payload=None,
                status=None,
                error=f"Service error: {str(e)}",
                debug={"error_type": type(e).__name__}
            )
            yield error_response.model_dump_json()

    def _get_response_format_instructions(self) -> str:
        """
        Get common response format instructions used by all prompts.
        This ensures consistent formatting across all chat modes.
        """
        return """
        RESPONSE FORMAT:

        Always start with a conversational message:
        MESSAGE: [Your response to the user]

        Optional elements you can include:

        1. SUGGESTED_VALUES (clickable quick replies):
        Format: Comma-separated values
        Example: SUGGESTED_VALUES: Yes, No, Tell me more

        2. SUGGESTED_ACTIONS (action buttons):
        Format: label|action|handler|style|data

        CRITICAL REQUIREMENTS:
        - Position 1 (label): Button text shown to user
        - Position 2 (action): Action identifier
        - Position 3 (handler): MUST be EXACTLY "client" OR "server" (no other values!)
        - Position 4 (style): MUST be "primary", "secondary", or "warning"
        - Position 5 (data): Optional JSON object with parameters
        - Separate multiple actions with semicolons (;)

        Examples without data:
        SUGGESTED_ACTIONS: View Results|view_results|client|primary
        SUGGESTED_ACTIONS: Save|save|server|primary; Cancel|cancel|client|secondary

        Examples with data:
        SUGGESTED_ACTIONS: Edit Item|edit_item|client|primary|{{"item_id":"123"}}; Delete|delete|server|warning|{{"item_id":"123"}}

        CRITICAL: Position 3 must ALWAYS be "client" or "server" - never put IDs, names, or other data there!
        Use position 5 for any data you need to pass!
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

        Available actions:
        - Client actions (no backend call): close, cancel, navigate, copy, edit, view
        - Server actions (backend processes): create_stream, execute_search, update, delete

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
        - If just having a conversation, use MESSAGE without payloads
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

        User's message: {message}

        Respond with MESSAGE and optional SUGGESTED_VALUES or SUGGESTED_ACTIONS."""

    def _parse_llm_response(self, response_text: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse LLM response to extract structured components.
        Dynamically handles all registered payload types for the current page.
        """
        import json

        result = {
            "message": "",
            "suggested_values": None,
            "suggested_actions": None,
            "custom_payload": None
        }

        # Get registered payload configs to know what markers to look for
        current_page = context.get("current_page", "unknown")
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

        payload_markers = {config.parse_marker: config for config in payload_configs}

        lines = response_text.split('\n')
        message_lines = []
        in_message = False

        # Dynamic payload tracking
        current_payload_config = None
        payload_lines = []
        brace_count = 0

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                in_message = True
                current_payload_config = None
                # Get content after MESSAGE: on same line
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)

            # Check for any registered payload marker
            elif any(stripped.startswith(marker) for marker in payload_markers.keys()):
                in_message = False
                # Find which marker this is
                for marker, config in payload_markers.items():
                    if stripped.startswith(marker):
                        current_payload_config = config
                        payload_lines = []
                        brace_count = 0
                        # Get content after marker on same line
                        content = stripped.replace(marker, "").strip()
                        if content:
                            payload_lines.append(content)
                            # Count braces in this line
                            brace_count += content.count('{') - content.count('}')
                        break

            elif current_payload_config is not None:
                # Check if this line starts a new section
                all_section_markers = ["MESSAGE:", "SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"] + list(payload_markers.keys())
                if any(stripped.startswith(marker) for marker in all_section_markers):
                    # Parse and save the collected payload
                    if payload_lines:
                        self._parse_and_save_payload(result, current_payload_config, payload_lines)
                    # Stop collecting this payload
                    current_payload_config = None
                    payload_lines = []
                    # Don't process this line yet, let it fall through to be handled in next iteration
                    # We need to re-process this line, so back up
                    continue
                else:
                    # Continue collecting payload JSON lines
                    payload_lines.append(line.rstrip())
                    # Track brace count to detect end of JSON
                    brace_count += line.count('{') - line.count('}')

                    # If braces are balanced, we've reached the end of the JSON
                    if brace_count == 0 and len(payload_lines) > 0:
                        # Parse and save the collected payload
                        self._parse_and_save_payload(result, current_payload_config, payload_lines)
                        current_payload_config = None
                        payload_lines = []
                        continue

            elif in_message and not any(stripped.startswith(marker) for marker in ["SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"] + list(payload_markers.keys())):
                # Continue collecting message lines
                message_lines.append(line.rstrip())

            elif stripped.startswith("SUGGESTED_VALUES:"):
                in_message = False
                current_payload_config = None
                values_str = stripped.replace("SUGGESTED_VALUES:", "").strip()
                if values_str:
                    result["suggested_values"] = [
                        {"label": v.strip(), "value": v.strip()}
                        for v in values_str.split(",")
                    ]

            elif stripped.startswith("SUGGESTED_ACTIONS:"):
                in_message = False
                current_payload_config = None
                actions_str = stripped.replace("SUGGESTED_ACTIONS:", "").strip()
                if actions_str:
                    actions = []
                    # Actions separated by semicolons
                    for action_str in actions_str.split(";"):
                        parts = action_str.split("|")
                        if len(parts) >= 3:
                            # Validate handler - only accept valid literal values
                            handler = parts[2].strip()
                            if handler not in ["client", "server"]:
                                logger.warning(f"Invalid handler '{handler}' in action, skipping")
                                continue

                            action = {
                                "label": parts[0].strip(),
                                "action": parts[1].strip(),
                                "handler": handler
                            }
                            if len(parts) > 3:
                                # Validate style - only accept valid literal values
                                style = parts[3].strip()
                                if style in ["primary", "secondary", "warning"]:
                                    action["style"] = style
                            if len(parts) > 4:
                                try:
                                    action["data"] = json.loads(parts[4])
                                except:
                                    pass
                            actions.append(action)
                    result["suggested_actions"] = actions

        # Handle any remaining payload being collected at end of response
        if current_payload_config is not None and payload_lines:
            self._parse_and_save_payload(result, current_payload_config, payload_lines)

        # Join message lines
        if message_lines:
            result["message"] = "\n".join(message_lines).strip()

        # If no message was extracted, use the whole response
        if not result["message"]:
            result["message"] = response_text

        return result

    def _parse_and_save_payload(self, result: Dict[str, Any], config: Any, payload_lines: list):
        """Parse a payload using its registered parser and save to result."""
        try:
            payload_text = "\n".join(payload_lines).strip()
            parsed_payload = config.parser(payload_text)
            if parsed_payload:
                result["custom_payload"] = parsed_payload
        except Exception as e:
            logger.warning(f"Failed to parse {config.type} payload: {e}")
