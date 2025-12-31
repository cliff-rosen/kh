from typing import Dict, Any, AsyncIterator, List, Optional, Union
import json
import copy  # Needed for deep-copying assets when populating hop state
from datetime import datetime
import uuid
import logging
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from dataclasses import dataclass
import os

from langgraph.graph import StateGraph, START, END
from langgraph.types import StreamWriter, Send, Command

# Create logger for this module
logger = logging.getLogger(__name__)

from config.settings import settings

from utils.state_serializer import (
    create_agent_response,
    serialize_state_with_datetime
)

from schemas.llm import ChatMessage, MessageRole, AssetReference
from schemas.agent_responses import AgentResponse, StatusResponse

from services.user_session_service import UserSessionService


# Use settings from config
OPENAI_API_KEY = settings.OPENAI_API_KEY
VECTOR_STORE_ID = os.getenv("VECTOR_STORE_ID", "vs_68347e57e7408191a5a775f40db83f44")  # Default to existing store

# Initialize OpenAI client
client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# Module-level service instances
_session_service: Optional[UserSessionService] = None
_user_id: Optional[int] = None


class State(BaseModel):
    """State for the RAVE workflow"""
    messages: List[ChatMessage]
    mission_id: Optional[str] = None  # Add mission_id for persistence
    tool_params: Dict[str, Any] = {}
    next_node: str
    asset_summaries: Dict[str, AssetReference] = {}  # Add asset summaries directly to state
  
    class Config:
        arbitrary_types_allowed = True

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _initialize_services(config: Dict[str, Any]) -> None:
    """Initialize module-level services from config"""
    global _mission_service, _session_service, _state_transition_service, _user_id
    configurable = config.get('configurable', {})
    _session_service = configurable.get('session_service')
    _user_id = configurable.get('user_id')



# ---------------------------------------------------------------------------
# Node Functions
# ---------------------------------------------------------------------------

async def supervisor_node(state: State, writer: StreamWriter, config: Dict[str, Any]) -> Command:
    """Supervisor node that routes to appropriate specialist based on mission and hop status"""
    request_id = config.get("configurable", {}).get("request_id", "unknown")
    
    logger.info(
        "Supervisor node started - analyzing routing decision",
        extra={
            "request_id": request_id,
            "mission_status": state.mission.status.value if state.mission else "no_mission",
            "current_hop_status": state.mission.current_hop.status.value if state.mission and state.mission.current_hop else "no_hop",
            "mission_id": state.mission.id if state.mission else None
        }
    )
    
    # Initialize services from config (supervisor is always called first)
    logger.debug(
        "Initializing services from config",
        extra={"request_id": request_id, "config_keys": list(config.keys())}
    )
    _initialize_services(config)
    logger.debug(
        "Services initialization complete",
        extra={
            "request_id": request_id,
            "mission_service_ready": _mission_service is not None,
            "state_transition_service_ready": _state_transition_service is not None,
            "user_id": _user_id
        }
    )
    
    if writer:
        status_response = StatusResponse(
            status="supervisor_routing",
            payload=serialize_state_with_datetime(state),
            error=None,
            debug="Supervisor analyzing mission and hop status to determine routing"
        )
        writer(status_response.model_dump())

    try:
        # Determine next node based on valid mission-hop status combinations
        next_node = None
        routing_message = ""

        if not state.mission:
            # No mission - route to mission specialist
            next_node = "mission_specialist_node"
            routing_message = "No mission found - routing to mission specialist to create one"
            logger.info(
                "Routing decision: No mission found",
                extra={"request_id": request_id, "next_node": next_node}
            )
        
        else:
            # Unknown mission status
            routing_message = f"Unknown mission status: {state.mission.status}"
            next_node = "mission_specialist_node"


        # Create routing message
        response_message = ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="temp",  # This will be updated when chat sessions are integrated
            role=MessageRole.ASSISTANT,
            content=routing_message,
            message_metadata={},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        state_update = {
            "messages": [*state.messages, response_message.model_dump()],
            "next_node": next_node,
            "tool_params": state.tool_params,
        }

        # Stream response and return command
        if writer:
            agent_response = AgentResponse(
                token=routing_message,
                response_text=routing_message,
                status="supervisor_routing_completed",
                error=None,
                debug=f"Mission: {state.mission.status if state.mission else 'No mission'}, Hop: {state.mission.current_hop.status if state.mission and state.mission.current_hop else 'No current hop'}, Routing to: {next_node}",
                payload=serialize_state_with_datetime(State(**state_update))
            )
            writer(agent_response.model_dump())

        return Command(goto=next_node, update=state_update)

    except Exception as e:
        if writer:
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=serialize_state_with_datetime(state),
                status="supervisor_error",
                error=str(e),
                debug=f"Error in supervisor_node: {type(e).__name__}"
            )
            writer(error_response.model_dump())
        raise

