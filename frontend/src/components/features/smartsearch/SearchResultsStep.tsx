import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ChevronRight, ArrowLeft } from 'lucide-react';
import type { SearchExecutionResponse, CanonicalResearchArticle } from '@/lib/api/smartSearchApi';

interface SearchResultsStepProps {
  searchResults: SearchExecutionResponse;
  selectedArticles?: Set<number>;  // Keep for backward compatibility but mark optional
  onToggleArticle?: (index: number) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onSubmit: () => void;
  onSubmitAll?: () => void;
  onLoadMore: () => void;
  onGoBack?: () => void;  // Go back to keywords step
  loading: boolean;
  loadingMore: boolean;
}

export function SearchResultsStep({
  searchResults,
  onSubmit,
  onLoadMore,
  onGoBack,
  loading,
  loadingMore
}: SearchResultsStepProps) {
  // Proceed to discriminator generation (not directly to filtering)
  const handleProceed = () => {
    // Always use onSubmit which should lead to discriminator generation
    onSubmit();
  };

  return (
    <Card className="p-6 dark:bg-gray-800 flex flex-col max-h-[calc(100vh-200px)] max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100 flex-shrink-0">
        Review Search Results
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 flex-shrink-0">
        Preview your search results. If they look relevant, proceed to filtering. If not, go back to adjust your keywords.
      </p>

      {/* Results Summary */}
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              Search Complete
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Found {searchResults.pagination.total_available.toLocaleString()} total articles from {searchResults.sources_searched.join(', ')}
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Showing {Math.min(searchResults.articles.length, searchResults.pagination.total_available)} of {searchResults.pagination.total_available} articles
            </p>
          </div>
          <div className="text-right">
            <Badge variant={searchResults.pagination.total_available <= 500 ? "default" : "secondary"}>
              {searchResults.pagination.total_available <= 500 ? 'Ready to filter' : 'Large result set'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-0">
        {searchResults.articles.map((article: CanonicalResearchArticle, index: number) => (
          <div
            key={index}
            className="p-3 border rounded-lg border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
                  {article.title}
                </h4>
                <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                  <span className="truncate">
                    {article.authors.slice(0, 2).join(', ')}
                    {article.authors.length > 2 && ' et al.'}
                    {article.publication_year && ` (${article.publication_year})`}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {article.source}
                  </Badge>
                </div>
              </div>
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex-shrink-0"
                  title="View article"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex-shrink-0 space-y-4 border-t pt-5 mt-auto border-gray-200 dark:border-gray-700">
        {/* Load More Button */}
        {searchResults.pagination.has_more && (
          <Button
            onClick={onLoadMore}
            disabled={loadingMore}
            variant="outline"
            className="w-full"
          >
            {loadingMore ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Loading More...
              </>
            ) : (
              <>
                Load More Articles ({searchResults.pagination.total_available - searchResults.articles.length} remaining)
              </>
            )}
          </Button>
        )}

        {/* Action Buttons Row */}
        <div className="flex items-center justify-between gap-4">
          {/* Go Back Button */}
          {onGoBack && (
            <Button
              onClick={onGoBack}
              variant="outline"
              className="border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Adjust Keywords
            </Button>
          )}

          {/* Status Text */}
          <div className="flex-1 text-center text-sm text-gray-600 dark:text-gray-400">
            {searchResults.pagination.total_available > 500 ? (
              <span className="text-amber-600 dark:text-amber-400">
                ⚠️ Will filter up to 500 articles maximum
              </span>
            ) : (
              <span>
                Ready to apply semantic filtering to all {searchResults.pagination.total_available} articles
              </span>
            )}
          </div>

          {/* Proceed Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleProceed}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
            >
              {loading ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Processing...
                </>
              ) : (
                <>
                  Generate Filter Criteria
                  <ChevronRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}