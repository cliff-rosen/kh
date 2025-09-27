/**
 * Provider Selector Component
 * 
 * Allows users to select which search provider(s) to use for their search.
 * Displays provider availability status and supports both single and multi-provider selection.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle, Clock, Database, Search } from 'lucide-react';
import { SearchProvider } from '@/types/unifiedSearch';

interface ProviderSelectorProps {
  selectedProvider: SearchProvider;
  onProviderChange: (provider: SearchProvider) => void;
  selectedProviders: SearchProvider[];
  onMultiProviderChange: (providers: SearchProvider[]) => void;
  mode: 'single' | 'multi';
  onModeChange: (mode: 'single' | 'multi') => void;
  disabled?: boolean;
}

interface ProviderStatus {
  id: SearchProvider;
  available: boolean;
  loading: boolean;
  error?: string;
}

const PROVIDER_INFO = {
  pubmed: {
    name: 'PubMed',
    description: 'National Library of Medicine biomedical database',
    icon: Database,
    features: ['Full abstracts', 'MeSH terms', 'Clinical focus', 'Date filtering'],
    iconColor: 'text-blue-600 dark:text-blue-400'
  },
  scholar: {
    name: 'Google Scholar',
    description: 'Academic search engine covering all disciplines',
    icon: Search,
    features: ['Citation counts', 'PDF links', 'Broad coverage', 'Version tracking'],
    iconColor: 'text-green-600 dark:text-green-400'
  }
} as const;

export function ProviderSelector({
  selectedProvider,
  onProviderChange,
  selectedProviders,
  onMultiProviderChange,
  mode,
  onModeChange,
  disabled = false
}: ProviderSelectorProps) {
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  useEffect(() => {
    checkProviderAvailability();
  }, []);

  const checkProviderAvailability = async () => {
    setIsCheckingAvailability(true);
    
    try {
      // Initialize with all providers as loading
      const initialStatuses: ProviderStatus[] = Object.keys(PROVIDER_INFO).map(id => ({
        id: id as SearchProvider,
        available: false,
        loading: true
      }));
      setProviderStatuses(initialStatuses);

      // Check availability - for now assume both are available
      const availableProviders = ['pubmed', 'scholar'] as SearchProvider[];
      
      // Update statuses
      const updatedStatuses: ProviderStatus[] = Object.keys(PROVIDER_INFO).map(id => ({
        id: id as SearchProvider,
        available: availableProviders.includes(id as SearchProvider),
        loading: false,
        error: !availableProviders.includes(id as SearchProvider) ? 'Provider currently unavailable' : undefined
      }));
      
      setProviderStatuses(updatedStatuses);
    } catch (error) {
      console.error('Failed to check provider availability:', error);
      
      // Set all providers as available by default if check fails
      const errorStatuses: ProviderStatus[] = Object.keys(PROVIDER_INFO).map(id => ({
        id: id as SearchProvider,
        available: true,
        loading: false
      }));
      
      setProviderStatuses(errorStatuses);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const getProviderStatus = (providerId: SearchProvider): ProviderStatus => {
    return providerStatuses.find(status => status.id === providerId) || {
      id: providerId,
      available: false,
      loading: true
    };
  };

  const handleSingleProviderChange = (providerId: SearchProvider) => {
    const status = getProviderStatus(providerId);
    if (!status.available && !status.loading) return;
    
    onProviderChange(providerId);
  };

  const handleMultiProviderToggle = (providerId: SearchProvider, checked: boolean) => {
    const status = getProviderStatus(providerId);
    if (!status.available && !status.loading) return;

    const newProviders = checked
      ? [...selectedProviders, providerId]
      : selectedProviders.filter(p => p !== providerId);
    
    onMultiProviderChange(newProviders);
  };

  const renderProviderStatus = (status: ProviderStatus) => {
    if (status.loading) {
      return (
        <Badge variant="outline" className="ml-2">
          <Clock className="w-3 h-3 mr-1 animate-spin" />
          Checking...
        </Badge>
      );
    }
    
    if (status.available && !status.error) {
      return (
        <Badge variant="default" className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Available
        </Badge>
      );
    }
    
    if (status.available && status.error) {
      // Available but with warnings
      return (
        <Badge variant="outline" className="ml-2 bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-600">
          <AlertCircle className="w-3 h-3 mr-1" />
          Warning
        </Badge>
      );
    }
    
    return (
      <Badge variant="destructive" className="ml-2">
        <AlertCircle className="w-3 h-3 mr-1" />
        Unavailable
      </Badge>
    );
  };

  const renderProviderCard = (providerId: SearchProvider, status: ProviderStatus) => {
    const info = PROVIDER_INFO[providerId];
    const IconComponent = info.icon;
    const isDisabled = disabled || (!status.available && !status.loading);

    return (
      <Card key={providerId} className={`transition-all bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${
        isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md cursor-pointer'
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center">
              <IconComponent className={`w-5 h-5 mr-2 ${info.iconColor}`} />
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{info.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{info.description}</p>
              </div>
            </div>
            {renderProviderStatus(status)}
          </div>
          
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {info.features.map((feature) => (
                <Badge key={feature} variant="secondary" className="text-xs">
                  {feature}
                </Badge>
              ))}
            </div>
          </div>
          
          {mode === 'single' ? (
            <RadioGroupItem
              value={providerId}
              id={providerId}
              disabled={isDisabled}
              className="mt-2"
            />
          ) : (
            <Checkbox
              id={`multi-${providerId}`}
              checked={selectedProviders.includes(providerId)}
              onCheckedChange={(checked) => handleMultiProviderToggle(providerId, !!checked)}
              disabled={isDisabled}
              className="mt-2"
            />
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select Search Provider</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose which database(s) to search for academic articles
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant={mode === 'single' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('single')}
            disabled={disabled}
          >
            Single Provider
          </Button>
          <Button
            variant={mode === 'multi' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onModeChange('multi')}
            disabled={disabled}
          >
            Multiple Providers
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={checkProviderAvailability}
            disabled={isCheckingAvailability}
          >
            Refresh Status
          </Button>
        </div>
      </div>

      {mode === 'single' ? (
        <RadioGroup
          value={selectedProvider}
          onValueChange={(value) => handleSingleProviderChange(value as SearchProvider)}
          disabled={disabled}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(PROVIDER_INFO).map((providerId) => {
              const status = getProviderStatus(providerId as SearchProvider);
              return (
                <Label key={providerId} htmlFor={providerId} className="cursor-pointer">
                  {renderProviderCard(providerId as SearchProvider, status)}
                </Label>
              );
            })}
          </div>
        </RadioGroup>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.keys(PROVIDER_INFO).map((providerId) => {
            const status = getProviderStatus(providerId as SearchProvider);
            return (
              <Label key={providerId} htmlFor={`multi-${providerId}`} className="cursor-pointer">
                {renderProviderCard(providerId as SearchProvider, status)}
              </Label>
            );
          })}
        </div>
      )}
      
      {mode === 'multi' && selectedProviders.length === 0 && (
        <div className="text-center text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md">
          Please select at least one provider to search
        </div>
      )}
    </div>
  );
}