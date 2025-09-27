/**
 * Journey Analytics Component
 *
 * Displays analytics data for user journeys and events
 */
import { useState, useEffect } from 'react';
import { useSmartSearch2 } from '@/context/SmartSearch2Context';
import { useAuth } from '@/context/AuthContext';
import {
    getJourneyAnalytics,
    getUserJourneys,
    getAllUserJourneys,
    type JourneyAnalyticsData,
    type UserJourney
} from '@/lib/api/smartSearch2Api';

export function JourneyAnalytics() {
    const { getJourneyId } = useSmartSearch2();
    const { user } = useAuth();
    const [analyticsData, setAnalyticsData] = useState<JourneyAnalyticsData | null>(null);
    const [availableJourneys, setAvailableJourneys] = useState<UserJourney[]>([]);
    const [selectedJourneyId, setSelectedJourneyId] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [journeysLoading, setJourneysLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAnalytics = async (journeyId?: string) => {
        setLoading(true);
        setError(null);

        try {
            const targetJourneyId = journeyId || selectedJourneyId || getJourneyId();
            const data = await getJourneyAnalytics(targetJourneyId);
            setAnalyticsData(data);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics';
            setError(errorMessage);
            console.error('Analytics fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchJourneys = async () => {
        setJourneysLoading(true);
        try {
            const isAdmin = user?.role === 'admin';
            const response = isAdmin ? await getAllUserJourneys() : await getUserJourneys();
            setAvailableJourneys(response.journeys);

            // Set current journey as selected if not already selected
            if (!selectedJourneyId && response.journeys.length > 0) {
                const currentJourneyId = getJourneyId();
                const hasCurrentJourney = response.journeys.some(j => j.journey_id === currentJourneyId);
                setSelectedJourneyId(hasCurrentJourney ? currentJourneyId : response.journeys[0].journey_id);
            }
        } catch (err) {
            console.error('Failed to fetch journeys:', err);
        } finally {
            setJourneysLoading(false);
        }
    };

    const handleJourneySelect = (journeyId: string) => {
        setSelectedJourneyId(journeyId);
        fetchAnalytics(journeyId);
    };

    useEffect(() => {
        fetchJourneys();
    }, [user?.role]);

    useEffect(() => {
        if (selectedJourneyId) {
            fetchAnalytics(selectedJourneyId);
        }
    }, [selectedJourneyId]);

    if (loading) {
        return (
            <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Journey Analytics</h3>
                <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Journey Analytics</h3>
                <p className="text-red-600 dark:text-red-400">Error: {error}</p>
                <button
                    onClick={fetchAnalytics}
                    className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Session Picker */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300">Select Session</h4>
                    {user?.role === 'admin' && (
                        <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
                            Admin: All Users
                        </span>
                    )}
                </div>
                <div className="flex gap-2 items-center">
                    <select
                        value={selectedJourneyId}
                        onChange={(e) => handleJourneySelect(e.target.value)}
                        disabled={journeysLoading}
                        className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
                    >
                        {journeysLoading ? (
                            <option value="">Loading sessions...</option>
                        ) : availableJourneys.length === 0 ? (
                            <option value="">No sessions found</option>
                        ) : (
                            availableJourneys.map((journey) => (
                                <option key={journey.journey_id} value={journey.journey_id}>
                                    {journey.username ? `${journey.username}: ` : ''}
                                    {journey.last_event_type} • {journey.event_count} events • {journey.duration}
                                    {' • '}{new Date(journey.start_time).toLocaleDateString()}
                                </option>
                            ))
                        )}
                    </select>
                    <button
                        onClick={fetchJourneys}
                        disabled={journeysLoading}
                        className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 text-sm"
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* Selected Journey Info */}
            <div className="mb-6">
                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Selected Session Details</h4>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className={`grid gap-6 text-sm ${user?.role === 'admin' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Journey ID:</span>
                            <p className="text-gray-600 dark:text-gray-400 font-mono text-xs">{selectedJourneyId || 'None selected'}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Started:</span>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedJourneyId && availableJourneys.find(j => j.journey_id === selectedJourneyId)?.start_time
                                    ? new Date(availableJourneys.find(j => j.journey_id === selectedJourneyId)!.start_time).toLocaleString()
                                    : 'Unknown'
                                }
                            </p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Total Events:</span>
                            <p className="text-gray-600 dark:text-gray-400">{analyticsData?.current_journey ? analyticsData.current_journey.event_count : 0}</p>
                        </div>
                        <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Duration:</span>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedJourneyId && availableJourneys.find(j => j.journey_id === selectedJourneyId)?.duration || '0s'}
                            </p>
                        </div>
                        {user?.role === 'admin' && selectedJourneyId && (
                            <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">User:</span>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {availableJourneys.find(j => j.journey_id === selectedJourneyId)?.username || 'Unknown'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Events Table */}
            {analyticsData?.current_journey?.events && analyticsData.current_journey.events.length > 0 && (
                <div className="mb-6">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Journey Events</h4>
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event Type</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {analyticsData.current_journey.events.map((event, index) => (
                                        <tr key={`${event.event_id}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                                {new Date(event.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {event.event_type}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono">
                                                {event.event_id.substring(0, 8)}...
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                                {event.event_data && Object.keys(event.event_data).length > 0 ? (
                                                    <details>
                                                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                                                            View Data ({Object.keys(event.event_data).length} fields)
                                                        </summary>
                                                        <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-x-auto">
                                                            {JSON.stringify(event.event_data, null, 2)}
                                                        </pre>
                                                    </details>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">No data</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}


            <div className="mt-6 text-center">
                <button
                    onClick={() => fetchAnalytics()}
                    disabled={loading || !selectedJourneyId}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Refresh Analytics
                </button>
            </div>
        </div>
    );
}