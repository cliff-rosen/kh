/**
 * Operations Page - Report queue, approvals, and scheduler management
 *
 * Routes handled:
 * - /operations              → Report Queue (pipeline monitoring)
 * - /operations/approvals    → Report Approval Queue (approval workflow)
 * - /operations/executions/:id → Report Review (detail + curation)
 * - /operations/scheduler    → Scheduler Management
 */

import { Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom';
import {
    DocumentTextIcon,
    ClockIcon,
    ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { ReportQueue, ReportReview, SchedulerManagement, ReportApprovalQueue } from '../components/operations';

function OperationsLayout() {
    return (
        <div className="flex flex-col h-full">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <nav className="flex gap-1 px-4" aria-label="Operations tabs">
                    <NavLink
                        to="/operations"
                        end
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                isActive
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
                            }`
                        }
                    >
                        <DocumentTextIcon className="h-4 w-4" />
                        Pipeline Runs
                    </NavLink>
                    <NavLink
                        to="/operations/approvals"
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                isActive
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
                            }`
                        }
                    >
                        <ClipboardDocumentCheckIcon className="h-4 w-4" />
                        Approvals
                    </NavLink>
                    <NavLink
                        to="/operations/scheduler"
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                isActive
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300'
                            }`
                        }
                    >
                        <ClockIcon className="h-4 w-4" />
                        Scheduler
                    </NavLink>
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <Outlet />
            </div>
        </div>
    );
}

export default function OperationsPage() {
    return (
        <Routes>
            <Route element={<OperationsLayout />}>
                <Route index element={<ReportQueue />} />
                <Route path="approvals" element={<ReportApprovalQueue />} />
                <Route path="executions/:executionId" element={<ReportReview />} />
                <Route path="scheduler" element={<SchedulerManagement />} />
            </Route>
            <Route path="*" element={<Navigate to="/operations" replace />} />
        </Routes>
    );
}
