
import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon, Bars2Icon } from './Icons';

export interface ViewConfig {
  id: string;
  name: string;
  visible: boolean;
}

interface CustomizeViewsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  views: ViewConfig[];
  onSave: (newViews: ViewConfig[]) => void;
  onReset: () => void;
}

const CustomizeViewsPopover: React.FC<CustomizeViewsPopoverProps> = ({ isOpen, onClose, views, onSave, onReset }) => {
    const [localViews, setLocalViews] = useState(views);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLocalViews(views);
        }
    }, [isOpen, views]);

    if (!isOpen) return null;

    const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Set drag image or styling here
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
        
        if (dragItem.current !== null && dragItem.current !== index) {
            const newViews = [...localViews];
            const draggedItemContent = newViews[dragItem.current];
            
            // Remove the item from its original position
            newViews.splice(dragItem.current, 1);
            // Insert it at the new position
            newViews.splice(index, 0, draggedItemContent);
            
            setLocalViews(newViews);
            dragItem.current = index; // Update the current drag index to the new position
        }
    };

    const handleDragEnd = () => {
        dragItem.current = null;
        dragOverItem.current = null;
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
                <p className="text-xs text-text-muted mb-2 px-2">בחר אילו תצוגות להציג וגרור כדי לשנות את סדרן.</p>
                <ul>
                    {localViews.map((view, index) => (
                         <li 
                            key={view.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragEnter={() => handleDragEnter(index)}
                            onDragOver={(e) => e.preventDefault()} // Critical for allowing drop
                            onDragEnd={handleDragEnd}
                            className="flex items-center justify-between p-2 rounded-lg mb-1 transition-all cursor-move bg-bg-subtle/50 hover:bg-bg-subtle"
                        >
                            <div className="flex items-center gap-2 w-full">
                                <button className="cursor-grab text-text-subtle p-1"><Bars2Icon className="w-5 h-5"/></button>
                                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer flex-grow select-none">
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

export default CustomizeViewsPopover;
