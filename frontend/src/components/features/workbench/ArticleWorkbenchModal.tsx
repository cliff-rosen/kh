import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, ExternalLink, Brain, FileText, Edit3, Plus, Network } from 'lucide-react';

import { ArticleCollection } from '@/types/articleCollection';
import { ArticleGroupDetail } from '@/types/workbench';
import { CanonicalResearchArticle } from '@/types/canonical_types';

import { ChatPanel } from './chat/ChatPanel';
import { OverviewTab, NotesTab, FeaturesTab, EntityBrowserTab } from './article-modal';

interface ArticleWorkbenchModalProps {
  articleDetail: ArticleGroupDetail;
  collection: ArticleCollection | null;
  onClose: () => void;
  onSendChatMessage?: (
    message: string,
    article: CanonicalResearchArticle,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ) => Promise<void>;
}

export function ArticleWorkbenchModal({
  articleDetail,
  collection,
  onClose,
  onSendChatMessage
}: ArticleWorkbenchModalProps) {

  const [activeTab, setActiveTab] = useState('overview');

  // Extract the article from articleDetail for convenience
  const article = articleDetail.article;
  const collectionType = collection?.source === 'search' ? 'search' : 'group';

  // Get current data from workbench context (reactive to updates)
  const getCurrentArticleData = () => {
    if (!collection) return { featureData: {}, notes: '' };

    const currentArticle = collection.articles.find(
      item => item.article_id === articleDetail.article_id
    );
    return {
      featureData: currentArticle?.feature_data || {},
      notes: currentArticle?.notes || ''
    };
  };

  const { featureData, notes: currentNotes } = getCurrentArticleData();

  const getArticleUrl = () => {
    if (article.source === 'pubmed' && article.id.includes('pubmed_')) {
      const pmid = article.id.replace('pubmed_', '');
      return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    }
    return article.url || null;
  };

  const getSourceBadge = (source: string) => {
    const config = source === 'pubmed'
      ? { label: 'PubMed', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' }
      : { label: 'Google Scholar', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-0">
        <DialogTitle className="sr-only">
          Research Workbench: {article.title}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Article research workbench with chat, notes, feature extraction, and organization tools
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Brain className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-semibold truncate">Research Workbench</h2>
            {getSourceBadge(article.source)}
            {collection && (
              <Badge variant="outline" className="text-xs">
                {collection.name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {getArticleUrl() && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(getArticleUrl()!, '_blank')}
                className="gap-1"
              >
                <ExternalLink className="w-4 h-4" />
                View Original
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="w-8 h-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Main Content - Split Layout */}
        <div className="flex h-[calc(95vh-80px)]">
          {/* Left Side - Chat Panel */}
          <div className="w-96 lg:w-[500px] xl:w-[600px] 2xl:w-[700px] border-r dark:border-gray-700">
            <ChatPanel
              article={article}
              onSendMessage={onSendChatMessage}
            />
          </div>

          {/* Right Side - Workbench Tabs */}
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-4 m-4 mb-0">
                <TabsTrigger value="overview" className="gap-1">
                  <FileText className="w-4 h-4" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1">
                  <Edit3 className="w-4 h-4" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="features" className="gap-1">
                  <Plus className="w-4 h-4" />
                  Features
                </TabsTrigger>
                <TabsTrigger value="entities" className="gap-1">
                  <Network className="w-4 h-4" />
                  Entities
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-4">
                <TabsContent value="overview" className="mt-0">
                  <OverviewTab
                    article={article}
                    featureData={featureData}
                    collectionName={collection?.name}
                    collectionFeatures={collection?.feature_definitions || []}
                  />
                </TabsContent>

                <TabsContent value="notes" className="mt-0">
                  {collection?.saved_group_id ? (
                    <NotesTab
                      groupId={collection.saved_group_id}
                      articleId={article.id}
                      articleDetail={{ ...articleDetail, notes: currentNotes }}
                      initialNotes={currentNotes}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <Edit3 className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Collection Loaded</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Save this collection to add notes to articles.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="features" className="mt-0">
                  {collection?.saved_group_id ? (
                    <FeaturesTab
                      articleId={articleDetail.article_id}
                      existingFeatures={featureData}
                      collectionFeatures={collection.feature_definitions || []}
                      collectionType={collectionType}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <Plus className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No Saved Group</h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Features can only be added to saved article groups. Save this collection first.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="entities" className="mt-0">
                  <EntityBrowserTab
                    article={article}
                    groupId={collection?.saved_group_id}
                  />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}