import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Search, Sparkles } from 'lucide-react';
import { useSmartSearch2 } from '@/context/SmartSearch2Context';

interface SearchFormProps {
  onSearch: () => void;
  onToggleKeywordHelper: () => void;
  isSearching: boolean;
}

export function SearchForm({
  onSearch,
  onToggleKeywordHelper,
  isSearching
}: SearchFormProps) {
  const {
    searchQuery,
    updateSearchQuery
  } = useSmartSearch2();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    await onSearch();
  };

  const getPlaceholderText = () => {
    return '(cannabis OR marijuana) AND (motivation OR apathy) AND (study OR research)';
  };

  return (
    <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Search Query Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="query" className="text-base font-semibold">
              Search Keywords
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleKeywordHelper}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Use AI Keyword Helper
            </Button>
          </div>
          <Textarea
            id="query"
            value={searchQuery}
            onChange={(e) => {
              const newQuery = e.target.value;
              updateSearchQuery(newQuery);
            }}
            rows={6}
            className="dark:bg-gray-700 dark:text-gray-100 text-sm font-mono"
            placeholder={getPlaceholderText()}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Enter boolean search query with AND, OR, NOT operators
          </p>
        </div>

        {/* Search Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!searchQuery.trim() || isSearching}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {isSearching ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}