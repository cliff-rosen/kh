import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { emailApi } from '@/lib/api/emailApi';
import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function EmailAgentOAuthButton() {
    const { isAuthenticated } = useAuth();
    const [isConnecting, setIsConnecting] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [_error, setError] = useState<string | null>(null);
    const [isGmailConnected, setIsGmailConnected] = useState(false);

    useEffect(() => {
        const checkGmailConnection = async () => {
            if (!isAuthenticated) return;
            setIsGmailConnected(await emailApi.checkConnection());
        };

        checkGmailConnection();
    }, [isAuthenticated]);

    const handleGoogleAuth = async () => {
        try {
            setIsConnecting(true);
            setError(null);

            const authUrl = await emailApi.initOAuth();

            const popup = window.open(
                authUrl,
                'Google OAuth',
                'width=600,height=700,menubar=no,toolbar=no,location=no,status=no'
            );

            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                throw new Error('Popup was blocked. Please allow popups for this site.');
            }

            const checkPopup = setInterval(() => {
                if (popup?.closed) {
                    clearInterval(checkPopup);
                    window.location.reload();
                }
            }, 1000);

        } catch (error: any) {
            console.error('Error initiating Google OAuth:', error);
            const errorMessage = error.message || 'Failed to connect to Google';

            if (errorMessage.includes('Scope has changed')) {
                setError('Gmail permissions have changed. Please reconnect your account.');
            } else if (errorMessage.includes('Popup was blocked')) {
                setError('Please allow popups for this site to connect your Gmail account.');
            } else {
                setError(errorMessage);
            }

            setIsConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            setIsDisconnecting(true);
            setError(null);
            await emailApi.disconnect();
            setIsGmailConnected(false);
        } catch (error: any) {
            console.error('Error disconnecting Gmail:', error);
            setError(error.message || 'Failed to disconnect Gmail');
        } finally {
            setIsDisconnecting(false);
        }
    };

    if (!isAuthenticated) {
        return null;
    }

    if (isGmailConnected) {
        return (
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Connected</span>
                </div>
                <Button
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    variant="ghost"
                    size="sm"
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                    <XCircle className="h-4 w-4 mr-1" />
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
            </div>
        );
    }

    return (
        <Button
            onClick={handleGoogleAuth}
            disabled={isConnecting}
            variant="secondary"
            size="sm"
            className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
        >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
            </svg>
            <span className="text-sm">
                {isConnecting ? 'Connecting...' : 'Connect Gmail'}
            </span>
        </Button>
    );
} 