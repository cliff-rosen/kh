import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Plus, Edit2, Trash2, X, Copy, Settings } from 'lucide-react';
import { useQuickActions, QuickAction, CreateQuickActionRequest, UpdateQuickActionRequest } from '@/lib/hooks/useQuickActions';

interface QuickActionManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditMode = 'none' | 'create' | 'edit';

export function QuickActionManagementModal({
  open,
  onOpenChange
}: QuickActionManagementModalProps) {
  const {
    actions,
    loading,
    error,
    createAction,
    updateAction,
    deleteAction,
    duplicateAction,
    refreshActions
  } = useQuickActions();

  // UI state
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null);
  const [actionForm, setActionForm] = useState({
    name: '',
    prompt: '',
    description: ''
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      refreshActions();
      resetForm();
    }
  }, [open, refreshActions]);

  const resetForm = () => {
    setEditMode('none');
    setEditingAction(null);
    setActionForm({
      name: '',
      prompt: '',
      description: ''
    });
  };

  const startCreateAction = () => {
    resetForm();
    setEditMode('create');
  };

  const startEditAction = (action: QuickAction) => {
    setEditMode('edit');
    setEditingAction(action);
    setActionForm({
      name: action.name,
      prompt: action.prompt,
      description: action.description || ''
    });
  };

  const handleSaveAction = async () => {
    if (!actionForm.name.trim() || !actionForm.prompt.trim()) return;

    try {
      if (editMode === 'create') {
        const request: CreateQuickActionRequest = {
          name: actionForm.name,
          prompt: actionForm.prompt,
          description: actionForm.description || undefined
        };
        await createAction(request);
      } else if (editMode === 'edit' && editingAction) {
        const request: UpdateQuickActionRequest = {
          name: actionForm.name,
          prompt: actionForm.prompt,
          description: actionForm.description || undefined
        };
        await updateAction(editingAction.id, request);
      }
      resetForm();
    } catch (error) {
      console.error('Failed to save action:', error);
    }
  };

  const handleDeleteAction = async (action: QuickAction) => {
    if (window.confirm(`Delete quick action "${action.name}"?`)) {
      await deleteAction(action.id);
    }
  };

  const handleDuplicateAction = async (action: QuickAction) => {
    const newName = window.prompt('New action name:', `Copy of ${action.name}`);
    if (newName && newName.trim()) {
      await duplicateAction(action.id, newName);
    }
  };

  // Organize actions: user-created vs system
  const userActions = actions.filter(a => a.scope === 'user');
  const systemActions = actions.filter(a => a.scope === 'global');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage Quick Actions
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create, edit, and manage your chat quick actions
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {editMode === 'none' ? (
            // List view
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  System actions can be edited by any user. Only your own actions can be deleted.
                </div>
                <Button onClick={startCreateAction} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Action
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading actions...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-600 dark:text-red-400">Error: {error}</div>
              ) : (
                <div className="space-y-6">
                  {/* User created actions */}
                  {userActions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">Your Custom Actions</h3>
                      <div className="grid gap-3">
                        {userActions.map((action) => (
                          <Card key={action.id} className="p-4 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{action.name}</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 break-words">
                                  {action.prompt}
                                </p>
                                {action.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    {action.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicateAction(action)}
                                  title="Duplicate action"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditAction(action)}
                                  title="Edit action"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAction(action)}
                                  title="Delete action"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* System actions - editable */}
                  {systemActions.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">System Actions (Editable)</h3>
                      <div className="grid gap-3">
                        {systemActions.map((action) => (
                          <Card key={action.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{action.name}</h4>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 break-words">
                                  {action.prompt}
                                </p>
                                {action.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    {action.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicateAction(action)}
                                  title="Duplicate action"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditAction(action)}
                                  title="Edit system action"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {/* No delete button for system actions */}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Create/Edit form
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {editMode === 'create' ? 'Create New Action' : 'Edit Action'}
                </h3>
                <Button variant="ghost" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Action form */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="action-name">Name *</Label>
                  <Input
                    id="action-name"
                    value={actionForm.name}
                    onChange={(e) => setActionForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter action name (e.g., Key Findings)"
                  />
                </div>

                <div>
                  <Label htmlFor="action-prompt">Prompt *</Label>
                  <Textarea
                    id="action-prompt"
                    value={actionForm.prompt}
                    onChange={(e) => setActionForm(prev => ({ ...prev, prompt: e.target.value }))}
                    placeholder="Enter the question or prompt to send (e.g., What are the key findings?)"
                    className="h-32"
                  />
                </div>

                <div>
                  <Label htmlFor="action-description">Description</Label>
                  <Textarea
                    id="action-description"
                    value={actionForm.description}
                    onChange={(e) => setActionForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description for this action"
                    className="h-20"
                  />
                </div>
              </div>

              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveAction}
                  disabled={!actionForm.name.trim() || !actionForm.prompt.trim()}
                >
                  {editMode === 'create' ? 'Create Action' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}