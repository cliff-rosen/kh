from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import PydanticOutputParser
from openai import AsyncOpenAI
from schemas.chat import ChatMessage
from utils.message_formatter import format_langchain_messages, format_messages_for_openai
from utils.prompt_logger import log_prompt_messages

class BasePrompt:
    """Base class for creating and using prompts"""
    
    def __init__(
        self,
        response_model: type[BaseModel],
        system_message: Optional[str] = None,
        messages_placeholder: bool = True
    ):
        """
        Initialize a prompt.
        
        Args:
            response_model: The Pydantic model that defines the expected response structure
            system_message: The system message to use in the prompt (optional)
            messages_placeholder: Whether to include a messages placeholder in the prompt
        """
        self.response_model = response_model
        self.parser = PydanticOutputParser(pydantic_object=response_model)
        self.system_message = system_message
        self.messages_placeholder = messages_placeholder
        
        # Initialize OpenAI client
        self.client = AsyncOpenAI()
        
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
        return self.response_model.model_json_schema()
    
    def get_response_model_name(self) -> str:
        """Get the name of the response model"""
        return self.response_model.__name__
    
    async def invoke(
        self,
        messages: List[ChatMessage],
        log_prompt: bool = True,
        **kwargs: Dict[str, Any]
    ) -> BaseModel:
        """
        Invoke the prompt and get a parsed response.
        
        Args:
            messages: List of conversation messages
            log_prompt: Whether to log the prompt messages
            **kwargs: Additional variables to format into the prompt
            
        Returns:
            Parsed response as an instance of the response model
        """
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
        
        # Call OpenAI
        response = await self.client.chat.completions.create(
            model="gpt-4o",
            messages=formatted_messages,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "schema": schema,
                    "name": self.get_response_model_name()
                }
            }
        )
        
        # Parse response
        response_text = response.choices[0].message.content
        return self.parser.parse(response_text) 