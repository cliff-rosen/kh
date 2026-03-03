import { Link } from 'react-router-dom';
import { LoginForm } from '../components/auth';

export default function LoginPage() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center dark:bg-gray-900 bg-gray-50">
            <LoginForm />
            <Link
                to="/"
                className="mt-6 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
                &larr; Back to home
            </Link>
        </div>
    );
}
