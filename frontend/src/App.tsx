import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';

// contexts
import { ThemeProvider } from './context/ThemeContext';
import { WorkbenchProvider } from './context/WorkbenchContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// utils
import { setStreamSessionExpiredHandler } from './lib/api/streamUtils';

// components
import TopBar from './components/TopBar';
import { LoginForm } from './components/features/auth';
// Existing pages (keep for admin access)
import Profile from './pages/Profile';
import LabPage from './pages/Lab';
import SmartSearch2 from './pages/SmartSearch2';
import WorkbenchPage from './pages/Workbench';
import TokenLogin from './pages/TokenLogin';
import PubMedSearchDesigner from './pages/PubMedSearchDesigner';

// Knowledge Horizon pages (placeholders for now)
import OnboardingPage from './pages/kh/OnboardingPage';
import DashboardPage from './pages/kh/DashboardPage';
import ReportsPage from './pages/kh/ReportsPage';
import SettingsPage from './pages/kh/SettingsPage';

// Inner component that uses auth context
function AppContent() {
  const { handleSessionExpired, isAuthenticated } = useAuth();

  // Set up session expiry handler
  useEffect(() => {
    setStreamSessionExpiredHandler(handleSessionExpired);
    return () => setStreamSessionExpiredHandler(() => { });
  }, [handleSessionExpired]);

  // Main app content when authenticated
  const AuthenticatedApp = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const defaultRoute = '/dashboard';

    return (
      <div className="h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
        <TopBar />
        <main className="flex-1 overflow-y-auto pt-16">
          <Routes>
            {/* Knowledge Horizon Routes */}
            <Route path="/" element={<Navigate to={defaultRoute} />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/profile" element={<Profile />} />

            {/* Legacy routes - admin only */}
            {isAdmin && (
              <>
                <Route path="/admin/workbench" element={<WorkbenchPage />} />
                <Route path="/admin/lab" element={<LabPage />} />
                <Route path="/admin/smart-search" element={<Navigate to="/admin/smart-search-2" replace />} />
                <Route path="/admin/pubmed-search-designer" element={<PubMedSearchDesigner />} />
                <Route path="/admin/smart-search-2" element={<SmartSearch2 />} />
              </>
            )}

            {/* Redirect old routes to new structure */}
            <Route path="/workbench" element={<Navigate to={isAdmin ? "/admin/workbench" : "/dashboard"} replace />} />
            <Route path="/lab" element={<Navigate to={isAdmin ? "/admin/lab" : "/dashboard"} replace />} />
            <Route path="/smart-search" element={<Navigate to={isAdmin ? "/admin/smart-search-2" : "/dashboard"} replace />} />
            <Route path="/smart-search-2" element={<Navigate to={isAdmin ? "/admin/smart-search-2" : "/dashboard"} replace />} />
            <Route path="/pubmed-search-designer" element={<Navigate to={isAdmin ? "/admin/pubmed-search-designer" : "/dashboard"} replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    );
  };

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <Routes>
          <Route path="/auth/token-login" element={<TokenLogin />} />
          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center dark:bg-gray-900 bg-gray-50">
              <LoginForm />
            </div>
          } />
        </Routes>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <WorkbenchProvider>
        <AuthenticatedApp />
      </WorkbenchProvider>
      <Toaster />
    </ThemeProvider>
  );
}

// Main App component that provides contexts
function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App; 