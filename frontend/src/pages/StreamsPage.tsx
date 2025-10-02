import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResearchStream } from '../context/ResearchStreamContext';
import { PlusIcon, BeakerIcon } from '@heroicons/react/24/outline';

export default function StreamsPage() {
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, isLoading } = useResearchStream();

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Research Streams
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Monitor specific topics, competitors, or therapeutic areas
                    </p>
                </div>

                <button
                    onClick={() => navigate('/new-stream')}
                    className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    New Stream
                </button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : researchStreams.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <BeakerIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Research Streams Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        Create your first research stream to start monitoring the information that matters to your business.
                    </p>
                    <button
                        onClick={() => navigate('/new-stream')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Create Your First Stream
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {researchStreams.map((stream) => (
                        <div
                            key={stream.stream_id}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer"
                            onClick={() => navigate(`/reports?stream=${stream.stream_id}`)}
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                            {stream.stream_name}
                                        </h3>
                                        {stream.description && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                {stream.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className={`w-3 h-3 rounded-full ${stream.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium mr-2">Type:</span>
                                        <span className="capitalize">{stream.stream_type}</span>
                                    </div>
                                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium mr-2">Frequency:</span>
                                        <span className="capitalize">{stream.report_frequency}</span>
                                    </div>
                                    {stream.focus_areas && stream.focus_areas.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {stream.focus_areas.slice(0, 3).map((area, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                                                >
                                                    {area}
                                                </span>
                                            ))}
                                            {stream.focus_areas.length > 3 && (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    +{stream.focus_areas.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        Created {new Date(stream.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
