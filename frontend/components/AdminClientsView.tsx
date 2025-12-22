import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, PencilIcon } from './Icons';

// --- TYPES ---
interface Client {
  id: number;
  name: string;
  creationDate: string;
  jobsUsed: number;
  jobsTotal: number;
  coordinatorsUsed: number;
  coordinatorsTotal: number;
  isActive: boolean;
}

// --- MOCK DATA ---
const clientsData: Client[] = [
  { id: 1, name: 'מימד אנושי', creationDate: '2022-05-12', jobsUsed: 164, jobsTotal: 200, coordinatorsUsed: 8, coordinatorsTotal: 9, isActive: true },
  { id: 2, name: 'בזק', creationDate: '2023-01-20', jobsUsed: 50, jobsTotal: 50, coordinatorsUsed: 10, coordinatorsTotal: 10, isActive: true },
  { id: 3, name: 'Wix', creationDate: '2022-11-05', jobsUsed: 198, jobsTotal: 200, coordinatorsUsed: 15, coordinatorsTotal: 20, isActive: false },
  { id: 4, name: 'אל-על', creationDate: '2024-03-10', jobsUsed: 5, jobsTotal: 10, coordinatorsUsed: 2, coordinatorsTotal: 5, isActive: true },
];

const UsageCell: React.FC<{ used: number; total: number; }> = ({ used, total }) => {
    const percentage = total > 0 ? (used / total) * 100 : 0;
    const isOver = percentage > 100;
    const isHigh = percentage > 85;

    let textColor = 'text-text-default';
    if (isOver) textColor = 'text-red-600';
    else if (isHigh) textColor = 'text-amber-600';
    
    return <span className={`font-semibold tabular-nums ${textColor}`}>{used.toLocaleString()}/{total.toLocaleString()}</span>
}

const AdminClientsView: React.FC = () => {
    const navigate = useNavigate();
    const [clients, setClients] = useState<Client[]>(clientsData);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredClients = useMemo(() => {
        return clients.filter(client => 
            client.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [clients, searchTerm]);

    const handleStatusToggle = (clientId: number) => {
        setClients(prev => prev.map(client => 
            client.id === clientId ? { ...client, isActive: !client.isActive } : client
        ));
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div className="relative w-full md:max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="חיפוש לפי שם לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm" />
                </div>
                <button onClick={() => navigate('/admin/client/new')} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition">
                    <PlusIcon className="w-5 h-5"/>
                    <span>לקוח חדש</span>
                </button>
            </div>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right min-w-[800px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                        <tr>
                            <th className="p-3">שם לקוח</th>
                            <th className="p-3">תאריך יצירה</th>
                            <th className="p-3">משרות</th>
                            <th className="p-3">רכזים</th>
                            <th className="p-3">סטטוס</th>
                            <th className="p-3 text-center">פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                    {filteredClients.map(client => (
                        <tr key={client.id} className="hover:bg-bg-hover group">
                            <td className="p-3 font-semibold text-primary-700">{client.name}</td>
                            <td className="p-3 text-text-muted">{new Date(client.creationDate).toLocaleDateString('he-IL')}</td>
                            <td className="p-3 text-text-default"><UsageCell used={client.jobsUsed} total={client.jobsTotal} /></td>
                            <td className="p-3 text-text-default"><UsageCell used={client.coordinatorsUsed} total={client.coordinatorsTotal} /></td>
                            <td className="p-3">
                                 <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={client.isActive} onChange={() => handleStatusToggle(client.id)} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                                </label>
                            </td>
                            <td className="p-3 text-center">
                                <button onClick={() => navigate(`/admin/client/edit/${client.id}`)} className="p-2 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600 group-hover:opacity-100 opacity-0 transition-opacity">
                                    <PencilIcon className="w-5 h-5"/>
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminClientsView;