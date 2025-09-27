/**
 * Hook for managing quick actions
 * Provides CRUD operations and caching for quick actions
 */

import { useState, useEffect, useCallback } from 'react';
import { workbenchApi, QuickAction } from '../api/workbenchApi';

export type { QuickAction };

export interface CreateQuickActionRequest {
  name: string;
  prompt: string;
  description?: string;
  position?: number;
}

export interface UpdateQuickActionRequest {
  name?: string;
  prompt?: string;
  description?: string;
  position?: number;
}

export interface UseQuickActionsReturn {
  // Data
  actions: QuickAction[];
  loading: boolean;
  error: string | null;
  
  // Actions
  createAction: (action: CreateQuickActionRequest) => Promise<QuickAction | null>;
  updateAction: (id: string, action: UpdateQuickActionRequest) => Promise<QuickAction | null>;
  deleteAction: (id: string) => Promise<boolean>;
  duplicateAction: (id: string, newName?: string) => Promise<QuickAction | null>;
  refreshActions: () => Promise<void>;
}

export function useQuickActions(): UseQuickActionsReturn {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshActions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await workbenchApi.getQuickActions();
      setActions(response.actions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch quick actions';
      setError(errorMessage);
      console.error('Error fetching quick actions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createAction = useCallback(async (request: CreateQuickActionRequest): Promise<QuickAction | null> => {
    try {
      const newAction = await workbenchApi.createQuickAction(request);
      await refreshActions(); // Refresh the list
      return newAction;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create quick action';
      setError(errorMessage);
      console.error('Error creating quick action:', err);
      return null;
    }
  }, [refreshActions]);

  const updateAction = useCallback(async (id: string, request: UpdateQuickActionRequest): Promise<QuickAction | null> => {
    try {
      const updatedAction = await workbenchApi.updateQuickAction(id, request);
      await refreshActions(); // Refresh the list
      return updatedAction;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update quick action';
      setError(errorMessage);
      console.error('Error updating quick action:', err);
      return null;
    }
  }, [refreshActions]);

  const deleteAction = useCallback(async (id: string): Promise<boolean> => {
    try {
      await workbenchApi.deleteQuickAction(id);
      await refreshActions(); // Refresh the list
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete quick action';
      setError(errorMessage);
      console.error('Error deleting quick action:', err);
      return false;
    }
  }, [refreshActions]);

  const duplicateAction = useCallback(async (id: string, newName?: string): Promise<QuickAction | null> => {
    try {
      const duplicatedAction = await workbenchApi.duplicateQuickAction(id, newName);
      await refreshActions(); // Refresh the list
      return duplicatedAction;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to duplicate quick action';
      setError(errorMessage);
      console.error('Error duplicating quick action:', err);
      return null;
    }
  }, [refreshActions]);

  // Fetch actions on mount
  useEffect(() => {
    refreshActions();
  }, [refreshActions]);

  return {
    actions,
    loading,
    error,
    createAction,
    updateAction,
    deleteAction,
    duplicateAction,
    refreshActions,
  };
}