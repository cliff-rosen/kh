"""
Research Stream Creation Workflow State Machine

Manages the state transitions and business logic for creating a research stream
through an AI-guided interview process. Separates workflow management from LLM interaction.
"""

from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
from schemas.research_stream import PartialStreamConfig


class WorkflowStep(str, Enum):
    """Steps in the research stream creation workflow"""
    EXPLORATION = "exploration"  # Conversational hub for gathering context
    PURPOSE = "purpose"  # Phase 1: Why this stream exists (REQUIRED)
    BUSINESS_GOALS = "business_goals"  # Phase 1: Strategic objectives (REQUIRED)
    EXPECTED_OUTCOMES = "expected_outcomes"  # Phase 1: What decisions this drives (REQUIRED)
    STREAM_NAME = "stream_name"
    STREAM_TYPE = "stream_type"
    FOCUS_AREAS = "focus_areas"
    KEYWORDS = "keywords"  # Phase 1: Search keywords (REQUIRED)
    COMPETITORS = "competitors"
    REPORT_FREQUENCY = "report_frequency"
    REVIEW = "review"
    COMPLETE = "complete"


class WorkflowValidationResult:
    """Result of validating a workflow step"""
    def __init__(self, is_valid: bool, missing_fields: List[str] = None, errors: List[str] = None):
        self.is_valid = is_valid
        self.missing_fields = missing_fields or []
        self.errors = errors or []


