
import React, { useEffect, useId } from 'react';
import { XMarkIcon, DocumentTextIcon, CodeBracketIcon } from './Icons';
import { PageSpec } from '../data/specs';

interface SpecDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    spec: PageSpec | null;
}

const SpecDrawer: React.FC<SpecDrawerProps> = ({ isOpen, onClose, spec }) => {
    const titleId = useId();

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [isOpen]);

    if (!isOpen || !spec) return null;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity" 
                onClick={onClose}
            ></div>

            {/* Drawer */}
            <div 
                className="relative w-full max-w-lg bg-[#1e1e1e] text-gray-300 h-full shadow-2xl flex flex-col transform transition-transform duration-300 ease-out border-l border-gray-700"
                style={{ animation: 'slideInRight 0.3s forwards' }}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                {/* Header */}
                <header className="flex items-center justify-between p-5 border-b border-gray-700 bg-[#252526]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-900/50 rounded-lg text-blue-400">
                            <CodeBracketIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 id={titleId} className="text-lg font-bold text-gray-100">אפיון טכני (Dev Spec)</h2>
                            <p className="text-xs text-gray-500 font-mono">Status: Draft • v1.0</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 text-gray-400 transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto p-6 space-y-8 font-sans">
                    
                    {/* Intro */}
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">{spec.title}</h1>
                        <p className="text-sm leading-relaxed text-gray-400">{spec.description}</p>
                    </div>

                    <hr className="border-gray-700" />

                    {/* Sections */}
                    <div className="space-y-8">
                        {spec.sections.map((section, idx) => (
                            <section key={idx}>
                                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    {section.title}
                                </h3>
                                <ul className="space-y-2 mb-4">
                                    {section.content.map((line, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300 leading-relaxed">
                                            <span className="text-gray-600 mt-1.5">•</span>
                                            <span>{line}</span>
                                        </li>
                                    ))}
                                </ul>
                                {section.codeSnippet && (
                                    <div className="mt-3 relative group">
                                        <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-mono">TypeScript</div>
                                        <pre className="bg-[#0d0d0d] p-4 rounded-lg border border-gray-800 overflow-x-auto text-xs font-mono text-green-400 shadow-inner">
                                            {section.codeSnippet.trim()}
                                        </pre>
                                    </div>
                                )}
                            </section>
                        ))}
                    </div>

                    {/* Dev Note Footer */}
                    <div className="bg-yellow-900/20 border border-yellow-700/50 p-4 rounded-lg text-xs text-yellow-200/80">
                        <strong>הערה למפתח:</strong> העיצוב ב-Figma הוא הקובע מבחינת פיקסלים. המסמך הזה הוא הקובע מבחינת לוגיקה ומימוש Data.
                    </div>
                </main>
                
                <style>{`
                    @keyframes slideInRight {
                        from { transform: translateX(100%); }
                        to { transform: translateX(0); }
                    }
                    /* Scrollbar for dark theme */
                    ::-webkit-scrollbar { width: 8px; }
                    ::-webkit-scrollbar-track { background: #1e1e1e; }
                    ::-webkit-scrollbar-thumb { background: #424242; border-radius: 4px; }
                    ::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
                `}</style>
            </div>
        </div>
    );
};

export default SpecDrawer;
