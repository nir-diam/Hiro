
import React, { useState, useMemo, useEffect } from 'react';
import { 
    XMarkIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronLeftIcon, 
    VideoCameraIcon, DocumentTextIcon, FolderIcon, ArrowRightIcon,
    ArrowsPointingOutIcon, ArrowsPointingInIcon // Assuming these exist in Icons.tsx, if not I will use simple arrows
} from './Icons';
import { initialHelpData, HelpArticle } from '../data/helpCenterData';

interface HelpCenterDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

const flattenArticles = (items: HelpArticle[]) => {
    const flat: HelpArticle[] = [];
    const traverse = (nodes: HelpArticle[]) => {
        nodes.forEach((node) => {
            const { children, ...rest } = node;
            flat.push(rest);
            if (children) traverse(children);
        });
    };
    traverse(items);
    return flat;
};

const getRootIds = (items: HelpArticle[]) => items.filter((item) => !item.parentId).map((item) => item.id);

const HelpCenterDrawer: React.FC<HelpCenterDrawerProps> = ({ isOpen, onClose }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [searchTerm, setSearchTerm] = useState('');
    const [currentArticle, setCurrentArticle] = useState<HelpArticle | null>(null);
    const initialFlat = flattenArticles(initialHelpData as HelpArticle[]);
    const [articles, setArticles] = useState<HelpArticle[]>(initialFlat);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(getRootIds(initialFlat)));
    const [isExpandedMode, setIsExpandedMode] = useState(false); // New state for width
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const loadArticles = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`${apiBase}/api/help-center/articles`, { credentials: 'include' });
                if (!response.ok) {
                    throw new Error(`Help center load failed (${response.status})`);
                }
                const data: HelpArticle[] = await response.json();
                const flat = flattenArticles(data);
        setArticles(flat);
                setExpandedFolders(new Set(getRootIds(flat)));
            } catch (err) {
                console.error('[HelpCenterDrawer] failed to load articles', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadArticles();
    }, [apiBase]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) return articles;
        return articles.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [articles, searchTerm]);

    const handleToggleFolder = (id: string) => {
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleNavigate = (article: HelpArticle) => {
        if (article.type === 'folder') {
            handleToggleFolder(article.id);
        } else {
            setCurrentArticle(article);
        }
    };

    const renderTree = (parentId: string | null = null, depth = 0) => {
        if (searchTerm) {
            if (parentId !== null) return null; 
            return filteredItems.map(item => (
                <div 
                    key={item.id} 
                    onClick={() => handleNavigate(item)}
                    className="p-3 border-b border-border-default/50 hover:bg-bg-subtle cursor-pointer flex items-center gap-3 animate-fade-in"
                >
                    <div className="text-text-muted">
                        {item.type === 'folder' ? <FolderIcon className="w-4 h-4"/> : <DocumentTextIcon className="w-4 h-4"/>}
                    </div>
                    <div>
                         <span className="text-sm font-medium text-text-default block">{item.title}</span>
                         <span className="text-[10px] text-text-subtle">
                             {item.type === 'folder' ? 'תיקייה' : 'מאמר'}
                         </span>
                    </div>
                </div>
            ));
        }

        const nodes = articles.filter(a => a.parentId === parentId).sort((a, b) => a.order - b.order);
        
        return nodes.map(node => {
            const isExpanded = expandedFolders.has(node.id);
            const hasChildren = articles.some(a => a.parentId === node.id);

            return (
                <React.Fragment key={node.id}>
                    <div 
                        onClick={() => handleNavigate(node)}
                        className={`
                            flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors mx-2
                            ${currentArticle?.id === node.id ? 'bg-primary-50 text-primary-700 font-bold' : 'hover:bg-bg-subtle text-text-default'}
                        `}
                        style={{ paddingRight: `${depth * 12 + 10}px` }}
                    >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className={`${currentArticle?.id === node.id ? 'text-primary-500' : 'text-text-muted'}`}>
                                {node.type === 'folder' ? <FolderIcon className="w-4 h-4"/> : <DocumentTextIcon className="w-4 h-4"/>}
                            </div>
                            <span className="truncate text-sm">{node.title}</span>
                        </div>
                        {node.type === 'folder' && hasChildren && (
                            <ChevronLeftIcon className={`w-3 h-3 text-text-subtle transition-transform ${isExpanded ? '-rotate-90' : ''}`} />
                        )}
                        {node.videoUrl && node.type === 'article' && <VideoCameraIcon className="w-3 h-3 text-red-400" />}
                    </div>
                    {node.type === 'folder' && isExpanded && (
                        <div className="border-r border-border-default/50 mr-4 my-1">
                            {renderTree(node.id, depth + 1)}
                        </div>
                    )}
                </React.Fragment>
            );
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <style>{`
                @keyframes slideInLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-slide-in-left { animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .aspect-video iframe { width: 100%; height: 100%; border: none; }
            `}</style>
            
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div 
                className={`relative h-full bg-white shadow-2xl flex flex-col animate-slide-in-left border-r border-border-default transition-all duration-300 ease-in-out ${isExpandedMode ? 'w-[90vw] max-w-5xl' : 'w-full max-w-md'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-border-default bg-bg-card flex flex-col gap-4 shadow-sm z-10 flex-shrink-0">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <h2 className="text-xl font-black text-text-default">מרכז עזרה</h2>
                             {currentArticle && (
                                 <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-bold">
                                     מאמר
                                 </span>
                             )}
                        </div>
                        <div className="flex items-center gap-2">
                             <button 
                                onClick={() => setIsExpandedMode(!isExpandedMode)} 
                                className="p-2 hover:bg-bg-subtle rounded-full text-text-muted transition-colors"
                                title={isExpandedMode ? "כווץ חלונית" : "הרחב חלונית"}
                            >
                                {isExpandedMode ? <ArrowsPointingInIcon className="w-5 h-5"/> : <ArrowsPointingOutIcon className="w-5 h-5"/>}
                            </button>
                            <button onClick={onClose} className="p-2 hover:bg-bg-subtle rounded-full text-text-muted transition-colors"><XMarkIcon className="w-6 h-6"/></button>
                        </div>
                    </div>

                    {!currentArticle ? (
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="איך נוכל לעזור?" 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-4 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                            />
                        </div>
                    ) : (
                        <button 
                            onClick={() => setCurrentArticle(null)}
                            className="flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-600 transition-colors self-start px-1"
                        >
                            <ArrowRightIcon className="w-4 h-4" />
                            חזרה לרשימה
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {/* If expanded and viewing an article, we can show list on side (optional for future), currently just widening main content */}
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-bg-default p-0">
                        {currentArticle ? (
                            <div className={`p-6 md:p-8 animate-fade-in mx-auto ${isExpandedMode ? 'max-w-4xl' : 'max-w-none'}`}>
                                <h1 className="text-2xl font-black text-text-default leading-tight mb-6">{currentArticle.title}</h1>
                                
                                {currentArticle.videoUrl && (
                                    <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg mb-8 border border-border-default">
                                        <iframe 
                                            src={currentArticle.videoUrl} 
                                            title={currentArticle.title} 
                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                            allowFullScreen
                                        ></iframe>
                                    </div>
                                )}
                                
                                <div 
                                    className="prose prose-sm max-w-none text-text-default leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: currentArticle.content || '' }}
                                />

                                <div className="mt-10 pt-6 border-t border-border-default">
                                    <p className="text-sm text-center text-text-muted">האם מאמר זה עזר לך?</p>
                                    <div className="flex justify-center gap-4 mt-3">
                                        <button className="px-4 py-2 bg-white border border-border-default rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition text-sm font-medium shadow-sm">👍 כן, תודה</button>
                                        <button className="px-4 py-2 bg-white border border-border-default rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition text-sm font-medium shadow-sm">👎 לא מצאתי תשובה</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-2">
                                {searchTerm && filteredItems.length === 0 && (
                                    <div className="text-center py-10 text-text-muted">
                                        <p>לא נמצאו תוצאות עבור "{searchTerm}"</p>
                                    </div>
                                )}
                                {renderTree()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpCenterDrawer;