class ResearchStreamCreationWorkflow:
    """
    Dependency-based state machine for research stream creation workflow.

    Responsibilities:
    - Track current step and state
    - Validate step completion based on required fields
    - Determine valid next steps based on dependency graph
    - Extract/update configuration from user input
    - Provide guidance for what to ask/collect at each step
    """

    # Define required fields for each step to be considered "complete"
    STEP_REQUIREMENTS = {
        WorkflowStep.EXPLORATION: [],  # No data - just conversational context gathering
        WorkflowStep.PURPOSE: ["purpose"],  # REQUIRED
        WorkflowStep.BUSINESS_GOALS: ["business_goals"],  # REQUIRED
        WorkflowStep.EXPECTED_OUTCOMES: ["expected_outcomes"],  # REQUIRED
        WorkflowStep.STREAM_NAME: ["stream_name"],
        WorkflowStep.STREAM_TYPE: ["stream_type"],
        WorkflowStep.FOCUS_AREAS: ["focus_areas"],
        WorkflowStep.KEYWORDS: ["keywords"],  # REQUIRED
        WorkflowStep.COMPETITORS: [],  # Optional - can skip
        WorkflowStep.REPORT_FREQUENCY: ["report_frequency"],
        WorkflowStep.REVIEW: ["purpose", "business_goals", "expected_outcomes", "stream_name", "stream_type", "focus_areas", "keywords", "report_frequency"],
        WorkflowStep.COMPLETE: ["purpose", "business_goals", "expected_outcomes", "stream_name", "stream_type", "focus_areas", "keywords", "report_frequency"]
    }

    # Mapping of steps to field names (for data steps only)
    STEP_TO_FIELD_MAPPING = {
        WorkflowStep.PURPOSE: "purpose",
        WorkflowStep.BUSINESS_GOALS: "business_goals",
        WorkflowStep.EXPECTED_OUTCOMES: "expected_outcomes",
        WorkflowStep.STREAM_NAME: "stream_name",
        WorkflowStep.STREAM_TYPE: "stream_type",
        WorkflowStep.FOCUS_AREAS: "focus_areas",
        WorkflowStep.KEYWORDS: "keywords",
        WorkflowStep.COMPETITORS: "competitors",
        WorkflowStep.REPORT_FREQUENCY: "report_frequency"
    }

    # List of optional fields that can be skipped
    OPTIONAL_FIELDS = ["competitors"]

    # Data steps (have associated fields)
    DATA_STEPS = [
        WorkflowStep.PURPOSE,
        WorkflowStep.BUSINESS_GOALS,
        WorkflowStep.EXPECTED_OUTCOMES,
        WorkflowStep.STREAM_NAME,
        WorkflowStep.STREAM_TYPE,
        WorkflowStep.FOCUS_AREAS,
        WorkflowStep.KEYWORDS,
        WorkflowStep.COMPETITORS,
        WorkflowStep.REPORT_FREQUENCY
    ]

    # Dependency graph: PURPOSE → BUSINESS_GOALS → EXPECTED_OUTCOMES drives everything else
    STEP_DEPENDENCIES = {
        WorkflowStep.EXPLORATION: [],  # No dependencies - always the starting point
        WorkflowStep.PURPOSE: [WorkflowStep.EXPLORATION],  # Purpose is the foundation
        WorkflowStep.BUSINESS_GOALS: [WorkflowStep.PURPOSE],  # Goals flow from purpose
        WorkflowStep.EXPECTED_OUTCOMES: [WorkflowStep.BUSINESS_GOALS],  # Outcomes flow from goals
        WorkflowStep.STREAM_NAME: [WorkflowStep.EXPECTED_OUTCOMES],  # Name based on purpose/goals/outcomes
        WorkflowStep.STREAM_TYPE: [WorkflowStep.EXPECTED_OUTCOMES],  # Type based on purpose/goals
        WorkflowStep.FOCUS_AREAS: [WorkflowStep.STREAM_TYPE],  # Focus areas after type
        WorkflowStep.KEYWORDS: [WorkflowStep.FOCUS_AREAS],  # Keywords after focus areas
        WorkflowStep.COMPETITORS: [WorkflowStep.FOCUS_AREAS],  # Competitors based on focus
        WorkflowStep.REPORT_FREQUENCY: [WorkflowStep.KEYWORDS],  # Frequency after main config
        WorkflowStep.REVIEW: [  # Review requires all required fields to be collected
            WorkflowStep.EXPLORATION,
            WorkflowStep.PURPOSE,
            WorkflowStep.BUSINESS_GOALS,
            WorkflowStep.EXPECTED_OUTCOMES,
            WorkflowStep.STREAM_NAME,
            WorkflowStep.STREAM_TYPE,
            WorkflowStep.FOCUS_AREAS,
            WorkflowStep.KEYWORDS,
            WorkflowStep.REPORT_FREQUENCY
        ],
        WorkflowStep.COMPLETE: [WorkflowStep.REVIEW]  # Complete only after review
    }

    # Suggested step order (strict progression)
    # This is used to prioritize which incomplete step to suggest next
    PREFERRED_STEP_ORDER = [
        WorkflowStep.EXPLORATION,
        WorkflowStep.PURPOSE,  # 1. Why does this exist?
        WorkflowStep.BUSINESS_GOALS,  # 2. What do you want to achieve?
        WorkflowStep.EXPECTED_OUTCOMES,  # 3. What decisions will this drive?
        WorkflowStep.STREAM_NAME,  # 4. Name it
        WorkflowStep.STREAM_TYPE,  # 5. What type of monitoring?
        WorkflowStep.FOCUS_AREAS,  # 6. What areas?
        WorkflowStep.KEYWORDS,  # 7. What search terms?
        WorkflowStep.COMPETITORS,  # 8. (Optional) What companies?
        WorkflowStep.REPORT_FREQUENCY,  # 9. How often?
        WorkflowStep.REVIEW,
        WorkflowStep.COMPLETE
    ]

    def __init__(self, current_step: str, current_config: PartialStreamConfig):
        self.current_step = WorkflowStep(current_step)
        self.config = current_config

    def validate_step(self, step: WorkflowStep) -> WorkflowValidationResult:
        """
        Validate if a step has all required information.

        Returns:
            WorkflowValidationResult with validation status and any missing fields
        """
        required_fields = self.STEP_REQUIREMENTS.get(step, [])
        # Handle both dict and Pydantic model
        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config if hasattr(self.config, 'model_dump') else self.config
        missing_fields = []

        for field in required_fields:
            value = config_dict.get(field)
            if value is None or (isinstance(value, (list, str)) and not value):
                missing_fields.append(field)

        return WorkflowValidationResult(
            is_valid=len(missing_fields) == 0,
            missing_fields=missing_fields
        )

    def can_advance(self) -> bool:
        """Check if we can advance from current step"""
        return self.validate_step(self.current_step).is_valid

    def is_step_completed(self, step: WorkflowStep) -> bool:
        """Check if a specific step has been completed (its requirements are met)"""
        return self.validate_step(step).is_valid

    def _all_required_fields_complete(self) -> bool:
        """Check if all required fields are complete (ready for review)"""
        required_fields = ["purpose", "business_goals", "expected_outcomes", "stream_name",
                          "stream_type", "focus_areas", "keywords", "report_frequency"]
        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config

        for field in required_fields:
            value = config_dict.get(field)
            if value is None or (isinstance(value, (list, str)) and not value):
                return False
        return True

    def get_completed_steps(self) -> List[WorkflowStep]:
        """Get list of all steps that have been completed"""
        completed = []
        for step in WorkflowStep:
            if self.is_step_completed(step):
                completed.append(step)
        return completed

    def can_transition_to(self, target_step: WorkflowStep) -> bool:
        """
        Check if we can transition to a target step based on dependency graph.

        Args:
            target_step: The step we want to move to

        Returns:
            True if all dependencies for target_step are satisfied
        """
        dependencies = self.STEP_DEPENDENCIES.get(target_step, [])
        completed_steps = self.get_completed_steps()

        # Check if all dependencies are in completed steps
        for dep in dependencies:
            if dep not in completed_steps:
                return False

        return True

    def get_available_next_steps(self) -> List[WorkflowStep]:
        """
        Get all steps that we could validly transition to based on current step.

        Rules:
        - EXPLORATION is ALWAYS available (except from COMPLETE)
        - From EXPLORATION: Can jump to any uncompleted data step
        - From data steps: Can go to other uncompleted data steps OR back to EXPLORATION
        - REVIEW available when all required fields complete
        - COMPLETE only from REVIEW

        Returns:
            List of WorkflowSteps that are valid transitions
        """
        available = []

        if self.current_step == WorkflowStep.COMPLETE:
            # Workflow is done
            return available

        # EXPLORATION is always available (as a fallback for asking questions)
        if self.current_step != WorkflowStep.EXPLORATION:
            available.append(WorkflowStep.EXPLORATION)

        if self.current_step == WorkflowStep.EXPLORATION:
            # From EXPLORATION: Can jump to any uncompleted data step
            available.append(WorkflowStep.EXPLORATION)  # Can stay in exploration

            for step in self.DATA_STEPS:
                # Add if not yet completed
                if not self.is_step_completed(step):
                    available.append(step)

        elif self.current_step == WorkflowStep.REVIEW:
            # From REVIEW can go to COMPLETE or back to EXPLORATION
            available.append(WorkflowStep.COMPLETE)

        else:
            # From data steps: can go to other uncompleted data steps
            # EXPLORATION already added above
            for step in self.DATA_STEPS:
                if step != self.current_step and not self.is_step_completed(step):
                    available.append(step)

        # Add REVIEW if all required fields are complete
        if self._all_required_fields_complete() and self.current_step != WorkflowStep.REVIEW:
            available.append(WorkflowStep.REVIEW)

        return available

    def get_next_step(self) -> WorkflowStep:
        """
        Determine the best next step based on dependency graph and current state.

        Returns:
            The next WorkflowStep to proceed to
        """
        # If we're already at complete, stay there
        if self.current_step == WorkflowStep.COMPLETE:
            return WorkflowStep.COMPLETE

        # Get all available next steps based on dependencies
        available_steps = self.get_available_next_steps()

        # If no available steps (shouldn't happen), stay at current
        if not available_steps:
            return self.current_step

        # If COMPLETE is available, that's always the goal
        if WorkflowStep.COMPLETE in available_steps:
            return WorkflowStep.COMPLETE

        # If REVIEW is available and all required fields are filled, go to review
        if WorkflowStep.REVIEW in available_steps:
            return WorkflowStep.REVIEW

        # Otherwise, pick the first available step from preferred order
        # that hasn't been completed yet
        for step in self.PREFERRED_STEP_ORDER:
            if step in available_steps:
                # Apply business logic: skip competitors for certain stream types
                if step == WorkflowStep.COMPETITORS:
                    config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config if hasattr(self.config, 'model_dump') else self.config
                    stream_type = config_dict.get('stream_type', '')
                    if stream_type in ['scientific', 'clinical']:
                        continue  # Skip this step

                return step

        # Fallback: return first available step
        return available_steps[0]

    def update_config(self, updates: Dict[str, Any]) -> PartialStreamConfig:
        """
        Update the configuration with new values.
        For array fields, intelligently merges instead of replacing.

        Args:
            updates: Dictionary of fields to update

        Returns:
            Updated PartialStreamConfig
        """
        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config

        # Array fields that should be merged, not replaced
        array_fields = ['business_goals', 'focus_areas', 'keywords', 'competitors']

        for field_name, new_value in updates.items():
            if field_name in array_fields and isinstance(new_value, list):
                # Merge arrays: combine existing + new, removing duplicates
                existing = config_dict.get(field_name, [])
                if isinstance(existing, list):
                    # Combine and deduplicate while preserving order
                    combined = existing + [item for item in new_value if item not in existing]
                    config_dict[field_name] = combined
                else:
                    config_dict[field_name] = new_value
            else:
                # For non-array fields, replace value
                config_dict[field_name] = new_value

        self.config = PartialStreamConfig(**config_dict)
        return self.config

    def get_step_guidance(self) -> Dict[str, Any]:
        """
        Get guidance for the current step - what to ask, what to collect, suggestions.

        Returns:
            Dictionary with guidance for the LLM prompt
        """
        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config

        guidance = {
            WorkflowStep.EXPLORATION: {
                "objective": "Gather context and information to prepare for field suggestions",
                "collect": "Conversational context (no specific field)",
                "example_questions": [
                    "I'll help you create a research stream. What area would you like to monitor?",
                    "What aspects of your business or research are you focused on?",
                    "Are you interested in a specific company, therapeutic area, or market segment?"
                ]
            },
            WorkflowStep.PURPOSE: {
                "objective": "Understand why this stream exists - the foundation",
                "collect": "purpose",
                "example_questions": [
                    "What's the purpose of this research stream? What decisions will it help you make?",
                    "Why do you want to monitor this area? What opportunities or risks are you tracking?"
                ]
            },
            WorkflowStep.BUSINESS_GOALS: {
                "objective": "Identify the strategic objectives this stream supports",
                "collect": "business_goals (list)",
                "example_questions": [
                    "What strategic business goals will this stream support?",
                    "What are you hoping to achieve with this intelligence? (e.g., inform study design, track competitive landscape, identify new indications)"
                ],
                "provide_suggestions": True
            },
            WorkflowStep.EXPECTED_OUTCOMES: {
                "objective": "Understand what decisions or actions this intelligence will drive",
                "collect": "expected_outcomes",
                "example_questions": [
                    "What specific outcomes or decisions will this intelligence drive?",
                    "How will you use this information to make better decisions?"
                ]
            },
            WorkflowStep.STREAM_NAME: {
                "objective": "Create a descriptive name for the stream",
                "collect": "stream_name",
                "example_questions": [
                    "Based on your focus, how about we call this stream: '{suggested_name}'?",
                    "What would you like to name this research stream?"
                ]
            },
            WorkflowStep.STREAM_TYPE: {
                "objective": "Determine what type of monitoring they need",
                "collect": "stream_type",
                "options": ["competitive", "regulatory", "clinical", "market", "scientific", "mixed"],
                "example_questions": [
                    "What type of information are you most interested in tracking?",
                    "Are you monitoring competitors, regulatory changes, clinical trials, or scientific research?"
                ]
            },
            WorkflowStep.FOCUS_AREAS: {
                "objective": "Get specific therapeutic areas or topics",
                "collect": "focus_areas (list)",
                "example_questions": [
                    "Which specific therapeutic areas should we monitor?",
                    "What topics or domains are most relevant to you?"
                ],
                "provide_suggestions": True
            },
            WorkflowStep.KEYWORDS: {
                "objective": "Collect specific search keywords for literature databases",
                "collect": "keywords (list)",
                "example_questions": [
                    "What specific keywords should we use when searching scientific literature?",
                    "Are there specific molecules, pathways, or terms we should search for?"
                ],
                "provide_suggestions": True
            },
            WorkflowStep.COMPETITORS: {
                "objective": "Identify companies to monitor (if applicable)",
                "collect": "competitors (list)",
                "optional": True,
                "example_questions": [
                    "Are there specific companies you'd like to monitor?",
                    "Which competitors should we track in this space?"
                ],
                "provide_suggestions": True
            },
            WorkflowStep.REPORT_FREQUENCY: {
                "objective": "Determine how often to generate reports",
                "collect": "report_frequency",
                "options": ["daily", "weekly", "biweekly", "monthly"],
                "example_questions": [
                    "How often would you like to receive reports?",
                    "What frequency works best for your needs: daily, weekly, biweekly, or monthly?"
                ]
            },
            WorkflowStep.REVIEW: {
                "objective": "Show summary and confirm before creating",
                "collect": "Nothing - just review",
                "show_summary": True
            },
            WorkflowStep.COMPLETE: {
                "objective": "Finalize and create the stream",
                "collect": "Nothing - workflow done"
            }
        }

        step_info = guidance.get(self.current_step, {})
        step_info["step"] = self.current_step.value  # Add current step name
        step_info["current_config"] = config_dict
        step_info["missing_fields"] = self.validate_step(self.current_step).missing_fields

        return step_info

    def extract_info_from_message(self, user_message: str, step: WorkflowStep) -> Dict[str, Any]:
        """
        Extract relevant information from user message based on current step.
        This is a simple heuristic extraction - can be enhanced with NLP/LLM.

        Args:
            user_message: The user's input
            step: Current workflow step

        Returns:
            Dictionary of extracted fields
        """
        extracted = {}

        # This is a placeholder - in practice, you might use the LLM to extract structured data
        # For now, we'll rely on the LLM to parse and the workflow to validate

        return extracted

    def get_completion_percentage(self) -> float:
        """
        Calculate how complete the configuration is (0-100%).

        Returns:
            Percentage of required fields that are filled
        """
        all_required_fields = set()
        for step in [WorkflowStep.REVIEW]:  # Use review step as it has all required fields
            all_required_fields.update(self.STEP_REQUIREMENTS[step])

        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config
        filled_fields = sum(
            1 for field in all_required_fields
            if config_dict.get(field) and (
                not isinstance(config_dict[field], (list, str)) or config_dict[field]
            )
        )

        if not all_required_fields:
            return 100.0

        return (filled_fields / len(all_required_fields)) * 100
