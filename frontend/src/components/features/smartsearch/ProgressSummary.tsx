import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';

interface ProgressSummaryProps {
  lastCompletedStep: 'query' | 'evidence' | 'keywords' | 'search' | 'discriminator';
  stepData: {
    originalQuery?: string;
    evidenceSpec?: string;
    searchKeywords?: string;
    articlesFound?: number;
    totalAvailable?: number;
    discriminator?: string;
    strictness?: 'low' | 'medium' | 'high';
    selectedSource?: string;
  };
}

export function ProgressSummary({ lastCompletedStep, stepData }: ProgressSummaryProps) {
  const getStepContent = () => {
    switch (lastCompletedStep) {
      case 'query':
        return {
          label: 'Research Question',
          content: stepData.originalQuery
        };
      case 'evidence':
        return {
          label: `Evidence Specification Created (Target: ${stepData.selectedSource === 'google_scholar' ? 'Google Scholar' : 'PubMed'})`,
          content: stepData.evidenceSpec
        };
      case 'keywords':
        return {
          label: 'Search Keywords Generated',
          content: stepData.searchKeywords && stepData.searchKeywords.length > 100
            ? stepData.searchKeywords.substring(0, 100) + '...'
            : stepData.searchKeywords
        };
      case 'search':
        return {
          label: 'Articles Found',
          content: `${stepData.totalAvailable?.toLocaleString()} articles available`
        };
      case 'discriminator':
        return {
          label: `Filter Criteria Created (${stepData.strictness || 'medium'} strictness)`,
          content: stepData.discriminator && stepData.discriminator.length > 100
            ? stepData.discriminator.substring(0, 100) + '...'
            : stepData.discriminator
        };
      default:
        return null;
    }
  };

  const stepContent = getStepContent();
  if (!stepContent?.content) {
    return null;
  }

  return (
    <Card className="p-4 mb-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 max-w-4xl mx-auto">
      <div className="flex items-start gap-2">
        <Check className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <div className="font-medium text-green-900 dark:text-green-100 mb-1">
            {stepContent.label}
          </div>
          <div className="text-green-800 dark:text-green-200">
            {stepContent.content}
          </div>
        </div>
      </div>
    </Card>
  );
}