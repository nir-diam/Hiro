
import React, { useState } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, XMarkIcon, UserGroupIcon, BriefcaseIcon, BuildingOffice2Icon, ChevronDownIcon } from './Icons';

type EntityType = 'candidate' | 'job' | 'client';
type FieldType = 'text' | 'number' | 'date' | 'select' | 'boolean';

interface CustomField {
    id: number;
    entity: EntityType;
    label: string;
    key: string;
    type: FieldType;
    options?: string; // For 'select' type, comma separated
    isMandatory: boolean;
}

const initialFields: CustomField[] = [
    { id: 1, entity: 'candidate', label: 'מידת חולצה', key: 'shirt_size', type: 'select', options: 'S, M, L, XL, XXL', isMandatory: false },
    { id: 2, entity: 'candidate', label: 'סיווג ביטחוני', key: 'security_clearance', type: 'boolean', isMandatory: false },
    { id: 3, entity: 'job', label: 'תקציב רווחה (שנתי)', key: 'welfare_budget', type: 'number', isMandatory: true },
    { id: 4, entity: 'client', label: 'קוד ספק במערכת הנה"ח', key: 'sap_vendor_id', type: 'text', isMandatory: false },
];

const typeLabels: Record<FieldType, string> = {
    text: 'טקסט',
    number: 'מספר',
    date: 'תאריך',
    select: 'רשימת בחירה',
    boolean: 'כן/לא'
};

const CustomFieldsSettingsView: React.FC = () => {
    const [fields, setFields] = useState<CustomField[]>(initialFields);
    const [activeTab, setActiveTab] = useState<EntityType>('candidate');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingField, setEditingField] = useState<CustomField | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<CustomField>>({
        label: '',
        type: 'text',
        options: '',
        isMandatory: false
    });

    const filteredFields = fields.filter(f => f.entity === activeTab);

    const handleOpenModal = (field?: CustomField) => {
        if (field) {
            setEditingField(field);
            setFormData({ ...field });
        } else {
            setEditingField(null);
            setFormData({ label: '', type: 'text', options: '', isMandatory: false, entity: activeTab });
        }
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (!formData.label) return;

        // Generate a key from label if not present
        const generatedKey = formData.key || formData.label?.toLowerCase().replace(/\s/g, '_') + '_' + Math.floor(Math.random()*1000);

        if (editingField) {
            setFields(prev => prev.map(f => f.id === editingField.id ? { ...f, ...formData } as CustomField : f));
        } else {
            const newField: CustomField = {
                id: Date.now(),
                ...formData as CustomField,
                key: generatedKey,
                entity: activeTab
            };
            setFields(prev => [...prev, newField]);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם אתה בטוח? מחיקת שדה תמחוק את כל הנתונים הקשורים אליו.')) {
            setFields(prev => prev.filter(f => f.id !== id));
        }
    };

    return (
        <div className="h-full flex flex-col gap-6 animate-fade-in">
            {/* Tabs */}
            <div className="flex items-center gap-2 bg-bg-subtle p-1 rounded-xl w-fit">
                <button 
                    onClick={() => setActiveTab('candidate')}
                    className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'candidate' ? 'bg-bg-card text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                >
                    <UserGroupIcon className="w-4 h-4" />
                    מועמדים
                </button>
                <button 
                    onClick={() => setActiveTab('job')}
                    className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'job' ? 'bg-bg-card text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                >
                    <BriefcaseIcon className="w-4 h-4" />
                    משרות
                </button>
                <button 
                    onClick={() => setActiveTab('client')}
                    className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-bold transition-all ${activeTab === 'client' ? 'bg-bg-card text-primary-600 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                >
                    <BuildingOffice2Icon className="w-4 h-4" />
                    לקוחות
                </button>
            </div>

            {/* Content */}
            <div className="bg-bg-card border border-border-default rounded-xl shadow-sm flex flex-col flex-grow overflow-hidden">
                <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/30">
                    <div>
                        <h3 className="font-bold text-text-default">שדות מותאמים אישית: {activeTab === 'candidate' ? 'מועמדים' : activeTab === 'job' ? 'משרות' : 'לקוחות'}</h3>
                        <p className="text-xs text-text-muted">הגדר שדות מידע נוספים שיופיעו בטפסי המערכת.</p>
                    </div>
                    <button onClick={() => handleOpenModal()} className="bg-primary-600 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm flex items-center gap-2">
                        <PlusIcon className="w-4 h-4" />
                        הוסף שדה
                    </button>
                </div>
                
                <div className="overflow-y-auto p-4">
                    {filteredFields.length > 0 ? (
                        <table className="w-full text-sm text-right">
                            <thead className="text-xs text-text-muted uppercase border-b border-border-default">
                                <tr>
                                    <th className="px-4 py-3">שם שדה (תווית)</th>
                                    <th className="px-4 py-3">סוג שדה</th>
                                    <th className="px-4 py-3">חובה?</th>
                                    <th className="px-4 py-3">אפשרויות (Select)</th>
                                    <th className="px-4 py-3 text-center">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {filteredFields.map(field => (
                                    <tr key={field.id} className="hover:bg-bg-subtle/50 transition-colors">
                                        <td className="px-4 py-3 font-semibold text-text-default">{field.label}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium border border-blue-100">
                                                {typeLabels[field.type]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{field.isMandatory ? 'כן' : 'לא'}</td>
                                        <td className="px-4 py-3 text-text-muted text-xs max-w-xs truncate" title={field.options}>{field.options || '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => handleOpenModal(field)} className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-bg-hover rounded-md transition-colors"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(field.id)} className="p-1.5 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 text-text-muted">
                            <p>לא הוגדרו שדות מותאמים אישית לישות זו.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between p-4 border-b border-border-default">
                            <h2 className="text-lg font-bold">{editingField ? 'עריכת שדה' : 'שדה חדש'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full text-text-muted hover:bg-bg-hover"><XMarkIcon className="w-5 h-5" /></button>
                        </header>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">שם השדה (תווית)</label>
                                <input 
                                    type="text" 
                                    value={formData.label} 
                                    onChange={e => setFormData({...formData, label: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="לדוגמה: מידת נעליים"
                                />
                            </div>
                             <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">סוג שדה</label>
                                <div className="relative">
                                    <select 
                                        value={formData.type} 
                                        onChange={e => setFormData({...formData, type: e.target.value as FieldType})}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm appearance-none focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        {Object.entries(typeLabels).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                    <ChevronDownIcon className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                            </div>
                            
                            {formData.type === 'select' && (
                                <div className="animate-fade-in">
                                    <label className="block text-sm font-semibold text-text-muted mb-1.5">אפשרויות (מופרד בפסיק)</label>
                                    <textarea 
                                        value={formData.options} 
                                        onChange={e => setFormData({...formData, options: e.target.value})}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500 focus:border-primary-500"
                                        rows={3}
                                        placeholder="אדום, ירוק, כחול"
                                    />
                                </div>
                            )}

                            <label className="flex items-center gap-2 cursor-pointer pt-2">
                                <input 
                                    type="checkbox" 
                                    checked={formData.isMandatory} 
                                    onChange={e => setFormData({...formData, isMandatory: e.target.checked})}
                                    className="w-4 h-4 text-primary-600 rounded border-border-default focus:ring-primary-500"
                                />
                                <span className="text-sm font-medium">שדה חובה</span>
                            </label>
                        </div>
                        <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                            <button onClick={handleSave} className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700 transition shadow-sm">שמור</button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomFieldsSettingsView;
