import React from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useJamBot } from '@/context/JamBotContext';

const SessionStatus: React.FC = () => {
    const { sessionName } = useAuth();
    const { state, createNewSession } = useJamBot();

    const handleNewSession = async () => {
        try {
            await createNewSession();
        } catch (error) {
            console.error('Failed to create new session:', error);
        }
    };

    // Mission status logic
    const getMissionStatus = () => {
        if (!state.mission || state.mission.status === 'awaiting_approval') {
            return { text: 'MISSION PENDING', color: 'yellow' };
        }
        if (state.mission.status === 'in_progress') {
            return { text: 'MISSION IN PROGRESS', color: 'blue' };
        }
        if (state.mission.status === 'completed') {
            return { text: 'MISSION COMPLETED', color: 'green' };
        }
        if (state.mission.status === 'failed') {
            return { text: 'MISSION FAILED', color: 'red' };
        }
        return { text: 'MISSION PENDING', color: 'yellow' };
    };

    // Hop status logic - only show when mission is in progress
    const getHopStatus = () => {
        if (!state.mission || state.mission.status !== 'in_progress' || !state.mission.current_hop) {
            return null;
        }

        const hop = state.mission.current_hop;
        switch (hop.status) {
            case 'hop_plan_started':
                return { text: 'Planning Hop', color: 'blue' };
            case 'hop_plan_proposed':
                return { text: 'Hop Plan Ready', color: 'yellow' };
            case 'hop_plan_ready':
                return { text: 'Hop Ready', color: 'green' };
            case 'hop_impl_started':
                return { text: 'Designing Implementation', color: 'blue' };
            case 'hop_impl_proposed':
                return { text: 'Implementation Ready', color: 'yellow' };
            case 'hop_impl_ready':
                return { text: 'Ready to Execute', color: 'green' };
            case 'executing':
                return { text: 'Executing Hop', color: 'blue' };
            case 'completed':
                return { text: 'Hop Completed', color: 'green' };
            case 'failed':
                return { text: 'Hop Failed', color: 'red' };
            default:
                return { text: 'Hop Pending', color: 'yellow' };
        }
    };

    const missionStatus = getMissionStatus();
    const hopStatus = getHopStatus();

    return (
        <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {sessionName || 'No Session'}
                    </span>

                    <div className={`px-2 py-1 rounded text-xs font-medium ${missionStatus.color === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' :
                        missionStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400' :
                            missionStatus.color === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
                                missionStatus.color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' :
                                    'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400'
                        }`}>
                        {missionStatus.text}
                    </div>

                    {hopStatus && (
                        <div className={`px-2 py-1 rounded text-xs font-medium ${hopStatus.color === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400' :
                            hopStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400' :
                                hopStatus.color === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400' :
                                    hopStatus.color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400'
                            }`}>
                            {hopStatus.text}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleNewSession}
                    disabled={state.isCreatingSession}
                    className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {state.isCreatingSession ? (
                        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Plus className="w-4 h-4" />
                    )}
                    <span>{state.isCreatingSession ? 'Creating...' : 'New Session'}</span>
                </button>
            </div>
        </div>
    );
};

export default SessionStatus; 