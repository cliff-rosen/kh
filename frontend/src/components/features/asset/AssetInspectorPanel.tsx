import React, { useEffect, useState } from 'react';
import { Asset } from '@/types/asset';
import { getAssetIcon } from '@/lib/utils/assets/assetIconUtils';
import { assetApi } from '@/lib/api/assetApi';
import { VariableRenderer } from '@/components/common/VariableRenderer';
import { useJamBot } from '@/context/JamBotContext';

interface AssetInspectorPanelProps {
    asset?: Asset;
}

const AssetInspectorPanel: React.FC<AssetInspectorPanelProps> = ({ asset }) => {
    const [detailedAsset, setDetailedAsset] = useState<Asset | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { state: jamBotState } = useJamBot();

    // Get the latest asset state from either mission assets or current hop assets
    const latestAsset = asset ? (
        (Array.isArray(jamBotState?.mission?.assets) && jamBotState.mission?.assets.find(a => a.id === asset.id))
    ) : undefined;

    useEffect(() => {
        const fetchAssetDetails = async () => {
            if (!latestAsset) return;

            // Only fetch details for database entity assets
            if (latestAsset.schema_definition?.type === 'database_entity' && !latestAsset.value_representation) {
                setLoading(true);
                setError(null);
                try {
                    const response = await assetApi.getAssetDetails(latestAsset.id);
                    setDetailedAsset(response);
                } catch (err) {
                    setError('Failed to fetch asset details');
                    console.error('Error fetching asset details:', err);
                } finally {
                    setLoading(false);
                }
            } else {
                setDetailedAsset(latestAsset);
            }
        };

        fetchAssetDetails();
    }, [latestAsset]);

    if (!latestAsset) {
        return (
            <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800">
                <p className="text-gray-500 dark:text-gray-400">Select an asset to view its details</p>
            </div>
        );
    }

    const displayAsset = detailedAsset || latestAsset;

    if (!displayAsset || !displayAsset.schema_definition) {
        return (
            <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800">
                <p className="text-gray-500 dark:text-gray-400">Invalid asset data</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b dark:border-gray-700">
                <div className="flex items-center space-x-2">
                    {getAssetIcon(displayAsset.schema_definition.type, displayAsset.subtype)}
                    <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {displayAsset.name}
                    </h2>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {displayAsset.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {displayAsset.description}
                    </p>
                )}

                {/* Metadata Section */}
                <div className="mb-4">
                    <div className="flex items-center gap-2">
                        <div className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 w-fit border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                            {displayAsset.schema_definition.type?.toUpperCase() || 'UNKNOWN'}
                        </div>
                        {/* Show role badge */}
                        {displayAsset.role && (
                            <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${displayAsset.role === 'input' ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                                displayAsset.role === 'output' ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300' :
                                    'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                                }`}>
                                {displayAsset.role}
                            </div>
                        )}
                        {/* Show status badge */}
                        <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${displayAsset.status === 'ready' ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                            displayAsset.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300' :
                                displayAsset.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' :
                                    'bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                            }`}>
                            {displayAsset.status?.toUpperCase() || 'UNKNOWN'}
                        </div>
                        {displayAsset.asset_metadata?.token_count !== undefined && (
                            <div className="text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 w-fit border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                                {displayAsset.asset_metadata.token_count} tokens
                            </div>
                        )}
                    </div>
                    {displayAsset.asset_metadata && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            <div>Created: {new Date(displayAsset.asset_metadata.createdAt).toLocaleString()}</div>
                            <div>Updated: {new Date(displayAsset.asset_metadata.updatedAt).toLocaleString()}</div>
                            <div>Version: {displayAsset.asset_metadata.version}</div>
                        </div>
                    )}
                </div>

                {loading && (
                    <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
                    </div>
                )}

                {error && (
                    <div className="text-red-500 text-sm mb-4">
                        {error}
                    </div>
                )}

                {displayAsset.value_representation && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                        {displayAsset.schema_definition.type === 'database_entity' ? (
                            <div className="space-y-4">
                                {Array.isArray(displayAsset.value_representation) ? (
                                    <div className="space-y-2">
                                        {displayAsset.value_representation.map((item: any, index: number) => (
                                            <div key={index} className="p-3 bg-white dark:bg-gray-800 rounded border dark:border-gray-700">
                                                <VariableRenderer
                                                    value={item}
                                                    schema={displayAsset.schema_definition}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <VariableRenderer
                                        value={displayAsset.value_representation}
                                        schema={displayAsset.schema_definition}
                                    />
                                )}
                            </div>
                        ) : (
                            <VariableRenderer
                                value={displayAsset.value_representation}
                                schema={displayAsset.schema_definition}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssetInspectorPanel; 