async def mission_specialist_node(state: State, writer: StreamWriter, config: Dict[str, Any]) -> Command:
    """Node that handles mission specialist operations"""
    request_id = config.get("configurable", {}).get("request_id", "unknown")
    
    logger.info(
        "Mission specialist node started",
        extra={
            "request_id": request_id,
            "has_mission": bool(state.mission),
            "mission_status": state.mission.status.value if state.mission else None,
            "mission_id": state.mission.id if state.mission else None
        }
    )
    
    # Initialize services from config
    _initialize_services(config)

    if writer:
        status_response = StatusResponse(
            status="mission_specialist_starting",
            payload=serialize_state_with_datetime(state),
            error=None,
            debug="Mission specialist node starting analysis"
        )
        writer(status_response.model_dump())
    
    try:
        # Create and use the simplified prompt caller
        logger.debug(
            "Invoking mission definition prompt caller",
            extra={"request_id": request_id, "has_mission": bool(state.mission)}
        )
        promptCaller = MissionDefinitionPromptCaller()
        
        parsed_response = await promptCaller.invoke(
            mission=state.mission,
            messages=state.messages
        )

        logger.debug(
            "Mission prompt response received",
            extra={
                "request_id": request_id,
                "has_mission_proposal": bool(parsed_response.mission_proposal),
                "response_length": len(parsed_response.response_content) if parsed_response.response_content else 0
            }
        )

        # Create response message
        response_message = ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="temp",  # This will be updated when chat sessions are integrated
            role=MessageRole.ASSISTANT,
            content=parsed_response.response_content,
            message_metadata={},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # Route back to supervisor
        next_node = END

        # Handle mission proposal creation
        if parsed_response.mission_proposal:
            try:
                mission_name = getattr(parsed_response.mission_proposal, 'name', None)
                logger.info(
                    "Processing mission proposal creation",
                    extra={
                        "request_id": request_id,
                        "mission_name": mission_name
                    }
                )
            except Exception as e:
                logger.warning(
                    "Could not extract mission name for logging",
                    extra={"request_id": request_id, "error": str(e)}
                )
            await _handle_mission_proposal_creation(parsed_response, state, response_message)

        state_update = {
            "messages": [*state.messages, response_message.model_dump()],
            "mission": state.mission,  # Use updated mission state
            "mission_id": state.mission_id,
            "tool_params": {},
            "next_node": next_node,
            "asset_summaries": state.asset_summaries
        }

        if writer:
            # Send simplified response without proposal payload
            agent_response = AgentResponse(**create_agent_response(
                token=response_message.content[0:100],
                response_text=response_message.content,
                status="mission_specialist_completed",
                payload={},  # No proposal payload - mission is now directly in state
                debug=f"Mission proposal created: {state.mission.name if state.mission else 'No mission'}, status: {state.mission.status if state.mission else 'No status'}"
            ))
            writer(agent_response.model_dump())

        return Command(goto=next_node, update=state_update)

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(
            "Error in mission specialist node",
            extra={"request_id": request_id, "error": str(e)},
            exc_info=True
        )
        if writer:
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=serialize_state_with_datetime(state),
                status="mission_specialist_error",
                error=str(e),
                debug=error_traceback
            )
            writer(error_response.model_dump())
        raise

