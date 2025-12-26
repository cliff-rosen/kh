import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheckIcon, BuildingOfficeIcon, GlobeAltIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { OrganizationList, GlobalStreamList, UserList } from '../components/admin';

type AdminTab = 'organizations' | 'streams' | 'users';

const tabs: { id: AdminTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
        id: 'organizations',
        label: 'Organizations',
        description: 'Manage organizations and their settings',
        icon: BuildingOfficeIcon,
    },
    {
        id: 'streams',
        label: 'Global Streams',
        description: 'Manage platform-wide research streams',
        icon: GlobeAltIcon,
    },
    {
        id: 'users',
        label: 'Users',
        description: 'Manage users and their roles',
        icon: UsersIcon,
    },
];

export default function AdminPage() {
    const { isPlatformAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<AdminTab>('organizations');

    // Redirect non-admins
    if (!isPlatformAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <ShieldCheckIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Platform Administration
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Manage organizations, global streams, and users across the platform
                </p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex space-x-8">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                        ${isActive
                                            ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Active Tab Content */}
            <div>
                {activeTab === 'organizations' && <OrganizationList />}
                {activeTab === 'streams' && <GlobalStreamList />}
                {activeTab === 'users' && <UserList />}
            </div>
        </div>
    );
}
