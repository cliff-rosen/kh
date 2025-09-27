/**
 * Hook for managing feature presets
 * Provides CRUD operations and caching for feature presets
 */

import { useState, useEffect, useCallback } from 'react';
import { workbenchApi } from '../api/workbenchApi';
import { FeatureDefinition } from '../../types/workbench';

export interface FeaturePreset {
  id: string;
  name: string;
  description: string;
  category?: string;
  features: FeatureDefinition[];
}

export interface UseFeaturePresetsReturn {
  // Data
  presets: FeaturePreset[];
  loading: boolean;
  error: string | null;
  
  // Actions
  createPreset: (preset: Omit<FeaturePreset, 'id'>) => Promise<FeaturePreset | null>;
  updatePreset: (id: string, preset: Omit<FeaturePreset, 'id'>) => Promise<FeaturePreset | null>;
  deletePreset: (id: string) => Promise<boolean>;
  duplicatePreset: (id: string, newName?: string) => Promise<FeaturePreset | null>;
  refreshPresets: () => Promise<void>;
}

export function useFeaturePresets(): UseFeaturePresetsReturn {
  const [presets, setPresets] = useState<FeaturePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load presets from API
  const loadPresets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await workbenchApi.getFeaturePresets();
      setPresets(response.presets);
    } catch (err) {
      console.error('Failed to load presets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create a new preset
  const createPreset = useCallback(async (preset: Omit<FeaturePreset, 'id'>): Promise<FeaturePreset | null> => {
    try {
      setError(null);
      const newPreset = await workbenchApi.createFeaturePreset(preset);
      
      // Add to local state
      setPresets(current => [...current, newPreset]);
      
      return newPreset;
    } catch (err) {
      console.error('Failed to create preset:', err);
      setError(err instanceof Error ? err.message : 'Failed to create preset');
      return null;
    }
  }, []);

  // Update an existing preset
  const updatePreset = useCallback(async (id: string, preset: Omit<FeaturePreset, 'id'>): Promise<FeaturePreset | null> => {
    try {
      setError(null);
      const updatedPreset = await workbenchApi.updateFeaturePreset(id, preset);
      
      // Update local state
      setPresets(current => 
        current.map(p => p.id === id ? updatedPreset : p)
      );
      
      return updatedPreset;
    } catch (err) {
      console.error('Failed to update preset:', err);
      setError(err instanceof Error ? err.message : 'Failed to update preset');
      return null;
    }
  }, []);

  // Delete a preset
  const deletePreset = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      await workbenchApi.deleteFeaturePreset(id);
      
      // Remove from local state
      setPresets(current => current.filter(p => p.id !== id));
      
      return true;
    } catch (err) {
      console.error('Failed to delete preset:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
      return false;
    }
  }, []);

  // Duplicate a preset
  const duplicatePreset = useCallback(async (id: string, newName?: string): Promise<FeaturePreset | null> => {
    try {
      setError(null);
      const duplicatedPreset = await workbenchApi.duplicateFeaturePreset(id, newName);
      
      // Add to local state
      setPresets(current => [...current, duplicatedPreset]);
      
      return duplicatedPreset;
    } catch (err) {
      console.error('Failed to duplicate preset:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate preset');
      return null;
    }
  }, []);

  // Refresh presets (alias for loadPresets)
  const refreshPresets = useCallback(async () => {
    await loadPresets();
  }, [loadPresets]);

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  return {
    // Data
    presets,
    loading,
    error,
    
    // Actions
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    refreshPresets
  };
}

// Helper hook for getting presets by category
export function useFeaturePresetsByCategory() {
  const { presets, ...rest } = useFeaturePresets();
  
  const presetsByCategory = presets.reduce((acc, preset) => {
    const category = preset.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(preset);
    return acc;
  }, {} as Record<string, FeaturePreset[]>);

  return {
    presets,
    presetsByCategory,
    ...rest
  };
}