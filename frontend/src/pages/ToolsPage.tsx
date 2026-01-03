import { useState } from 'react';
import { WrenchScrewdriverIcon, MagnifyingGlassIcon, DocumentTextIcon, DocumentMagnifyingGlassIcon, TableCellsIcon, PlayIcon } from '@heroicons/react/24/outline';
import PubMedIdChecker from '../components/tools/PubMedIdChecker';
import PubMedSearch from '../components/tools/PubMedSearch';
import { DocumentAnalysis } from '../components/tools/DocumentAnalysis';
import { Tablizer } from '../components/tools/Tablizer';
import { CanonicalResearchArticle } from '../types/canonical_types';
import { toolsApi } from '../lib/api/toolsApi';

type ToolTab = 'search' | 'id-checker' | 'document-analysis' | 'tablizer';

const tabs: { id: ToolTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
        id: 'search',
        label: 'PubMed Search',
        description: 'Search PubMed with custom queries and date filters',
        icon: DocumentTextIcon,
    },
    {
        id: 'id-checker',
        label: 'PubMed ID Checker',
        description: 'Test which PubMed IDs are captured by a search query',
        icon: MagnifyingGlassIcon,
    },
    {
        id: 'document-analysis',
        label: 'Document Analysis',
        description: 'AI-powered document summarization and extraction',
        icon: DocumentMagnifyingGlassIcon,
    },
    {
        id: 'tablizer',
        label: 'Tablizer',
        description: 'AI-powered table enrichment with generated columns',
        icon: TableCellsIcon,
    },
];

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState<ToolTab>('search');

    // Tablizer search state
    const [tablizeQuery, setTablizeQuery] = useState('');
    const [tablizeStartDate, setTablizeStartDate] = useState('');
    const [tablizeEndDate, setTablizeEndDate] = useState('');
    const [tablizeDateType, setTablizeDateType] = useState<'publication' | 'entry'>('publication');
    const [tablizeArticles, setTablizeArticles] = useState<CanonicalResearchArticle[]>([]);
    const [tablizeLoading, setTablizeLoading] = useState(false);
    const [tablizeError, setTablizeError] = useState<string | null>(null);
    const [tablizeSearched, setTablizeSearched] = useState(false);

    const handleTablizeSearch = async () => {
        if (!tablizeQuery.trim()) {
            setTablizeError('Please enter a search query');
            return;
        }

        setTablizeLoading(true);
        setTablizeError(null);

        try {
            const response = await toolsApi.searchPubMed({
                query: tablizeQuery,
                startDate: tablizeStartDate || undefined,
                endDate: tablizeEndDate || undefined,
                dateType: tablizeDateType,
                maxResults: 100
            });
            setTablizeArticles(response.articles);
            setTablizeSearched(true);
        } catch (err) {
            setTablizeError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setTablizeLoading(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <WrenchScrewdriverIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Tools
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Utilities for testing and analyzing search queries
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                        ${isActive
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Active Tool */}
            <div>
                {activeTab === 'search' && <PubMedSearch />}
                {activeTab === 'id-checker' && <PubMedIdChecker />}
                {activeTab === 'document-analysis' && <DocumentAnalysis />}
                {activeTab === 'tablizer' && (
                    <div className="space-y-6">
                        {/* Search Form */}
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                                Search PubMed
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Query */}
                                <div className="lg:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Query
                                    </label>
                                    <input
                                        type="text"
                                        value={tablizeQuery}
                                        onChange={(e) => setTablizeQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleTablizeSearch()}
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
                                        value={tablizeStartDate}
                                        onChange={(e) => setTablizeStartDate(e.target.value)}
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
                                        value={tablizeEndDate}
                                        onChange={(e) => setTablizeEndDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                {/* Date Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Date Type
                                    </label>
                                    <select
                                        value={tablizeDateType}
                                        onChange={(e) => setTablizeDateType(e.target.value as 'publication' | 'entry')}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="publication">Publication Date</option>
                                        <option value="entry">Entry Date</option>
                                    </select>
                                </div>

                                {/* Search Button */}
                                <div className="flex items-end">
                                    <button
                                        onClick={handleTablizeSearch}
                                        disabled={tablizeLoading || !tablizeQuery.trim()}
                                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {tablizeLoading ? (
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

                            {/* Error */}
                            {tablizeError && (
                                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                                    {tablizeError}
                                </div>
                            )}
                        </div>

                        {/* Results */}
                        {tablizeSearched && (
                            tablizeArticles.length > 0 ? (
                                <Tablizer
                                    title={`Search Results (${tablizeArticles.length} articles)`}
                                    articles={tablizeArticles}
                                />
                            ) : (
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                                    No articles found for your search.
                                </div>
                            )
                        )}

                        {/* Initial state */}
                        {!tablizeSearched && (
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                                <TableCellsIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>Search PubMed to load articles into the Tablizer.</p>
                                <p className="text-sm mt-1">Add AI-powered columns to analyze and enrich your results.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
