
import React, { useState, useRef, useEffect } from 'react';
import { CodeBracketIcon, XMarkIcon } from './Icons';
import { useDevMode } from '../context/DevModeContext';

interface DevAnnotationProps {
    title: string;
    description?: string;
    logic?: string[]; // Array of logic rules
    dataStructure?: object; // Example JSON structure
    children?: React.ReactNode; // Optional: Wrap the component being annotated
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';
}

const DevAnnotation: React.FC<DevAnnotationProps> = ({ title, description, logic, dataStructure, children, position = 'top-right' }) => {
    const { isDevMode } = useDevMode();
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    if (!isDevMode) {
        return <>{children}</>;
    }

    const positionClasses = {
        'top-right': 'absolute -top-3 -right-3',
        'top-left': 'absolute -top-3 -left-3',
        'bottom-right': 'absolute -bottom-3 -right-3',
        'bottom-left': 'absolute -bottom-3 -left-3',
        'inline': 'relative inline-block ml-2 align-middle',
    };

    return (
        <div className={`relative ${children ? 'group/dev-wrapper' : 'inline-block'}`}>
            {children}
            
            {/* Trigger Button - High Z-Index to stay on top */}
            <div className={`${positionClasses[position]} z-[999]`}>
                <button
                    onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    className="flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 transition-transform hover:scale-110 ring-2 ring-white animate-pulse"
                    title="Click to view Developer Spec"
                >
                    <CodeBracketIcon className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Popover */}
            {isOpen && (
                <div 
                    ref={popoverRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute z-[1000] w-80 bg-slate-900 text-slate-100 rounded-lg shadow-2xl border border-slate-700 p-4 text-left text-sm"
                    style={{ 
                        top: position.includes('bottom') ? '100%' : 'auto', 
                        bottom: position.includes('top') ? '100%' : 'auto',
                        right: position.includes('left') ? 'auto' : 0,
                        left: position.includes('left') ? 0 : 'auto',
                        marginTop: position.includes('bottom') ? '8px' : 0,
                        marginBottom: position.includes('top') ? '8px' : 0,
                    }}
                >
                    <div className="flex justify-between items-start mb-2 border-b border-slate-700 pb-2">
                        <h4 className="font-bold text-purple-400 font-mono">{title}</h4>
                        <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white"><XMarkIcon className="w-4 h-4"/></button>
                    </div>
                    
                    {description && <p className="mb-3 text-slate-300 leading-relaxed">{description}</p>}
                    
                    {logic && logic.length > 0 && (
                        <div className="mb-3">
                            <strong className="block text-xs uppercase text-slate-500 mb-1">Business Logic:</strong>
                            <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                                {logic.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                        </div>
                    )}

                    {dataStructure && (
                        <div>
                            <strong className="block text-xs uppercase text-slate-500 mb-1">Data Model (TS):</strong>
                            <pre className="bg-black/50 p-2 rounded text-[10px] font-mono text-green-400 overflow-x-auto">
                                {JSON.stringify(dataStructure, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
            
            {/* Outline on hover */}
            <div className="absolute inset-0 border-2 border-purple-500/50 rounded-lg pointer-events-none opacity-0 group-hover/dev-wrapper:opacity-100 transition-opacity z-[998]"></div>
        </div>
    );
};

export default DevAnnotation;
