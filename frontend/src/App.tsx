import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';

// contexts
import { ThemeProvider } from './context/ThemeContext';
import { JamBotProvider } from './context/JamBotContext';
import { WorkbenchProvider } from './context/WorkbenchContext';
import { SmartSearchProvider } from './context/SmartSearchContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// utils
import { setStreamSessionExpiredHandler } from './lib/api/streamUtils';

// components
import TopBar from './components/TopBar';
import { LoginForm } from './components/features/auth';
import EmailAuthSuccess from './pages/EmailAuthSuccess';
import Profile from './pages/Profile';
import JamBotPage from './pages/JamBot';
import LabPage from './pages/Lab';
import SmartSearchLab from './pages/SmartSearchLab';
import SmartSearch2 from './pages/SmartSearch2';
import SearchHistory from './pages/SearchHistory';
import WorkbenchPage from './pages/Workbench';
import TokenLogin from './pages/TokenLogin';
import PubMedSearchDesigner from './pages/PubMedSearchDesigner';

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
    const defaultRoute = '/smart-search';  // Smart Search is now default for all users

    return (
      <div className="h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
        <TopBar />
        <main className="flex-1 overflow-y-auto pt-16">
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} />} />
            <Route path="/jam-bot" element={<JamBotPage />} />
            <Route path="/workbench" element={<WorkbenchPage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/smart-search" element={<SmartSearchLab />} />
            <Route path="/pubmed-search-designer" element={<PubMedSearchDesigner />} />
            <Route path="/smart-search-2" element={<SmartSearch2 />} />
            <Route path="/search-history" element={<SearchHistory />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/email/auth/success" element={<EmailAuthSuccess />} />
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
      <JamBotProvider>
        <WorkbenchProvider>
          <SmartSearchProvider>
            <AuthenticatedApp />
          </SmartSearchProvider>
        </WorkbenchProvider>
      </JamBotProvider>
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