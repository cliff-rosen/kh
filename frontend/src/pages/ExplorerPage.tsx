import { useState, useCallback, useRef, useMemo } from 'react';
import {
    MagnifyingGlassIcon,
    FolderIcon,
    PlusIcon,
    ListBulletIcon,
    TableCellsIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useResearchStream } from '../context/ResearchStreamContext';
import { explorerApi } from '../lib/api/explorerApi';
import type { PubMedPagination } from '../lib/api/explorerApi';
import type { ExplorerArticle } from '../types/explorer';
import { collectionApi } from '../lib/api/collectionApi';
import { Collection } from '../types/collection';
import { formatArticleDate } from '../utils/dateUtils';
import ArticleViewerModal from '../components/articles/ArticleViewerModal';
import AddToCollectionModal from '../components/explorer/AddToCollectionModal';
import CreateCollectionModal from '../components/explorer/CreateCollectionModal';
import { Tablizer, type TableColumn, type RowViewerProps } from '../components/tools/Tablizer';
import ChatTray from '../components/chat/ChatTray';
import { ReportArticle } from '../types/report';

const PUBMED_PAGE_SIZE = 20;

type ViewMode = 'list' | 'table';

// Column definitions for Tablizer view
const EXPLORER_COLUMNS: TableColumn[] = [
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'authors', label: 'Authors', accessor: 'authors', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'pub_date', label: 'Date', accessor: 'pub_date', type: 'date', visible: true },
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'source_labels', label: 'Sources', accessor: 'source_labels', type: 'text', visible: true },
];

// Display type with computed fields for Tablizer
interface DisplayExplorerArticle extends ExplorerArticle {
    _key: string;
    pub_date: string;
    source_labels: string;
}

// RowViewer adapter: maps ExplorerArticle[] to what ArticleViewerModal expects
function ExplorerRowViewer({ data, initialIndex, onClose }: RowViewerProps<DisplayExplorerArticle>) {
    const viewerArticles: ReportArticle[] = data.map(a => ({
        article_id: a.article_id || 0,
        title: a.title,
        authors: Array.isArray(a.authors) ? a.authors : a.authors ? [a.authors] : [],
        journal: a.journal,
        pmid: a.pmid,
        doi: a.doi,
        abstract: a.abstract,
        url: a.url,
        pub_year: a.pub_year,
        pub_month: a.pub_month,
        pub_day: a.pub_day,
    }));
    return (
        <ArticleViewerModal
            articles={viewerArticles}
            initialIndex={initialIndex}
            onClose={onClose}
        />
    );
}


