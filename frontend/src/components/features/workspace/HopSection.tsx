import React from 'react';
import { Hop, HopStatus } from '@/types/workflow';
import { Asset } from '@/types/asset';
import { getHopStatusDisplay, getStatusBadgeClass } from '@/utils/statusUtils';
import ToolStepSection from './ToolStepSection';

interface HopSectionProps {
    hop: Hop | null;
}

// Helper component to render a single asset card (similar to AssetLibraryPanel)
const AssetCard: React.FC<{ asset: Asset; isSubtle?: boolean }> = ({ asset, isSubtle = false }) => (
    <div className={`border rounded-lg p-3 ${isSubtle
        ? 'bg-gray-25 dark:bg-gray-800/30 border-gray-300 dark:border-gray-600'
        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
        }`}>
        <div className={`font-medium truncate text-sm ${isSubtle
            ? 'text-gray-700 dark:text-gray-400'
            : 'text-gray-900 dark:text-gray-100'
            }`}>
            {asset.name}
        </div>
        <div className={`text-xs line-clamp-2 min-h-[32px] mt-1 ${isSubtle
            ? 'text-gray-500 dark:text-gray-500'
            : 'text-gray-600 dark:text-gray-300'
            }`}>
            {asset.description || 'No description'}
        </div>
        <div className="flex gap-1 mt-2">
            <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${isSubtle
                ? 'bg-gray-100/70 dark:bg-gray-700/50 border-gray-300/70 dark:border-gray-600/50 text-gray-600 dark:text-gray-400'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                {asset.schema_definition?.type?.toUpperCase() || 'UNKNOWN'}
            </div>
            {/* Show role badge */}
            {asset.role && (
                <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${isSubtle
                    ? asset.role === 'input'
                        ? 'bg-green-50 dark:bg-green-900/10 border-green-200/70 dark:border-green-800/50 text-green-600 dark:text-green-400/70'
                        : asset.role === 'output'
                            ? 'bg-purple-50 dark:bg-purple-900/10 border-purple-200/70 dark:border-purple-800/50 text-purple-600 dark:text-purple-400/70'
                            : 'bg-orange-50 dark:bg-orange-900/10 border-orange-200/70 dark:border-orange-800/50 text-orange-600 dark:text-orange-400/70'
                    : asset.role === 'input'
                        ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                        : asset.role === 'output'
                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                            : 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                    }`}>
                    {asset.role}
                </div>
            )}
            {/* Show status badge */}
            <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${isSubtle
                ? asset.status === 'ready'
                    ? 'bg-green-50 dark:bg-green-900/10 border-green-200/70 dark:border-green-800/50 text-green-600 dark:text-green-400/70'
                    : asset.status === 'pending'
                        ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200/70 dark:border-yellow-800/50 text-yellow-600 dark:text-yellow-400/70'
                        : asset.status === 'error'
                            ? 'bg-red-50 dark:bg-red-900/10 border-red-200/70 dark:border-red-800/50 text-red-600 dark:text-red-400/70'
                            : 'bg-gray-50 dark:bg-gray-900/10 border-gray-200/70 dark:border-gray-800/50 text-gray-600 dark:text-gray-400/70'
                : asset.status === 'ready'
                    ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                    : asset.status === 'pending'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300'
                        : asset.status === 'error'
                            ? 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                            : 'bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300'
                }`}>
                {asset.status?.toUpperCase() || 'UNKNOWN'}
            </div>
            {asset.asset_metadata?.token_count && (
                <div className={`text-[10px] px-2 py-0.5 rounded w-fit border ${isSubtle
                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200/70 dark:border-blue-800/50 text-blue-600 dark:text-blue-400/70'
                    : 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    }`}>
                    {asset.asset_metadata.token_count} tokens
                </div>
            )}
        </div>
    </div>
);

// Helper component for rendering a section of assets
const AssetSection: React.FC<{
    title: string;
    assets: Asset[];
    isSubtle?: boolean;
}> = ({ title, assets, isSubtle = false }) => {
    if (assets.length === 0) {
        return null;
    }

    return (
        <div className="mb-4">
            <h5 className={`text-sm font-medium mb-2 ${isSubtle
                ? 'text-gray-600 dark:text-gray-400'
                : 'text-gray-700 dark:text-gray-300'
                }`}>
                {title} ({assets.length})
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {assets.map(asset => (
                    <AssetCard key={asset.id} asset={asset} isSubtle={isSubtle} />
                ))}
            </div>
        </div>
    );
};

const HopSection: React.FC<HopSectionProps> = ({ hop }) => {


    if (!hop) {
        return null;
    }

    const hopStatus = getHopStatusDisplay(hop.status);

    // Extract assets from hop assets and categorize them
    const hopAssets = hop.assets || [];
    const inputAssets = hopAssets.filter(asset => asset.role === 'input');
    const outputAssets = hopAssets.filter(asset => asset.role === 'output');
    const intermediateAssets = hopAssets.filter(asset => asset.role === 'intermediate');

    // Show asset details for planning and implementation states
    const showAssetDetails = [
        HopStatus.HOP_PLAN_PROPOSED,
        HopStatus.HOP_PLAN_READY,
        HopStatus.HOP_IMPL_PROPOSED,
        HopStatus.HOP_IMPL_READY
    ].includes(hop.status);

    // Show tool steps for implementation and execution states
    const showToolSteps = [
        HopStatus.HOP_IMPL_PROPOSED,
        HopStatus.HOP_IMPL_READY,
        HopStatus.EXECUTING,
        HopStatus.COMPLETED
    ].includes(hop.status);

    const isProposedState = hop.status === HopStatus.HOP_PLAN_PROPOSED;
    const isReadyState = hop.status === HopStatus.HOP_PLAN_READY;
    // const isImplementationProposed = hop.status === HopStatus.HOP_IMPL_PROPOSED;
    const isImplementationReady = hop.status === HopStatus.HOP_IMPL_READY;
    const isSubtleDisplay = isReadyState || isImplementationReady;

    return (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        Current Hop: {hop.name}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                        {hop.description || 'No description provided'}
                    </p>
                </div>
                <div className={getStatusBadgeClass(hopStatus.color)}>
                    {hopStatus.icon}
                    <span>{hopStatus.text}</span>
                </div>
            </div>

            {hop.goal && (
                <div className="mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Goal</h4>
                    <p className="text-gray-600 dark:text-gray-400">{hop.goal}</p>
                </div>
            )}

            {hop.success_criteria && hop.success_criteria.length > 0 && (
                <div className="mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Success Criteria</h4>
                    <ul className="list-disc pl-5 text-gray-600 dark:text-gray-400">
                        {hop.success_criteria.map((criteria, idx) => (
                            <li key={idx}>{criteria}</li>
                        ))}
                    </ul>
                </div>
            )}

            {hop.rationale && isProposedState && (
                <div className="mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Rationale</h4>
                    <p className="text-gray-600 dark:text-gray-400">{hop.rationale}</p>
                </div>
            )}

            {showAssetDetails && (
                <>
                    <AssetSection title="Input Assets" assets={inputAssets} isSubtle={isSubtleDisplay} />
                    <AssetSection title="Output Assets" assets={outputAssets} isSubtle={isSubtleDisplay} />
                    <AssetSection title="Intermediate Assets" assets={intermediateAssets} isSubtle={isSubtleDisplay} />
                </>
            )}

            {showToolSteps && hop.tool_steps && hop.tool_steps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                        Implementation Plan ({hop.tool_steps.length} steps)
                    </h4>
                    <ToolStepSection
                        toolSteps={hop.tool_steps}
                        canCollapse={true}
                    />
                </div>
            )}
        </div>
    );
};

export default HopSection; 