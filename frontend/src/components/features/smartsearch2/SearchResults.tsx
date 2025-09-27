import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import {
    ExternalLink,
    Grid,
    List,
    Table,
    Plus,
    Sparkles,
    ArrowUp,
    ArrowDown,
    X,
    Filter,
    BookOpen,
    FileSpreadsheet,
    FileText,
    Copy
} from 'lucide-react';

import { exportToCSV, copyPMIDsToClipboard, exportToPDF } from '@/lib/utils/exportUtils';

import type { SmartSearchArticle, SearchPaginationInfo } from '@/types/smart-search';
import type { CanonicalFeatureDefinition } from '@/types/canonical_types';


interface SearchResultsProps {
    articles: SmartSearchArticle[];
    pagination: SearchPaginationInfo | null;
    isSearching: boolean;
    onQueryUpdate: (newQuery: string) => void;
    onSearch: () => void;
    onLoadMore?: () => void;

    // Feature extraction props
    appliedFeatures: CanonicalFeatureDefinition[];
    pendingFeatures: CanonicalFeatureDefinition[];
    isExtracting: boolean;
    onAddFeature: (feature: Omit<CanonicalFeatureDefinition, 'id'>) => void;
    onRemovePendingFeature: (featureId: string) => void;
    onExtractFeatures: () => void;

    // New functionality props
    evidenceSpec?: string;
    onFilter?: () => void;
    onAddGoogleScholar?: () => void;
    isFiltering?: boolean;
    isAddingScholar?: boolean;

    // Filter state
    filteringStats?: {
        total_processed: number;
        total_accepted: number;
        total_rejected: number;
        average_confidence: number;
        duration_seconds: number;
    } | null;
    hasFiltered?: boolean;
    hasPendingFilter?: boolean;
    onAcceptFilter?: () => void;
    onUndoFilter?: () => void;

    // UI state is now managed internally

    // Export props (optional for backward compatibility)
    searchQuery?: string;
}

