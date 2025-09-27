import React from 'react';
import { Mission, Hop } from '@/types/workflow';
import { Asset, AssetRole } from '@/types/asset';
import { VariableRenderer } from '@/components/common/VariableRenderer';

interface MissionBrowserProps {
    mission: Mission | null;
    className?: string;
}

export const MissionBrowser: React.FC<MissionBrowserProps> = ({ mission, className = '' }) => {
    if (!mission) {
        return <div className={className}>No mission loaded.</div>;
    }

    console.log(mission);

    // Helper to get mission inputs
    const getMissionInputs = (): Asset[] => {
        return mission.assets.filter(asset => asset.role === AssetRole.INPUT);
    };

    // Helper to get mission outputs
    const getMissionOutputs = (): Asset[] => {
        return mission.assets.filter(asset => asset.role === AssetRole.OUTPUT);
    };

    // Helper to get all hops (completed + current)
    const allHops: Hop[] = [
        ...mission.hops,
        ...(mission.current_hop ? [mission.current_hop] : [])
    ];

    // Helper to render resource config
    const renderResourceConfig = (config: any) => {
        return <VariableRenderer value={config} />;
    };

    // Helper to render mapping value
    const renderMappingValue = (mapping: any) => {
        if (mapping.type === 'asset_field') {
            return (
                <span className="font-mono">
                    Asset: {mapping.state_asset.slice(-8)}
                    {mapping.path && <span className="text-gray-500 dark:text-gray-400"> ({mapping.path})</span>}
                </span>
            );
        } else if (mapping.type === 'literal') {
            return <VariableRenderer value={mapping.value} />;
        } else if (mapping.type === 'discard') {
            return <span className="text-gray-500 dark:text-gray-400 italic">Discarded</span>;
        }
        return null;
    };

    return (
        <div className={`space-y-6 ${className}`}>
            {/* Mission Overview */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Mission Overview</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Inputs</h4>
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Name</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">ID</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Role</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Value</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getMissionInputs().map((input, idx) => (
                                        <tr key={input.id || idx} className="border-b border-gray-100 dark:border-gray-700">
                                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{input.name}</td>
                                            <td className="py-1 px-2 font-mono text-orange-600 dark:text-orange-400">{input.id}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{input.schema_definition.type || 'unknown'}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{input.role || 'input'}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                <VariableRenderer value={input.value_representation} />
                                            </td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{input.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Outputs</h4>
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Name</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">ID</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Role</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Value</th>
                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getMissionOutputs().map((output, idx) => (
                                        <tr key={output.id || idx} className="border-b border-gray-100 dark:border-gray-700">
                                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{output.name}</td>
                                            <td className="py-1 px-2 font-mono text-orange-600 dark:text-orange-400">{output.id}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{output.schema_definition.type || 'unknown'}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{output.role || 'output'}</td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                <VariableRenderer value={output.value_representation} isMarkdown={typeof output.value_representation === 'string' && /[\*#\|\n`>-]/.test(output.value_representation)} />
                                            </td>
                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{output.status}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mission State */}
            <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Mission State</h3>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Name</th>
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">ID</th>
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Role</th>
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Value</th>
                                <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mission.assets.map((asset) => (
                                <tr key={asset.id} className="border-b border-gray-100 dark:border-gray-700">
                                    <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{asset.name}</td>
                                    <td className="py-1 px-2 font-mono text-orange-600 dark:text-orange-400">{asset.id}</td>
                                    <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.schema_definition.type || 'unknown'}</td>
                                    <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.role || 'intermediate'}</td>
                                    <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                        <VariableRenderer value={asset.value_representation} />
                                    </td>
                                    <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.status}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Hops */}
            {allHops.map((hop, hopIndex) => (
                <div key={hop.id}>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                        Hop {hopIndex + 1}: {hop.name}
                    </h3>
                    <div className="space-y-4">
                        {/* Hop State */}
                        <div>
                            <h4 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Hop State</h4>
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-gray-700">
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Name</th>
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">ID</th>
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Role</th>
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Value</th>
                                            <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {hop.assets.map((asset, index) => (
                                            <tr key={index} className="border-b border-gray-100 dark:border-gray-700">
                                                <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{asset.name}</td>
                                                <td className="py-1 px-2 font-mono text-green-600 dark:text-green-400">{asset.id}</td>
                                                <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.schema_definition.type || 'unknown'}</td>
                                                <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.role || 'intermediate'}</td>
                                                <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                    <VariableRenderer value={asset.value_representation} />
                                                </td>
                                                <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Tool Steps */}
                        {hop.tool_steps.map((step, stepIndex) => (
                            <div key={step.id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                        Tool Step {stepIndex + 1}: {step.description}
                                    </h4>
                                </div>
                                <div className="p-4 space-y-4">
                                    {/* Resource Configs */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">Resource Configs</h5>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Resource</th>
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Config</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(step.resource_configs).map(([resource, config]) => (
                                                        <tr key={resource} className="border-b border-gray-100 dark:border-gray-700">
                                                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{resource}</td>
                                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                                {renderResourceConfig(config)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Parameter Mapping */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">Parameter Mapping</h5>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Parameter</th>
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(step.parameter_mapping).map(([param, mapping]) => (
                                                        <tr key={param} className="border-b border-gray-100 dark:border-gray-700">
                                                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{param}</td>
                                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{mapping.type}</td>
                                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                                {renderMappingValue(mapping)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Result Mapping */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-2">Result Mapping</h5>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-3">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="border-b border-gray-200 dark:border-gray-700">
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Result</th>
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Type</th>
                                                        <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-200">Target</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(step.result_mapping).map(([result, mapping]) => (
                                                        <tr key={result} className="border-b border-gray-100 dark:border-gray-700">
                                                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{result}</td>
                                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{mapping.type}</td>
                                                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">
                                                                {renderMappingValue(mapping)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Step Status */}
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-gray-700 dark:text-gray-200">Status:</span>
                                            <span className={`px-2 py-1 rounded ${step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' :
                                                step.status === 'executing' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' :
                                                    step.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
                                                        'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400'
                                                }`}>
                                                {step.status}
                                            </span>
                                        </div>
                                        <div className="text-gray-500 dark:text-gray-400">
                                            Created: {new Date(step.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}; 