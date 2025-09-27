import { useState } from 'react';
import { useWorkbench } from '@/context/WorkbenchContext';
import { UnifiedSearchControls } from './search/UnifiedSearchControls';
import { useToast } from '@/components/ui/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SearchTabProps {
  onNewSearch: (page?: number) => void;
}

export function SearchTab({ onNewSearch }: SearchTabProps) {
  const workbench = useWorkbench();
  const { toast } = useToast();
  
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Remember the collapsed state in localStorage
    const saved = localStorage.getItem('searchTabCollapsed');
    return saved ? JSON.parse(saved) : false;
  });

  const handleSearch = async () => {
    if (!workbench.searchQuery.trim()) {
      toast({
        title: 'Search Required',
        description: 'Please enter a search query',
        variant: 'destructive'
      });
      return;
    }

    await onNewSearch(1);
  };

  const handleCollapseChange = (open: boolean) => {
    const collapsed = !open;
    setIsCollapsed(collapsed);
    localStorage.setItem('searchTabCollapsed', JSON.stringify(collapsed));
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Collapsible open={!isCollapsed} onOpenChange={handleCollapseChange}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Search Research Articles</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Search across PubMed and Google Scholar
                </p>
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="p-4">
            <UnifiedSearchControls
              query={workbench.searchQuery}
              onQueryChange={workbench.updateSearchQuery}
              selectedProviders={workbench.selectedProviders}
              onProvidersChange={workbench.updateSearchProviders}
              searchMode={workbench.searchMode}
              onSearchModeChange={workbench.updateSearchMode}
              onSearch={handleSearch}
              isSearching={workbench.collectionLoading}
              pageSize={workbench.searchParams.pageSize}
              onPageSizeChange={(pageSize) => workbench.updateSearchParams({ pageSize })}
              sortBy={workbench.searchParams.sortBy}
              onSortByChange={(sortBy) => workbench.updateSearchParams({ sortBy })}
              yearLow={workbench.searchParams.yearLow}
              onYearLowChange={(yearLow) => workbench.updateSearchParams({ yearLow })}
              yearHigh={workbench.searchParams.yearHigh}
              onYearHighChange={(yearHigh) => workbench.updateSearchParams({ yearHigh })}
              dateFrom={workbench.searchParams.dateFrom}
              onDateFromChange={(dateFrom) => workbench.updateSearchParams({ dateFrom })}
              dateTo={workbench.searchParams.dateTo}
              onDateToChange={(dateTo) => workbench.updateSearchParams({ dateTo })}
              dateType={workbench.searchParams.dateType}
              onDateTypeChange={(dateType) => workbench.updateSearchParams({ dateType })}
              includeCitations={workbench.searchParams.includeCitations}
              onIncludeCitationsChange={(includeCitations) => workbench.updateSearchParams({ includeCitations })}
              includePdfLinks={workbench.searchParams.includePdfLinks}
              onIncludePdfLinksChange={(includePdfLinks) => workbench.updateSearchParams({ includePdfLinks })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}