async def hop_designer_node(state: State, writer: StreamWriter, config: Dict[str, Any]) -> Command:
    """Hop designer node that designs the next hop in the mission"""
    request_id = config.get("configurable", {}).get("request_id", "unknown")
    
    logger.info(
        "Hop designer node started",
        extra={
            "request_id": request_id,
            "hop_status": state.mission.current_hop.status.value if state.mission.current_hop else "no_hop"
        }
    )

    # Initialize services from config
    _initialize_services(config)

    if writer:
        status_response = StatusResponse(
            status="hop_designer_started",
            payload=serialize_state_with_datetime(state),
            error=None,
            debug="Hop designer node started - analyzing mission requirements"
        )
        writer(status_response.model_dump())

    try:
        # Create and use the simplified prompt caller
        promptCaller = HopDesignerPromptCaller()
        
        parsed_response = await promptCaller.invoke(
            mission=state.mission,
            messages=state.messages
        )

        # Create response message
        response_message = ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="temp",  # This will be updated when chat sessions are integrated
            role=MessageRole.ASSISTANT,
            content=parsed_response.response_content,
            message_metadata={},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # Route back to supervisor
        next_node = END

        # Handle different response types
        if parsed_response.response_type == "HOP_PROPOSAL":
            await _handle_hop_proposal_creation(parsed_response, state, response_message)

        elif parsed_response.response_type == "CLARIFICATION_NEEDED":
            # For clarification needed, we don't create a new hop
            # Just update the response message with the reasoning
            response_message.content = f"{parsed_response.response_content}\n\nReasoning: {parsed_response.reasoning}"

        else:
            raise ValueError(f"Invalid response type: {parsed_response.response_type}")

        state_update = {
            "messages": [*state.messages, response_message.model_dump()],
            "mission": state.mission,
            "mission_id": state.mission_id,
            "tool_params": {},
            "next_node": next_node,
            "asset_summaries": state.asset_summaries
        }

        if writer:
            # Send simplified response without proposal payload
            agent_response = AgentResponse(**create_agent_response(
                token=response_message.content[0:100],
                response_text=response_message.content,
                status="hop_designer_completed",
                debug=f"Response type: {parsed_response.response_type}, Hop status: {state.mission.current_hop.status if state.mission.current_hop else 'No hop'}, {state.mission.current_hop.name if state.mission.current_hop else 'No hop name'}",
                payload={}  # No proposal payload - hop is now directly in mission state
            ))
            writer(agent_response.model_dump())

        return Command(goto=next_node, update=state_update)

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(
            "Error in hop designer node",
            extra={"request_id": request_id, "error": str(e)},
            exc_info=True
        )
        if writer:
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=serialize_state_with_datetime(state),
                status="hop_designer_error",
                error=str(e),
                debug=error_traceback
            )
            writer(error_response.model_dump())
        raise

async def hop_implementer_node(state: State, writer: StreamWriter, config: Dict[str, Any]) -> Command:
    """Node that handles hop implementer operations"""
    request_id = config.get("configurable", {}).get("request_id", "unknown")
    
    logger.info(
        "Hop implementer node started",
        extra={"request_id": request_id}
    )

    # Initialize services from config
    _initialize_services(config)

    if writer:
        status_response = StatusResponse(
            status="hop_implementer_starting",
            payload=serialize_state_with_datetime(state),
            error=None,
            debug="Hop implementer node starting - analyzing hop implementation"
        )
        writer(status_response.model_dump())
    
    try:
        # Validate current hop exists
        current_hop = state.mission.current_hop if state.mission else None
        if not current_hop or not current_hop.assets:
            raise ValueError(f"Hop is missing or has empty assets list.")

        # Step 1: Generate proposal from LLM
        promptCaller = HopImplementerPromptCaller()
        parsed_response: HopImplementationResponse = await promptCaller.invoke(
            mission=state.mission
        )

        # Create response message
        response_message = ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="temp",
            role=MessageRole.ASSISTANT,
            content=parsed_response.response_content,
            message_metadata={},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # Handle different response types
        logger.debug(
            "Hop implementer response received",
            extra={"request_id": request_id, "response_type": parsed_response.response_type}
        )
        if parsed_response.response_type == "IMPLEMENTATION_PLAN":
            await _handle_implementation_plan_proposal(parsed_response, state, response_message)
        else:
            response_message.content = parsed_response.response_content
        
        # Route back to supervisor
        next_node = END
        
        state_update = {
            "messages": [*state.messages, response_message.model_dump()],
            "mission": state.mission,
            "mission_id": state.mission_id,
            "tool_params": {},
            "next_node": next_node,
            "asset_summaries": state.asset_summaries
        }

        if writer:
            agent_response = AgentResponse(**create_agent_response(
                token=response_message.content[0:100],
                response_text=response_message.content,
                status="hop_implementer_completed",
                payload={},
                debug=f"Response type: {parsed_response.response_type}"
            ))
            writer(agent_response.model_dump())

        return Command(goto=next_node, update=state_update)

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.error(
            "Error in hop implementer node",
            extra={"request_id": request_id, "error": str(e)},
            exc_info=True
        )
        if writer:
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=serialize_state_with_datetime(state),
                status="hop_implementer_error",
                error=str(e),
                debug=error_traceback
            )
            writer(error_response.model_dump())
        raise

