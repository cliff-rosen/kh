import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

interface RefinementStepProps {
  evidenceSpec: string;
  setEvidenceSpec: (spec: string) => void;
  selectedSource: string;
  setSelectedSource: (source: string) => void;
  onSubmit: (selectedSource: string) => void;
  loading: boolean;
}

export function RefinementStep({
  evidenceSpec,
  setEvidenceSpec,
  selectedSource,
  setSelectedSource,
  onSubmit,
  loading
}: RefinementStepProps) {

  const handleSubmit = () => {
    onSubmit(selectedSource);
  };

  return (
    <Card className="p-6 dark:bg-gray-800 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
        Review Evidence Specification
      </h2>


      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Evidence Specification
          </label>
          <Textarea
            value={evidenceSpec}
            onChange={(e) => setEvidenceSpec(e.target.value)}
            rows={12}
            className="dark:bg-gray-700 dark:text-gray-100 text-sm w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Source:
            </label>
            <RadioGroup value={selectedSource} onValueChange={setSelectedSource} className="flex gap-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pubmed" id="pubmed" />
                <Label
                  htmlFor="pubmed"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  PubMed
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="google_scholar" id="google_scholar" />
                <Label
                  htmlFor="google_scholar"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Google Scholar
                </Label>
              </div>
            </RadioGroup>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || !evidenceSpec.trim()}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {loading ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Generating & Testing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Generate Keywords
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}