export default function ExplorerPage() {
    const { researchStreams } = useResearchStream();

    // Search state
    const [query, setQuery] = useState('');
    const [selectedStreamIds, setSelectedStreamIds] = useState<number[]>([]);
    const [searchCollections, setSearchCollections] = useState(false);
    const [searchPubmed, setSearchPubmed] = useState(false);
    const [searchStreams, setSearchStreams] = useState(true);
    const [results, setResults] = useState<ExplorerArticle[]>([]);
    const [localCount, setLocalCount] = useState(0);
    const [sourcesSearched, setSourcesSearched] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // PubMed pagination — accumulate across pages
    const [pubmedPagination, setPubmedPagination] = useState<PubMedPagination | null>(null);
    const totalPubmedLoaded = useRef(0);
    const totalPubmedOverlaps = useRef(0);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // View mode
    const [viewMode, setViewMode] = useState<ViewMode>('list');

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Chat
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Modals
    const [viewerArticles, setViewerArticles] = useState<ReportArticle[]>([]);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [showAddToCollection, setShowAddToCollection] = useState(false);
    const [showCreateCollection, setShowCreateCollection] = useState(false);
    const [collections, setCollections] = useState<Collection[]>([]);

    const articleKey = (a: ExplorerArticle) =>
        a.article_id ? `id:${a.article_id}` : `pmid:${a.pmid}`;

    // Tablizer display data with computed fields
    const displayResults: DisplayExplorerArticle[] = useMemo(() =>
        results.map(a => ({
            ...a,
            _key: a.article_id ? `id:${a.article_id}` : `pmid:${a.pmid}`,
            pub_date: formatArticleDate(a.pub_year, a.pub_month, a.pub_day),
            source_labels: a.sources.map(s =>
                s.report_name ? `${s.name} · ${s.report_name}` : s.name
            ).join(', '),
        })),
        [results]
    );

    // Chat context
    const chatContext = useMemo(() => ({
        current_page: 'explorer',
        search_query: query,
        sources: { streams: searchStreams, collections: searchCollections, pubmed: searchPubmed },
        selected_stream_ids: selectedStreamIds,
        result_count: results.length,
        local_count: localCount,
        pubmed_total: pubmedPagination?.total ?? 0,
        selected_count: selectedIds.size,
        view_mode: viewMode,
    }), [query, searchStreams, searchCollections, searchPubmed,
         selectedStreamIds, results, localCount, pubmedPagination,
         selectedIds, viewMode]);

    const buildSearchParams = useCallback((pubmedOffset = 0) => ({
        q: query.trim(),
        include_streams: searchStreams,
        stream_ids: searchStreams && selectedStreamIds.length > 0 ? selectedStreamIds : undefined,
        include_collections: searchCollections,
        include_pubmed: searchPubmed,
        pubmed_limit: PUBMED_PAGE_SIZE,
        pubmed_offset: pubmedOffset,
    }), [query, searchStreams, selectedStreamIds, searchCollections, searchPubmed]);

    const handleSearch = useCallback(async () => {
        if (!query.trim()) return;
        setLoading(true);
        setHasSearched(true);
        setSelectedIds(new Set());
        totalPubmedLoaded.current = 0;
        totalPubmedOverlaps.current = 0;
        try {
            const resp = await explorerApi.search(buildSearchParams(0));
            setResults(resp.articles);
            setLocalCount(resp.local_count);
            setSourcesSearched(resp.sources_searched);
            setPubmedPagination(resp.pubmed);
            if (resp.pubmed) {
                totalPubmedLoaded.current = resp.pubmed.returned;
                totalPubmedOverlaps.current = resp.pubmed.overlap_count;
            }
        } catch (err) {
            console.error('Explorer search failed:', err);
        } finally {
            setLoading(false);
        }
    }, [query, buildSearchParams]);

    const handleLoadMorePubMed = useCallback(async () => {
        if (!pubmedPagination?.has_more || loadingMore) return;
        const nextOffset = pubmedPagination.offset + PUBMED_PAGE_SIZE;
        setLoadingMore(true);
        try {
            const resp = await explorerApi.search(buildSearchParams(nextOffset));
            const newPubmedArticles = resp.articles.filter(a => !a.is_local);
            setResults(prev => [...prev, ...newPubmedArticles]);
            setPubmedPagination(resp.pubmed);
            if (resp.pubmed) {
                totalPubmedLoaded.current += resp.pubmed.returned;
                totalPubmedOverlaps.current += resp.pubmed.overlap_count;
            }
        } catch (err) {
            console.error('Failed to load more PubMed results:', err);
        } finally {
            setLoadingMore(false);
        }
    }, [buildSearchParams, pubmedPagination, loadingMore]);

    const toggleSelect = (key: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === results.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(results.map(articleKey)));
        }
    };

    const selectedArticles = results.filter(a => selectedIds.has(articleKey(a)));

    const openViewer = (article: ExplorerArticle) => {
        const viewerList: ReportArticle[] = results.map(a => ({
            article_id: a.article_id || 0,
            title: a.title,
            authors: Array.isArray(a.authors) ? a.authors : a.authors ? [a.authors] : [],
            journal: a.journal,
            pmid: a.pmid,
            doi: a.doi,
            abstract: a.abstract,
            url: a.url,
            pub_year: a.pub_year,
            pub_month: a.pub_month,
            pub_day: a.pub_day,
        }));
        setViewerArticles(viewerList);
        setViewerIndex(results.findIndex(a => articleKey(a) === articleKey(article)));
    };

    const openAddToCollection = async () => {
        try {
            const colls = await collectionApi.list();
            setCollections(colls);
            setShowAddToCollection(true);
        } catch (err) {
            console.error('Failed to load collections:', err);
        }
    };

    const formatAuthors = (authors: string | string[] | null): string => {
        if (!authors) return '';
        if (typeof authors === 'string') return authors;
        if (Array.isArray(authors) && authors.length > 0) {
            const display = authors.slice(0, 3).join(', ');
            return authors.length > 3 ? display + ' et al.' : display;
        }
        return '';
    };

    const pubmedTotal = pubmedPagination?.total ?? 0;
    const hasResults = hasSearched && !loading && results.length > 0;

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-2 mb-3">
                    <MagnifyingGlassIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Explorer</h1>
                </div>

                {/* Search bar */}
                <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Search articles by title, abstract, keywords..."
                            className="w-full pl-10 pr-8 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {query && (
                            <button
                                onClick={() => { setQuery(''); setResults([]); setSelectedIds(new Set()); searchInputRef.current?.focus(); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title="Clear search"
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={loading || !query.trim()}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                    >
                        {loading ? 'Searching...' : 'Search'}
                    </button>
                </div>

                {/* Source toggles + view toggle */}
                <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Sources:</span>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={searchStreams}
                                onChange={e => setSearchStreams(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300">Streams</span>
                        </label>
                        {searchStreams && researchStreams.length > 0 && (
                            <select
                                value={selectedStreamIds.length === 0 ? '' : selectedStreamIds[0]}
                                onChange={e => setSelectedStreamIds(e.target.value ? [Number(e.target.value)] : [])}
                                className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                                <option value="">All streams</option>
                                {researchStreams.map(s => (
                                    <option key={s.stream_id} value={s.stream_id}>{s.stream_name}</option>
                                ))}
                            </select>
                        )}

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={searchCollections}
                                onChange={e => setSearchCollections(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300">Collections</span>
                        </label>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={searchPubmed}
                                onChange={e => setSearchPubmed(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300">PubMed</span>
                        </label>
                    </div>

                    {/* View toggle */}
                    {hasResults && (
                        <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 ${viewMode === 'list'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                                title="List view"
                            >
                                <ListBulletIcon className="h-4 w-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`p-1.5 ${viewMode === 'table'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                                title="Table view"
                            >
                                <TableCellsIcon className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 min-h-0 flex flex-col">
                {!hasSearched ? (
                    <div className="flex items-center justify-center flex-1">
                        <div className="text-center">
                            <MagnifyingGlassIcon className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-gray-400">Search across your streams, collections, and PubMed</p>
                        </div>
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center flex-1">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                ) : results.length === 0 ? (
                    <div className="flex items-center justify-center flex-1">
                        <p className="text-gray-500 dark:text-gray-400">No results found</p>
                    </div>
                ) : viewMode === 'table' ? (
                    /* ===== TABLE VIEW ===== */
                    <div className="flex-1 min-h-0 flex flex-col">
                        {/* PubMed notice if more are available */}
                        {searchPubmed && pubmedPagination?.has_more && (
                            <div className="flex-shrink-0 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400 flex items-center justify-between">
                                <span>
                                    Table shows {results.length} articles. {pubmedTotal.toLocaleString()} PubMed matches available — load more in list view before switching to table.
                                </span>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className="text-amber-800 dark:text-amber-300 underline hover:no-underline ml-4 flex-shrink-0"
                                >
                                    Switch to list
                                </button>
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <Tablizer<DisplayExplorerArticle>
                                data={displayResults}
                                idField="_key"
                                columns={EXPLORER_COLUMNS}
                                rowLabel="articles"
                                itemType="article"
                                RowViewer={ExplorerRowViewer}
                                selectedIds={selectedIds}
                                onToggleSelect={toggleSelect}
                                onToggleSelectAll={toggleSelectAll}
                            />
                        </div>
                    </div>
                ) : (
                    /* ===== LIST VIEW ===== */
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <div className="p-4">
                            {/* Status panel */}
                            <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                        {localCount > 0 && (
                                            <span className="text-gray-700 dark:text-gray-300">
                                                <span className="font-semibold">{localCount}</span>
                                                {' from '}
                                                {sourcesSearched.filter(s => s !== 'pubmed').join(' & ') || 'local'}
                                            </span>
                                        )}
                                        {searchPubmed && pubmedPagination && (
                                            <span className="text-gray-700 dark:text-gray-300">
                                                <span className="font-semibold">{pubmedTotal.toLocaleString()}</span>
                                                {' found on PubMed'}
                                                {pubmedTotal > 0 && (
                                                    <span className="text-gray-500 dark:text-gray-400">
                                                        {' '}(showing {totalPubmedLoaded.current + totalPubmedOverlaps.current} of {pubmedTotal.toLocaleString()}
                                                        {totalPubmedOverlaps.current > 0 && (
                                                            <>, {totalPubmedOverlaps.current} already in your local results</>
                                                        )}
                                                        )
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0 ml-4"
                                    >
                                        {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                            </div>

                            {/* Unified article list */}
                            <div className="space-y-2">
                                {results.map(article => (
                                    <ArticleCard
                                        key={articleKey(article)}
                                        article={article}
                                        isSelected={selectedIds.has(articleKey(article))}
                                        onToggleSelect={() => toggleSelect(articleKey(article))}
                                        onOpen={() => openViewer(article)}
                                        formatAuthors={formatAuthors}
                                    />
                                ))}
                            </div>

                            {/* Load More for PubMed */}
                            {searchPubmed && pubmedPagination?.has_more && (
                                <div className="mt-4 flex flex-col items-center gap-2">
                                    <button
                                        onClick={handleLoadMorePubMed}
                                        disabled={loadingMore}
                                        className="px-5 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                                    >
                                        {loadingMore ? (
                                            <span className="inline-flex items-center gap-2">
                                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></span>
                                                Loading...
                                            </span>
                                        ) : (
                                            'Load More PubMed Results'
                                        )}
                                    </button>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        Showing {totalPubmedLoaded.current + totalPubmedOverlaps.current} of {pubmedTotal.toLocaleString()} PubMed matches
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky action bar */}
            {selectedIds.size > 0 && (
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {selectedIds.size} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Clear
                            </button>
                            <button
                                onClick={openAddToCollection}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                                <FolderIcon className="h-4 w-4" />
                                Add to Collection
                            </button>
                            <button
                                onClick={() => setShowCreateCollection(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20"
                            >
                                <PlusIcon className="h-4 w-4" />
                                New Collection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Article Viewer Modal */}
            {viewerArticles.length > 0 && (
                <ArticleViewerModal
                    articles={viewerArticles}
                    initialIndex={viewerIndex}
                    onClose={() => setViewerArticles([])}
                />
            )}

            {/* Add to Existing Collection Modal */}
            {showAddToCollection && (
                <AddToCollectionModal
                    collections={collections}
                    selectedArticles={selectedArticles}
                    onClose={() => setShowAddToCollection(false)}
                    onComplete={() => { setShowAddToCollection(false); setSelectedIds(new Set()); }}
                />
            )}

            {/* Create New Collection Modal */}
            {showCreateCollection && (
                <CreateCollectionModal
                    selectedArticles={selectedArticles}
                    onClose={() => setShowCreateCollection(false)}
                    onComplete={() => { setShowCreateCollection(false); setSelectedIds(new Set()); }}
                />
            )}

            <ChatTray initialContext={chatContext} isOpen={isChatOpen} onOpenChange={setIsChatOpen} />
        </div>
    );
}


/** Reusable article card for list view */
function ArticleCard({ article, isSelected, onToggleSelect, onOpen, formatAuthors }: {
    article: ExplorerArticle;
    isSelected: boolean;
    onToggleSelect: () => void;
    onOpen: () => void;
    formatAuthors: (authors: string | string[] | null) => string;
}) {
    return (
        <div
            className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                isSelected
                    ? 'border-blue-300 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
        >
            <div className="flex-shrink-0 pt-1">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={onToggleSelect}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
            </div>
            <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={onOpen}
            >
                <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1 hover:underline">
                    {article.title}
                </h4>
                {article.authors && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        {formatAuthors(article.authors)}
                    </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500 mb-1.5">
                    {article.journal && <span>{article.journal}</span>}
                    {article.pub_year && <span>· {article.pub_year}</span>}
                    {article.pmid && <span>· PMID: {article.pmid}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {article.sources.map((src, i) => (
                        <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                                src.type === 'stream'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                    : src.type === 'collection'
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            }`}
                        >
                            {src.type === 'collection' && <FolderIcon className="h-3 w-3" />}
                            {src.name}
                            {src.report_name && ` · ${src.report_name}`}
                        </span>
                    ))}
                    {!article.is_local && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                            PubMed only — will be imported on add
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
