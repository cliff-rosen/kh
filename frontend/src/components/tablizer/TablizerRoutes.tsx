import { Routes, Route, Navigate } from 'react-router-dom';
import { TablizerAuthProvider, useTablizerAuth } from '../../context/TablizerAuthContext';
import TablizerLandingPage from '../../pages/tablizer/TablizerLandingPage';
import TablizerLoginPage from '../../pages/tablizer/TablizerLoginPage';
import TablizerRegisterPage from '../../pages/tablizer/TablizerRegisterPage';
import TablizerAppPage from '../../pages/tablizer/TablizerAppPage';

// Protected route component for Tablizer
function TablizerProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useTablizerAuth();

    if (!isAuthenticated) {
        return <Navigate to="/tablizer/login" replace />;
    }

    return <>{children}</>;
}

// Redirect authenticated users away from login/register
function TablizerPublicRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useTablizerAuth();

    if (isAuthenticated) {
        return <Navigate to="/tablizer/app" replace />;
    }

    return <>{children}</>;
}

// Inner routes component (uses auth context)
function TablizerRoutesInner() {
    return (
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<TablizerLandingPage />} />
            <Route
                path="/login"
                element={
                    <TablizerPublicRoute>
                        <TablizerLoginPage />
                    </TablizerPublicRoute>
                }
            />
            <Route
                path="/register"
                element={
                    <TablizerPublicRoute>
                        <TablizerRegisterPage />
                    </TablizerPublicRoute>
                }
            />

            {/* Protected routes */}
            <Route
                path="/app"
                element={
                    <TablizerProtectedRoute>
                        <TablizerAppPage />
                    </TablizerProtectedRoute>
                }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/tablizer" replace />} />
        </Routes>
    );
}

// Main component that provides auth context
export default function TablizerRoutes() {
    return (
        <TablizerAuthProvider>
            <TablizerRoutesInner />
        </TablizerAuthProvider>
    );
}
