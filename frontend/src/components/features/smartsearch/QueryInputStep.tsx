import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Search } from 'lucide-react';

interface QueryInputStepProps {
  query: string;
  setQuery: (query: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function QueryInputStep({ query, setQuery, onSubmit, loading }: QueryInputStepProps) {
  return (
    <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
        What Documents Are You Looking For?
      </h2>
      <div className="space-y-4">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., Find articles that discuss CRISPR gene editing applications in cancer treatment"
          rows={10}
          className="dark:bg-gray-700 dark:text-gray-100"
        />
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={loading || !query.trim()}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Creating Evidence Specification...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Create Evidence Specification
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}