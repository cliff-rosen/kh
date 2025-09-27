/**
 * Unified Search Controls Component
 * 
 * Enhanced search controls that work with the unified search system.
 * Supports provider selection and provider-specific parameters.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, Zap } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

import { SearchProvider } from '@/types/unifiedSearch';
import { ProviderSelector } from './ProviderSelector';

interface UnifiedSearchControlsProps {
  query: string;
  onQueryChange: (query: string) => void;
  selectedProviders: SearchProvider[];
  onProvidersChange: (providers: SearchProvider[]) => void;
  searchMode: 'single' | 'multi';
  onSearchModeChange: (mode: 'single' | 'multi') => void;
  onSearch: () => void;
  isSearching: boolean;
  onBatchSearch?: () => void;
  // Search parameters
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  sortBy?: 'relevance' | 'date';
  onSortByChange?: (sortBy: 'relevance' | 'date') => void;
  yearLow?: number;
  onYearLowChange?: (yearLow: number | undefined) => void;
  yearHigh?: number;
  onYearHighChange?: (yearHigh: number | undefined) => void;
  dateFrom?: string;
  onDateFromChange?: (dateFrom: string | undefined) => void;
  dateTo?: string;
  onDateToChange?: (dateTo: string | undefined) => void;
  dateType?: 'completion' | 'publication' | 'entry' | 'revised';
  onDateTypeChange?: (dateType: 'completion' | 'publication' | 'entry' | 'revised') => void;
  includeCitations?: boolean;
  onIncludeCitationsChange?: (includeCitations: boolean) => void;
  includePdfLinks?: boolean;
  onIncludePdfLinksChange?: (includePdfLinks: boolean) => void;
}

export function UnifiedSearchControls({
  query,
  onQueryChange,
  selectedProviders,
  onProvidersChange,
  searchMode,
  onSearchModeChange,
  onSearch,
  isSearching,
  onBatchSearch,
  pageSize = 20,
  onPageSizeChange,
  sortBy = 'relevance',
  onSortByChange,
  yearLow,
  onYearLowChange,
  yearHigh,
  onYearHighChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  dateType = 'publication',
  onDateTypeChange,
  includeCitations = false,
  onIncludeCitationsChange,
  includePdfLinks = false,
  onIncludePdfLinksChange
}: UnifiedSearchControlsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showProviders, setShowProviders] = useState(true);
  
  const currentProvider = searchMode === 'single' ? selectedProviders[0] || 'pubmed' : 'pubmed';

  const canSearch = query.trim() && (
    (searchMode === 'single' && currentProvider) ||
    (searchMode === 'multi' && selectedProviders.length > 0)
  );

  const handleProviderChange = (provider: SearchProvider) => {
    onProvidersChange([provider]);
  };


  const renderProviderSpecificOptions = () => {
    if (searchMode !== 'single') return null;

    const provider = currentProvider;

    if (provider === 'pubmed') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Date Type for Filtering
            </label>
            <select
              className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              value={dateType}
              onChange={(e) => onDateTypeChange?.(e.target.value as 'completion' | 'publication' | 'entry' | 'revised')}
            >
              <option value="publication">Publication Date</option>
              <option value="completion">Completion Date</option>
              <option value="entry">Entry Date</option>
              <option value="revised">Revised Date</option>
            </select>
          </div>
        </div>
      );
    }

    if (provider === 'scholar') {
      return (
        <div className="flex items-end">
          <Badge variant="secondary" className="mb-2">
            Scholar provides citation counts and PDF links
          </Badge>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <Collapsible open={showProviders} onOpenChange={setShowProviders}>
        <CollapsibleTrigger asChild>
          <Card className="cursor-pointer hover:shadow-md transition-shadow bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center text-lg text-gray-900 dark:text-gray-100">
                  <Search className="w-5 h-5 mr-2" />
                  Search Providers
                  {searchMode === 'single' && currentProvider && (
                    <Badge variant="default" className="ml-2">
                      {currentProvider === 'pubmed' ? 'PubMed' : 'Google Scholar'}
                    </Badge>
                  )}
                  {searchMode === 'multi' && selectedProviders.length > 0 && (
                    <Badge variant="default" className="ml-2">
                      {selectedProviders.length} provider{selectedProviders.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
                {showProviders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
          </Card>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <CardContent className="pt-4">
              <ProviderSelector
                selectedProvider={currentProvider}
                onProviderChange={handleProviderChange}
                selectedProviders={selectedProviders}
                onMultiProviderChange={onProvidersChange}
                mode={searchMode}
                onModeChange={onSearchModeChange}
                disabled={isSearching}
              />
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Search Parameters */}
      <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          {/* Main search row */}
          <div className="flex gap-3 items-end mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Search Query
              </label>
              <Input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Enter search terms..."
                onKeyDown={(e) => e.key === 'Enter' && canSearch && onSearch()}
                className="dark:bg-gray-800 dark:text-gray-100"
                disabled={isSearching}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="px-6 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium"
                onClick={onSearch}
                disabled={!canSearch || isSearching}
              >
                <Search className="w-4 h-4 mr-2" />
                {isSearching ? 'Searching...' : 'Search'}
              </Button>

              {searchMode === 'multi' && selectedProviders.length > 1 && onBatchSearch && (
                <Button
                  variant="outline"
                  className="px-6"
                  onClick={onBatchSearch}
                  disabled={!canSearch || isSearching}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Batch Search
                </Button>
              )}
            </div>
          </div>

          {/* Basic options row */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="w-36">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Page Size
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                value={pageSize}
                onChange={(e) => onPageSizeChange?.(parseInt(e.target.value))}
                disabled={isSearching}
              >
                <option value="10">10 per page</option>
                <option value="20">20 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                Sort By
              </label>
              <select
                className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                value={sortBy}
                onChange={(e) => onSortByChange?.(e.target.value as 'relevance' | 'date')}
                disabled={isSearching}
              >
                <option value="relevance">Relevance</option>
                <option value="date">Date</option>
              </select>
            </div>
            {/* Date filtering - unified approach */}
            {currentProvider === 'pubmed' && searchMode === 'single' ? (
              <>
                <div className="w-40">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    From Date
                  </label>
                  <Input
                    type="date"
                    value={dateFrom || ''}
                    onChange={(e) => {
                      onDateFromChange?.(e.target.value || undefined);
                      // Clear year fields when using date fields
                      if (e.target.value && yearLow) onYearLowChange?.(undefined);
                    }}
                    className="dark:bg-gray-800 dark:text-gray-100"
                    disabled={isSearching}
                  />
                </div>
                <div className="w-40">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    To Date
                  </label>
                  <Input
                    type="date"
                    value={dateTo || ''}
                    onChange={(e) => {
                      onDateToChange?.(e.target.value || undefined);
                      // Clear year fields when using date fields
                      if (e.target.value && yearHigh) onYearHighChange?.(undefined);
                    }}
                    className="dark:bg-gray-800 dark:text-gray-100"
                    disabled={isSearching}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="w-28">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    From Year
                  </label>
                  <Input
                    type="number"
                    min="1900"
                    max={new Date().getFullYear()}
                    value={yearLow || ''}
                    onChange={(e) => onYearLowChange?.(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="2020"
                    className="dark:bg-gray-800 dark:text-gray-100"
                    disabled={isSearching}
                  />
                </div>
                <div className="w-28">
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                    To Year
                  </label>
                  <Input
                    type="number"
                    min="1900"
                    max={new Date().getFullYear()}
                    value={yearHigh || ''}
                    onChange={(e) => onYearHighChange?.(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="2024"
                    className="dark:bg-gray-800 dark:text-gray-100"
                    disabled={isSearching}
                  />
                </div>
              </>
            )}
          </div>

          {/* Advanced options toggle */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="p-0 h-auto text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
                {showAdvanced ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 pt-4 border-t space-y-4">
                {/* Provider-specific options */}
                {renderProviderSpecificOptions()}

                {/* Additional options */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="include_citations"
                      checked={includeCitations}
                      onChange={(e) => onIncludeCitationsChange?.(e.target.checked)}
                      disabled={isSearching}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="include_citations" className="text-sm text-gray-700 dark:text-gray-300">
                      Include Citation Information
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="include_pdf_links"
                      checked={includePdfLinks}
                      onChange={(e) => onIncludePdfLinksChange?.(e.target.checked)}
                      disabled={isSearching}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="include_pdf_links" className="text-sm text-gray-700 dark:text-gray-300">
                      Include PDF Links
                    </label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}