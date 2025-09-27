import { useState, useEffect } from 'react';
import { modelApi } from '../api/modelApi';
import { ModelData } from '../types/models';

export function useModels() {
    const [modelData, setModelData] = useState<ModelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const data = await modelApi.getModels();
                setModelData(data);
                setError(null);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to fetch models'));
            } finally {
                setLoading(false);
            }
        };

        fetchModels();
    }, []);

    const getModelByCategory = (category: keyof ModelData['openai']['categories']) => {
        if (!modelData?.openai?.models || !modelData?.anthropic?.models) return [];

        // Get models from both providers that match the category
        const openaiModels = Object.entries(modelData.openai.models)
            .filter(([_, config]) => config.category === category)
            .map(([id]) => id);

        const anthropicModels = Object.entries(modelData.anthropic.models)
            .filter(([_, config]) => config.category === category)
            .map(([id]) => id);

        return [...openaiModels, ...anthropicModels];
    };

    const getModelByFamily = (family: keyof ModelData['openai']['families']) => {
        if (!modelData?.openai?.models || !modelData?.anthropic?.models) return [];
        const openaiModels = Object.entries(modelData.openai.models)
            .filter(([_, config]) => config.family === family)
            .map(([id]) => id);

        const anthropicModels = Object.entries(modelData.anthropic.models)
            .filter(([_, config]) => config.family === family)
            .map(([id]) => id);

        return [...openaiModels, ...anthropicModels];
    };

    const getModelConfig = (modelId: string) => {
        if (!modelData?.openai?.models || !modelData?.anthropic?.models) return null;
        return {
            ...modelData.openai.models[modelId],
            ...modelData.anthropic.models[modelId]
        };
    };

    const getModelFamilyConfig = (family: string) => {
        if (!modelData?.openai?.family_configs || !modelData?.anthropic?.family_configs) return null;
        // Check OpenAI family configs first
        const openaiFamilyConfig = modelData.openai.family_configs[family];
        if (openaiFamilyConfig) return openaiFamilyConfig;
        // Then check Anthropic family configs
        return modelData.anthropic.family_configs[family] || null;
    };

    return {
        modelData,
        loading,
        error,
        getModelByCategory,
        getModelByFamily,
        getModelConfig,
        getModelFamilyConfig
    };
} 