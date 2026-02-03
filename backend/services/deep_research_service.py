"""
Deep Research Service

Orchestrates complex research questions through iterative search and analysis.
Uses PubMed and web search in parallel, with LLM-driven query generation,
result processing, and answer synthesis.

Usage:
    service = DeepResearchService(db, user_id)

    # Execute research (async generator for streaming)
    async for progress in service.execute(question, context, max_iterations):
        if isinstance(progress, ToolProgress):
            # Handle progress update
            print(f"{progress.stage}: {progress.message}")
        elif isinstance(progress, ToolResult):
            # Final result
            print(progress.text)
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator, Union
from datetime import datetime
from pydantic import BaseModel, Field

from sqlalchemy.ext.asyncio import AsyncSession

from agents.prompts.llm import call_llm, LLMResult
from services.pubmed_service import search_articles as search_pubmed
from services.search_service import SearchService
from services.tool_trace_service import ToolTraceService
from tools.registry import ToolProgress, ToolResult

logger = logging.getLogger(__name__)


# =============================================================================
# Pydantic Models for LLM Responses
# =============================================================================

class RefinedQuestion(BaseModel):
    """LLM output for question refinement."""
    refined_question: str = Field(description="Clear, unambiguous version of the question")
    scope_boundaries: List[str] = Field(description="What is in/out of scope")
    key_terms: List[str] = Field(description="Key terms and concepts to search for")


class ChecklistItem(BaseModel):
    """A single checklist item."""
    id: str = Field(description="Unique identifier (e.g., '1', '2')")
    description: str = Field(description="What information is needed")


class Checklist(BaseModel):
    """LLM output for checklist generation."""
    items: List[ChecklistItem] = Field(description="List of 3-7 checklist items")


class SearchQueries(BaseModel):
    """LLM output for query generation."""
    pubmed_queries: List[str] = Field(description="1-2 PubMed search queries")
    web_queries: List[str] = Field(description="1-2 web search queries")
    reasoning: str = Field(description="Why these queries were chosen")


class ExtractedFact(BaseModel):
    """A fact extracted from search results."""
    fact: str = Field(description="The key finding or information")
    source_id: str = Field(description="ID of the source (e.g., 'pubmed_12345' or 'web_1')")
    addresses_items: List[str] = Field(description="Checklist item IDs this addresses")


class ProcessedResults(BaseModel):
    """LLM output for result processing."""
    facts: List[ExtractedFact] = Field(description="Extracted facts with citations")
    new_gaps: List[str] = Field(description="Any new gaps or follow-up questions identified")


class ChecklistStatus(BaseModel):
    """Status of a single checklist item."""
    id: str
    status: str = Field(description="'satisfied', 'partial', or 'unsatisfied'")
    evidence_summary: str = Field(description="Brief summary of evidence found")


class CompletenessCheck(BaseModel):
    """LLM output for completeness checking."""
    items: List[ChecklistStatus] = Field(description="Status of each checklist item")
    is_complete: bool = Field(description="True if research is sufficiently complete")
    recommendation: str = Field(description="Continue searching or synthesize answer")


class SynthesizedAnswer(BaseModel):
    """LLM output for answer synthesis."""
    answer: str = Field(description="Comprehensive answer with inline citations [1], [2], etc.")
    limitations: List[str] = Field(description="Known limitations or gaps")


# =============================================================================
# Source Tracking
# =============================================================================

class Source:
    """Tracks a source used in research."""

    def __init__(
        self,
        id: str,
        source_type: str,  # "pubmed" or "web"
        title: str,
        url: str,
        snippet: str,
        metadata: Optional[Dict[str, Any]] = None
    ):
        self.id = id
        self.source_type = source_type
        self.title = title
        self.url = url
        self.snippet = snippet
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.source_type,
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "metadata": self.metadata
        }


# =============================================================================
# Deep Research Service
# =============================================================================

class DeepResearchService:
    """
    Service for conducting deep research on complex questions.

    Orchestrates:
    1. Question refinement
    2. Checklist generation
    3. Iterative search loop (PubMed + Web in parallel)
    4. Result processing and knowledge base building
    5. Completeness checking
    6. Answer synthesis
    """

    # Configuration
    MAX_PUBMED_RESULTS = 10
    MAX_WEB_RESULTS = 10
    TIMEOUT_SECONDS = 600  # 10 minutes

    def __init__(self, db: AsyncSession, user_id: int, org_id: Optional[int] = None):
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.trace_service = ToolTraceService(db)
        self.web_search_service = SearchService()

        # Research state
        self.trace_id: Optional[str] = None
        self.sources: Dict[str, Source] = {}
        self.knowledge_base: List[ExtractedFact] = []
        self.checklist: List[ChecklistItem] = []
        self.checklist_status: Dict[str, ChecklistStatus] = {}

        # Metrics
        self.metrics = {
            "total_iterations": 0,
            "pubmed_queries": 0,
            "web_queries": 0,
            "sources_processed": 0,
            "llm_calls": 0
        }

    async def execute(
        self,
        question: str,
        context: Optional[str] = None,
        max_iterations: int = 10
    ) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
        """
        Execute deep research on a question.

        Yields ToolProgress updates during execution, then yields final ToolResult.

        Args:
            question: The research question to investigate
            context: Optional context about user's needs
            max_iterations: Maximum research iterations (default 10)

        Yields:
            ToolProgress: Progress updates during execution
            ToolResult: Final result when complete
        """
        start_time = datetime.utcnow()

        try:
            # Create trace
            self.trace_id = await self.trace_service.create_trace(
                tool_name="deep_research",
                user_id=self.user_id,
                org_id=self.org_id,
                input_params={
                    "question": question,
                    "context": context,
                    "max_iterations": max_iterations
                }
            )

            await self.trace_service.start_trace(self.trace_id)

            yield ToolProgress(
                stage="starting",
                message="Starting deep research...",
                progress=0.0
            )

            # Step 1: Refine question
            yield ToolProgress(
                stage="refining",
                message="Refining question and generating research plan...",
                progress=0.05
            )

            refined = await self._refine_question(question, context)
            if not refined:
                raise Exception("Failed to refine question")

            await self._update_trace_state({
                "refined_question": refined.refined_question,
                "scope_boundaries": refined.scope_boundaries,
                "key_terms": refined.key_terms
            })

            # Step 2: Generate checklist
            yield ToolProgress(
                stage="checklist",
                message="Generating research checklist...",
                progress=0.1
            )

            checklist = await self._generate_checklist(refined.refined_question)
            if not checklist:
                raise Exception("Failed to generate checklist")

            self.checklist = checklist.items
            for item in self.checklist:
                self.checklist_status[item.id] = ChecklistStatus(
                    id=item.id,
                    status="unsatisfied",
                    evidence_summary=""
                )

            await self._update_trace_state({
                "checklist": [{"id": i.id, "description": i.description} for i in self.checklist]
            })

            yield ToolProgress(
                stage="checklist",
                message=f"Generated checklist with {len(self.checklist)} items to investigate",
                progress=0.15,
                data={"checklist_items": len(self.checklist)}
            )

            # Step 3: Research loop
            iterations = []
            for iteration in range(1, max_iterations + 1):
                self.metrics["total_iterations"] = iteration

                # Check timeout
                elapsed = (datetime.utcnow() - start_time).total_seconds()
                if elapsed > self.TIMEOUT_SECONDS:
                    logger.warning(f"Research timeout after {elapsed:.0f} seconds")
                    break

                progress_base = 0.15 + (0.7 * (iteration - 1) / max_iterations)

                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Research iteration {iteration}/{max_iterations}",
                    progress=progress_base,
                    data={"iteration": iteration, "max_iterations": max_iterations}
                )

                # Generate queries based on gaps
                unsatisfied = [
                    self.checklist_status[item.id]
                    for item in self.checklist
                    if self.checklist_status[item.id].status != "satisfied"
                ]

                if not unsatisfied:
                    logger.info("All checklist items satisfied, ending research")
                    break

                queries = await self._generate_queries(
                    refined.refined_question,
                    self._summarize_knowledge_base(),
                    [item for item in self.checklist if self.checklist_status[item.id].status != "satisfied"]
                )

                if not queries:
                    logger.warning("Failed to generate queries, skipping iteration")
                    continue

                # Execute searches in parallel
                iteration_data = {
                    "iteration": iteration,
                    "pubmed_queries": queries.pubmed_queries,
                    "web_queries": queries.web_queries
                }

                for q in queries.pubmed_queries:
                    yield ToolProgress(
                        stage=f"iteration_{iteration}",
                        message=f"Searching PubMed: \"{q}\"",
                        progress=progress_base + 0.1
                    )

                for q in queries.web_queries:
                    yield ToolProgress(
                        stage=f"iteration_{iteration}",
                        message=f"Searching Web: \"{q}\"",
                        progress=progress_base + 0.15
                    )

                search_results = await self._execute_searches(
                    queries.pubmed_queries,
                    queries.web_queries
                )

                iteration_data["results_count"] = len(search_results)

                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Processing {len(search_results)} results...",
                    progress=progress_base + 0.2
                )

                # Process results
                if search_results:
                    processed = await self._process_results(
                        refined.refined_question,
                        [item for item in self.checklist if self.checklist_status[item.id].status != "satisfied"],
                        search_results
                    )

                    if processed:
                        self.knowledge_base.extend(processed.facts)

                # Check completeness
                completeness = await self._check_completeness(
                    refined.refined_question,
                    self.checklist,
                    self._summarize_knowledge_base()
                )

                if completeness:
                    for status in completeness.items:
                        self.checklist_status[status.id] = status

                    satisfied_count = sum(
                        1 for s in self.checklist_status.values()
                        if s.status == "satisfied"
                    )
                    total_count = len(self.checklist)

                    iteration_data["checklist_progress"] = f"{satisfied_count}/{total_count}"

                    yield ToolProgress(
                        stage=f"iteration_{iteration}",
                        message=f"Checklist: {satisfied_count}/{total_count} items satisfied",
                        progress=progress_base + 0.3,
                        data={"satisfied": satisfied_count, "total": total_count}
                    )

                    if completeness.is_complete:
                        logger.info("Research complete according to completeness check")
                        iterations.append(iteration_data)
                        break

                iterations.append(iteration_data)

                await self._update_trace_state({
                    "iterations": iterations,
                    "knowledge_base": {
                        "facts": [{"fact": f.fact, "source_id": f.source_id} for f in self.knowledge_base],
                        "sources": [s.to_dict() for s in self.sources.values()]
                    }
                })

            # Step 4: Synthesize answer
            yield ToolProgress(
                stage="synthesizing",
                message="Synthesizing final answer...",
                progress=0.9
            )

            answer = await self._synthesize_answer(
                refined.refined_question,
                self.checklist,
                self._summarize_knowledge_base()
            )

            if not answer:
                raise Exception("Failed to synthesize answer")

            # Build final result
            sources_list = [s.to_dict() for s in self.sources.values()]

            checklist_coverage = {
                "satisfied": [s.id for s in self.checklist_status.values() if s.status == "satisfied"],
                "partial": [s.id for s in self.checklist_status.values() if s.status == "partial"],
                "gaps": [s.id for s in self.checklist_status.values() if s.status == "unsatisfied"]
            }

            result_data = {
                "trace_id": self.trace_id,
                "answer": answer.answer,
                "sources": sources_list,
                "checklist_coverage": checklist_coverage,
                "iterations_used": self.metrics["total_iterations"],
                "status": "completed",
                "limitations": answer.limitations
            }

            # Complete trace
            await self.trace_service.complete_trace(
                trace_id=self.trace_id,
                result=result_data,
                metrics=self.metrics
            )

            yield ToolProgress(
                stage="complete",
                message="Research complete!",
                progress=1.0
            )

            # Format answer text with citations
            answer_text = self._format_answer_with_sources(answer.answer, sources_list)

            yield ToolResult(
                text=answer_text,
                payload={
                    "type": "deep_research_result",
                    "data": result_data
                }
            )

        except Exception as e:
            logger.error(f"Deep research failed: {e}", exc_info=True)

            if self.trace_id:
                await self.trace_service.fail_trace(
                    trace_id=self.trace_id,
                    error_message=str(e),
                    metrics=self.metrics
                )

            yield ToolResult(
                text=f"Research failed: {str(e)}",
                payload={
                    "type": "deep_research_error",
                    "error": str(e),
                    "trace_id": self.trace_id
                }
            )

    # =========================================================================
    # LLM Steps
    # =========================================================================

    async def _refine_question(
        self,
        question: str,
        context: Optional[str]
    ) -> Optional[RefinedQuestion]:
        """Refine the question to be clear and unambiguous."""
        system_message = """You are a research assistant helping to refine research questions.
