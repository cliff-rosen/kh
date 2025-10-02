"""
Stream Chat Service for AI-guided research stream creation
Handles the interview flow and LLM integration
"""

from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional, AsyncGenerator
import anthropic
import os
import json
from schemas.agent_responses import AgentResponse, StatusResponse

class StreamChatService:
    def __init__(self, db: Session, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def process_message(
        self,
        message: str,
        current_config: Dict[str, Any],
        current_step: str
    ) -> Dict[str, Any]:
        """
        Process a user message and return the next step in the interview
        """

        # Build conversation context for the LLM
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(message, current_config, current_step)

        # Call Claude API
        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=system_prompt,
            messages=[{
                "role": "user",
                "content": user_prompt
            }]
        )

        # Parse the LLM response
        assistant_message = response.content[0].text

        # Extract structured data from the response
        result = self._parse_llm_response(
            assistant_message,
            message,
            current_config,
            current_step
        )

        return result

    async def stream_message(
        self,
        message: str,
        current_config: Dict[str, Any],
        current_step: str
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates
        """

        # Build conversation context for the LLM
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(message, current_config, current_step)

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
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
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

        # Parse the complete LLM response
        result = self._parse_llm_response(
            collected_text,
            message,
            current_config,
            current_step
        )

        # Send final response with structured data
        final_response = AgentResponse(
            token=None,
            response_text=None,
            payload={
                "message": result["message"],
                "next_step": result["next_step"],
                "updated_config": result["updated_config"],
                "suggestions": result.get("suggestions"),
                "options": result.get("options")
            },
            status="complete",
            error=None,
            debug=None
        )
        yield final_response.model_dump_json()

    def _build_system_prompt(self) -> str:
        return """You are an AI assistant helping users create research streams for Knowledge Horizon,
            a biomedical and business intelligence platform. Your role is to guide users through an interview
            to gather the necessary information to create a research stream.

            A research stream needs the following information:
            1. stream_name: A descriptive name for the research stream
            2. description: What the stream will monitor
            3. stream_type: One of: competitive, regulatory, clinical, market, scientific, mixed
            4. focus_areas: Therapeutic areas, topics, or domains to monitor (e.g., "Heart Failure", "Oncology")
            5. competitors: Companies or organizations to monitor (if relevant)
            6. report_frequency: One of: daily, weekly, biweekly, monthly

            Guidelines:
            - Be conversational and friendly
            - Ask one question at a time
            - When the user mentions a therapeutic area or domain, search your knowledge to suggest related areas
            - When suggesting companies, think about which are active in the mentioned therapeutic areas
            - Extract information from natural language responses
            - Move to the next step when you have enough information
            - Be helpful in understanding what information is needed

            Current interview flow:
            1. intro: Greet and ask about their business focus
            2. name: Determine the stream name based on their focus
            3. type: Determine stream type based on their needs
            4. focus: Get focus areas/therapeutic areas
            5. competitors: Get competitors to monitor (if applicable)
            6. frequency: Determine report frequency
            7. review: Show summary and confirm
            8. complete: Finish

            Return your response in this format:
            MESSAGE: [Your conversational message to the user]
            NEXT_STEP: [intro|name|type|focus|competitors|frequency|review|complete]
            UPDATED_FIELD: [field_name]=[value] (if extracting a value)
            SUGGESTIONS: [comma-separated list] (if providing therapeutic areas or companies)
            OPTIONS: [option1|option2|option3] (if providing checkbox options)"""

    def _build_user_prompt(
        self,
        message: str,
        current_config: Dict[str, Any],
        current_step: str
    ) -> str:
        config_summary = "\n".join([f"{k}: {v}" for k, v in current_config.items()])

        return f"""Current step: {current_step}
            Current configuration:
            {config_summary if config_summary else "Empty"}

            User's message: {message}

            Based on the user's message and current step, provide the next message and determine what to do next.
            Remember to extract information from their response and update the configuration accordingly."""

    def _parse_llm_response(
        self,
        assistant_message: str,
        user_message: str,
        current_config: Dict[str, Any],
        current_step: str
    ) -> Dict[str, Any]:
        """
        Parse the LLM response and extract structured data
        """
        lines = assistant_message.split('\n')

        response_message = ""
        next_step = current_step
        updated_config = current_config.copy()
        suggestions = {}
        options = []

        for line in lines:
            line = line.strip()
            if line.startswith("MESSAGE:"):
                response_message = line.replace("MESSAGE:", "").strip()
            elif line.startswith("NEXT_STEP:"):
                next_step = line.replace("NEXT_STEP:", "").strip()
            elif line.startswith("UPDATED_FIELD:"):
                field_update = line.replace("UPDATED_FIELD:", "").strip()
                if "=" in field_update:
                    field, value = field_update.split("=", 1)
                    updated_config[field.strip()] = value.strip()
            elif line.startswith("SUGGESTIONS:"):
                suggestion_list = line.replace("SUGGESTIONS:", "").strip()
                suggestions_array = [s.strip() for s in suggestion_list.split(",")]

                # Determine what type of suggestions these are
                if current_step in ['focus', 'name']:
                    suggestions['therapeutic_areas'] = suggestions_array
                elif current_step == 'competitors':
                    suggestions['companies'] = suggestions_array
            elif line.startswith("OPTIONS:"):
                options_list = line.replace("OPTIONS:", "").strip()
                options = [
                    {"label": opt.strip(), "value": opt.strip(), "checked": False}
                    for opt in options_list.split("|")
                ]

        # If no message was extracted, use the whole response
        if not response_message:
            response_message = assistant_message

        return {
            "message": response_message,
            "next_step": next_step,
            "updated_config": updated_config,
            "suggestions": suggestions if suggestions else None,
            "options": options if options else None
        }
