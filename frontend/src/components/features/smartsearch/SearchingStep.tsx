import { Card } from '@/components/ui/card';

export function SearchingStep() {
  return (
    <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Searching Articles...
      </h2>
      <div className="flex flex-col items-center justify-center py-8">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          You can see the results in the Results step.
        </p>
      </div>
    </Card>
  );
}