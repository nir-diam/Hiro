
import React, { useState, useEffect, useRef } from 'react';
import { 
    XMarkIcon, EyeIcon, CheckCircleIcon, ArrowLeftIcon, 
    BuildingOffice2Icon, UserIcon, CalendarDaysIcon, BriefcaseIcon, BanknotesIcon,
    BoldIcon, ItalicIcon, UnderlineIcon, ListBulletIcon, ListNumberIcon,
    AlignLeftIcon, AlignCenterIcon, AlignRightIcon, UndoIcon, RedoIcon,
    TrashIcon, PlusIcon // Needed for sidebar
} from './Icons';

// --- TYPES ---
// Simplified structure for the new editor
export interface DocumentTemplate {
    id: number;
    name: string;
    category: string;
    lastModified: string;
    htmlContent: string; // Storing full HTML instead of blocks
}

// --- CONSTANTS ---
const VARIABLES = [
    { label: 'שם מועמד', value: '{candidate_name}', icon: <UserIcon className="w-3 h-3"/> },
    { label: 'שם לקוח', value: '{client_name}', icon: <BuildingOffice2Icon className="w-3 h-3"/> },
    { label: 'תאריך', value: '{date}', icon: <CalendarDaysIcon className="w-3 h-3"/> },
    { label: 'שם משרה', value: '{job_title}', icon: <BriefcaseIcon className="w-3 h-3"/> },
    { label: 'שכר מוצע', value: '{salary}', icon: <BanknotesIcon className="w-3 h-3"/> },
];

const MOCK_DATA = {
 
};

// --- SUB-COMPONENTS ---

const VariableChip: React.FC<{ label: string, onClick: () => void }> = ({ label, onClick }) => (
    <button 
        onClick={onClick}
        className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded-md text-xs font-semibold transition-all shadow-sm active:scale-95 w-full justify-start"
    >
        <span className="text-blue-500 font-mono text-[10px]">{`{ }`}</span>
        {label}
    </button>
);

const ToolbarButton: React.FC<{ 
    icon: React.ReactNode; 
    command: string; 
    arg?: string; 
    active?: boolean;
    title?: string;
}> = ({ icon, command, arg, active, title }) => {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        document.execCommand(command, false, arg);
    };

    return (
        <button
            onMouseDown={handleClick} // onMouseDown prevents focus loss from editor
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${active ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
            title={title}
        >
            {icon}
        </button>
    );
};

// --- MAIN COMPONENT ---
interface SmartDocumentEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: DocumentTemplate) => void;
    initialTemplate?: DocumentTemplate | null;
}

