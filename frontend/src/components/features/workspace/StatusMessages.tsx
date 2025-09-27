import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { Mission, MissionStatus } from '@/types/workflow';

interface StatusMessagesProps {
    mission: Mission | null;
}

const StatusMessages: React.FC<StatusMessagesProps> = ({ mission }) => {
    if (!mission) return null;

    if (mission.status === MissionStatus.COMPLETED) {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Mission Completed! 🎉
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                    Congratulations! Your mission has been successfully completed.
                </p>
            </div>
        );
    }

    if (mission.status === MissionStatus.FAILED) {
        return (
            <div className="bg-white dark:bg-gray-800 p-8 text-center">
                <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    Mission Failed
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                    The mission encountered an error and could not be completed.
                </p>
            </div>
        );
    }

    return null;
};

export default StatusMessages; 