/**
 * Asset Mapping Utilities
 * 
 * This module provides utilities for working with the new asset mapping system
 * where assets are referenced by ID and role rather than stored directly.
 */

import { Asset, AssetRole, AssetMapSummary } from '@/types/asset';
import { Mission, Hop } from '@/types/workflow';
import { assetApi } from '@/lib/api/assetApi';

/**
 * Get assets by role from an asset mapping
 */
export async function getAssetsByRole(
    assetMap: AssetMapSummary,
    role: AssetRole,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    const assets: Asset[] = [];

    for (const [assetId, assetRole] of Object.entries(assetMap)) {
        if (assetRole === role) {
            try {
                let asset: Asset;
                if (assetCache && assetCache.has(assetId)) {
                    asset = assetCache.get(assetId)!;
                } else {
                    asset = await assetApi.getAsset(assetId);
                    if (assetCache) {
                        assetCache.set(assetId, asset);
                    }
                }
                assets.push(asset);
            } catch (error) {
                console.warn(`Failed to load asset ${assetId}:`, error);
            }
        }
    }

    return assets;
}

/**
 * Get a specific asset by ID
 */
export async function getAssetById(
    assetId: string,
    assetCache?: Map<string, Asset>
): Promise<Asset | null> {
    try {
        if (assetCache && assetCache.has(assetId)) {
            return assetCache.get(assetId)!;
        }

        const asset = await assetApi.getAsset(assetId);
        if (assetCache) {
            assetCache.set(assetId, asset);
        }
        return asset;
    } catch (error) {
        console.warn(`Failed to load asset ${assetId}:`, error);
        return null;
    }
}

/**
 * Convert asset mapping to legacy format (name -> Asset)
 * This is used for backward compatibility with components that expect the old format
 */
export async function convertAssetMapToLegacyFormat(
    assetMap: AssetMapSummary,
    assetCache?: Map<string, Asset>
): Promise<Record<string, Asset>> {
    const legacyFormat: Record<string, Asset> = {};

    for (const [assetId, _role] of Object.entries(assetMap)) {
        try {
            let asset: Asset;
            if (assetCache && assetCache.has(assetId)) {
                asset = assetCache.get(assetId)!;
            } else {
                asset = await assetApi.getAsset(assetId);
                if (assetCache) {
                    assetCache.set(assetId, asset);
                }
            }
            // Use asset name as key for legacy compatibility
            legacyFormat[asset.name] = asset;
        } catch (error) {
            console.warn(`Failed to load asset ${assetId} for legacy format:`, error);
        }
    }

    return legacyFormat;
}

/**
 * Get input assets for a mission
 */
export async function getMissionInputAssets(
    mission: Mission,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    return getAssetsByRole(mission.mission_asset_map, AssetRole.INPUT, assetCache);
}

/**
 * Get output assets for a mission
 */
export async function getMissionOutputAssets(
    mission: Mission,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    return getAssetsByRole(mission.mission_asset_map, AssetRole.OUTPUT, assetCache);
}

/**
 * Get input assets for a hop
 */
export async function getHopInputAssets(
    hop: Hop,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    return getAssetsByRole(hop.hop_asset_map, AssetRole.INPUT, assetCache);
}

/**
 * Get output assets for a hop
 */
export async function getHopOutputAssets(
    hop: Hop,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    return getAssetsByRole(hop.hop_asset_map, AssetRole.OUTPUT, assetCache);
}

/**
 * Get intermediate assets for a hop
 */
export async function getHopIntermediateAssets(
    hop: Hop,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    return getAssetsByRole(hop.hop_asset_map, AssetRole.INTERMEDIATE, assetCache);
}

/**
 * Get all assets for a mission or hop
 */
export async function getAllAssets(
    assetMap: AssetMapSummary,
    assetCache?: Map<string, Asset>
): Promise<Asset[]> {
    const assets: Asset[] = [];

    for (const assetId of Object.keys(assetMap)) {
        try {
            let asset: Asset;
            if (assetCache && assetCache.has(assetId)) {
                asset = assetCache.get(assetId)!;
            } else {
                asset = await assetApi.getAsset(assetId);
                if (assetCache) {
                    assetCache.set(assetId, asset);
                }
            }
            assets.push(asset);
        } catch (error) {
            console.warn(`Failed to load asset ${assetId}:`, error);
        }
    }

    return assets;
}

/**
 * Find asset by name within an asset mapping
 */
export async function findAssetByName(
    assetMap: AssetMapSummary,
    name: string,
    assetCache?: Map<string, Asset>
): Promise<Asset | null> {
    const assets = await getAllAssets(assetMap, assetCache);
    return assets.find(asset => asset.name === name) || null;
}

/**
 * Check if asset mapping has assets of a specific role
 */
export function hasAssetsOfRole(assetMap: AssetMapSummary, role: AssetRole): boolean {
    return Object.values(assetMap).some(assetRole => assetRole === role);
}

/**
 * Get asset IDs by role
 */
export function getAssetIdsByRole(assetMap: AssetMapSummary, role: AssetRole): string[] {
    return Object.entries(assetMap)
        .filter(([_, assetRole]) => assetRole === role)
        .map(([assetId, _]) => assetId);
}

/**
 * Create a sanitized version of asset mapping for API calls
 */
export function sanitizeAssetMapping(assetMap: AssetMapSummary): AssetMapSummary {
    // For now, just return as-is since AssetMapSummary is already clean
    // This could be extended to filter out invalid entries, etc.
    return { ...assetMap };
} 