from openai import AsyncOpenAI
import logging
from typing import List, Dict, Optional, AsyncGenerator, Any, Set
from config.settings import settings
from .base import LLMProvider
from .model_data import OPENAI_MODELS, MODEL_ALIASES

logger = logging.getLogger(__name__)

class OpenAIProvider(LLMProvider):
    # Required parameters that should never be filtered out
    REQUIRED_PARAMETERS: Set[str] = {"model", "messages"}
    
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        
    def get_default_model(self) -> str:
        return "gpt-4-turbo-preview"

    def _get_model_info(self, model: str) -> Dict[str, Any]:
        """Get model information including supported parameters"""
        # Check if it's an alias
        if model in MODEL_ALIASES:
            model = MODEL_ALIASES[model]
        
        if model not in OPENAI_MODELS:
            raise ValueError(f"Unknown model: {model}")
            
        return OPENAI_MODELS[model]

    def _filter_parameters(self, model: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Filter parameters based on model support while preserving required parameters"""
        model_info = self._get_model_info(model)
        supported_params = model_info.get("supported_parameters", set())
        parameter_mapping = model_info.get("parameter_mapping", {})
        parameter_constraints = model_info.get("parameter_constraints", {})
        
        # Always include required parameters
        filtered_params = {k: v for k, v in params.items() if k in self.REQUIRED_PARAMETERS}
        
        # Add supported optional parameters, applying any necessary parameter mapping and constraints
        for k, v in params.items():
            if k not in self.REQUIRED_PARAMETERS:
                # Check if parameter needs to be mapped
                mapped_key = parameter_mapping.get(k, k)
                if mapped_key in supported_params:
                    # Check parameter constraints
                    constraints = parameter_constraints.get(mapped_key, {})
                    
                    # Handle only_default constraint
                    if constraints.get("only_default", False):
                        default_value = constraints.get("default")
                        if v != default_value:
                            logger.warning(f"Parameter {mapped_key} only supports default value {default_value} for model {model}, using default instead of {v}")
                            v = default_value
                    
                    # Handle min/max constraints - only if value is not None
                    if v is not None:
                        if "min" in constraints and v < constraints["min"]:
                            logger.warning(f"Parameter {mapped_key} value {v} is below minimum {constraints['min']} for model {model}, using minimum value")
                            v = constraints["min"]
                        if "max" in constraints and v > constraints["max"]:
                            logger.warning(f"Parameter {mapped_key} value {v} is above maximum {constraints['max']} for model {model}, using maximum value")
                            v = constraints["max"]
                    
                    filtered_params[mapped_key] = v
        
        # Log any removed optional parameters
        removed_params = set(params.keys()) - supported_params - self.REQUIRED_PARAMETERS - set(parameter_mapping.keys())
        if removed_params:
            logger.warning(f"Removed unsupported optional parameters for model {model}: {removed_params}")
            
        return filtered_params

    async def generate(self, 
        prompt: str, 
        model: Optional[str] = None,
        max_tokens: Optional[int] = None
    ) -> str:
        try:
            model = model or self.get_default_model()
            params = {
                "model": model,
                "prompt": prompt,
                "max_tokens": max_tokens
            }
            
            # Filter parameters based on model support
            filtered_params = self._filter_parameters(model, params)
            
            response = await self.client.completions.create(**filtered_params)
            return response.choices[0].text.strip()
        except Exception as e:
            logger.error(f"Error generating OpenAI response with model {model}: {str(e)}")
            raise

    async def generate_stream(self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None
    ) -> AsyncGenerator[str, None]:
        try:
            model = model or self.get_default_model()
            params = {
                "model": model,
                "prompt": prompt,
                "max_tokens": max_tokens,
                "stream": True
            }
            
            # Filter parameters based on model support
            filtered_params = self._filter_parameters(model, params)
            
            stream = await self.client.completions.create(**filtered_params)
            async for chunk in stream:
                if chunk.choices[0].text:
                    yield chunk.choices[0].text
        except Exception as e:
            logger.error(f"Error generating streaming OpenAI response with model {model}: {str(e)}")
            raise

    async def create_chat_completion(self, 
        messages: List[Dict[str, str]], 
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        **kwargs
    ) -> str:
        try:
            model = model or self.get_default_model()
            
            # Add system message if provided
            chat_messages = []
            if system:
                chat_messages.append({"role": "system", "content": system})
            chat_messages.extend(messages)
            
            # Prepare parameters
            params = {
                "model": model,
                "messages": chat_messages,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
            
            # Filter parameters based on model support
            filtered_params = self._filter_parameters(model, params)
            
            response = await self.client.chat.completions.create(**filtered_params)
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error creating OpenAI chat completion with model {model}: {str(e)}")
            raise

    async def create_chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        **kwargs
    ) -> AsyncGenerator[str, None]:
        try:
            model = model or self.get_default_model()
            
            # Add system message if provided
            chat_messages = []
            if system:
                chat_messages.append({"role": "system", "content": system})
            chat_messages.extend(messages)
            
            # Prepare parameters
            params = {
                "model": model,
                "messages": chat_messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": True
            }
            
            # Filter parameters based on model support
            filtered_params = self._filter_parameters(model, params)
            
            stream = await self.client.chat.completions.create(**filtered_params)
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"Error creating streaming OpenAI chat completion with model {model}: {str(e)}")
            raise

    async def close(self):
        await self.client.close() 