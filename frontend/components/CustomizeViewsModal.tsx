
import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon, Bars2Icon } from './Icons';

export interface ViewConfig {
  id: string;
  name: string;
  visible: boolean;
}

interface CustomizeViewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  views: ViewConfig[];
  onSave: (newViews: ViewConfig[]) => void;
  onReset: () => void;
}

const CustomizeViewsModal: React.FC<CustomizeViewsModalProps> = ({ isOpen, onClose, views, onSave, onReset }) => {
    const [localViews, setLocalViews] = useState(views);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        // When the popover is opened, sync its internal state with the props 
        // from the parent. This ensures we always start editing from the current 
        // saved configuration and prevents stale state issues if the popover is
        // re-opened without being unmounted.
        if (isOpen) {
            setLocalViews(views);
        }
    }, [isOpen, views]);

    if (!isOpen) return null;

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        dragItem.current = index;
        setDragging(true);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
        const newViews = [...localViews];
        if (dragItem.current !== null) {
            const dragItemContent = newViews.splice(dragItem.current, 1)[0];
            newViews.splice(dragOverItem.current, 0, dragItemContent);
            dragItem.current = dragOverItem.current;
            setLocalViews(newViews);
        }
    };

    const handleDragEnd = () => {
        dragItem.current = null;
        dragOverItem.current = null;
        setDragging(false);
    };
    
    const handleVisibilityChange = (id: string) => {
        setLocalViews(prev => 
            prev.map(view => view.id === id ? { ...view, visible: !view.visible } : view)
        );
    };

    const handleSave = () => {
        onSave(localViews);
    };

    const handleReset = () => {
        onReset();
        onClose();
    }

    return (
        <div 
            className="absolute top-full left-0 mt-2 bg-bg-card rounded-2xl shadow-2xl w-80 flex flex-col overflow-hidden text-text-default max-h-[80vh] z-30 border border-border-default"
            onClick={e => e.stopPropagation()}
        >
            <header className="flex items-center justify-between p-3 border-b border-border-default">
                <h2 className="text-base font-bold">התאם תצוגות</h2>
                <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover"><XMarkIcon className="w-5 h-5" /></button>
            </header>
            <main className="p-2 overflow-y-auto">
                <p className="text-xs text-text-muted mb-2 px-2">בחר אילו תצוגות להציג ושנה את סדרן.</p>
                <ul onDragEnd={handleDragEnd}>
                    {localViews.map((view, index) => (
                         <li 
                            key={view.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnter={() => handleDragEnter(index)}
                            className={`flex items-center justify-between p-2 rounded-lg mb-1 transition-shadow ${dragItem.current === index && dragging ? 'shadow-lg bg-primary-50' : 'bg-bg-subtle/50'}`}
                        >
                            <div className="flex items-center gap-2">
                                <button className="cursor-grab text-text-subtle p-1"><Bars2Icon className="w-5 h-5"/></button>
                                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={view.visible}
                                        onChange={() => handleVisibilityChange(view.id)}
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                                    />
                                    {view.name}
                                </label>
                            </div>
                        </li>
                    ))}
                </ul>
            </main>
             <footer className="flex justify-between items-center p-3 bg-bg-subtle border-t border-border-default">
                <button onClick={handleReset} className="text-xs font-semibold text-text-muted hover:text-primary-600">איפוס</button>
                <div className="flex gap-2">
                    <button onClick={onClose} className="font-semibold py-1.5 px-4 rounded-lg text-sm hover:bg-bg-hover">ביטול</button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-semibold py-1.5 px-4 rounded-lg text-sm hover:bg-primary-700">שמור</button>
                </div>
            </footer>
        </div>
    );
};

export default CustomizeViewsModal;
