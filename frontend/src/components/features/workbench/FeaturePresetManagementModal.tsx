import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Check, X, Copy, Settings } from 'lucide-react';
import { FeatureDefinition } from '@/types/workbench';
import { useFeaturePresets, FeaturePreset } from '@/lib/hooks/useFeaturePresets';
import { generatePrefixedUUID } from '@/lib/utils/uuid';
import { useToast } from '@/components/ui/use-toast';

interface FeaturePresetManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditMode = 'none' | 'create' | 'edit';

export function FeaturePresetManagementModal({
  open,
  onOpenChange
}: FeaturePresetManagementModalProps) {
  const {
    presets,
    loading,
    error,
    createPreset,
    updatePreset,
    deletePreset,
    duplicatePreset,
    refreshPresets
  } = useFeaturePresets();
  
  const { toast } = useToast();

  // UI state
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [editingPreset, setEditingPreset] = useState<FeaturePreset | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: '',
    description: '',
    category: '',
    features: [] as FeatureDefinition[]
  });

  // Feature editing state
  const [editingFeatureIndex, setEditingFeatureIndex] = useState<number | null>(null);
  const [featureForm, setFeatureForm] = useState<FeatureDefinition>({
    id: '',
    name: '',
    description: '',
    type: 'text' as const
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      refreshPresets();
      resetForm();
    }
  }, [open, refreshPresets]);

  const resetForm = () => {
    setEditMode('none');
    setEditingPreset(null);
    setPresetForm({
      name: '',
      description: '',
      category: '',
      features: []
    });
    setEditingFeatureIndex(null);
    setFeatureForm({
      id: '',
      name: '',
      description: '',
      type: 'text'
    });
  };

  const startCreatePreset = () => {
    resetForm();
    setEditMode('create');
    setPresetForm({
      name: '',
      description: '',
      category: '',
      features: []
    });
  };

  const startEditPreset = (preset: FeaturePreset) => {
    setEditMode('edit');
    setEditingPreset(preset);
    setPresetForm({
      name: preset.name,
      description: preset.description || '',
      category: preset.category || '',
      features: [...preset.features]
    });
  };

  const handleSavePreset = async () => {
    if (!presetForm.name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for the preset',
        variant: 'destructive'
      });
      return;
    }

    if (presetForm.features.length === 0) {
      toast({
        title: 'Features Required',
        description: 'Please add at least one feature to the preset',
        variant: 'destructive'
      });
      return;
    }

    try {
      console.log('Saving preset:', presetForm);
      
      if (editMode === 'create') {
        // Ensure all features have proper structure
        const featuresWithDefaults = presetForm.features.map(f => ({
          id: f.id,
          name: f.name,
          description: f.description,
          type: f.type,
          options: f.options || undefined
        }));
        
        const result = await createPreset({
          name: presetForm.name,
          description: presetForm.description || '',
          category: presetForm.category || '',
          features: featuresWithDefaults
        });
        console.log('Create result:', result);
        
        if (result) {
          toast({
            title: 'Preset Created',
            description: `Successfully created preset "${presetForm.name}"`,
          });
          resetForm();
        }
      } else if (editMode === 'edit' && editingPreset) {
        // Ensure all features have proper structure
        const featuresWithDefaults = presetForm.features.map(f => ({
          id: f.id,
          name: f.name,
          description: f.description,
          type: f.type,
          options: f.options || undefined
        }));
        
        const result = await updatePreset(editingPreset.id, {
          name: presetForm.name,
          description: presetForm.description || '',
          category: presetForm.category || '',
          features: featuresWithDefaults
        });
        console.log('Update result:', result);
        
        if (result) {
          toast({
            title: 'Preset Updated',
            description: `Successfully updated preset "${presetForm.name}"`,
          });
          resetForm();
        }
      }
    } catch (error) {
      console.error('Failed to save preset:', error);
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save preset',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePreset = async (preset: FeaturePreset) => {
    if (window.confirm(`Delete preset "${preset.name}"?`)) {
      try {
        const success = await deletePreset(preset.id);
        if (success) {
          toast({
            title: 'Preset Deleted',
            description: `Successfully deleted preset "${preset.name}"`,
          });
        }
      } catch (error) {
        toast({
          title: 'Delete Failed',
          description: error instanceof Error ? error.message : 'Failed to delete preset',
          variant: 'destructive'
        });
      }
    }
  };

  const handleDuplicatePreset = async (preset: FeaturePreset) => {
    const newName = window.prompt('New preset name:', `Copy of ${preset.name}`);
    if (newName && newName.trim()) {
      try {
        const duplicated = await duplicatePreset(preset.id, newName);
        if (duplicated) {
          toast({
            title: 'Preset Duplicated',
            description: `Successfully created "${newName}" from "${preset.name}"`,
          });
        }
      } catch (error) {
        toast({
          title: 'Duplicate Failed',
          description: error instanceof Error ? error.message : 'Failed to duplicate preset',
          variant: 'destructive'
        });
      }
    }
  };

  // Feature management within preset
  const startAddFeature = () => {
    setEditingFeatureIndex(-1); // -1 indicates new feature
    setFeatureForm({
      id: generatePrefixedUUID('feat'),
      name: '',
      description: '',
      type: 'text'
    });
  };

  const startEditFeature = (index: number) => {
    setEditingFeatureIndex(index);
    setFeatureForm({ ...presetForm.features[index] });
  };

  const handleSaveFeature = () => {
    if (!featureForm.name.trim() || !featureForm.description.trim()) {
      toast({
        title: 'Feature Incomplete',
        description: 'Please provide both name and description for the feature',
        variant: 'destructive'
      });
      return;
    }

    const updatedFeatures = [...presetForm.features];
    
    if (editingFeatureIndex === -1) {
      // Adding new feature - ensure it has an ID
      const newFeature = {
        ...featureForm,
        id: featureForm.id || generatePrefixedUUID('feat')
      };
      updatedFeatures.push(newFeature);
    } else if (editingFeatureIndex !== null) {
      // Editing existing feature
      updatedFeatures[editingFeatureIndex] = featureForm;
    }

    setPresetForm(prev => ({ ...prev, features: updatedFeatures }));
    setEditingFeatureIndex(null);
    setFeatureForm({
      id: generatePrefixedUUID('feat'),
      name: '',
      description: '',
      type: 'text'
    });
  };

  const handleDeleteFeature = (index: number) => {
    const updatedFeatures = presetForm.features.filter((_, i) => i !== index);
    setPresetForm(prev => ({ ...prev, features: updatedFeatures }));
  };

  const cancelFeatureEdit = () => {
    setEditingFeatureIndex(null);
    setFeatureForm({
      id: generatePrefixedUUID('feat'),
      name: '',
      description: '',
      type: 'text'
    });
  };

  // Organize presets: all presets are now editable
  const userCreatedPresets = presets.filter(p => 
    !['Core Analysis', 'Medical Research', 'Pharmaceutical', 'Basic Science'].includes(p.category || '')
  );
  
  const systemPresets = presets.filter(p => 
    ['Core Analysis', 'Medical Research', 'Pharmaceutical', 'Basic Science'].includes(p.category || '')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage Feature Presets
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create, edit, and manage your feature extraction presets
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {editMode === 'none' ? (
            // List view
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  All presets are editable. System presets can be modified by any user.
                </div>
                <Button onClick={startCreatePreset} className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Preset
                </Button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading presets...</div>
              ) : error ? (
                <div className="text-center py-8 text-red-600 dark:text-red-400">Error: {error}</div>
              ) : (
                <div className="space-y-6">
                  {/* User created presets */}
                  {userCreatedPresets.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">Your Custom Presets</h3>
                      <div className="grid gap-3">
                        {userCreatedPresets.map((preset) => (
                          <Card key={preset.id} className="p-4 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{preset.name}</h4>
                                {preset.description && (
                                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    {preset.description}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  {preset.features.length} features
                                  {preset.category && ` • ${preset.category}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicatePreset(preset)}
                                  title="Duplicate preset"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditPreset(preset)}
                                  title="Edit preset"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeletePreset(preset)}
                                  title="Delete preset"
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

                  {/* System presets - now editable */}
                  {systemPresets.length > 0 && (
                    <div>
                      <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">System Presets (Editable)</h3>
                      <div className="grid gap-3">
                        {systemPresets.map((preset) => (
                          <Card key={preset.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{preset.name}</h4>
                                {preset.description && (
                                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    {preset.description}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  {preset.features.length} features • {preset.category}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDuplicatePreset(preset)}
                                  title="Duplicate preset"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEditPreset(preset)}
                                  title="Edit system preset"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {/* No delete button for system presets */}
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
                  {editMode === 'create' ? 'Create New Preset' : 'Edit Preset'}
                </h3>
                <Button variant="ghost" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Preset metadata form */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="preset-name">Name *</Label>
                  <Input
                    id="preset-name"
                    value={presetForm.name}
                    onChange={(e) => setPresetForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter preset name"
                  />
                </div>
                <div>
                  <Label htmlFor="preset-category">Category</Label>
                  <Input
                    id="preset-category"
                    value={presetForm.category}
                    onChange={(e) => setPresetForm(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="e.g., Medical Research"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="preset-description">Description</Label>
                <Textarea
                  id="preset-description"
                  value={presetForm.description}
                  onChange={(e) => setPresetForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this preset is used for"
                  className="h-20"
                />
              </div>

              {/* Features section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Features ({presetForm.features.length})</h4>
                  <Button onClick={startAddFeature} size="sm" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Feature
                  </Button>
                </div>

                {/* Feature list */}
                <div className="space-y-2">
                  {presetForm.features.map((feature, index) => (
                    <Card key={feature.id} className="p-3 bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600">
                      {editingFeatureIndex === index ? (
                        // Edit form for this feature
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>Name *</Label>
                              <Input
                                value={featureForm.name}
                                onChange={(e) => setFeatureForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Feature name"
                              />
                            </div>
                            <div>
                              <Label>Type</Label>
                              <Select
                                value={featureForm.type}
                                onValueChange={(value: 'boolean' | 'text' | 'score') =>
                                  setFeatureForm(prev => ({ ...prev, type: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="boolean">Boolean</SelectItem>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="score">Score</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div>
                            <Label>Description *</Label>
                            <Textarea
                              value={featureForm.description}
                              onChange={(e) => setFeatureForm(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Describe what to extract"
                              className="h-20"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleSaveFeature} size="sm">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button onClick={cancelFeatureEdit} variant="ghost" size="sm">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Display view
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-gray-100">{feature.name}</span>
                              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                                {feature.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                              {feature.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditFeature(index)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteFeature(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}

                  {/* Add new feature form */}
                  {editingFeatureIndex === -1 && (
                    <Card className="p-3 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Name *</Label>
                            <Input
                              value={featureForm.name}
                              onChange={(e) => setFeatureForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Feature name"
                            />
                          </div>
                          <div>
                            <Label>Type</Label>
                            <Select
                              value={featureForm.type}
                              onValueChange={(value: 'boolean' | 'text' | 'score') =>
                                setFeatureForm(prev => ({ ...prev, type: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="boolean">Boolean</SelectItem>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="score">Score</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label>Description *</Label>
                          <Textarea
                            value={featureForm.description}
                            onChange={(e) => setFeatureForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Describe what to extract"
                            className="h-20"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleSaveFeature} size="sm">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button onClick={cancelFeatureEdit} variant="ghost" size="sm">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>

              {/* Save/Cancel buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSavePreset}
                  disabled={!presetForm.name.trim()}
                >
                  {editMode === 'create' ? 'Create Preset' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}