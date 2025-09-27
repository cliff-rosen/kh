import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';

import { getExecutionStatusDisplay, getStatusBadgeClass, getHopStatusDisplay } from '@/utils/statusUtils';

import { Hop, ToolStep, ToolExecutionStatus } from '@/types/workflow';
import { useJamBot } from '@/context/JamBotContext';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface HopDetailsProps {
    hop: Hop;
    className?: string;
}

export const HopDetails: React.FC<HopDetailsProps> = ({
    hop,
    className = ''
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showSteps, setShowSteps] = useState(true);
    const [showAssets, setShowAssets] = useState(false);
    const [executingStepId, setExecutingStepId] = useState<string | null>(null);
    const { executeToolStep } = useJamBot();

    // Use HopStatus directly for display
    const statusDisplay = getHopStatusDisplay(hop.status);
    const completedSteps = hop.tool_steps?.filter(step => step.status === ToolExecutionStatus.COMPLETED).length || 0;
    const totalSteps = hop.tool_steps?.length || 0;

    const handleExecuteToolStep = async (step: ToolStep) => {
        setExecutingStepId(step.id);
        try {
            await executeToolStep(step, hop);
        } finally {
            setExecutingStepId(null);
        }
    };

    return (
        <div className={`space-y-4 mb-8 ${className}`}>
            {/* Header */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                            {hop.name}
                        </h3>
                        {hop.is_final && (
                            <span className="px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                                Final
                            </span>
                        )}
                        <span className={`${getStatusBadgeClass(statusDisplay.color)} flex items-center gap-1 text-xs`}>
                            {statusDisplay.icon}
                            {statusDisplay.text}
                        </span>
                    </div>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-400">
                    {hop.description}
                </p>

                {totalSteps > 0 && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>Progress</span>
                            <span>{completedSteps}/{totalSteps}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded h-1">
                            <div
                                className="bg-blue-500 h-1 rounded transition-all"
                                style={{ width: `${totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="space-y-4 text-xs">
                    {/* Inputs/Outputs */}
                    <div className="grid grid-cols-2 gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Inputs</div>
                            {hop.assets && hop.assets.some(asset => asset.role === 'input') ? (
                                hop.assets.filter(asset => asset.role === 'input').map((asset) => {
                                    const assetName = asset?.name || asset?.id;
                                    const tooltipText = [
                                        `Asset ID: ${asset.id}`,
                                        `Asset Name: ${assetName}`,
                                        asset?.description ? `Description: ${asset.description}` : null,
                                        asset?.schema_definition ? `Type: ${asset.schema_definition.type}${asset.schema_definition?.is_array ? '[]' : ''}` : null
                                    ].filter(Boolean).join('\n');

                                    return (
                                        <div
                                            key={asset.id}
                                            className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-help transition-colors"
                                            title={tooltipText}
                                        >
                                            {assetName}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-gray-400">None</div>
                            )}
                        </div>

                        <div>
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Outputs</div>
                            {hop.assets && hop.assets.some(asset => asset.role === 'output') ? (
                                hop.assets.filter(asset => asset.role === 'output').map((asset) => {
                                    const assetName = asset?.name || asset?.id;
                                    const tooltipText = [
                                        `Asset ID: ${asset.id}`,
                                        `Asset Name: ${assetName}`,
                                        asset?.description ? `Description: ${asset.description}` : null,
                                        asset?.schema_definition ? `Type: ${asset.schema_definition.type}${asset.schema_definition?.is_array ? '[]' : ''}` : null
                                    ].filter(Boolean).join('\n');

                                    return (
                                        <div
                                            key={asset.id}
                                            className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-help transition-colors relative group"
                                        >
                                            {assetName}
                                            {/* Custom tooltip for markdown rendering */}
                                            <div className="absolute z-50 left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded shadow-lg p-3 min-w-[250px] max-w-xs text-xs text-gray-900 dark:text-gray-100" style={{ pointerEvents: 'none' }}>
                                                <MarkdownRenderer content={tooltipText.replace(/\n/g, '\n\n')} />
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-gray-400">None</div>
                            )}
                        </div>
                    </div>

                    {/* Steps */}
                    {hop.tool_steps && hop.tool_steps.length > 0 && (
                        <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Steps</div>
                                <button
                                    onClick={() => setShowSteps(!showSteps)}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                    {showSteps ? 'Hide' : 'Show'}
                                </button>
                            </div>

                            {showSteps && (
                                <div className="space-y-2">
                                    {hop.tool_steps.map((step, index) => {
                                        const stepStatus = getExecutionStatusDisplay(step.status);

                                        return (
                                            <div key={step.id || index} className="border-l-2 border-gray-300 pl-3 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                                        {index + 1}. {step.tool_id}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {step.status !== ToolExecutionStatus.COMPLETED && (
                                                            <button
                                                                onClick={() => handleExecuteToolStep(step)}
                                                                disabled={executingStepId === step.id}
                                                                className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${executingStepId === step.id
                                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                                    }`}
                                                            >
                                                                {executingStepId === step.id ? (
                                                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <Play className="w-3 h-3" />
                                                                )}
                                                                Execute
                                                            </button>
                                                        )}
                                                        <span className={`${getStatusBadgeClass(stepStatus.color)} text-xs`}>
                                                            {stepStatus.text}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-xs text-gray-500">{step.description}</div>

                                                {step.parameter_mapping && Object.keys(step.parameter_mapping).length > 0 && (
                                                    <div className="ml-3 space-y-0.5">
                                                        <div className="text-xs font-medium text-gray-600">Inputs</div>
                                                        {Object.entries(step.parameter_mapping).map(([param, mapping]) => {
                                                            if (mapping.type === "literal") {
                                                                // Handle date range objects and other object types
                                                                let displayValue = mapping.value;
                                                                if (mapping.value && typeof mapping.value === 'object') {
                                                                    // Check for date range with start_date/end_date
                                                                    if ('start_date' in mapping.value && 'end_date' in mapping.value) {
                                                                        displayValue = `${mapping.value.start_date} to ${mapping.value.end_date}`;
                                                                    }
                                                                    // Check for date range with start/end
                                                                    else if ('start' in mapping.value && 'end' in mapping.value) {
                                                                        displayValue = `${mapping.value.start} to ${mapping.value.end}`;
                                                                    }
                                                                    // Fallback for any other object - convert to JSON string
                                                                    else {
                                                                        displayValue = JSON.stringify(mapping.value);
                                                                    }
                                                                }
                                                                return (
                                                                    <div key={param} className="text-xs text-gray-500">
                                                                        <span className="text-blue-600 dark:text-blue-400">{param}:</span>
                                                                        <span className="ml-1">{displayValue}</span>
                                                                    </div>
                                                                );
                                                            } else if (mapping.type === "asset_field") {
                                                                const asset = hop.assets?.find(a => a.name === mapping.state_asset);
                                                                const tooltipText = [
                                                                    `Parameter: ${param}`,
                                                                    `Asset Reference: ${mapping.state_asset}`,
                                                                    asset?.name ? `Asset Name: ${asset.name}` : null,
                                                                    asset?.description ? `Description: ${asset.description}` : null
                                                                ].filter(Boolean).join('\n');

                                                                return (
                                                                    <div key={param} className="text-xs text-gray-500">
                                                                        <span className="text-blue-600 dark:text-blue-400">{param}:</span>
                                                                        <span
                                                                            className="ml-1 hover:text-blue-600 dark:hover:text-blue-400 cursor-help transition-colors"
                                                                            title={tooltipText}
                                                                        >
                                                                            {asset?.name || 'Unknown Asset'}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}

                                                {step.result_mapping && Object.keys(step.result_mapping).length > 0 && (
                                                    <div className="ml-3 space-y-0.5">
                                                        <div className="text-xs font-medium text-gray-600">Outputs</div>
                                                        {Object.entries(step.result_mapping).map(([result, mapping]) => {
                                                            if (mapping.type === "discard") {
                                                                return (
                                                                    <div key={result} className="text-xs text-gray-500">
                                                                        <span className="text-green-600 dark:text-green-400">{result}:</span>
                                                                        <span className="ml-1 text-gray-400">(discarded)</span>
                                                                    </div>
                                                                );
                                                            } else if (mapping.type === "asset_field") {
                                                                const asset = hop.assets?.find(a => a.name === mapping.state_asset);
                                                                const assetName = asset?.name || `${mapping.state_asset} (name not available)`;
                                                                const tooltipText = [
                                                                    `Result: ${result}`,
                                                                    `Hop Variable: ${mapping.state_asset}`,
                                                                    asset?.name ? `Asset Name: ${asset.name}` : null,
                                                                    asset?.description ? `Description: ${asset.description}` : null
                                                                ].filter(Boolean).join('\n');

                                                                return (
                                                                    <div key={result} className="text-xs text-gray-500">
                                                                        <span className="text-green-600 dark:text-green-400">{result}:</span>
                                                                        <span
                                                                            className="ml-1 hover:text-green-600 dark:hover:text-green-400 cursor-help transition-colors"
                                                                            title={tooltipText}
                                                                        >
                                                                            {assetName}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}

                                                {step.error_message && (
                                                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-1 rounded">
                                                        Error: {step.error_message}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Assets */}
                    {hop.assets && hop.assets.length > 0 && (
                        <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    Assets ({hop.assets.length})
                                </div>
                                <button
                                    onClick={() => setShowAssets(!showAssets)}
                                    className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                    {showAssets ? 'Hide' : 'Show'}
                                </button>
                            </div>

                            {showAssets && (
                                <div className="space-y-1">
                                    {hop.assets.map((asset) => (
                                        <div key={asset.id} className="text-xs">
                                            <div className="text-gray-700 dark:text-gray-300">
                                                <span className="text-blue-600 dark:text-blue-400">{asset.name}:</span> {asset.name}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                                {`${asset.schema_definition?.type}${asset.schema_definition?.is_array ? '[]' : ''}` || null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="flex gap-4 text-xs text-gray-500">
                        <span>Resolved: {hop.is_resolved ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HopDetails; 