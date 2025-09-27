import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { CheckCircle2 } from 'lucide-react';

export default function EmailAuthSuccess() {
    const navigate = useNavigate();

    useEffect(() => {
        // Automatically redirect to home after 3 seconds
        const timer = setTimeout(() => {
            navigate('/');
        }, 3000);

        return () => clearTimeout(timer);
    }, [navigate]);

    return (
        <div className="container flex items-center justify-center min-h-screen py-10">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-6 h-6" />
                        Gmail Connected Successfully
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-600 dark:text-gray-300">
                        Your Gmail account has been successfully connected. You can now use the email features.
                    </p>
                    <Button
                        onClick={() => navigate('/')}
                        className="w-full"
                    >
                        Return to Home
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
} 