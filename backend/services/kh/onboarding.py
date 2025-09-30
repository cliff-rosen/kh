"""
Onboarding Service for Knowledge Horizon

Manages the AI-driven onboarding conversation and user profile extraction.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json
import logging

from .base import BaseKHService
from models import OnboardingSession, CompanyProfile, User
from schemas.kh_schemas import (
    OnboardingMessage,
    OnboardingExtraction,
    OnboardingSessionCreate,
    OnboardingSessionResponse,
    CompanyProfileCreate,
    CompanyProfileResponse
)
from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config

logger = logging.getLogger(__name__)


class OnboardingPromptCaller(BasePromptCaller):
    """Specialized prompt caller for onboarding conversations"""

    def __init__(self):
        # Get optimal model for onboarding
        config = get_task_config("knowledge_horizon", "onboarding_chat")

        super().__init__(
            response_model=OnboardingExtraction,
            system_message="""You are an intelligent onboarding assistant for Knowledge Horizon,
            an AI-powered horizon scanning application for pharmaceutical and biotech executives.

            Extract key information from the conversation to build a user profile.
            Focus on:
            1. User's full name
            2. Job title/role
            3. Company name
            4. Any priorities or specific interests they mention

            Be thorough but concise in your extraction.""",
            model=config.get("model", "gpt-5-mini"),
            temperature=0.0
        )


class OnboardingService(BaseKHService):
    """
    Service for managing user onboarding flow
    """

    def __init__(self, db_session: Session):
        super().__init__(db_session)
        self.prompt_caller = OnboardingPromptCaller()

    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        try:
            # Check database connection
            session_count = self.db.query(OnboardingSession).count()

            return {
                'status': 'healthy',
                'database': 'connected',
                'total_sessions': session_count
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }

    async def start_session(self, user_id: int) -> OnboardingSessionResponse:
        """
        Start a new onboarding session for a user

        Args:
            user_id: User ID

        Returns:
            New onboarding session
        """
        self._log_operation('start_session', {'user_id': user_id})

        # Check if user already has an incomplete session
        existing_session = self.db.query(OnboardingSession).filter(
            OnboardingSession.user_id == user_id,
            OnboardingSession.is_complete == False
        ).first()

        if existing_session:
            return OnboardingSessionResponse.from_orm(existing_session)

        # Create new session
        session = OnboardingSession(
            user_id=user_id,
            conversation_history=[],
            extracted_data={},
            research_data={},
            completed_steps=[],
            is_complete=False
        )

        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)

        return OnboardingSessionResponse.from_orm(session)

    async def process_message(self,
                             session_id: int,
                             message: OnboardingMessage) -> Dict[str, Any]:
        """
        Process a message in the onboarding conversation

        Args:
            session_id: Onboarding session ID
            message: User message

        Returns:
            Response with extracted data and next question
        """
        self._log_operation('process_message', {'session_id': session_id})

        # Get session
        session = self.db.query(OnboardingSession).filter(
            OnboardingSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Add message to history
        conversation_history = session.conversation_history or []
        conversation_history.append({
            'role': message.role,
            'content': message.content,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Extract information from conversation
        extraction = await self._extract_profile_info(conversation_history)

        # Update session
        session.conversation_history = conversation_history
        session.extracted_data = extraction.dict() if extraction else session.extracted_data
        session.updated_at = datetime.utcnow()

        # Generate next question
        next_question = self._generate_next_question(session.extracted_data)

        # Check if onboarding is complete
        is_complete = self._check_completion(session.extracted_data)
        if is_complete:
            session.is_complete = True
            session.completed_at = datetime.utcnow()

        self.db.commit()

        return {
            'session_id': session_id,
            'extracted_data': session.extracted_data,
            'next_question': next_question,
            'is_complete': is_complete
        }

    async def _extract_profile_info(self,
                                   conversation_history: List[Dict]) -> Optional[OnboardingExtraction]:
        """
        Extract profile information from conversation using LLM

        Args:
            conversation_history: Conversation messages

        Returns:
            Extracted profile information
        """
        if not conversation_history:
            return None

        try:
            # Convert to format expected by prompt caller
            messages = [
                {'role': msg['role'], 'content': msg['content']}
                for msg in conversation_history
            ]

            # Extract information using LLM
            result = await self.prompt_caller.invoke(
                messages=messages,
                log_prompt=False
            )

            return result

        except Exception as e:
            logger.error(f"Failed to extract profile info: {e}")
            return None

    def _generate_next_question(self, extracted_data: Dict) -> Optional[str]:
        """
        Generate the next question based on what information is missing

        Args:
            extracted_data: Currently extracted data

        Returns:
            Next question to ask, or None if complete
        """
        if not extracted_data:
            return "Hello! I'm here to help you set up Knowledge Horizon. Could you please tell me your name and what you do?"

        # Check what's missing
        missing_fields = []

        if not extracted_data.get('full_name'):
            return "Could you please tell me your full name?"

        if not extracted_data.get('job_title'):
            return f"Thanks {extracted_data.get('full_name', '')}! What's your current role or job title?"

        if not extracted_data.get('company_name'):
            return "Which company do you work for?"

        if not extracted_data.get('priorities'):
            return "What are your main priorities or areas of interest for staying informed about industry developments?"

        # All basic info collected
        return None

    def _check_completion(self, extracted_data: Dict) -> bool:
        """
        Check if onboarding has collected enough information

        Args:
            extracted_data: Extracted data

        Returns:
            True if onboarding is complete
        """
        required_fields = ['full_name', 'job_title', 'company_name']

        for field in required_fields:
            if not extracted_data.get(field):
                return False

        return True

    async def complete_onboarding(self, session_id: int) -> CompanyProfileResponse:
        """
        Complete the onboarding and create company profile

        Args:
            session_id: Onboarding session ID

        Returns:
            Created company profile
        """
        self._log_operation('complete_onboarding', {'session_id': session_id})

        # Get session
        session = self.db.query(OnboardingSession).filter(
            OnboardingSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError(f"Session {session_id} not found")

        if not session.is_complete:
            raise ValueError(f"Session {session_id} is not complete")

        # Check if profile already exists
        existing_profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.user_id == session.user_id
        ).first()

        if existing_profile:
            return CompanyProfileResponse.from_orm(existing_profile)

        # Create company profile from extracted data
        extracted = session.extracted_data

        profile = CompanyProfile(
            user_id=session.user_id,
            company_name=extracted.get('company_name', ''),
            job_title=extracted.get('job_title', ''),
            therapeutic_areas=extracted.get('therapeutic_areas', []),
            pipeline_products=extracted.get('pipeline_products', []),
            competitors=extracted.get('competitors', []),
            company_metadata=extracted.get('additional_context', {})
        )

        self.db.add(profile)

        # Update user's full name if provided
        if extracted.get('full_name'):
            user = self.db.query(User).filter(User.user_id == session.user_id).first()
            if user and not user.full_name:
                user.full_name = extracted.get('full_name')

        # Mark onboarding step as complete
        if 'profile_created' not in session.completed_steps:
            session.completed_steps = session.completed_steps + ['profile_created']

        self.db.commit()
        self.db.refresh(profile)

        return CompanyProfileResponse.from_orm(profile)

    async def get_session(self, session_id: int) -> OnboardingSessionResponse:
        """
        Get an onboarding session

        Args:
            session_id: Session ID

        Returns:
            Onboarding session
        """
        session = self.db.query(OnboardingSession).filter(
            OnboardingSession.session_id == session_id
        ).first()

        if not session:
            raise ValueError(f"Session {session_id} not found")

        return OnboardingSessionResponse.from_orm(session)

    async def get_user_session(self, user_id: int) -> Optional[OnboardingSessionResponse]:
        """
        Get the most recent onboarding session for a user

        Args:
            user_id: User ID

        Returns:
            Most recent onboarding session or None
        """
        session = self.db.query(OnboardingSession).filter(
            OnboardingSession.user_id == user_id
        ).order_by(OnboardingSession.created_at.desc()).first()

        if session:
            return OnboardingSessionResponse.from_orm(session)

        return None

    async def simulate_conversation(self, user_id: int) -> OnboardingSessionResponse:
        """
        Simulate a complete onboarding conversation for testing

        Args:
            user_id: User ID

        Returns:
            Completed onboarding session
        """
        self._log_operation('simulate_conversation', {'user_id': user_id})

        # Start session
        session = await self.start_session(user_id)

        # Simulate conversation
        test_messages = [
            OnboardingMessage(role="assistant", content="Hello! I'm here to help you set up Knowledge Horizon. Could you please tell me your name and what you do?"),
            OnboardingMessage(role="user", content="Hi! I'm Dr. Sarah Johnson, I'm the VP of Clinical Development at BioPharm Industries."),
            OnboardingMessage(role="assistant", content="Nice to meet you, Dr. Johnson! What are your main priorities for staying informed about industry developments?"),
            OnboardingMessage(role="user", content="I need to track developments in immunotherapy, especially CAR-T and checkpoint inhibitors for solid tumors. Also need to keep an eye on our competitors like Roche and Merck."),
        ]

        for message in test_messages:
            await self.process_message(session.session_id, message)

        # Complete onboarding
        session = await self.get_session(session.session_id)

        # Force completion for testing
        db_session = self.db.query(OnboardingSession).filter(
            OnboardingSession.session_id == session.session_id
        ).first()

        db_session.extracted_data = {
            'full_name': 'Dr. Sarah Johnson',
            'job_title': 'VP of Clinical Development',
            'company_name': 'BioPharm Industries',
            'priorities': ['immunotherapy', 'CAR-T', 'checkpoint inhibitors', 'solid tumors'],
            'therapeutic_areas': ['Oncology', 'Immunotherapy'],
            'competitors': ['Roche', 'Merck']
        }
        db_session.is_complete = True
        db_session.completed_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(db_session)

        return OnboardingSessionResponse.from_orm(db_session)