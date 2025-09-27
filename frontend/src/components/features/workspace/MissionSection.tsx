import React, { useState } from 'react';
import { Settings, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Mission, HopStatus, MissionStatus } from '@/types/workflow';
import { getMissionStatusDisplay, getStatusBadgeClass } from '@/utils/statusUtils';

interface MissionSectionProps {
    mission: Mission | null;
}

const MissionSection: React.FC<MissionSectionProps> = ({ mission }) => {
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);

    if (!mission) {
        return (
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
                <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">
                        <Settings className="w-12 h-12 mx-auto" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                        No Mission Active
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        Start a conversation to create your first mission.
                    </p>
                </div>
            </div>
        );
    }

    const missionStatus = getMissionStatusDisplay(mission.status);
    const isInProgress = mission.status === MissionStatus.IN_PROGRESS;

    return (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            {mission.name}
                        </h2>
                        {isInProgress && (
                            <button
                                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                                className="flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                            >
                                {isDetailsExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                        {mission.description || 'No description provided'}
                    </p>
                </div>
                <div className={getStatusBadgeClass(missionStatus.color)}>
                    {missionStatus.icon}
                    <span>{missionStatus.text}</span>
                </div>
            </div>

            {(isDetailsExpanded || !isInProgress) && (
                <>
                    {mission.goal && (
                        <div className="mb-4">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Goal</h4>
                            <p className="text-gray-600 dark:text-gray-400">{mission.goal}</p>
                        </div>
                    )}

                    {mission.success_criteria && mission.success_criteria.length > 0 && (
                        <div className="mb-4">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Success Criteria</h4>
                            <ul className="list-disc pl-5 text-gray-600 dark:text-gray-400">
                                {mission.success_criteria.map((criteria, idx) => (
                                    <li key={idx}>{criteria}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}

            {(() => {
                // Filter to only show actually completed hops
                const completedHops = mission.hops?.filter(hop => hop.status === HopStatus.COMPLETED) || [];
                return completedHops.length > 0 && (
                    <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                            Completed Hops ({completedHops.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {completedHops.map((hop) => (
                                <div key={hop.id} className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1">
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        {hop.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default MissionSection; 