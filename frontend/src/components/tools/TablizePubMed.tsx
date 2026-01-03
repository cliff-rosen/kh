import { useState } from 'react';
import { PlayIcon, TableCellsIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Tablizer } from './Tablizer';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { toolsApi } from '../../lib/api/toolsApi';

const FILTER_LIMIT = 500;  // Max articles to fetch for filtering
const DISPLAY_LIMIT = 100; // Max articles to display in table

export default function TablizePubMed() {
    // Search form state
    const [query, setQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateType, setDateType] = useState<'publication' | 'entry'>('publication');

    // Results state
    const [allArticles, setAllArticles] = useState<CanonicalResearchArticle[]>([]); // Up to 500 for filtering
    const [totalMatched, setTotalMatched] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) {
            setError('Please enter a search query');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await toolsApi.searchPubMed({
                query: query,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                dateType: dateType,
                maxResults: FILTER_LIMIT  // Fetch up to 500 for filtering
            });
            setAllArticles(response.articles);
            setTotalMatched(response.total_results);
            setHasSearched(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Articles to display (first 100)
    const displayArticles = allArticles.slice(0, DISPLAY_LIMIT);

    // Build title with counts
    const buildTitle = () => {
        if (allArticles.length === 0) return 'Search Results';

        const parts = [`Showing ${displayArticles.length}`];
        if (allArticles.length > displayArticles.length) {
            parts[0] += ` of ${allArticles.length} fetched`;
        }
        if (totalMatched > allArticles.length) {
            parts.push(`(${totalMatched.toLocaleString()} total matches)`);
        }
        return parts.join(' ');
    };

    return (
        <div className="space-y-6">
            {/* Search Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Search PubMed
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Query */}
                    <div className="lg:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Query
                        </label>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="e.g., diabetes treatment"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    {/* Start Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>

                    {/* Date Type + Search Button */}
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Date Type
                            </label>
                            <select
                                value={dateType}
                                onChange={(e) => setDateType(e.target.value as 'publication' | 'entry')}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                                <option value="publication">Publication</option>
                                <option value="entry">Entry</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleSearch}
                                disabled={loading || !query.trim()}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Searching...
                                    </>
                                ) : (
                                    <>
                                        <PlayIcon className="h-4 w-4" />
                                        Search
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                        {error}
                    </div>
                )}
            </div>

            {/* Limit Warning */}
            {hasSearched && totalMatched > FILTER_LIMIT && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Note:</strong> Your search matched {totalMatched.toLocaleString()} articles, but only the first {FILTER_LIMIT} are available for AI analysis.
                        Consider narrowing your search with date filters or more specific terms.
                    </div>
                </div>
            )}

            {/* Results */}
            {hasSearched && (
                allArticles.length > 0 ? (
                    <Tablizer
                        title={buildTitle()}
                        articles={displayArticles}
                        filterArticles={allArticles}  // All 500 for AI column processing
                    />
                ) : (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                        No articles found for your search.
                    </div>
                )
            )}

            {/* Initial state */}
            {!hasSearched && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                    <TableCellsIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Search PubMed to load articles into the Tablizer.</p>
                    <p className="text-sm mt-1">Add AI-powered columns to analyze and enrich your results.</p>
                </div>
            )}
        </div>
    );
}
