import { useAuth } from '@/context/AuthContext';

export default function Profile() {
    const { user, isAuthenticated } = useAuth();

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
            </div>
        </div>
    );
}
