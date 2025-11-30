"""
General-purpose chat service
Handles LLM interaction for the general chat system
"""

from typing import Dict, Any, AsyncGenerator
from sqlalchemy.orm import Session
import anthropic
import os
import logging

from schemas.general_chat import (
    ChatRequest,
    ChatPayload,
    ChatAgentResponse,
    ChatStatusResponse,
    SuggestedValue,
    SuggestedAction,
    CustomPayload
)
# Import chat payloads package (auto-registers all page configurations)
from services.chat_payloads import get_page_payloads, get_page_context_builder, has_page_payloads

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 2000


class GeneralChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def stream_chat_message(self, request: ChatRequest) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates via SSE.

        Yields JSON strings of ChatAgentResponse or ChatStatusResponse
        """
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

            # Send status update that we're calling the LLM
            status_response = ChatStatusResponse(
                status="Thinking...",
                payload={"context": request.context.get("current_page", "unknown")},
                error=None,
                debug=None
            )
            yield status_response.model_dump_json()

            # Call Claude API with streaming
            collected_text = ""

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
                    token_response = ChatAgentResponse(
                        token=text,
                        response_text=None,
                        payload=None,
                        status="streaming",
                        error=None,
                        debug=None
                    )
                    yield token_response.model_dump_json()

            # Parse the LLM response to extract structured data
            parsed = self._parse_llm_response(collected_text, request.context.get("current_page", "unknown"))

            # Build final payload
            final_payload = ChatPayload(
                message=parsed["message"],
                suggested_values=parsed.get("suggested_values"),
                suggested_actions=parsed.get("suggested_actions"),
                payload=parsed.get("payload")
            )

            # Send final response with structured data
            final_response = ChatAgentResponse(
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
            error_response = ChatAgentResponse(
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
        payload_configs = get_page_payloads(current_page)

        # Build page-specific context section
        page_context = self._build_page_context(current_page, context)

        # Build payload instructions from all registered configs
        payload_instructions = "\n\n".join([
            f"{config.llm_instructions}"
            for config in payload_configs
        ])

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

        if context_builder:
            return context_builder(context)

        # Default context for unregistered pages
        return f"The user is currently on: {current_page}"

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

    def _parse_llm_response(self, response_text: str, current_page: str) -> Dict[str, Any]:
        """
        Parse LLM response to extract structured components.
        Dynamically handles all registered payload types for the current page.
        """
        import json

        result = {
            "message": "",
            "suggested_values": None,
            "suggested_actions": None,
            "payload": None
        }

        # Get registered payload configs to know what markers to look for
        payload_configs = get_page_payloads(current_page)
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
                result["payload"] = parsed_payload
        except Exception as e:
            logger.warning(f"Failed to parse {config.type} payload: {e}")
