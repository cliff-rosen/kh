import React from 'react';
import { Asset } from '@/types/asset';
import { VariableRenderer } from '@/components/common/VariableRenderer';

interface MissionStateTableProps {
    missionState: Record<string, Asset>;
    className?: string;
}

export const MissionStateTable: React.FC<MissionStateTableProps> = ({ missionState, className = '' }) => {
    return (
        <div className={`overflow-x-auto ${className}`}>
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
                    {Object.entries(missionState).map(([key, asset]) => (
                        <tr key={key} className="border-b border-gray-100 dark:border-gray-700">
                            <td className="py-1 px-2 text-gray-900 dark:text-gray-100">{asset.name}</td>
                            <td className="py-1 px-2 font-mono text-gray-700 dark:text-gray-200">{asset.id}</td>
                            <td className="py-1 px-2 text-gray-700 dark:text-gray-200">{asset.schema_definition?.type || 'unknown'}</td>
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
    );
}; 