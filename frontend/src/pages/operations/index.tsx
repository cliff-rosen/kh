/**
 * Operations Routes
 *
 * Top-level nav: "Operations" (visible to platform admins only)
 *
 * Routes:
 * - /operations              → Report approval queue (default)
 * - /operations/reports/:id  → Report review/approval
 * - /operations/scheduler    → Scheduler configuration & monitoring
 */

import { Routes, Route, Navigate } from 'react-router-dom';
import OperationsLayout from './OperationsLayout';
import ReportQueue from './ReportQueue';
import ReportReview from './ReportReview';
import SchedulerManagement from './SchedulerManagement';

export default function OperationsRoutes() {
    return (
        <Routes>
            <Route element={<OperationsLayout />}>
                {/* Report Queue is the default landing page */}
                <Route index element={<ReportQueue />} />
                <Route path="reports/:reportId" element={<ReportReview />} />
                <Route path="scheduler" element={<SchedulerManagement />} />
            </Route>
            <Route path="*" element={<Navigate to="/operations" replace />} />
        </Routes>
    );
}

// Re-export individual pages for direct imports if needed
export { ReportQueue, ReportReview, SchedulerManagement };
