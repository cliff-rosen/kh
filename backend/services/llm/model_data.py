"""
Model data for LLM providers including OpenAI and Anthropic.
This file contains comprehensive information about all available models.
"""

from typing import Dict, Any, List, Set, Union, Literal

# Parameter value types
ParameterValue = Union[float, int, str, bool]
ParameterConstraint = Dict[str, Any]

# Model families and their parameter support
MODEL_FAMILIES = {
    "reasoning": {
        "description": "Models optimized for complex reasoning and analysis",
        "supported_parameters": {"max_completion_tokens", "system"},
        "parameter_mapping": {
            "max_tokens": "max_completion_tokens"
        },
        "parameter_constraints": {
            "temperature": {"default": 1.0, "only_default": True}
        }
    },
    "flagship_chat": {
        "description": "Full-featured chat models with comprehensive parameter support",
        "supported_parameters": {"temperature", "max_tokens", "system"},
        "parameter_constraints": {
            "temperature": {"min": 0.0, "max": 2.0}
        }
    },
    "cost_optimized": {
        "description": "Models optimized for cost and speed",
        "supported_parameters": {"max_tokens", "system"},
        "parameter_constraints": {
            "temperature": {"min": 0.0, "max": 1.0}
        }
    }
}

# OpenAI Models
OPENAI_MODELS: Dict[str, Dict[str, Any]] = {
    # Reasoning Models (o-series)
    "o3": {
        "description": "Powerful reasoning model for complex tasks",
        "context_window": 8192,
        "max_output": 4096,
        "training_data": "Sep 2021",
        "features": ["function_calling"],
        "category": "best",
        "family": "reasoning",
        "aliases": ["gpt-4"],
        "supported_parameters": MODEL_FAMILIES["reasoning"]["supported_parameters"],
        "parameter_mapping": MODEL_FAMILIES["reasoning"]["parameter_mapping"],
        "parameter_constraints": MODEL_FAMILIES["reasoning"]["parameter_constraints"]
    },
    "o3-mini": {
        "description": "Small model alternative to o3",
        "context_window": 4096,
        "max_output": 4096,
        "training_data": "Sep 2021",
        "features": ["function_calling"],
        "category": "fast",
        "family": "reasoning",
        "supported_parameters": MODEL_FAMILIES["reasoning"]["supported_parameters"],
        "parameter_mapping": MODEL_FAMILIES["reasoning"]["parameter_mapping"],
        "parameter_constraints": MODEL_FAMILIES["reasoning"]["parameter_constraints"]
    },
    "o4-mini": {
        "description": "Faster, more affordable reasoning model",
        "context_window": 8192,
        "max_output": 4096,
        "training_data": "Apr 2023",
        "features": ["function_calling"],
        "category": "high_performance",
        "family": "reasoning",
        "aliases": ["gpt-4-mini"],
        "supported_parameters": MODEL_FAMILIES["reasoning"]["supported_parameters"],
        "parameter_mapping": MODEL_FAMILIES["reasoning"]["parameter_mapping"],
        "parameter_constraints": MODEL_FAMILIES["reasoning"]["parameter_constraints"]
    },
    "o1": {
        "description": "Legacy model for basic tasks",
        "context_window": 2048,
        "max_output": 2048,
        "training_data": "Jun 2020",
        "features": [],
        "category": "legacy",
        "family": "cost_optimized",
        "supported_parameters": MODEL_FAMILIES["cost_optimized"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["cost_optimized"]["parameter_constraints"]
    },
    "o1-pro": {
        "description": "Legacy professional model",
        "context_window": 4096,
        "max_output": 2048,
        "training_data": "Jun 2020",
        "features": [],
        "category": "legacy",
        "family": "cost_optimized",
        "supported_parameters": MODEL_FAMILIES["cost_optimized"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["cost_optimized"]["parameter_constraints"]
    },
    
    # Flagship Chat Models
    "gpt-4.1": {
        "description": "Flagship GPT model for complex tasks",
        "context_window": 128000,
        "max_output": 4096,
        "training_data": "Apr 2023",
        "features": ["vision", "json_mode", "function_calling"],
        "category": "best",
        "family": "flagship_chat",
        "aliases": ["gpt-4-turbo-preview"],
        "supported_parameters": MODEL_FAMILIES["flagship_chat"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["flagship_chat"]["parameter_constraints"]
    },
    "gpt-4o": {
        "description": "Fast, intelligent, flexible GPT model",
        "context_window": 128000,
        "max_output": 4096,
        "training_data": "Apr 2023",
        "features": ["vision", "json_mode", "function_calling"],
        "category": "high_performance",
        "family": "flagship_chat",
        "supported_parameters": MODEL_FAMILIES["flagship_chat"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["flagship_chat"]["parameter_constraints"]
    },
    "gpt-4.5-preview": {
        "description": "Latest preview model with enhanced capabilities",
        "context_window": 128000,
        "max_output": 4096,
        "training_data": "Apr 2024",
        "features": ["vision", "json_mode", "function_calling", "audio"],
        "category": "best",
        "family": "flagship_chat",
        "supported_parameters": MODEL_FAMILIES["flagship_chat"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["flagship_chat"]["parameter_constraints"]
    },
    "gpt-4.1-nano": {
        "description": "Compact version of GPT-4.1 for quick tasks",
        "context_window": 8192,
        "max_output": 2048,
        "training_data": "Apr 2023",
        "features": ["function_calling"],
        "category": "fast",
        "family": "cost_optimized",
        "supported_parameters": MODEL_FAMILIES["cost_optimized"]["supported_parameters"],
        "parameter_constraints": MODEL_FAMILIES["cost_optimized"]["parameter_constraints"]
    }
}

# Anthropic Models
ANTHROPIC_MODELS: Dict[str, Dict[str, Any]] = {
    # Best Models
    "claude-4-opus-20250514": {
        "description": "Best model for complex reasoning and analysis",
        "context_window": 200000,
        "max_output": 32000,
        "training_data": "Mar 2025",
        "features": ["vision", "extended_thinking", "priority_tier"],
        "category": "best",
        "aliases": ["claude-4"],
        "supported_parameters": {"max_tokens", "system"}  # Anthropic models don't support temperature
    },
    
    # High Performance Models
    "claude-4-sonnet-20250514": {
        "description": "High-performance model for general chat and analysis",
        "context_window": 200000,
        "max_output": 64000,
        "training_data": "Mar 2025",
        "features": ["vision", "extended_thinking", "priority_tier"],
        "category": "high_performance",
        "aliases": ["claude-4-sonnet"],
        "supported_parameters": {"max_tokens", "system"}
    },
    
    # Fast Models
    "claude-3-5-haiku-20241022": {
        "description": "Fastest and most cost-effective model for quick tasks",
        "context_window": 200000,
        "max_output": 8192,
        "training_data": "July 2024",
        "features": ["vision", "priority_tier"],
        "category": "fast",
        "aliases": ["claude-3.5-haiku"],
        "supported_parameters": {"max_tokens", "system"}
    }
}

# Model categories for easy filtering
MODEL_CATEGORIES = {
    "best": [
        "gpt-4.5-preview",
        "gpt-4.1",
        "o3"
    ],
    "high_performance": [
        "gpt-4o",
        "o4-mini"
    ],
    "fast": [
        "o3-mini",
        "gpt-4.1-nano"
    ],
    "legacy": [
        "o1",
        "o1-pro"
    ]
}

# Model families for parameter handling
MODEL_FAMILY_CATEGORIES = {
    "reasoning": ["o3", "o3-mini", "o4-mini"],
    "flagship_chat": ["gpt-4.1", "gpt-4o", "gpt-4.5-preview"],
    "cost_optimized": ["o1", "o1-pro", "gpt-4.1-nano"]
}

# Default models for different providers
DEFAULT_MODELS = {
    "openai": "gpt-4.1",
    "anthropic": "claude-4-opus-20250514"
}

# Fast models for quick responses
FAST_MODELS = {
    "openai": "gpt-4.1-nano",
    "anthropic": "claude-3-5-haiku-20241022"
}

# Create a mapping of aliases to canonical model names
MODEL_ALIASES: Dict[str, str] = {}
for model_name, model_data in OPENAI_MODELS.items():
    if "aliases" in model_data:
        for alias in model_data["aliases"]:
            MODEL_ALIASES[alias] = model_name

for model_name, model_data in ANTHROPIC_MODELS.items():
    if "aliases" in model_data:
        for alias in model_data["aliases"]:
            MODEL_ALIASES[alias] = model_name

__all__ = [
    'OPENAI_MODELS',
    'ANTHROPIC_MODELS',
    'DEFAULT_MODELS',
    'FAST_MODELS',
    'MODEL_CATEGORIES',
    'MODEL_FAMILY_CATEGORIES',
    'MODEL_ALIASES',
    'MODEL_FAMILIES'
] 