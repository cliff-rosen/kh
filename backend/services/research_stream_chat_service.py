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
        current_step: str,
        conversation_history: List[Dict[str, str]] = None
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

        # Build conversation messages array
        messages = []

        # Add conversation history if provided
        if conversation_history:
            for msg in conversation_history:
                messages.append({
                    "role": msg.get("role"),
                    "content": msg.get("content")
                })

        # Add current user message
        messages.append({
            "role": "user",
            "content": user_prompt
        })

        stream = self.client.messages.stream(
            model=STREAM_CHAT_MODEL,
            max_tokens=STREAM_CHAT_MAX_TOKENS,
            temperature=0.0,
            system=system_prompt,
            messages=messages
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
                "mode": extracted_data.get("mode", "QUESTION"),
                "target_field": extracted_data.get("target_field"),
                "proposed_message": extracted_data.get("proposed_message"),
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

        # Extract options if this step has fixed choices
        options_info = ""
        if step_guidance.get('options'):
            options_list = ", ".join(step_guidance['options'])
            field_name = step_guidance.get('collect', 'this field')
            options_info = f"""

            CRITICAL - FIXED CHOICE FIELD:
            You are collecting: {field_name}
            Available Options: {options_list}

            You MUST provide these options as SUGGESTIONS so the user can select one.
            DO NOT ask an open-ended question without providing the suggestion chips.
            Use MODE: SUGGESTION with TARGET_FIELD: {field_name.replace(' (list)', '').replace(' ', '_')}
            Format: SUGGESTIONS: {options_list}"""

        return f"""You are an AI assistant helping users create research streams for Knowledge Horizon,
            a biomedical and business intelligence platform.

            Your role is to have a natural, conversational interaction with the user to collect information.
            The workflow system will handle state management and determine what step comes next.

            Current Step Objective: {step_guidance.get('objective', 'Collect information')}
            Information to Collect: {step_guidance.get('collect', 'User input')}{options_info}

            IMPORTANT: Each response must be categorized as one of two modes:

            **MODE 1: QUESTION** - You need to ask clarifying questions to gather information
            - User hasn't provided enough context yet
            - You need to guide them toward providing specific information
            - No concrete suggestions can be made yet

            **MODE 2: SUGGESTION** - You have enough information to present concrete options
            - You can suggest specific values for a configuration field
            - User can select from your suggestions to populate the field
            - Must specify which field (stream_name, stream_type, focus_areas, competitors, report_frequency)
            - Use SUGGESTIONS for single-select fields (stream_type, report_frequency, stream_name)
            - Use OPTIONS for multi-select fields (focus_areas, competitors)

            Guidelines:
            - Be conversational, friendly, and helpful
            - Be PROACTIVE and AGGRESSIVE with suggestions - use your knowledge extensively
            - When in SUGGESTION mode, make it clear which field you're populating
            - When the user mentions therapeutic areas, suggest related areas from your knowledge
            - When discussing companies, suggest relevant ones active in the mentioned areas
            - Extract information from natural language responses
            - LEVERAGE YOUR KNOWLEDGE: If user mentions a company, research area, or therapeutic focus:
              * Look up what you know about their pipeline, focus areas, and technologies
              * Proactively suggest relevant therapeutic areas, competitors, and related topics
              * Example: If they mention "Palatin Technologies", you know they focus on melanocortin receptor agents - SUGGEST those areas
              * Example: If they mention "oncology", suggest specific cancer types, treatment modalities, and related areas
            - CRITICAL: ALWAYS default to SUGGESTION mode - only use QUESTION mode if you truly have zero context
            - NEVER ask "what would you like?" without providing suggestions or options
            - If you're moving to a new field, immediately provide suggestions for that field
            - CRITICAL: When a user responds with EXACTLY one of your previous suggestions (verbatim), they are SELECTING it, not asking about it
              * DO NOT re-suggest the same thing
              * DO NOT ask if they want to select it
              * IMMEDIATELY extract it as data and move forward
              * Keep response brief: "Great choice!" or "Perfect!" then move to the next field
              * Use EXTRACTED_DATA to capture their selection

            Return your response in this format:
            MODE: [QUESTION or SUGGESTION]
            MESSAGE: [Your conversational message to the user - this is what they will see]
            TARGET_FIELD: [field_name] (only for SUGGESTION mode - which config field these suggestions populate)
            EXTRACTED_DATA: [field_name]=[value] (if you extracted information from their response)
            SUGGESTIONS: [comma-separated list] (only for SUGGESTION mode - single-select options)
            OPTIONS: [option1|option2|option3] (only for SUGGESTION mode - multi-select checkboxes)
            PROPOSED_MESSAGE: [short message user can click to continue] (only for SUGGESTION mode with OPTIONS - e.g., "Continue with these selections")

            IMPORTANT FORMATTING RULES:
            - For EXTRACTED_DATA with lists (focus_areas, competitors): Use clean comma-separated values WITHOUT brackets or quotes
              Example: EXTRACTED_DATA: focus_areas=Oncology, Cardiology, Immunology
              NOT: EXTRACTED_DATA: focus_areas=["Oncology", "Cardiology", "Immunology"]
            - For single values: Just the value, no quotes
              Example: EXTRACTED_DATA: stream_name=Palatin Research Stream
              NOT: EXTRACTED_DATA: stream_name="Palatin Research Stream"

            Examples:

            QUESTION mode (only when you truly have no context):
            MODE: QUESTION
            MESSAGE: What therapeutic areas are you interested in monitoring? For example, oncology, cardiology, or immunology?

            SUGGESTION mode (use whenever you can make intelligent recommendations):
            MODE: SUGGESTION
            TARGET_FIELD: focus_areas
            MESSAGE: Based on Palatin Technologies' focus on melanocortin receptor agents, I recommend monitoring these therapeutic areas:
            OPTIONS: Melanocortin Receptor Agonists|Sexual Dysfunction Treatment|Obesity Treatment|Dermatology|Inflammatory Diseases
            PROPOSED_MESSAGE: Continue with selected areas

            Another SUGGESTION example:
            MODE: SUGGESTION
            TARGET_FIELD: focus_areas
            MESSAGE: For cardiovascular drug development, here are key therapeutic areas to monitor:
            OPTIONS: Heart Failure|Arrhythmia|Hypertension|Cardiomyopathy|Anticoagulation|Lipid Management
            PROPOSED_MESSAGE: Continue with these areas

            SUGGESTION example for fixed-choice fields (stream_type):
            MODE: SUGGESTION
            TARGET_FIELD: stream_type
            MESSAGE: Based on your focus on Palatin Technologies, what type of research stream would be most useful?
            SUGGESTIONS: competitive, regulatory, clinical, market, scientific, mixed

            SUGGESTION example for fixed-choice fields (report_frequency):
            MODE: SUGGESTION
            TARGET_FIELD: report_frequency
            MESSAGE: How often would you like to receive reports about this research area?
            SUGGESTIONS: daily, weekly, biweekly, monthly

            USER SELECTS A SUGGESTION (user message is exactly one of your suggestions):
            User previously saw: "Palatin Melanocortin Research Intelligence|Palatin Therapeutic Pipeline Monitor"
            User sends: "Palatin Melanocortin Research Intelligence"

            CORRECT response (acknowledge + immediately suggest for next field):
            MODE: SUGGESTION
            TARGET_FIELD: stream_type
            MESSAGE: Perfect! "Palatin Melanocortin Research Intelligence" is a great name. Now let's determine what type of research stream this will be:
            EXTRACTED_DATA: stream_name=Palatin Melanocortin Research Intelligence
            SUGGESTIONS: competitive, regulatory, clinical, market, scientific, mixed

            INCORRECT response (DO NOT DO THIS - asking without suggestions):
            MODE: QUESTION
            MESSAGE: Perfect! Now let's determine what type of research stream this will be.
            EXTRACTED_DATA: stream_name=Palatin Melanocortin Research Intelligence

            Note: You do NOT need to determine the next step - the workflow system handles that.
            Just focus on categorizing your response correctly and providing clear, knowledge-driven value."""

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
        Now includes MODE and TARGET_FIELD for clearer UX.
        """
        response_message = ""
        mode = "QUESTION"  # Default to QUESTION mode
        target_field = None
        proposed_message = None
        updates = {}
        suggestions = {}
        options = []

        # Extract MESSAGE (everything until first structured field marker)
        in_message = False
        message_lines = []

        for line in assistant_message.split('\n'):
            stripped = line.strip()

            if stripped.startswith("MODE:"):
                mode = stripped.replace("MODE:", "").strip().upper()
            elif stripped.startswith("TARGET_FIELD:"):
                target_field = stripped.replace("TARGET_FIELD:", "").strip()
            elif stripped.startswith("PROPOSED_MESSAGE:"):
                proposed_message = stripped.replace("PROPOSED_MESSAGE:", "").strip()
            elif stripped.startswith("MESSAGE:"):
                in_message = True
                # Get content after MESSAGE: on same line
                content = stripped.replace("MESSAGE:", "").strip()
                if content:
                    message_lines.append(content)
            elif in_message and not any(stripped.startswith(marker) for marker in ["MODE:", "TARGET_FIELD:", "PROPOSED_MESSAGE:", "EXTRACTED_DATA:", "SUGGESTIONS:", "OPTIONS:"]):
                # Continue collecting message lines
                message_lines.append(line.rstrip())
            elif stripped.startswith("EXTRACTED_DATA:"):
                in_message = False
                field_update = stripped.replace("EXTRACTED_DATA:", "").strip()
                if field_update and "=" in field_update:
                    field, value = field_update.split("=", 1)
                    field_name = field.strip()
                    field_value = value.strip()

                    # Handle list fields - competitors, focus_areas, keywords, business_goals should be lists
                    if field_name in ['competitors', 'focus_areas', 'keywords', 'business_goals'] and field_value:
                        # Remove brackets and quotes if present
                        field_value = field_value.strip('[]')

                        # Split by comma if it's a comma-separated list, otherwise wrap in list
                        if ',' in field_value:
                            # Split and clean each item (remove quotes, whitespace)
                            updates[field_name] = [
                                v.strip().strip('"').strip("'")
                                for v in field_value.split(',')
                                if v.strip()
                            ]
                        else:
                            # Single item - remove quotes
                            cleaned_value = field_value.strip('"').strip("'")
                            if cleaned_value:
                                updates[field_name] = [cleaned_value]
                    else:
                        # For non-list fields, just remove quotes if present
                        updates[field_name] = field_value.strip('"').strip("'")
            elif stripped.startswith("SUGGESTIONS:"):
                in_message = False
                suggestion_list = stripped.replace("SUGGESTIONS:", "").strip()
                if suggestion_list:  # Only process if not empty
                    suggestions_array = [s.strip() for s in suggestion_list.split(",") if s.strip()]
                    if suggestions_array:  # Only add if array is not empty
                        suggestions = suggestions_array  # Just return array, target_field tells us what it's for
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
            "mode": mode,
            "target_field": target_field,
            "proposed_message": proposed_message,
            "updates": updates if updates else None,
            "suggestions": suggestions if suggestions else None,
            "options": options if options else None
        }
