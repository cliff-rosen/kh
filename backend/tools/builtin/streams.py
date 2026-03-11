"""
Research Stream Tools

Global tools for exploring research streams from any page.
Uses ResearchStreamService for permission-scoped access.
Includes generation tools for semantic space, retrieval queries, and categories.
"""

import logging
from typing import Any, AsyncGenerator, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolProgress, ToolResult, register_tool

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Executors (Async)
# =============================================================================

async def execute_list_research_streams(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all research streams accessible to the current user."""
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService

    try:
        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        stream_service = ResearchStreamService(db)
        results = await stream_service.get_user_research_streams(user)

        if not results:
            return "No research streams found. You don't have access to any streams yet."

        text_lines = [f"Found {len(results)} research streams:\n"]
        streams_data = []

        for i, item in enumerate(results, 1):
            stream = item.stream
            latest_date_str = item.latest_report_date.strftime('%Y-%m-%d') if item.latest_report_date else "No reports"

            text_lines.append(
                f"{i}. {stream.stream_name} ({stream.scope.value}) - "
                f"{item.report_count} reports, last: {latest_date_str}"
            )

            streams_data.append({
                "stream_id": stream.stream_id,
                "stream_name": stream.stream_name,
                "purpose": stream.purpose,
                "scope": stream.scope.value if stream.scope else None,
                "is_active": stream.is_active,
                "report_count": item.report_count,
                "latest_report_date": item.latest_report_date.isoformat() if item.latest_report_date else None,
                "has_schedule": bool(stream.schedule_config and stream.schedule_config.get("enabled")),
            })

        text_lines.append("\nA panel is displayed with the full stream listing.")

        payload = {
            "type": "stream_list",
            "data": {
                "total_streams": len(results),
                "streams": streams_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error listing research streams: {e}", exc_info=True)
        return f"Error listing research streams: {str(e)}"


async def execute_get_stream_details(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get detailed information about a specific research stream."""
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService

    stream_id = params.get("stream_id")
    if not stream_id:
        return "Error: stream_id is required."

    try:
        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        stream_service = ResearchStreamService(db)
        stream = await stream_service.get_research_stream(user, int(stream_id))

        if not stream:
            return f"Error: Stream {stream_id} not found or you don't have access."

        # Build schedule summary
        schedule_summary = "No schedule configured"
        if stream.schedule_config:
            sc = stream.schedule_config
            if sc.get("enabled"):
                freq = sc.get("frequency", "unknown")
                time = sc.get("preferred_time", "")
                tz = sc.get("timezone", "")
                schedule_summary = f"{freq}, {time} {tz}"
            else:
                schedule_summary = "Schedule disabled"

        # Last execution status
        last_exec_status = "No executions"
        last_exec_date = None
        if stream.last_execution:
            last_exec_status = stream.last_execution.status.value if stream.last_execution.status else "unknown"
            last_exec_date = stream.last_execution.completed_at or stream.last_execution.started_at

        # Semantic space summary (topics/entities if present)
        semantic_summary = ""
        if stream.semantic_space:
            topics = stream.semantic_space.get("topics", [])
            entities = stream.semantic_space.get("entities", [])
            if topics:
                topic_names = [t.get("name", t) if isinstance(t, dict) else str(t) for t in topics[:5]]
                semantic_summary += f"Topics: {', '.join(topic_names)}"
            if entities:
                entity_names = [e.get("name", e) if isinstance(e, dict) else str(e) for e in entities[:5]]
                if semantic_summary:
                    semantic_summary += "; "
                semantic_summary += f"Entities: {', '.join(entity_names)}"

        text_lines = [
            f"Stream: {stream.stream_name}",
            f"Purpose: {stream.purpose}",
            f"Scope: {stream.scope.value if stream.scope else 'unknown'}",
            f"Schedule: {schedule_summary}",
            f"Last execution: {last_exec_status}",
        ]
        if semantic_summary:
            text_lines.append(f"Semantic space: {semantic_summary}")
        text_lines.append("\nFull details are displayed in the panel.")

        data = {
            "stream_id": stream.stream_id,
            "stream_name": stream.stream_name,
            "purpose": stream.purpose,
            "scope": stream.scope.value if stream.scope else None,
            "is_active": stream.is_active,
            "schedule_config": stream.schedule_config,
            "schedule_summary": schedule_summary,
            "last_execution_status": last_exec_status,
            "last_execution_date": last_exec_date.isoformat() if last_exec_date else None,
            "semantic_space": stream.semantic_space,
            "retrieval_config": stream.retrieval_config,
            "presentation_config": stream.presentation_config,
            "enrichment_config": stream.enrichment_config,
            "created_at": stream.created_at.isoformat() if stream.created_at else None,
            "updated_at": stream.updated_at.isoformat() if stream.updated_at else None,
        }

        payload = {
            "type": "stream_details",
            "data": data
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting stream details: {e}", exc_info=True)
        return f"Error getting stream details: {str(e)}"


# =============================================================================
# Generation Tool Executors
# =============================================================================

async def execute_generate_semantic_space(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """Generate a complete semantic space from a natural language description."""
    from services.semantic_space_generator_service import SemanticSpaceGeneratorService

    description = params.get("description", "")
    if not description:
        yield ToolResult(text="Error: description is required.")
        return

    try:
        yield ToolProgress(
            stage="generating",
            message="Analyzing your description and generating semantic space...",
            progress=0.2
        )

        service = SemanticSpaceGeneratorService(db, user_id)
        semantic_space = await service.generate_semantic_space(description)

        yield ToolProgress(
            stage="validating",
            message="Validating generated semantic space...",
            progress=0.8
        )

        ss_data = semantic_space.model_dump(mode="json")

        yield ToolResult(
            text=f"Generated semantic space for domain '{semantic_space.domain.name}' with {len(semantic_space.topics)} topics and {len(semantic_space.entities)} entities. Review the proposal in the panel.",
            payload={
                "type": "semantic_space_proposal",
                "data": {
                    "semantic_space": ss_data,
                    "reasoning": f"Generated from description: {description[:200]}"
                }
            }
        )

    except Exception as e:
        logger.error(f"Semantic space generation failed: {e}", exc_info=True)
        yield ToolResult(text=f"Error generating semantic space: {str(e)}")


async def execute_generate_retrieval_queries(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """Generate retrieval queries from a semantic space."""
    from services.broad_search_service import BroadSearchService
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService
    from schemas.semantic_space import SemanticSpace

    stream_id = params.get("stream_id")
    semantic_space_data = params.get("semantic_space")

    if not stream_id and not semantic_space_data:
        yield ToolResult(text="Error: Either stream_id or semantic_space is required.")
        return

    try:
        yield ToolProgress(
            stage="preparing",
            message="Loading semantic space...",
            progress=0.1
        )

        # Get semantic space from stream or inline data
        if stream_id:
            user_service = UserService(db)
            user = await user_service.get_user_by_id(user_id)
            if not user:
                yield ToolResult(text="Error: User not found.")
                return

            stream_service = ResearchStreamService(db)
            stream = await stream_service.get_research_stream(user, int(stream_id))
            if not stream:
                yield ToolResult(text=f"Error: Stream {stream_id} not found or you don't have access.")
                return
            if not stream.semantic_space:
                yield ToolResult(text="Error: Stream has no semantic space defined.")
                return
            semantic_space = SemanticSpace(**stream.semantic_space)
        else:
            semantic_space = SemanticSpace(**semantic_space_data)

        yield ToolProgress(
            stage="generating",
            message="Generating broad search queries...",
            progress=0.3
        )

        service = BroadSearchService(db, user_id)
        result = await service.propose_broad_search(semantic_space)

        yield ToolProgress(
            stage="formatting",
            message="Formatting retrieval proposal...",
            progress=0.8
        )

        # Serialize queries
        queries_data = []
        for q in result.queries:
            q_dict = q.model_dump(mode="json") if hasattr(q, 'model_dump') else q.dict()
            queries_data.append(q_dict)

        coverage_data = {
            "total_topics": result.coverage_analysis.total_topics,
            "covered_topics": result.coverage_analysis.covered_topics,
            "uncovered_topics": result.coverage_analysis.uncovered_topics,
            "expected_false_positive_rate": result.coverage_analysis.expected_false_positive_rate
        }

        yield ToolResult(
            text=f"Generated {len(queries_data)} search queries covering {len(result.coverage_analysis.covered_topics)} topics. Review the proposal in the panel.",
            payload={
                "type": "retrieval_config_proposal",
                "data": {
                    "queries": queries_data,
                    "strategy_rationale": result.strategy_rationale,
                    "coverage_analysis": coverage_data
                }
            }
        )

    except Exception as e:
        logger.error(f"Retrieval query generation failed: {e}", exc_info=True)
        yield ToolResult(text=f"Error generating retrieval queries: {str(e)}")


async def execute_generate_categories(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Generate presentation categories from topics (deterministic, no LLM)."""
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService

    stream_id = params.get("stream_id")
    topics_data = params.get("topics")

    if not stream_id and not topics_data:
        return "Error: Either stream_id or topics is required."

    try:
        topics = []

        if stream_id:
            user_service = UserService(db)
            user = await user_service.get_user_by_id(user_id)
            if not user:
                return "Error: User not found."

            stream_service = ResearchStreamService(db)
            stream = await stream_service.get_research_stream(user, int(stream_id))
            if not stream:
                return f"Error: Stream {stream_id} not found or you don't have access."
            if not stream.semantic_space:
                return "Error: Stream has no semantic space defined."
            topics = stream.semantic_space.get("topics", [])
        else:
            topics = topics_data

        if not topics:
            return "Error: No topics found to generate categories from."

        # Deterministic: 1:1 topic-to-category mapping + "Other" catch-all
        categories = []
        for topic in topics:
            topic_id = topic.get("topic_id", "")
            topic_name = topic.get("name", "")
            topic_desc = topic.get("description", "")

            categories.append({
                "id": topic_id,
                "name": topic_name,
                "description": topic_desc,
                "topics": [topic_id],
                "specific_inclusions": []
            })

        # Add "Other" catch-all
        categories.append({
            "id": "other",
            "name": "Other",
            "description": "Articles that don't fit neatly into the defined topic categories",
            "topics": [],
            "specific_inclusions": []
        })

        return ToolResult(
            text=f"Generated {len(categories)} categories ({len(categories) - 1} from topics + 'Other' catch-all). Review the proposal in the panel.",
            payload={
                "type": "presentation_config_proposal",
                "data": {
                    "categories": categories
                }
            }
        )

    except Exception as e:
        logger.error(f"Category generation failed: {e}", exc_info=True)
        return f"Error generating categories: {str(e)}"


# =============================================================================
# Tool Registration
# =============================================================================

register_tool(ToolConfig(
    name="list_research_streams",
    description="List all research streams accessible to you, including their scope, report count, and last report date. Use this to discover available streams.",
    input_schema={
        "type": "object",
        "properties": {},
    },
    executor=execute_list_research_streams,
    category="streams",
    is_global=True,
))

register_tool(ToolConfig(
    name="get_stream_details",
    description="Get detailed information about a specific research stream, including its configuration, schedule, last execution status, and semantic space.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "The ID of the research stream to get details for."
            }
        },
        "required": ["stream_id"]
    },
    executor=execute_get_stream_details,
    category="streams",
    is_global=True,
))

register_tool(ToolConfig(
    name="generate_semantic_space",
    description="Generate a complete semantic space (domain, topics, entities, context, coverage, boundaries) from a natural language description of a research area. Use this when the user describes what they want to monitor and needs a full semantic space created.",
    input_schema={
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "Natural language description of the research domain to monitor (e.g., 'I want to track CRISPR gene editing research for sickle cell disease treatment')"
            }
        },
        "required": ["description"]
    },
    executor=execute_generate_semantic_space,
    streaming=True,
    category="streams",
    is_global=True,
))

register_tool(ToolConfig(
    name="generate_retrieval_queries",
    description="Generate broad search queries (retrieval config) from a semantic space. Provide either a stream_id to use that stream's semantic space, or pass a semantic_space object directly.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "ID of an existing research stream to generate queries for"
            },
            "semantic_space": {
                "type": "object",
                "description": "A semantic space object to generate queries from (alternative to stream_id)"
            }
        }
    },
    executor=execute_generate_retrieval_queries,
    streaming=True,
    category="streams",
    is_global=True,
))

register_tool(ToolConfig(
    name="generate_categories",
    description="Generate presentation categories from topics. Creates a 1:1 mapping of topics to categories plus an 'Other' catch-all. Provide either a stream_id or a topics array.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "ID of an existing research stream to generate categories for"
            },
            "topics": {
                "type": "array",
                "description": "Array of topic objects with topic_id, name, and description",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic_id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"}
                    }
                }
            }
        }
    },
    executor=execute_generate_categories,
    category="streams",
    is_global=True,
))
