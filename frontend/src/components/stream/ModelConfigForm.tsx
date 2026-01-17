import { useState, useEffect } from 'react';
import { ResearchStream, LLMConfig, StageModelConfig, ReasoningEffort } from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { showErrorToast, showSuccessToast } from '../../lib/errorToast';

// Model definitions - must match backend/config/llm_models.py
const AVAILABLE_MODELS = [
    { id: 'gpt-4.1', name: 'GPT-4.1', family: 'chat', description: 'Enhanced GPT-4, 128k context, supports temperature' },
    { id: 'gpt-5', name: 'GPT-5', family: 'reasoning', description: 'Full GPT-5, 128k context, supports reasoning effort' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini', family: 'reasoning', description: 'Cost-efficient GPT-5, 64k context' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano', family: 'reasoning', description: 'Compact GPT-5, 32k context' },
];

const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

// Default configurations
const DEFAULT_LLM_CONFIG: LLMConfig = {
    semantic_filter: { model: 'gpt-4.1', temperature: 0.0 },
    categorization: { model: 'gpt-4.1', temperature: 0.0 },
    article_summary: { model: 'gpt-4.1', temperature: 0.0 },
    category_summary: { model: 'gpt-4.1', temperature: 0.0 },
    executive_summary: { model: 'gpt-4.1', temperature: 0.0 },
};

const STAGE_LABELS: Record<keyof LLMConfig, { name: string; description: string }> = {
    semantic_filter: { name: 'Semantic Filter', description: 'Evaluates article relevance during retrieval' },
    categorization: { name: 'Article Categorization', description: 'Assigns articles to presentation categories' },
    article_summary: { name: 'Article Summaries', description: 'Generates per-article AI summaries' },
    category_summary: { name: 'Category Summaries', description: 'Generates category-level summaries' },
    executive_summary: { name: 'Executive Summary', description: 'Generates overall report summary' },
};

interface ModelConfigFormProps {
    stream: ResearchStream;
    onConfigUpdate?: () => void;
    canModify?: boolean;
}

export default function ModelConfigForm({ stream, onConfigUpdate, canModify = true }: ModelConfigFormProps) {
    const [config, setConfig] = useState<LLMConfig>(stream.llm_config || DEFAULT_LLM_CONFIG);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Reset when stream changes
    useEffect(() => {
        setConfig(stream.llm_config || DEFAULT_LLM_CONFIG);
        setHasChanges(false);
    }, [stream.stream_id, stream.llm_config]);

    const isReasoningModel = (modelId: string) => {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        return model?.family === 'reasoning';
    };

    const updateStageConfig = (
        stage: keyof LLMConfig,
        updates: Partial<StageModelConfig>
    ) => {
        setConfig(prev => {
            const currentStage = prev[stage] || (DEFAULT_LLM_CONFIG[stage] as StageModelConfig);
            const newStageConfig = { ...currentStage, ...updates };

            // If changing to a reasoning model, set default reasoning_effort and remove temperature
            if (updates.model && isReasoningModel(updates.model)) {
                newStageConfig.reasoning_effort = newStageConfig.reasoning_effort || 'medium';
                delete newStageConfig.temperature;
            }
            // If changing to a non-reasoning model, set default temperature and remove reasoning_effort
            else if (updates.model && !isReasoningModel(updates.model)) {
                newStageConfig.temperature = newStageConfig.temperature ?? 0.3;
                delete newStageConfig.reasoning_effort;
            }

            return { ...prev, [stage]: newStageConfig };
        });
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await researchStreamApi.updateResearchStream(stream.stream_id, {
                llm_config: config
            });
            showSuccessToast('Model configuration saved');
            setHasChanges(false);
            if (onConfigUpdate) {
                onConfigUpdate();
            }
        } catch (error) {
            showErrorToast(error, 'Failed to save model configuration');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetToDefaults = () => {
        setConfig(DEFAULT_LLM_CONFIG);
        setHasChanges(true);
    };

    const renderStageConfig = (stage: keyof LLMConfig) => {
        const stageConfig = config[stage] || (DEFAULT_LLM_CONFIG[stage] as StageModelConfig);
        const { name, description } = STAGE_LABELS[stage];
        const isReasoning = isReasoningModel(stageConfig.model);

        return (
            <div key={stage} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Model
                        </label>
                        <select
                            value={stageConfig.model}
                            onChange={(e) => updateStageConfig(stage, { model: e.target.value })}
                            disabled={!canModify}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <optgroup label="Chat Models (Temperature)">
                                {AVAILABLE_MODELS.filter(m => m.family === 'chat').map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                            <optgroup label="Reasoning Models (Reasoning Effort)">
                                {AVAILABLE_MODELS.filter(m => m.family === 'reasoning').map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        {isReasoning ? (
                            <>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Reasoning Effort
                                </label>
                                <select
                                    value={stageConfig.reasoning_effort || 'medium'}
                                    onChange={(e) => updateStageConfig(stage, { reasoning_effort: e.target.value as ReasoningEffort })}
                                    disabled={!canModify}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                               disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {REASONING_EFFORT_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Temperature ({stageConfig.temperature?.toFixed(1) || '0.3'})
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={stageConfig.temperature ?? 0.3}
                                    onChange={(e) => updateStageConfig(stage, { temperature: parseFloat(e.target.value) })}
                                    disabled={!canModify}
                                    className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer
                                               disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-2">
                    Model Configuration
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                    Configure which AI models to use for each pipeline stage. GPT-5 models use "reasoning effort" instead of temperature.
                </p>
            </div>

            {/* Stage Configurations */}
            <div className="space-y-4">
                {(Object.keys(STAGE_LABELS) as Array<keyof LLMConfig>).map(stage => renderStageConfig(stage))}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={handleResetToDefaults}
                    disabled={!canModify || isSaving}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Reset to Defaults
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canModify || isSaving || !hasChanges}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700
                               rounded-md disabled:opacity-50 disabled:cursor-not-allowed
                               flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Saving...
                        </>
                    ) : hasChanges ? 'Save Changes' : 'Saved'}
                </button>
            </div>
        </div>
    );
}
