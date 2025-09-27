import { useTheme } from '../context/ThemeContext';
import { NavLink, useLocation } from 'react-router-dom';
import { MoonIcon, SunIcon, ChatBubbleLeftRightIcon, BeakerIcon, UserCircleIcon, TableCellsIcon, MagnifyingGlassIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import settings from '../config/settings';
import { HelpGuide } from '@/components/features/help';
import { useAuth } from '../context/AuthContext';


export default function TopBar() {
    const { isDarkMode, toggleTheme } = useTheme();
    const location = useLocation();
    const { logout, user } = useAuth();

    const getLinkClass = (path: string) => {
        const isActive = location.pathname === path;
        return `flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`;
    };

    // Role-based navigation filtering
    const canSeeAllMenus = user?.role === 'admin'

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 flex items-center justify-between px-6">
            <div className="flex items-center gap-6">
                {/* Logo */}
                <div className="flex items-center">
                    <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
                    <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">{settings.appName}</span>
                </div>

                {/* Navigation */}
                <nav className="flex items-center gap-2">
                    {/* Show all menu items for admins and users */}
                    {canSeeAllMenus && (
                        <>
                            <NavLink to="/jam-bot" className={getLinkClass('/jam-bot')}>
                                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
                                Chat
                            </NavLink>
                            <NavLink to="/workbench" className={getLinkClass('/workbench')}>
                                <TableCellsIcon className="h-5 w-5 mr-2" />
                                Workbench
                            </NavLink>
                        </>
                    )}

                    {/* Smart Search is visible to all roles */}
                    <NavLink to="/smart-search" className={getLinkClass('/smart-search')}>
                        <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
                        Smart Search
                    </NavLink>
                    <NavLink to="/pubmed-search-designer" className={getLinkClass('/pubmed-search-designer')}>
                        <PencilSquareIcon className="h-5 w-5 mr-2" />
                        Search Designer
                    </NavLink>
                    <NavLink to="/smart-search-2" className={getLinkClass('/smart-search-2')}>
                        <MagnifyingGlassIcon className="h-5 w-5 mr-2" />
                        Smart Search 2
                    </NavLink>
                    <NavLink to="/lab" className={getLinkClass('/lab')}>
                        <BeakerIcon className="h-5 w-5 mr-2" />
                        Lab
                    </NavLink>

                </nav>
            </div>

            <div className="flex items-center gap-6">
                <button onClick={toggleTheme} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                    {isDarkMode ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                </button>
                <HelpGuide />
                <NavLink to="/profile" className={getLinkClass('/profile')}>
                    <UserCircleIcon className="h-6 w-6" />
                </NavLink>
                <button
                    onClick={logout}
                    className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                >
                    Logout
                </button>
            </div>
        </header>
    );
} 