
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
    ListBulletIcon, PlusIcon, PencilIcon, TrashIcon, 
    XMarkIcon, ChevronRightIcon, TagIcon, InformationCircleIcon, NoSymbolIcon,
    MagnifyingGlassIcon
} from './Icons';

// --- Types ---
type ModuleType = 'candidates' | 'jobs' | 'clients' | 'general';

interface PicklistCategory {
    id: string;
    name: string;
    key: string;
    description: string;
    isSystem: boolean; 
    module: ModuleType;
    parentId?: string; // Points to another Category ID
    order?: number;
}

interface PicklistValue {
    id: string | number;
    label: string;
    value: string; // Internal key
    color: string; // Hex code or empty string
    isActive: boolean;
    order: number;
    isSystem: boolean;
    parentValueId?: string | number; // Points to a Value ID in the parent list
}

const initialCategories: PicklistCategory[] = [];

const initialValues: Record<string, PicklistValue[]> = {};

// --- Helper for Colors ---
const colorPalette = [
    '#64748B', // Slate
    '#EF4444', // Red
    '#F97316', // Orange
    '#F59E0B', // Amber
    '#10B981', // Emerald
    '#3B82F6', // Blue
    '#6366F1', // Indigo
    '#8B5CF6', // Violet
    '#EC4899', // Pink
];

