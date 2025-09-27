import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface DiscriminatorStepProps {
  evidenceSpec: string;
  searchKeywords: string;
  editedDiscriminator: string;
  setEditedDiscriminator: (discriminator: string) => void;
  strictness: 'low' | 'medium' | 'high';
  setStrictness: (strictness: 'low' | 'medium' | 'high') => void;
  selectedArticlesCount: number;
  totalAvailable?: number;
  onSubmit: () => void;
}

export function DiscriminatorStep({
  evidenceSpec,
  searchKeywords,
  editedDiscriminator,
  setEditedDiscriminator,
  strictness,
  setStrictness,
  onSubmit
}: DiscriminatorStepProps) {

  const [showDetails, setShowDetails] = useState(false);


  return (
    <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Create Filter Criteria
      </h2>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        An AI filter has been prepared to evaluate your search results based on your evidence specification and will filter articles for relevance to your research question. Click "Start Filtering" below or optionally review the Advanced Options for finer control.
      </p>

      <div className="space-y-6">
        {/* Evidence Specification - Always Visible */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Evidence Specification
          </h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border">
            {evidenceSpec}
          </div>
        </div>

        {/* Search Keywords - Always Visible */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search Keywords
          </h4>
          <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border">
            {searchKeywords}
          </div>
        </div>

        {/* Advanced Options - Filter Criteria and Strictness (Collapsible) */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
          >
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Advanced Options
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Review and edit the filter criteria if needed
              </p>
            </div>
            {showDetails ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {showDetails && (
            <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
              {/* Filter Strictness - First in Advanced Options */}
              <div>
                <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
                  Filter Strictness
                </label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map((level) => (
                    <Button
                      key={level}
                      variant={strictness === level ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStrictness(level)}
                      className="min-w-[80px]"
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {strictness === 'low' && 'More inclusive - accepts somewhat related articles'}
                  {strictness === 'medium' && 'Balanced - accepts clearly related articles'}
                  {strictness === 'high' && 'Strict - only accepts directly relevant articles'}
                </p>
              </div>

              {/* Filter Evaluation Criteria - Second in Advanced Options */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Filter Evaluation Criteria
                </label>
                <Textarea
                  value={editedDiscriminator}
                  onChange={(e) => setEditedDiscriminator(e.target.value)}
                  rows={6}
                  className="dark:bg-gray-700 dark:text-gray-100 text-sm"
                  placeholder="Enter criteria for evaluating article relevance..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This criteria will be used to evaluate each article's abstract for relevance.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            onClick={onSubmit}
            disabled={!editedDiscriminator.trim()}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Start Filtering
          </Button>
        </div>
      </div>
    </Card>
  );
}