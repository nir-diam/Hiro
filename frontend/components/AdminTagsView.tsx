import React, { useState, useMemo } from 'react';
import { MagnifyingGlassIcon, PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from './Icons';

interface Tag {
    id: number;
    name: string;
    synonyms: string[];
}

const mockTags: Tag[] = [
    { id: 1, name: 'ניהול', synonyms: ['מנהל', 'Management'] },
    { id: 2, name: 'שיווק', synonyms: ['Marketing'] },
    { id: 3, name: 'מכירות', synonyms: ['Sales', 'מכירה'] },
    { id: 4, name: 'React', synonyms: ['ReactJS', 'React.js'] },
    { id: 5, name: 'SQL', synonyms: ['Structured Query Language'] },
];

const AdminTagsView: React.FC = () => {
    const [tags, setTags] = useState(mockTags);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<{ name: string; synonyms: string }>({ name: '', synonyms: '' });
    const [isAdding, setIsAdding] = useState(false);
    
    const filteredTags = useMemo(() => 
        tags.filter(tag => 
            tag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tag.synonyms.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
        ), 
    [tags, searchTerm]);

    const handleEdit = (tag: Tag) => {
        setEditingId(tag.id);
        setEditData({ name: tag.name, synonyms: tag.synonyms.join(', ') });
    };

    const handleCancel = () => {
        setEditingId(null);
        setEditData({ name: '', synonyms: '' });
        setIsAdding(false);
    };

    const handleSave = (id?: number) => {
        if (!editData.name.trim()) {
            alert('Tag name cannot be empty.');
            return;
        }

        const synonymsArray = editData.synonyms.split(',').map(s => s.trim()).filter(Boolean);
        
        if (id) { // Update
            setTags(prev => prev.map(t => t.id === id ? { ...t, name: editData.name, synonyms: synonymsArray } : t));
        } else { // Add new
            const newTag: Tag = { id: Date.now(), name: editData.name, synonyms: synonymsArray };
            setTags(prev => [...prev, newTag]);
        }
        handleCancel();
    };
    
    const handleDelete = (id: number) => {
        if (window.confirm('Are you sure you want to delete this tag?')) {
            setTags(prev => prev.filter(t => t.id !== id));
        }
    };

    const handleAddClick = () => {
        setIsAdding(true);
        setEditingId(null);
        setEditData({ name: '', synonyms: '' });
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <h1 className="text-xl font-bold mb-1">ניהול תגיות</h1>
            <p className="text-sm text-text-muted mb-6">הוסף, ערוך ומחק תגיות כישורים ושמות נרדפים.</p>

            <div className="flex justify-between items-center mb-4">
                <div className="relative w-full max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חפש תגית..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                    />
                </div>
                <button onClick={handleAddClick} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition">
                    <PlusIcon className="w-5 h-5"/>
                    <span>תגית חדשה</span>
                </button>
            </div>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                        <tr>
                            <th className="p-3">שם התגית</th>
                            <th className="p-3">שמות נרדפים (מופרד בפסיק)</th>
                            <th className="p-3 text-center">פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                        {isAdding && (
                            <tr className="bg-primary-50/50">
                                <td className="p-2"><input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-bg-input border-border-default p-2 rounded-md" /></td>
                                <td className="p-2"><input type="text" value={editData.synonyms} onChange={e => setEditData({...editData, synonyms: e.target.value})} className="w-full bg-bg-input border-border-default p-2 rounded-md" /></td>
                                <td className="p-2 text-center">
                                    <div className="flex justify-center gap-2">
                                        <button onClick={() => handleSave()} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="w-5 h-5" /></button>
                                        <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><XMarkIcon className="w-5 h-5" /></button>
                                    </div>
                                </td>
                            </tr>
                        )}
                        {filteredTags.map(tag => (
                            editingId === tag.id ? (
                                <tr key={tag.id} className="bg-primary-50/50">
                                    <td className="p-2"><input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-bg-input border-border-default p-2 rounded-md" /></td>
                                    <td className="p-2"><input type="text" value={editData.synonyms} onChange={e => setEditData({...editData, synonyms: e.target.value})} className="w-full bg-bg-input border-border-default p-2 rounded-md" /></td>
                                    <td className="p-2 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => handleSave(tag.id)} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="w-5 h-5" /></button>
                                            <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><XMarkIcon className="w-5 h-5" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={tag.id} className="hover:bg-bg-hover">
                                    <td className="p-3 font-semibold text-text-default">{tag.name}</td>
                                    <td className="p-3 text-text-muted">{tag.synonyms.join(', ')}</td>
                                    <td className="p-3 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => handleEdit(tag)} className="p-1.5 text-text-subtle hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(tag.id)} className="p-1.5 text-text-subtle hover:text-red-600 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminTagsView;
