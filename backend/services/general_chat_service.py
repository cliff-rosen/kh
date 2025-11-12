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
    ChatRequest, ChatResponse, ChatPayload,
    ChatAgentResponse, ChatStatusResponse,
    SuggestedValue, SuggestedAction, CustomPayload
)

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
            parsed = self._parse_llm_response(collected_text)

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

    def _build_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build system prompt based on user's context."""
        current_page = context.get("current_page", "unknown")

        return f"""You are a helpful AI assistant for Knowledge Horizon,
        a biomedical research intelligence platform.

        The user is currently on: {current_page}

        Your responses should be structured in this format:

        MESSAGE: [Your conversational response to the user]
        SUGGESTED_VALUES: [Optional comma-separated values user can select]
        SUGGESTED_ACTIONS: [Optional actions with format: label|action|handler|style]

        SUGGESTED_VALUES are clickable chips that send a message back to continue conversation.
        Example: SUGGESTED_VALUES: Yes, No, Tell me more

        SUGGESTED_ACTIONS are buttons that execute actions (client or server).
        Format: label|action|handler|style (separated by semicolons for multiple actions)
        Style must be one of: primary, secondary, warning
        Example: SUGGESTED_ACTIONS: View Results|view_results|client|primary; Close|close|client|secondary

        Client actions (no backend call): close, cancel, navigate, copy
        Server actions (processed by backend): create_stream, execute_search

        For now, keep responses simple and conversational.
        Help users understand what they can do in the application.
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

        User's message: {message}

        Respond with MESSAGE and optional SUGGESTED_VALUES or SUGGESTED_ACTIONS."""

    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """
        Parse LLM response to extract structured components.
        """
        import json

        result = {
            "message": "",
            "suggested_values": None,
            "suggested_actions": None,
            "payload": None
        }

        lines = response_text.split('\n')
        message_lines = []
        in_message = False

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                in_message = True
                # Get content after MESSAGE: on same line
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)

            elif in_message and not any(stripped.startswith(marker) for marker in ["SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:", "PAYLOAD_TYPE:", "PAYLOAD:"]):
                # Continue collecting message lines
                message_lines.append(line.rstrip())

            elif stripped.startswith("SUGGESTED_VALUES:"):
                in_message = False
                values_str = stripped.replace("SUGGESTED_VALUES:", "").strip()
                if values_str:
                    result["suggested_values"] = [
                        {"label": v.strip(), "value": v.strip()}
                        for v in values_str.split(",")
                    ]

            elif stripped.startswith("SUGGESTED_ACTIONS:"):
                in_message = False
                actions_str = stripped.replace("SUGGESTED_ACTIONS:", "").strip()
                if actions_str:
                    actions = []
                    # Actions separated by semicolons
                    for action_str in actions_str.split(";"):
                        parts = action_str.split("|")
                        if len(parts) >= 3:
                            action = {
                                "label": parts[0].strip(),
                                "action": parts[1].strip(),
                                "handler": parts[2].strip()
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

        # Join message lines
        if message_lines:
            result["message"] = "\n".join(message_lines).strip()

        # If no message was extracted, use the whole response
        if not result["message"]:
            result["message"] = response_text

        return result
