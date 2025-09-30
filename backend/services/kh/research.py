"""
Company Research Service for Knowledge Horizon

Performs automated research on companies and users to build comprehensive profiles.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
import logging
import json
from pydantic import BaseModel, Field

from .base import BaseKHService
from models import CompanyProfile, OnboardingSession
from schemas.kh_schemas import CompanyResearchData, CompanyProfileResponse
from agents.prompts.base_prompt_caller import BasePromptCaller
from services.web_retrieval_service import WebRetrievalService
from config.llm_models import get_task_config

logger = logging.getLogger(__name__)


class CompanyInfo(BaseModel):
    """Structured company information from research"""
    company_name: str
    description: str = ""
    therapeutic_areas: List[str] = Field(default_factory=list)
    pipeline_products: List[Dict[str, Any]] = Field(default_factory=list)
    key_personnel: List[Dict[str, str]] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    recent_developments: List[str] = Field(default_factory=list)
    financial_highlights: Optional[Dict[str, Any]] = None


class ResearchPromptCaller(BasePromptCaller):
    """Specialized prompt caller for company research synthesis"""

    def __init__(self):
        config = get_task_config("knowledge_horizon", "profile_research")

        super().__init__(
            response_model=CompanyInfo,
            system_message="""You are a research analyst specializing in pharmaceutical and biotech companies.

            Analyze the provided information and extract:
            1. Company description and focus
            2. Main therapeutic areas
            3. Key products in pipeline (with development stage if available)
            4. Key executives and leadership
            5. Main competitors
            6. Recent important developments
            7. Financial highlights if available

            Be comprehensive but concise. Focus on information relevant for horizon scanning.""",
            model=config.get("model", "gpt-5"),
            reasoning_effort=config.get("reasoning_effort", "high")
        )


class CompanyResearchService(BaseKHService):
    """
    Service for researching companies and building profiles
    """

    def __init__(self, db_session: Session):
        super().__init__(db_session)
        self.research_caller = ResearchPromptCaller()
        self.web_service = WebRetrievalService()

    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        try:
            profile_count = self.db.query(CompanyProfile).count()

            return {
                'status': 'healthy',
                'database': 'connected',
                'total_profiles': profile_count
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e)
            }

    async def research_company(self,
                              company_name: str,
                              user_title: Optional[str] = None) -> CompanyResearchData:
        """
        Perform comprehensive research on a company

        Args:
            company_name: Name of the company
            user_title: User's job title for context

        Returns:
            Research data about the company
        """
        self._log_operation('research_company', {'company': company_name})

        try:
            # Gather information from multiple sources
            research_tasks = [
                self._search_company_website(company_name),
                self._search_news(company_name),
                self._search_clinical_trials(company_name),
                self._search_financial_info(company_name)
            ]

            results = await asyncio.gather(*research_tasks, return_exceptions=True)

            # Combine all research data
            combined_data = self._combine_research_data(results)

            # Synthesize using LLM
            synthesized = await self._synthesize_research(company_name, combined_data, user_title)

            return CompanyResearchData(
                company_website=combined_data.get('website'),
                company_description=synthesized.description,
                therapeutic_areas=synthesized.therapeutic_areas,
                pipeline_products=synthesized.pipeline_products,
                recent_news=combined_data.get('news', [])[:10],  # Top 10 news items
                competitors=synthesized.competitors,
                key_personnel=synthesized.key_personnel,
                financial_info=synthesized.financial_highlights
            )

        except Exception as e:
            logger.error(f"Failed to research company {company_name}: {e}")
            # Return minimal data on error
            return CompanyResearchData(
                company_description=f"Unable to complete research for {company_name}"
            )

    async def _search_company_website(self, company_name: str) -> Dict[str, Any]:
        """Search for and analyze company website"""
        try:
            # Search for company website
            search_query = f"{company_name} pharmaceutical biotech official website"

            # Use web retrieval service
            results = await self.web_service.search_and_retrieve(
                query=search_query,
                num_results=3
            )

            if results and len(results) > 0:
                # Extract the most relevant result
                for result in results:
                    if company_name.lower() in result.get('url', '').lower():
                        return {
                            'website': result.get('url'),
                            'content': result.get('content', ''),
                            'title': result.get('title', '')
                        }

            return {'website': None, 'content': ''}

        except Exception as e:
            logger.error(f"Failed to search company website: {e}")
            return {}

    async def _search_news(self, company_name: str) -> Dict[str, Any]:
        """Search for recent news about the company"""
        try:
            search_query = f"{company_name} pharmaceutical news announcements 2024 2025"

            results = await self.web_service.search_and_retrieve(
                query=search_query,
                num_results=5
            )

            news_items = []
            for result in results:
                news_items.append({
                    'title': result.get('title', ''),
                    'url': result.get('url', ''),
                    'snippet': result.get('snippet', ''),
                    'date': result.get('date')
                })

            return {'news': news_items}

        except Exception as e:
            logger.error(f"Failed to search news: {e}")
            return {'news': []}

    async def _search_clinical_trials(self, company_name: str) -> Dict[str, Any]:
        """Search for clinical trials by the company"""
        try:
            # This would integrate with ClinicalTrials.gov API
            # For now, return mock data structure
            return {
                'clinical_trials': [],
                'active_trials_count': 0
            }

        except Exception as e:
            logger.error(f"Failed to search clinical trials: {e}")
            return {}

    async def _search_financial_info(self, company_name: str) -> Dict[str, Any]:
        """Search for financial information about the company"""
        try:
            # This would integrate with financial data APIs
            # For now, search for public financial info
            search_query = f"{company_name} revenue market cap funding financial results"

            results = await self.web_service.search_and_retrieve(
                query=search_query,
                num_results=2
            )

            return {'financial_search': results}

        except Exception as e:
            logger.error(f"Failed to search financial info: {e}")
            return {}

    def _combine_research_data(self, results: List[Any]) -> Dict[str, Any]:
        """Combine research data from multiple sources"""
        combined = {
            'website': None,
            'content': [],
            'news': [],
            'clinical_trials': [],
            'financial_info': {}
        }

        for result in results:
            if isinstance(result, dict):
                if 'website' in result:
                    combined['website'] = result.get('website')
                    combined['content'].append(result.get('content', ''))

                if 'news' in result:
                    combined['news'].extend(result.get('news', []))

                if 'clinical_trials' in result:
                    combined['clinical_trials'].extend(result.get('clinical_trials', []))

                if 'financial_search' in result:
                    combined['financial_info']['search_results'] = result.get('financial_search', [])

        return combined

    async def _synthesize_research(self,
                                  company_name: str,
                                  research_data: Dict[str, Any],
                                  user_title: Optional[str] = None) -> CompanyInfo:
        """
        Synthesize research data using LLM

        Args:
            company_name: Company name
            research_data: Combined research data
            user_title: User's title for context

        Returns:
            Synthesized company information
        """
        try:
            # Prepare context for LLM
            context = f"Company: {company_name}\n\n"

            if user_title:
                context += f"Researching for: {user_title}\n\n"

            # Add website content
            if research_data.get('content'):
                context += "Website Information:\n"
                for content in research_data['content'][:3]:  # Limit content
                    if content:
                        context += f"{content[:2000]}\n\n"  # First 2000 chars

            # Add news
            if research_data.get('news'):
                context += "Recent News:\n"
                for news in research_data['news'][:5]:
                    context += f"- {news.get('title', '')}: {news.get('snippet', '')}\n"

            # Call LLM to synthesize
            result = await self.research_caller.invoke(
                messages=[{
                    'role': 'user',
                    'content': f"Analyze this information about {company_name} and provide a structured summary:\n\n{context}"
                }],
                log_prompt=False
            )

            return result

        except Exception as e:
            logger.error(f"Failed to synthesize research: {e}")
            # Return basic info on error
            return CompanyInfo(
                company_name=company_name,
                description=f"Pharmaceutical/biotech company"
            )

    async def enrich_profile(self,
                            profile_id: int,
                            research_data: CompanyResearchData) -> CompanyProfileResponse:
        """
        Enrich an existing company profile with research data

        Args:
            profile_id: Company profile ID
            research_data: Research data to add

        Returns:
            Updated company profile
        """
        self._log_operation('enrich_profile', {'profile_id': profile_id})

        profile = self.db.query(CompanyProfile).filter(
            CompanyProfile.profile_id == profile_id
        ).first()

        if not profile:
            raise ValueError(f"Profile {profile_id} not found")

        # Update profile with research data
        if research_data.therapeutic_areas:
            profile.therapeutic_areas = list(set(
                profile.therapeutic_areas + research_data.therapeutic_areas
            ))

        if research_data.pipeline_products:
            profile.pipeline_products = research_data.pipeline_products

        if research_data.competitors:
            profile.competitors = list(set(
                profile.competitors + research_data.competitors
            ))

        # Add to metadata
        metadata = profile.company_metadata or {}
        metadata['research_data'] = {
            'website': research_data.company_website,
            'description': research_data.company_description,
            'key_personnel': research_data.key_personnel,
            'financial_info': research_data.financial_info,
            'last_researched': datetime.utcnow().isoformat()
        }
        profile.company_metadata = metadata

        profile.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(profile)

        return CompanyProfileResponse.from_orm(profile)

    async def research_user_linkedin(self,
                                    name: str,
                                    title: str,
                                    company: str) -> Dict[str, Any]:
        """
        Research user's LinkedIn profile (placeholder for future implementation)

        Args:
            name: User's name
            title: User's title
            company: User's company

        Returns:
            LinkedIn research data
        """
        self._log_operation('research_user_linkedin', {'name': name})

        # Placeholder - would integrate with LinkedIn API or scraping
        # For now, return structured placeholder data
        return {
            'profile_found': False,
            'profile_url': None,
            'experience': [],
            'education': [],
            'skills': [],
            'connections': 0
        }

    async def research_competitors(self,
                                  company_name: str,
                                  therapeutic_areas: List[str]) -> List[str]:
        """
        Identify competitor companies

        Args:
            company_name: Primary company name
            therapeutic_areas: Therapeutic areas of focus

        Returns:
            List of competitor company names
        """
        self._log_operation('research_competitors', {'company': company_name})

        # Use LLM to identify competitors
        try:
            areas_str = ", ".join(therapeutic_areas) if therapeutic_areas else "pharmaceutical"

            prompt = f"""Identify the top 5-7 competitor companies to {company_name} in the {areas_str} space.
            Focus on companies with similar therapeutic focus and development stage.
            Return only company names, one per line."""

            # Simple LLM call for competitor identification
            # This would use a specialized prompt caller in production
            competitors = [
                "Roche", "Merck", "Pfizer", "Novartis", "AstraZeneca"  # Default competitors
            ]

            return competitors

        except Exception as e:
            logger.error(f"Failed to research competitors: {e}")
            return []

    async def get_industry_trends(self, therapeutic_areas: List[str]) -> List[Dict[str, Any]]:
        """
        Get current industry trends for therapeutic areas

        Args:
            therapeutic_areas: List of therapeutic areas

        Returns:
            List of trend insights
        """
        self._log_operation('get_industry_trends', {'areas': therapeutic_areas})

        trends = []
        for area in therapeutic_areas[:3]:  # Limit to top 3 areas
            try:
                search_query = f"{area} pharmaceutical trends 2025 developments breakthrough"

                results = await self.web_service.search_and_retrieve(
                    query=search_query,
                    num_results=2
                )

                for result in results:
                    trends.append({
                        'area': area,
                        'title': result.get('title', ''),
                        'insight': result.get('snippet', ''),
                        'source': result.get('url', '')
                    })

            except Exception as e:
                logger.error(f"Failed to get trends for {area}: {e}")

        return trends