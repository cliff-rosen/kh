import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { workbenchApi, FeaturePreset } from '@/lib/api/workbenchApi';
import { Plus, Edit2, Trash2, Check, X, Settings, RotateCcw } from 'lucide-react';
import { FeatureDefinition } from '@/types/workbench';
import { generatePrefixedUUID } from '@/lib/utils/uuid';

interface ManageCollectionFeaturesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentFeatures: FeatureDefinition[];
  selectedArticleCount?: number;
  totalArticleCount: number;
  onUpdateFeature: (featureId: string, updates: Partial<FeatureDefinition>) => void;
  onDeleteFeature: (featureId: string) => void;
  onAddFeatures: (features: FeatureDefinition[], extractImmediately: boolean) => void;
  onExtractFeatures: (featureIds: string[]) => void;
}

type AddMode = 'none' | 'preset' | 'custom';

export function ManageCollectionFeaturesModal({
  open,
  onOpenChange,
  currentFeatures,
  selectedArticleCount,
  totalArticleCount,
  onUpdateFeature,
  onDeleteFeature,
  onAddFeatures,
  onExtractFeatures
}: ManageCollectionFeaturesModalProps) {
  // State for editing existing features
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Partial<FeatureDefinition>>({});

  // State for adding new features
  const [addMode, setAddMode] = useState<AddMode>('none');
  const [presets, setPresets] = useState<FeaturePreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [selectedPresetFeatures, setSelectedPresetFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState<FeatureDefinition>({
    id: generatePrefixedUUID('feat'),
    name: '',
    description: '',
    type: 'text'
  });

  // State for extraction
  const [selectedForExtraction, setSelectedForExtraction] = useState<string[]>([]);
  const [extractOnAdd, setExtractOnAdd] = useState(true);

  // Load presets when modal opens
  useEffect(() => {
    if (open) {
      loadPresets();
      // Initialize extraction selection with all features
      setSelectedForExtraction(currentFeatures.map(f => f.id));
      // Reset states
      setAddMode('none');
      setEditingFeature(null);
      setSelectedPreset('');
      setSelectedPresetFeatures([]);
      setCustomFeature({
        id: generatePrefixedUUID('feat'),
        name: '',
        description: '',
        type: 'text'
      });
    }
  }, [open, currentFeatures]);

  const loadPresets = async () => {
    try {
      const response = await workbenchApi.getFeaturePresets();
      setPresets(response.presets || []);
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  };

  // Get features from selected preset that aren't already in collection
  const getAvailablePresetFeatures = (): FeatureDefinition[] => {
    if (!selectedPreset) return [];

    const preset = presets.find(p => p.id === selectedPreset);
    if (!preset) return [];

    const existingNames = new Set(currentFeatures.map(f => f.name.toLowerCase()));
    return preset.features.filter(f => !existingNames.has(f.name.toLowerCase()));
  };

  // Handle editing existing features
  const startEditingFeature = (feature: FeatureDefinition) => {
    setEditingFeature(feature.id);
    setEditedValues({
      name: feature.name,
      description: feature.description,
      type: feature.type,
      options: feature.options
    });
  };

  const saveFeatureEdit = () => {
    if (editingFeature && editedValues) {
      onUpdateFeature(editingFeature, editedValues);
      setEditingFeature(null);
      setEditedValues({});
    }
  };

  const cancelFeatureEdit = () => {
    setEditingFeature(null);
    setEditedValues({});
  };

  // Handle adding new features
  const handleAddCustomFeature = () => {
    if (customFeature.name.trim() && customFeature.description.trim()) {
      onAddFeatures([customFeature], extractOnAdd);
      // Keep the form open and reset for next feature
      setCustomFeature({
        id: generatePrefixedUUID('feat'),
        name: '',
        description: '',
        type: 'text'
      });
      // Don't close the form - let user continue adding or manually close
      // setAddMode('none'); // REMOVED - keeps form open
    }
  };

  const handleAddPresetFeatures = () => {
    const preset = presets.find(p => p.id === selectedPreset);
    if (!preset) return;

    const featuresToAdd = preset.features.filter(f =>
      selectedPresetFeatures.includes(f.id)
    );

    if (featuresToAdd.length > 0) {
      onAddFeatures(featuresToAdd, extractOnAdd);
      setSelectedPresetFeatures([]);
      setSelectedPreset('');
      setAddMode('none');
    }
  };

  // Handle extraction
  const handleExtractSelected = () => {
    if (selectedForExtraction.length > 0) {
      onExtractFeatures(selectedForExtraction);
      onOpenChange(false);
    }
  };

  const toggleExtractionSelection = (featureId: string) => {
    setSelectedForExtraction(prev =>
      prev.includes(featureId)
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const selectAllForExtraction = () => {
    setSelectedForExtraction(currentFeatures.map(f => f.id));
  };

  const selectNoneForExtraction = () => {
    setSelectedForExtraction([]);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] h-[85vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xl font-semibold">
            Feature Management
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage features, select which to extract, and target articles
          </p>
        </DialogHeader>

        {/* Selection Context Banner */}
        <div className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${selectedArticleCount && selectedArticleCount > 0 ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  Target Scope:
                </span>
              </div>
              <div className="text-gray-700 dark:text-gray-300">
                {selectedArticleCount && selectedArticleCount > 0 ? (
                  <span>
                    <strong className="text-orange-600 dark:text-orange-400">{selectedArticleCount} selected articles</strong>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      (out of {totalArticleCount} total)
                    </span>
                  </span>
                ) : (
                  <span>
                    <strong className="text-blue-600 dark:text-blue-400">All {totalArticleCount} articles</strong>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      (entire collection)
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {selectedArticleCount && selectedArticleCount > 0 
                ? 'Operations will only affect selected articles' 
                : 'Operations will affect the entire collection'
              }
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Current Features Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Current Features ({currentFeatures.length})
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllForExtraction}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectNoneForExtraction}
                >
                  Select None
                </Button>
              </div>
            </div>

            {currentFeatures.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  No features defined yet. Add features below to start extracting data.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {currentFeatures.map(feature => (
                  <Card key={feature.id} className="p-4">
                    {editingFeature === feature.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor={`edit-name-${feature.id}`}>Name</Label>
                            <Input
                              id={`edit-name-${feature.id}`}
                              value={editedValues.name || ''}
                              onChange={(e) => setEditedValues({ ...editedValues, name: e.target.value })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`edit-type-${feature.id}`}>Type</Label>
                            <select
                              id={`edit-type-${feature.id}`}
                              value={editedValues.type || 'text'}
                              onChange={(e) => setEditedValues({ ...editedValues, type: e.target.value as 'text' | 'boolean' | 'score' })}
                              className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700"
                            >
                              <option value="text">Text</option>
                              <option value="boolean">Yes/No</option>
                              <option value="score">Score</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`edit-desc-${feature.id}`}>Description</Label>
                          <Textarea
                            id={`edit-desc-${feature.id}`}
                            value={editedValues.description || ''}
                            onChange={(e) => setEditedValues({ ...editedValues, description: e.target.value })}
                            className="mt-1"
                            rows={2}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={cancelFeatureEdit}>
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveFeatureEdit}>
                            <Check className="w-4 h-4 mr-1" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedForExtraction.includes(feature.id)}
                          onCheckedChange={() => toggleExtractionSelection(feature.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {feature.name}
                            </h4>
                            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                              {feature.type === 'boolean' ? 'Yes/No' :
                                feature.type === 'score' ? 'Score' : 'Text'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {feature.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => startEditingFeature(feature)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteFeature(feature.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Add New Features Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Add New Features
            </h3>

            {addMode === 'none' ? (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setAddMode('preset')}
                  className="flex-1"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Add from Preset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddMode('custom');
                    // Reset custom feature form with new ID
                    setCustomFeature({
                      id: generatePrefixedUUID('feat'),
                      name: '',
                      description: '',
                      type: 'text'
                    });
                  }}
                  className="flex-1"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Feature
                </Button>
              </div>
            ) : addMode === 'preset' ? (
              <Card className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Add from Preset</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddMode('none')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <Label htmlFor="preset-select">Select Preset</Label>
                    <select
                      id="preset-select"
                      value={selectedPreset}
                      onChange={(e) => {
                        setSelectedPreset(e.target.value);
                        setSelectedPresetFeatures([]);
                      }}
                      className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700"
                    >
                      <option value="">Choose a preset...</option>
                      {presets.map(preset => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPreset && (
                    <div>
                      <div className="flex items-center justify-between">
                        <Label>Available Features</Label>
                        {getAvailablePresetFeatures().length > 0 && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPresetFeatures(getAvailablePresetFeatures().map(f => f.id))}
                            >
                              Select All
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPresetFeatures([])}
                            >
                              Select None
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                        {getAvailablePresetFeatures().length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            All features from this preset are already in your collection.
                          </p>
                        ) : (
                          getAvailablePresetFeatures().map(feature => (
                            <div key={feature.id} className="flex items-start gap-2 p-2 border rounded">
                              <Checkbox
                                checked={selectedPresetFeatures.includes(feature.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedPresetFeatures([...selectedPresetFeatures, feature.id]);
                                  } else {
                                    setSelectedPresetFeatures(selectedPresetFeatures.filter(id => id !== feature.id));
                                  }
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{feature.name}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  {feature.description}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={extractOnAdd}
                      onCheckedChange={(checked) => setExtractOnAdd(!!checked)}
                    />
                    <Label className="text-sm">Extract immediately after adding</Label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAddMode('none')}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddPresetFeatures}
                      disabled={selectedPresetFeatures.length === 0}
                    >
                      Add Selected ({selectedPresetFeatures.length})
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              // Custom Feature Mode
              <Card className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Add Custom Feature</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddMode('none')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="custom-name">Name</Label>
                      <Input
                        id="custom-name"
                        value={customFeature.name}
                        onChange={(e) => setCustomFeature({ ...customFeature, name: e.target.value })}
                        placeholder="e.g., Sample Size"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="custom-type">Type</Label>
                      <select
                        id="custom-type"
                        value={customFeature.type}
                        onChange={(e) => setCustomFeature({ ...customFeature, type: e.target.value as 'text' | 'boolean' | 'score' })}
                        className="mt-1 w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700"
                      >
                        <option value="text">Text</option>
                        <option value="boolean">Yes/No</option>
                        <option value="score">Score</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="custom-desc">Description</Label>
                    <Textarea
                      id="custom-desc"
                      value={customFeature.description}
                      onChange={(e) => setCustomFeature({ ...customFeature, description: e.target.value })}
                      placeholder="Describe what the LLM should extract..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={extractOnAdd}
                      onCheckedChange={(checked) => setExtractOnAdd(!!checked)}
                    />
                    <Label className="text-sm">Extract immediately after adding</Label>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAddMode('none')}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddCustomFeature}
                      disabled={!customFeature.name.trim() || !customFeature.description.trim()}
                    >
                      Add Feature
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selectedForExtraction.length} of {currentFeatures.length} features selected for extraction
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                onClick={handleExtractSelected}
                disabled={selectedForExtraction.length === 0}
                className="min-w-[140px]"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Extract Selected
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}