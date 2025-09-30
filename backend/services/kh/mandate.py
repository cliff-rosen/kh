"""
Mandate Service for Knowledge Horizon

Generates and manages curation mandates based on user profiles.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import logging
from pydantic import BaseModel, Field

from .base import BaseKHService
from models import CurationMandate, CompanyProfile, UserFeedback, FeedbackType
from schemas.kh_schemas import (
    CurationMandateCreate,
    CurationMandateUpdate,
    CurationMandateResponse,
    CompanyProfileResponse,
    CompanyResearchData,
    MandateGenerationRequest
)
from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config

logger = logging.getLogger(__name__)


class GeneratedMandate(BaseModel):
    """LLM-generated curation mandate"""
    primary_focus: List[str] = Field(description="Primary topics and areas of focus (3-5 items)")
    secondary_interests: List[str] = Field(description="Secondary areas of interest (3-5 items)")
    competitors_to_track: List[str] = Field(description="Specific competitor companies to monitor")
    regulatory_focus: List[str] = Field(description="Regulatory areas to track (FDA, EMA, etc.)")
    scientific_domains: List[str] = Field(description="Scientific/research domains of interest")
    exclusions: List[str] = Field(description="Topics or areas to explicitly exclude")
    rationale: str = Field(description="Brief explanation of why this mandate was generated")


class MandateOptimization(BaseModel):
    """Optimization suggestions for a mandate"""
    add_to_primary: List[str] = Field(default_factory=list)
    remove_from_primary: List[str] = Field(default_factory=list)
    add_to_exclusions: List[str] = Field(default_factory=list)
    adjust_competitors: List[str] = Field(default_factory=list)
    reasoning: str = ""


class MandateGeneratorCaller(BasePromptCaller):
    """Generate curation mandate from profile"""

    def __init__(self):
        config = get_task_config("knowledge_horizon", "mandate_generation")

        super().__init__(
            response_model=GeneratedMandate,
            system_message="""You are an expert at creating information curation mandates for pharmaceutical executives.

            Based on the user's profile and company information, generate a comprehensive curation mandate that will guide the selection and filtering of industry information.

            Consider:
            1. The user's role and responsibilities
            2. Company therapeutic areas and pipeline
            3. Competitive landscape
            4. Regulatory requirements for their products
            5. Relevant scientific domains

            Be specific and actionable. Focus on what would be most valuable for someone in their position.""",
            model=config.get("model", "gpt-5"),
            reasoning_effort=config.get("reasoning_effort", "medium")
        )


class MandateOptimizerCaller(BasePromptCaller):
    """Optimize mandate based on feedback"""

    def __init__(self):
        super().__init__(
            response_model=MandateOptimization,
            system_message="""You are optimizing an information curation mandate based on user feedback.

            Analyze the feedback patterns and suggest specific improvements to the mandate.
            Focus on:
            1. Topics that consistently receive negative feedback
            2. Missing topics based on what users mark as important
            3. Overly broad or narrow focus areas
            4. Competitor relevance

            Provide actionable suggestions for improvement.""",
            model="gpt-5-mini",
            reasoning_effort="low"
        )


class MandateService(BaseKHService):
    """
    Service for generating and managing curation mandates
    """

    def __init__(self, db_session: Session):
        super().__init__(db_session)
        self.generator_caller = MandateGeneratorCaller()
        self.optimizer_caller = MandateOptimizerCaller()

    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        try:
            mandate_count = self.db.query(CurationMandate).count()
            active_count = self.db.query(CurationMandate).filter(
                CurationMandate.is_active == True
            ).count()

            return {
                'status': 'healthy',
                'database': 'connected',
                'total_mandates': mandate_count,
                'active_mandates': active_count
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }

    async def generate_mandate(self,
                               profile: CompanyProfileResponse,
                               research_data: Optional[CompanyResearchData] = None) -> CurationMandateResponse:
        """
        Generate a curation mandate from a company profile

        Args:
            profile: Company profile
            research_data: Optional additional research data

        Returns:
            Generated curation mandate
        """
        self._log_operation('generate_mandate', {'profile_id': profile.profile_id})

        # Check if mandate already exists
        existing_mandate = self.db.query(CurationMandate).filter(
            CurationMandate.user_id == profile.user_id,
            CurationMandate.is_active == True
        ).first()

        if existing_mandate:
            logger.info(f"Active mandate already exists for user {profile.user_id}")
            return CurationMandateResponse.from_orm(existing_mandate)

        # Generate mandate using LLM
        generated = await self._generate_mandate_content(profile, research_data)

        # Create mandate in database
        mandate = CurationMandate(
            user_id=profile.user_id,
            profile_id=profile.profile_id,
            primary_focus=generated.primary_focus,
            secondary_interests=generated.secondary_interests,
            competitors_to_track=generated.competitors_to_track,
            regulatory_focus=generated.regulatory_focus,
            scientific_domains=generated.scientific_domains,
            exclusions=generated.exclusions,
            is_active=True
        )

        self.db.add(mandate)
        self.db.commit()
        self.db.refresh(mandate)

        return CurationMandateResponse.from_orm(mandate)

    async def _generate_mandate_content(self,
                                       profile: CompanyProfileResponse,
                                       research_data: Optional[CompanyResearchData]) -> GeneratedMandate:
        """
        Generate mandate content using LLM

        Args:
            profile: Company profile
            research_data: Research data

        Returns:
            Generated mandate content
        """
        try:
            # Prepare context for LLM
            context = f"""
