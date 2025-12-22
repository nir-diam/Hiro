import React, { useEffect, useId } from 'react';
import { XMarkIcon } from './Icons';

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer: React.ReactNode;
}

const Drawer: React.FC<DrawerProps> = ({ isOpen, onClose, title, children, footer }) => {
    const titleId = useId();

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = '';
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-40 z-50"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div
                className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-card shadow-2xl flex flex-col transform transition-transform"
                onClick={(e) => e.stopPropagation()}
                style={{ animation: 'slideInFromLeft 0.3s forwards' }}
            >
                <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                    <h2 id={titleId} className="text-xl font-bold text-text-default">{title}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto p-6">
                    {children}
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
                    {footer}
                </footer>
                <style>{`
                    @keyframes slideInFromLeft {
                        from { transform: translateX(-100%); }
                        to { transform: translateX(0); }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default Drawer;
