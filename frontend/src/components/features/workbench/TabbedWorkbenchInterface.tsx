import React from 'react';
import { Search, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tab {
  id: 'search' | 'groups';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface TabbedWorkbenchInterfaceProps {
  activeTab: 'search' | 'groups';
  onTabChange: (tab: 'search' | 'groups') => void;
  searchContent: React.ReactNode;
  groupsContent: React.ReactNode;
}

const tabs: Tab[] = [
  { id: 'search', label: 'Search', icon: Search },
  { id: 'groups', label: 'Groups', icon: Folder }
];

export function TabbedWorkbenchInterface({
  activeTab,
  onTabChange,
  searchContent,
  groupsContent
}: TabbedWorkbenchInterfaceProps) {
  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap",
                  isActive
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600"
                )}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'search' && searchContent}
        {activeTab === 'groups' && groupsContent}
      </div>
    </div>
  );
}