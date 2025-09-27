import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Brain, ChevronDown, ChevronRight, Package, Info } from 'lucide-react';
import { FeatureDefinition } from '@/types/workbench';
import { FeaturePreset } from '@/lib/api/workbenchApi';
import { generatePrefixedUUID } from '@/lib/utils/uuid';
import { useWorkbench } from '@/context/WorkbenchContext';
import { workbenchApi } from '@/lib/api/workbenchApi';

interface FeaturesTabProps {
  articleId: string;
  existingFeatures: Record<string, any>;
  collectionFeatures: FeatureDefinition[];
  collectionType: 'search' | 'group';
}

export function FeaturesTab({
  articleId,
  existingFeatures,
  collectionFeatures,
  collectionType
}: FeaturesTabProps) {
  const workbench = useWorkbench();
  const { toast } = useToast();

  // State for adding new features
  const [showAddFeature, setShowAddFeature] = useState(false);
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeatureDescription, setNewFeatureDescription] = useState('');
  const [newFeatureType, setNewFeatureType] = useState<'text' | 'boolean' | 'score'>('text');
  const [scoreMin, setScoreMin] = useState(1);
  const [scoreMax, setScoreMax] = useState(10);
  const [scoreStep, setScoreStep] = useState(1);
  const [isExtracting, setIsExtracting] = useState(false);

  // State for extracting existing features
  const [selectedFeaturesToExtract, setSelectedFeaturesToExtract] = useState<string[]>([]);

  // State for presets
  const [presets, setPresets] = useState<FeaturePreset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [selectedPresetFeatures, setSelectedPresetFeatures] = useState<string[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [addFeatureTab, setAddFeatureTab] = useState<'custom' | 'preset'>('custom');
  
  // State for expanding feature descriptions
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const toggleFeatureExpansion = (featureId: string) => {
    setExpandedFeatures(prev => {
      const newSet = new Set(prev);
      if (newSet.has(featureId)) {
        newSet.delete(featureId);
      } else {
        newSet.add(featureId);
      }
      return newSet;
    });
  };

  // Get features that haven't been extracted yet for this article
  const unextractedFeatures = collectionFeatures.filter(
    feature => !existingFeatures.hasOwnProperty(feature.id)
  );

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    setPresetsLoading(true);
    try {
      const response = await workbenchApi.getFeaturePresets();
      setPresets(response.presets || []);
    } catch (error) {
      console.error('Failed to load presets:', error);
      toast({
        title: 'Failed to load presets',
        description: 'Could not load feature presets',
        variant: 'destructive',
      });
    } finally {
      setPresetsLoading(false);
    }
  };

  const handleAddPresetsAndExtract = async () => {
    if (!selectedPreset || selectedPresetFeatures.length === 0) {
      toast({
        title: 'No Features Selected',
        description: 'Please select features from the preset to add.',
        variant: 'destructive',
      });
      return;
    }

    const preset = presets.find(p => p.id === selectedPreset);
    if (!preset) return;

    setIsExtracting(true);
    try {
      // Get the selected features from the preset
      const featuresFromPreset = preset.features.filter(f =>
        selectedPresetFeatures.includes(f.id)
      );

      // Add the features and extract them for this article
      await workbench.addFeaturesAndExtract(
        featuresFromPreset,
        collectionType,
        [articleId]
      );

      // Reset preset selection
      setSelectedPreset('');
      setSelectedPresetFeatures([]);
      setShowAddFeature(false);

      toast({
        title: 'Features Added',
        description: `Added and extracted ${featuresFromPreset.length} features from preset.`,
      });
    } catch (error) {
      console.error('Error adding preset features:', error);
      toast({
        title: 'Error',
        description: 'Failed to add and extract preset features',
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddAndExtractFeature = async () => {
    if (!newFeatureName.trim() || !newFeatureDescription.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide both a name and description for the feature.',
        variant: 'destructive',
      });
      return;
    }

    setIsExtracting(true);
    try {
      // Create the new feature definition
      const newFeature: FeatureDefinition = {
        id: generatePrefixedUUID('feat'),
        name: newFeatureName,
        description: newFeatureDescription,
        type: newFeatureType,
        options: newFeatureType === 'score'
          ? { min: scoreMin, max: scoreMax, step: scoreStep }
          : undefined
      };

      // Add the feature and extract it for this article
      await workbench.addFeaturesAndExtract(
        [newFeature],
        collectionType,
        [articleId]
      );

      // Reset form
      setNewFeatureName('');
      setNewFeatureDescription('');
      setNewFeatureType('text');
      setShowAddFeature(false);

      toast({
        title: 'Feature Added',
        description: `"${newFeature.name}" has been extracted and added.`,
      });
    } catch (error) {
      console.error('Error adding feature:', error);
      toast({
        title: 'Error',
        description: 'Failed to add and extract feature',
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtractSelectedFeatures = async () => {
    if (selectedFeaturesToExtract.length === 0) {
      toast({
        title: 'No Features Selected',
        description: 'Please select features to extract.',
        variant: 'destructive',
      });
      return;
    }

    setIsExtracting(true);
    try {
      // Extract selected features for this article
      await workbench.extractFeatureValues(
        selectedFeaturesToExtract,
        collectionType,
        [articleId]
      );

      setSelectedFeaturesToExtract([]);
      toast({
        title: 'Features Extracted',
        description: `Extracted ${selectedFeaturesToExtract.length} features for this article.`,
      });
    } catch (error) {
      console.error('Error extracting features:', error);
      toast({
        title: 'Error',
        description: 'Failed to extract features',
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleFeatureSelection = (featureId: string) => {
    setSelectedFeaturesToExtract(prev =>
      prev.includes(featureId)
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Current Features */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Extracted Features ({Object.keys(existingFeatures).length})
        </h3>

        {Object.keys(existingFeatures).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(existingFeatures).map(([featureId, value]) => {
              const feature = collectionFeatures.find(f => f.id === featureId);
              if (!feature) return null;
              
              const isExpanded = expandedFeatures.has(featureId);
              const displayValue = typeof value === 'object' && value.value ? value.value : String(value);

              return (
                <div key={featureId} className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="p-3">
                    {/* Compact single line display */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {feature.name}
                        </span>
                        {feature.type !== 'text' && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {feature.type}
                          </Badge>
                        )}
                        <button
                          onClick={() => toggleFeatureExpansion(featureId)}
                          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0"
                          title={isExpanded ? "Hide details" : "Show details"}
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="text-sm text-gray-900 dark:text-gray-100 font-medium text-right max-w-[40%] truncate">
                        {displayValue || <span className="italic text-gray-500">No value</span>}
                      </div>
                    </div>
                    
                    {/* Expandable description */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                          <span className="font-medium">Extraction Prompt:</span><br />
                          {feature.description}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No features have been extracted for this article yet.
          </p>
        )}
      </div>

      {/* Extract Existing Features */}
      {unextractedFeatures.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Available Features to Extract ({unextractedFeatures.length})
          </h3>

          <div className="space-y-2 mb-4">
            {unextractedFeatures.map(feature => {
              const isExpanded = expandedFeatures.has(feature.id);
              
              return (
                <div
                  key={feature.id}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="p-3">
                    {/* Compact single line display */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFeaturesToExtract.includes(feature.id)}
                        onChange={() => toggleFeatureSelection(feature.id)}
                        className="rounded border-gray-300 dark:border-gray-600 flex-shrink-0"
                      />
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {feature.name}
                        </span>
                        {feature.type !== 'text' && (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {feature.type}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleFeatureExpansion(feature.id);
                          }}
                          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex-shrink-0"
                          title={isExpanded ? "Hide details" : "Show details"}
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                    </label>
                    
                    {/* Expandable description */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 ml-8">
                        <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                          <span className="font-medium">Extraction Prompt:</span><br />
                          {feature.description}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            onClick={handleExtractSelectedFeatures}
            disabled={selectedFeaturesToExtract.length === 0 || isExtracting}
            className="w-full gap-2"
          >
            <Brain className="w-4 h-4" />
            {isExtracting ? 'Extracting...' : `Extract ${selectedFeaturesToExtract.length} Selected Features`}
          </Button>
        </div>
      )}

      {/* Add New Feature */}
      <div>
        <Button
          variant="outline"
          onClick={() => setShowAddFeature(!showAddFeature)}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add New Feature
          </span>
          {showAddFeature ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>

        {showAddFeature && (
          <div className="mt-4">
            <Tabs value={addFeatureTab} onValueChange={(v) => setAddFeatureTab(v as 'custom' | 'preset')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="custom">Custom Feature</TabsTrigger>
                <TabsTrigger value="preset" className="gap-1">
                  <Package className="w-4 h-4" />
                  From Preset
                </TabsTrigger>
              </TabsList>

              <TabsContent value="custom">
                <div className="mt-4 space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <Label htmlFor="feature-name">Feature Name</Label>
                    <Input
                      id="feature-name"
                      value={newFeatureName}
                      onChange={(e) => setNewFeatureName(e.target.value)}
                      placeholder="e.g., Sample Size"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="feature-type">Feature Type</Label>
                    <RadioGroup
                      value={newFeatureType}
                      onValueChange={(value) => setNewFeatureType(value as 'text' | 'boolean' | 'score')}
                      className="mt-2"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="text" id="type-text" />
                        <Label htmlFor="type-text">Text</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="boolean" id="type-boolean" />
                        <Label htmlFor="type-boolean">Yes/No</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="score" id="type-score" />
                        <Label htmlFor="type-score">Score</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {newFeatureType === 'score' && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="score-min">Min</Label>
                        <Input
                          id="score-min"
                          type="number"
                          value={scoreMin}
                          onChange={(e) => setScoreMin(parseInt(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="score-max">Max</Label>
                        <Input
                          id="score-max"
                          type="number"
                          value={scoreMax}
                          onChange={(e) => setScoreMax(parseInt(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="score-step">Step</Label>
                        <Input
                          id="score-step"
                          type="number"
                          value={scoreStep}
                          onChange={(e) => setScoreStep(parseInt(e.target.value))}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="feature-description">
                      Extraction Prompt
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                        (Describe what the AI should look for)
                      </span>
                    </Label>
                    <Textarea
                      id="feature-description"
                      value={newFeatureDescription}
                      onChange={(e) => setNewFeatureDescription(e.target.value)}
                      placeholder="e.g., Extract the sample size from the methods section. Look for phrases like 'n=' or 'participants' or 'subjects'."
                      className="mt-1"
                      rows={4}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAddFeature(false);
                        setNewFeatureName('');
                        setNewFeatureDescription('');
                      }}
                      disabled={isExtracting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddAndExtractFeature}
                      disabled={!newFeatureName.trim() || !newFeatureDescription.trim() || isExtracting}
                      className="flex-1 gap-2"
                    >
                      <Brain className="w-4 h-4" />
                      {isExtracting ? 'Extracting...' : 'Add & Extract Feature'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preset">
                <div className="mt-4 space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  {presetsLoading ? (
                    <div className="text-center py-4">
                      <div className="text-gray-500 dark:text-gray-400">Loading presets...</div>
                    </div>
                  ) : presets.length === 0 ? (
                    <div className="text-center py-4">
                      <Package className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                      <div className="text-gray-500 dark:text-gray-400">No presets available</div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="preset-select">Select Preset</Label>
                        <select
                          id="preset-select"
                          value={selectedPreset}
                          onChange={(e) => {
                            setSelectedPreset(e.target.value);
                            setSelectedPresetFeatures([]);
                          }}
                          className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-gray-100"
                        >
                          <option value="">Choose a preset...</option>
                          {presets.map(preset => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name} ({preset.features.length} features)
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedPreset && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>Features to Add</Label>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const preset = presets.find(p => p.id === selectedPreset);
                                  if (preset) {
                                    // Filter out features that already exist in collection
                                    const newFeatureIds = preset.features
                                      .filter(f => !collectionFeatures.some(cf => cf.name === f.name))
                                      .map(f => f.id);
                                    setSelectedPresetFeatures(newFeatureIds);
                                  }
                                }}
                              >
                                Select All New
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedPresetFeatures([])}
                              >
                                Select None
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {presets.find(p => p.id === selectedPreset)?.features.map(feature => {
                              const alreadyExists = collectionFeatures.some(cf => cf.name === feature.name);
                              const alreadyExtracted = existingFeatures.hasOwnProperty(feature.id);

                              return (
                                <div
                                  key={feature.id}
                                  className={`p-3 rounded-lg border ${alreadyExists
                                    ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                    }`}
                                >
                                  <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedPresetFeatures.includes(feature.id)}
                                      onChange={() => {
                                        if (alreadyExists) return;
                                        setSelectedPresetFeatures(prev =>
                                          prev.includes(feature.id)
                                            ? prev.filter(id => id !== feature.id)
                                            : [...prev, feature.id]
                                        );
                                      }}
                                      disabled={alreadyExists}
                                      className="mt-1 rounded border-gray-300 dark:border-gray-600"
                                    />
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <div className="font-medium text-gray-900 dark:text-gray-100">
                                          {feature.name}
                                        </div>
                                        {alreadyExists && (
                                          <Badge variant="secondary" className="text-xs">
                                            Already in collection
                                          </Badge>
                                        )}
                                        {alreadyExtracted && (
                                          <Badge variant="outline" className="text-xs">
                                            Extracted
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        {feature.description}
                                      </div>
                                      {feature.type !== 'text' && (
                                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                          Type: {feature.type}
                                          {feature.type === 'score' && feature.options && (
                                            <span> ({feature.options.min}-{feature.options.max})</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowAddFeature(false);
                            setSelectedPreset('');
                            setSelectedPresetFeatures([]);
                          }}
                          disabled={isExtracting}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddPresetsAndExtract}
                          disabled={!selectedPreset || selectedPresetFeatures.length === 0 || isExtracting}
                          className="flex-1 gap-2"
                        >
                          <Brain className="w-4 h-4" />
                          {isExtracting ? 'Extracting...' : `Add & Extract ${selectedPresetFeatures.length} Features`}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}