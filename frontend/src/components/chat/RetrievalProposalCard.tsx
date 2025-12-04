import { useState } from 'react';
import { CheckIcon, XMarkIcon, MagnifyingGlassIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface BroadQuery {
    query_id: string;
    name: string;
    query_string: string;
    covered_topics: string[];
    rationale: string;
}

interface ConceptQuery {
    concept_id: string;
    name: string;
    search_query: string;
    covered_topics: string[];
    rationale: string;
}

interface RetrievalProposalPayload {
    proposal_type: 'broad_search' | 'concepts';
    broad_search?: {
        queries: BroadQuery[];
        strategy_rationale: string;
    };
    concepts?: ConceptQuery[];
    changes_summary?: string;
    reasoning?: string;
}

interface RetrievalProposalCardProps {
    proposal: RetrievalProposalPayload;
    onAccept?: (data: RetrievalProposalPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function RetrievalProposalCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: RetrievalProposalCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleAccept = () => {
        setIsAccepted(true);
        if (onAccept) {
            onAccept(proposal);
        }
    };

    const handleReject = () => {
        setIsRejected(true);
        if (onReject) {
            onReject();
        }
    };

    const toggleQuery = (id: string) => {
        setExpandedQueries(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const copyToClipboard = async (text: string, id: string) => {
        await navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal accepted! Changes have been applied to the form.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal dismissed</span>
                </div>
            </div>
        );
    }

    const isBroadSearch = proposal.proposal_type === 'broad_search';
    const queries = isBroadSearch ? proposal.broad_search?.queries || [] : [];
    const concepts = !isBroadSearch ? proposal.concepts || [] : [];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
                <MagnifyingGlassIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {isBroadSearch ? 'Broad Search Strategy' : 'Concept-Based Retrieval'}
                </span>
                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                    {isBroadSearch ? `${queries.length} queries` : `${concepts.length} concepts`}
                </span>
            </div>

            {/* Changes Summary */}
            {proposal.changes_summary && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Changes:</strong> {proposal.changes_summary}
                    </p>
                </div>
            )}

            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Strategy Rationale for Broad Search */}
            {isBroadSearch && proposal.broad_search?.strategy_rationale && (
                <div>
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Strategy Rationale
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                        {proposal.broad_search.strategy_rationale}
                    </p>
                </div>
            )}

            {/* Queries / Concepts */}
            <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {isBroadSearch ? 'Search Queries' : 'Concepts'}
                </h5>

                {isBroadSearch ? (
                    // Broad Search Queries
                    queries.map((query) => (
                        <div
                            key={query.query_id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => toggleQuery(query.query_id)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {query.name}
                                    </span>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        Covers: {query.covered_topics.join(', ')}
                                    </div>
                                </div>
                                <ChevronDownIcon
                                    className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${expandedQueries.has(query.query_id) ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {expandedQueries.has(query.query_id) && (
                                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Query String</span>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(query.query_string, query.query_id)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                            >
                                                <ClipboardDocumentIcon className="h-3 w-3" />
                                                {copiedId === query.query_id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="bg-gray-100 dark:bg-gray-900 rounded p-2 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                                            {query.query_string}
                                        </div>
                                    </div>
                                    {query.rationale && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                            {query.rationale}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    // Concepts
                    concepts.map((concept) => (
                        <div
                            key={concept.concept_id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => toggleQuery(concept.concept_id)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {concept.name}
                                    </span>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        Covers: {concept.covered_topics.join(', ')}
                                    </div>
                                </div>
                                <ChevronDownIcon
                                    className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${expandedQueries.has(concept.concept_id) ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {expandedQueries.has(concept.concept_id) && (
                                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Search Query</span>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(concept.search_query, concept.concept_id)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                            >
                                                <ClipboardDocumentIcon className="h-3 w-3" />
                                                {copiedId === concept.concept_id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="bg-gray-100 dark:bg-gray-900 rounded p-2 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                                            {concept.search_query}
                                        </div>
                                    </div>
                                    {concept.rationale && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                            {concept.rationale}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <CheckIcon className="h-4 w-4" />
                    Apply Changes
                </button>
                <button
                    type="button"
                    onClick={handleReject}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <XMarkIcon className="h-4 w-4" />
                    Dismiss
                </button>
            </div>
        </div>
    );
}
