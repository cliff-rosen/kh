"""
Smart Search Service

Service for intelligent research article search with LLM-powered refinement and filtering.
"""

import json
import logging
import asyncio
import re
from typing import List, Dict, Any, AsyncGenerator, Tuple, Union, Optional, Set
from datetime import datetime

from schemas.canonical_types import CanonicalFeatureDefinition
from schemas.smart_search import (
    SearchPaginationInfo,
    FilteredArticle,
    SearchServiceResult,
    OptimizedKeywordsResult
)
from schemas.canonical_types import CanonicalResearchArticle
from schemas.chat import ChatMessage, MessageRole

from agents.prompts.base_prompt_caller import BasePromptCaller, LLMUsage
from config.llm_models import get_task_config, supports_reasoning_effort

from services.google_scholar_service import search_articles as search_scholar_articles
from services.pubmed_service import search_articles as search_pubmed_articles

logger = logging.getLogger(__name__)


class SmartSearchService:
    """Service for smart search functionality"""
    
    def __init__(self):
        pass
    
    def _extract_pmid_from_url(self, url: str) -> Optional[str]:
        """Extract PMID from a URL if present."""
        if not url:
            return None
        # Match patterns like pubmed/12345678 or pmid=12345678
        pmid_patterns = [
            r'pubmed[./](\d+)',
            r'pmid[=:](\d+)',
            r'articles/PMC\d+.*PMID[:\s]+(\d+)'
        ]
        for pattern in pmid_patterns:
            match = re.search(pattern, url, re.IGNORECASE)
            if match:
                return match.group(1)
        return None
    
    async def create_evidence_specification(self, query: str) -> Tuple[str, LLMUsage]:
        """
        Step 2: Create evidence specification from user's query using LLM
        """
        logger.info(f"Step 2 - Creating evidence specification from: {query[:100]}...")
        
        # Create prompt for evidence specification
        system_prompt = """Convert the user's search request into a clear document specification.

        RULES:
        1. Always start with "Find articles that..."
        2. Keep it simple and direct
        3. Focus on what documents are needed, not research questions
        4. Use the user's own terms when possible

        EXAMPLES:
        "effects of exercise on health" → "Find articles that examine the health effects of physical exercise"
        "How does AI help doctors?" → "Find articles that discuss AI applications in clinical practice"  
        "cannabis and motivation" → "Find articles that examine cannabis effects on motivation"

        Respond in JSON format with the "evidence_specification" field."""

        # Object schema with refined_query field for BasePromptCaller
        response_schema = {
            "type": "object",
            "properties": {
                "evidence_specification": {"type": "string"}
            },
            "required": ["evidence_specification"]
        }
        
        # Get model config for evidence specification
        task_config = get_task_config("smart_search", "evidence_spec")
        
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )
        
        try:
            # Get LLM response  
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat", 
                role=MessageRole.USER,
                content=f"User query: {query}\n\nPlease create an evidence specification that describes what documents are needed.",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )
            
            # DEBUG: Log what we actually got back
            logger.info(f"LLM result type: {type(result)}")
            
            # Extract result and usage from LLMResponse
            llm_usage = result.usage
            llm_result = result.result
            
            # Extract evidence_specification from the Pydantic model instance
            if hasattr(llm_result, 'evidence_specification'):
                evidence_spec = llm_result.evidence_specification
                # Sanitize for logging
                evidence_spec_safe = evidence_spec.encode('ascii', 'replace').decode('ascii')
                logger.info(f"Successfully extracted evidence_specification: {evidence_spec_safe[:200]}...")
            else:
                logger.error(f"Result does not have 'evidence_specification' attribute. Type: {type(llm_result)}")
                # Try model_dump as fallback
                if hasattr(llm_result, 'model_dump'):
                    response_data = llm_result.model_dump()
                    logger.info(f"Using model_dump fallback")
                    evidence_spec = response_data.get('evidence_specification', f"Find articles that {query}")
                else:
                    evidence_spec = f"Find articles that {query}"  # Final fallback
                
            # Sanitize for logging
            evidence_spec_safe = evidence_spec.encode('ascii', 'replace').decode('ascii')
            logger.info(f"Final evidence specification: {evidence_spec_safe[:100]}...")
            logger.info(f"Token usage - Prompt: {llm_usage.prompt_tokens}, Completion: {llm_usage.completion_tokens}, Total: {llm_usage.total_tokens}")
            return evidence_spec, llm_usage
            
        except Exception as e:
            logger.error(f"Failed to refine query: {e}")
            # Fallback: return evidence specification format with zero usage
            return f"Find articles that {query}", LLMUsage()
    
    async def generate_search_keywords(self, evidence_specification: str, selected_sources: Optional[List[str]] = None) -> Tuple[str, LLMUsage]:
        """
        Step 3: Generate boolean search query from the evidence specification using LLM
        """
        logger.info(f"Step 3 - Generating search keywords from evidence specification...")
        
        # Determine the target source
        target_source = selected_sources[0] if selected_sources else 'pubmed'
        
        # Create source-specific prompts
        if target_source == 'google_scholar':
            system_prompt = """You are a search query expert for Google Scholar. Your task is to convert an evidence specification into a SIMPLE and FOCUSED natural language search query.

            CRITICAL REQUIREMENTS:
            - MAXIMUM 3-5 key terms only
            - NO complex boolean logic with AND/OR
            - NO parentheses or nested expressions
            - Use simple quoted phrases for specific concepts
            - Target 200-2000 results, not millions

            APPROACH:
            1. Identify the 1-2 MOST IMPORTANT concepts
            2. Use the most specific terms possible
            3. Add one quoted phrase for the main topic
            4. Keep it short and focused

            GOOD EXAMPLES:
            - "CRISPR gene editing" cancer
            - "machine learning" medical diagnosis
            - "quantum computing" algorithms
            - "climate change adaptation" agriculture
            - "materials science" nanomaterials synthesis

            BAD EXAMPLES (too broad/complex):
            - ("China" OR "Chinese") AND ("materials science" OR materials) AND (synthesis OR characterization)
            - (diabetes OR diabetic) AND (treatment OR therapy)
            - machine learning OR artificial intelligence OR deep learning

            STRICT RULE: If the evidence specification is very broad, make the query MORE specific, not less. Focus on the core scientific question.

            Respond in JSON format with a "search_query" field containing the simple natural language search string."""
        else:
            # PubMed prompt (original)
            system_prompt = """You are a search query expert for PubMed and biomedical databases. Your task is to convert an evidence specification into an EFFECTIVE boolean search query optimized for PubMed.

            PUBMED CHARACTERISTICS:
            - Searches titles, abstracts, and MeSH terms
            - Excellent boolean operator support
            - Structured indexing system
            - Precise field searching capabilities
            - Works best with controlled vocabulary

            CORE PRINCIPLES:
            - Target 500-2000 relevant results (not too broad, not too narrow)
            - Use precise biomedical terminology
            - Leverage boolean logic effectively
            - Focus on the most important 2-3 concepts

            GUIDELINES:
            1. Identify the 2-3 CORE concepts from the evidence specification
            2. For each concept, use 2-4 of the most common medical synonyms/variants
            3. Use AND to connect different concepts
            4. Use OR only for true synonyms within the same concept
            5. Use biomedical terminology that appears in PubMed abstracts
            6. Include MeSH terms and common abbreviations when relevant

            QUERY STRUCTURE:
            - Boolean format: (concept1 OR synonym1) AND (concept2 OR synonym2)
            - Maximum 3 AND-connected concept groups
            - 2-4 terms per OR group
            - Clear parentheses for grouping

            GOOD EXAMPLES:
            - (diabetes OR diabetic) AND (neuropathy OR "nerve damage") AND (treatment OR therapy)
            - (CRISPR OR "gene editing") AND (cancer OR tumor OR neoplasm)
            - (myocardial OR cardiac) AND (infarction OR "heart attack") AND (prevention OR prophylaxis)

            BAD EXAMPLES (too complex):
            - (diabetes OR diabetic OR glycemic OR "blood sugar" OR hyperglycemia) AND (neuropathy OR "nerve damage" OR "peripheral nerve" OR polyneuropathy) AND (treatment OR therapy OR management OR intervention OR medication)

            Respond in JSON format with a "search_query" field containing the boolean search string."""

        user_prompt = f"""Evidence specification: {evidence_specification}

        Generate an effective search query for {target_source.replace('_', ' ').title()}."""

        # Schema for search query
        response_schema = {
            "type": "object",
            "properties": {
                "search_query": {"type": "string"}
            },
            "required": ["search_query"]
        }
        
        # Get model config for keyword generation
        task_config = get_task_config("smart_search", "keyword_generation")
        
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )
        
        try:
            # Get LLM response
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat", 
                role=MessageRole.USER,
                content=f"Evidence specification: {evidence_specification}\n\nGenerate an effective boolean search query for academic databases.",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )
            
            # Extract result and usage from LLMResponse
            llm_usage = result.usage
            llm_result = result.result
            
            # Extract search_query from the Pydantic model instance
            if hasattr(llm_result, 'search_query'):
                search_query = llm_result.search_query
                # Sanitize for logging
                search_query_safe = search_query.encode('ascii', 'replace').decode('ascii')
                logger.info(f"Successfully extracted search_query: {search_query_safe[:200]}...")
            else:
                logger.error(f"Result does not have 'search_query' attribute. Type: {type(llm_result)}")
                # Try model_dump as fallback
                if hasattr(llm_result, 'model_dump'):
                    response_data = llm_result.model_dump()
                    logger.info(f"Using model_dump fallback")
                    search_query = response_data.get('search_query', evidence_specification)
                else:
                    search_query = evidence_specification  # Final fallback
            
            # Sanitize for logging
            search_query_safe = search_query.encode('ascii', 'replace').decode('ascii')
            logger.info(f"Generated search query: {search_query_safe[:200]}...")
            logger.info(f"Token usage - Prompt: {llm_usage.prompt_tokens}, Completion: {llm_usage.completion_tokens}, Total: {llm_usage.total_tokens}")
            return search_query, llm_usage
            
        except Exception as e:
            logger.error(f"Failed to generate search query: {e}")
            # Fallback: use evidence specification as-is with zero usage
            return evidence_specification, LLMUsage()
    
    async def get_search_count(self, search_query: str, selected_sources: Optional[List[str]] = None) -> Tuple[int, List[str]]:
        """
        Get total count of search results without retrieving articles
        """
        logger.info(f"Getting result count for query: {search_query[:100]}...")
        
        try:
            # Use the existing search method but with count_only mode
            search_response = await self.search_articles(
                search_query, 
                max_results=1, 
                offset=0, 
                count_only=True,
                selected_sources=selected_sources
            )
            return search_response.pagination.total_available, search_response.sources_searched
        except Exception as e:
            logger.error(f"Failed to get search count: {e}")
            return 0, []
    
    async def add_targeted_refinement(self, current_query: str, current_count: int, evidence_spec: str, target_max: int = 250, selected_sources: Optional[List[str]] = None) -> Tuple[str, str]:
        """
        Add a single targeted refinement to the current query to reduce volume
        with minimal Type II error risk - source-specific approach
        """
        logger.info(f"Adding targeted refinement to: {current_query[:100]}... (current: {current_count:,} -> target: <{target_max})")
        
        # Determine target source
        target_source = selected_sources[0] if selected_sources else 'pubmed'
        
        # Source-specific refinement approaches
        if target_source == 'google_scholar':
            # Google Scholar: Use natural language additions
            system_prompt = """You are a Google Scholar search refinement expert. Your task is to add ONE specific term or quoted phrase to a natural language query to reduce results while maintaining relevance.

                               GOOGLE SCHOLAR REFINEMENT RULES:
                               1. Add ONE specific term that narrows the scope
                               2. Use quoted phrases for specific concepts: "randomized trial"
                               3. NO boolean operators (AND/OR) - just add words naturally
                               4. Focus on methodology, population, or time constraints
                               5. Keep the refined query natural and readable

                               GOOD REFINEMENT EXAMPLES:
                               - "machine learning healthcare" → "machine learning healthcare" "clinical trial"
                               - "climate change agriculture" → "climate change agriculture" adaptation
                               - "materials science nanomaterials" → "materials science nanomaterials" synthesis

                               EFFECTIVE REFINEMENT TERMS:
                               - Study design: "randomized trial", "systematic review", "meta-analysis"
                               - Setting: clinical, laboratory, hospital, community
                               - Population: pediatric, elderly, adult, adolescent
                               - Methodology: prospective, longitudinal, cross-sectional
                               - Time: recent, 2020-2024, "last decade"

                               Respond in JSON format with "refined_query" and "explanation" fields."""
        else:
            # PubMed: Use boolean AND refinement
            system_prompt = """You are a search query refinement expert for PubMed. Your task is to add ONE targeted AND clause to reduce search results to the target range while maintaining relevance.

                               CRITICAL REQUIREMENTS:
                               1. The current query returns too many results and MUST be reduced to the target range
                               2. Add ONE specific AND clause - NOT a broad OR clause with many alternatives
                               3. Choose the MOST RESTRICTIVE reasonable filter from the evidence specification that will not produce excessive type II errors
                               4. Prefer single terms or small 2-3 term OR groups, NOT large OR lists
                               5. Focus on the most specific, distinctive aspect that will actually filter results.

                               EFFECTIVE STRATEGIES (choose ONE):
                               - Study design: AND "randomized controlled trial" OR AND longitudinal OR AND "systematic review"
                               - Population: AND adolescent OR AND "young adult" OR AND "college student" 
                               - Setting: AND clinical OR AND laboratory OR AND workplace
                               - Outcome type: AND cognitive OR AND behavioral OR AND neuroimaging
                               - Timeframe: AND chronic OR AND acute OR AND "long-term"

                               BAD EXAMPLES (too broad, won't reduce results):
                               ❌ AND (study OR research OR analysis OR investigation OR trial OR experiment)
                               ❌ AND (human OR participant OR subject OR patient OR control OR experimental)
                               ❌ AND (outcome OR result OR effect OR impact OR change OR difference)

                               GOOD EXAMPLES (specific, will actually filter):
                               ✅ AND "randomized controlled trial"
                               ✅ AND adolescent  
                               ✅ AND cognitive
                               ✅ AND (fMRI OR neuroimaging)

                               The goal is meaningful reduction in result count, not just adding more terms.

                               Respond in JSON format with the refined query and explanation."""

        # Source-specific user prompt
        if target_source == 'google_scholar':
            user_prompt = f"""Current Google Scholar query: {current_query}
            Current result count: {current_count:,} results
            Target: Under {target_max} results

            Evidence specification: {evidence_spec}

            Add ONE specific term or quoted phrase to this natural language query to reduce results while maintaining relevance. Focus on the most specific aspect that will filter results effectively."""
        else:
            user_prompt = f"""Current PubMed query: {current_query}
            Current result count: {current_count:,} results
            Target: Under {target_max} results

            Evidence specification: {evidence_spec}

            Add ONE conservative AND clause to reduce results while minimizing risk of excluding relevant articles. The current query returns {current_count:,} results, so we need to reduce this to under {target_max}."""

        # Schema for refinement response
        response_schema = {
            "type": "object",
            "properties": {
                "refined_query": {"type": "string"},
                "explanation": {"type": "string"}
            },
            "required": ["refined_query", "explanation"]
        }
        
        # Get model config for keyword optimization
        task_config = get_task_config("smart_search", "keyword_optimization")
        
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )
        
        try:
            # Get LLM refinement suggestion
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat", 
                role=MessageRole.USER,
                content=user_prompt,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )
            
            # Extract result
            llm_result = result.result
            
            # DEBUG: Log what we actually got back
            logger.info(f"LLM result type: {type(llm_result)}")
            
            if hasattr(llm_result, 'refined_query'):
                refined_query = llm_result.refined_query
                explanation = llm_result.explanation if hasattr(llm_result, 'explanation') else "LLM-generated refinement"
                # Sanitize for logging
                refined_query_safe = refined_query.encode('ascii', 'replace').decode('ascii')
                logger.info(f"SUCCESS: Using direct attributes - refined_query: {refined_query_safe[:100]}...")
            else:
                logger.warning(f"LLM result does not have 'refined_query' attribute. Trying model_dump...")
                # Fallback to model_dump
                if hasattr(llm_result, 'model_dump'):
                    response_data = llm_result.model_dump()
                    logger.info(f"Using model_dump fallback")
                    # Source-specific fallback
                    if target_source == 'google_scholar':
                        default_refinement = f"{current_query} study"
                        default_explanation = "Added 'study' to focus on research (fallback refinement)"
                    else:
                        default_refinement = f"({current_query}) AND (study OR research)"
                        default_explanation = "Added research focus as fallback refinement"
                    refined_query = response_data.get('refined_query', default_refinement)
                    explanation = response_data.get('explanation', default_explanation)
                    # Sanitize for logging
                    refined_query_safe = refined_query.encode('ascii', 'replace').decode('ascii')
                    logger.info(f"FALLBACK 1: Using model_dump - refined_query: {refined_query_safe[:100]}...")
                else:
                    logger.warning(f"LLM result has no model_dump method. Using hardcoded fallback.")
                    # Source-specific fallback
                    if target_source == 'google_scholar':
                        refined_query = f"{current_query} study"
                        explanation = "Added 'study' to focus on research (fallback refinement)"
                    else:
                        refined_query = f"({current_query}) AND (study OR research)"
                        explanation = "Added research focus as fallback refinement"
                    # Sanitize for logging
                    refined_query_safe = refined_query.encode('ascii', 'replace').decode('ascii')
                    logger.info(f"FALLBACK 2: Using hardcoded fallback - refined_query: {refined_query_safe[:100]}...")
                
            # Sanitize for logging
            refined_query_safe = refined_query.encode('ascii', 'replace').decode('ascii')
            explanation_safe = explanation.encode('ascii', 'replace').decode('ascii')
            logger.info(f"FINAL: LLM suggested refinement: {refined_query_safe[:100]}...")
            logger.info(f"FINAL: Explanation: {explanation_safe[:200]}...")
            return refined_query, explanation
            
        except Exception as e:
            logger.error(f"Failed to generate LLM refinement: {e}")
            # Source-specific conservative fallback
            if target_source == 'google_scholar':
                fallback_query = f"{current_query} study"
                return fallback_query, "Added 'study' to focus on research (exception fallback)"
            else:
                fallback_query = f"({current_query}) AND (study OR research OR analysis)"
                return fallback_query, "Added research focus (exception fallback)"
    
    async def generate_optimized_search_query(self, current_query: str, evidence_spec: str, target_max: int = 250, selected_sources: Optional[List[str]] = None) -> OptimizedKeywordsResult:
        """
        Generate an optimized search query by adding refinements to the current query
        Returns: (initial_query, initial_count, final_query, final_count, refinement_description, status)
        """
        logger.info(f"Optimizing current query: {current_query[:100]}...")
        
        # Phase 1: Get current query count
        initial_query = current_query
        initial_count, _ = await self.get_search_count(initial_query, selected_sources)
        
        logger.info(f"Current query has {initial_count} results")
        
        # Phase 2: Always attempt optimization when explicitly requested
        # (removed early return for "already optimal" queries)
        
        # Phase 3: Add targeted refinement to current query
        final_query, refinement_description = await self.add_targeted_refinement(initial_query, initial_count, evidence_spec, target_max, selected_sources)
        final_count, _ = await self.get_search_count(final_query, selected_sources)
        
        # Determine status
        if initial_count <= target_max and final_count <= target_max and final_count > 0:
            status = "refined"  # Successfully refined an already good query
        elif initial_count > target_max and final_count <= target_max and final_count > 0:
            status = "refined"  # Successfully optimized large query
        elif final_count == 0:
            status = "manual_needed"
            refinement_description += " (Refinement too restrictive - no results found)"
        else:
            status = "manual_needed"
            refinement_description += f" (Still {final_count} results - manual refinement may be needed)"
        
        logger.info(f"Optimized query: {final_count} results, status: {status}")
        return OptimizedKeywordsResult(
            initial_keywords=initial_query,
            initial_count=initial_count,
            final_keywords=final_query,
            final_count=final_count,
            refinement_description=refinement_description,
            status=status
        )
      
    async def search_articles(self, search_query: str, max_results: int = 50, offset: int = 0, count_only: bool = False, selected_sources: Optional[List[str]] = None) -> SearchServiceResult:
        """
        Search for articles from a single selected source.
        """
        # Default to PubMed if not specified
        if not selected_sources:
            selected_sources = ['pubmed']
        
        # We now only support single source searches
        source = selected_sources[0]
        
        # Note: Google Scholar typically returns max 20 results per page via SerpAPI
        # PubMed can return larger batches (up to 100+)
        # We request what the user wants but may get less from some sources
        logger.info(f"Searching {source} - Query: {search_query[:100]}... (max_results={max_results}, offset={offset}, count_only={count_only})")
        
        if source == 'pubmed':
            return await self._search_pubmed(search_query, max_results, offset, count_only)
        elif source == 'google_scholar':
            return await self._search_google_scholar(search_query, max_results, offset, count_only)
        else:
            raise ValueError(f"Unsupported source: {source}")
    
    async def _search_pubmed(self, search_query: str, max_results: int, offset: int, count_only: bool) -> SearchServiceResult:
        """Search PubMed and return results."""
        try:
            loop = asyncio.get_event_loop()
            results_to_fetch = 1 if count_only else max_results
            
            pubmed_articles, metadata = await loop.run_in_executor(
                None, 
                search_pubmed_articles,
                search_query,
                results_to_fetch,
                offset
            )
            
            total_available = metadata.get('total_results', 0)
            articles = []
            
            if not count_only:
                # pubmed_articles are already CanonicalResearchArticle objects, use them directly
                articles = pubmed_articles
            
            logger.info(f"PubMed: {len(articles)} articles returned, {total_available} total available")
            
            return SearchServiceResult(
                articles=articles,
                pagination=SearchPaginationInfo(
                    total_available=total_available,
                    returned=len(articles),
                    offset=offset,
                    has_more=offset + len(articles) < total_available
                ),
                sources_searched=["pubmed"]
            )
            
        except Exception as e:
            logger.error(f"PubMed search failed: {e}")
            return SearchServiceResult(
                articles=[],
                pagination=SearchPaginationInfo(total_available=0, returned=0, offset=0, has_more=False),
                sources_searched=["pubmed"]
            )
    
    async def _search_google_scholar(self, search_query: str, max_results: int, offset: int, count_only: bool) -> SearchServiceResult:
        """Search Google Scholar and return results."""
        try:
            loop = asyncio.get_event_loop()
            # Google Scholar service handles pagination internally to get the requested number of results
            results_to_fetch = 1 if count_only else max_results
            
            scholar_articles, metadata = await loop.run_in_executor(
                None,
                search_scholar_articles,
                search_query,
                results_to_fetch,
                None,  # year_low
                None,  # year_high
                "relevance",  # sort_by
                offset  # start_index - this was missing!
            )
            
            total_available = metadata.get('total_results', 0)
            articles = []
            
            if not count_only:
                # scholar_articles are already CanonicalResearchArticle objects, use them directly
                articles = scholar_articles
            
            logger.info(f"Google Scholar: {len(articles)} articles returned, {total_available} total available")
            
            return SearchServiceResult(
                articles=articles,
                pagination=SearchPaginationInfo(
                    total_available=total_available,
                    returned=len(articles),
                    offset=offset,
                    has_more=offset + len(articles) < total_available
                ),
                sources_searched=["google_scholar"]
            )
            
        except Exception as e:
            logger.error(f"Google Scholar search failed: {e}")
            return SearchServiceResult(
                articles=[],
                pagination=SearchPaginationInfo(total_available=0, returned=0, offset=0, has_more=False),
                sources_searched=["google_scholar"]
            )
    
    async def generate_semantic_discriminator(
        self,
        refined_question: str,
        search_query: str,
        strictness: str = "medium"
    ) -> str:
        """
        Step 5: Generate a semantic discriminator prompt for filtering articles
        This creates the evaluation criteria that will be used to filter each article
        """
        logger.info(f"Step 5 - Generating semantic discriminator with strictness: {strictness}")

        discriminator_prompt = f"""You are evaluating whether a research article matches a specific research question. The article in question was retrieved as follows: First, the below Research Question was converted to keywords using an LLM. Then these keywords were used to search for articles in the search query. As a result, not all results will actually be a correct semantic match to the research question. Your job is to determine if the article is a correct semantic match to the research question.

        Research Question: {refined_question}

        Search Query Used: {search_query}

        """

        return discriminator_prompt

    async def _evaluate_article(self, article: CanonicalResearchArticle, filter_criteria: str) -> Tuple[FilteredArticle, LLMUsage]:
        """
        Evaluate a single article against the filter criteria using clean prompt structure
        """
        # Create prompt caller for structured response with improved system message
        response_schema = {
            "type": "object",
            "properties": {
                "decision": {"type": "string", "enum": ["Yes", "No"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"}
            },
            "required": ["decision", "confidence", "reasoning"]
        }

        # Get model config for discriminator (filtering)
        task_config = get_task_config("smart_search", "discriminator")

        # Enhanced system message that provides clear context and instructions
        system_message = """You are a research article evaluator. Your task is to determine whether research articles are relevant to specific research criteria.

            Evaluate each article based on its title and abstract, and determine if it addresses or is relevant to the given research criteria.

            Respond in JSON format:
            {{
            "decision": "Yes" or "No",
            "confidence": 0.0 to 1.0,
            "reasoning": "Brief explanation"
            }}"""

        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_message,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )
        
        # Create clean user message with filter criteria and article content
        user_message_content = f"""Research Criteria: {filter_criteria}

            Article to evaluate:
            Title: {article.title}
            Abstract: {article.abstract or "No abstract available"}"""

        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=user_message_content,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # We now have a prompt_caller configured with the system message and response schema
        # We can now use it to evaluate the article
        try:
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )
            
            # Extract result and usage from LLMResponse
            llm_usage = result.usage
            llm_result = result.result
            
            # Convert to response model
            eval_data = llm_result.model_dump() if hasattr(llm_result, 'model_dump') else dict(llm_result)
            
            filtered_article = FilteredArticle(
                article=article,
                passed=eval_data.get("decision", "No") == "Yes",
                confidence=eval_data.get("confidence", 0.5),
                reasoning=eval_data.get("reasoning", "No reasoning provided")
            )
            
            return filtered_article, llm_usage
            
        except Exception as e:
            logger.error(f"Failed to evaluate article '{article.title[:50]}...': {e}", exc_info=True)
            # Default to not passing with low confidence, zero usage
            filtered_article = FilteredArticle(
                article=article,
                passed=False,
                confidence=0.0,
                reasoning=f"Evaluation failed: {str(e)}"
            )
            return filtered_article, LLMUsage()
    
    #TODO: This has been replaced with the filter_articles_with_criteria method for SmartSearch2
    async def filter_articles_parallel(
        self,
        articles: List[CanonicalResearchArticle],
        custom_discriminator: str
    ) -> Tuple[List[FilteredArticle], LLMUsage]:
        """
        Filter articles in parallel using async concurrency
        Returns all filtered articles and aggregated token usage

        Args:
            articles: List of articles to filter
            custom_discriminator: The discriminator prompt to use for filtering

        Returns:
            Tuple of (filtered articles list, aggregated token usage)
        """
        logger.info(f"Starting parallel filtering of {len(articles)} articles")

        # Discriminator is required
        if not custom_discriminator:
            raise ValueError("Discriminator prompt is required for filtering")
        
        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(500)
        
        async def evaluate_with_semaphore(article: CanonicalResearchArticle) -> Tuple[FilteredArticle, LLMUsage]:
            async with semaphore:
                return await self._evaluate_article(article, custom_discriminator)
        
        # Execute all evaluations in parallel
        logger.info(f"Executing {len(articles)} evaluations in parallel (max {semaphore._value} concurrent)")
        start_time = datetime.utcnow()
        
        results = await asyncio.gather(
            *[evaluate_with_semaphore(article) for article in articles],
            return_exceptions=True
        )
        
        duration = datetime.utcnow() - start_time
        logger.info(f"Parallel filtering completed in {duration.total_seconds():.2f} seconds")
        
        # Process results and aggregate token usage
        filtered_articles = []
        total_usage = LLMUsage()
        failed_count = 0
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Failed to evaluate article {i}: {result}")
                failed_count += 1
                # Create a failed/rejected article entry
                filtered_articles.append(FilteredArticle(
                    article=articles[i],
                    passed=False,
                    confidence=0.0,
                    reasoning=f"Evaluation failed: {str(result)}"
                ))
            else:
                filtered_article, usage = result
                filtered_articles.append(filtered_article)
                
                # Aggregate token usage
                total_usage.prompt_tokens += usage.prompt_tokens
                total_usage.completion_tokens += usage.completion_tokens
                total_usage.total_tokens += usage.total_tokens
        
        if failed_count > 0:
            logger.warning(f"{failed_count} articles failed evaluation")
        
        accepted_count = sum(1 for fa in filtered_articles if fa.passed)
        rejected_count = len(filtered_articles) - accepted_count
        
        logger.info(f"Parallel filtering results: {accepted_count} accepted, {rejected_count} rejected")
        
        return filtered_articles, total_usage

    async def filter_articles_with_criteria(
        self,
        articles: List[CanonicalResearchArticle],
        filter_condition: str
    ) -> Tuple[List[FilteredArticle], LLMUsage]:
        """
        Clean filtering method for SmartSearch2 - uses direct filter condition without discriminator generation.

        Args:
            articles: List of articles to filter
            filter_condition: The research criteria to filter against

        Returns:
            Tuple of (filtered articles list, aggregated token usage)
        """
        logger.info(f"Starting clean filtering of {len(articles)} articles with criteria: {filter_condition[:100]}...")

        if not filter_condition.strip():
            raise ValueError("Filter condition is required for filtering")

        if not articles:
            return [], LLMUsage()

        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(500)

        async def evaluate_with_semaphore(article: CanonicalResearchArticle) -> Tuple[FilteredArticle, LLMUsage]:
            async with semaphore:
                return await self._evaluate_article(article, filter_condition)

        # Execute all evaluations in parallel
        logger.info(f"Executing {len(articles)} evaluations in parallel (max {semaphore._value} concurrent)")
        start_time = datetime.utcnow()

        results = await asyncio.gather(
            *[evaluate_with_semaphore(article) for article in articles],
            return_exceptions=True
        )

        duration = datetime.utcnow() - start_time
        logger.info(f"Clean filtering completed in {duration.total_seconds():.2f} seconds")

        # Process results and aggregate token usage
        filtered_articles = []
        total_usage = LLMUsage()
        failed_count = 0

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Failed to evaluate article {i}: {result}")
                failed_count += 1
                # Create a failed/rejected article entry
                filtered_articles.append(FilteredArticle(
                    article=articles[i],
                    passed=False,
                    confidence=0.0,
                    reasoning=f"Evaluation failed: {str(result)}"
                ))
            else:
                filtered_article, usage = result
                filtered_articles.append(filtered_article)

                # Aggregate token usage
                total_usage.prompt_tokens += usage.prompt_tokens
                total_usage.completion_tokens += usage.completion_tokens
                total_usage.total_tokens += usage.total_tokens

        if failed_count > 0:
            logger.warning(f"{failed_count} articles failed evaluation")

        accepted_count = sum(1 for fa in filtered_articles if fa.passed)
        rejected_count = len(filtered_articles) - accepted_count

        logger.info(f"Clean filtering results: {accepted_count} accepted, {rejected_count} rejected")

        return filtered_articles, total_usage

    async def refine_evidence_specification(
        self,
        user_description: str,
        conversation_history: List[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Refine user's description into a clean evidence specification.
        """
        logger.info(f"Refining evidence specification from: {user_description[:100]}...")

        # Build conversation context
        context = ""
        if conversation_history:
            context = "\n\nPrevious conversation:\n"
            for i, exchange in enumerate(conversation_history, 1):
                context += f"Q{i}: {exchange.get('question', '')}\n"
                context += f"A{i}: {exchange.get('answer', '')}\n"

        # Create prompt for evidence specification refinement
        system_prompt = """You are helping a researcher create a clear evidence specification for a systematic literature search.

        Evaluate if the description provides enough detail to create an effective search strategy. A complete evidence specification should clearly define:

        1. **Population**: Who or what is being studied (patients, animals, materials, etc.)
        2. **Intervention/Exposure**: What is being done, given, tested, or measured
        3. **Outcomes**: What effects, results, or measures are being studied
        4. **Context**: Any important constraints (study types, comparison groups, time periods, settings)

        **Completeness Threshold**: Score ≥0.8 = complete enough for search

        **Output Format for Complete Specifications**:
        "Studies that [action] in [population] to [measure/assess outcome]..."

        If complete (≥0.8), provide a clean evidence specification in the standard format.
        If incomplete (<0.8), ask 1-2 focused questions to get the most critical missing information.

        Respond in JSON format."""

        # Response schema for BasePromptCaller
        response_schema = {
            "type": "object",
            "properties": {
                "is_complete": {"type": "boolean"},
                "evidence_specification": {"type": "string"},
                "clarification_questions": {"type": "array", "items": {"type": "string"}},
                "completeness_score": {"type": "number"},
                "missing_elements": {"type": "array", "items": {"type": "string"}},
                "reasoning": {"type": "string"}
            },
            "required": ["is_complete", "completeness_score", "missing_elements", "reasoning"]
        }

        # Get model config for evidence specification
        task_config = get_task_config("smart_search", "evidence_spec")

        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
            # Get LLM response
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat",
                role=MessageRole.USER,
                content=f"User description: {user_description}{context}\n\nPlease evaluate and refine this evidence specification.",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )

            # Extract result following the working pattern
            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            logger.info(f"Evidence spec refinement complete: {response_data.get('is_complete', False)}")
            return response_data

        except Exception as e:
            logger.error(f"Evidence specification refinement failed: {e}")
            raise

    async def extract_search_concepts(self, evidence_specification: str) -> Tuple[List[str], LLMUsage]:
        """
        Extract key searchable concepts from evidence specification.
        """
        logger.info(f"Extracting concepts from evidence specification: {evidence_specification[:100]}...")

        # Create prompt for concept extraction
        system_prompt = """Extract exactly 3 orthogonal biomedical concepts from this evidence specification for creating an effective AND-based search strategy.

        CRITICAL REQUIREMENTS:
        1. Extract EXACTLY 3 concepts (4 only if absolutely essential)
        2. Concepts must be ORTHOGONAL - representing independent dimensions that don't overlap
        3. Think Venn diagram - each concept is a separate circle that will intersect via AND
        4. Avoid redundant or overlapping terms

        Choose concepts from different dimensions like:
        - Population/Subject (who): "adolescents", "mice", "patients with diabetes"
        - Intervention/Exposure (what): "cannabis use", "exercise training", "chemotherapy"
        - Outcome/Measure (result): "motivation", "tumor growth", "blood pressure"
        - Condition/Disease (context): "depression", "diabetes", "cardiovascular disease"

        Examples:
        - "Studies examining cannabis effects on motivation in young adults" → ["cannabis", "motivation", "young adults"]
        - "Research on exercise therapy for depression in elderly patients" → ["exercise therapy", "depression", "elderly"]
        - "Insulin treatment outcomes in type 2 diabetes" → ["insulin", "type 2 diabetes", "treatment outcomes"]

        The goal: When combined with AND, these 3 concepts should precisely target the research intersection.

        Respond in JSON format with the "concepts" field."""

        # Response schema for BasePromptCaller
        response_schema = {
            "type": "object",
            "properties": {
                "concepts": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["concepts"]
        }

        # Get model config for concept extraction
        task_config = get_task_config("smart_search", "extract_concepts")

        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
            # Get LLM response
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat",
                role=MessageRole.USER,
                content=f"Evidence specification: {evidence_specification}\n\nPlease extract the key searchable concepts.",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )

            # Extract result following the working pattern
            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            concepts = response_data.get('concepts', [])
            logger.info(f"Concept extraction complete: {len(concepts)} concepts extracted")
            return concepts, result.usage

        except Exception as e:
            logger.error(f"Concept extraction failed: {e}")
            raise

    async def generate_optimized_keywords(
        self,
        concepts: List[str],
        source: str,
        target_result_count: int = 200
    ) -> Dict[str, Any]:
        """
        Generate optimized Boolean search from concepts using strategic combination.

        Process:
        1. For each concept, generate generous Boolean OR with synonyms
        2. Test each concept OR to get result counts
        3. Find optimal combination that yields ~target_result_count
        """
        logger.info(f"Generating optimized keywords from {len(concepts)} concepts for {source}")

        try:
            # Step 1: Generate generous Boolean OR for each concept
            concept_expansions = {}
            concept_counts = {}

            for concept in concepts:
                # Map concept to MeSH term or simple search term
                expansion = await self._expand_concept_to_mesh_term(concept, source)
                concept_expansions[concept] = expansion

                # Test the count for this concept expansion - always use PubMed for accurate counts
                count = await self._test_pubmed_query_count(expansion)

                concept_counts[concept] = count
                logger.info(f"Concept '{concept}' expanded to: {expansion[:100]}... ({count} results)")

            # Step 2: Find optimal combination strategy
            optimization_result = await self._find_optimal_combination(
                concept_expansions, concept_counts, target_result_count
            )

            return {
                'search_keywords': optimization_result['query'],
                'estimated_results': optimization_result['estimated_count'],
                'concept_counts': concept_counts,
                'optimization_strategy': optimization_result['strategy']
            }

        except Exception as e:
            logger.error(f"Optimized keyword generation failed: {e}")
            raise

    def _combine_mesh_terms(self, terms: List[str], operator: str = "AND") -> str:
        """Combine MeSH terms using Boolean operators."""
        if not terms:
            return ""
        if len(terms) == 1:
            return terms[0]

        # Join terms with the specified operator
        return f" {operator} ".join(f"({term})" if " OR " in term else term for term in terms)

    async def _expand_concept_to_mesh_term(self, concept: str, source: str) -> str:
        """Map a concept to a single MeSH term or simple term for PubMed searches.

        Prioritizes simple, precise MeSH terms to minimize type 2 errors (missing relevant studies).
        Complex boolean expressions with synonyms often miss studies due to indexing variations.
        """

        # Create prompt for simple MeSH mapping
        system_prompt = f"""Map this biomedical concept to the most appropriate single MeSH term for {source} search.

        CRITICAL: Avoid complex boolean expressions - they cause type 2 errors (missing relevant studies).
        Simple MeSH terms are more reliable than expanded synonym lists.

        RULES FOR PUBMED:
        1. Find the single best MeSH term that captures this concept
        2. Return the exact MeSH heading as plain text (no [MeSH] tags)
        3. If no perfect MeSH exists, use the simplest scientific term
        4. NEVER create complex OR expressions with synonyms
        5. Trust MeSH indexing over manual synonym expansion

        RULES FOR GOOGLE SCHOLAR:
        1. Use the simplest, most common term for the concept
        2. No MeSH tags needed
        3. Single term preferred over combinations

        Examples for PubMed:
        - "diabetes" → "Diabetes Mellitus"
        - "mice" → "Mice"
        - "cannabis" → "Cannabis"
        - "mesothelioma" → "Mesothelioma" (NOT "asbestos OR pleural OR lung cancer")
        - "motivation" → "Motivation"
        - "young adults" → "Young Adult"

        Why simple terms work better:
        - MeSH indexers already capture synonyms and related terms
        - Complex OR expressions miss studies indexed with unexpected terms
        - Single precise terms have better recall in PubMed

        Respond in JSON format with "search_term" and "is_mesh" fields."""

        # Response schema for BasePromptCaller
        response_schema = {
            "type": "object",
            "properties": {
                "search_term": {"type": "string"},
                "is_mesh": {"type": "boolean", "description": "True if this is a MeSH term"}
            },
            "required": ["search_term", "is_mesh"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat",
                role=MessageRole.USER,
                content=f"Concept: {concept}\n\nMap to a MeSH term or simple search term for {source}.",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )

            # Extract result following the working pattern
            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            search_term = response_data.get("search_term", concept)

            # Use the search term as-is (plain text MeSH terms or simple terms)
            # No special formatting needed for either PubMed or Google Scholar

            logger.info(f"Mapped concept '{concept}' to: {search_term}")
            return search_term

        except Exception as e:
            logger.error(f"Failed to map concept '{concept}': {e}")
            # Fallback to the original concept
            return concept

    async def _test_pubmed_query_count(self, query: str) -> int:
        """Test a PubMed query to get result count."""
        try:
            from services.pubmed_service import PubMedService
            pubmed_service = PubMedService()
            _, count = pubmed_service._get_article_ids(query, max_results=1)
            return count
        except Exception as e:
            logger.error(f"Failed to test PubMed query count: {e}")
            # Check if it's a 414 URI too long error
            if "414" in str(e) or "Request-URI Too Long" in str(e):
                raise ValueError("Query is too long for PubMed. Try reducing the number of search terms or simplifying the query.")
            # Re-raise the error instead of returning fake data
            raise ValueError(f"Unable to test query on PubMed: {str(e)}")

    async def _find_optimal_combination(
        self,
        concept_expansions: Dict[str, str],
        concept_counts: Dict[str, int],
        target_count: int
    ) -> Dict[str, Any]:
        """Find the optimal combination of concepts to reach target result count.

        With simplified MeSH terms, we can be more precise in our combinations.
        """

        concepts = list(concept_expansions.keys())
        sorted_concepts = sorted(concepts, key=lambda c: concept_counts[c])

        # Since we're using simpler MeSH terms now, we can be more aggressive with ANDs

        # Strategy 1: Try combining ALL concepts with AND for maximum precision
        if len(concepts) >= 2:
            # Build query by combining all MeSH terms with AND
            all_terms = [concept_expansions[c] for c in concepts]
            query = self._combine_mesh_terms(all_terms, "AND")

            # Estimate count - with MeSH terms, AND combinations are more predictable
            # Use geometric mean for estimation
            import math
            if all(concept_counts[c] > 0 for c in concepts):
                geometric_mean = math.exp(sum(math.log(concept_counts[c]) for c in concepts) / len(concepts))
                estimated_count = int(geometric_mean / (len(concepts) * 2))  # Divide by factor for AND operations
            else:
                estimated_count = 0

            if 10 <= estimated_count <= target_count * 2:  # Good range for focused results
                return {
                    'query': query,
                    'estimated_count': estimated_count,
                    'strategy': f'Combined all {len(concepts)} MeSH concepts with AND for precision'
                }

        # Strategy 2: Try the two most specific (smallest count) concepts
        if len(concepts) >= 2:
            concept1, concept2 = sorted_concepts[0], sorted_concepts[1]
            terms = [concept_expansions[concept1], concept_expansions[concept2]]
            query = self._combine_mesh_terms(terms, "AND")

            # Better estimation for MeSH term combinations
            estimated_count = min(concept_counts[concept1], concept_counts[concept2]) // 3

            if estimated_count >= 10:  # Ensure we have meaningful results
                return {
                    'query': query,
                    'estimated_count': estimated_count,
                    'strategy': f'Combined two most specific MeSH terms: "{concept1}" AND "{concept2}"'
                }

        # Strategy 3: Use single most specific MeSH term
        if len(concepts) >= 1:
            smallest_concept = sorted_concepts[0]
            query = concept_expansions[smallest_concept]
            estimated_count = concept_counts[smallest_concept]

            if estimated_count > 0:
                return {
                    'query': query,
                    'estimated_count': estimated_count,
                    'strategy': f'Single most specific MeSH term: "{smallest_concept}"'
                }

        # Fallback: Combine with OR if all else fails
        all_terms = [concept_expansions[c] for c in concepts]
        query = self._combine_mesh_terms(all_terms, "OR")
        return {
            'query': query,
            'estimated_count': sum(concept_counts.values()),
            'strategy': 'OR combination of MeSH terms (fallback)'
        }

    async def expand_concepts_with_counts(
        self,
        concepts: List[str],
        source: str
    ) -> List[Dict[str, Any]]:
        """
        Expand each concept to Boolean expression and get result counts.
        """
        logger.info(f"Expanding {len(concepts)} concepts with counts for {source}")

        expansions = []
        for concept in concepts:
            try:
                # Map concept to MeSH term or simple search term
                expression = await self._expand_concept_to_mesh_term(concept, source)

                # Get result count - always use PubMed for accurate Boolean testing
                # Even for Google Scholar concepts, we test against PubMed for real counts
                count = await self._test_pubmed_query_count(expression)

                expansions.append({
                    'concept': concept,
                    'expression': expression,
                    'count': count
                })

                logger.info(f"Expanded '{concept}' to '{expression[:100]}...' ({count} results)")

            except Exception as e:
                logger.error(f"Failed to expand concept '{concept}': {e}")
                # Add fallback entry
                expansions.append({
                    'concept': concept,
                    'expression': f"({concept})",
                    'count': 0
                })

        return expansions

    async def test_expression_combination(
        self,
        expressions: List[str],
        source: str
    ) -> Dict[str, Any]:
        """
        Test combining multiple Boolean expressions with AND.
        """
        logger.info(f"Testing combination of {len(expressions)} expressions for {source}")
        logger.info(f"Individual expressions: {expressions}")

        if len(expressions) == 1:
            combined_query = expressions[0]
        else:
            # Combine with AND, ensuring each expression is properly parenthesized
            formatted_expressions = []
            for expr in expressions:
                if expr.strip().startswith('(') and expr.strip().endswith(')'):
                    formatted_expressions.append(expr.strip())
                else:
                    formatted_expressions.append(f"({expr.strip()})")
            combined_query = " AND ".join(formatted_expressions)

        logger.info(f"Combined query before testing: {combined_query}")

        # Test the combined query - always use PubMed to get real counts
        # Even for Google Scholar, we test against PubMed to get accurate Boolean logic results
        estimated_results = await self._test_pubmed_query_count(combined_query)

        logger.info(f"Combined query: {combined_query[:200]}... ({estimated_results} estimated results)")
        logger.info(f"LOGIC CHECK: {len(expressions)} expressions ANDed together = {estimated_results} results")

        return {
            'combined_query': combined_query,
            'estimated_results': estimated_results
        }

    async def execute_filtering_workflow(
        self,
        session_id: str,
        user_id: str,
        search_keywords: str,
        evidence_specification: str,
        discriminator_prompt: str,
        strictness: str,
        selected_sources: List[str],
        max_results: int,
        db_session
    ) -> Dict[str, Any]:
        """
        Execute the COMPLETE filtering workflow including all orchestration:
        1. Search for ALL articles up to max_results (no pagination)
        2. Filter them using the discriminator
        3. Calculate all statistics
        4. Update session with all results
        5. Return complete response data
        
        Returns:
            Complete response dict ready for API return
        """
        from datetime import datetime
        from config.settings import settings
        from services.smart_search_session_service import SmartSearchSessionService
        
        # Initialize session service
        session_service = SmartSearchSessionService(db_session)
        
        # Cap max_results by the configured limit
        max_results = min(max_results, settings.MAX_ARTICLES_TO_FILTER)
        
        logger.info(f"Starting filtering workflow: searching for up to {max_results} articles to filter")
        
        # Execute search to get ALL articles to filter (not paginated)
        search_results = await self.search_articles(
            search_query=search_keywords,
            max_results=max_results,
            offset=0,  # Always start from beginning for filtering
            selected_sources=selected_sources
        )
        
        articles_to_filter = search_results.articles
        logger.info(f"Retrieved {len(articles_to_filter)} articles from search (total available: {search_results.pagination.total_available})")
        
        # Check for Google Scholar discrepancy message
        discrepancy_message = None
        if hasattr(search_results, 'metadata') and search_results.metadata:
            discrepancy_message = search_results.metadata.get('discrepancy_message')
        
        # Update session with search execution
        session_service.update_search_execution_step(
            session_id=session_id,
            user_id=user_id,
            total_available=search_results.pagination.total_available,
            returned=len(search_results.articles),
            sources=search_results.sources_searched,
            is_pagination_load=False,
            submitted_search_query=search_keywords
        )
        
        # Track article selection
        session_service.update_article_selection_step(
            session_id=session_id,
            user_id=user_id,
            selected_count=len(search_results.articles)
        )
        
        # Execute parallel filtering
        logger.info(f"About to start filtering with {len(articles_to_filter)} articles")
        start_time = datetime.utcnow()
        try:
            filtered_articles, token_usage = await self.filter_articles_parallel(
                articles=articles_to_filter,
                custom_discriminator=discriminator_prompt
            )
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.info(f"Filtering completed successfully in {duration:.2f} seconds")
        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds()
            logger.error(f"Filtering failed after {duration:.2f} seconds: {e}", exc_info=True)
            # Default to empty results if filtering fails
            filtered_articles, token_usage = [], LLMUsage()
        
        # Calculate statistics
        total_processed = len(filtered_articles)
        total_accepted = sum(1 for fa in filtered_articles if fa.passed)
        total_rejected = total_processed - total_accepted
        
        # Calculate average confidence (only for accepted articles)
        accepted_articles = [fa for fa in filtered_articles if fa.passed]
        average_confidence = (
            sum(fa.confidence for fa in accepted_articles) / len(accepted_articles)
            if accepted_articles else 0.0
        )
        
        # Convert filtered articles to dictionaries for storage
        filtered_articles_data = []
        for fa in filtered_articles:
            filtered_articles_data.append({
                "article": fa.article.dict() if hasattr(fa.article, 'dict') else fa.article,
                "passed": fa.passed,
                "confidence": fa.confidence,
                "reasoning": fa.reasoning
            })
        
        # Update session with filtering results
        session_service.update_filtering_step(
            session_id=session_id,
            user_id=user_id,
            total_filtered=total_processed,
            accepted=total_accepted,
            rejected=total_rejected,
            average_confidence=average_confidence,
            duration_seconds=int(duration),
            filtered_articles=filtered_articles_data,
            submitted_discriminator=discriminator_prompt,
            prompt_tokens=token_usage.prompt_tokens,
            completion_tokens=token_usage.completion_tokens,
            total_tokens=token_usage.total_tokens
        )
        
        logger.info(f"Filtering completed for user {user_id}: {total_accepted}/{total_processed} articles accepted in {duration:.2f}s")
        
        # Build response data
        response_data = {
            "filtered_articles": filtered_articles,
            "total_processed": total_processed,
            "total_accepted": total_accepted,
            "total_rejected": total_rejected,
            "total_available": search_results.pagination.total_available,  # What API initially reported
            "total_retrieved": len(articles_to_filter),  # What we actually got to filter
            "average_confidence": average_confidence,
            "duration_seconds": duration,
            "token_usage": {
                "prompt_tokens": token_usage.prompt_tokens,
                "completion_tokens": token_usage.completion_tokens,
                "total_tokens": token_usage.total_tokens
            },
            "session_id": session_id
        }
        
        # Add discrepancy message if present
        if discrepancy_message:
            response_data["search_limitation_note"] = discrepancy_message
            logger.info(f"Adding search limitation note to response: {discrepancy_message}")
        
        # Return complete response data
        return response_data
    
    async def extract_features_parallel(
        self,
        articles: List[Dict[str, Any]],
        features: List[CanonicalFeatureDefinition]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Extract custom features from articles using parallel processing.
        
        Args:
            articles: List of accepted articles from filtered results  
            features: List of CanonicalFeatureDefinition objects
            
        Returns:
            Dict mapping article_id to extracted features {feature_id: value}
        """
        logger.info(f"Starting parallel feature extraction for {len(articles)} articles with {len(features)} features")
        
        if not features:
            return {}
        
        # Import and initialize the extraction service
        from services.extraction_service import get_extraction_service
        extraction_service = get_extraction_service()
        
        # Build the schema for extraction (same logic as ArticleGroupDetailService)
        properties = {}
        for feature in features:
            properties[feature.name] = self._build_feature_schema(feature)
        
        result_schema = {
            "type": "object",
            "properties": properties,
            "required": [f.name for f in features]
        }
        
        # Build extraction instructions
        instruction_parts = []
        for feature in features:
            if feature.type == 'boolean':
                format_hint = "(Answer: 'yes' or 'no')"
            elif feature.type in ['score', 'number']:
                options = feature.options or {}
                min_val = options.get('min', 1)
                max_val = options.get('max', 10)
                format_hint = f"(Numeric score {min_val}-{max_val})"
            else:
                format_hint = "(Brief text, max 100 chars)"
            
            instruction_parts.append(f"- {feature.name}: {feature.description} {format_hint}")
        
        extraction_instructions = "\n".join(instruction_parts)
        schema_key = f"features_{hash(tuple(f.name for f in features))}"
        
        # Create semaphore to limit concurrent LLM calls (avoid rate limits)
        semaphore = asyncio.Semaphore(100)  # Higher limit for feature extraction - can handle more concurrent requests
        
        async def extract_for_article(article: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
            async with semaphore:
                article_content = self._get_article_content(article)
                # Use the actual article ID from the data - handle both nested and direct formats
                if 'article' in article:
                    article_id = article['article']['id']
                else:
                    article_id = article['id']
                
                try:
                    # Perform extraction for this article
                    extraction_result = await extraction_service.perform_extraction(
                        item={
                            "id": article_id,
                            "title": article_content.get('title', ''),
                            "abstract": article_content.get('abstract', '')
                        },
                        result_schema=result_schema,
                        extraction_instructions=extraction_instructions,
                        schema_key=schema_key
                    )
                    
                    # Process results
                    article_results = {}
                    if extraction_result.extraction:
                        for feature in features:
                            if feature.name in extraction_result.extraction:
                                raw_value = extraction_result.extraction[feature.name]
                                article_results[feature.id] = self._clean_value(raw_value, feature.type, feature.options)
                            else:
                                article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                    else:
                        # No extraction results - use defaults
                        for feature in features:
                            article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                    
                    return article_id, article_results
                    
                except Exception as e:
                    logger.error(f"Failed to extract features for article {article_id}: {e}")
                    # On error, use default values
                    article_results = {}
                    for feature in features:
                        article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                    return article_id, article_results
        
        # Execute all extractions in parallel
        logger.info(f"Executing {len(articles)} feature extractions in parallel (max {semaphore._value} concurrent)")
        start_time = datetime.utcnow()
        
        results = await asyncio.gather(
            *[extract_for_article(article) for article in articles],
            return_exceptions=True
        )
        
        duration = datetime.utcnow() - start_time
        logger.info(f"Parallel feature extraction completed in {duration.total_seconds():.2f} seconds")
        
        # Process results
        final_results = {}
        failed_count = 0
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Failed to extract features for article {i}: {result}")
                failed_count += 1
                # Use article ID and default values for failed extractions
                article_id = self._get_article_id(articles[i])
                article_results = {}
                for feature in features:
                    article_results[feature.id] = self._get_default_value(feature.type, feature.options)
                final_results[article_id] = article_results
            else:
                article_id, article_results = result
                final_results[article_id] = article_results
        
        if failed_count > 0:
            logger.warning(f"{failed_count} articles failed feature extraction")
        
        logger.info(f"Feature extraction completed for {len(final_results)} articles")
        return final_results
    
    def _get_article_content(self, article: Dict) -> Dict:
        """Extract relevant content from article object."""
        # Handle both filtered article format and raw article format
        if 'article' in article:
            article_data = article['article']
        else:
            article_data = article
        
        return {
            'title': article_data.get('title', ''),
            'authors': ', '.join(article_data.get('authors', [])),
            'abstract': article_data.get('abstract', article_data.get('snippet', '')),
            'journal': article_data.get('journal', ''),
            'year': article_data.get('year', '')
        }
    
    def _get_article_id(self, article: Dict) -> str:
        """Generate consistent article ID."""
        # Handle both filtered article format and raw article format
        if 'article' in article:
            article_data = article['article']
        else:
            article_data = article
        
        # Use ID if available, fallback to URL, then create from title and authors
        if article_data.get('id'):
            return article_data['id']
        elif article_data.get('url'):
            return article_data['url']
        else:
            title = article_data.get('title', '')
            authors = article_data.get('authors', [])
            return f"{title[:50]}_{','.join(authors[:2])}"
    
    def _build_feature_schema(self, feature: CanonicalFeatureDefinition) -> Dict[str, Any]:
        """Build JSON schema for a single feature."""
        if feature.type == 'boolean':
            return {
                "type": "string",
                "enum": ["yes", "no"],
                "description": feature.description
            }
        elif feature.type in ['score', 'number']:
            options = feature.options or {}
            return {
                "type": "number",
                "minimum": options.get('min', 1),
                "maximum": options.get('max', 10),
                "description": feature.description
            }
        else:  # text
            return {
                "type": "string",
                "maxLength": 100,
                "description": feature.description
            }
    
    def _clean_value(self, value: Any, feature_type: str, options: Optional[Dict[str, Any]] = None) -> str:
        """Clean and validate extracted values based on feature type."""
        if feature_type == "boolean":
            clean_val = str(value).lower().strip()
            return clean_val if clean_val in ["yes", "no"] else "no"
        elif feature_type in ["score", "number"]:
            try:
                num_val = float(value)
                opts = options or {}
                min_val = opts.get('min', 1)
                max_val = opts.get('max', 10)
                clamped = max(min_val, min(max_val, num_val))
                return str(int(clamped) if clamped.is_integer() else clamped)
            except (ValueError, TypeError):
                return str(options.get('min', 1) if options else 1)
        else:  # text
            return str(value)[:100] if value is not None else ""
    
    def _get_default_value(self, feature_type: str, options: Optional[Dict[str, Any]] = None) -> str:
        """Get default value for a feature type."""
        if feature_type == "boolean":
            return "no"
        elif feature_type in ["score", "number"]:
            return str(options.get('min', 1) if options else 1)
        else:  # text
            return ""
    
    async def execute_search_with_session(self, session_id: str, user_id: str, 
                                        search_keywords: str, max_results: int = 50, 
                                        offset: int = 0, selected_sources: List[str] = None,
                                        db_session = None) -> SearchServiceResult:
        """
        Execute search and update session state - orchestrates the complete search workflow
        """
        from services.smart_search_session_service import SmartSearchSessionService
        
        try:
            logger.info(f"Executing search for session {session_id}, user {user_id}, keywords: {search_keywords[:100]}...")
            
            # Validate session exists
            session_service = SmartSearchSessionService(db_session)
            session = session_service.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found for user {user_id}")
            
            # Execute the search
            result = await self.search_articles(
                search_query=search_keywords,
                max_results=max_results,
                offset=offset,
                selected_sources=selected_sources or ['pubmed']
            )
            
            # Update session with search metadata
            is_pagination_load = offset > 0
            session_service.update_search_execution_step(
                session_id=session_id,
                user_id=user_id,
                total_available=result.pagination.total_available,
                returned=result.pagination.returned,
                sources=result.sources_searched,
                is_pagination_load=is_pagination_load,
                submitted_search_query=search_keywords
            )
            
            logger.info(f"Search completed for session {session_id}: {result.pagination.returned} articles found, {result.pagination.total_available} total available")
            return result
            
        except Exception as e:
            logger.error(f"Search execution with session failed: {e}", exc_info=True)
            raise