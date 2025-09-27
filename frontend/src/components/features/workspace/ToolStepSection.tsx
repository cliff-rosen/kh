import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ToolStep } from '@/types/workflow';

interface ToolStepSectionProps {
    toolSteps: ToolStep[];
    canCollapse?: boolean;
}

const ToolStepSection: React.FC<ToolStepSectionProps> = ({ toolSteps, canCollapse = false }) => {
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

    const toggleStepExpansion = (stepId: string) => {
        const newExpanded = new Set(expandedSteps);
        if (newExpanded.has(stepId)) {
            newExpanded.delete(stepId);
        } else {
            newExpanded.add(stepId);
        }
        setExpandedSteps(newExpanded);
    };

    const extractTypeAndValue = (item: any): { type: string; value: any } => {
        // Handle {type: "...", value: "..."} structure (for both parameters and outputs)
        if (item && typeof item === 'object' && 'type' in item) {
            return {
                type: item.type,
                value: 'value' in item ? item.value : '-'
            };
        }

        // Fallback for any other structure
        return {
            type: typeof item,
            value: item
        };
    };

    const renderValue = (value: any) => {
        if (typeof value === 'object' && value !== null) {
            return <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-1 rounded overflow-x-auto max-w-xs">{JSON.stringify(value, null, 2)}</pre>;
        }
        return <span className="text-sm">{String(value)}</span>;
    };

    const renderTable = (title: string, mapping: Record<string, any>) => (
        <div>
            <h5 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">{title}</h5>
            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-600">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700">
                            <th className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
                            <th className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Type</th>
                            <th className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(mapping).map(([key, item]) => {
                            const { type, value } = extractTypeAndValue(item);
                            return (
                                <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <td className="border border-gray-200 dark:border-gray-600 px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{key}</td>
                                    <td className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-gray-600 dark:text-gray-400">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                                            {type}
                                        </span>
                                    </td>
                                    <td className="border border-gray-200 dark:border-gray-600 px-3 py-2 text-gray-700 dark:text-gray-300">
                                        {renderValue(value)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (!toolSteps || toolSteps.length === 0) {
        return null;
    }

    return (
        <div className="mt-4">
            <div className="space-y-2">
                {toolSteps.map((step) => {
                    const isExpanded = expandedSteps.has(step.id);
                    const hasDetails = step.parameter_mapping && Object.keys(step.parameter_mapping).length > 0 ||
                        step.result_mapping && Object.keys(step.result_mapping).length > 0 ||
                        step.resource_configs && Object.keys(step.resource_configs).length > 0;

                    return (
                        <div key={step.id} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {canCollapse && hasDetails && (
                                        <button
                                            onClick={() => toggleStepExpansion(step.id)}
                                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        >
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4" />
                                            )}
                                        </button>
                                    )}
                                    <div>
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                            {step.name || `Step ${step.sequence_order}`}
                                        </h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' :
                                        step.status === 'executing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100' :
                                            step.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100' :
                                                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                                        }`}>
                                        {step.status}
                                    </span>
                                </div>
                            </div>

                            {canCollapse && hasDetails && isExpanded && (
                                <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
                                    <div className="space-y-4">
                                        {step.parameter_mapping && Object.keys(step.parameter_mapping).length > 0 &&
                                            renderTable("Parameters", step.parameter_mapping)
                                        }

                                        {step.result_mapping && Object.keys(step.result_mapping).length > 0 &&
                                            renderTable("Outputs", step.result_mapping)
                                        }

                                        {step.resource_configs && Object.keys(step.resource_configs).length > 0 &&
                                            renderTable("Resources", step.resource_configs)
                                        }
                                    </div>
                                </div>
                            )}

                            {!canCollapse && hasDetails && (
                                <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
                                    <div className="space-y-4">
                                        {step.parameter_mapping && Object.keys(step.parameter_mapping).length > 0 &&
                                            renderTable("Parameters", step.parameter_mapping)
                                        }

                                        {step.result_mapping && Object.keys(step.result_mapping).length > 0 &&
                                            renderTable("Outputs", step.result_mapping)
                                        }

                                        {step.resource_configs && Object.keys(step.resource_configs).length > 0 &&
                                            renderTable("Resources", step.resource_configs)
                                        }
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ToolStepSection; 