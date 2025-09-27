import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  Save
} from 'lucide-react';

import { CanonicalResearchArticle } from '@/types/canonical_types';
import { workbenchApi } from '@/lib/api/workbenchApi';
import { CanonicalStudyRepresentation } from '@/types/canonical-study';
import { EntityKnowledgeGraph } from './EntityKnowledgeGraph';

interface EntityBrowserTabProps {
  article: CanonicalResearchArticle;
  groupId?: string;
}

export function EntityBrowserTab({ article, groupId }: EntityBrowserTabProps) {
  const [canonicalStudy, setCanonicalStudy] = useState<CanonicalStudyRepresentation>({});

  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Load canonical study representation on mount
  useEffect(() => {
    if (groupId) {
      loadCanonicalStudy();
    }
  }, [groupId, article.id]);

  const loadCanonicalStudy = async () => {
    if (!groupId) return;

    setLoading(true);
    try {
      const data = await workbenchApi.getCanonicalStudy(groupId, article.id);
      setCanonicalStudy(data);
    } catch (err) {
      console.error('Failed to load canonical study:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateArchetype = async () => {
    if (!article.abstract) {
      toast({
        title: 'No Content Available',
        description: 'Archetype generation requires article abstract or full text.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const archRes = await workbenchApi.extractArticleArchtype({
        article_id: article.id,
        title: article.title,
        abstract: article.abstract || '',
        full_text: (article as any).full_text || undefined
      });

      setCanonicalStudy(prev => ({
        ...prev,
        archetype_text: archRes.archetype,
        study_type: archRes.study_type,
        pattern_id: archRes.pattern_id
      }));

      toast({
        title: 'Archetype Generated',
        description: 'Review and optionally generate the entity graph.'
      });
    } catch (err) {
      console.error('Archetype generation failed:', err);
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Failed to generate archetype',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateGraph = async () => {
    if (!canonicalStudy.archetype_text?.trim()) {
      toast({
        title: 'Archetype Required',
        description: 'Generate or enter an archetype first.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const graphRes = await workbenchApi.archetypeToErGraph({
        article_id: article.id,
        archetype: canonicalStudy.archetype_text,
        study_type: canonicalStudy.study_type || undefined,
        pattern_id: canonicalStudy.pattern_id || undefined
      });

      setCanonicalStudy(prev => ({
        ...prev,
        entity_analysis: graphRes.analysis
      }));

      toast({
        title: 'Graph Generated',
        description: `Built graph with ${graphRes.analysis.entities.length} entities and ${graphRes.analysis.relationships.length} relationships.`
      });
    } catch (err) {
      console.error('Graph generation failed:', err);
      toast({
        title: 'Graph Error',
        description: err instanceof Error ? err.message : 'Failed to generate graph',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveCanonicalStudy = async () => {
    if (!groupId || !canonicalStudy.archetype_text?.trim()) {
      toast({
        title: 'Cannot Save',
        description: 'Archetype text is required.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await workbenchApi.saveCanonicalStudy(
        groupId,
        article.id,
        {
          archetype_text: canonicalStudy.archetype_text!,
          study_type: canonicalStudy.study_type || undefined,
          pattern_id: canonicalStudy.pattern_id || undefined,
          entity_analysis: canonicalStudy.entity_analysis || undefined
        }
      );

      setCanonicalStudy(prev => ({
        ...prev,
        last_updated: result.last_updated
      }));

      toast({
        title: 'Saved Successfully',
        description: 'Canonical study representation saved.'
      });
    } catch (err) {
      console.error('Save failed:', err);
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Failed to save',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading skeleton
  if (loading && !canonicalStudy.archetype_text) {
    return (
      <div className="space-y-4">
        <Card className="p-4">
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-20 w-full" />
        </Card>
        <Card className="p-4">
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Canonical Study Analysis</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Structured representation of study design and entity relationships
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={generateArchetype}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Generate Archetype
          </Button>
          {groupId && (
            <Button
              onClick={saveCanonicalStudy}
              disabled={isSaving || !canonicalStudy.archetype_text?.trim()}
              size="sm"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save All
            </Button>
          )}
        </div>
      </div>

      {/* Archetype Section */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Study Archetype</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Natural language study structure</div>
            </div>
            {canonicalStudy.last_updated && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Saved {new Date(canonicalStudy.last_updated).toLocaleString()}
              </div>
            )}
          </div>

          <textarea
            className="w-full min-h-[80px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-sm"
            placeholder="Generate or enter the study archetype..."
            value={canonicalStudy.archetype_text || ''}
            onChange={(e) => setCanonicalStudy(prev => ({ ...prev, archetype_text: e.target.value }))}
          />

          <div className="flex items-center gap-4">
            {canonicalStudy.study_type && (
              <Badge variant="secondary">{canonicalStudy.study_type}</Badge>
            )}
            {canonicalStudy.pattern_id && (
              <Badge variant="outline" className="font-mono">
                Pattern {canonicalStudy.pattern_id}
              </Badge>
            )}
            <Button
              onClick={generateGraph}
              disabled={loading || !canonicalStudy.archetype_text?.trim()}
              variant="secondary"
              size="sm"
              className="ml-auto"
            >
              {canonicalStudy.entity_analysis ? 'Regenerate' : 'Generate'} Entity Graph
            </Button>
          </div>
        </div>
      </Card>

      {/* Entity Analysis Section */}
      {canonicalStudy.entity_analysis && (
        <div className="space-y-4">
          {/* Summary Card */}
          <Card className="p-4 bg-gray-50 dark:bg-gray-700/50">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {canonicalStudy.entity_analysis.entities.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Entities</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {canonicalStudy.entity_analysis.relationships.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Relationships</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {canonicalStudy.entity_analysis.pattern_complexity}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Complexity</div>
              </div>
            </div>
          </Card>

          {/* Visualization Tabs */}
          <Tabs defaultValue="graph" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="graph">Knowledge Graph</TabsTrigger>
              <TabsTrigger value="list">Entity List</TabsTrigger>
            </TabsList>

            <TabsContent value="graph">
              <EntityKnowledgeGraph analysis={canonicalStudy.entity_analysis} />
            </TabsContent>

            <TabsContent value="list" className="space-y-4">
              {/* Entity type breakdown */}
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(
                  canonicalStudy.entity_analysis.entities.reduce((acc, entity) => {
                    acc[entity.type] = (acc[entity.type] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([type, count]) => (
                  <Card key={type} className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium capitalize">
                        {type.replace(/_/g, ' ')}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Clinical significance if available */}
              {canonicalStudy.entity_analysis.clinical_significance && (
                <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        Clinical Significance
                      </div>
                      <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                        {canonicalStudy.entity_analysis.clinical_significance}
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}