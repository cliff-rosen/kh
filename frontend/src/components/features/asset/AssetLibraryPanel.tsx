import React, { useState } from 'react';
import { Asset } from '@/types/asset';
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

interface AssetLibraryPanelProps {
    assets: Asset[];
    onAssetSelect: (asset: Asset) => void;
    selectedAssetId?: string;
}

const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
    assets,
    onAssetSelect,
    selectedAssetId,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<string>('all');

    const applyFilters = (assetsToFilter: Asset[]): Asset[] => {
        return assetsToFilter.filter(asset => {
            const assetName = asset.name || '';
            const assetDescription = asset.description || '';
            const searchLower = searchQuery.toLowerCase();

            const matchesSearch = assetName.toLowerCase().includes(searchLower) ||
                assetDescription.toLowerCase().includes(searchLower);
            const matchesType = filterType === 'all' || (asset.schema_definition && asset.schema_definition.type === filterType);
            return matchesSearch && matchesType;
        });
    };

    // Ensure assets is an array and use the new role property for categorization
    const assetsArray = Array.isArray(assets) ? assets : [];
    const categorizedAssets = {
        inputs: assetsArray.filter(asset => asset.role === 'input'),
        outputs: assetsArray.filter(asset => asset.role === 'output'),
        wips: assetsArray.filter(asset => asset.role === 'intermediate' || (!asset.role && asset.role !== 'input' && asset.role !== 'output')), // Fallback for assets without role
    };

    const filteredInputAssets = applyFilters(categorizedAssets.inputs);
    const filteredWipAssets = applyFilters(categorizedAssets.wips);
    const filteredOutputAssets = applyFilters(categorizedAssets.outputs);

    const totalFilteredAssets = filteredInputAssets.length + filteredWipAssets.length + filteredOutputAssets.length;
    const assetLibraryIsEmpty = assets.length === 0;
    const noResultsFromSearchOrFilter = totalFilteredAssets === 0 && !assetLibraryIsEmpty;

    return (
        <div className="h-full flex flex-col bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b dark:border-gray-700">
                <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asset Library</h2>
            </div>

            {/* Search and Filter */}
            <div className="flex-shrink-0 p-4 space-y-2 border-b dark:border-gray-700">
                <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search assets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                <div className="flex items-center space-x-2">
                    <FunnelIcon className="h-5 w-5 text-gray-400" />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 
                                 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                        <option value="all">All Types</option>
                        <option value="file">Files</option>
                        <option value="string">Primitives</option>
                        <option value="object">Objects</option>
                        <option value="database_entity">Database Entities</option>
                        <option value="email">Emails</option>
                        <option value="webpage">Web Pages</option>
                    </select>
                </div>
            </div>

            {/* Asset Sections */}
            <div className="flex-1 overflow-y-auto p-4">
                {assetLibraryIsEmpty ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Asset library is empty.
                    </div>
                ) : noResultsFromSearchOrFilter ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No assets match your search or filter criteria.
                    </div>
                ) : (
                    <>
                        <AssetSection
                            title="Inputs"
                            assets={filteredInputAssets}
                            onAssetSelect={onAssetSelect}
                            selectedAssetId={selectedAssetId}
                        />

                        {/* Divider 1: After Inputs, if WIP or Outputs have content (and Inputs had content) */}
                        {(filteredInputAssets.length > 0 && (filteredWipAssets.length > 0 || filteredOutputAssets.length > 0)) && (
                            <hr className="my-4 border-gray-200 dark:border-gray-600" />
                        )}

                        <AssetSection
                            title="Work-in-Progress"
                            assets={filteredWipAssets}
                            onAssetSelect={onAssetSelect}
                            selectedAssetId={selectedAssetId}
                        />

                        {/* Divider 2: After WIP, if Outputs have content (and Inputs or WIP had content) */}
                        {((filteredInputAssets.length > 0 || filteredWipAssets.length > 0) && filteredOutputAssets.length > 0) && (
                            <hr className="my-4 border-gray-200 dark:border-gray-600" />
                        )}

                        <AssetSection
                            title="Outputs"
                            assets={filteredOutputAssets}
                            onAssetSelect={onAssetSelect}
                            selectedAssetId={selectedAssetId}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

// Helper component to render a single asset card
const AssetCard: React.FC<{ asset: Asset; onAssetSelect: (asset: Asset) => void; isSelected: boolean }> = ({
    asset,
    onAssetSelect,
    isSelected,
}) => (
    <div
        key={asset.id}
        onClick={() => onAssetSelect(asset)}
        className={`bg-white dark:bg-gray-700 border rounded-lg p-3 cursor-pointer transition
            ${isSelected
                ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-700'
                : 'border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-400'}`}
    >
        <div className="font-medium truncate text-xs text-gray-900 dark:text-gray-100">{asset.name}</div>
        <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 min-h-[32px]">{asset.description || 'No description'}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
            <div className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 w-fit border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                {asset.schema_definition?.type?.toUpperCase() || 'UNKNOWN'}
            </div>
            {/* Show role badge */}
            {asset.role && (
                <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${asset.role === 'input' ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                    asset.role === 'output' ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300' :
                        'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                    }`}>
                    {asset.role}
                </div>
            )}
            {/* Show status badge */}
            <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${asset.status === 'ready' ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' :
                asset.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300' :
                    asset.status === 'error' ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300' :
                        'bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}>
                {asset.status?.toUpperCase() || 'UNKNOWN'}
            </div>
            {asset.asset_metadata?.token_count !== undefined && (
                <div className="text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 w-fit border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
                    {asset.asset_metadata.token_count} tokens
                </div>
            )}
        </div>
    </div>
);

// Helper component for rendering a section
const AssetSection: React.FC<{
    title: string;
    assets: Asset[];
    onAssetSelect: (asset: Asset) => void;
    selectedAssetId?: string;
}> = ({ title, assets, onAssetSelect, selectedAssetId }) => {
    // Section will always render its title.
    // If no assets, it will show a message within the section.
    return (
        <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-1">{title}</h3>
            {assets.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {assets.map(asset => (
                        <AssetCard
                            key={asset.id}
                            asset={asset}
                            onAssetSelect={onAssetSelect}
                            isSelected={selectedAssetId === asset.id}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-4 text-sm text-gray-400 dark:text-gray-500 px-1">
                    No {title.toLowerCase()} assets to display in this section.
                </div>
            )}
        </div>
    );
};

export default AssetLibraryPanel; 