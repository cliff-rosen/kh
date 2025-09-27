import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

import { SmartSearch2Provider, useSmartSearch2, ResultState, MAX_ARTICLES_TO_FILTER } from '@/context/SmartSearch2Context';
import type { CanonicalFeatureDefinition } from '@/types/canonical_types';
import type { SmartSearchArticle } from '@/types/smart-search';
import { generatePrefixedUUID } from '@/lib/utils/uuid';

import { SearchForm, KeywordHelper, FilterModal } from '@/components/features/smartsearch2';
import { SearchResults } from '@/components/features/smartsearch2/SearchResults';
import { ScholarEnrichmentModal } from '@/components/features/smartsearch2/ScholarEnrichmentModal';
import { AnalyticsModal } from '@/components/features/smartsearch2/AnalyticsModal';

// Main content component that uses SmartSearch2Context
function SmartSearch2Content() {
  const [showKeywordHelper, setShowKeywordHelper] = useState(false);
  const { toast } = useToast();


  // Collapsible search state
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(false);
  const [hasUserToggledSearch, setHasUserToggledSearch] = useState(false);

  // Enrichment state
  const [isAddingScholar] = useState(false);

  // Filter criteria modal state
  const [showFilterCriteriaModal, setShowFilterCriteriaModal] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState('');

  // Scholar enrichment modal state
  const [showScholarModal, setShowScholarModal] = useState(false);

  // Analytics modal state
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  const {
    selectedSource,
    searchQuery,
    articles,
    pagination,
    isSearching,
    hasSearched,
    resultState,
    error,
    isFiltering,
    appliedFeatures,
    pendingFeatures,
    isExtracting,
    filteringStats,
    evidenceSpec,
    search,
    resetSearch,
    clearError,
    updateSearchQuery,
    addPendingFeature,
    removePendingFeature,
    extractFeatures,
    filterArticles,
    acceptFilter,
    undoFilter,
    addScholarArticles
  } = useSmartSearch2();

  const handleSearch = async () => {
    await search();
  };

  const handleNewSearch = () => {
    setShowKeywordHelper(false);
    setIsSearchCollapsed(false); // Expand search form for new search
    setHasUserToggledSearch(false); // Reset user toggle state for new search
    resetSearch();
  };

  const handleKeywordHelperComplete = () => {
    // The KeywordHelper will update the context directly
    setShowKeywordHelper(false);
  };

  // Feature extraction handlers
  const handleAddFeature = (newFeature: Omit<CanonicalFeatureDefinition, 'id'>) => {
    if (!newFeature.name.trim() || !newFeature.description.trim()) {
      toast({
        title: 'Invalid Feature',
        description: 'Please provide both name and description',
        variant: 'destructive'
      });
      return;
    }

    const feature: CanonicalFeatureDefinition = {
      ...newFeature,
      id: generatePrefixedUUID('feat')
    };

    addPendingFeature(feature);
  };

  const handleExtractFeatures = async () => {
    if (pendingFeatures.length === 0) {
      toast({
        title: 'No Features',
        description: 'Add some features to extract first',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await extractFeatures();
      toast({
        title: 'Feature Extraction Complete',
        description: `Successfully extracted ${response.extraction_metadata.features_extracted} features from ${response.extraction_metadata.total_articles} articles`,
        variant: 'default'
      });
    } catch (error) {
      toast({
        title: 'Extraction Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  };


  // Filter and enrichment handlers
  const handleFilter = async () => {
    // Always show the filter modal for user confirmation/editing
    const initialCriteria = evidenceSpec || '';
    setFilterCriteria(initialCriteria);
    setShowFilterCriteriaModal(true);
  };

  const handleFilterConfirm = async (confirmedFilterCriteria: string) => {
    setShowFilterCriteriaModal(false);

    try {
      const result = await filterArticles(confirmedFilterCriteria);

      // Show detailed notification about what happened
      if (result.autoRetrieved > 0 && result.limitApplied) {
        toast({
          title: 'Filtering Complete (3000 Article Limit Applied)',
          description: `Auto-retrieved ${result.autoRetrieved} more articles before filtering. Note: Only the first 3000 of ${result.totalAvailable} available articles were processed due to system limits.`,
          variant: 'default',
          duration: 8000
        });
      } else if (result.autoRetrieved > 0) {
        toast({
          title: 'Filtering Complete',
          description: `Auto-retrieved ${result.autoRetrieved} more articles before filtering. All ${result.totalAvailable} available articles were processed.`,
          variant: 'default'
        });
      } else if (filteringStats) {
        toast({
          title: 'Filtering Complete',
          description: `Filtered ${filteringStats.total_processed} articles. ${filteringStats.total_accepted} accepted, ${filteringStats.total_rejected} rejected.`,
          variant: 'default'
        });
      }
    } catch (error) {
      toast({
        title: 'Filtering Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  };

  const handleFilterCancel = () => {
    setShowFilterCriteriaModal(false);
    setFilterCriteria('');
  };

  const handleAcceptFilter = () => {
    acceptFilter();
  };

  const handleUndoFilter = () => {
    undoFilter();
  };

  // Auto-collapse search form when we get articles for the first time (only if user hasn't manually toggled)
  useEffect(() => {
    if (hasSearched && articles.length > 0 && !isSearchCollapsed && !hasUserToggledSearch) {
      setIsSearchCollapsed(true);
    }
  }, [hasSearched, articles.length, isSearchCollapsed, hasUserToggledSearch]);

  const handleAddGoogleScholar = async () => {
    if (selectedSource !== 'pubmed') {
      return; // Should not happen as button is conditionally rendered
    }

    // Open the Scholar enrichment modal
    setShowScholarModal(true);
  };

  const handleScholarArticlesAdded = (newArticles: SmartSearchArticle[]) => {
    // Add the new Scholar articles to the existing results
    addScholarArticles(newArticles);

    toast({
      title: 'Articles Added',
      description: `Successfully added ${newArticles.length} articles from Google Scholar`,
      variant: 'default'
    });

    setShowScholarModal(false);
  };


  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Smart Search 2
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Direct access to powerful literature search and filtering
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAnalyticsModal(true)}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              Show Analytics
            </Button>
            <Button
              variant="outline"
              onClick={handleNewSearch}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              New Search
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="w-full max-w-6xl mx-auto space-y-6">

          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearError}
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="space-y-6">
            {/* Search Form - Collapsible after search results */}
            <Collapsible
              open={!isSearchCollapsed}
              onOpenChange={(open) => {
                setIsSearchCollapsed(!open);
                setHasUserToggledSearch(true);
              }}
            >
              {hasSearched && articles.length > 0 && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full mb-4 dark:border-gray-600 dark:text-gray-300"
                  >
                    {isSearchCollapsed ? (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        Show Search Form
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        Hide Search Form
                      </>
                    )}
                  </Button>
                </CollapsibleTrigger>
              )}
              <CollapsibleContent>
                {showKeywordHelper ? (
                  <Card className="p-6">
                    <div className="mb-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowKeywordHelper(false);
                          // Clear any Scholar articles that were added
                          resetSearch();
                        }}
                        className="mb-4"
                      >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Direct Search
                      </Button>
                    </div>
                    <KeywordHelper
                      onComplete={handleKeywordHelperComplete}
                      onCancel={() => {
                        setShowKeywordHelper(false);
                        // Clear any Scholar articles that were added
                        resetSearch();
                      }}
                    />
                  </Card>
                ) : (
                  <SearchForm
                    onSearch={handleSearch}
                    onToggleKeywordHelper={() => setShowKeywordHelper(true)}
                    isSearching={isSearching}
                  />
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Results moved below to allow full-width table */}
          </div>
        </div>
        {hasSearched && (
          <div className="mt-6">
            <SearchResults
              articles={articles}
              pagination={pagination}
              isSearching={isSearching}
              onQueryUpdate={updateSearchQuery}
              onSearch={handleSearch}
              appliedFeatures={appliedFeatures}
              pendingFeatures={pendingFeatures}
              isExtracting={isExtracting}
              onAddFeature={handleAddFeature}
              onRemovePendingFeature={removePendingFeature}
              onExtractFeatures={handleExtractFeatures}
              // New functionality props
              evidenceSpec={evidenceSpec}
              onFilter={handleFilter}
              onAddGoogleScholar={handleAddGoogleScholar}
              isFiltering={isFiltering}
              isAddingScholar={isAddingScholar}
              // Filter state
              filteringStats={filteringStats}
              hasFiltered={resultState === ResultState.FilteredResult}
              hasPendingFilter={resultState === ResultState.FilterPendingApproval}
              onAcceptFilter={handleAcceptFilter}
              onUndoFilter={handleUndoFilter}
              // Export props
              searchQuery={searchQuery}
            />
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={showFilterCriteriaModal}
        onClose={handleFilterCancel}
        onConfirm={handleFilterConfirm}
        initialValue={filterCriteria}
        currentArticleCount={articles.length}
        totalAvailable={pagination?.total_available || 0}
        maxArticlesToFilter={MAX_ARTICLES_TO_FILTER}
      />

      {/* Scholar Enrichment Modal */}
      <ScholarEnrichmentModal
        isOpen={showScholarModal}
        onClose={() => setShowScholarModal(false)}
        onAddArticles={handleScholarArticlesAdded}
      />

      {/* Analytics Modal */}
      <AnalyticsModal
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
      />
    </div>
  );
}

// Main component that provides the SmartSearch2Context
export default function SmartSearch2() {
  return (
    <SmartSearch2Provider>
      <SmartSearch2Content />
    </SmartSearch2Provider>
  );
}