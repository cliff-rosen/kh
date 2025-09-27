import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, RefreshCw, ChevronDown, ChevronUp, Eye, Play, Users, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { smartSearchApi } from '@/lib/api/smartSearchApi';
import { useAuth } from '@/context/AuthContext';
import type { SmartSearchSession } from '@/types/smart-search';

// Type alias for clarity
type SearchSession = SmartSearchSession;

type SortField = 'created_at' | 'status' | 'found' | 'accepted';
type SortDirection = 'asc' | 'desc';

interface SessionSummaryModalProps {
  session: SearchSession;
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getStepBadge = (step?: string | null) => {
  const stepMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    'question_input': { label: 'Started', variant: 'outline' },
    'question_refinement': { label: 'Evidence Spec', variant: 'outline' },
    'search_query_generation': { label: 'Keywords', variant: 'outline' },
    'search_execution': { label: 'Search Complete', variant: 'secondary' },
    'discriminator_generation': { label: 'Filter Setup', variant: 'secondary' },
    'filtering': { label: 'Completed', variant: 'default' }
  };

  const stepInfo = stepMap[step || 'question_input'] || { label: 'Unknown', variant: 'outline' as const };
  return <Badge variant={stepInfo.variant}>{stepInfo.label}</Badge>;
};

function SessionSummaryModal({ session, isOpen, onClose }: SessionSummaryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border dark:border-gray-600">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Session Summary</h2>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Original Question</h3>
            <p className="text-gray-700 dark:text-gray-300">{session.original_question}</p>
          </div>

          {session.submitted_evidence_spec && (
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Evidence Specification</h3>
              <p className="text-gray-700 dark:text-gray-300">{session.submitted_evidence_spec}</p>
            </div>
          )}

          {session.submitted_search_keywords && (
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Search Query</h3>
              <p className="font-mono text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 rounded">{session.submitted_search_keywords}</p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
              <div className="text-sm text-blue-600 dark:text-blue-400">Articles Found</div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{session.search_metadata?.total_available?.toLocaleString() || 'N/A'}</div>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
              <div className="text-sm text-green-600 dark:text-green-400">Accepted</div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{session.filtering_metadata?.accepted || 0}</div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded">
              <div className="text-sm text-red-600 dark:text-red-400">Rejected</div>
              <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{session.filtering_metadata?.rejected || 0}</div>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded">
              <div className="text-sm text-purple-600 dark:text-purple-400">Status</div>
              <div className="text-xl font-bold">{getStepBadge(session.last_step_completed)}</div>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Session Details</h3>
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
              <div>Created: {formatDate(session.created_at)}</div>
              <div>Last Updated: {formatDate(session.updated_at)}</div>
              {session.filter_strictness && <div>Filter Strictness: {session.filter_strictness}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SearchHistory() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showAdminView, setShowAdminView] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SearchSession | null>(null);

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this search session?')) {
      return;
    }

    try {
      await smartSearchApi.deleteSession(sessionId);
      toast({
        title: 'Success',
        description: 'Search session deleted successfully'
      });
      // Reload sessions
      loadSessions();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete search session',
        variant: 'destructive'
      });
    }
  };

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use admin endpoint if admin view is enabled
      const response = showAdminView && isAdmin
        ? await smartSearchApi.getAllSessions()
        : await smartSearchApi.getUserSessions();
      // Extract sessions array from response object
      const sessionData = response?.sessions || [];

      // Apply sorting
      const sortedSessions = [...sessionData].sort((a, b) => {
        let aValue: any, bValue: any;

        switch (sortField) {
          case 'created_at':
            aValue = new Date(a.created_at || '');
            bValue = new Date(b.created_at || '');
            break;
          case 'status':
            aValue = a.last_step_completed || '';
            bValue = b.last_step_completed || '';
            break;
          case 'found':
            aValue = a.search_metadata?.total_available || 0;
            bValue = b.search_metadata?.total_available || 0;
            break;
          case 'accepted':
            aValue = a.filtering_metadata?.accepted || 0;
            bValue = b.filtering_metadata?.accepted || 0;
            break;
          default:
            aValue = 0;
            bValue = 0;
        }

        if (sortDirection === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      setSessions(sortedSessions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load search history';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [sortField, sortDirection, showAdminView]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin mr-2 h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            <span className="text-lg text-gray-600 dark:text-gray-400">Loading search history...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Search History</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              View and manage your Smart Search sessions
            </p>
          </div>
          <div className="flex gap-3">
            {isAdmin && (
              <Button
                onClick={() => setShowAdminView(!showAdminView)}
                variant={showAdminView ? "default" : "outline"}
                className="dark:border-gray-600"
              >
                <Users className="w-4 h-4 mr-2" />
                {showAdminView ? 'My Sessions' : 'All Users'}
              </Button>
            )}
            <Button
              onClick={loadSessions}
              variant="outline"
              disabled={loading}
              className="dark:border-gray-600"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link to="/smart-search">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Search className="w-4 h-4 mr-2" />
                New Search
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <Card className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700">
            <p className="text-red-700 dark:text-red-300">{error}</p>
          </Card>
        )}

        {sessions.length === 0 ? (
          <Card className="p-12 text-center">
            <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No search history yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Start your first Smart Search to see your search sessions here.
            </p>
            <Link to="/smart-search">
              <Button>
                <Search className="w-4 h-4 mr-2" />
                Start Your First Search
              </Button>
            </Link>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('created_at')}
                        className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        Date {getSortIcon('created_at')}
                      </button>
                    </th>
                    {showAdminView && isAdmin && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        User
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Question
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('status')}
                        className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        Status {getSortIcon('status')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('found')}
                        className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        Found {getSortIcon('found')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('accepted')}
                        className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-gray-100"
                      >
                        Accepted {getSortIcon('accepted')}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-600">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(session.created_at)}
                      </td>
                      {showAdminView && isAdmin && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                          User {session.user_id}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="max-w-md">
                          <div className="font-medium truncate">{session.original_question}</div>
                          {(session.submitted_evidence_spec || session.generated_evidence_spec) && (
                            <div className="text-xs text-gray-500 dark:text-gray-300 mt-1 truncate">
                              "{session.submitted_evidence_spec || session.generated_evidence_spec}"
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStepBadge(session.last_step_completed)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {session.search_metadata?.total_available?.toLocaleString() || 'N/A'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 dark:text-green-400">
                            {session.filtering_metadata?.accepted || 0}
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="text-red-600 dark:text-red-400">
                            {session.filtering_metadata?.rejected || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSession(session)}
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Link to={`/smart-search?session=${session.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              title="Resume session"
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteSession(session.id)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            title="Delete session"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Session Summary Modal */}
        <SessionSummaryModal
          session={selectedSession!}
          isOpen={!!selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      </div>
    </div>
  );
}