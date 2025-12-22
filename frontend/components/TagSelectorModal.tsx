import React, { useState, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';

interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedTags: string[]) => void;
  existingTags: string[];
}

const mockTags = [
  'ניהול', 'שיווק', 'מכירות', 'PPC', 'אסטרטגיה', 'ניהול צוות', 'React', 'TypeScript', 'Node.js', 'Figma', 'UX', 'UI', 'SQL', 'Python', 'Agile', 'Jira',
  'ניהול מוצר', 'אנליזת נתונים', 'שירות לקוחות', 'אבטחת איכות', 'DevOps', 'AWS', 'Google Cloud', 'עיצוב גרפי', 'Photoshop', 'Illustrator', 'כתיבת תוכן'
];

const TagSelectorModal: React.FC<TagSelectorModalProps> = ({ isOpen, onClose, onSave, existingTags }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const availableTags = useMemo(() => {
        const lowerCaseSearch = searchTerm.toLowerCase();
        return mockTags.filter(tag => 
            !existingTags.includes(tag) && tag.toLowerCase().includes(lowerCaseSearch)
        );
    }, [searchTerm, existingTags]);

    const handleToggleTag = (tag: string) => {
        setSelectedTags(prev => 
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const handleSave = () => {
        onSave(selectedTags);
        setSelectedTags([]);
        setSearchTerm('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default h-[70vh]" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold">הוספת תגיות</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <div className="p-4 border-b border-border-default">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="חיפוש תגית..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                        />
                    </div>
                </div>
                <main className="p-4 overflow-y-auto flex-1">
                    <div className="flex flex-wrap gap-2">
                        {availableTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => handleToggleTag(tag)}
                                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                                    selectedTags.includes(tag)
                                        ? 'bg-primary-500 text-white shadow-sm'
                                        : 'bg-bg-subtle text-text-default hover:bg-bg-hover'
                                }`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button type="button" onClick={handleSave} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2" disabled={selectedTags.length === 0}>
                        הוסף ({selectedTags.length})
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default TagSelectorModal;
