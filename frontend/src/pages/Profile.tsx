import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { EmailAgentOAuthButton } from '@/components/features/auth';
import { FeaturePresetManagementModal } from '@/components/features/workbench';
import { QuickActionManagementModal } from '@/components/features/workbench/QuickActionManagementModal';
import { CompanyProfileManagementModal } from '@/components/features/profile/CompanyProfileManagementModal';
import { Button } from '@/components/ui/button';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { Settings, Sliders, MessageCircle, Building2 } from 'lucide-react';

export default function Profile() {
    const { user, isAuthenticated } = useAuth();
    const [presetManagementOpen, setPresetManagementOpen] = useState(false);
    const [quickActionManagementOpen, setQuickActionManagementOpen] = useState(false);
    const [companyProfileManagementOpen, setCompanyProfileManagementOpen] = useState(false);

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="container mx-auto max-w-2xl py-12">
            <div className="space-y-8">
                {/* Profile Info */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-medium text-gray-900 dark:text-white">
                        {user?.username}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {user?.email}
                    </p>
                </div>

                {/* Gmail Connection */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Gmail</h3>
                            <p className="text-sm text-gray-500">Manage your Gmail connection</p>
                        </div>
                    </div>
                    <EmailAgentOAuthButton />
                </div>

                {/* Company Profile Management */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-gray-400" />
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Company Profile</h3>
                            <p className="text-sm text-gray-500">Customize your company context for AI analysis</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setCompanyProfileManagementOpen(true)}
                        className="flex items-center gap-2"
                    >
                        <Settings className="h-4 w-4" />
                        Manage Profile
                    </Button>
                </div>

                {/* Feature Presets Management */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Sliders className="h-5 w-5 text-gray-400" />
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Feature Presets</h3>
                            <p className="text-sm text-gray-500">Create and manage your custom feature extraction presets</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setPresetManagementOpen(true)}
                        className="flex items-center gap-2"
                    >
                        <Settings className="h-4 w-4" />
                        Manage Presets
                    </Button>
                </div>

                {/* Quick Actions Management */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MessageCircle className="h-5 w-5 text-gray-400" />
                        <div>
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Chat Quick Actions</h3>
                            <p className="text-sm text-gray-500">Create and manage your custom chat quick action buttons</p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setQuickActionManagementOpen(true)}
                        className="flex items-center gap-2"
                    >
                        <Settings className="h-4 w-4" />
                        Manage Actions
                    </Button>
                </div>
            </div>

            {/* Feature Preset Management Modal */}
            <FeaturePresetManagementModal
                open={presetManagementOpen}
                onOpenChange={setPresetManagementOpen}
            />

            {/* Quick Action Management Modal */}
            <QuickActionManagementModal
                open={quickActionManagementOpen}
                onOpenChange={setQuickActionManagementOpen}
            />

            {/* Company Profile Management Modal */}
            <CompanyProfileManagementModal
                open={companyProfileManagementOpen}
                onOpenChange={setCompanyProfileManagementOpen}
            />
        </div>
    );
} 