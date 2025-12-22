
import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from './Icons';

const Tag: React.FC<{ children: React.ReactNode; onRemove: () => void; }> = ({ children, onRemove }) => {
    const wordCount = typeof children === 'string' ? children.split(' ').filter(Boolean).length : 1;
    
    let widthClass = 'min-w-[6rem]'; // Base for 1 word
    if (wordCount === 2) {
        widthClass = 'min-w-[9rem]';
    } else if (wordCount === 3) {
        widthClass = 'min-w-[12rem]';
    } else if (wordCount >= 4) {
        widthClass = 'min-w-[15rem]';
    }

    return (
        <span className={`inline-flex items-center justify-center ${widthClass} bg-primary-100 text-primary-800 text-sm font-medium py-1 px-2 rounded-full animate-fade-in`}>
            <span>{children}</span>
            <button 
                onClick={onRemove} 
                className="mr-1.5 text-primary-500 hover:text-primary-700"
                aria-label={`Remove ${children}`}
            >
                <XMarkIcon className="h-4 w-4" />
            </button>
        </span>
    );
};

export const TagInput: React.FC<{
    tags: string[];
    setTags: (tags: string[]) => void;
    placeholder?: string;
    limit?: number;
}> = ({ tags, setTags, placeholder = "הוסף תגית...", limit }) => {
    const [inputValue, setInputValue] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding) {
            inputRef.current?.focus();
        }
    }, [isAdding]);

    const addTags = (tagsToAdd: string[]) => {
        const uniqueNewTags = tagsToAdd
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0 && !tags.includes(tag));
        
        if (uniqueNewTags.length > 0) {
            setTags([...tags, ...uniqueNewTags]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            e.preventDefault();
            const tagsToAdd = inputValue.split(',').filter(tag => tag.trim() !== '');
            addTags(tagsToAdd);
            setInputValue('');
        } else if (e.key === ',' && inputValue.trim()) {
             e.preventDefault();
             const tagsToAdd = inputValue.split(',').filter(tag => tag.trim() !== '');
             addTags(tagsToAdd);
             setInputValue('');
        }
    };
    
    const handleBlur = () => {
        if (inputValue.trim()) {
            const tagsToAdd = inputValue.split(',').filter(tag => tag.trim() !== '');
            addTags(tagsToAdd);
        }
        setInputValue('');
        setIsAdding(false);
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    const visibleTags = limit && !isExpanded ? tags.slice(0, limit) : tags;
    const remainingCount = limit ? Math.max(0, tags.length - limit) : 0;

    return (
        <div className="w-full">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {visibleTags.map((tag) => (
                    <Tag key={tag} onRemove={() => removeTag(tag)}>
                        {tag}
                    </Tag>
                ))}
                
                {limit && !isExpanded && remainingCount > 0 && (
                    <button 
                        onClick={() => setIsExpanded(true)}
                        className="bg-bg-subtle text-text-default text-sm font-semibold px-3 py-1 rounded-full border border-border-default hover:bg-bg-hover transition-colors z-10 relative"
                    >
                        +{remainingCount} נוספים
                    </button>
                )}
                
                {limit && isExpanded && tags.length > limit && (
                     <button 
                        onClick={() => setIsExpanded(false)}
                        className="text-text-subtle text-sm font-semibold px-2 hover:text-primary-600 transition-colors z-10 relative"
                    >
                        הצג פחות
                    </button>
                )}

                {isAdding ? (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        className="flex-grow bg-transparent outline-none p-1.5 text-sm animate-fade-in min-w-[120px] z-10 relative border-b border-primary-300 focus:border-primary-500"
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsAdding(true)}
                        className="p-1 rounded-full text-primary-500 hover:bg-primary-100 z-10 relative"
                        aria-label="Add tag"
                    >
                        <PlusIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    );
};
