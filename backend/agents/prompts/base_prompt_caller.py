from typing import Dict, Any, List, Optional, Union, Type
from pydantic import BaseModel, create_model, Field
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import PydanticOutputParser
from openai import AsyncOpenAI
import httpx
from schemas.chat import ChatMessage
from utils.message_formatter import format_langchain_messages, format_messages_for_openai
from utils.prompt_logger import log_prompt_messages
from config.llm_models import get_model_capabilities, supports_reasoning_effort, supports_temperature, get_valid_reasoning_efforts
import json

# Available OpenAI models (as of January 2025)
AVAILABLE_MODELS = {
    # GPT-5 Series (Latest generation models)
    "gpt-5": "gpt-5",                          # Full GPT-5 model
    "gpt-5-mini": "gpt-5-mini",                # Cost-efficient GPT-5 variant
    "gpt-5-nano": "gpt-5-nano",                # Smallest GPT-5 variant
    
    # GPT-4.1 Series
    "gpt-4.1": "gpt-4.1",                      # Enhanced GPT-4 model
}

DEFAULT_MODEL = "gpt-5-mini"  # Default to the cost-effective GPT-5 mini model


# Shared OpenAI client with higher connection limits for parallel processing
_shared_openai_client = None

def get_shared_openai_client():
    global _shared_openai_client
    if _shared_openai_client is None:
        # Create httpx client with higher connection limits
        http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=1000,  # Total connection pool size
                max_keepalive_connections=100,  # Keep-alive connections
            ),
            timeout=httpx.Timeout(60.0)  # 60 second timeout
        )
        _shared_openai_client = AsyncOpenAI(http_client=http_client)
    return _shared_openai_client


