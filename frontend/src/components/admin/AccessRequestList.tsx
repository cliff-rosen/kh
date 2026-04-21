import { useState, useEffect } from 'react';
import { adminApi, type AccessRequest } from '@/lib/api/adminApi';

const STATUS_OPTIONS = ['pending', 'contacted', 'approved', 'rejected'];
const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    contacted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function AccessRequestList() {
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getAccessRequests();
            setRequests(data);
        } catch (err) {
            console.error('Failed to load access requests', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const updateRequest = async (id: number, updates: { status?: string; notes?: string }) => {
        try {
            const updated = await adminApi.updateAccessRequest(id, updates);
            setRequests(prev => prev.map(r => r.id === id ? updated : r));
        } catch (err) {
            console.error('Failed to update access request', err);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading...</div>;
    }

    if (requests.length === 0) {
        return <div className="p-8 text-center text-gray-500">No access requests yet.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Company</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Notes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {requests.map(req => (
                        <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                {new Date(req.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {req.name}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                <a href={`mailto:${req.email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {req.email}
                                </a>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                {req.company || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                                <select
                                    value={req.status}
                                    onChange={(e) => updateRequest(req.id, { status: e.target.value })}
                                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[req.status] || 'bg-gray-100 text-gray-800'}`}
                                >
                                    {STATUS_OPTIONS.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </td>
                            <td className="px-4 py-3 text-sm">
                                <input
                                    type="text"
                                    defaultValue={req.notes || ''}
                                    placeholder="Add notes..."
                                    onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        if (val !== (req.notes || '')) {
                                            updateRequest(req.id, { notes: val });
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    }}
                                    className="w-full text-sm bg-transparent border-0 border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 focus:ring-0 px-0 py-0 text-gray-600 dark:text-gray-400 placeholder-gray-400"
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
