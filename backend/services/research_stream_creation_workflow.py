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
    INTRO = "intro"
    BUSINESS_FOCUS = "business_focus"
    PURPOSE = "purpose"  # Phase 1: Why this stream exists
    STREAM_NAME = "stream_name"
    STREAM_TYPE = "stream_type"
    FOCUS_AREAS = "focus_areas"
    KEYWORDS = "keywords"  # Phase 1: Search keywords
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
        WorkflowStep.INTRO: [],
        WorkflowStep.BUSINESS_FOCUS: [],  # Just collecting context
        WorkflowStep.PURPOSE: ["purpose"],  # Phase 1: Purpose is required
        WorkflowStep.STREAM_NAME: ["stream_name"],
        WorkflowStep.STREAM_TYPE: ["stream_type"],
        WorkflowStep.FOCUS_AREAS: ["focus_areas"],
        WorkflowStep.KEYWORDS: ["keywords"],  # Phase 1: Keywords required
        WorkflowStep.COMPETITORS: [],  # Optional - can skip
        WorkflowStep.REPORT_FREQUENCY: ["report_frequency"],
        WorkflowStep.REVIEW: ["purpose", "stream_name", "stream_type", "focus_areas", "keywords", "report_frequency"],
        WorkflowStep.COMPLETE: ["purpose", "stream_name", "stream_type", "focus_areas", "keywords", "report_frequency"]
    }

    # Dependency graph: each step defines what steps must be completed before it can be entered
    STEP_DEPENDENCIES = {
        WorkflowStep.INTRO: [],  # No dependencies - always the starting point
        WorkflowStep.BUSINESS_FOCUS: [WorkflowStep.INTRO],
        WorkflowStep.PURPOSE: [WorkflowStep.INTRO],  # Can happen after intro
        WorkflowStep.STREAM_NAME: [WorkflowStep.PURPOSE],  # Name should come after purpose
        WorkflowStep.STREAM_TYPE: [WorkflowStep.INTRO],  # Can happen after intro
        WorkflowStep.FOCUS_AREAS: [WorkflowStep.INTRO],  # Can happen after intro
        WorkflowStep.KEYWORDS: [WorkflowStep.FOCUS_AREAS],  # Keywords after focus areas
        WorkflowStep.COMPETITORS: [WorkflowStep.INTRO],  # Can happen after intro
        WorkflowStep.REPORT_FREQUENCY: [WorkflowStep.INTRO],  # Can happen after intro
        WorkflowStep.REVIEW: [  # Review requires all core fields to be collected
            WorkflowStep.INTRO,
            WorkflowStep.PURPOSE,
            WorkflowStep.STREAM_NAME,
            WorkflowStep.STREAM_TYPE,
            WorkflowStep.FOCUS_AREAS,
            WorkflowStep.KEYWORDS,
            WorkflowStep.REPORT_FREQUENCY
        ],
        WorkflowStep.COMPLETE: [WorkflowStep.REVIEW]  # Complete only after review
    }

    # Suggested step order (for when multiple paths are possible)
    # This is used to prioritize which incomplete step to suggest next
    PREFERRED_STEP_ORDER = [
        WorkflowStep.INTRO,
        WorkflowStep.BUSINESS_FOCUS,
        WorkflowStep.PURPOSE,  # Phase 1: Ask purpose early
        WorkflowStep.STREAM_NAME,
        WorkflowStep.STREAM_TYPE,
        WorkflowStep.FOCUS_AREAS,
        WorkflowStep.KEYWORDS,  # Phase 1: Keywords after focus areas
        WorkflowStep.COMPETITORS,
        WorkflowStep.REPORT_FREQUENCY,
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
        Get all steps that we could validly transition to based on dependencies.

        Returns:
            List of WorkflowSteps that have their dependencies satisfied
        """
        available = []
        completed_steps = self.get_completed_steps()

        for step in WorkflowStep:
            # Skip if already completed
            if step in completed_steps:
                continue

            # Check if dependencies are met
            if self.can_transition_to(step):
                available.append(step)

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

        Args:
            updates: Dictionary of fields to update

        Returns:
            Updated PartialStreamConfig
        """
        config_dict = self.config.model_dump() if hasattr(self.config, 'model_dump') else self.config
        config_dict.update(updates)
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
            WorkflowStep.INTRO: {
                "objective": "Welcome the user and explain the process",
                "collect": "Nothing specific - just set expectations",
                "example_questions": [
                    "I'll help you create a research stream. Let's start by understanding your focus area."
                ]
            },
            WorkflowStep.BUSINESS_FOCUS: {
                "objective": "Understand what area they want to monitor",
                "collect": "General business focus or therapeutic area (stored as context)",
                "example_questions": [
                    "What area of business or research are you focused on?",
                    "Are you interested in a specific therapeutic area like oncology or cardiovascular?"
                ]
            },
            WorkflowStep.PURPOSE: {
                "objective": "Understand why this stream exists and what decisions it will inform",
                "collect": "purpose",
                "example_questions": [
                    "What's the purpose of this research stream? What decisions will it help you make?",
                    "Why do you want to monitor this area? What opportunities or risks are you tracking?"
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
