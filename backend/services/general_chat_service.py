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
        current_schema = context.get("current_schema")

        # If editing a research stream, use schema-aware prompt
        if current_page == "edit_research_stream" and current_schema:
            return self._build_schema_aware_prompt(current_schema)

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

    def _build_schema_aware_prompt(self, current_schema: Dict[str, Any]) -> str:
        """Build system prompt for research stream editing context."""
        import json

        # Extract current values
        stream_name = current_schema.get("stream_name", "Not set")
        purpose = current_schema.get("purpose", "Not set")
        domain = current_schema.get("semantic_space", {}).get("domain", {})
        domain_name = domain.get("name", "Not set")
        domain_description = domain.get("description", "Not set")

        # Get topics if they exist
        topics = current_schema.get("semantic_space", {}).get("topics", [])
        topics_summary = f"{len(topics)} topics defined" if topics else "No topics defined yet"

        return f"""You are a helpful AI assistant for Knowledge Horizon, helping the user configure a research stream.

        The user is editing a research stream. Current values:
        - Stream Name: {stream_name}
        - Purpose: {purpose}
        - Domain Name: {domain_name}
        - Domain Description: {domain_description}
        - Topics: {topics_summary}

        RESEARCH STREAM SCHEMA FIELDS:

        1. stream_name: Short, clear name for the research stream (e.g., "Alzheimer's Clinical Trials")

        2. purpose: High-level explanation of why this stream exists (e.g., "Track emerging treatments for competitive intelligence")

        3. semantic_space.domain.name: The domain this research covers (e.g., "Neurodegenerative Disease Research")

        4. semantic_space.domain.description: Detailed description of what the domain encompasses

        5. semantic_space.topics: Array of topics to track, each with:
           - topic_id: Unique identifier (snake_case, e.g., "phase_3_trials")
           - name: Display name (e.g., "Phase 3 Clinical Trials")
           - description: What this topic covers
           - importance: "critical" | "important" | "relevant"
           - rationale: Why this topic matters

        6. semantic_space.context.business_context: Business context (e.g., "Defense litigation support", "Competitive intelligence")

        7. semantic_space.context.decision_types: What decisions this informs (array of strings)

        8. semantic_space.context.stakeholders: Who uses this information (array of strings)

        YOUR ROLE:
        - Answer questions about these fields and help the user understand what to enter
        - When the user describes what they want to track, ask clarifying questions to gather complete information
        - When the user explicitly requests recommendations or proposals, AND you have enough context from the conversation, propose concrete values using the format below
        - Use the conversation history to understand what the user wants

        {self._get_response_format_instructions()}

        SCHEMA PROPOSALS (specific to this page):
        When proposing schema values (ONLY when user asks for it and you have enough info):
        SCHEMA_PROPOSAL: {{
          "proposed_changes": {{
            "stream_name": "value",
            "purpose": "value",
            "semantic_space.domain.name": "value",
            "semantic_space.domain.description": "value",
            "semantic_space.context.business_context": "value",
            "semantic_space.topics": [
              {{
                "topic_id": "unique_id",
                "name": "Display Name",
                "description": "What this covers",
                "importance": "critical",
                "rationale": "Why this matters"
              }}
            ]
          }},
          "confidence": "high",
          "reasoning": "Based on our conversation, you mentioned X, Y, and Z, so I'm suggesting..."
        }}

        SCHEMA PROPOSAL GUIDELINES:
        - Only propose SCHEMA_PROPOSAL when the user has asked for recommendations/proposals
        - If you don't have enough information, ask clarifying questions instead
        - You can propose some or all fields - only propose what you're confident about
        - Use conversation history to inform your proposals
        - Be helpful and conversational
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
        schema_proposal_lines = []
        in_schema_proposal = False
        brace_count = 0

        for line in lines:
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                in_message = True
                in_schema_proposal = False
                # Get content after MESSAGE: on same line
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)

            elif stripped.startswith("SCHEMA_PROPOSAL:"):
                in_message = False
                in_schema_proposal = True
                brace_count = 0
                # Get content after SCHEMA_PROPOSAL: on same line
                content = stripped.replace("SCHEMA_PROPOSAL:", "").strip()
                if content:
                    schema_proposal_lines.append(content)
                    # Count braces in this line
                    brace_count += content.count('{') - content.count('}')

            elif in_schema_proposal:
                # Check if this line starts a new section
                if any(stripped.startswith(marker) for marker in ["MESSAGE:", "SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:"]):
                    # Stop collecting schema proposal
                    in_schema_proposal = False
                    # Don't process this line yet, let it fall through to be handled below
                else:
                    # Continue collecting schema proposal JSON lines
                    schema_proposal_lines.append(line.rstrip())
                    # Track brace count to detect end of JSON
                    brace_count += line.count('{') - line.count('}')

                    # If braces are balanced, we've reached the end of the JSON
                    if brace_count == 0 and len(schema_proposal_lines) > 0:
                        in_schema_proposal = False
                        continue

            elif in_message and not any(stripped.startswith(marker) for marker in ["SUGGESTED_VALUES:", "SUGGESTED_ACTIONS:", "SCHEMA_PROPOSAL:"]):
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

        # Join message lines
        if message_lines:
            result["message"] = "\n".join(message_lines).strip()

        # Parse schema proposal if present
        if schema_proposal_lines:
            try:
                schema_json = "\n".join(schema_proposal_lines).strip()
                schema_data = json.loads(schema_json)
                result["payload"] = {
                    "type": "schema_proposal",
                    "data": schema_data
                }
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse SCHEMA_PROPOSAL JSON: {e}")
                # Don't fail the whole response, just skip the proposal

        # If no message was extracted, use the whole response
        if not result["message"]:
            result["message"] = response_text

        return result