async def asset_search_node(state: State, writer: StreamWriter, config: Dict[str, Any]) -> Command:
    """Node that handles asset search operations"""
    request_id = config.get("configurable", {}).get("request_id", "unknown")
    
    logger.info(
        "Asset search node started",
        extra={"request_id": request_id}
    )

    if writer:
        status_response = StatusResponse(
            status="asset_search_starting",
            payload=serialize_state_with_datetime(state),
            error=None,
            debug="Asset search node starting - preparing to search for assets"
        )
        writer(status_response.model_dump())
    
    try:

        # Get search parameters from state
        search_params = state.tool_params
        print("Search params:", search_params)  # Debug log
        if not search_params or not search_params.get("query"):
            raise ValueError("No search query provided")

        # Use OpenAI responses API for file search
        response = await client.responses.create(
            model="gpt-4o",
            input="See what you can find about " + search_params["query"],
            tools=[{
                "type": "file_search",
                "vector_store_ids": [VECTOR_STORE_ID]
            }],
            include=["file_search_call.results"]
        )
                   
        # Extract search results from the response
        search_results = response.output[0].results

        search_results_string = "Here are the search results for: " + search_params["query"] + "\n\n"
        for result in search_results:
            search_results_string += result.text + "\n\n"

        # Create a response message with the search results
        current_time = datetime.now().isoformat()
        response_message = ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="temp",  # This will be updated when chat sessions are integrated
            role=MessageRole.ASSISTANT,
            content=search_results_string,
            message_metadata={"asset_search": True},
            created_at=current_time,
            updated_at=current_time
        )

        # Route back to supervisor with the results
        next_node = "supervisor_node"
        state_update = {
            "messages": [*state.messages, response_message.model_dump()],
            "mission": state.mission,
            "mission_id": state.mission_id,
            "next_node": next_node,
            "tool_params": state.tool_params,
            "asset_summaries": state.asset_summaries
        }

        if writer:
            agent_response = AgentResponse(
                token=response_message.content[0:100],
                response_text=response_message.content,
                status="asset_search_completed",
                error=None,
                debug=f"Found {len(search_results)} search results for query: {search_params['query']}",
                payload=serialize_state_with_datetime(State(**state_update))
            )
            writer(agent_response.model_dump())

        return Command(goto=next_node, update=state_update)

    except Exception as e:
        print("Error in asset search node:", e)
        if writer:
            error_response = AgentResponse(
                token=None,
                response_text=None,
                payload=serialize_state_with_datetime(state),
                status="asset_search_error",
                error=str(e),
                debug=f"Error in asset_search_node: {type(e).__name__}"
            )
            writer(error_response.model_dump())
        raise

### Graph

# Define the graph
graph_builder = StateGraph(State)

# Add nodes
graph_builder.add_node("supervisor_node", supervisor_node)
graph_builder.add_node("mission_specialist_node", mission_specialist_node)
graph_builder.add_node("hop_designer_node", hop_designer_node)
graph_builder.add_node("hop_implementer_node", hop_implementer_node)
graph_builder.add_node("asset_search_node", asset_search_node)

# Add edges - define all possible paths
graph_builder.add_edge(START, "supervisor_node")

# Supervisor can route to different nodes based on state
# The supervisor node will use the Command object to determine next node

# Compile the graph with streaming support
compiled = graph_builder.compile()
graph = compiled 


# ---------------------------------------------------------------------------
# Hop Implementation Helpers
# ---------------------------------------------------------------------------


class PrimaryAgent:
    def __init__(self, mission: "Mission" = None):
        self.mission = mission if mission else Mission(
            id="default-mission-1", 
            name="Default Mission", 
            description="Default mission description",
            current_hop=None,
            hop_history=[],
            inputs=[],
            outputs=[],
            mission_state={},
            mission_status=MissionStatus.AWAITING_APPROVAL
        )

    async def run(self):
        # Your agent's execution logic here
        pass