const SmartDocumentEditor: React.FC<SmartDocumentEditorProps> = ({ isOpen, onClose, onSave, initialTemplate }) => {
    const [htmlContent, setHtmlContent] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [isPreview, setIsPreview] = useState(false);
    const editorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialTemplate) {
            setHtmlContent(initialTemplate.htmlContent || ''); // Handle migration from blocks if needed
            setTemplateName(initialTemplate.name);
        } else {
            // Default content for new template
            setHtmlContent(`
                <h1 style="text-align: center;">הצעת מחיר</h1>
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
            `);
            setTemplateName('תבנית חדשה');
        }
    }, [initialTemplate, isOpen]);

    // Initial render content into editable div
    useEffect(() => {
        if (editorRef.current && !isPreview) {
            if (editorRef.current.innerHTML !== htmlContent) {
                editorRef.current.innerHTML = htmlContent;
            }
        }
    }, [isPreview]); // Only re-inject when switching back from preview to edit

    if (!isOpen) return null;

    const handleSave = () => {
        // Get latest content from ref before saving
        const currentContent = editorRef.current?.innerHTML || htmlContent;
        
        onSave({
            id: initialTemplate ? initialTemplate.id : Date.now(),
            name: templateName,
            category: 'General',
            lastModified: new Date().toISOString(),
            htmlContent: currentContent
        });
    };

    const insertVariable = (variable: string) => {
        if (!editorRef.current) return;
        
        editorRef.current.focus();
        
        // Insert at cursor position
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            
            // Ensure selection is inside the editor
            if (editorRef.current.contains(range.commonAncestorContainer)) {
                range.deleteContents();
                
                // Create a span for the variable to make it distinct (optional, but good for UX)
                const span = document.createElement('span');
                span.textContent = variable;
                span.style.backgroundColor = '#eff6ff'; // blue-50
                span.style.color = '#1d4ed8'; // blue-700
                span.style.padding = '0 4px';
                span.style.borderRadius = '4px';
                span.style.fontFamily = 'monospace';
                span.contentEditable = 'false'; // Treat as a single unit
                
                // We actually insert text nodes around it to allow typing after
                const spaceAfter = document.createTextNode('\u00A0');
                
                range.insertNode(spaceAfter);
                range.insertNode(span);
                
                // Move cursor after the variable
                range.setStartAfter(spaceAfter);
                range.setEndAfter(spaceAfter);
                selection.removeAllRanges();
                selection.addRange(range);
                
                // Update state
                setHtmlContent(editorRef.current.innerHTML);
            }
        }
    };
    
    // Process content for preview (simple replacement)
    const getPreviewContent = () => {
        let content = htmlContent;
        // Replace span wrappers first if we used them
        // For simplicity in this demo, we assume raw text replacement or check the span text
        // Actually, innerHTML contains the HTML. variables are text.
        
        Object.entries(MOCK_DATA).forEach(([key, value]) => {
             // Create a regex that handles potential HTML encoding of braces if any, though usually not needed for {}
             const regex = new RegExp(key.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1"), 'g');
             content = content.replace(regex, value);
        });
        
        // Also clean up the span styling for print/preview if we want it to look "native" text
        // But keeping it highlighted might be weird in preview. 
        // Let's replace the styled spans with just text for the preview render.
        // This is a bit complex regex, simplified approach:
        // The render replaces the variable text. The span style remains.
        // Ideally, we'd strip the tags. 
        // For this demo: We keep it simple.
        
        return content;
    };

    return (
        <div className="fixed inset-0 bg-gray-100 z-[100] flex flex-col animate-fade-in font-sans">
            {/* Top Bar */}
            <header className="bg-white border-b border-border-default h-16 px-6 flex items-center justify-between flex-shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <ArrowLeftIcon className="w-5 h-5"/>
                    </button>
                    <div className="h-6 w-px bg-gray-200"></div>
                    <input 
                        type="text" 
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="text-lg font-bold text-gray-800 bg-transparent border-none focus:ring-0 placeholder:text-gray-400"
                        placeholder="שם המסמך..."
                    />
                    <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded border border-gray-200">עורך מתקדם</span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-border-default">
                        <button 
                            onClick={() => setIsPreview(false)}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${!isPreview ? 'bg-white shadow text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            עריכה
                        </button>
                        <button 
                            onClick={() => setIsPreview(true)}
                            className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${isPreview ? 'bg-white shadow text-primary-700' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <EyeIcon className="w-4 h-4"/>
                            תצוגה מקדימה
                        </button>
                    </div>
                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                    <button onClick={handleSave} className="bg-primary-600 text-white px-6 py-2 rounded-lg font-bold shadow-md hover:bg-primary-700 transition flex items-center gap-2">
                        <CheckCircleIcon className="w-5 h-5"/>
                        שמור
                    </button>
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex-1 flex overflow-hidden">
                
                {/* Canvas Area (Center) */}
                <div className="flex-1 overflow-y-auto bg-gray-100 p-8 flex justify-center">
                    
                    <div className="flex flex-col gap-4 max-w-[210mm] w-full">
                        {/* Editor Toolbar (Only in Edit Mode) */}
                        {!isPreview && (
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex flex-wrap gap-2 items-center sticky top-0 z-10 mx-auto w-full">
                                <div className="flex items-center gap-1 border-r border-gray-200 pr-2 ml-2">
                                    <ToolbarButton command="undo" icon={<UndoIcon className="w-4 h-4"/>} title="ביטול" />
                                    <ToolbarButton command="redo" icon={<RedoIcon className="w-4 h-4"/>} title="בצע שוב" />
                                </div>
                                
                                <div className="flex items-center gap-1 border-r border-gray-200 pr-2 ml-2">
                                    <ToolbarButton command="bold" icon={<BoldIcon className="w-4 h-4"/>} title="מודגש" />
                                    <ToolbarButton command="italic" icon={<ItalicIcon className="w-4 h-4"/>} title="נטוי" />
                                    <ToolbarButton command="underline" icon={<UnderlineIcon className="w-4 h-4"/>} title="קו תחתון" />
                                </div>
                                
                                <div className="flex items-center gap-1 border-r border-gray-200 pr-2 ml-2">
                                    <ToolbarButton command="justifyLeft" icon={<AlignLeftIcon className="w-4 h-4"/>} title="יישור לשמאל" />
                                    <ToolbarButton command="justifyCenter" icon={<AlignCenterIcon className="w-4 h-4"/>} title="מרכוז" />
                                    <ToolbarButton command="justifyRight" icon={<AlignRightIcon className="w-4 h-4"/>} title="יישור לימין" />
                                </div>

                                <div className="flex items-center gap-1">
                                    <ToolbarButton command="insertUnorderedList" icon={<ListBulletIcon className="w-4 h-4"/>} title="רשימה" />
                                    <ToolbarButton command="insertOrderedList" icon={<ListNumberIcon className="w-4 h-4"/>} title="מספור" />
                                </div>
                                
                                <div className="flex-grow"></div>
                                <div className="text-xs text-gray-400 font-mono px-2">Text Editor</div>
                            </div>
                        )}

                        {/* The A4 Page */}
                        <div 
                            className={`w-[210mm] min-h-[297mm] bg-white shadow-xl mx-auto transition-all duration-300 p-[25mm] outline-none text-base text-gray-800 leading-relaxed`}
                        >
                            {isPreview ? (
                                <div 
                                    className="prose max-w-none"
                                    dangerouslySetInnerHTML={{ __html: getPreviewContent() }} 
                                />
                            ) : (
                                <div
                                    ref={editorRef}
                                    contentEditable
                                    className="prose max-w-none min-h-[200mm] outline-none empty:before:content-['התחל_להקליד_כאן...'] empty:before:text-gray-300"
                                    onInput={(e) => setHtmlContent(e.currentTarget.innerHTML)}
                                    onBlur={(e) => setHtmlContent(e.currentTarget.innerHTML)}
                                    style={{ direction: 'rtl', textAlign: 'right' }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar (Right) - Variables */}
                {!isPreview && (
                    <div className="w-72 bg-white border-r border-border-default flex flex-col z-10 shadow-lg">
                        <div className="p-5 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-800 mb-1">משתנים דינמיים</h3>
                            <p className="text-xs text-gray-500">לחץ להוספה במיקום הסמן</p>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto space-y-2">
                            {VARIABLES.map(v => (
                                <VariableChip 
                                    key={v.value} 
                                    label={v.label} 
                                    onClick={() => insertVariable(v.value)}
                                />
                            ))}
                            
                            <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-yellow-800">
                                <strong>טיפ:</strong> ניתן לעצב את הטקסט, להוסיף רשימות ולסדר פסקאות באמצעות הסרגל העליון. המשתנים יוחלפו במידע אמיתי בעת יצירת המסמך.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmartDocumentEditor;
