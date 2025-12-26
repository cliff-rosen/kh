import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BuildingOfficeIcon, UsersIcon, GlobeAltIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useOrganization, OrganizationProvider } from '../context/OrganizationContext';
import { OrgDetailsForm } from '../components/org/OrgDetailsForm';
import { MemberList } from '../components/org/MemberList';
import { GlobalStreamSubscriptions } from '../components/org/GlobalStreamSubscriptions';

type OrgTab = 'details' | 'members' | 'subscriptions';

const tabs: { id: OrgTab; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
        id: 'details',
        label: 'Details',
        description: 'Organization name and settings',
        icon: Cog6ToothIcon,
    },
    {
        id: 'members',
        label: 'Members',
        description: 'Manage organization members',
        icon: UsersIcon,
    },
    {
        id: 'subscriptions',
        label: 'Stream Subscriptions',
        description: 'Subscribe to global streams',
        icon: GlobeAltIcon,
    },
];

function OrgSettingsContent() {
    const { isOrgAdmin, user } = useAuth();
    const { loadOrganization, loadMembers, organization } = useOrganization();
    const [activeTab, setActiveTab] = useState<OrgTab>('details');

    useEffect(() => {
        if (user?.org_id) {
            loadOrganization();
            loadMembers();
        }
    }, [user?.org_id]);

    // Redirect non-org admins
    if (!isOrgAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    // Redirect users without an org
    if (!user?.org_id) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 text-center">
                    <BuildingOfficeIcon className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                        No Organization
                    </h2>
                    <p className="text-yellow-700 dark:text-yellow-400">
                        You are not currently assigned to an organization. Contact a platform administrator.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <BuildingOfficeIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Organization Settings
                        </h1>
                        {organization && (
                            <p className="text-gray-600 dark:text-gray-400">
                                {organization.name}
                            </p>
                        )}
                    </div>
                </div>
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
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                        }
                                    `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Active Tab Content */}
            <div>
                {activeTab === 'details' && <OrgDetailsForm />}
                {activeTab === 'members' && <MemberList />}
                {activeTab === 'subscriptions' && <GlobalStreamSubscriptions />}
            </div>
        </div>
    );
}

export default function OrgSettingsPage() {
    return (
        <OrganizationProvider>
            <OrgSettingsContent />
        </OrganizationProvider>
    );
}
