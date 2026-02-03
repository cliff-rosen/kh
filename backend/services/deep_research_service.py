"""
Deep Research Service

Orchestrates complex research questions through iterative search and analysis.
Uses PubMed and web search in parallel, with LLM-driven query generation,
result processing, and answer synthesis.

Architecture follows the pipeline pattern:
- ResearchContext: Holds immutable config and mutable state
- execute(): Main orchestrator calling stages sequentially
- _stage_xxx(): Individual stage async generators yielding progress
- _xxx(): Helper methods doing actual work
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator, Union
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from agents.prompts.llm import call_llm
from schemas.llm import DEFAULT_MODEL_CONFIG
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

@dataclass
class Source:
    """Tracks a source used in research."""
    id: str
    source_type: str  # "pubmed" or "web"
    title: str
    url: str
    snippet: str
    metadata: Dict[str, Any] = field(default_factory=dict)

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
# Research Context
# =============================================================================

@dataclass
class ResearchContext:
    """
    Context object passed between research stages.

    Immutable fields are set during initialization.
    Mutable fields are updated as stages execute.
    """
    # === Immutable (set during init) ===
    trace_id: str
    user_id: int
    org_id: Optional[int]
    question: str
    context: Optional[str]
    max_iterations: int
    start_time: datetime

    # === Mutable (accumulated during execution) ===
    refined_question: str = ""
    scope_boundaries: List[str] = field(default_factory=list)
    key_terms: List[str] = field(default_factory=list)
    checklist: List[ChecklistItem] = field(default_factory=list)
    checklist_status: Dict[str, ChecklistStatus] = field(default_factory=dict)
    knowledge_base: List[ExtractedFact] = field(default_factory=list)
    sources: Dict[str, Source] = field(default_factory=dict)
    iterations: List[Dict[str, Any]] = field(default_factory=list)
    final_answer: Optional[SynthesizedAnswer] = None

    # === Metrics ===
    metrics: Dict[str, int] = field(default_factory=lambda: {
        "total_iterations": 0,
        "pubmed_queries": 0,
        "web_queries": 0,
        "sources_processed": 0,
        "llm_calls": 0
    })

    # === Configuration ===
    TIMEOUT_SECONDS: int = 600  # 10 minutes
    MAX_PUBMED_RESULTS: int = 10
    MAX_WEB_RESULTS: int = 10

    def is_timed_out(self) -> bool:
        """Check if research has exceeded timeout."""
        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        return elapsed > self.TIMEOUT_SECONDS

    def get_unsatisfied_items(self) -> List[ChecklistItem]:
        """Get checklist items that are not yet satisfied."""
        return [
            item for item in self.checklist
            if self.checklist_status.get(item.id, ChecklistStatus(id=item.id, status="unsatisfied", evidence_summary="")).status != "satisfied"
        ]

    def get_satisfied_count(self) -> int:
        """Count satisfied checklist items."""
        return sum(1 for s in self.checklist_status.values() if s.status == "satisfied")

    def summarize_knowledge_base(self) -> str:
        """Create a text summary of the knowledge base."""
        if not self.knowledge_base:
            return "No information found yet."
        lines = [f"- {fact.fact} [{fact.source_id}]" for fact in self.knowledge_base]
        return "\n".join(lines)

    def final_result(self) -> Dict[str, Any]:
        """Build final result dict."""
        return {
            "trace_id": self.trace_id,
            "answer": self.final_answer.answer if self.final_answer else "",
            "sources": [s.to_dict() for s in self.sources.values()],
            "checklist_coverage": {
                "satisfied": [s.id for s in self.checklist_status.values() if s.status == "satisfied"],
                "partial": [s.id for s in self.checklist_status.values() if s.status == "partial"],
                "gaps": [s.id for s in self.checklist_status.values() if s.status == "unsatisfied"]
            },
            "iterations_used": self.metrics["total_iterations"],
            "status": "completed",
            "limitations": self.final_answer.limitations if self.final_answer else []
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
    4. Answer synthesis
    """

    def __init__(self, db: AsyncSession, user_id: int, org_id: Optional[int] = None):
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.trace_service = ToolTraceService(db)
        self.web_search_service = SearchService()

    # =========================================================================
    # MAIN ORCHESTRATOR
    # =========================================================================

    async def execute(
        self,
        question: str,
        context: Optional[str] = None,
        max_iterations: int = 10
    ) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
        """
        Execute deep research on a question.

        Yields ToolProgress updates during execution, then yields final ToolResult.
        """
        try:
            # Initialize context
            yield ToolProgress(stage="init", message="Starting deep research...", progress=0.0)

            ctx = await self._init_context(question, context, max_iterations)

            yield ToolProgress(
                stage="init",
                message=f"Research initialized (trace: {ctx.trace_id[:8]}...)",
                progress=0.02
            )

            # Execute stages
            async for progress in self._stage_refine_question(ctx):
                yield progress

            async for progress in self._stage_generate_checklist(ctx):
                yield progress

            async for progress in self._stage_research_loop(ctx):
                yield progress

            async for progress in self._stage_synthesize_answer(ctx):
                yield progress

            # Complete
            await self._complete_trace(ctx)

            yield ToolProgress(stage="complete", message="Research complete!", progress=1.0)

            # Format and yield final result
            answer_text = self._format_answer_with_sources(ctx)
            yield ToolResult(
                text=answer_text,
                payload={"type": "deep_research_result", "data": ctx.final_result()}
            )

        except Exception as e:
            logger.error(f"Deep research failed: {e}", exc_info=True)
            if 'ctx' in locals():
                await self._fail_trace(ctx, str(e))
            yield ToolResult(
                text=f"Research failed: {str(e)}",
                payload={"type": "deep_research_error", "error": str(e)}
            )

    # =========================================================================
    # CONTEXT INITIALIZATION
    # =========================================================================

    async def _init_context(
        self,
        question: str,
        context: Optional[str],
        max_iterations: int
    ) -> ResearchContext:
        """Initialize research context and create trace."""
        trace_id = await self.trace_service.create_trace(
            tool_name="deep_research",
            user_id=self.user_id,
            org_id=self.org_id,
            input_params={
                "question": question,
                "context": context,
                "max_iterations": max_iterations
            }
        )
        await self.trace_service.start_trace(trace_id)

        return ResearchContext(
            trace_id=trace_id,
            user_id=self.user_id,
            org_id=self.org_id,
            question=question,
            context=context,
            max_iterations=max_iterations,
            start_time=datetime.now(timezone.utc)
        )

    # =========================================================================
    # PIPELINE STAGES
    # =========================================================================

    async def _stage_refine_question(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Refine the question to be clear and unambiguous."""
        yield ToolProgress(
            stage="refining",
            message="Refining question and generating research plan...",
            progress=0.05
        )

        refined = await self._llm_refine_question(ctx.question, ctx.context)
        ctx.metrics["llm_calls"] += 1

        if not refined:
            raise Exception("Failed to refine question")

        ctx.refined_question = refined.refined_question
        ctx.scope_boundaries = refined.scope_boundaries
        ctx.key_terms = refined.key_terms

        await self._update_trace_state(ctx, {
            "refined_question": ctx.refined_question,
            "scope_boundaries": ctx.scope_boundaries,
            "key_terms": ctx.key_terms
        })

        yield ToolProgress(
            stage="refining",
            message="Question refined",
            progress=0.1,
            data={"key_terms": ctx.key_terms[:5]}
        )

    async def _stage_generate_checklist(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Generate checklist of what a complete answer needs."""
        yield ToolProgress(
            stage="checklist",
            message="Generating research checklist...",
            progress=0.12
        )

        checklist = await self._llm_generate_checklist(ctx.refined_question)
        ctx.metrics["llm_calls"] += 1

        if not checklist:
            raise Exception("Failed to generate checklist")

        ctx.checklist = checklist.items
        for item in ctx.checklist:
            ctx.checklist_status[item.id] = ChecklistStatus(
                id=item.id,
                status="unsatisfied",
                evidence_summary=""
            )

        await self._update_trace_state(ctx, {
            "checklist": [{"id": i.id, "description": i.description} for i in ctx.checklist]
        })

        yield ToolProgress(
            stage="checklist",
            message=f"Generated checklist with {len(ctx.checklist)} items",
            progress=0.15,
            data={"checklist_items": len(ctx.checklist)}
        )

    async def _stage_research_loop(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Iterative research loop - search, process, check completeness."""
        for iteration in range(1, ctx.max_iterations + 1):
            ctx.metrics["total_iterations"] = iteration

            # Check timeout
            if ctx.is_timed_out():
                logger.warning(f"Research timeout after {iteration-1} iterations")
                yield ToolProgress(
                    stage="timeout",
                    message="Research timeout reached",
                    progress=0.85
                )
                break

            # Check if complete
            unsatisfied = ctx.get_unsatisfied_items()
            if not unsatisfied:
                logger.info("All checklist items satisfied")
                break

            # Calculate progress (0.15 to 0.85 for research loop)
            progress_base = 0.15 + (0.7 * (iteration - 1) / ctx.max_iterations)

            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Research iteration {iteration}/{ctx.max_iterations}",
                progress=progress_base,
                data={"iteration": iteration}
            )

            # Run single iteration
            async for progress in self._run_iteration(ctx, iteration, unsatisfied, progress_base):
                yield progress

            # Check completeness after iteration
            completeness = await self._llm_check_completeness(ctx)
            ctx.metrics["llm_calls"] += 1

            if completeness:
                for status in completeness.items:
                    ctx.checklist_status[status.id] = status

                satisfied = ctx.get_satisfied_count()
                total = len(ctx.checklist)

                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Checklist: {satisfied}/{total} items satisfied",
                    progress=progress_base + 0.06,
                    data={"satisfied": satisfied, "total": total}
                )

                if completeness.is_complete:
                    logger.info("Research complete per completeness check")
                    break

            # Save iteration state
            await self._update_trace_state(ctx, {
                "iterations": ctx.iterations,
                "knowledge_base": {
                    "facts": [{"fact": f.fact, "source_id": f.source_id} for f in ctx.knowledge_base],
                    "sources": [s.to_dict() for s in ctx.sources.values()]
                }
            })

    async def _run_iteration(
        self,
        ctx: ResearchContext,
        iteration: int,
        unsatisfied: List[ChecklistItem],
        progress_base: float
    ) -> AsyncGenerator[ToolProgress, None]:
        """Run a single research iteration: generate queries, search, process."""
        # Generate queries
        queries = await self._llm_generate_queries(ctx, unsatisfied)
        ctx.metrics["llm_calls"] += 1

        if not queries:
            logger.warning(f"Failed to generate queries for iteration {iteration}")
            return

        iteration_data = {
            "iteration": iteration,
            "pubmed_queries": queries.pubmed_queries,
            "web_queries": queries.web_queries
        }

        # Yield search status
        for q in queries.pubmed_queries:
            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Searching PubMed: \"{q[:50]}...\"" if len(q) > 50 else f"Searching PubMed: \"{q}\"",
                progress=progress_base + 0.02
            )

        for q in queries.web_queries:
            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Searching Web: \"{q[:50]}...\"" if len(q) > 50 else f"Searching Web: \"{q}\"",
                progress=progress_base + 0.03
            )

        # Execute searches
        search_results = await self._execute_searches(ctx, queries)
        iteration_data["results_count"] = len(search_results)

        yield ToolProgress(
            stage=f"iteration_{iteration}",
            message=f"Processing {len(search_results)} results...",
            progress=progress_base + 0.04
        )

        # Process results
        if search_results:
            processed = await self._llm_process_results(ctx, unsatisfied, search_results)
            ctx.metrics["llm_calls"] += 1

            if processed:
                ctx.knowledge_base.extend(processed.facts)

        iteration_data["checklist_progress"] = f"{ctx.get_satisfied_count()}/{len(ctx.checklist)}"
        ctx.iterations.append(iteration_data)

    async def _stage_synthesize_answer(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Synthesize final answer from accumulated knowledge."""
        yield ToolProgress(
            stage="synthesizing",
            message="Synthesizing final answer...",
            progress=0.9
        )

        answer = await self._llm_synthesize_answer(ctx)
        ctx.metrics["llm_calls"] += 1

        if not answer:
            raise Exception("Failed to synthesize answer")

        ctx.final_answer = answer

        yield ToolProgress(
            stage="synthesizing",
            message="Answer synthesized",
            progress=0.95,
            data={"sources_used": len(ctx.sources)}
        )

    # =========================================================================
    # LLM HELPERS
    # =========================================================================

    async def _llm_refine_question(
        self,
        question: str,
        context: Optional[str]
    ) -> Optional[RefinedQuestion]:
        """Refine the question to be clear and unambiguous."""
        result = await call_llm(
            system_message="""You are a research assistant helping to refine research questions.
Given a question and optional context, produce:
1. A refined, unambiguous version of the question
2. Explicit scope boundaries (what's in/out of scope)
3. Key terms and concepts to search for""",
            user_message="""Question: {question}

Context: {context}

Refine this question for research.""",
            values={
                "question": question,
                "context": context or "No additional context provided"
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=RefinedQuestion
        )

        if result.ok:
            return RefinedQuestion(**result.data)
        logger.error(f"Failed to refine question: {result.error}")
        return None

    async def _llm_generate_checklist(
        self,
        refined_question: str
    ) -> Optional[Checklist]:
        """Generate a checklist of what a complete answer needs."""
        result = await call_llm(
            system_message="""You are a research assistant. Given a research question,
generate a checklist of 3-7 specific items that a comprehensive answer must address.
Each item should be specific and verifiable.""",
            user_message="""Question: {question}

Generate a checklist of what information is needed for a complete answer.""",
            values={"question": refined_question},
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=Checklist
        )

        if result.ok:
            return Checklist(**result.data)
        logger.error(f"Failed to generate checklist: {result.error}")
        return None

    async def _llm_generate_queries(
        self,
        ctx: ResearchContext,
        unsatisfied: List[ChecklistItem]
    ) -> Optional[SearchQueries]:
        """Generate search queries based on gaps."""
        needed_items = "\n".join(f"- {item.description}" for item in unsatisfied)

        result = await call_llm(
            system_message="""You are a research assistant generating search queries.
Based on the research question and what information is still needed,
generate targeted search queries for PubMed (medical/scientific) and web search.

For PubMed queries, use proper PubMed search syntax with MeSH terms where appropriate.
For web queries, use natural language optimized for search engines.""",
            user_message="""Research question: {question}

Already known:
{knowledge_summary}

Still need to find:
{needed_items}

Generate 1-2 PubMed queries and 1-2 web search queries to fill the gaps.""",
            values={
                "question": ctx.refined_question,
                "knowledge_summary": ctx.summarize_knowledge_base(),
                "needed_items": needed_items
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=SearchQueries
        )

        if result.ok:
            return SearchQueries(**result.data)
        logger.error(f"Failed to generate queries: {result.error}")
        return None

    async def _llm_process_results(
        self,
        ctx: ResearchContext,
        unsatisfied: List[ChecklistItem],
        search_results: List[Dict[str, Any]]
    ) -> Optional[ProcessedResults]:
        """Extract relevant facts from search results."""
        needed_items = "\n".join(f"- [{item.id}] {item.description}" for item in unsatisfied)
        results_text = ""
        for r in search_results[:20]:  # Limit to avoid token overflow
            results_text += f"\n[{r['source_id']}] {r['title']}\n{r['snippet']}\n"

        result = await call_llm(
            system_message="""You are a research assistant extracting information from search results.
For each relevant finding, extract the key fact, note which checklist items it addresses,
and include the source ID for citation.""",
            user_message="""Research question: {question}

Checklist items still needed:
{needed_items}

Search results:
{results}

Extract relevant facts and note which checklist items they address.""",
            values={
                "question": ctx.refined_question,
                "needed_items": needed_items,
                "results": results_text
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=ProcessedResults
        )

        if result.ok:
            return ProcessedResults(**result.data)
        logger.error(f"Failed to process results: {result.error}")
        return None

    async def _llm_check_completeness(
        self,
        ctx: ResearchContext
    ) -> Optional[CompletenessCheck]:
        """Check if the checklist items are satisfied."""
        checklist_text = "\n".join(f"- [{item.id}] {item.description}" for item in ctx.checklist)

        result = await call_llm(
            system_message="""You are a research assistant evaluating research completeness.
Review the checklist against accumulated knowledge and determine:
- Which items are satisfied (sufficient information found)
- Which are partial (some info but gaps remain)
- Which are unsatisfied (no relevant information found)

Research is complete if all items are satisfied or have good partial coverage.""",
            user_message="""Research question: {question}

Checklist:
{checklist}

Knowledge accumulated:
{knowledge}

Evaluate completeness of each checklist item.""",
            values={
                "question": ctx.refined_question,
                "checklist": checklist_text,
                "knowledge": ctx.summarize_knowledge_base()
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=CompletenessCheck
        )

        if result.ok:
            return CompletenessCheck(**result.data)
        logger.error(f"Failed to check completeness: {result.error}")
        return None

    async def _llm_synthesize_answer(
        self,
        ctx: ResearchContext
    ) -> Optional[SynthesizedAnswer]:
        """Synthesize a comprehensive answer from accumulated knowledge."""
        checklist_text = "\n".join(f"- {item.description}" for item in ctx.checklist)

        result = await call_llm(
            system_message="""You are a research assistant synthesizing a comprehensive answer.
Based on the research question, checklist, and accumulated knowledge:
1. Address each checklist item
2. Use inline citations [1], [2], etc.
3. Note any limitations or gaps
4. Be comprehensive but concise""",
            user_message="""Research question: {question}

Checklist to address:
{checklist}

Knowledge accumulated:
{knowledge}

Synthesize a comprehensive answer with citations.""",
            values={
                "question": ctx.refined_question,
                "checklist": checklist_text,
                "knowledge": ctx.summarize_knowledge_base()
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=SynthesizedAnswer
        )

        if result.ok:
            return SynthesizedAnswer(**result.data)
        logger.error(f"Failed to synthesize answer: {result.error}")
        return None

    # =========================================================================
    # SEARCH HELPERS
    # =========================================================================

    async def _execute_searches(
        self,
        ctx: ResearchContext,
        queries: SearchQueries
    ) -> List[Dict[str, Any]]:
        """Execute PubMed and web searches in parallel."""
        tasks = []

        for query in queries.pubmed_queries:
            tasks.append(self._search_pubmed(ctx, query))
            ctx.metrics["pubmed_queries"] += 1

        for query in queries.web_queries:
            tasks.append(self._search_web(ctx, query))
            ctx.metrics["web_queries"] += 1

        results_lists = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        for result in results_lists:
            if isinstance(result, Exception):
                logger.error(f"Search failed: {result}")
                continue
            if isinstance(result, list):
                results.extend(result)

        ctx.metrics["sources_processed"] += len(results)
        return results

    async def _search_pubmed(
        self,
        ctx: ResearchContext,
        query: str
    ) -> List[Dict[str, Any]]:
        """Search PubMed and return formatted results."""
        results = []
        try:
            articles, _ = await search_pubmed(query=query, max_results=ctx.MAX_PUBMED_RESULTS)

            for article in articles:
                source_id = f"pubmed_{article.source_id}"
                ctx.sources[source_id] = Source(
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

    async def _search_web(
        self,
        ctx: ResearchContext,
        query: str
    ) -> List[Dict[str, Any]]:
        """Search web and return formatted results."""
        results = []
        try:
            if not self.web_search_service.initialized:
                self.web_search_service.initialize()

            search_result = await self.web_search_service.search(
                search_term=query,
                num_results=ctx.MAX_WEB_RESULTS
            )

            for i, item in enumerate(search_result["search_results"]):
                source_id = f"web_{len(ctx.sources) + i + 1}"
                ctx.sources[source_id] = Source(
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
    # TRACE HELPERS
    # =========================================================================

    async def _update_trace_state(self, ctx: ResearchContext, state: Dict[str, Any]) -> None:
        """Update the trace state."""
        await self.trace_service.update_progress(
            trace_id=ctx.trace_id,
            state=state,
            merge_state=True
        )

    async def _complete_trace(self, ctx: ResearchContext) -> None:
        """Mark trace as completed."""
        await self.trace_service.complete_trace(
            trace_id=ctx.trace_id,
            result=ctx.final_result(),
            metrics=ctx.metrics
        )

    async def _fail_trace(self, ctx: ResearchContext, error: str) -> None:
        """Mark trace as failed."""
        await self.trace_service.fail_trace(
            trace_id=ctx.trace_id,
            error_message=error,
            metrics=ctx.metrics
        )

    # =========================================================================
    # OUTPUT FORMATTING
    # =========================================================================

    def _format_answer_with_sources(self, ctx: ResearchContext) -> str:
        """Format the answer with a sources section."""
        if not ctx.final_answer:
            return "No answer generated."

        answer = ctx.final_answer.answer
        sources_section = "\n\n---\n**Sources:**\n"

        for i, source in enumerate(ctx.sources.values(), 1):
            if source.source_type == "pubmed":
                sources_section += f"\n[{i}] {source.title}\n    PubMed: {source.url}\n"
            else:
                sources_section += f"\n[{i}] {source.title}\n    {source.url}\n"

        return answer + sources_section
