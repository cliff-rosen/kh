import React from 'react';
import { Clock, CheckCircle, XCircle, PlayCircle, AlertCircle } from 'lucide-react';
import { MissionStatus, HopStatus, ToolExecutionStatus } from '@/types/workflow';

/**
 * STATUS LEVELS - Simple and Clear:
 * 
 * 1. MISSION STATUS (MissionStatus)
 *    - Overall mission state: AWAITING_APPROVAL → IN_PROGRESS → COMPLETED/FAILED/CANCELLED
 *    - Shown as: "Mission: IN_PROGRESS"
 * 
 * 2. HOP STATUS (HopStatus)
 *    - Hop lifecycle state: HOP_PLAN_STARTED → HOP_PLAN_PROPOSED → HOP_PLAN_READY → HOP_IMPL_STARTED → HOP_IMPL_PROPOSED → HOP_IMPL_READY → EXECUTING → COMPLETED/FAILED/CANCELLED
 *    - Shown in hop list and details as status badge
 * 
 * 3. EXECUTION STATUS (ExecutionStatus)
 *    - Individual step state: PROPOSED → READY_TO_CONFIGURE → READY_TO_EXECUTE → EXECUTING → COMPLETED/FAILED/CANCELLED
 *    - Shown in step details as status badge
 */

export interface StatusDisplay {
    color: string;
    icon: React.ReactElement;
    text: string;
}

export function getMissionStatusDisplay(status: MissionStatus): StatusDisplay {
    switch (status) {
        case MissionStatus.AWAITING_APPROVAL:
            return {
                color: 'yellow',
                icon: React.createElement(Clock, { className: "w-4 h-4" }),
                text: 'Awaiting Approval'
            };
        case MissionStatus.IN_PROGRESS:
            return {
                color: 'blue',
                icon: React.createElement(PlayCircle, { className: "w-4 h-4" }),
                text: 'In Progress'
            };
        case MissionStatus.COMPLETED:
            return {
                color: 'green',
                icon: React.createElement(CheckCircle, { className: "w-4 h-4" }),
                text: 'Completed'
            };
        case MissionStatus.FAILED:
            return {
                color: 'red',
                icon: React.createElement(XCircle, { className: "w-4 h-4" }),
                text: 'Failed'
            };
        case MissionStatus.CANCELLED:
            return {
                color: 'gray',
                icon: React.createElement(XCircle, { className: "w-4 h-4" }),
                text: 'Cancelled'
            };
        default:
            return {
                color: 'gray',
                icon: React.createElement(AlertCircle, { className: "w-4 h-4" }),
                text: 'Unknown'
            };
    }
}

export function getHopStatusDisplay(status: HopStatus): StatusDisplay {
    switch (status) {
        case HopStatus.HOP_PLAN_STARTED:
            return {
                color: 'blue',
                icon: React.createElement(PlayCircle, { className: "w-4 h-4" }),
                text: 'Planning Started'
            };
        case HopStatus.HOP_PLAN_PROPOSED:
            return {
                color: 'yellow',
                icon: React.createElement(Clock, { className: "w-4 h-4" }),
                text: 'Plan Proposed'
            };
        case HopStatus.HOP_PLAN_READY:
            return {
                color: 'green',
                icon: React.createElement(CheckCircle, { className: "w-4 h-4" }),
                text: 'Plan Ready'
            };
        case HopStatus.HOP_IMPL_STARTED:
            return {
                color: 'blue',
                icon: React.createElement(PlayCircle, { className: "w-4 h-4" }),
                text: 'Implementation Started'
            };
        case HopStatus.HOP_IMPL_PROPOSED:
            return {
                color: 'yellow',
                icon: React.createElement(Clock, { className: "w-4 h-4" }),
                text: 'Implementation Proposed'
            };
        case HopStatus.HOP_IMPL_READY:
            return {
                color: 'green',
                icon: React.createElement(CheckCircle, { className: "w-4 h-4" }),
                text: 'Implementation Ready'
            };
        case HopStatus.EXECUTING:
            return {
                color: 'blue',
                icon: React.createElement(PlayCircle, { className: "w-4 h-4" }),
                text: 'Executing'
            };
        case HopStatus.COMPLETED:
            return {
                color: 'green',
                icon: React.createElement(CheckCircle, { className: "w-4 h-4" }),
                text: 'Completed'
            };
        case HopStatus.FAILED:
            return {
                color: 'red',
                icon: React.createElement(XCircle, { className: "w-4 h-4" }),
                text: 'Failed'
            };
        case HopStatus.CANCELLED:
            return {
                color: 'gray',
                icon: React.createElement(XCircle, { className: "w-4 h-4" }),
                text: 'Cancelled'
            };
        default:
            return {
                color: 'gray',
                icon: React.createElement(AlertCircle, { className: "w-4 h-4" }),
                text: 'Unknown'
            };
    }
}

export function getExecutionStatusDisplay(status: ToolExecutionStatus): StatusDisplay {
    switch (status) {
        case ToolExecutionStatus.PROPOSED:
            return {
                color: 'yellow',
                icon: React.createElement(Clock, { className: "w-4 h-4" }),
                text: 'Pending'
            };
        case ToolExecutionStatus.EXECUTING:
            return {
                color: 'blue',
                icon: React.createElement(PlayCircle, { className: "w-4 h-4" }),
                text: 'Executing'
            };
        case ToolExecutionStatus.COMPLETED:
            return {
                color: 'green',
                icon: React.createElement(CheckCircle, { className: "w-4 h-4" }),
                text: 'Completed'
            };
        case ToolExecutionStatus.FAILED:
            return {
                color: 'red',
                icon: React.createElement(XCircle, { className: "w-4 h-4" }),
                text: 'Failed'
            };
        default:
            return {
                color: 'gray',
                icon: React.createElement(AlertCircle, { className: "w-4 h-4" }),
                text: 'Unknown'
            };
    }
}

export function getStatusBadgeClass(color: string): string {
    const baseClasses = 'px-2 py-1 rounded text-xs font-medium flex items-center gap-1';
    switch (color) {
        case 'green':
            return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400`;
        case 'yellow':
            return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400`;
        case 'red':
            return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400`;
        case 'blue':
            return `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400`;
        default:
            return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-400`;
    }
} 