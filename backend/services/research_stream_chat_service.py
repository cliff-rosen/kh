"""
Research Stream Chat Service for AI-guided research stream creation
Handles the interview flow and LLM integration
"""

from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, List, Optional, AsyncGenerator
import anthropic
import os
import json
from schemas.stream_building import StreamInProgress, UserAction, UserActionType
from services.research_stream_creation_workflow import ResearchStreamCreationWorkflow

STREAM_CHAT_MODEL = "claude-sonnet-4-20250514"
STREAM_CHAT_MAX_TOKENS = 2000

class ResearchStreamChatService:
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    async def stream_chat_message(
        self,
        message: str,
        current_stream: StreamInProgress,
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
                user_action = UserAction(type=UserActionType.TEXT_INPUT)

            # Initialize workflow controller
            workflow = ResearchStreamCreationWorkflow(current_step, current_stream)

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
            user_prompt = self._build_user_prompt(message, current_stream, step_guidance)

            # Send status update that we're calling the LLM
            from routers.research_stream_chat import StreamBuildStatusResponse
            status_response = StreamBuildStatusResponse(
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
                    from routers.research_stream_chat import StreamBuildAgentResponse
                    token_response = StreamBuildAgentResponse(
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
            from routers.research_stream_chat import StreamBuildAgentResponse, StreamBuildChatPayload

            payload = StreamBuildChatPayload(
                message=extracted_data.get("message", collected_text),
                mode=extracted_data.get("mode", "QUESTION"),
                target_field=extracted_data.get("target_field"),
                proposed_message=extracted_data.get("proposed_message"),
                next_step=workflow.current_step.value,
                updated_stream=workflow.config,
                suggestions=extracted_data.get("suggestions"),
                options=extracted_data.get("options")
            )

            final_response = StreamBuildAgentResponse(
                token=None,
                response_text=None,
                payload=payload,
                status="complete",
                error=None,
                debug=None
            )
            yield final_response.model_dump_json()

        except Exception as e:
            logger.error(f"Error in stream_chat_message: {str(e)}", exc_info=True)
            from routers.research_stream_chat import StreamBuildAgentResponse
            error_response = StreamBuildAgentResponse(
                token=None,
                response_text=None,
                payload=None,
                status=None,
                error=f"Service error: {str(e)}",
                debug={"error_type": type(e).__name__}
            )
            yield error_response.model_dump_json()

    def _build_system_prompt(self, step_guidance: Dict[str, Any]) -> str:
        """Build system prompt using workflow guidance - CHANNEL-BASED STRUCTURE"""
        from services.research_stream_creation_workflow import WorkflowStep

        # Determine current step from guidance
        current_step_name = step_guidance.get('step', 'exploration')
        is_exploration = current_step_name == 'exploration'
        is_channels = current_step_name == 'channels'
        is_review = current_step_name == 'review'

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
              * Example: "for melanocortin research" → EXTRACTED_DATA: purpose=Monitor melanocortin research
              * Acknowledge what you captured: "Got it! Now, what's the purpose..."
            - When user provides vague or conversational input, ask clarifying questions instead of guessing
            - Focus on gathering context about their business, goals, and research interests
            - The workflow will automatically advance past completed fields
            """

        # Add CHANNELS-specific rules
        channels_rules = ""
        if is_channels:
            channels_rules = """

            CRITICAL - YOU ARE IN CHANNELS MODE:
            - A channel is a focused monitoring area with: name, focus (what to monitor), type (competitive/regulatory/clinical/market/scientific), keywords
            - Guide the user to create 1-3 channels that make sense for their purpose
            - For each channel, collect: name, focus, type, keywords

            WHEN PROPOSING CHANNELS (first time in channels step):
            - Use MODE: SUGGESTION
            - TARGET_FIELD: channels
            - In MESSAGE: Present the channel structure in formatted markdown:
              **Channel 1: [Name]**
              - Focus: [what to monitor]
              - Type: [type]
              - Keywords: [comma-separated list]
            - SUGGESTIONS: Accept these channels (this becomes a clickable button)
            - User can click "Accept these channels" button OR type their own input

            WHEN USER ACCEPTS (clicks suggestion or types "yes"/"looks good"/etc):
            - Use EXTRACTED_DATA to save the channels:
              EXTRACTED_DATA: channels=[{{"name": "...", "focus": "...", "type": "...", "keywords": [...]}}]
            - Move forward

            WHEN USER REQUESTS CHANGES:
            - Stay in CHANNELS mode
            - Adjust based on their feedback
            - Present updated channels with SUGGESTIONS again
            """

        # Add REVIEW-specific rules
        review_rules = ""
        if is_review:
            review_rules = """

            CRITICAL - YOU ARE IN REVIEW MODE:
            - Use MODE: REVIEW (not QUESTION or SUGGESTION)
            - Present a comprehensive summary of the stream configuration
            - Format the summary clearly showing: stream_name, purpose, channels (each with name/focus/type/keywords), frequency
            - Tell the user: "Your stream is ready to create. Review the configuration above and click 'Accept & Create Stream' to proceed, or type any changes you'd like to make."
            - DO NOT provide SUGGESTIONS or OPTIONS
            - If user requests changes, use EXTRACTED_DATA to capture them and stay in REVIEW mode
            - The frontend will show an "Accept & Create Stream" button
            - DO NOT advance to COMPLETE - that happens when user clicks Accept button
            """

        return f"""You are an AI assistant helping users create research streams for Knowledge Horizon,
            a biomedical and business intelligence platform.

            CHANNEL-BASED STRUCTURE:
            Research streams now consist of:
            - stream_name: Name of the stream
            - purpose: Why this stream exists, what questions it answers
            - channels: Array of monitoring channels, each with:
              * name: Channel name (e.g., "Melanocortin Pathways")
              * focus: What this channel monitors (e.g., "Track competitor drug development")
              * type: competitive/regulatory/clinical/market/scientific
              * keywords: Array of search keywords
            - frequency: daily/weekly/biweekly/monthly

            Your role is to have a natural, conversational interaction with the user to collect information.
            The workflow system will handle state management and determine what step comes next.

            Current Step: {current_step_name}
            Current Step Objective: {step_guidance.get('objective', 'Collect information')}
            Information to Collect: {step_guidance.get('collect', 'User input')}{options_info}{exploration_rules}{channels_rules}{review_rules}

            IMPORTANT: Each response must be categorized as one of three modes:

            **MODE 1: QUESTION** - You need to ask clarifying questions to gather information
            - User hasn't provided enough context yet
            - You need to guide them toward providing specific information
            - No concrete suggestions can be made yet

            **MODE 2: SUGGESTION** - You have enough information to present concrete options
            - You can suggest specific values for a configuration field
            - User can select from your suggestions to populate the field
            - Must specify which field (stream_name, purpose, channels, frequency)

            **MODE 3: REVIEW** - Present final summary and await user confirmation
            - Show comprehensive summary of all collected configuration
            - User will click "Accept & Create Stream" button to proceed
            - User can still type changes, which you should capture with EXTRACTED_DATA
            - Stay in REVIEW mode after processing changes

            CRITICAL - Field Type Formatting:
            - Use SUGGESTIONS for single-select/text fields: stream_name, purpose, frequency
              * These show as clickable suggestion chips
              * User clicks ONE to select it
              * Format: SUGGESTIONS: option1, option2, option3
            - For CHANNELS: Propose complete channel configurations and capture as EXTRACTED_DATA
              * Guide user to create 1-3 focused channels
              * Each channel needs: name, focus, type, keywords

            Guidelines:
            - Be conversational, friendly, and helpful
            - Be PROACTIVE and AGGRESSIVE with suggestions - use your knowledge extensively
            - When in SUGGESTION mode, make it clear which field you're populating
            - When the user mentions therapeutic areas, suggest related areas from your knowledge
            - When discussing companies, suggest relevant ones active in the mentioned areas
            - Extract information from natural language responses
            - CRITICAL - USER AGENCY: If the user explicitly requests to set/change ANY field at ANY time, honor it with EXTRACTED_DATA
              * Example: While asking about purpose, user says "actually call it 'XYZ Monitor'" → EXTRACTED_DATA: stream_name=XYZ Monitor
              * Example: User says "change purpose to monitor competitive landscape" → EXTRACTED_DATA: purpose=monitor competitive landscape
              * For single-value fields (purpose, stream_name, frequency), values are REPLACED
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
            MODE: [QUESTION or SUGGESTION or REVIEW]
            MESSAGE: [Your conversational message to the user - this is what they will see]
            TARGET_FIELD: [field_name] (only for SUGGESTION mode - which config field these suggestions populate)
            EXTRACTED_DATA: [field_name]=[value] (if you extracted information from their response)
            SUGGESTIONS: [comma-separated list] (only for SUGGESTION mode - single-select options)
            OPTIONS: [option1|option2|option3] (only for SUGGESTION mode - multi-select checkboxes)
            PROPOSED_MESSAGE: [short message user can click to continue] (only for SUGGESTION mode with OPTIONS - e.g., "Continue with these selections")

            IMPORTANT FORMATTING RULES:
            - For single values (purpose, stream_name, frequency): Just the value, no quotes
              Example: EXTRACTED_DATA: stream_name=Palatin Research Stream
              Example: EXTRACTED_DATA: purpose=Monitor melanocortin pathways for competitive intelligence
              Example: EXTRACTED_DATA: frequency=weekly
              NOT: EXTRACTED_DATA: stream_name="Palatin Research Stream"
            - For channels: Use JSON array format
              Example: EXTRACTED_DATA: channels=[{{"name": "Melanocortin Pathways", "focus": "Track scientific research", "type": "scientific", "keywords": ["melanocortin", "MCR1", "MCR4"]}}]

            Examples:

            EXPLORATION mode with volunteered data:
            User: "I want a research stream named 'Melanocortin Intelligence' for competitive research"
            MODE: QUESTION
            MESSAGE: Great! I'll set up a stream called "Melanocortin Intelligence" for competitive research. Now, what's the main purpose of this stream? What decisions will it help you make?
            EXTRACTED_DATA: stream_name=Melanocortin Intelligence
            EXTRACTED_DATA: purpose=Monitor competitive research

            QUESTION mode (only when you truly have no context):
            MODE: QUESTION
            MESSAGE: What's the purpose of this research stream? What decisions will it help you make?

            SUGGESTION mode for PURPOSE:
            MODE: SUGGESTION
            TARGET_FIELD: purpose
            MESSAGE: Based on your interest in Palatin Technologies, here are some potential purposes for this stream:
            SUGGESTIONS: Monitor competitive landscape for strategic planning, Track melanocortin pathway research for pipeline development, Identify partnership opportunities in metabolic disease

            SUGGESTION mode for STREAM_NAME:
            MODE: SUGGESTION
            TARGET_FIELD: stream_name
            MESSAGE: Based on your purpose, here are some name suggestions:
            SUGGESTIONS: Palatin Melanocortin Research Intelligence, Palatin Competitive Science Stream, Melanocortin Pathway Monitor

            CHANNELS mode - Proposing channel structure:
            MODE: SUGGESTION
            TARGET_FIELD: channels
            MESSAGE: Based on your purpose to monitor melanocortin pathway research, I recommend creating these channels:

            **Channel 1: Melanocortin Pathways**
            - Focus: Track scientific research on melanocortin receptors
            - Type: scientific
            - Keywords: melanocortin, MCR1, MCR4, MCR5, alpha-MSH, melanocyte stimulating hormone

            **Channel 2: Clinical Developments**
            - Focus: Monitor clinical trials for melanocortin-based treatments
            - Type: clinical
            - Keywords: bremelanotide, PL-6983, clinical trial, phase 2, phase 3

            **Channel 3: Competitive Intelligence**
            - Focus: Track competitor activities in melanocortin space
            - Type: competitive
            - Keywords: Novo Nordisk, Eli Lilly, Rhythm Pharmaceuticals, pipeline, drug development

            Would you like to use these channels?
            SUGGESTIONS: Accept these channels

            (User can click button or type feedback. When they accept, you extract the channels as JSON)

            FREQUENCY mode:
            MODE: SUGGESTION
            TARGET_FIELD: frequency
            MESSAGE: How often would you like to receive reports?
            SUGGESTIONS: daily, weekly, biweekly, monthly

            REVIEW mode (present final summary):
            MODE: REVIEW
            MESSAGE: Perfect! Your research stream is ready to create. Here's a summary:

            **Stream Name:** Palatin Melanocortin Research Intelligence
            **Purpose:** Monitor melanocortin pathway research for competitive intelligence and pipeline development
            **Channels:**
            - **Melanocortin Pathways** (scientific): Track scientific research
              Keywords: melanocortin, MCR1, MCR4, MCR5, alpha-MSH
            - **Clinical Developments** (clinical): Monitor clinical trials
              Keywords: bremelanotide, PL-6983, clinical trial, phase 2, phase 3
            - **Competitive Intelligence** (competitive): Track competitor activities
              Keywords: Novo Nordisk, Eli Lilly, Rhythm Pharmaceuticals, pipeline
            **Report Frequency:** Weekly

            Review the configuration above and click "Accept & Create Stream" to proceed, or type any changes you'd like to make.

            REVIEW mode with user edit:
            User: "change frequency to monthly"
            MODE: REVIEW
            MESSAGE: Updated! I've changed the report frequency to monthly. Here's your updated configuration:

            [... same summary with updated frequency ...]

            Review the configuration and click "Accept & Create Stream" when ready, or type any other changes.
            EXTRACTED_DATA: frequency=monthly

            Note: You do NOT need to determine the next step - the workflow system handles that.
            Just focus on categorizing your response correctly and providing clear, knowledge-driven value."""

    def _build_user_prompt(
        self,
        message: str,
        current_stream: StreamInProgress,
        step_guidance: Dict[str, Any]
    ) -> str:
        """Build user prompt with workflow context"""
        # Convert Pydantic model to dict and filter out None values
        config_dict = {k: v for k, v in current_stream.model_dump().items() if v is not None}
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

                    # Handle channels - parse as JSON
                    if field_name == 'channels' and field_value:
                        try:
                            updates[field_name] = json.loads(field_value)
                        except json.JSONDecodeError:
                            # If JSON parsing fails, log and skip
                            import logging
                            logging.warning(f"Failed to parse channels JSON: {field_value}")
                    else:
                        # For all other fields, just remove quotes if present
                        updates[field_name] = field_value.strip('"').strip("'")
            elif stripped.startswith("SUGGESTIONS:"):
                in_message = False
                suggestion_list = stripped.replace("SUGGESTIONS:", "").strip()
                if suggestion_list:  # Only process if not empty
                    suggestions_array = [s.strip() for s in suggestion_list.split(",") if s.strip()]
                    if suggestions_array:  # Only add if array is not empty
                        # Convert to Suggestion objects with label and value
                        suggestions = [{"label": s, "value": s} for s in suggestions_array]
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

        # REVIEW step - only accepts accept_review action
        if current_step == WorkflowStep.REVIEW:
            if user_action.type == "accept_review":
                # User clicked "Accept & Create Stream" - advance to COMPLETE
                return True
            else:
                # User is making edits - stay in REVIEW
                return False

        # EXPLORATION step - only accepts text_input, never completes from user action
        if current_step == WorkflowStep.EXPLORATION:
            return False

        # DATA STEPS - can be completed by user actions
        if user_action.type == "option_selected":
            # User selected a single suggestion
            field_name = user_action.target_field
            value = user_action.selected_value

            # For channels, treat like text_input - LLM will extract the actual channel data
            if field_name == "channels":
                return False

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