class LLMUsage(BaseModel):
    """Token usage information from LLM calls"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    """Response from LLM containing both the result and usage information"""
    result: Any  # The parsed result
    usage: LLMUsage


class BasePromptCaller:
    """Base class for creating and using prompt callers"""
    
    def __init__(
        self,
        response_model: Union[Type[BaseModel], Dict[str, Any]],
        system_message: Optional[str] = None,
        messages_placeholder: bool = True,
        model: Optional[str] = None,
        temperature: float = 0.0,
        reasoning_effort: Optional[str] = None
    ):
        """
        Initialize a prompt caller.
        
        Args:
            response_model: Either a Pydantic model class or a JSON schema dict
            system_message: The system message to use in the prompt (optional)
            messages_placeholder: Whether to include a messages placeholder in the prompt
            model: The OpenAI model to use (optional, defaults to DEFAULT_MODEL)
            temperature: The temperature for the model (optional, defaults to 0.0)
            reasoning_effort: The reasoning effort level for models that support it (optional)
        """
        # Handle both Pydantic models and JSON schemas
        if isinstance(response_model, dict):
            # Convert JSON schema to Pydantic model
            self.response_model = self._json_schema_to_pydantic_model(response_model)
            self._is_dynamic_model = True
            self._original_schema = response_model
        else:
            # Use the Pydantic model directly
            self.response_model = response_model
            self._is_dynamic_model = False
            self._original_schema = None
            
        self.parser = PydanticOutputParser(pydantic_object=self.response_model)
        self.system_message = system_message
        self.messages_placeholder = messages_placeholder
        
        # Set and validate model
        if model:
            if model not in AVAILABLE_MODELS:
                raise ValueError(f"Model {model} not available. Choose from: {list(AVAILABLE_MODELS.keys())}")
            self.model = AVAILABLE_MODELS[model]
        else:
            self.model = DEFAULT_MODEL
            
        self.temperature = temperature
        
        # Handle reasoning effort parameter
        self.reasoning_effort = None
        if reasoning_effort:
            if supports_reasoning_effort(self.model):
                valid_efforts = get_valid_reasoning_efforts(self.model)
                if reasoning_effort in valid_efforts:
                    self.reasoning_effort = reasoning_effort
                else:
                    raise ValueError(f"Invalid reasoning effort '{reasoning_effort}' for model {self.model}. Valid options: {valid_efforts}")
            else:
                print(f"Warning: Model {self.model} does not support reasoning effort parameter. Ignoring.")
        
        # Use shared OpenAI client with higher connection limits
        self.client = get_shared_openai_client()
        
    def _json_schema_to_pydantic_model(self, schema: Dict[str, Any], model_name: str = "DynamicModel") -> Type[BaseModel]:
        """
        Convert a JSON schema to a Pydantic model class dynamically.
        
        Args:
            schema: JSON schema dictionary
            model_name: Name for the generated model class
            
        Returns:
            Dynamically created Pydantic model class
        """
        if schema.get("type") != "object":
            raise ValueError("Only object type schemas are supported")
        
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        
        # Build field definitions for create_model
        field_definitions = {}
        
        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get("type", "string")
            description = prop_schema.get("description", "")
            
            # Map JSON schema types to Python types
            if prop_type == "string":
                if "enum" in prop_schema:
                    # Create literal type for enums
                    from typing import Literal
                    enum_values = tuple(prop_schema["enum"])
                    python_type = Literal[enum_values]
                else:
                    python_type = str
            elif prop_type == "number":
                python_type = float
            elif prop_type == "integer":
                python_type = int
            elif prop_type == "boolean":
                python_type = bool
            elif prop_type == "array":
                # Simple array handling - could be enhanced
                python_type = List[Any]
            elif prop_type == "object":
                # Simple object handling - could be enhanced
                python_type = Dict[str, Any]
            else:
                python_type = str  # Default fallback
            
            # Handle required vs optional fields
            if prop_name in required:
                field_definitions[prop_name] = (python_type, Field(description=description))
            else:
                field_definitions[prop_name] = (Optional[python_type], Field(None, description=description))
        
        # Create the dynamic model with a unique name based on schema hash
        unique_name = f"{model_name}_{abs(hash(json.dumps(schema, sort_keys=True)))}"
        return create_model(unique_name, **field_definitions)
    
    def get_prompt_template(self) -> ChatPromptTemplate:
        """Get the prompt template with system message and optional messages placeholder"""
        messages = []
        if self.system_message:
            messages.append(("system", self.system_message))
        if self.messages_placeholder:
            messages.append(MessagesPlaceholder(variable_name="messages"))
        return ChatPromptTemplate.from_messages(messages)
    
    def get_formatted_messages(
        self,
        messages: List[ChatMessage],
        **kwargs: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Format messages for the prompt"""
        # Convert messages to langchain format
        langchain_messages = format_langchain_messages(messages)
        
        # Get format instructions
        format_instructions = self.parser.get_format_instructions()
        
        # Format messages using template
        prompt = self.get_prompt_template()
        formatted_messages = prompt.format_messages(
            messages=langchain_messages,
            format_instructions=format_instructions,
            **kwargs
        )
        
        # Convert to OpenAI format
        return format_messages_for_openai(formatted_messages)
    
    def get_schema(self) -> Dict[str, Any]:
        """Get the JSON schema for the response model"""
        # If we started with a JSON schema, return the original
        if self._is_dynamic_model and self._original_schema:
            return self._original_schema
        # Otherwise get schema from Pydantic model
        return self.response_model.model_json_schema()
    
    def get_response_model_name(self) -> str:
        """Get the name of the response model"""
        return self.response_model.__name__
    
    async def invoke(
        self,
        messages: List[ChatMessage] = None,
        log_prompt: bool = True,
        return_usage: bool = False,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        reasoning_effort: Optional[str] = None,
        **kwargs: Dict[str, Any]
    ) -> Union[BaseModel, LLMResponse]:
        """
        Invoke the prompt and get a parsed response.
        
        Args:
            messages: List of conversation messages (optional)
            log_prompt: Whether to log the prompt messages
            return_usage: Whether to return usage information along with result
            model: Override the model for this call (optional)
            temperature: Override the temperature for this call (optional)
            reasoning_effort: Override the reasoning effort for this call (optional)
            **kwargs: Additional variables to format into the prompt
            
        Returns:
            If return_usage=True: LLMResponse with result and usage info
            If return_usage=False: Parsed response as an instance of the response model
        """
        # Use empty list if no messages provided
        if messages is None:
            messages = []
        
        # Format messages
        formatted_messages = self.get_formatted_messages(messages, **kwargs)
        
        # Log prompt if requested
        if log_prompt:
            try:
                log_file_path = log_prompt_messages(
                    messages=formatted_messages,
                    prompt_type=self.__class__.__name__.lower()
                )
                print(f"Prompt messages logged to: {log_file_path}")
            except Exception as log_error:
                print(f"Warning: Failed to log prompt: {log_error}")
        
        # Get schema
        schema = self.get_schema()
        
        # Determine which model and temperature to use
        use_model = self.model
        if model:
            if model not in AVAILABLE_MODELS:
                raise ValueError(f"Model {model} not available. Choose from: {list(AVAILABLE_MODELS.keys())}")
            use_model = AVAILABLE_MODELS[model]
        
        use_temperature = temperature if temperature is not None else self.temperature
        
        # Determine reasoning effort to use
        use_reasoning_effort = None
        if reasoning_effort or self.reasoning_effort:
            # Check if the model supports reasoning effort
            if supports_reasoning_effort(use_model):
                valid_efforts = get_valid_reasoning_efforts(use_model)
                effort_to_use = reasoning_effort if reasoning_effort else self.reasoning_effort
                if effort_to_use in valid_efforts:
                    use_reasoning_effort = effort_to_use
                else:
                    print(f"Warning: Invalid reasoning effort '{effort_to_use}' for model {use_model}. Valid options: {valid_efforts}")
        
        # Build API call parameters
        api_params = {
            "model": use_model,
            "messages": formatted_messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "schema": schema,
                    "name": self.get_response_model_name()
                }
            }
        }
        
        # Add reasoning effort if supported and valid
        if use_reasoning_effort:
            api_params["reasoning_effort"] = use_reasoning_effort
        
        # Add temperature only if the model supports it
        if supports_temperature(use_model):
            api_params["temperature"] = use_temperature
        elif use_temperature != 0.0:
            # Only warn if user tried to set a non-zero temperature
            print(f"Note: Temperature parameter not supported for model {use_model} with reasoning_effort")
        
        # Call OpenAI
        response = await self.client.chat.completions.create(**api_params)
        
        # Parse response
        response_text = response.choices[0].message.content
        parsed_result = self.parser.parse(response_text)
        
        # Extract usage information
        usage_info = LLMUsage(
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
            total_tokens=response.usage.total_tokens if response.usage else 0
        )
        
        # Return based on return_usage flag
        if return_usage:
            return LLMResponse(result=parsed_result, usage=usage_info)
        else:
            return parsed_result 