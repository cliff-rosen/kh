import { ChevronRight, RefreshCw, History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';

import { useSmartSearch } from '@/context/SmartSearchContext';

import { mapFrontendToBackend, isStepAtOrAfter } from '@/types/smart-search';

import { QueryInputStep } from '@/components/features/smartsearch/QueryInputStep';
import { RefinementStep } from '@/components/features/smartsearch/RefinementStep';
import { SearchQueryStep } from '@/components/features/smartsearch/SearchQueryStep';
import { SearchingStep } from '@/components/features/smartsearch/SearchingStep';
import { SearchResultsStep } from '@/components/features/smartsearch/SearchResultsStep';
import { DiscriminatorStep } from '@/components/features/smartsearch/DiscriminatorStep';
import { FilteringStep } from '@/components/features/smartsearch/FilteringStep';
import { ResultsStep } from '@/components/features/smartsearch/ResultsStep';
import { ProgressSummary } from '@/components/features/smartsearch/ProgressSummary';

export default function SmartSearchLab() {
  const smartSearch = useSmartSearch();
  const { toast } = useToast();


  // Generic error handler for consistent toast messages
  const handleError = (title: string, error: unknown) => {
    toast({
      title,
      description: error instanceof Error ? error.message : 'Unknown error',
      variant: 'destructive'
    });
  };

  // ================== HANDLERS ==================

  // Step 1: Submit query for evidence specification
  const handleCreateEvidenceSpec = async () => {
    try {
      await smartSearch.generateEvidenceSpecification();
      smartSearch.updateStep('refinement');

      toast({
        title: 'Evidence Specification Created',
        description: 'Review and edit the evidence specification'
      });
    } catch (error) {
      handleError('Evidence Specification Failed', error);
    }
  };

  // Step 2: Generate search keywords from evidence specification
  const handleGenerateKeywords = async (source?: string) => {
    try {
      const response = await smartSearch.generateKeywords(source);

      // Move to next step
      smartSearch.updateStep('search-query');

      // Show appropriate feedback based on whether count testing succeeded
      if (response.count_result) {
        const { total_count } = response.count_result;
        if (total_count > 250) {
          toast({
            title: 'Keywords Generated & Tested',
            description: `Query generated ${total_count.toLocaleString()} results. Consider optimizing for better performance.`,
            variant: 'default'
          });
        } else {
          toast({
            title: 'Keywords Generated & Tested',
            description: `Query generated ${total_count.toLocaleString()} results. Ready to search!`
          });
        }
      } else {
        // Count testing failed, but keywords were generated
        toast({
          title: 'Keywords Generated',
          description: 'Keywords created successfully. Please test the query manually.',
          variant: 'default'
        });
      }

    } catch (error) {
      handleError('Keyword Generation Failed', error);
    }
  };

  // Step 3: Execute search
  const handleExecuteSearch = async () => {
    smartSearch.updateStep('searching');

    try {
      const results = await smartSearch.search();

      if (results.articles.length === 0) {
        toast({
          title: 'No Results',
          description: 'No articles found. Try different search keywords',
          variant: 'destructive'
        });
        smartSearch.updateStep('search-query');
      } else {
        toast({
          title: 'Search Complete',
          description: `Found ${results.pagination.returned} articles (${results.pagination.total_available} total available) from ${results.sources_searched.join(', ')}`
        });
        smartSearch.updateStep('search-results');
      }
    } catch (error) {
      handleError('Search Failed', error);
      smartSearch.updateStep('refinement');
    }
  };

  // Step 4: Start filtering - always filter all articles
  const handleStartFiltering = async () => {
    if (!smartSearch.searchResults || !smartSearch.sessionId) return;

    smartSearch.updateStep('filtering');

    try {
      const startTime = Date.now();
      const response = await smartSearch.filterArticles();
      const duration = Date.now() - startTime;

      // Complete immediately
      smartSearch.updateStep('results');

      // Show toast with results
      const description = `Processed ${response.total_processed} articles in ${(duration / 1000).toFixed(1)}s: ${response.total_accepted} accepted, ${response.total_rejected} rejected`;

      toast({
        title: 'Filtering Complete',
        description: response.search_limitation_note
          ? `${description}\n\n${response.search_limitation_note}`
          : description
      });

    } catch (error) {
      handleError('Failed to Start Filtering', error);
    }
  };

  // Generate discriminator for review
  const handleGenerateDiscriminator = async () => {
    try {
      await smartSearch.generateDiscriminator();
      smartSearch.updateStep('discriminator');

      toast({
        title: 'Discriminator Generated',
        description: 'Review and edit the semantic evaluation criteria'
      });
    } catch (error) {
      handleError('Discriminator Generation Failed', error);
    }
  };

  // Generate discriminator - always filters all results
  const handleProceedToDiscriminator = async () => {
    if (!smartSearch.searchResults) return;

    // Generate discriminator for filtering all results
    await handleGenerateDiscriminator();
  };

  // Load more search results
  const handleLoadMoreResults = async () => {
    try {
      const batchSize = smartSearch.selectedSource === 'google_scholar' ? 20 : 50;
      const moreResults = await smartSearch.search(
        smartSearch.searchResults?.articles.length || 0,
        batchSize
      );

      toast({
        title: 'More Results Loaded',
        description: `Loaded ${moreResults.articles.length} more articles`
      });
    } catch (error) {
      handleError('Failed to Load More Results', error);
    }
  };

  // Step navigation functions
  const handleStepBack = async (targetStep: string) => {
    if (!smartSearch.sessionId || !smartSearch.canNavigateToStep(targetStep as any)) return;

    try {
      // Get backend step name using centralized mapping
      const backendStep = mapFrontendToBackend(targetStep as any);

      // Call backend to reset session
      await smartSearch.resetToStep(smartSearch.sessionId, backendStep);

      // Navigate to target step
      smartSearch.updateStep(targetStep as any);

      toast({
        title: 'Stepped Back',
        description: `Returned to ${targetStep.replace('-', ' ')} step`,
      });

    } catch (error) {
      handleError('Failed to Step Back', error);
    }
  };

  // Navigate to adjust keywords without resetting session state
  const handleAdjustKeywords = () => {
    // Simply navigate to the search-query step without resetting
    // This preserves query history and all current state
    smartSearch.updateStep('search-query');

    // The current query should already be in submittedSearchKeywords
    // and the history should be preserved

    toast({
      title: 'Adjust Keywords',
      description: 'Edit your search keywords and test again',
    });
  };

  const handleReset = () => {
    smartSearch.resetAllState();
  };

  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b-2 border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Smart Search Lab
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              AI-powered document discovery with semantic filtering
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/search-history">
              <Button
                variant="outline"
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <History className="w-4 h-4 mr-2" />
                Search History
              </Button>
            </Link>
            {smartSearch.step !== 'query' && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="dark:border-gray-600 dark:text-gray-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            )}
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Badge
            variant={smartSearch.step === 'query' ? 'default' : 'secondary'}
            className={smartSearch.canNavigateToStep('query') ? 'cursor-pointer hover:bg-opacity-80' : ''}
            onClick={smartSearch.canNavigateToStep('query') ? () => handleStepBack('query') : undefined}
          >
            1. Enter Search Request
          </Badge>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <Badge
            variant={smartSearch.step === 'refinement' ? 'default' : isStepAtOrAfter(smartSearch.step, 'refinement') ? 'secondary' : 'outline'}
            className={smartSearch.canNavigateToStep('refinement') ? 'cursor-pointer hover:bg-opacity-80' : ''}
            onClick={smartSearch.canNavigateToStep('refinement') ? () => handleStepBack('refinement') : undefined}
          >
            2. Evidence Specification
          </Badge>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <Badge
            variant={smartSearch.step === 'search-query' ? 'default' : isStepAtOrAfter(smartSearch.step, 'search-query') ? 'secondary' : 'outline'}
            className={smartSearch.canNavigateToStep('search-query') ? 'cursor-pointer hover:bg-opacity-80' : ''}
            onClick={smartSearch.canNavigateToStep('search-query') ? () => handleStepBack('search-query') : undefined}
          >
            3. Generate Keywords
          </Badge>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <Badge
            variant={smartSearch.step === 'search-results' ? 'default' : isStepAtOrAfter(smartSearch.step, 'discriminator') ? 'secondary' : 'outline'}
          >
            4. Search Results
          </Badge>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <Badge
            variant={smartSearch.step === 'discriminator' ? 'default' : isStepAtOrAfter(smartSearch.step, 'filtering') ? 'secondary' : 'outline'}
            onClick={smartSearch.canNavigateToStep('discriminator') ? () => handleStepBack('discriminator') : undefined}
          >
            5. Filter Criteria
          </Badge>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <Badge variant={smartSearch.step === 'results' ? 'default' : 'outline'}>
            6. Filtered Results
          </Badge>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="w-full space-y-6">
          {/* Step Components */}
          {smartSearch.step === 'query' && (
            <QueryInputStep
              query={smartSearch.originalQuestion}
              setQuery={smartSearch.updateOriginalQuestion}
              onSubmit={handleCreateEvidenceSpec}
              loading={smartSearch.evidenceSpecLoading}
            />
          )}

          {smartSearch.step === 'refinement' && smartSearch.evidenceSpecResponse && (
            <>
              <ProgressSummary
                lastCompletedStep="query"
                stepData={{ originalQuery: smartSearch.originalQuestion }}
              />
              <RefinementStep
                evidenceSpec={smartSearch.submittedEvidenceSpec}
                setEvidenceSpec={smartSearch.updateSubmittedEvidenceSpec}
                selectedSource={smartSearch.selectedSource}
                setSelectedSource={smartSearch.updateSelectedSource}
                onSubmit={handleGenerateKeywords}
                loading={smartSearch.searchKeywordsLoading}
              />
            </>
          )}

          {smartSearch.step === 'search-query' && smartSearch.searchKeywordsResponse && (
            <>
              <ProgressSummary
                lastCompletedStep="evidence"
                stepData={{
                  originalQuery: smartSearch.originalQuestion,
                  evidenceSpec: smartSearch.submittedEvidenceSpec,
                  selectedSource: smartSearch.selectedSource
                }}
              />
              <SearchQueryStep
                onSubmit={handleExecuteSearch}
              />
            </>
          )}

          {smartSearch.step === 'searching' && <SearchingStep />}

          {smartSearch.step === 'search-results' && smartSearch.searchResults && (
            <>
              <ProgressSummary
                lastCompletedStep="keywords"
                stepData={{
                  originalQuery: smartSearch.originalQuestion,
                  evidenceSpec: smartSearch.submittedEvidenceSpec,
                  searchKeywords: smartSearch.submittedSearchKeywords
                }}
              />
              <SearchResultsStep
                searchResults={smartSearch.searchResults}
                onSubmit={handleProceedToDiscriminator}
                onLoadMore={handleLoadMoreResults}
                onGoBack={handleAdjustKeywords}
                loading={smartSearch.discriminatorLoading}
                loadingMore={smartSearch.searchExecutionLoading}
              />
            </>
          )}

          {smartSearch.step === 'discriminator' && smartSearch.discriminatorResponse && (
            <>
              <ProgressSummary
                lastCompletedStep="search"
                stepData={{
                  originalQuery: smartSearch.originalQuestion,
                  evidenceSpec: smartSearch.submittedEvidenceSpec,
                  searchKeywords: smartSearch.submittedSearchKeywords,
                  articlesFound: smartSearch.searchResults?.pagination.returned,
                  totalAvailable: smartSearch.searchResults?.pagination.total_available
                }}
              />
              <DiscriminatorStep
                evidenceSpec={smartSearch.submittedEvidenceSpec}
                searchKeywords={smartSearch.submittedSearchKeywords}
                editedDiscriminator={smartSearch.submittedDiscriminator}
                setEditedDiscriminator={smartSearch.updateSubmittedDiscriminator}
                strictness={smartSearch.strictness}
                setStrictness={smartSearch.updateStrictness}
                selectedArticlesCount={smartSearch.searchResults?.pagination.total_available || 0}
                totalAvailable={smartSearch.searchResults?.pagination.total_available}
                onSubmit={handleStartFiltering}
              />
            </>
          )}

          {smartSearch.step === 'filtering' && (
            <>
              <ProgressSummary
                lastCompletedStep="discriminator"
                stepData={{
                  originalQuery: smartSearch.originalQuestion,
                  evidenceSpec: smartSearch.submittedEvidenceSpec,
                  searchKeywords: smartSearch.submittedSearchKeywords,
                  articlesFound: smartSearch.searchResults?.pagination.returned,
                  totalAvailable: smartSearch.searchResults?.pagination.total_available,
                  discriminator: smartSearch.submittedDiscriminator,
                  strictness: smartSearch.strictness
                }}
              />
              <FilteringStep />
            </>
          )}

          {smartSearch.step === 'results' && (
            <>
              <ResultsStep
                filteredArticles={smartSearch.filteredArticles}
                originalQuery={smartSearch.originalQuestion}
                evidenceSpecification={smartSearch.submittedEvidenceSpec}
                searchQuery={smartSearch.submittedSearchKeywords}
                totalAvailable={smartSearch.searchResults?.pagination.total_available}
                totalRetrieved={smartSearch.totalRetrieved}
                totalFiltered={smartSearch.totalRetrieved || smartSearch.filteredArticles.length}
                sessionId={smartSearch.sessionId || undefined}
                searchLimitationNote={smartSearch.searchLimitationNote}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}