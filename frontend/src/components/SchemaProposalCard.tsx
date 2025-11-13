import { useState } from 'react';
import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/solid';

interface SchemaProposal {
    proposed_changes: Record<string, any>;
    confidence: string;
    reasoning: string;
}

interface SchemaProposalCardProps {
    proposal: SchemaProposal;
    onAccept: (changes: Record<string, any>) => void;
    onReject: () => void;
    isProcessing?: boolean;
}

export default function SchemaProposalCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: SchemaProposalCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);

    const handleAccept = () => {
        setIsAccepted(true);
        onAccept(proposal.proposed_changes);
    };

    const handleReject = () => {
        setIsRejected(true);
        onReject();
    };

    // Helper to format field names nicely
    const formatFieldName = (fieldPath: string): string => {
        const parts = fieldPath.split('.');
        const lastPart = parts[parts.length - 1];
        return lastPart
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Helper to render field value
    const renderValue = (value: any): string => {
        if (Array.isArray(value)) {
            if (value.length === 0) return '(empty array)';
            if (typeof value[0] === 'object') {
                return `${value.length} item(s)`;
            }
            return value.join(', ');
        }
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    };

    const confidenceColor =
        proposal.confidence === 'high' ? 'text-green-600 dark:text-green-400' :
        proposal.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
        'text-orange-600 dark:text-orange-400';

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 my-3">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal accepted! Changes have been applied.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 my-3">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal rejected</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-3">
            {/* Header */}
            <div className="flex items-start gap-2 mb-3">
                <SparklesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                        Schema Proposal
                    </h4>
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                        Confidence: <span className={`font-medium ${confidenceColor}`}>{proposal.confidence}</span>
                    </p>
                </div>
            </div>

            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="mb-4 pb-3 border-b border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-900 dark:text-blue-100 italic">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Proposed Changes */}
            <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
                    Proposed Changes:
                </p>
                <div className="bg-white dark:bg-gray-900 rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
                    {Object.entries(proposal.proposed_changes).map(([key, value]) => (
                        <div key={key} className="text-sm">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                {formatFieldName(key)}:
                            </span>
                            <div className="mt-1 text-gray-900 dark:text-gray-100">
                                {Array.isArray(value) && typeof value[0] === 'object' ? (
                                    // Special handling for topics array
                                    <div className="space-y-2 pl-2">
                                        {value.map((item, idx) => (
                                            <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">
                                                <div><strong>Name:</strong> {item.name}</div>
                                                <div><strong>Description:</strong> {item.description}</div>
                                                {item.importance && <div><strong>Importance:</strong> {item.importance}</div>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {renderValue(value)}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <CheckIcon className="h-4 w-4" />
                    Accept Changes
                </button>
                <button
                    onClick={handleReject}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <XMarkIcon className="h-4 w-4" />
                    Reject
                </button>
            </div>
        </div>
    );
}
