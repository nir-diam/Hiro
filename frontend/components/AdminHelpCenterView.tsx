
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
    FolderIcon, DocumentTextIcon, PlusIcon, TrashIcon, PencilIcon, 
    VideoCameraIcon, CheckCircleIcon, BoldIcon, ItalicIcon, UnderlineIcon,
    ListBulletIcon, ListNumberIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
    ChevronDownIcon, PhotoIcon
} from './Icons';
import { HelpArticle } from '../data/helpCenterData';

// --- RICH TEXT EDITOR COMPONENT ---
const RichTextEditor: React.FC<{ 
    initialContent: string; 
    onChange: (html: string) => void; 
}> = ({ initialContent, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [currentFormat, setCurrentFormat] = useState('p');
    const [currentSize, setCurrentSize] = useState('3'); // Default is 3 (normal in execCommand)

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== initialContent) {
            editorRef.current.innerHTML = initialContent;
        }
    }, [initialContent]); // Sync when content changes

    const execCommand = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            editorRef.current.focus();
        }
    };

    const handleFormatBlock = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const tag = e.target.value;
        execCommand('formatBlock', tag);
        setCurrentFormat(tag);
    };

    const handleFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const size = e.target.value;
        execCommand('fontSize', size);
        setCurrentSize(size);
    };

    const handleInsertImage = () => {
        const url = prompt('הכנס כתובת תמונה (URL):');
        if (url) {
            // Insert image with max-width style to ensure it fits container
            const imgHtml = `<img src="${url}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;" />`;
            execCommand('insertHTML', imgHtml);
        }
    };

    const handleInsertVideo = () => {
        const url = prompt('הכנס קישור לוידאו (YouTube):');
        if (url) {
            let embedUrl = url;
            // Simple converter for YouTube standard links to embed links
            if (url.includes('youtube.com/watch?v=')) {
                const videoId = url.split('v=')[1]?.split('&')[0];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            } else if (url.includes('youtu.be/')) {
                const videoId = url.split('youtu.be/')[1];
                embedUrl = `https://www.youtube.com/embed/${videoId}`;
            }

            const videoHtml = `
                <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 15px 0; border-radius: 12px;">
                    <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allowfullscreen></iframe>
                </div>
                <p><br></p>
            `;
            execCommand('insertHTML', videoHtml);
        }
    };

    const ToolbarButton: React.FC<{ cmd?: string; icon: React.ReactNode; arg?: string; title?: string; onClick?: () => void }> = ({ cmd, icon, arg, title, onClick }) => (
        <button
            onMouseDown={(e) => { 
                e.preventDefault(); 
                if (onClick) onClick();
                else if (cmd) execCommand(cmd, arg); 
            }}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
            title={title}
        >
            {icon}
        </button>
    );

    return (
        <div className="flex flex-col border border-border-default rounded-lg overflow-hidden bg-white h-[600px]">
            {/* Inject Styles specifically for the editor content to override Tailwind reset */}
            <style>{`
                .editor-content h1 { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; display: block; }
                .editor-content h2 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; display: block; }
                .editor-content h3 { font-size: 1.17em; font-weight: bold; margin-bottom: 0.5em; display: block; }
                .editor-content ul { list-style-type: disc; margin-right: 1.5em; padding-right: 1em; display: block; }
                .editor-content ol { list-style-type: decimal; margin-right: 1.5em; padding-right: 1em; display: block; }
                .editor-content li { margin-bottom: 0.25em; display: list-item; }
                .editor-content b, .editor-content strong { font-weight: bold; }
                .editor-content i, .editor-content em { font-style: italic; }
                .editor-content u { text-decoration: underline; }
                .editor-content p { margin-bottom: 1em; }
                .editor-content img { display: inline-block; }
            `}</style>

            {/* Toolbar */}
            <div className="flex items-center gap-1 p-2 border-b border-border-default bg-gray-50 flex-wrap sticky top-0 z-10">
                
                {/* Format Dropdown */}
                <div className="relative mx-1">
                    <select 
                        className="appearance-none bg-white border border-gray-300 text-gray-700 py-1 pr-2 pl-6 rounded text-xs focus:outline-none focus:border-primary-500 font-bold h-8 cursor-pointer"
                        onChange={handleFormatBlock}
                        value={currentFormat}
                    >
                        <option value="p">טקסט רגיל</option>
                        <option value="H2">כותרת ראשית (H2)</option>
                        <option value="H3">כותרת משנית (H3)</option>
                        <option value="BLOCKQUOTE">ציטוט</option>
                    </select>
                    <ChevronDownIcon className="w-3 h-3 text-gray-500 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Size Dropdown */}
                <div className="relative mx-1">
                    <select 
                        className="appearance-none bg-white border border-gray-300 text-gray-700 py-1 pr-2 pl-6 rounded text-xs focus:outline-none focus:border-primary-500 font-bold h-8 cursor-pointer"
                        onChange={handleFontSize}
                        value={currentSize}
                    >
                        <option value="1">קטן מאוד</option>
                        <option value="2">קטן</option>
                        <option value="3">רגיל</option>
                        <option value="4">בינוני</option>
                        <option value="5">גדול</option>
                        <option value="6">גדול מאוד</option>
                        <option value="7">ענק</option>
                    </select>
                    <ChevronDownIcon className="w-3 h-3 text-gray-500 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="w-px h-5 bg-gray-300 mx-1"></div>

                <ToolbarButton cmd="bold" icon={<BoldIcon className="w-4 h-4"/>} title="מודגש" />
                <ToolbarButton cmd="italic" icon={<ItalicIcon className="w-4 h-4"/>} title="נטוי" />
                <ToolbarButton cmd="underline" icon={<UnderlineIcon className="w-4 h-4"/>} title="קו תחתון" />
                
                <div className="w-px h-5 bg-gray-300 mx-1"></div>
                
                <ToolbarButton cmd="insertUnorderedList" icon={<ListBulletIcon className="w-4 h-4"/>} title="רשימת תבליטים" />
                <ToolbarButton cmd="insertOrderedList" icon={<ListNumberIcon className="w-4 h-4"/>} title="רשימה ממוספרת" />
                
                <div className="w-px h-5 bg-gray-300 mx-1"></div>
                
                <ToolbarButton cmd="justifyRight" icon={<AlignRightIcon className="w-4 h-4"/>} title="יישור לימין" />
                <ToolbarButton cmd="justifyCenter" icon={<AlignCenterIcon className="w-4 h-4"/>} title="מרכוז" />
                <ToolbarButton cmd="justifyLeft" icon={<AlignLeftIcon className="w-4 h-4"/>} title="יישור לשמאל" />

                <div className="w-px h-5 bg-gray-300 mx-1"></div>

                {/* Media Buttons */}
                <ToolbarButton onClick={handleInsertImage} icon={<PhotoIcon className="w-4 h-4"/>} title="הוסף תמונה (URL)" />
                <ToolbarButton onClick={handleInsertVideo} icon={<VideoCameraIcon className="w-4 h-4"/>} title="הטמע וידאו (YouTube)" />

            </div>

            {/* Editable Area */}
            <div
                ref={editorRef}
                contentEditable
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                className="flex-1 p-6 outline-none overflow-y-auto editor-content text-right text-text-default text-base leading-relaxed bg-white"
                style={{ direction: 'rtl', minHeight: '300px' }}
            />
        </div>
    );
};

