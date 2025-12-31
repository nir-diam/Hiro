
import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon, UserIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

interface InviteManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (data: any) => void;
  jobTitle: string;
}

const allStatuses = [
    'חדש', 'בבדיקה', 'סינון טלפוני', 'ראיון HR', 'ראיון מקצועי', 
    'מבחן בית', 'בדיקת ממליצים', 'הצעת שכר', 'חתימה', 'התקבל', 
    'נדחה', 'הסיר מועמדות'
];

const InviteManagerModal: React.FC<InviteManagerModalProps> = ({ isOpen, onClose, onInvite, jobTitle }) => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(allStatuses);

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setName('');
            setSelectedStatuses(allStatuses); // Default: all selected
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleToggleStatus = (status: string) => {
        setSelectedStatuses(prev => 
            prev.includes(status) 
                ? prev.filter(s => s !== status) 
                : [...prev, status]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedStatuses(allStatuses);
        } else {
            setSelectedStatuses([]);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onInvite({ name, email, allowedStatuses: selectedStatuses });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">{t('invite.title')}</h2>
                        <p className="text-sm text-text-muted">{t('invite.subtitle', { jobTitle })}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <main className="p-6 overflow-y-auto space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('invite.manager_name')}</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500" 
                                    placeholder="ישראל ישראלי"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('invite.email')}</label>
                                <input 
                                    type="email" 
                                    required 
                                    value={email} 
                                    onChange={e => setEmail(e.target.value)} 
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500" 
                                    placeholder="manager@company.com"
                                />
                            </div>
                        </div>

                        <div className="bg-primary-50/50 p-4 rounded-xl border border-primary-100">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-text-default flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-primary-600" />
                                    {t('invite.permissions')}
                                </h3>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedStatuses.length === allStatuses.length} 
                                        onChange={handleSelectAll}
                                        className="rounded text-primary-600 focus:ring-primary-500" 
                                    />
                                    {t('invite.select_all')}
                                </label>
                            </div>
                            <p className="text-xs text-text-muted mb-4">
                                {t('invite.desc')}
                            </p>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {allStatuses.map(status => (
                                    <label key={status} className="flex items-center gap-2 p-2 bg-bg-card border border-border-default rounded-lg cursor-pointer hover:border-primary-300 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedStatuses.includes(status)}
                                            onChange={() => handleToggleStatus(status)}
                                            className="rounded text-primary-600 focus:ring-primary-500" 
                                        />
                                        <span className="text-sm">{status}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </main>

                    <footer className="p-4 border-t border-border-default bg-bg-subtle flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">{t('invite.cancel')}</button>
                        <button type="submit" className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700 transition shadow-sm flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            {t('invite.send')}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default InviteManagerModal;