User Profile:
- Name: {profile.job_title}
- Company: {profile.company_name}
- Therapeutic Areas: {', '.join(profile.therapeutic_areas) if profile.therapeutic_areas else 'Not specified'}
- Pipeline Products: {len(profile.pipeline_products)} products
- Known Competitors: {', '.join(profile.competitors) if profile.competitors else 'Not specified'}
"""

            if research_data:
                context += f"""
Additional Research:
- Company Description: {research_data.company_description}
- Recent Developments: {len(research_data.recent_news) if research_data.recent_news else 0} news items
- Key Personnel: {len(research_data.key_personnel) if research_data.key_personnel else 0} executives
"""

            # Add specific product details if available
            if profile.pipeline_products:
                context += "\nPipeline Products:\n"
                for product in profile.pipeline_products[:5]:  # Top 5 products
                    context += f"- {product.get('name', 'Unknown')}: {product.get('stage', 'Unknown stage')}\n"

            # Generate mandate
            result = await self.generator_caller.invoke(
                messages=[{
                    'role': 'user',
                    'content': f"Generate a comprehensive curation mandate for this executive:\n\n{context}"
                }],
                log_prompt=False
            )

            return result

        except Exception as e:
            logger.error(f"Failed to generate mandate content: {e}")
            # Return default mandate on error
            return GeneratedMandate(
                primary_focus=profile.therapeutic_areas or ["Pharmaceutical developments"],
                secondary_interests=["Clinical trials", "Regulatory updates"],
                competitors_to_track=profile.competitors or [],
                regulatory_focus=["FDA", "EMA"],
                scientific_domains=["Drug discovery", "Clinical research"],
                exclusions=[],
                rationale="Default mandate generated due to processing error"
            )

    async def update_mandate(self,
                            mandate_id: int,
                            updates: CurationMandateUpdate) -> CurationMandateResponse:
        """
        Update an existing mandate

        Args:
            mandate_id: Mandate ID
            updates: Updates to apply

        Returns:
            Updated mandate
        """
        self._log_operation('update_mandate', {'mandate_id': mandate_id})

        mandate = self.db.query(CurationMandate).filter(
            CurationMandate.mandate_id == mandate_id
        ).first()

        if not mandate:
            raise ValueError(f"Mandate {mandate_id} not found")

        # Apply updates
        update_data = updates.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(mandate, key, value)

        mandate.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(mandate)

        return CurationMandateResponse.from_orm(mandate)

    async def optimize_mandate(self,
                               mandate_id: int,
                               lookback_days: int = 30) -> CurationMandateResponse:
        """
        Optimize mandate based on user feedback

        Args:
            mandate_id: Mandate ID
            lookback_days: Days of feedback to consider

        Returns:
            Optimized mandate
        """
        self._log_operation('optimize_mandate', {'mandate_id': mandate_id})

        mandate = self.db.query(CurationMandate).filter(
            CurationMandate.mandate_id == mandate_id
        ).first()

        if not mandate:
            raise ValueError(f"Mandate {mandate_id} not found")

        # Get feedback for this user
        feedback_data = await self._analyze_feedback(mandate.user_id, lookback_days)

        if not feedback_data['has_feedback']:
            logger.info(f"No feedback available for mandate {mandate_id}")
            return CurationMandateResponse.from_orm(mandate)

        # Generate optimization suggestions
        optimization = await self._generate_optimization(mandate, feedback_data)

        # Apply optimizations
        if optimization.add_to_primary:
            mandate.primary_focus = list(set(mandate.primary_focus + optimization.add_to_primary))

        if optimization.remove_from_primary:
            mandate.primary_focus = [
                item for item in mandate.primary_focus
                if item not in optimization.remove_from_primary
            ]

        if optimization.add_to_exclusions:
            mandate.exclusions = list(set(mandate.exclusions + optimization.add_to_exclusions))

        if optimization.adjust_competitors:
            mandate.competitors_to_track = optimization.adjust_competitors

        mandate.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(mandate)

        return CurationMandateResponse.from_orm(mandate)

    async def _analyze_feedback(self, user_id: int, lookback_days: int) -> Dict[str, Any]:
        """
        Analyze user feedback patterns

        Args:
            user_id: User ID
            lookback_days: Days to look back

        Returns:
            Feedback analysis
        """
        from datetime import timedelta

        cutoff_date = datetime.utcnow() - timedelta(days=lookback_days)

        # Get feedback
        feedback = self.db.query(UserFeedback).filter(
            UserFeedback.user_id == user_id,
            UserFeedback.created_at >= cutoff_date
        ).all()

        if not feedback:
            return {'has_feedback': False}

        # Analyze patterns
        positive = []
        negative = []
        important = []

        for item in feedback:
            if item.feedback_type == FeedbackType.THUMBS_UP:
                positive.append(item.notes or '')
            elif item.feedback_type == FeedbackType.THUMBS_DOWN:
                negative.append(item.notes or '')
            elif item.feedback_type == FeedbackType.IRRELEVANT:
                negative.append(item.notes or 'marked as irrelevant')
            elif item.feedback_type == FeedbackType.IMPORTANT:
                important.append(item.notes or '')

        return {
            'has_feedback': True,
            'total_feedback': len(feedback),
            'positive_patterns': positive[:10],
            'negative_patterns': negative[:10],
            'important_items': important[:10]
        }

    async def _generate_optimization(self,
                                    mandate: CurationMandate,
                                    feedback_data: Dict[str, Any]) -> MandateOptimization:
        """
        Generate optimization suggestions using LLM

        Args:
            mandate: Current mandate
            feedback_data: Analyzed feedback

        Returns:
            Optimization suggestions
        """
        try:
            context = f"""
Current Mandate:
- Primary Focus: {', '.join(mandate.primary_focus)}
- Secondary Interests: {', '.join(mandate.secondary_interests)}
- Competitors: {', '.join(mandate.competitors_to_track)}
- Exclusions: {', '.join(mandate.exclusions)}

Feedback Analysis:
- Total Feedback Items: {feedback_data.get('total_feedback', 0)}
- Negative Patterns: {'; '.join(feedback_data.get('negative_patterns', [])[:5])}
- Important Items: {'; '.join(feedback_data.get('important_items', [])[:5])}
"""

            result = await self.optimizer_caller.invoke(
                messages=[{
                    'role': 'user',
                    'content': f"Suggest optimizations for this mandate based on user feedback:\n\n{context}"
                }],
                log_prompt=False
            )

            return result

        except Exception as e:
            logger.error(f"Failed to generate optimization: {e}")
            return MandateOptimization(reasoning="Unable to generate optimization")

    async def get_active_mandate(self, user_id: int) -> Optional[CurationMandateResponse]:
        """
        Get the active mandate for a user

        Args:
            user_id: User ID

        Returns:
            Active mandate or None
        """
        mandate = self.db.query(CurationMandate).filter(
            CurationMandate.user_id == user_id,
            CurationMandate.is_active == True
        ).first()

        if mandate:
            return CurationMandateResponse.from_orm(mandate)

        return None

    async def deactivate_mandate(self, mandate_id: int) -> bool:
        """
        Deactivate a mandate

        Args:
            mandate_id: Mandate ID

        Returns:
            Success status
        """
        self._log_operation('deactivate_mandate', {'mandate_id': mandate_id})

        mandate = self.db.query(CurationMandate).filter(
            CurationMandate.mandate_id == mandate_id
        ).first()

        if not mandate:
            raise ValueError(f"Mandate {mandate_id} not found")

        mandate.is_active = False
        mandate.updated_at = datetime.utcnow()

        self.db.commit()

        return True

    async def validate_mandate(self, mandate: CurationMandateResponse) -> Dict[str, Any]:
        """
        Validate a mandate for completeness and quality

        Args:
            mandate: Mandate to validate

        Returns:
            Validation results
        """
        issues = []
        warnings = []

        # Check primary focus
        if not mandate.primary_focus:
            issues.append("No primary focus areas defined")
        elif len(mandate.primary_focus) < 2:
            warnings.append("Only one primary focus area - consider adding more")

        # Check competitors
        if not mandate.competitors_to_track:
            warnings.append("No competitors specified for tracking")

        # Check regulatory
        if not mandate.regulatory_focus:
            warnings.append("No regulatory bodies specified")

        # Check for overly broad terms
        broad_terms = ["healthcare", "medicine", "pharma", "biotech"]
        for term in mandate.primary_focus:
            if term.lower() in broad_terms:
                warnings.append(f"'{term}' is very broad - consider more specific focus")

        return {
            'valid': len(issues) == 0,
            'issues': issues,
            'warnings': warnings,
            'quality_score': max(0, 100 - len(issues) * 20 - len(warnings) * 10)
        }