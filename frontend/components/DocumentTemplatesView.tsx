
import React, { useState } from 'react';
import { 
    PlusIcon, MagnifyingGlassIcon, DocumentTextIcon, 
    Squares2X2Icon, PencilIcon, TrashIcon, CheckCircleIcon,
    ArrowPathIcon, DocumentArrowDownIcon
} from './Icons';
import SmartDocumentEditor, { DocumentTemplate } from './SmartDocumentEditor';

const initialTemplates: DocumentTemplate[] = [
    { 
        id: 1, 
        name: 'הצעת מחיר סטנדרטית', 
        category: 'הצעות מחיר', 
        lastModified: '2025-10-15', 
        htmlContent: `
            <h1>הצעת מחיר לשירותי גיוס</h1>
            <p>לכבוד <strong>{client_name}</strong>,</p>
            <p>אנו שמחים להגיש לכם את הצעת המחיר לשירותי גיוס והשמה.</p>
            <p><br></p>
            <ul>
                <li>איתור מועמדים איכותיים</li>
                <li>סינון קפדני</li>
                <li>ליווי אישי</li>
            </ul>
            <p><br></p>
            <p>בברכה,</p>
            <p>צוות הגיוס</p>
        `
    },
    { 
        id: 2, 
        name: 'חוזה התקשרות (ריטיינר)', 
        category: 'חוזים', 
        lastModified: '2025-11-01', 
        htmlContent: `
            <h1>הסכם מסגרת</h1>
            <p>נערך ונחתם ב-{date} בין <strong>מימד אנושי</strong> לבין <strong>{client_name}</strong>.</p>
            <p>הסכם זה מסדיר את תנאי ההתקשרות עבור שירותי ריטיינר חודשיים.</p>
        `
    },
    { 
        id: 3, 
        name: 'מכתב קבלה לעבודה', 
        category: 'מכתבים', 
        lastModified: '2025-09-20', 
        htmlContent: `
            <h1>ברוך הבא לצוות!</h1>
            <p>היי <strong>{candidate_name}</strong>,</p>
            <p>אנחנו שמחים להודיע לך שהתקבלת לתפקיד <strong>{job_title}</strong>.</p>
            <p>מצפים לראותך ביום הראשון!</p>
        `
    },
];

const categories = ['הכל', 'הצעות מחיר', 'חוזים', 'מכתבים', 'סיכומי ראיון'];

