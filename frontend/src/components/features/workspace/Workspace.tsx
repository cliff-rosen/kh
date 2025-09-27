import React from 'react';
import { useJamBot } from '@/context/JamBotContext';
import { SessionStatus, MissionSection, HopSection, ActionButtons, StatusMessages } from './';

const Workspace: React.FC = () => {
    const { state, sendMessage, createMessage, acceptMissionProposal, acceptHopProposal, acceptHopImplementationProposal, startHopExecution, failHopExecution, retryHopExecution } = useJamBot();

    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
            {/* Session Status */}
            <SessionStatus />

            {/* Mission Section */}
            <MissionSection mission={state.mission} />

            {/* Current Hop Section */}
            <HopSection hop={state.mission?.current_hop || null} />

            {/* Completed/Failed Message */}
            <StatusMessages mission={state.mission} />

            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Action Buttons */}
            <ActionButtons
                mission={state.mission}
                sendMessage={sendMessage}
                createMessage={createMessage}
                acceptMissionProposal={acceptMissionProposal}
                acceptHopProposal={acceptHopProposal}
                acceptHopImplementationProposal={acceptHopImplementationProposal}
                startHopExecution={startHopExecution}
                failHopExecution={failHopExecution}
                retryHopExecution={retryHopExecution}
                isProcessing={state.isProcessing}
            />
        </div>
    );
};

export default Workspace; 