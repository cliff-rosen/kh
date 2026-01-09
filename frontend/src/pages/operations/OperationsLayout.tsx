/**
 * Operations Layout - Wrapper with sub-navigation
 */

import { NavLink, Outlet } from 'react-router-dom';
import {
    DocumentCheckIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

const navItems = [
    { to: '/operations', label: 'Report Queue', icon: DocumentCheckIcon, end: true },
    { to: '/operations/scheduler', label: 'Scheduler', icon: ClockIcon },
];

export default function OperationsLayout() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {/* Sub-navigation */}
            <nav className="flex items-center gap-1 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                            `flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                isActive
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                            }`
                        }
                    >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            {/* Page content */}
            <Outlet />
        </div>
    );
}
