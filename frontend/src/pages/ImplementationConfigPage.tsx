import { useParams, useNavigate } from 'react-router-dom';

import { ImplementationConfigProvider, useImplementationConfig } from '../context/ImplementationConfigContext';

import SourceSelectionStep from '../components/ImplementationConfigSteps/SourceSelectionStep';
import QueryConfigStep from '../components/ImplementationConfigSteps/QueryConfigStep';
import SemanticFilterStep from '../components/ImplementationConfigSteps/SemanticFilterStep';
import ChannelTestingStep from '../components/ImplementationConfigSteps/ChannelTestingStep';
import SummaryReportStep from '../components/ImplementationConfigSteps/SummaryReportStep';
import WorkflowProgressSidebar from '../components/ImplementationConfigSteps/WorkflowProgressSidebar';

function ImplementationConfigContent() {
    const navigate = useNavigate();
    const {
        stream,
        isComplete,
        isLoading,
        currentChannel,
        currentStep,
        isViewingSummary,
        viewSummaryReport
    } = useImplementationConfig();

    const streamName = stream?.stream_name || '';

    const { streamId } = useParams<{ streamId: string }>();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading stream configuration...</p>
                </div>
            </div>
        );
    }

    // Check isComplete but NOT isViewingSummary - show completion screen
    if (isComplete && !isViewingSummary) {
        return (
            <div className="max-w-2xl mx-auto mt-12 p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Configuration Complete!
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        All channels have been configured for {streamName}. Review your configuration and accept it to activate the stream.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button
                            onClick={viewSummaryReport}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            View Summary Report
                        </button>
                        <button
                            onClick={() => navigate(`/streams/${streamId}/edit`)}
                            className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
            {/* Sidebar */}
            <WorkflowProgressSidebar />

            {/* Main Content */}
            <div className="ml-80 p-6">
                {/* Header */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                {streamName}
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {stream?.purpose}
                            </p>
                        </div>
                        <button
                            onClick={() => navigate(`/streams/${streamId}/edit`)}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            Exit
                        </button>
                    </div>
                </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                {isViewingSummary ? (
                    <SummaryReportStep />
                ) : !currentChannel ? (
                    <div className="text-center text-gray-600 dark:text-gray-400 py-12">
                        No channel to configure
                    </div>
                ) : (
                    <div>
                        {/* Source Selection Step */}
                        {currentStep === 'source_selection' && (
                            <SourceSelectionStep />
                        )}

                        {/* Query Definition Step */}
                        {currentStep === 'query_definition' && (
                            <QueryConfigStep />
                        )}

                        {/* Semantic Filter Definition Step */}
                        {currentStep === 'semantic_filter_definition' && (
                            <SemanticFilterStep />
                        )}

                        {/* Channel Testing Step */}
                        {currentStep === 'channel_testing' && (
                            <ChannelTestingStep />
                        )}
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default function ImplementationConfigPage() {
    const { streamId } = useParams<{ streamId: string }>();

    return (
        <ImplementationConfigProvider streamId={parseInt(streamId || '0')}>
            <ImplementationConfigContent />
        </ImplementationConfigProvider>
    );
}
