import { Card } from '@/components/ui/card';
import { useSmartSearch } from '@/context/SmartSearchContext';

export function FilteringStep() {
  const { searchResults } = useSmartSearch();
  
  const totalArticles = searchResults?.pagination.total_available || 0;
  
  return (
    <div className="space-y-6">
      {/* Progress Card */}
      <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Applying Semantic Filter
        </h2>

        {/* Show loading state while parallel processing is happening */}
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Processing {totalArticles} articles in parallel
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            All articles are being evaluated simultaneously for maximum speed
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
            This typically takes 5-30 seconds depending on the number of articles
          </p>
        </div>

      </Card>
    </div>
  );
}