const TemplateCard: React.FC<{ 
    template: DocumentTemplate; 
    onEdit: () => void; 
    onDelete: () => void; 
    onDuplicate: () => void; 
}> = ({ template, onEdit, onDelete, onDuplicate }) => (
    <div className="group bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl hover:border-primary-200 transition-all duration-300 flex flex-col overflow-hidden relative cursor-pointer" onClick={onEdit}>
        {/* Preview Thumbnail */}
        <div className="h-48 bg-gray-50 border-b border-gray-100 p-4 relative overflow-hidden group-hover:bg-primary-50/10 transition-colors">
            {/* Miniature Page Look */}
            <div className="w-full h-full bg-white shadow-sm border border-gray-200 p-3 text-[6px] text-gray-300 overflow-hidden select-none transform transition-transform group-hover:scale-[1.02]">
                <div className="h-2 w-1/2 bg-gray-800 mb-2 rounded-sm opacity-20"></div>
                <div className="space-y-1">
                    <div className="h-1 w-full bg-gray-300 rounded-sm"></div>
                    <div className="h-1 w-full bg-gray-300 rounded-sm"></div>
                    <div className="h-1 w-2/3 bg-gray-300 rounded-sm"></div>
                </div>
                <div className="mt-4 space-y-1">
                    <div className="h-1 w-full bg-gray-300 rounded-sm"></div>
                    <div className="h-1 w-full bg-gray-300 rounded-sm"></div>
                </div>
                {/* Overlay Icon */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 backdrop-blur-[1px]">
                     <div className="bg-primary-600 text-white px-4 py-2 rounded-full font-bold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform">
                         ערוך תבנית
                     </div>
                </div>
            </div>
            
             {/* Category Badge */}
             <div className="absolute top-3 right-3">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/90 border border-gray-200 shadow-sm text-gray-600 backdrop-blur-sm">
                    {template.category}
                </span>
            </div>
        </div>

        {/* Info */}
        <div className="p-5">
            <h3 className="font-bold text-gray-900 text-base mb-1 truncate">{template.name}</h3>
            <p className="text-xs text-gray-500 mb-4">עודכן: {template.lastModified}</p>
            
            {/* Actions */}
            <div className="flex gap-2 border-t border-gray-100 pt-3 opacity-60 group-hover:opacity-100 transition-opacity">
                <button 
                    onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-gray-50 text-xs font-semibold text-gray-600 transition-colors"
                    title="שכפל"
                >
                    <ArrowPathIcon className="w-3.5 h-3.5"/>
                    שכפל
                </button>
                 <div className="w-px bg-gray-200 my-1"></div>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-red-50 text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors"
                    title="מחק"
                >
                    <TrashIcon className="w-3.5 h-3.5"/>
                    מחק
                </button>
            </div>
        </div>
    </div>
);

const DocumentTemplatesView: React.FC = () => {
    const [templates, setTemplates] = useState<DocumentTemplate[]>(initialTemplates);
    const [view, setView] = useState<'gallery' | 'editor'>('gallery');
    const [selectedCategory, setSelectedCategory] = useState('הכל');
    const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredTemplates = templates.filter(t => 
        (selectedCategory === 'הכל' || t.category === selectedCategory) &&
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleCreate = () => {
        setEditingTemplate(null);
        setView('editor');
    };

    const handleEdit = (template: DocumentTemplate) => {
        setEditingTemplate(template);
        setView('editor');
    };

    const handleSave = (template: DocumentTemplate) => {
        if (editingTemplate) {
            setTemplates(prev => prev.map(t => t.id === template.id ? template : t));
        } else {
            setTemplates(prev => [...prev, { ...template, id: Date.now() }]);
        }
        setView('gallery');
    };
    
    const handleDelete = (id: number) => {
        if(window.confirm('האם למחוק תבנית זו?')) {
            setTemplates(prev => prev.filter(t => t.id !== id));
        }
    };
    
    const handleDuplicate = (template: DocumentTemplate) => {
        const newTemplate = {
            ...template,
            id: Date.now(),
            name: `${template.name} (עותק)`,
            lastModified: new Date().toISOString().split('T')[0]
        };
        setTemplates(prev => [newTemplate, ...prev]);
    };

    return (
        <div className="h-full flex flex-col">
            {view === 'gallery' ? (
                <div className="space-y-8 p-6 sm:p-8 max-w-[1600px] mx-auto w-full animate-fade-in">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Document Studio</h1>
                            <p className="text-gray-500 mt-1">נהל את כל מסמכי החברה במקום אחד. עצב תבניות חכמות לשימוש חוזר.</p>
                        </div>
                        <button 
                            onClick={handleCreate} 
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition shadow-xl shadow-slate-900/10 flex items-center gap-2 transform active:scale-95"
                        >
                            <PlusIcon className="w-5 h-5"/>
                            תבנית חדשה
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                         {/* Categories Tabs */}
                        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto no-scrollbar w-full sm:w-auto">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                                        selectedCategory === cat 
                                        ? 'bg-white text-primary-700 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        
                        {/* Search */}
                        <div className="relative w-full sm:w-64">
                            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2"/>
                            <input 
                                type="text" 
                                placeholder="חיפוש תבנית..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 pl-4 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {/* Gallery Grid */}
                    {filteredTemplates.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredTemplates.map(template => (
                                <TemplateCard 
                                    key={template.id} 
                                    template={template} 
                                    onEdit={() => handleEdit(template)}
                                    onDelete={() => handleDelete(template.id)}
                                    onDuplicate={() => handleDuplicate(template)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-24 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                             <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-gray-300">
                                 <DocumentTextIcon className="w-8 h-8"/>
                             </div>
                             <h3 className="text-lg font-bold text-gray-900">לא נמצאו תבניות</h3>
                             <p className="text-gray-500 text-sm mt-1">נסה לשנות את הסינון או צור תבנית חדשה.</p>
                             <button onClick={handleCreate} className="mt-4 text-primary-600 font-bold hover:underline">צור תבנית ראשונה</button>
                        </div>
                    )}
                </div>
            ) : (
                <SmartDocumentEditor 
                    isOpen={true} 
                    onClose={() => setView('gallery')} 
                    onSave={handleSave} 
                    initialTemplate={editingTemplate} 
                />
            )}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
        </div>
    );
};

export default DocumentTemplatesView;