export function SearchResults({
    articles,
    pagination,
    isSearching,
    onLoadMore,
    appliedFeatures,
    pendingFeatures,
    isExtracting,
    onAddFeature,
    onRemovePendingFeature,
    onExtractFeatures,
    evidenceSpec,
    onFilter,
    onAddGoogleScholar,
    isFiltering,
    isAddingScholar,
    filteringStats,
    hasFiltered,
    hasPendingFilter,
    onAcceptFilter,
    onUndoFilter,
    searchQuery
}: SearchResultsProps) {
    
    const resolveArticleSourceLabel = (article: SmartSearchArticle): string => {
        const src = (article.source || '').toLowerCase();
        if (src.includes('pubmed')) return 'PubMed';
        if (src.includes('scholar')) return 'Google Scholar';
        // Fallback: inspect metadata hints
        const provider = (article.source_metadata as any)?.provider || '';
        const providerLc = (provider || '').toLowerCase();
        if (providerLc.includes('pubmed')) return 'PubMed';
        if (providerLc.includes('scholar')) return 'Google Scholar';
        return 'Unknown Source';
    };

    const resolveCollectionSourceLabel = (): string => {
        const unique = new Set<string>();
        for (const a of articles) {
            const label = resolveArticleSourceLabel(a);
            unique.add(label);
            if (unique.size > 1) break;
        }
        if (unique.size === 0) return 'No Source';
        if (unique.size === 1) return Array.from(unique)[0];
        return 'Mixed Sources';
    };

    const isPubMedOnly = articles.length > 0 && articles.every(a => resolveArticleSourceLabel(a) === 'PubMed');

    const { toast } = useToast();

    // UI State - now managed internally
    const [displayMode, setDisplayMode] = useState<'table' | 'card-compressed' | 'card-full'>('table');
    const [sortColumn, setSortColumn] = useState<string>('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    // AI Columns State
    const [showColumns, setShowColumns] = useState(false);
    const [newFeature, setNewFeature] = useState<CanonicalFeatureDefinition>({
        id: '',
        name: '',
        description: '',
        type: 'text'
    });


    // AI Columns functionality
    const handleAddFeature = () => {
        if (!newFeature.name.trim() || !newFeature.description.trim()) {
            return;
        }

        onAddFeature({
            name: newFeature.name,
            description: newFeature.description,
            type: newFeature.type
        });

        setNewFeature({
            id: '',
            name: '',
            description: '',
            type: 'text'
        });
    };

    // Sort handler
    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    // Export handlers
    const handleExportCSV = () => {
        try {
            const result = exportToCSV(articles, appliedFeatures);
            toast({
                title: 'Export Successful',
                description: result.message,
                variant: 'default'
            });
        } catch (error) {
            console.error('Export to CSV failed:', error);
            toast({
                title: 'Export Failed',
                description: 'Failed to export articles to CSV',
                variant: 'destructive'
            });
        }
    };

    const handleCopyPMIDs = async () => {
        try {
            const result = await copyPMIDsToClipboard(articles);
            if (result.success) {
                toast({
                    title: 'PMIDs Copied',
                    description: result.message,
                    variant: 'default'
                });
            } else {
                toast({
                    title: 'Copy Failed',
                    description: result.message,
                    variant: 'destructive'
                });
            }
        } catch (error) {
            console.error('Copy PMIDs failed:', error);
            toast({
                title: 'Copy Failed',
                description: 'Failed to copy PubMed IDs to clipboard',
                variant: 'destructive'
            });
        }
    };

    const handleExportPDF = () => {
        try {
            const result = exportToPDF(
                articles,
                searchQuery,
                evidenceSpec,
                appliedFeatures
            );
            toast({
                title: 'PDF Export',
                description: result.message,
                variant: 'default'
            });
        } catch (error) {
            console.error('Export to PDF failed:', error);
            toast({
                title: 'Export Failed',
                description: 'Failed to open PDF export dialog',
                variant: 'destructive'
            });
        }
    };

    // Check if any articles have been filtered
    const hasFilteredResults = hasPendingFilter || hasFiltered;

    const getSortedArticles = () => {
        if (!sortColumn) return articles;

        return [...articles].sort((a, b) => {
            let aVal = '';
            let bVal = '';

            switch (sortColumn) {
                case 'title':
                    aVal = a.title || '';
                    bVal = b.title || '';
                    break;
                case 'year':
                    aVal = a.publication_year?.toString() || '';
                    bVal = b.publication_year?.toString() || '';
                    break;
                case 'authors':
                    aVal = a.authors?.join(', ') || '';
                    bVal = b.authors?.join(', ') || '';
                    break;
                case 'journal':
                    aVal = a.journal || '';
                    bVal = b.journal || '';
                    break;
                default:
                    return 0;
            }

            const comparison = aVal.localeCompare(bVal);
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    };

    const sortedArticles = getSortedArticles();

    const renderTableView = () => {
        return (
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                <button
                                    onClick={() => handleSort('title')}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    Title
                                    {sortColumn === 'title' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </button>
                            </th>
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                <button
                                    onClick={() => handleSort('authors')}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    Authors
                                    {sortColumn === 'authors' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </button>
                            </th>
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                <button
                                    onClick={() => handleSort('year')}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    Year
                                    {sortColumn === 'year' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </button>
                            </th>
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                <button
                                    onClick={() => handleSort('journal')}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    Journal
                                    {sortColumn === 'journal' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </button>
                            </th>
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                <button
                                    onClick={() => handleSort('pmid')}
                                    className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                    PMID
                                    {sortColumn === 'pmid' && (
                                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                    )}
                                </button>
                            </th>
                            {appliedFeatures.map(feature => (
                                <th key={feature.id} className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">
                                    {feature.name}
                                </th>
                            ))}
                            {hasPendingFilter && (
                                <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">Filter Status</th>
                            )}
                            <th className="text-left p-3 font-medium text-gray-900 dark:text-gray-100">Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedArticles.map((article, index) => {
                            const hasFilterResult = article.filterStatus !== null;
                            const passed = hasFilterResult ? article.filterStatus!.passed : null;

                            return (
                                <tr key={index} className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${hasFilterResult ? (passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20') : ''
                                    }`}>
                                    <td className="p-3 text-sm text-gray-900 dark:text-gray-100">
                                        {article.title}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                        {article.authors?.slice(0, 2).join(', ')}
                                        {article.authors && article.authors.length > 2 && ' et al.'}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                        {article.publication_year}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                        {article.journal}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                        {article.pmid || '-'}
                                    </td>
                                    {appliedFeatures.map(feature => (
                                        <td key={feature.id} className="p-3 text-sm text-gray-600 dark:text-gray-400">
                                            {article.extracted_features?.[feature.id] || '-'}
                                        </td>
                                    ))}
                                    {hasPendingFilter && (
                                        <td className="p-3 text-sm">
                                            {hasFilterResult ? (
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant={passed ? "default" : "destructive"}
                                                        className={passed ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}
                                                    >
                                                        {passed ? "✓ Accepted" : "✗ Rejected"}
                                                    </Badge>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {Math.round(article.filterStatus!.confidence * 100)}%
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-500">Not filtered</span>
                                            )}
                                        </td>
                                    )}
                                    <td className="p-3">
                                        {article.url && (
                                            <a
                                                href={article.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderCardView = (compressed: boolean = true) => (
        <div className={`space-y-${compressed ? '3' : '4'}`}>
            {sortedArticles.map((article, index) => {
                const hasFilterResult = article.filterStatus !== null;
                const passed = hasFilterResult ? article.filterStatus!.passed : null;

                return (
                    <div
                        key={index}
                        className={`border border-gray-200 dark:border-gray-700 rounded-lg ${compressed ? 'p-4' : 'p-6'} hover:bg-gray-50 dark:hover:bg-gray-800 ${hasFilterResult ? (passed ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20') : ''
                            }`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <h4 className={`font-medium text-gray-900 dark:text-white ${compressed ? 'mb-2' : 'mb-3'}`}>
                                    {article.title || 'Untitled'}
                                </h4>
                                <p className={`text-sm text-gray-600 dark:text-gray-400 ${compressed ? 'mb-2' : 'mb-3'}`}>
                                    {article.authors?.slice(0, 3).join(', ')}
                                    {article.authors && article.authors.length > 3 && ' et al.'}
                                </p>
                                <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
                                    {article.journal && <span>{article.journal}</span>}
                                    {article.publication_year && <span>{article.publication_year}</span>}
                                    <Badge variant="outline" className="text-xs">
                                        {resolveArticleSourceLabel(article)}
                                    </Badge>
                                </div>

                                {!compressed && article.abstract && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 line-clamp-3">
                                        {article.abstract}
                                    </p>
                                )}

                                {appliedFeatures.length > 0 && (
                                    <div className={`${compressed ? 'mt-2' : 'mt-4'} space-y-1`}>
                                        {appliedFeatures.map(feature => (
                                            <div key={feature.id} className="flex items-center gap-2 text-xs">
                                                <span className="font-medium text-gray-700 dark:text-gray-300">{feature.name}:</span>
                                                <span className="text-gray-600 dark:text-gray-400">
                                                    {article.extracted_features?.[feature.id] || '-'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {hasPendingFilter && hasFilterResult && (
                                    <div className={`${compressed ? 'mt-2' : 'mt-4'} flex items-center gap-2`}>
                                        <Badge
                                            variant={passed ? "default" : "destructive"}
                                            className={passed ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}
                                        >
                                            {passed ? "✓ Accepted" : "✗ Rejected"}
                                        </Badge>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            Confidence: {Math.round(article.filterStatus!.confidence * 100)}%
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col items-end gap-2">
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
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="space-y-3">
            {/* Enhanced Controls Bar with Actions and View Controls */}
            <div className="flex flex-col gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                {/* Filtered Group Indicator - Only show when filtered */}
                {hasFiltered && (
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        <Label className="text-sm font-medium text-purple-600 dark:text-purple-400">Filtered Group</Label>
                        <div className="flex-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
                            <span className="text-xs text-purple-700 dark:text-purple-300">
                                {filteringStats ? `${filteringStats.total_accepted} of ${filteringStats.total_processed} articles passed filter (${Math.round(filteringStats.average_confidence * 100)}% avg confidence)` : 'Custom filtered article group'}
                            </span>
                        </div>
                        {hasPendingFilter && (onAcceptFilter || onUndoFilter) && (
                            <div className="flex gap-2">
                                {onAcceptFilter && (
                                    <Button
                                        onClick={onAcceptFilter}
                                        variant="outline"
                                        size="sm"
                                        className="flex-shrink-0 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                                    >
                                        Accept
                                    </Button>
                                )}
                                {onUndoFilter && (
                                    <Button
                                        onClick={onUndoFilter}
                                        variant="outline"
                                        size="sm"
                                        className="flex-shrink-0 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                        <X className="w-3 h-3 mr-1" />
                                        Undo
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Bottom Row: Source, Actions, and Controls */}
                <div className="flex items-center justify-between">
                    {/* Left: Source and Counts */}
                    <div className="flex items-center gap-4 text-sm">
                        <Badge variant="outline">{resolveCollectionSourceLabel()}</Badge>
                        {hasFilteredResults && (
                            <div className="flex items-center gap-2">
                                <Badge variant="default" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    <Filter className="w-3 h-3 mr-1" />
                                    Filtered
                                </Badge>
                                {hasPendingFilter && (onAcceptFilter || onUndoFilter) && (
                                    <div className="flex gap-1">
                                        {onAcceptFilter && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={onAcceptFilter}
                                                className="h-6 px-2 text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200"
                                            >
                                                Accept
                                            </Button>
                                        )}
                                        {onUndoFilter && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={onUndoFilter}
                                                className="h-6 px-2 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                                            >
                                                <X className="w-3 h-3 mr-1" />
                                                Undo
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        <span className="text-gray-600 dark:text-gray-400">
                            {filteringStats ? (
                                `${filteringStats.total_accepted}/${filteringStats.total_processed} articles (${Math.round((filteringStats.total_accepted / filteringStats.total_processed) * 100)}% passed)`
                            ) : hasFiltered ? (
                                `${articles.length.toLocaleString()} filtered articles`
                            ) : (
                                `${pagination ? `${pagination.total_available.toLocaleString()} total • ` : ''}${articles.length.toLocaleString()} retrieved`
                            )}
                        </span>
                    </div>

                    {/* Center: Action Buttons */}
                    <div className="flex items-center gap-2">
                        {onFilter && (
                            <Button
                                onClick={onFilter}
                                disabled={isFiltering || hasPendingFilter}
                                variant="outline"
                                size="sm"
                                title={
                                    hasPendingFilter
                                        ? "Please accept or undo the current filter before applying a new one"
                                        : evidenceSpec
                                            ? "Filter using existing evidence specification"
                                            : "Filter results (evidence spec required)"
                                }
                            >
                                {isFiltering ? (
                                    <>
                                        <div className="animate-spin mr-2 h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                                        Filtering...
                                    </>
                                ) : hasPendingFilter ? (
                                    <>
                                        <Filter className="w-3 h-3 mr-2 opacity-50" />
                                        Filter (Pending)
                                    </>
                                ) : (
                                    <>
                                        <Filter className="w-3 h-3 mr-2" />
                                        AI Filter
                                    </>
                                )}
                            </Button>
                        )}
                        {onAddGoogleScholar && isPubMedOnly && (
                            <Button
                                onClick={onAddGoogleScholar}
                                disabled={isAddingScholar}
                                variant="outline"
                                size="sm"
                                title="Add Google Scholar results to enrich current results"
                            >
                                {isAddingScholar ? (
                                    <>
                                        <div className="animate-spin mr-2 h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <BookOpen className="w-3 h-3 mr-2" />
                                        + Scholar
                                    </>
                                )}
                            </Button>
                        )}
                    </div>

                    {/* Right: View Controls and AI Columns */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <Button
                                variant={displayMode === 'table' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setDisplayMode('table')}
                            >
                                <Table className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={displayMode === 'card-compressed' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setDisplayMode('card-compressed')}
                            >
                                <List className="w-4 h-4" />
                            </Button>
                            <Button
                                variant={displayMode === 'card-full' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setDisplayMode('card-full')}
                            >
                                <Grid className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Export buttons */}
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportCSV}
                                disabled={articles.length === 0}
                                title="Export as CSV"
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyPMIDs}
                                disabled={articles.length === 0}
                                title="Copy PubMed IDs to clipboard"
                            >
                                <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportPDF}
                                disabled={articles.length === 0}
                                title="Export as PDF"
                            >
                                <FileText className="w-4 h-4" />
                            </Button>
                        </div>

                        <Button
                            variant={showColumns ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setShowColumns(!showColumns)}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            AI Columns
                        </Button>
                    </div>
                </div>
            </div>

            {/* AI Columns Panel */}
            <Collapsible open={showColumns} onOpenChange={setShowColumns}>
                <CollapsibleContent>
                    <Card className="p-4">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <Label className="text-sm">Feature Name</Label>
                                    <Input
                                        value={newFeature.name}
                                        onChange={(e) => setNewFeature({ ...newFeature, name: e.target.value })}
                                        placeholder="e.g., Study Type"
                                        className="mt-1 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                                    />
                                </div>
                                <div>
                                    <Label className="text-sm">Type</Label>
                                    <Select
                                        value={newFeature.type}
                                        onValueChange={(value: any) => setNewFeature({ ...newFeature, type: value })}
                                    >
                                        <SelectTrigger className="mt-1 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="text">Text</SelectItem>
                                            <SelectItem value="boolean">Yes/No</SelectItem>
                                            <SelectItem value="score">Score (1-10)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="md:col-span-2">
                                    <Label className="text-sm">Description</Label>
                                    <Input
                                        value={newFeature.description}
                                        onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                                        placeholder="What should be extracted from each article?"
                                        className="mt-1 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    onClick={handleAddFeature}
                                    size="sm"
                                    disabled={!newFeature.name.trim() || !newFeature.description.trim()}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Feature
                                </Button>

                                {pendingFeatures.length > 0 && (
                                    <Button
                                        onClick={onExtractFeatures}
                                        disabled={isExtracting}
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700"
                                    >
                                        {isExtracting ? (
                                            <>
                                                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                                Extracting...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Extract ({pendingFeatures.length})
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>

                            {pendingFeatures.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-medium">Pending Features:</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {pendingFeatures.map(feature => (
                                            <Badge key={feature.id} variant="secondary" className="flex items-center gap-1">
                                                {feature.name}
                                                <button
                                                    onClick={() => onRemovePendingFeature(feature.id)}
                                                    className="ml-1 hover:text-red-600"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </CollapsibleContent>
            </Collapsible>

            {/* Results Display */}
            <Card className="p-4">
                {isSearching ? (
                    <div className="text-center py-12">
                        <div className="animate-spin mx-auto h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4" />
                        <p className="text-gray-600 dark:text-gray-400">Searching...</p>
                    </div>
                ) : isFiltering ? (
                    <div className="text-center py-12">
                        <div className="animate-spin mx-auto h-8 w-8 border-4 border-orange-600 border-t-transparent rounded-full mb-4" />
                        <div className="space-y-2">
                            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">AI Filtering in Progress</p>
                            <p className="text-gray-600 dark:text-gray-400">
                                Evaluating {articles.length} articles against your criteria...
                            </p>
                        </div>
                    </div>
                ) : articles.length > 0 ? (
                    <div className="space-y-4">
                        {displayMode === 'table' && renderTableView()}
                        {displayMode === 'card-compressed' && renderCardView(true)}
                        {displayMode === 'card-full' && renderCardView(false)}

                        {pagination?.has_more && onLoadMore && (
                            <div className="text-center pt-4 border-t">
                                <Button
                                    onClick={onLoadMore}
                                    variant="outline"
                                >
                                    Load More Articles
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <p>No results found</p>
                        <p className="text-sm mt-2">Try adjusting your search terms</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
