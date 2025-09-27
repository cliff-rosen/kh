import React from 'react';
import { Play, Square, RotateCcw, Settings, CheckCircle } from 'lucide-react';
import { Mission, MissionStatus, HopStatus } from '@/types/workflow';
import { MessageRole } from '@/types/chat';

interface ActionButtonsProps {
    mission: Mission | null;
    sendMessage: (message: any) => void;
    createMessage: (content: string, role: MessageRole) => any;
    acceptMissionProposal: () => void;
    acceptHopProposal: (hop: any) => void;
    acceptHopImplementationProposal: (hop: any) => void;
    startHopExecution: (hopId: string) => void;
    failHopExecution: (hopId: string, error: string) => void;
    retryHopExecution: (hopId: string) => void;
    isProcessing: boolean;
}

const ActionButtons: React.FC<ActionButtonsProps> = ({
    mission,
    sendMessage,
    createMessage,
    acceptMissionProposal,
    acceptHopProposal,
    acceptHopImplementationProposal,
    startHopExecution,
    failHopExecution,
    retryHopExecution,
    isProcessing,
}) => {
    const handleStartHopPlanning = async () => {
        if (!mission) return;

        const planningMessage = createMessage(
            "Please help me design a hop plan.",
            MessageRole.USER
        );

        sendMessage(planningMessage);
    };

    const handleStartHopImplementation = async () => {
        if (!mission?.current_hop) return;

        const implementationMessage = createMessage(
            "I'm ready to start implementing this hop. Please help me design the implementation plan.",
            MessageRole.USER
        );

        sendMessage(implementationMessage);
    };

    if (!mission) return null;

    const actions = [];

    // Mission-level actions
    if (mission.status === MissionStatus.AWAITING_APPROVAL) {
        actions.push(
            <button
                key="approve-mission"
                onClick={acceptMissionProposal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve Mission
            </button>
        );
    }

    // Hop-level actions
    if (mission.status === MissionStatus.IN_PROGRESS) {
        const currentHop = mission.current_hop;

        if (!currentHop) {
            // No current hop - show start planning button
            actions.push(
                <button
                    key="start-planning"
                    onClick={handleStartHopPlanning}
                    disabled={isProcessing}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${isProcessing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                        }`}
                >
                    <Play className="w-4 h-4 mr-2" />
                    {isProcessing ? 'Planning...' : 'Start Hop Planning'}
                </button>
            );
        } else {
            // Actions based on hop status
            switch (currentHop.status) {
                case HopStatus.HOP_PLAN_PROPOSED:
                    actions.push(
                        <button
                            key="accept-hop-plan"
                            onClick={() => acceptHopProposal(currentHop)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept Hop Plan
                        </button>
                    );
                    break;

                case HopStatus.HOP_PLAN_READY:
                    actions.push(
                        <button
                            key="start-implementation"
                            onClick={handleStartHopImplementation}
                            disabled={isProcessing}
                            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${isProcessing
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500'
                                }`}
                        >
                            <Settings className="w-4 h-4 mr-2" />
                            {isProcessing ? 'Processing...' : 'Start Implementation'}
                        </button>
                    );
                    break;

                case HopStatus.HOP_IMPL_PROPOSED:
                    actions.push(
                        <button
                            key="accept-implementation"
                            onClick={() => acceptHopImplementationProposal(currentHop)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept Implementation
                        </button>
                    );
                    break;

                case HopStatus.HOP_IMPL_READY:
                    actions.push(
                        <button
                            key="start-execution"
                            onClick={() => startHopExecution(currentHop.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            <Play className="w-4 h-4 mr-2" />
                            Start Execution
                        </button>
                    );
                    break;

                case HopStatus.EXECUTING:
                    actions.push(
                        <button
                            key="stop-execution"
                            onClick={() => failHopExecution(currentHop.id, "Execution stopped by user")}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                            <Square className="w-4 h-4 mr-2" />
                            Stop Execution
                        </button>
                    );
                    break;

                case HopStatus.FAILED:
                    actions.push(
                        <button
                            key="retry-execution"
                            onClick={() => retryHopExecution(currentHop.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Retry Execution
                        </button>
                    );
                    break;
            }
        }
    }

    if (actions.length === 0) return null;

    return (
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex gap-3 justify-end">
                {actions}
            </div>
        </div>
    );
};

export default ActionButtons; 