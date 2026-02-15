
import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, PaperAirplaneIcon, ChatBubbleBottomCenterTextIcon, PencilIcon } from './Icons';

interface HistoryItem {
    date: string;
    action: string;
    user: string;
}

interface ActivityLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    entityId: string | number; // For display ID
    history: HistoryItem[];
    onAddNote: (note: string) => void;
}

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose, title, entityId, history, onAddNote }) => {
    const [note, setNote] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Scroll to bottom when opening
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [isOpen, history]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!note.trim()) return;
        onAddNote(note);
        setNote('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-bg-card w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-border-default animate-fade-in" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-white">
                    <div>
                        <h2 className="text-xl font-black text-text-default">{title}</h2>
                        {entityId && <span className="text-xs font-mono text-text-muted bg-bg-subtle px-2 py-0.5 rounded mt-1 inline-block">#{entityId}</span>}
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                {/* Timeline Content */}
                <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 bg-bg-subtle/30 space-y-4"
                >
                    {history.length === 0 && (
                        <div className="text-center text-text-muted text-sm py-8">
                            אין פעילות מתועדת עדיין.
                        </div>
                    )}

                    {history.map((item, index) => {
                        const isNote = !item.action.includes('סטטוס') && !item.action.includes('נוצר') && !item.action.includes('הופק');
                        
                        return (
                            <div key={index} className="flex gap-4 group">
                                {/* Icon Column */}
                                <div className="flex flex-col items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border shadow-sm z-10 ${isNote ? 'bg-primary-50 text-primary-600 border-primary-100' : 'bg-white text-text-muted border-border-default'}`}>
                                        {isNote ? <ChatBubbleBottomCenterTextIcon className="w-4 h-4" /> : <PencilIcon className="w-3.5 h-3.5" />}
                                    </div>
                                    {index < history.length - 1 && <div className="w-px h-full bg-border-default -my-2"></div>}
                                </div>

                                {/* Content Column */}
                                <div className="flex-1 pb-4">
                                    <div className="bg-white p-3 rounded-xl border border-border-default shadow-sm group-hover:border-primary-200 transition-colors relative">
                                        {/* Date Badge */}
                                        <span className="absolute top-3 left-3 text-[10px] text-text-subtle font-mono">
                                            {new Date(item.date).toLocaleDateString('he-IL')}
                                        </span>
                                        
                                        <p className="text-xs font-bold text-text-default mb-1">{item.user}</p>
                                        <p className="text-sm text-text-default leading-relaxed whitespace-pre-wrap">{item.action}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Input Area */}
                <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-border-default">
                    <label className="block text-xs font-bold text-text-muted mb-2">הוסף הערת גבייה / טיפול</label>
                    <div className="flex items-end gap-2 bg-bg-input border border-border-default rounded-xl p-2 focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500 transition-all shadow-sm">
                        <textarea 
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            rows={2}
                            placeholder="למשל: שוחחתי עם הלקוח, הבטיח להעביר צ'ק..."
                            className="flex-1 bg-transparent border-none outline-none text-sm resize-none py-1 px-1"
                        />
                        <button 
                            type="submit" 
                            disabled={!note.trim()}
                            className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                        >
                            <PaperAirplaneIcon className="w-4 h-4 transform rotate-180" />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ActivityLogModal;
