import { useState } from 'react';
import { DocumentTextIcon, ShareIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { DocumentInput } from './DocumentInput';
import { TreeView } from './TreeView';
import { GraphView } from './GraphView';
import { SplitView } from './SplitView';
import { documentAnalysisApi } from '../../../lib/api/documentAnalysisApi';
import { DocumentAnalysisResult, ViewMode } from '../../../types/document_analysis';

export default function DocumentAnalysis() {
    const [documentText, setDocumentText] = useState('');
    const [documentTitle, setDocumentTitle] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<DocumentAnalysisResult | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!documentText.trim() || documentText.length < 50) {
            setError('Please enter at least 50 characters of document text');
            return;
        }

        setIsAnalyzing(true);
        setError(null);
        setResults(null);
        setSelectedNodeId(null);

        try {
            const result = await documentAnalysisApi.analyzeDocument({
                document_text: documentText,
                document_title: documentTitle || undefined,
                analysis_options: {
                    hierarchical_summary: true,
                    entity_extraction: true,
                    claim_extraction: true
                }
            });
            setResults(result);
            // Auto-select executive summary
            setSelectedNodeId('executive');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleNodeSelect = (nodeId: string) => {
        setSelectedNodeId(nodeId);
    };

    const viewModes = [
        { id: 'tree' as ViewMode, label: 'Tree', icon: DocumentTextIcon },
        { id: 'graph' as ViewMode, label: 'Graph', icon: ShareIcon },
        { id: 'split' as ViewMode, label: 'Split', icon: Squares2X2Icon }
    ];

    return (
        <div className="space-y-6">
            {/* Input Section */}
            <DocumentInput
                documentText={documentText}
                documentTitle={documentTitle}
                onTextChange={setDocumentText}
                onTitleChange={setDocumentTitle}
                onAnalyze={handleAnalyze}
                isAnalyzing={isAnalyzing}
                error={error}
            />

            {/* Results Section */}
            {results && (
                <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {results.hierarchical_summary.sections.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Sections</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {results.hierarchical_summary.total_key_points}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Key Points</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                    {results.entities.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Entities</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                    {results.claims.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Claims</div>
                            </div>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            View:
                        </span>
                        <div className="flex gap-1">
                            {viewModes.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setViewMode(id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        viewMode === id
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visualization Area */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow" style={{ minHeight: '500px' }}>
                        {viewMode === 'tree' && (
                            <TreeView
                                results={results}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                        {viewMode === 'graph' && (
                            <GraphView
                                results={results}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                        {viewMode === 'split' && (
                            <SplitView
                                results={results}
                                originalText={documentText}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