// --- CATEGORY MODAL ---
const CategoryModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (cat: PicklistCategory) => Promise<void>;
    category?: PicklistCategory | null;
    allCategories: PicklistCategory[];
    parentForModal?: PicklistCategory | null;
    isSaving?: boolean;
}> = ({ isOpen, onClose, onSave, category, allCategories, parentForModal, isSaving = false }) => {
    const [formData, setFormData] = useState<PicklistCategory>({
        id: '', name: '', key: '', description: '', isSystem: false, module: 'general', parentId: undefined
    });

    const [isDependent, setIsDependent] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (category) {
                setFormData(category);
                setIsDependent(!!category.parentId);
            } else {
                setFormData({
                    id: '',
                    name: '',
                    key: '',
                    description: '',
                    isSystem: false,
                    module: parentForModal?.module || 'general',
                    parentId: parentForModal?.id,
                });
                setIsDependent(Boolean(parentForModal));
            }
        }
    }, [isOpen, category, parentForModal]);

    if (!isOpen) return null;

    const handleDependentToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsDependent(e.target.checked);
        if (!e.target.checked) {
            setFormData(prev => ({ ...prev, parentId: undefined }));
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-default overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">{category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'}</h3>
                    <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">שם הרשימה</label>
                        <input 
                            type="text" 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                            placeholder="לדוגמה: מקורות הגעה"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">מפתח מערכת (Key)</label>
                        <input 
                            type="text" 
                            value={formData.key} 
                            onChange={e => setFormData({...formData, key: e.target.value})}
                            className={`w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-mono ${category ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary-500'}`}
                            placeholder="lead_source"
                            dir="ltr"
                            required
                            disabled={!!category}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">שיוך למודול</label>
                        <select 
                            value={formData.module}
                            onChange={e => setFormData({...formData, module: e.target.value as ModuleType})}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="general">כללי (General)</option>
                            <option value="candidates">מועמדים (Candidates)</option>
                            <option value="jobs">משרות (Jobs)</option>
                            <option value="clients">לקוחות (Clients)</option>
                        </select>
                    </div>
                    
                    <div className="bg-bg-subtle p-3 rounded-lg border border-border-default">
                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                            <input 
                                type="checkbox" 
                                checked={isDependent} 
                                onChange={handleDependentToggle}
                                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                            <span className="text-sm font-bold text-text-default">האם זו רשימה תלויה? (Cascading)</span>
                        </label>
                        
                        {isDependent && (
                            <div className="mt-2 animate-fade-in">
                                <label className="block text-xs font-bold text-text-muted mb-1.5">בחר רשימת אב</label>
                                <select 
                                    value={formData.parentId || ''}
                                    onChange={e => setFormData({...formData, parentId: e.target.value})}
                                    className="w-full bg-white border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                                    required={isDependent}
                                >
                                    <option value="" disabled>בחר רשימה...</option>
                                    {allCategories.filter(c => c.id !== formData.id).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-text-muted mt-1">ערכים ברשימה זו יהיו מסוננים לפי הערך שנבחר ברשימת האב.</p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">תיאור</label>
                        <textarea 
                            value={formData.description} 
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                            placeholder="תיאור קצר של הרשימה..."
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-text-muted hover:bg-bg-subtle">ביטול</button>
                        <button 
                            type="submit" 
                            disabled={isSaving}
                            className={`px-6 py-2 rounded-lg text-sm font-bold text-white ${isSaving ? 'bg-primary-200 cursor-wait' : 'bg-primary-600 hover:bg-primary-700'} shadow-sm`}
                        >
                            {category ? 'שמור שינויים' : (parentForModal ? 'צור רשימה תלויה' : 'צור רשימה')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// --- VALUE MODAL ---
const ValueModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    value: PicklistValue | null;
    onSave: (val: PicklistValue) => Promise<void>;
    parentCategory?: PicklistCategory | null;
    parentValues?: PicklistValue[];
    isSaving?: boolean;
}> = ({ isOpen, onClose, value, onSave, parentCategory, parentValues, isSaving = false }) => {
    const [formData, setFormData] = useState<PicklistValue>({
        id: '',
        label: '',
        value: '',
        color: '',
        isActive: true,
        order: 0,
        isSystem: false,
        parentValueId: parentValues && parentValues.length > 0 ? parentValues[0].id : undefined,
    });

    useEffect(() => {
        if (isOpen) {
            if (value) setFormData(value);
            else setFormData({
                id: '',
                label: '',
                value: '',
                color: '',
                isActive: true,
                order: 0,
                isSystem: false,
                parentValueId: parentValues && parentValues.length > 0 ? parentValues[0].id : undefined,
            });
        }
    }, [isOpen, value, parentValues]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-default overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">{value ? 'עריכת ערך' : 'ערך חדש'}</h3>
                    <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  

                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">שם לתצוגה (Label)</label>
                        <input 
                            type="text" 
                            value={formData.label} 
                            onChange={e => setFormData({...formData, label: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-1.5">ערך מערכת (Key)</label>
                        <input 
                            type="text" 
                            value={formData.value} 
                            onChange={e => setFormData({...formData, value: e.target.value})}
                            className={`w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-mono ${formData.isSystem ? 'opacity-50 cursor-not-allowed' : 'focus:ring-2 focus:ring-primary-500'}`}
                            required
                            disabled={formData.isSystem}
                            placeholder="my_value_key"
                            dir="ltr"
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-text-muted mb-2">צבע תצוגה</label>
                        <div className="flex flex-wrap gap-2">
                             <button
                                type="button"
                                onClick={() => setFormData({...formData, color: ''})}
                                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${formData.color === '' ? 'border-primary-500 scale-110' : 'border-gray-200 hover:scale-105 bg-white'}`}
                                title="ללא צבע"
                            >
                                <NoSymbolIcon className="w-4 h-4 text-gray-400" />
                            </button>
                            
                            {colorPalette.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setFormData({...formData, color: c})}
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${formData.color === c ? 'border-text-default scale-110' : 'border-transparent hover:scale-105'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input 
                            type="checkbox" 
                            id="isActive"
                            checked={formData.isActive}
                            onChange={e => setFormData({...formData, isActive: e.target.checked})}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                        />
                        <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">ערך פעיל</label>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-text-muted hover:bg-bg-subtle">ביטול</button>
                        <button 
                            type="submit"
                            disabled={isSaving}
                            className={`px-6 py-2 rounded-lg text-sm font-bold text-white ${isSaving ? 'bg-primary-200 cursor-wait' : 'bg-primary-600 hover:bg-primary-700'} shadow-sm`}
                        >
                            שמור
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const AdminPicklistsView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [categories, setCategories] = useState<PicklistCategory[]>(initialCategories);
    const [valuesMap, setValuesMap] = useState<Record<string, PicklistValue[]>>(initialValues);
    const [selectedParentCategoryKey, setSelectedParentCategoryKey] = useState<string>('');
    const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('');
    const [categoryParentContext, setCategoryParentContext] = useState<PicklistCategory | null>(null);
    const [isCategorySaving, setIsCategorySaving] = useState(false);
    const [isValueSaving, setIsValueSaving] = useState(false);
    const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
    const [deletingSubcategoryId, setDeletingSubcategoryId] = useState<string | null>(null);
    
    // Filtering State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModule, setFilterModule] = useState<ModuleType | 'all'>('all');
    const [filterParentValueId, setFilterParentValueId] = useState<string | number | 'all'>('all'); // Add state for parent value filter

    const loadPicklists = useCallback(async () => {
        if (!apiBase) return [];
        try {
            const res = await fetch(`${apiBase}/api/picklists/categories`);
            if (!res.ok) throw new Error('Failed to load categories');
            const data = await res.json();
            if (!Array.isArray(data)) return [];
            const normalized = data.map((cat: any) => ({
                id: cat.id,
                name: cat.name,
                key: cat.key,
                description: cat.description || '',
                isSystem: Boolean(cat.isSystem),
                module: ['candidates', 'jobs', 'clients', 'general'].includes(cat.module) ? cat.module : 'general',
                parentId: cat.parentId || undefined,
            }));
            const mapUpdates: Record<string, PicklistValue[]> = {};
            await Promise.all(
                normalized.map(async (cat) => {
                    mapUpdates[cat.key] = [];
                    try {
                        const valuesRes = await fetch(`${apiBase}/api/picklists/categories/${cat.id}/values`);
                        if (!valuesRes.ok) return;
                        const valuesData = await valuesRes.json();
                        if (!Array.isArray(valuesData)) return;
                        mapUpdates[cat.key] = valuesData.map((val: any) => ({
                            id: val.id,
                            label: val.label || val.value,
                            value: val.value || val.label,
                            color: val.color || '',
                            isActive: typeof val.isActive === 'boolean' ? val.isActive : true,
                            order: typeof val.order === 'number' ? val.order : 0,
                            isSystem: Boolean(val.isSystem),
                            parentValueId: val.parentValueId || undefined,
                        }));
                    } catch (err) {
                        console.error('Failed to load values for category', cat.key, err);
                    }
                }),
            );
            setCategories(normalized);
            setValuesMap(mapUpdates);
            return normalized;
        } catch (err) {
            console.error('Failed to load picklist data', err);
            return [];
        }
    }, [apiBase]);

    useEffect(() => {
        loadPicklists();
    }, [loadPicklists]);

    useEffect(() => {
        if (!categories.length) return;
        if (!selectedParentCategoryKey) {
            const parentOnly = categories.filter(cat => !cat.parentId);
            const firstParent = parentOnly[0] ?? categories[0];
            const firstChild = categories.find(cat => cat.parentId === firstParent?.id);
            if (firstParent) {
                setSelectedParentCategoryKey(firstParent.key);
                setSelectedCategoryKey(firstChild?.key || firstParent.key);
            }
        }
    }, [categories, selectedParentCategoryKey]);

    // Modal States
    const [isValueModalOpen, setIsValueModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingValue, setEditingValue] = useState<PicklistValue | null>(null);
    const [editingCategory, setEditingCategory] = useState<PicklistCategory | null>(null);

    const activeCategory = categories.find(c => c.key === selectedCategoryKey);
    const currentValues = valuesMap[selectedCategoryKey] || [];
    const activeParentCategory = categories.find(c => c.key === selectedParentCategoryKey);
    const dependentCategories = activeParentCategory ? categories.filter(c => c.parentId === activeParentCategory.id) : [];
    const hasSubcategories = dependentCategories.length > 0;
    const parentCategory = activeCategory?.parentId ? categories.find(c => c.id === activeCategory.parentId) : null;
    const parentValues = parentCategory ? valuesMap[parentCategory.key] : [];
    const parentValueList = activeParentCategory ? (valuesMap[activeParentCategory.key] || []) : [];
    const [deletingParentValueId, setDeletingParentValueId] = useState<string | number | null>(null);

    // Reset parent filter when category changes
    useEffect(() => {
        setFilterParentValueId('all');
    }, [selectedCategoryKey]);

    // Filter Categories Logic
    const filteredCategories = useMemo(() => {
        const parentsOnly = categories.filter(cat => !cat.parentId);
        return parentsOnly.filter(cat => {
            const matchesSearch = cat.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesModule = filterModule === 'all' || cat.module === filterModule;
            return matchesSearch && matchesModule;
        });
    }, [categories, searchTerm, filterModule]);

    // Filter Values Logic (by Parent)
    const filteredValues = useMemo(() => {
        if (!parentCategory || filterParentValueId === 'all') {
            return currentValues;
        }
        return currentValues.filter(val => {
            if (!val.parentValueId) return false;
            return String(val.parentValueId) === String(filterParentValueId);
        });
    }, [currentValues, parentCategory, filterParentValueId]);

    const handleDeleteCategory = async (category: PicklistCategory) => {
        if (!apiBase) {
            alert('כתובת ה-API לא מוגדרת.');
            return;
        }
        if (category.isSystem) {
            alert('לא ניתן למחוק קטגוריה של מערכת.');
            return;
        }
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את הרשימה "${category.name}"? פעולה זו עשויה למחוק גם את הערכים התלויים.`)) {
            return;
        }
        setDeletingCategoryId(category.id);
        try {
            const response = await fetch(`${apiBase}/api/picklists/categories/${category.id}`, { method: 'DELETE' });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'המחיקה נכשלה.');
            }
            await loadPicklists();
        } catch (err: any) {
            console.error('Failed to delete category', err);
            alert(err?.message || 'שגיאה במחיקת הרשימה.');
        } finally {
            setDeletingCategoryId(null);
        }
    };

    const handleDeleteSubcategory = async (subcategory: PicklistCategory) => {
        if (!apiBase) {
            alert('כתובת ה-API לא מוגדרת.');
            return;
        }
        if (subcategory.isSystem) {
            alert('לא ניתן למחוק רשימת מערכת.');
            return;
        }
        const confirmed = window.confirm(`האם אתה בטוח שברצונך למחוק את הרשימה "${subcategory.name}"?`);
        if (!confirmed) return;

        setDeletingSubcategoryId(subcategory.id);
        try {
            const response = await fetch(`${apiBase}/api/picklists/subcategories/${subcategory.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'המחיקה נכשלה.');
            }
            if (selectedCategoryKey === subcategory.key) {
                setSelectedCategoryKey(activeParentCategory?.key || '');
            }
            await loadPicklists();
        } catch (err: any) {
            console.error('Failed to delete subcategory', err);
            alert(err?.message || 'שגיאה במחיקת הרשימה.');
        } finally {
            setDeletingSubcategoryId(null);
        }
    };

    const handleDeleteParentValue = async (value: PicklistValue) => {
        if (!apiBase || !activeParentCategory) {
            alert('לא ניתן למחוק ערך כרגע.');
            return;
        }
        if (value.isSystem) {
            alert('לא ניתן למחוק ערך מערכת.');
            return;
        }
        const confirmed = window.confirm(`האם אתה בטוח שברצונך למחוק את הערך "${value.label}" מרשימת "${activeParentCategory.name}"?`);
        if (!confirmed) {
            return;
        }

        setDeletingParentValueId(value.id);
        try {
            const response = await fetch(`${apiBase}/api/picklists/categories/${activeParentCategory.id}/values/${value.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'המחיקה נכשלה.');
            }
            if (String(filterParentValueId) === String(value.id)) {
                setFilterParentValueId('all');
            }
            await loadPicklists();
        } catch (err: any) {
            console.error('Failed to delete parent value', err);
            alert(err?.message || 'שגיאה במחיקת הערך.');
        } finally {
            setDeletingParentValueId(null);
        }
    };

    const handleSaveValue = async (newValue: PicklistValue) => {
        if (!activeCategory) {
            alert('בחר רשימה לפני שמירת ערך.');
            return;
        }
        if (!apiBase) {
            alert('כתובת ה-API לא מוגדרת.');
            return;
        }
        setIsValueSaving(true);
        try {
            const payload = {
                label: newValue.label,
                value: newValue.value,
                color: newValue.color || '',
                isActive: Boolean(newValue.isActive),
                order: typeof newValue.order === 'number' ? newValue.order : Number(newValue.order) || 0,
                isSystem: Boolean(newValue.isSystem),
                parentValueId: newValue.parentValueId || null,
            };
            const endpoint = editingValue
                ? `${apiBase}/api/picklists/categories/${activeCategory.id}/values/${editingValue.id}`
                : `${apiBase}/api/picklists/categories/${activeCategory.id}/values`;
            const response = await fetch(endpoint, {
                method: editingValue ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'שגיאה בשמירת הערך.');
            }
            const saved = await response.json().catch(() => null);
            const updatedCategories = await loadPicklists();
            if (updatedCategories.length) {
                const updatedActive = updatedCategories.find(cat => cat.key === activeCategory.key);
                if (updatedActive) {
                    setSelectedCategoryKey(updatedActive.key);
                    if (updatedActive.parentId) {
                        const parentCat = updatedCategories.find(cat => cat.id === updatedActive.parentId);
                        if (parentCat) {
                            setSelectedParentCategoryKey(parentCat.key);
                        }
                    } else {
                        setSelectedParentCategoryKey(updatedActive.key);
                    }
                }
            }
            if (!editingValue && saved?.id) {
                setSelectedCategoryKey(activeCategory.key);
            }
        } catch (err: any) {
            console.error('Failed to persist picklist value', err);
            alert(err?.message || 'שגיאה בשמירת הערך.');
        } finally {
            setIsValueSaving(false);
            setIsValueModalOpen(false);
            setEditingValue(null);
        }
    };

    const handleDeleteValue = async (id: string | number) => {
        if (!activeCategory) {
            alert('בחר רשימה לפני המחיקה.');
            return;
        }
        if (!apiBase) {
            alert('כתובת ה-API לא מוגדרת.');
            return;
        }
        if (!window.confirm('האם אתה בטוח שברצונך למחוק את הערך?')) return;

        try {
            const response = await fetch(`${apiBase}/api/picklists/categories/${activeCategory.id}/values/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'המחיקה נכשלה.');
            }
            await loadPicklists();
        } catch (err: any) {
            console.error('Failed to delete picklist value', err);
            alert(err?.message || 'שגיאה במחיקת הערך.');
        }
    };

    const handleAddValue = () => {
        setEditingValue(null);
        setIsValueModalOpen(true);
    };

    const handleEditValue = (val: PicklistValue) => {
        setEditingValue(val);
        setIsValueModalOpen(true);
    };

    const closeCategoryModal = () => {
        setIsCategoryModalOpen(false);
        setEditingCategory(null);
        setCategoryParentContext(null);
    };

    const handleAddCategory = () => {
        setEditingCategory(null);
        setCategoryParentContext(null);
        setIsCategoryModalOpen(true);
    };

    const handleAddSubcategory = (parent: PicklistCategory) => {
        setEditingCategory(null);
        setCategoryParentContext(parent);
        setIsCategoryModalOpen(true);
    };

    const handleEditCategory = (cat: PicklistCategory) => {
        setEditingCategory(cat);
        setCategoryParentContext(null);
        setIsCategoryModalOpen(true);
    };

    const handleSaveCategory = async (categoryData: PicklistCategory) => {
        if (!apiBase) {
            alert('כתובת ה-API לא מוגדרת.');
            return;
        }
        setIsCategorySaving(true);
        try {
            const payload = {
                name: categoryData.name,
                key: categoryData.key,
                description: categoryData.description || '',
                module: categoryData.module || 'general',
                isSystem: Boolean(categoryData.isSystem),
                order: categoryData.order || 0,
                parentId: categoryData.parentId || null,
            };
            const endpoint = editingCategory
                ? `${apiBase}/api/picklists/categories/${editingCategory.id}`
                : `${apiBase}/api/picklists/categories`;
            const response = await fetch(endpoint, {
                method: editingCategory ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || 'שגיאה בשמירת הרשימה.');
            }
            const saved = await response.json();
            const normalized = await loadPicklists();
            const parentCat = normalized.find(cat => cat.id === saved.parentId);
            if (saved.parentId) {
                setSelectedParentCategoryKey(parentCat?.key || selectedParentCategoryKey || '');
            } else {
                setSelectedParentCategoryKey(saved.key);
            }
            setSelectedCategoryKey(saved.key);
            closeCategoryModal();
        } catch (err: any) {
            console.error('Failed to persist category', err);
            alert(err?.message || 'שגיאה בעדכון הרשימה.');
        } finally {
            setIsCategorySaving(false);
        }
    };

    const handleParentSelect = (cat: PicklistCategory) => {
        setSelectedParentCategoryKey(cat.key);
        const firstChild = categories.find(sub => sub.parentId === cat.id);
        setSelectedCategoryKey(firstChild?.key || cat.key);
        setFilterParentValueId('all');
    };

    const handleParentValueClick = (value: PicklistValue) => {
        setFilterParentValueId(value.id);
    };

    const filterOptions = [
        { id: 'all', label: 'הכל' },
        { id: 'candidates', label: 'מועמדים' },
        { id: 'jobs', label: 'משרות' },
        { id: 'clients', label: 'לקוחות' },
        { id: 'general', label: 'כללי' },
    ];

    return (
        <div className="flex flex-col h-full space-y-6 pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                    <ListBulletIcon className="w-8 h-8 text-primary-500" />
                    ניהול רשימות מערכת (Picklists)
                </h1>
                <p className="text-sm text-text-muted mt-1">
                    הגדרת ערכים עבור שדות בחירה (Dropdowns) וניהול רשימות תלויות (היררכיה).
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
                
                {/* Sidebar: Categories */}
                <div className="w-full lg:w-1/4 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-border-default bg-bg-subtle/50 space-y-3">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="חפש רשימה..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500" 
                            />
                        </div>
                        <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
                            {filterOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setFilterModule(opt.id as any)}
                                    className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors border ${
                                        filterModule === opt.id 
                                            ? 'bg-primary-100 text-primary-700 border-primary-200' 
                                            : 'bg-white text-text-muted border-border-default hover:border-primary-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {filteredCategories.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => handleParentSelect(cat)}
                                className={`w-full text-right p-3 rounded-xl transition-all duration-200 flex items-center justify-between group relative ${
                                    selectedParentCategoryKey === cat.key 
                                    ? 'bg-primary-50 border border-primary-200 text-primary-900 shadow-sm' 
                                    : 'text-text-muted hover:bg-bg-subtle border border-transparent'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold block text-sm">{cat.name}</span>
                                    </div>
                                    <span className="text-[10px] opacity-70 truncate block max-w-[150px]">{cat.description}</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <div 
                                        className={`p-1.5 rounded-full hover:bg-white text-text-subtle hover:text-primary-600 transition-opacity ${selectedParentCategoryKey === cat.key ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                        onClick={(e) => { e.stopPropagation(); handleEditCategory(cat); }}
                                        title="ערוך קטגוריה"
                                    >
                                        <PencilIcon className="w-3.5 h-3.5" />
                                    </div>
                                <div 
                                    className={`p-1.5 rounded-full hover:bg-white text-text-subtle hover:text-red-500 transition-opacity ${selectedParentCategoryKey === cat.key ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                    title="מחק קטגוריה"
                                >
                                    {deletingCategoryId === cat.id ? (
                                        <div className="w-3.5 h-3.5 border-2 border-transparent border-t-red-500 rounded-full animate-spin" />
                                    ) : (
                                        <TrashIcon className="w-3.5 h-3.5" />
                                    )}
                                    </div>
                                    {selectedParentCategoryKey === cat.key && <ChevronRightIcon className="w-4 h-4 text-primary-500"/>}
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="p-3 border-t border-border-default bg-bg-subtle/20 space-y-2">
                        {activeParentCategory && (
                            <button 
                                onClick={() => handleAddSubcategory(activeParentCategory)}
                                className="w-full py-2 border border-primary-500 bg-primary-50 text-primary-700 rounded-xl text-xs font-bold hover:bg-primary-100 transition"
                            >
                                + רשימה תלויה חדשה
                            </button>
                        )}
                        <button 
                            onClick={handleAddCategory}
                            className="w-full py-2 border-2 border-dashed border-border-default rounded-xl text-xs font-bold text-text-muted hover:border-primary-300 hover:text-primary-600 transition"
                        >
                            + הוסף קטגוריה חדשה
                        </button>
                    </div>
                </div>
                {/* Parent Values Panel */}
                {hasSubcategories && (
                    <div className="w-full lg:w-1/4 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-border-default bg-bg-subtle/50 flex items-center justify-between gap-3">
                            <div className="space-y-1">
                                <h3 className="text-xs font-bold uppercase text-text-muted">רשימות תלויות של "{activeParentCategory?.name}"</h3>
                                <p className="text-[10px] text-text-muted">בחר תת-רשימה כדי להציג את הערכים שלה.</p>
                            </div>
                            {activeParentCategory && (
                                <button
                                    onClick={() => handleAddSubcategory(activeParentCategory)}
                                    className="text-xs font-bold px-3 py-1 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-shadow shadow-sm"
                                >
                                    + רשימה תלויה חדשה
                                </button>
                            )}
                        </div>
                        {activeParentCategory && parentValueList.length > 0 && (
                            <div className="px-4 py-3 border-b border-border-default space-y-2">
                                <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest flex items-center justify-between">
                                    <span>ערכי {activeParentCategory.name}</span>
                                    <span className="text-[9px] text-text-subtle">{parentValueList.length} ערכים</span>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {parentValueList.map(val => (
                                        <div key={`parent-val-${val.id}`} className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleParentValueClick(val)}
                                                className={`flex-1 text-right rounded-full border px-3 py-1 text-xs font-bold transition ${filterParentValueId === val.id ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-border-default bg-white text-text-muted hover:border-primary-200'}`}
                                            >
                                                {val.label}
                                            </button>
                                            {!val.isSystem && (
                                                <button
                                                    className="p-1 text-text-subtle hover:text-red-500 transition"
                                                    title="מחק ערך"
                                                    onClick={() => handleDeleteParentValue(val)}
                                                    disabled={deletingParentValueId === val.id}
                                                >
                                                    {deletingParentValueId === val.id ? (
                                                        <div className="w-3 h-3 border-2 border-transparent border-t-red-500 rounded-full animate-spin" />
                                                    ) : (
                                                        <TrashIcon className="w-3.5 h-3.5" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {dependentCategories.length > 0 ? dependentCategories.map(sub => (
                                <div key={sub.id} className="relative">
                                <button
                                    onClick={() => {
                                            if (sub.key === selectedCategoryKey) return;
                                        setSelectedCategoryKey(sub.key);
                                        setFilterParentValueId('all');
                                    }}
                                    className={`w-full text-right p-3 rounded-xl border transition-all duration-200 flex flex-col gap-1 ${
                                        selectedCategoryKey === sub.key 
                                            ? 'bg-primary-50 border-primary-200 text-primary-900 shadow-sm' 
                                            : 'bg-white border-border-subtle hover:border-primary-200 hover:bg-bg-subtle'
                                    }`}
                                >
                                    <div className="flex justify-between items-center gap-2">
                                        <span className="font-bold text-text-default">{sub.name}</span>
                                        <span className="text-[10px] text-text-muted">{sub.key}</span>
                                    </div>
                                    <p className="text-[10px] text-text-muted">{sub.description || 'ללא תיאור...'}</p>
                                </button>
                                    {!sub.isSystem && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteSubcategory(sub);
                                            }}
                                            disabled={deletingSubcategoryId === sub.id}
                                            title="מחק ערך תלוי"
                                            className="absolute top-2 left-2 p-1 rounded-full border border-border-subtle bg-white text-text-muted hover:text-red-500 transition shadow-sm disabled:opacity-50"
                                        >
                                            {deletingSubcategoryId === sub.id ? (
                                                <div className="w-3 h-3 border-2 border-transparent border-t-red-500 rounded-full animate-spin" />
                                            ) : (
                                                <TrashIcon className="w-3 h-3" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            )) : (
                                <div className="p-4 text-center text-xs text-text-muted">
                                    אין רשימות תלויות כרגע לרשימה זו.
                                </div>
                            )}
                        </div>
                        <div className="p-3 border-t border-border-default bg-bg-subtle/20">
                            <p className="text-xs text-text-muted">
                                הערכים של תתי-היררכיה יופיעו בעמודה הימנית ביותר.
                            </p>
                        </div>
                    </div>
                )}

                {/* Main Content: Values Editor */}
                <div className={`w-full ${hasSubcategories ? 'lg:w-1/2' : 'lg:w-3/4'} bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col`}>
                    <div className="p-5 border-b border-border-default flex justify-between items-center bg-white">
                        <div className="flex items-center gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-text-default flex items-center gap-2">
                                    {activeCategory?.name}
                                    {activeCategory?.parentId && (
                                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-normal">
                                            תלוי ב: {categories.find(c => c.id === activeCategory.parentId)?.name}
                                        </span>
                                    )}
                                    <button onClick={() => activeCategory && handleEditCategory(activeCategory)} className="text-text-subtle hover:text-primary-600">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                </h2>
                                <p className="text-xs text-text-muted font-mono">key: {activeCategory?.key}</p>
                            </div>
                            
                             {/* Parent Value Status */}
                             {parentCategory && filterParentValueId !== 'all' && (
                                <div className="flex items-center gap-2 text-[10px] text-primary-600 font-semibold uppercase tracking-widest">
                                    <span>
                                        מסונן לפי {parentValues.find(pv => String(pv.id) === String(filterParentValueId))?.label || 'ערך נבחר'}
                                    </span>
                                    <button onClick={() => setFilterParentValueId('all')} className="text-primary-500 underline underline-offset-2">
                                        נקה
                                    </button>
                                </div>
                             )}
                        </div>
                        <button 
                            onClick={handleAddValue}
                            className="bg-primary-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-primary-700 transition shadow-md flex items-center gap-2"
                        >
                            <PlusIcon className="w-4 h-4"/>
                            ערך חדש
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default sticky top-0">
                                <tr>
                                    <th className="p-4 w-16 text-center">צבע</th>
                                    <th className="p-4">שם (Label)</th>
                                    <th className="p-4">מזהה (Value)</th>
                                    {parentCategory && <th className="p-4 text-blue-800">שייך ל ({parentCategory.name})</th>}
                                    <th className="p-4 w-24 text-center">פעיל</th>
                                    <th className="p-4 w-32 text-center">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {filteredValues.map((val) => {
                                    const parentValLabel = parentValues?.find(pv => pv.id === val.parentValueId)?.label;
                                    return (
                                        <tr key={val.id} className="hover:bg-bg-hover transition-colors group">
                                            <td className="p-4 text-center">
                                                {val.color ? (
                                                    <div className="w-6 h-6 rounded-full mx-auto shadow-sm border border-black/5" style={{ backgroundColor: val.color }}></div>
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full mx-auto border-2 border-dashed border-gray-300"></div>
                                                )}
                                            </td>
                                            <td className="p-4 font-bold text-text-default">{val.label}</td>
                                            <td className="p-4 font-mono text-xs text-text-muted">{val.value}</td>
                                            {parentCategory && (
                                                <td className="p-4">
                                                    {parentValLabel ? (
                                                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">
                                                            {parentValLabel}
                                                        </span>
                                                    ) : <span className="text-text-subtle text-xs italic">- ללא שיוך -</span>}
                                                </td>
                                            )}
                                            <td className="p-4 text-center">
                                                {val.isActive 
                                                    ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">פעיל</span>
                                                    : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">לא פעיל</span>
                                                }
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditValue(val)} className="p-1.5 hover:bg-primary-50 rounded text-primary-600 transition" title="ערוך">
                                                        <PencilIcon className="w-4 h-4"/>
                                                    </button>
                                                    {!val.isSystem && (
                                                        <button onClick={() => handleDeleteValue(val.id)} className="p-1.5 hover:bg-red-50 rounded text-red-500 transition" title="מחק">
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredValues.length === 0 && (
                                    <tr>
                                        <td colSpan={parentCategory ? 6 : 5} className="p-12 text-center text-text-muted">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <TagIcon className="w-10 h-10 opacity-20"/>
                                                <span>
                                                    {parentCategory && filterParentValueId !== 'all' 
                                                        ? 'לא נמצאו ערכים תחת הפילטר שנבחר.'
                                                        : 'אין ערכים ברשימה זו. צור ערך חדש.'}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="p-4 border-t border-border-default bg-bg-subtle/30 text-xs text-text-muted flex gap-2 items-center">
                         <InformationCircleIcon className="w-4 h-4"/>
                         <span>שינוי צבע או שם ישתקף מיידית בכל מקום במערכת שמשתמש בערך זה.</span>
                    </div>
                </div>
            </div>

            <ValueModal 
                isOpen={isValueModalOpen} 
                onClose={() => { setIsValueModalOpen(false); setEditingValue(null); }} 
                value={editingValue} 
                onSave={handleSaveValue} 
                parentCategory={parentCategory}
                parentValues={parentValues}
                isSaving={isValueSaving}
            />

            <CategoryModal 
                isOpen={isCategoryModalOpen}
                onClose={closeCategoryModal}
                onSave={handleSaveCategory}
                category={editingCategory}
                allCategories={categories}
                parentForModal={categoryParentContext}
                isSaving={isCategorySaving}
            />
        </div>
    );
};

export default AdminPicklistsView;
