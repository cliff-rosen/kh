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
from schemas.research_stream import PartialStreamConfig, UserAction
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
        conversation_history: List[Dict[str, str]] = None,
        user_action: UserAction = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with status updates via SSE.
        Uses workflow controller for state management and LLM for conversation.
        """
        import logging
        logger = logging.getLogger(__name__)

        try:
            # Default to text_input if no user action provided
            if user_action is None:
                user_action = UserAction(type="text_input")

            # Initialize workflow controller
            workflow = ResearchStreamCreationWorkflow(current_step, current_config)

            # Process user action BEFORE calling LLM
            step_completed = self._process_user_action(workflow, user_action, message)

            # If step is complete, get next step and update workflow
            if step_completed:
                next_step = workflow.get_next_step()
                # Re-initialize workflow with the new step
                workflow = ResearchStreamCreationWorkflow(next_step.value, workflow.config)

            # Get guidance from workflow for CURRENT step (may have advanced)
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

            # Smart step detection: advance past completed steps
            from services.research_stream_creation_workflow import WorkflowStep

            if workflow.current_step == WorkflowStep.EXPLORATION:
                # In EXPLORATION, if user volunteered data, skip to first incomplete required step
                for step in workflow.PREFERRED_STEP_ORDER:
                    if step == WorkflowStep.EXPLORATION:
                        continue
                    if step in [WorkflowStep.REVIEW, WorkflowStep.COMPLETE]:
                        continue  # Don't auto-advance to review/complete
                    if not workflow.is_step_completed(step):
                        # Found first incomplete step
                        workflow = ResearchStreamCreationWorkflow(step.value, workflow.config)
                        break
            else:
                # For data steps, check if current step is complete and advance
                current_step_complete = workflow.is_step_completed(workflow.current_step)
                if current_step_complete:
                    next_step = workflow.get_next_step()
                    workflow = ResearchStreamCreationWorkflow(next_step.value, workflow.config)

            # Send final response with structured data
            # next_step is the CURRENT step (after potential advancement)
            final_response = AgentResponse(
                token=None,
                response_text=None,
                payload={
                    "message": extracted_data.get("message", collected_text),
                    "mode": extracted_data.get("mode", "QUESTION"),
                    "target_field": extracted_data.get("target_field"),
                    "proposed_message": extracted_data.get("proposed_message"),
                    "next_step": workflow.current_step.value,
                    "updated_config": workflow.config.model_dump(),
                    "suggestions": extracted_data.get("suggestions"),
                    "options": extracted_data.get("options")
                },
                status="complete",
                error=None,
                debug=None
            )
            yield final_response.model_dump_json()

        except Exception as e:
            logger.error(f"Error in stream_chat_message: {str(e)}", exc_info=True)
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=None,
                status=None,
                error=f"Service error: {str(e)}",
                debug={"error_type": type(e).__name__}
            )
            yield error_response.model_dump_json()

    def _build_system_prompt(self, step_guidance: Dict[str, Any]) -> str:
        """Build system prompt using workflow guidance instead of hardcoded flow"""
        from services.research_stream_creation_workflow import WorkflowStep

        # Determine current step from guidance
        current_step_name = step_guidance.get('step', 'exploration')
        is_exploration = current_step_name == 'exploration'

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

        # Add EXPLORATION-specific rules
        exploration_rules = ""
        if is_exploration:
            exploration_rules = """

            CRITICAL - YOU ARE IN EXPLORATION MODE:
            - You MUST use MODE: QUESTION (never MODE: SUGGESTION)
            - DO NOT provide SUGGESTIONS or OPTIONS
            - You CAN and SHOULD use EXTRACTED_DATA when the user explicitly provides structured information
              * Example: "I want a stream named XYZ" → EXTRACTED_DATA: stream_name=XYZ
              * Example: "monitoring oncology and cardiology" → EXTRACTED_DATA: focus_areas=Oncology, Cardiology
              * Acknowledge what you captured: "Got it, I'll name it XYZ. Now, what's the purpose..."
            - When user provides vague or conversational input, ask clarifying questions instead of guessing
            - Focus on gathering context about their business, goals, and research interests
            - The workflow will automatically advance past completed fields
            """

        return f"""You are an AI assistant helping users create research streams for Knowledge Horizon,
            a biomedical and business intelligence platform.

            Your role is to have a natural, conversational interaction with the user to collect information.
            The workflow system will handle state management and determine what step comes next.

            Current Step: {current_step_name}
            Current Step Objective: {step_guidance.get('objective', 'Collect information')}
            Information to Collect: {step_guidance.get('collect', 'User input')}{options_info}{exploration_rules}

            IMPORTANT: Each response must be categorized as one of two modes:

            **MODE 1: QUESTION** - You need to ask clarifying questions to gather information
            - User hasn't provided enough context yet
            - You need to guide them toward providing specific information
            - No concrete suggestions can be made yet

            **MODE 2: SUGGESTION** - You have enough information to present concrete options
            - You can suggest specific values for a configuration field
            - User can select from your suggestions to populate the field
            - Must specify which field (purpose, business_goals, expected_outcomes, stream_name, stream_type, focus_areas, keywords, competitors, report_frequency)

            CRITICAL - Field Type Formatting:
            - Use SUGGESTIONS for single-select/text fields: purpose, expected_outcomes, stream_name, stream_type, report_frequency
              * These show as clickable suggestion chips
              * User clicks ONE to select it
              * Format: SUGGESTIONS: option1, option2, option3
            - Use OPTIONS for multi-select/array fields: business_goals, focus_areas, keywords, competitors
              * These show as checkboxes
              * User can select MULTIPLE
              * Format: OPTIONS: option1|option2|option3
              * Must include PROPOSED_MESSAGE for the continue button

            Guidelines:
            - Be conversational, friendly, and helpful
            - Be PROACTIVE and AGGRESSIVE with suggestions - use your knowledge extensively
            - When in SUGGESTION mode, make it clear which field you're populating
            - When the user mentions therapeutic areas, suggest related areas from your knowledge
            - When discussing companies, suggest relevant ones active in the mentioned areas
            - Extract information from natural language responses
            - CRITICAL - USER AGENCY: If the user explicitly requests to set/change ANY field at ANY time, honor it with EXTRACTED_DATA
              * Example: While asking about purpose, user says "actually call it 'XYZ Monitor'" → EXTRACTED_DATA: stream_name=XYZ Monitor
              * Example: While in stream_type, user says "add Pfizer to competitors" → EXTRACTED_DATA: competitors=Pfizer
              * Example: User says "change purpose to monitor competitive landscape" → EXTRACTED_DATA: purpose=monitor competitive landscape
              * For array fields (business_goals, focus_areas, keywords, competitors), values are ADDED to existing, not replaced
              * For single-value fields (purpose, stream_name, etc.), values are REPLACED
              * Acknowledge the change and continue with current step
              * User can edit any field at any time, regardless of current workflow step
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
            - For EXTRACTED_DATA with lists (business_goals, focus_areas, keywords, competitors): Use clean comma-separated values WITHOUT brackets or quotes
              Example: EXTRACTED_DATA: focus_areas=Oncology, Cardiology, Immunology
              Example: EXTRACTED_DATA: keywords=melanocortin, MCR1, MCR4, obesity
              Example: EXTRACTED_DATA: business_goals=Inform study design, Track competitive landscape
              NOT: EXTRACTED_DATA: focus_areas=["Oncology", "Cardiology", "Immunology"]
            - For single values (purpose, expected_outcomes, stream_name): Just the value, no quotes
              Example: EXTRACTED_DATA: stream_name=Palatin Research Stream
              Example: EXTRACTED_DATA: purpose=Monitor melanocortin pathways for competitive intelligence
              NOT: EXTRACTED_DATA: stream_name="Palatin Research Stream"

            Examples:

            EXPLORATION mode with volunteered data (extract what user provides):
            User: "I want a research stream named 'Oncology Competitive Intel' monitoring Pfizer and Novartis in oncology"
            MODE: QUESTION
            MESSAGE: Great! I'll set up a stream called "Oncology Competitive Intel" focused on oncology, monitoring Pfizer and Novartis. Now, what's the main purpose of this stream? What decisions will it help you make?
            EXTRACTED_DATA: stream_name=Oncology Competitive Intel
            EXTRACTED_DATA: focus_areas=Oncology
            EXTRACTED_DATA: competitors=Pfizer, Novartis

            QUESTION mode (only when you truly have no context):
            MODE: QUESTION
            MESSAGE: What's the purpose of this research stream? What decisions will it help you make?

            SUGGESTION mode for PURPOSE (single-select text field - use SUGGESTIONS not OPTIONS):
            MODE: SUGGESTION
            TARGET_FIELD: purpose
            MESSAGE: Based on your interest in Palatin Technologies, here are some potential purposes for this stream:
            SUGGESTIONS: Monitor competitive landscape for strategic planning, Track melanocortin pathway research for pipeline development, Identify partnership opportunities in metabolic disease

            SUGGESTION mode for BUSINESS_GOALS (multi-select list):
            MODE: SUGGESTION
            TARGET_FIELD: business_goals
            MESSAGE: What business goals will this stream support?
            OPTIONS: Inform study design decisions|Track competitive landscape|Identify new therapeutic indications|Monitor regulatory pathway|Support partnership discussions|Guide R&D investment priorities
            PROPOSED_MESSAGE: Continue with selected goals

            SUGGESTION mode for EXPECTED_OUTCOMES (single-select text field - use SUGGESTIONS not OPTIONS):
            MODE: SUGGESTION
            TARGET_FIELD: expected_outcomes
            MESSAGE: What specific outcomes do you expect from this intelligence?
            SUGGESTIONS: Quarterly competitive landscape reports for leadership, Weekly alerts on new clinical trial filings, Monthly synthesis of new melanocortin research, Real-time alerts on regulatory changes

            SUGGESTION mode for FOCUS_AREAS (multi-select list):
            MODE: SUGGESTION
            TARGET_FIELD: focus_areas
            MESSAGE: Based on Palatin's melanocortin focus, I recommend monitoring these therapeutic areas:
            OPTIONS: Melanocortin Receptor Agonists|Sexual Dysfunction Treatment|Obesity and Metabolic Disorders|Dermatology|Dry Eye Disease|Ocular Disease
            PROPOSED_MESSAGE: Continue with selected areas

            SUGGESTION mode for STREAM_NAME (text field with suggestions):
            MODE: SUGGESTION
            TARGET_FIELD: stream_name
            MESSAGE: Based on your purpose and focus, here are some name suggestions:
            SUGGESTIONS: Palatin Melanocortin Research Intelligence, Palatin Competitive Science Stream, Melanocortin Pathway Monitor

            SUGGESTION mode for KEYWORDS (multi-select list):
            MODE: SUGGESTION
            TARGET_FIELD: keywords
            MESSAGE: Based on your focus areas, here are key search terms I recommend:
            OPTIONS: melanocortin|MCR1|MCR4|bremelanotide|PL7737|obesity|metabolic syndrome|sexual dysfunction|dry eye|retinal disease
            PROPOSED_MESSAGE: Continue with these keywords

            SUGGESTION mode for COMPETITORS (multi-select list - optional):
            MODE: SUGGESTION
            TARGET_FIELD: competitors
            MESSAGE: Here are relevant competitors in your therapeutic areas:
            OPTIONS: Novo Nordisk|Eli Lilly|Amgen|Rhythm Pharmaceuticals|Esperion Therapeutics|Bausch + Lomb
            PROPOSED_MESSAGE: Continue with selected competitors

            SUGGESTION mode for STREAM_TYPE (single-select):
            MODE: SUGGESTION
            TARGET_FIELD: stream_type
            MESSAGE: What type of intelligence are you most interested in?
            SUGGESTIONS: competitive, regulatory, clinical, market, scientific, mixed

            SUGGESTION mode for REPORT_FREQUENCY (single-select):
            MODE: SUGGESTION
            TARGET_FIELD: report_frequency
            MESSAGE: How often would you like to receive reports?
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

    def _process_user_action(
        self,
        workflow: ResearchStreamCreationWorkflow,
        user_action: UserAction,
        message: str
    ) -> bool:
        """
        Process user action and update workflow config.
        Returns True if the current step is complete, False otherwise.
        """
        from services.research_stream_creation_workflow import WorkflowStep

        current_step = workflow.current_step

        # EXPLORATION step - only accepts text_input, never completes from user action
        if current_step == WorkflowStep.EXPLORATION:
            return False

        # DATA STEPS - can be completed by user actions
        if user_action.type == "option_selected":
            # User selected a single suggestion
            field_name = user_action.target_field
            value = user_action.selected_value

            if field_name and value:
                workflow.update_config({field_name: value})
                # Check if this completes the step
                return workflow.is_step_completed(current_step)

        elif user_action.type == "options_selected":
            # User selected multiple options (checkboxes)
            field_name = user_action.target_field
            values = user_action.selected_values or []

            if field_name and values:
                workflow.update_config({field_name: values})
                # Check if this completes the step
                return workflow.is_step_completed(current_step)

        elif user_action.type == "text_input":
            # User typed text - LLM will extract data, don't mark as complete
            return False

        elif user_action.type == "skip_step":
            # User wants to skip this step
            return True

        return False
