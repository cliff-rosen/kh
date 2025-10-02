"""
Research Stream Chat Service for AI-guided research stream creation
Handles the interview flow and LLM integration
"""

from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional, AsyncGenerator
import anthropic
import os
import json
from schemas.agent_responses import AgentResponse, StatusResponse
from schemas.research_stream import PartialStreamConfig
from services.research_stream_creation_workflow import ResearchStreamCreationWorkflow

STREAM_CHAT_MODEL = "claude-sonnet-4-20250514"
STREAM_CHAT_MAX_TOKENS = 2000

class ResearchStreamChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def stream_chat_message(
        self,
        message: str,
        current_config: PartialStreamConfig,
        current_step: str
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates via SSE.
        Uses workflow controller for state management and LLM for conversation.
        """

        # Initialize workflow controller
        workflow = ResearchStreamCreationWorkflow(current_step, current_config)

        # Get guidance from workflow for this step
        step_guidance = workflow.get_step_guidance()

        # Build conversation context for the LLM using workflow guidance
        system_prompt = self._build_system_prompt(step_guidance)
        user_prompt = self._build_user_prompt(message, current_config, step_guidance)

        # Send status update that we're calling the LLM
        status_response = StatusResponse(
            status="Thinking about your response...",
            payload={"tool": "claude_api", "step": current_step},
            error=None,
            debug=None
        )
        yield status_response.model_dump_json()

        # Call Claude API with streaming
        collected_text = ""

        stream = self.client.messages.stream(
            model=STREAM_CHAT_MODEL,
            max_tokens=STREAM_CHAT_MAX_TOKENS,
            temperature=1.0,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": user_prompt
            }]
        )

        with stream as stream_manager:
            for text in stream_manager.text_stream:
                collected_text += text
                # Stream each token as it arrives
                token_response = AgentResponse(
                    token=text,
                    response_text=None,
                    payload=None,
                    status="streaming",
                    error=None,
                    debug=None
                )
                yield token_response.model_dump_json()

        # Parse the LLM response to extract structured data
        extracted_data = self._parse_llm_response(collected_text)

        # Update workflow config with extracted data
        if extracted_data.get("updates"):
            workflow.update_config(extracted_data["updates"])

        # Let workflow determine next step (not the LLM)
        next_step = workflow.get_next_step()

        # Send final response with structured data
        final_response = AgentResponse(
            token=None,
            response_text=None,
            payload={
                "message": extracted_data.get("message", collected_text),
                "next_step": next_step.value,
                "updated_config": workflow.config.model_dump(),
                "suggestions": extracted_data.get("suggestions"),
                "options": extracted_data.get("options")
            },
            status="complete",
            error=None,
            debug=None
        )
        yield final_response.model_dump_json()

    def _build_system_prompt(self, step_guidance: Dict[str, Any]) -> str:
        """Build system prompt using workflow guidance instead of hardcoded flow"""
        return f"""You are an AI assistant helping users create research streams for Knowledge Horizon,
            a biomedical and business intelligence platform.

            Your role is to have a natural, conversational interaction with the user to collect information.
            The workflow system will handle state management and determine what step comes next.

            Current Step Objective: {step_guidance.get('objective', 'Collect information')}
            Information to Collect: {step_guidance.get('collect', 'User input')}

            Guidelines:
            - Be conversational, friendly, and helpful
            - Ask clear, focused questions
            - When the user mentions therapeutic areas, suggest related areas from your knowledge
            - When discussing companies, suggest relevant ones active in the mentioned areas
            - Extract information from natural language responses
            - If this step provides suggestions, include them in your response

            Return your response in this format:
            MESSAGE: [Your conversational message to the user - this is what they will see]
            EXTRACTED_DATA: [field_name]=[value] (if you extracted information from their response)
            SUGGESTIONS: [comma-separated list] (if providing therapeutic areas or companies)
            OPTIONS: [option1|option2|option3] (if providing checkbox options)

            Note: You do NOT need to determine the next step - the workflow system handles that.
            Just focus on having a good conversation and extracting relevant information."""

    def _build_user_prompt(
        self,
        message: str,
        current_config: PartialStreamConfig,
        step_guidance: Dict[str, Any]
    ) -> str:
        """Build user prompt with workflow context"""
        # Convert Pydantic model to dict and filter out None values
        config_dict = {k: v for k, v in current_config.model_dump().items() if v is not None}
        config_summary = "\n".join([f"{k}: {v}" for k, v in config_dict.items()])

        # Include any example questions from workflow guidance
        example_questions = step_guidance.get('example_questions', [])
        examples_text = "\n".join([f"- {q}" for q in example_questions]) if example_questions else ""

        prompt_parts = [
            "Current configuration so far:",
            config_summary if config_summary else "No information collected yet",
            ""
        ]

        if examples_text:
            prompt_parts.append("Example questions you could ask:")
            prompt_parts.append(examples_text)
            prompt_parts.append("")

        prompt_parts.extend([
            f"User's message: {message}",
            "",
            "Based on the user's message, provide a conversational response and extract any relevant information."
        ])

        return "\n".join(prompt_parts)

    def _parse_llm_response(
        self,
        assistant_message: str
    ) -> Dict[str, Any]:
        """
        Parse the LLM response and extract structured data.
        LLM now only returns MESSAGE, EXTRACTED_DATA, SUGGESTIONS, and OPTIONS.
        Workflow controller determines next step.
        """
        response_message = ""
        updates = {}
        suggestions = {}
        options = []

        # Extract MESSAGE (everything until first structured field marker)
        message_match = assistant_message.split('\n')
        in_message = False
        message_lines = []

        for line in assistant_message.split('\n'):
            stripped = line.strip()

            if stripped.startswith("MESSAGE:"):
                in_message = True
                # Get content after MESSAGE: on same line
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)
            elif in_message and not any(stripped.startswith(marker) for marker in ["EXTRACTED_DATA:", "SUGGESTIONS:", "OPTIONS:"]):
                # Continue collecting message lines
                message_lines.append(line.rstrip())
            elif stripped.startswith("EXTRACTED_DATA:"):
                in_message = False
                field_update = stripped.replace("EXTRACTED_DATA:", "").strip()
                if field_update and "=" in field_update:
                    field, value = field_update.split("=", 1)
                    field_name = field.strip()
                    field_value = value.strip()

                    # Handle list fields - competitors and focus_areas should be lists
                    if field_name in ['competitors', 'focus_areas'] and field_value:
                        # Split by comma if it's a comma-separated list, otherwise wrap in list
                        if ',' in field_value:
                            updates[field_name] = [v.strip() for v in field_value.split(',')]
                        else:
                            updates[field_name] = [field_value]
                    else:
                        updates[field_name] = field_value
            elif stripped.startswith("SUGGESTIONS:"):
                in_message = False
                suggestion_list = stripped.replace("SUGGESTIONS:", "").strip()
                if suggestion_list:  # Only process if not empty
                    suggestions_array = [s.strip() for s in suggestion_list.split(",") if s.strip()]
                    if suggestions_array:  # Only add if array is not empty
                        # Store as therapeutic_areas by default, can be overridden
                        suggestions['therapeutic_areas'] = suggestions_array
            elif stripped.startswith("OPTIONS:"):
                in_message = False
                options_list = stripped.replace("OPTIONS:", "").strip()
                if options_list:  # Only process if not empty
                    options = [
                        {"label": opt.strip(), "value": opt.strip(), "checked": False}
                        for opt in options_list.split("|")
                        if opt.strip()  # Skip empty options
                    ]

        response_message = "\n".join(message_lines).strip()

        # If no message was extracted, use the whole response
        if not response_message:
            response_message = assistant_message

        return {
            "message": response_message,
            "updates": updates if updates else None,
            "suggestions": suggestions if suggestions else None,
            "options": options if options else None
        }
