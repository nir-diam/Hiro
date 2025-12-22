import React, { useState, useEffect, useId } from 'react';
import { XMarkIcon, BellIcon, EnvelopeIcon, CheckIcon } from './Icons';
import { SavedSearch } from '../context/SavedSearchesContext';

export interface JobAlertModalConfig {
    mode: 'create' | 'edit';
    currentFilters?: any;
    initialData?: SavedSearch;
}

interface CreateJobAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (alertData: { id?: number; name: string; frequency: 'daily' | 'weekly'; methods: ('email' | 'system')[] }) => void;
  config: JobAlertModalConfig | null;
}

const CreateJobAlertModal: React.FC<CreateJobAlertModalProps> = ({ isOpen, onClose, onSave, config }) => {
    const [name, setName] = useState('');
    const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily');
    const [methods, setMethods] = useState<('email' | 'system')[]>(['email']);
    const titleId = useId();

    useEffect(() => {
        if (isOpen && config) {
            if (config.mode === 'create' && config.currentFilters) {
                const { searchTerm, location, jobType, workModel, minSalary } = config.currentFilters;
                const filterParts = [];
                if (searchTerm) filterParts.push(`"${searchTerm}"`);
                if (location) filterParts.push(`ב${location}`);
                if (jobType) filterParts.push(jobType);
                setName(filterParts.length > 0 ? `התראה: ${filterParts.join(', ')}` : 'התראה על משרות חדשות');
                setFrequency('daily');
                setMethods(['email']);
            } else if (config.mode === 'edit' && config.initialData) {
                setName(config.initialData.name || 'עריכת התראה');
                setFrequency(config.initialData.frequency || 'daily');
                setMethods(config.initialData.notificationMethods || ['email']);
            }
        }
    }, [isOpen, config]);

    if (!isOpen || !config) return null;

    const handleMethodToggle = (method: 'email' | 'system') => {
        setMethods(prev => 
            prev.includes(method)
                ? prev.filter(m => m !== method).length > 0 ? prev.filter(m => m !== method) : prev // Prevent unchecking last one
                : [...prev, method]
        );
    };
    
    const handleSubmit = () => {
        if (!name.trim()) {
            alert('נא להזין שם להתראה.');
            return;
        }
        onSave({ id: config.initialData?.id, name, frequency, methods });
    };

    const currentFilters = config.mode === 'create' ? config.currentFilters : config.initialData?.searchParams;

    const FilterSummaryItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
        <div className="flex items-center gap-1 text-xs bg-bg-subtle px-2 py-1 rounded-md">
            <span className="font-semibold text-text-muted">{label}:</span>
            <span className="font-bold text-text-default">{value}</span>
        </div>
    );
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 id={titleId} className="text-xl font-bold text-text-default flex items-center gap-2">
                        <BellIcon className="w-6 h-6 text-primary-500" />
                        {config.mode === 'create' ? 'יצירת התראת משרות' : 'עריכת התראת משרות'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 space-y-6">
                    {currentFilters && (
                        <div>
                            <h3 className="text-sm font-semibold text-text-muted mb-2">סינון פעיל:</h3>
                            <div className="flex flex-wrap gap-2">
                                {currentFilters.searchTerm && <FilterSummaryItem label="חיפוש" value={currentFilters.searchTerm} />}
                                {currentFilters.location && <FilterSummaryItem label="מיקום" value={currentFilters.location} />}
                                {currentFilters.jobType && <FilterSummaryItem label="היקף משרה" value={currentFilters.jobType} />}
                                {currentFilters.workModel !== 'all' && <FilterSummaryItem label="מודל עבודה" value={currentFilters.workModel} />}
                                {currentFilters.minSalary > 0 && <FilterSummaryItem label="שכר מינימלי" value={`${currentFilters.minSalary.toLocaleString()}₪`} />}
                            </div>
                        </div>
                    )}
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">שם להתראה (לזיהוי קל)</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">תדירות</label>
                            <div className="flex items-center gap-1 bg-bg-subtle p-1 rounded-lg">
                                <button onClick={() => setFrequency('daily')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md ${frequency === 'daily' ? 'bg-bg-card shadow-sm' : ''}`}>יומי</button>
                                <button onClick={() => setFrequency('weekly')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md ${frequency === 'weekly' ? 'bg-bg-card shadow-sm' : ''}`}>שבועי</button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">אופן קבלת העדכון</label>
                             <div className="flex items-center gap-4 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={methods.includes('email')} onChange={() => handleMethodToggle('email')} className="w-4 h-4 text-primary-600 rounded" />
                                    <span className="flex items-center gap-1.5 text-sm font-semibold"><EnvelopeIcon className="w-5 h-5"/> אימייל</span>
                                </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={methods.includes('system')} onChange={() => handleMethodToggle('system')} className="w-4 h-4 text-primary-600 rounded" />
                                    <span className="flex items-center gap-1.5 text-sm font-semibold"><BellIcon className="w-5 h-5"/> מערכת</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button type="button" onClick={handleSubmit} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2 flex items-center gap-2">
                        <CheckIcon className="w-5 h-5"/>
                        שמור התראה
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default CreateJobAlertModal;
