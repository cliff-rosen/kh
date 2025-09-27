export interface ModelFeatures {
    vision?: boolean;
    json_mode?: boolean;
    function_calling?: boolean;
    audio?: boolean;
    extended_thinking?: boolean;
    priority_tier?: boolean;
}

export interface ParameterConstraints {
    min?: number;
    max?: number;
    default?: number;
    only_default?: boolean;
}

export interface ModelFamily {
    description: string;
    supported_parameters: string[];
    parameter_mapping?: Record<string, string>;
    parameter_constraints: Record<string, ParameterConstraints>;
}

export interface ModelConfig {
    description: string;
    context_window: number;
    max_output: number;
    training_data: string;
    features: ModelFeatures;
    category: string;
    family: string;
    aliases?: string[];
    supported_parameters: string[];
    parameter_mapping?: Record<string, string>;
    parameter_constraints: Record<string, ParameterConstraints>;
}

export interface ModelCategories {
    best: string[];
    high_performance: string[];
    fast: string[];
    legacy: string[];
}

export interface ModelFamilyCategories {
    reasoning: string[];
    flagship_chat: string[];
    cost_optimized: string[];
}

export interface OpenAIProvider {
    models: Record<string, ModelConfig>;
    categories: ModelCategories;
    families: ModelFamilyCategories;
    family_configs: Record<string, ModelFamily>;
}

export interface AnthropicProvider {
    models: Record<string, ModelConfig>;
    categories: ModelCategories;
    families: ModelFamilyCategories;
    family_configs: Record<string, ModelFamily>;
}

export interface ModelData {
    openai: OpenAIProvider;
    anthropic: AnthropicProvider;
} 