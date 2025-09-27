import React from 'react';
import { CanonicalSearchResult } from '../../types/canonical_types';
import {
    ExternalLink,
    Globe,
    Calendar,
    Star,
    ChevronRight,
    Clock
} from 'lucide-react';

interface SearchResultRendererProps {
    results: CanonicalSearchResult[];
    onResultClick?: (result: CanonicalSearchResult) => void;
    showRank?: boolean;
    showRelevanceScore?: boolean;
    className?: string;
}

export const SearchResultRenderer: React.FC<SearchResultRendererProps> = ({
    results,
    onResultClick,
    showRank = true,
    showRelevanceScore = false,
    className = ''
}) => {
    if (!results || results.length === 0) {
        return (
            <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
                <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No search results found</p>
            </div>
        );
    }

    const handleResultClick = (result: CanonicalSearchResult) => {
        if (onResultClick) {
            onResultClick(result);
        } else {
            // Default behavior: open in new tab
            window.open(result.url, '_blank', 'noopener,noreferrer');
        }
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return null;
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch {
            return dateString;
        }
    };

    const getRelevanceColor = (score?: number) => {
        if (!score) return 'text-gray-500';
        if (score >= 0.8) return 'text-green-600 dark:text-green-400';
        if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
        return 'text-red-600 dark:text-red-400';
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {results.map((result, index) => (
                <div
                    key={`${result.url}-${index}`}
                    className="group bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md dark:hover:shadow-gray-700/50 transition-all duration-200 cursor-pointer"
                    onClick={() => handleResultClick(result)}
                >
                    <div className="p-4">
                        {/* Header with title and rank/score */}
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                    {result.title}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                {showRank && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                        #{result.rank}
                                    </span>
                                )}
                                {showRelevanceScore && result.relevance_score && (
                                    <div className="flex items-center gap-1">
                                        <Star className="w-3 h-3" />
                                        <span className={`text-xs font-medium ${getRelevanceColor(result.relevance_score)}`}>
                                            {(result.relevance_score * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                )}
                                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                            </div>
                        </div>

                        {/* URL and metadata */}
                        <div className="flex items-center gap-2 mb-3 text-sm text-gray-600 dark:text-gray-400">
                            <Globe className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{result.source}</span>
                            {result.published_date && (
                                <>
                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                    <div className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{formatDate(result.published_date)}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Snippet */}
                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-3">
                            {result.snippet}
                        </p>

                        {/* Action indicator */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span>Click to open</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// Compact version for inline display
interface SearchResultCompactProps {
    result: CanonicalSearchResult;
    onResultClick?: (result: CanonicalSearchResult) => void;
    className?: string;
}

export const SearchResultCompact: React.FC<SearchResultCompactProps> = ({
    result,
    onResultClick,
    className = ''
}) => {
    const handleClick = () => {
        if (onResultClick) {
            onResultClick(result);
        } else {
            window.open(result.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <div
            className={`group flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-all duration-200 cursor-pointer ${className}`}
            onClick={handleClick}
        >
            <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                    {result.title}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                    {result.snippet}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <Globe className="w-3 h-3" />
                    <span>{result.source}</span>
                    {result.published_date && (
                        <>
                            <span>•</span>
                            <span>{new Date(result.published_date).toLocaleDateString()}</span>
                        </>
                    )}
                </div>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors flex-shrink-0" />
        </div>
    );
}; 