Given a question and optional context, produce:
1. A refined, unambiguous version of the question
2. Explicit scope boundaries (what's in/out of scope)
3. Key terms and concepts to search for"""

        user_message = """Question: {question}

Context: {context}

Refine this question for research."""

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={
                "question": question,
                "context": context or "No additional context provided"
            },
            response_schema=RefinedQuestion
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return RefinedQuestion(**result.data)
        else:
            logger.error(f"Failed to refine question: {result.error}")
            return None

    async def _generate_checklist(
        self,
        refined_question: str
    ) -> Optional[Checklist]:
        """Generate a checklist of what a complete answer needs."""
        system_message = """You are a research assistant. Given a research question,
generate a checklist of 3-7 specific items that a comprehensive answer must address.
Each item should be specific and verifiable."""

        user_message = """Question: {question}

Generate a checklist of what information is needed for a complete answer."""

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={"question": refined_question},
            response_schema=Checklist
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return Checklist(**result.data)
        else:
            logger.error(f"Failed to generate checklist: {result.error}")
            return None

    async def _generate_queries(
        self,
        refined_question: str,
        knowledge_summary: str,
        unsatisfied_items: List[ChecklistItem]
    ) -> Optional[SearchQueries]:
        """Generate search queries based on gaps."""
        system_message = """You are a research assistant generating search queries.
Based on the research question and what information is still needed,
generate targeted search queries for PubMed (medical/scientific) and web search.

For PubMed queries, use proper PubMed search syntax with MeSH terms where appropriate.
For web queries, use natural language optimized for search engines."""

        user_message = """Research question: {question}

Already known:
{knowledge_summary}

Still need to find:
{needed_items}

Generate 1-2 PubMed queries and 1-2 web search queries to fill the gaps."""

        needed_items = "\n".join(f"- {item.description}" for item in unsatisfied_items)

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={
                "question": refined_question,
                "knowledge_summary": knowledge_summary or "Nothing found yet",
                "needed_items": needed_items
            },
            response_schema=SearchQueries
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return SearchQueries(**result.data)
        else:
            logger.error(f"Failed to generate queries: {result.error}")
            return None

    async def _process_results(
        self,
        refined_question: str,
        unsatisfied_items: List[ChecklistItem],
        search_results: List[Dict[str, Any]]
    ) -> Optional[ProcessedResults]:
        """Extract relevant facts from search results."""
        system_message = """You are a research assistant extracting information from search results.
For each relevant finding, extract the key fact, note which checklist items it addresses,
and include the source ID for citation."""

        user_message = """Research question: {question}

Checklist items still needed:
{needed_items}

Search results:
{results}

Extract relevant facts and note which checklist items they address."""

        needed_items = "\n".join(f"- [{item.id}] {item.description}" for item in unsatisfied_items)

        # Format search results
        results_text = ""
        for r in search_results[:20]:  # Limit to avoid token overflow
            results_text += f"\n[{r['source_id']}] {r['title']}\n{r['snippet']}\n"

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={
                "question": refined_question,
                "needed_items": needed_items,
                "results": results_text
            },
            response_schema=ProcessedResults
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return ProcessedResults(**result.data)
        else:
            logger.error(f"Failed to process results: {result.error}")
            return None

    async def _check_completeness(
        self,
        refined_question: str,
        checklist: List[ChecklistItem],
        knowledge_summary: str
    ) -> Optional[CompletenessCheck]:
        """Check if the checklist items are satisfied."""
        system_message = """You are a research assistant evaluating research completeness.
Review the checklist against accumulated knowledge and determine:
- Which items are satisfied (sufficient information found)
- Which are partial (some info but gaps remain)
- Which are unsatisfied (no relevant information found)

Research is complete if all items are satisfied or have good partial coverage."""

        user_message = """Research question: {question}

Checklist:
{checklist}

Knowledge accumulated:
{knowledge}

Evaluate completeness of each checklist item."""

        checklist_text = "\n".join(f"- [{item.id}] {item.description}" for item in checklist)

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={
                "question": refined_question,
                "checklist": checklist_text,
                "knowledge": knowledge_summary
            },
            response_schema=CompletenessCheck
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return CompletenessCheck(**result.data)
        else:
            logger.error(f"Failed to check completeness: {result.error}")
            return None

    async def _synthesize_answer(
        self,
        refined_question: str,
        checklist: List[ChecklistItem],
        knowledge_summary: str
    ) -> Optional[SynthesizedAnswer]:
        """Synthesize a comprehensive answer from accumulated knowledge."""
        system_message = """You are a research assistant synthesizing a comprehensive answer.
Based on the research question, checklist, and accumulated knowledge:
1. Address each checklist item
2. Use inline citations [1], [2], etc.
3. Note any limitations or gaps
4. Be comprehensive but concise"""

        user_message = """Research question: {question}

Checklist to address:
{checklist}

Knowledge accumulated:
{knowledge}

Synthesize a comprehensive answer with citations."""

        checklist_text = "\n".join(f"- {item.description}" for item in checklist)

        result = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values={
                "question": refined_question,
                "checklist": checklist_text,
                "knowledge": knowledge_summary
            },
            response_schema=SynthesizedAnswer
        )

        self.metrics["llm_calls"] += 1

        if result.ok:
            return SynthesizedAnswer(**result.data)
        else:
            logger.error(f"Failed to synthesize answer: {result.error}")
            return None

    # =========================================================================
    # Search Execution
    # =========================================================================

    async def _execute_searches(
        self,
        pubmed_queries: List[str],
        web_queries: List[str]
    ) -> List[Dict[str, Any]]:
        """Execute PubMed and web searches in parallel."""
        results = []

        # Create search tasks
        tasks = []

        for query in pubmed_queries:
            tasks.append(self._search_pubmed(query))
            self.metrics["pubmed_queries"] += 1

        for query in web_queries:
            tasks.append(self._search_web(query))
            self.metrics["web_queries"] += 1

        # Execute in parallel
        search_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect results
        for result in search_results:
            if isinstance(result, Exception):
                logger.error(f"Search failed: {result}")
                continue
            if isinstance(result, list):
                results.extend(result)

        self.metrics["sources_processed"] += len(results)
        return results

    async def _search_pubmed(self, query: str) -> List[Dict[str, Any]]:
        """Search PubMed and return formatted results."""
        results = []

        try:
            articles, metadata = await search_pubmed(
                query=query,
                max_results=self.MAX_PUBMED_RESULTS
            )

            for article in articles:
                source_id = f"pubmed_{article.source_id}"

                # Store source
                self.sources[source_id] = Source(
                    id=source_id,
                    source_type="pubmed",
                    title=article.title,
                    url=article.url,
                    snippet=article.abstract[:500] if article.abstract else "",
                    metadata={
                        "pmid": article.source_id,
                        "authors": article.authors,
                        "publication_date": article.publication_date,
                        "journal": article.journal
                    }
                )

                results.append({
                    "source_id": source_id,
                    "title": article.title,
                    "snippet": article.abstract[:500] if article.abstract else "",
                    "url": article.url
                })

        except Exception as e:
            logger.error(f"PubMed search failed for '{query}': {e}")

        return results

    async def _search_web(self, query: str) -> List[Dict[str, Any]]:
        """Search web and return formatted results."""
        results = []

        try:
            if not self.web_search_service.initialized:
                self.web_search_service.initialize()

            search_result = await self.web_search_service.search(
                search_term=query,
                num_results=self.MAX_WEB_RESULTS
            )

            for i, item in enumerate(search_result["search_results"]):
                source_id = f"web_{len(self.sources) + i + 1}"

                # Store source
                self.sources[source_id] = Source(
                    id=source_id,
                    source_type="web",
                    title=item.title,
                    url=item.url,
                    snippet=item.snippet,
                    metadata={
                        "published_date": item.published_date,
                        "source": item.source
                    }
                )

                results.append({
                    "source_id": source_id,
                    "title": item.title,
                    "snippet": item.snippet,
                    "url": item.url
                })

        except Exception as e:
            logger.error(f"Web search failed for '{query}': {e}")

        return results

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _summarize_knowledge_base(self) -> str:
        """Create a text summary of the knowledge base."""
        if not self.knowledge_base:
            return "No information found yet."

        lines = []
        for fact in self.knowledge_base:
            lines.append(f"- {fact.fact} [{fact.source_id}]")

        return "\n".join(lines)

    def _format_answer_with_sources(
        self,
        answer: str,
        sources: List[Dict[str, Any]]
    ) -> str:
        """Format the answer with a sources section."""
        # Build sources reference
        sources_section = "\n\n---\n**Sources:**\n"

        # Create a mapping from citation numbers to sources
        # The LLM uses [1], [2], etc. in the answer
        for i, source in enumerate(sources, 1):
            source_type = source.get("type", "unknown")
            title = source.get("title", "Untitled")
            url = source.get("url", "")

            if source_type == "pubmed":
                pmid = source.get("metadata", {}).get("pmid", "")
                sources_section += f"\n[{i}] {title}\n    PubMed: {url}\n"
            else:
                sources_section += f"\n[{i}] {title}\n    {url}\n"

        return answer + sources_section

    async def _update_trace_state(self, state_update: Dict[str, Any]) -> None:
        """Update the trace state."""
        if self.trace_id:
            await self.trace_service.update_progress(
                trace_id=self.trace_id,
                state=state_update,
                merge_state=True
            )