// --- MAIN COMPONENT ---

const AdminHelpCenterView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [articles, setArticles] = useState<HelpArticle[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [pendingSelection, setPendingSelection] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<HelpArticle>>({
        title: '',
        content: '',
        videoUrl: '',
        type: 'article',
        parentId: null,
        order: 0,
    });
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const successTimerRef = useRef<NodeJS.Timeout | null>(null);

    const defaultFormData = {
        title: '',
        content: '',
        videoUrl: '',
        type: 'article' as 'folder' | 'article',
        parentId: null,
        order: 0,
    };
    const formType = (formData.type ?? 'article') as 'folder' | 'article';

    const fetchArticles = useCallback(async () => {
        if (!apiBase) return;
        setIsFetching(true);
        try {
            const res = await fetch(`${apiBase}/api/help-center/articles`);
            if (!res.ok) throw new Error('לא ניתן לטעון את מרכז העזרה.');
            const payload = await res.json();
            setArticles(payload);
        } catch (err: any) {
            console.error('Failed to fetch help articles', err);
            setArticles([]);
        } finally {
            setIsFetching(false);
        }
    }, [apiBase]);

    useEffect(() => {
        void fetchArticles();
    }, [fetchArticles]);

    useEffect(() => {
        return () => {
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
        };
    }, []);

    const flashSuccess = (text: string) => {
        setSuccessMessage(text);
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
            setSuccessMessage(null);
        }, 3000);
    };

    useEffect(() => {
        if (!pendingSelection) return;
        const target = articles.find((article) => article.id === pendingSelection);
        if (target) {
            setSelectedId(target.id);
            setFormData(target);
            setEditMode(true);
        }
        setPendingSelection(null);
    }, [pendingSelection, articles]);

    useEffect(() => {
        if (!selectedId) return;
        const target = articles.find((article) => article.id === selectedId);
        if (target) {
            setFormData(target);
        }
    }, [articles, selectedId]);

    const selectedArticle = articles.find(a => a.id === selectedId);

    // Tree Rendering Logic
    const renderTree = (parentId: string | null = null, depth = 0) => {
        const nodes = articles
            .filter((a) => a.parentId === parentId)
            .sort((a, b) => {
                if (a.order === b.order) return a.title.localeCompare(b.title);
                return a.order - b.order;
            });
        
        return nodes.map(node => (
            <React.Fragment key={node.id}>
                <div 
                    onClick={() => handleSelect(node)}
                    className={`
                        flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors mb-1
                        ${selectedId === node.id ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'hover:bg-bg-subtle text-text-default border border-transparent'}
                    `}
                    style={{ paddingRight: `${depth * 16 + 8}px` }}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        {node.type === 'folder' ? (
                            <FolderIcon className={`w-4 h-4 flex-shrink-0 ${selectedId === node.id ? 'text-primary-500' : 'text-text-muted'}`} />
                        ) : (
                            <DocumentTextIcon className={`w-4 h-4 flex-shrink-0 ${selectedId === node.id ? 'text-primary-500' : 'text-text-muted'}`} />
                        )}
                        <span className="truncate text-sm font-medium">{node.title}</span>
                    </div>
                </div>
                {/* Recursive call for children if it's a folder */}
                {node.type === 'folder' && renderTree(node.id, depth + 1)}
            </React.Fragment>
        ));
    };

    const handleSelect = (article: HelpArticle) => {
        setSelectedId(article.id);
        setFormData(article);
        setEditMode(true);
    };

    const handleAddNew = async (type: 'folder' | 'article', parentId: string | null) => {
        if (!apiBase) return;
        setIsCreating(true);
        try {
            const payload = {
                parentId,
            title: type === 'folder' ? 'תיקייה חדשה' : 'מאמר חדש',
                type,
            content: '',
            videoUrl: '',
                order: articles.filter((a) => a.parentId === parentId).length + 1,
            };
            const res = await fetch(`${apiBase}/api/help-center/articles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'לא ניתן ליצור פרט חדש.');
            }
            const created = await res.json();
            setArticles((prev) => [...prev, created]);
            setPendingSelection(created.id);
            flashSuccess('הפריט נוצר בהצלחה.');
        } catch (err: any) {
            console.error('Failed to create help article', err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleSave = async () => {
        if (!selectedId || !apiBase) return;
        setIsSaving(true);
        try {
            const payload = {
                title: formData.title,
                content: formData.content || '',
                videoUrl: formData.videoUrl || '',
                type: formType,
                parentId: formData.parentId ?? null,
                order: typeof formData.order === 'number' ? formData.order : 0,
            };
            const res = await fetch(`${apiBase}/api/help-center/articles/${selectedId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'שמירה נכשלה.');
            }
            const updated = await res.json();
            setArticles((prev) => prev.map((article) => (article.id === selectedId ? updated : article)));
            setFormData(updated);
            flashSuccess('השינויים נשמרו בהצלחה.');
        } catch (err: any) {
            console.error('Failed to save article', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedId || !apiBase) return;
        const confirmed = window.confirm('האם למחוק פריט זה? כל הערכים התלויים יוסרו גם הם.');
        if (!confirmed) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`${apiBase}/api/help-center/articles/${selectedId}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(text || 'המחיקה נכשלה.');
            }
            setSelectedId(null);
            setFormData(defaultFormData);
            setEditMode(false);
            await fetchArticles();
            flashSuccess('הפריט נמחק בהצלחה.');
        } catch (err: any) {
            console.error('Failed to delete article', err);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="h-full flex flex-col p-6 max-w-[1600px] mx-auto bg-bg-default">
            <header className="mb-6">
                <h1 className="text-2xl font-black text-text-default">ניהול מרכז עזרה (Help Center)</h1>
                <p className="text-text-muted text-sm">יצירה ועריכה של מדריכים, סרטונים ותיקיות למשתמשי המערכת.</p>
                {successMessage && (
                    <div className="mt-3 rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-700">
                        {successMessage}
                    </div>
                )}
            </header>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                {/* Sidebar: Tree Structure */}
                <div className="w-full lg:w-1/3 bg-bg-card border border-border-default rounded-2xl flex flex-col shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-border-default bg-bg-subtle/30 flex justify-between items-center">
                        <span className="font-bold text-sm text-text-default">מבנה המדריך</span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleAddNew('folder', null)} 
                                className="p-1.5 hover:bg-bg-hover rounded-lg text-text-muted hover:text-primary-600 transition"
                                title="הוסף תיקייה ראשית"
                                disabled={isCreating}
                            >
                                <FolderIcon className="w-5 h-5" />
                            </button>
                             <button 
                                onClick={() => {
                                    const parent = selectedArticle?.type === 'folder' ? selectedArticle.id : selectedArticle?.parentId || null;
                                    handleAddNew('article', parent);
                                }} 
                                className="p-1.5 hover:bg-bg-hover rounded-lg text-text-muted hover:text-primary-600 transition"
                                title="הוסף מאמר"
                                disabled={isCreating}
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                        {isFetching ? (
                            <div className="text-sm text-text-muted p-4 text-center">טוען את המדריכים...</div>
                        ) : articles.length === 0 ? (
                            <div className="text-sm text-text-muted p-4 text-center">אין פריטים כרגע.</div>
                        ) : (
                            renderTree(null)
                        )}
                    </div>
                </div>

                {/* Editor Area */}
                <div className="w-full lg:w-2/3 bg-bg-card border border-border-default rounded-2xl shadow-sm flex flex-col overflow-hidden">
                    {selectedId ? (
                        <>
                            <div className="p-5 border-b border-border-default flex justify-between items-center bg-white">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className={`p-2 rounded-lg ${formType === 'folder' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {formType === 'folder' ? <FolderIcon className="w-5 h-5" /> : <DocumentTextIcon className="w-5 h-5" />}
                                    </div>
                                    <input 
                                        type="text" 
                                        value={formData.title} 
                                        onChange={(e) => setFormData({...formData, title: e.target.value})}
                                        className="text-lg font-bold text-text-default bg-transparent border-none focus:ring-0 p-0 w-full"
                                        placeholder="כותרת המאמר / תיקייה"
                                    />
                                </div>
                                <button 
                                    onClick={handleDelete}
                                    className="p-2 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                    disabled={isDeleting}
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-subtle/10">
                                {formType === 'article' && (
                                    <>
                                        <div className="space-y-2 flex-grow flex flex-col h-full">
                                            <label className="block text-sm font-bold text-text-default">תוכן המאמר</label>
                                            
                                            {/* Rich Text Editor Replacement */}
                                            <RichTextEditor 
                                                initialContent={formData.content || ''}
                                                onChange={(html) => setFormData({...formData, content: html})}
                                            />
                                        </div>
                                    </>
                                )}
                                {formType === 'folder' && (
                                    <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-60">
                                        <FolderIcon className="w-16 h-16 mb-4" />
                                        <p>זוהי תיקייה. גרור או צור מאמרים בתוכה בתפריט הצד.</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 border-t border-border-default bg-bg-subtle flex justify-end">
                                <button 
                                    onClick={handleSave} 
                                    className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md disabled:opacity-60"
                                    disabled={isSaving}
                                >
                                    <CheckCircleIcon className="w-5 h-5" />
                                    <span>שמור שינויים</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted">
                            <PencilIcon className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-xl font-bold">בחר פריט לעריכה</h3>
                            <p className="text-sm mt-2">או צור פריט חדש באמצעות הכפתורים בתפריט הצד.</p>
                        </div>
                    )}
                </div>
            </div>
            {successMessage && (
                <div style={{ backgroundColor: 'green' }} className="fixed bottom-6 right-6 z-50 rounded-full border border-primary-200 bg-white px-4 py-2 shadow-lg text-sm text-primary-700">
                    {successMessage}
                </div>
            )}
        </div>
    );
};

export default AdminHelpCenterView;
