
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon, XMarkIcon } from './Icons';

interface Option {
    id: string | number;
    label: string;
    subLabel?: string;
    image?: string; // Optional avatar/logo
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number | null;
    onChange: (value: string | number | null) => void;
    placeholder?: string;
    label?: string;
    icon?: React.ReactNode;
    className?: string;
    disabled?: boolean;
    // For large datasets, you might want to pass an async search function instead of raw options
    onSearchChange?: (term: string) => void; 
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
    options, 
    value, 
    onChange, 
    placeholder = "בחר...", 
    label,
    icon,
    className = "",
    disabled = false,
    onSearchChange
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get selected object for display
    const selectedOption = useMemo(() => 
        options.find(o => o.id === value), 
    [value, options]);

    // Internal filtering (if onSearchChange is not provided)
    const filteredOptions = useMemo(() => {
        if (onSearchChange) return options; // Assuming parent handles filtering
        if (!searchTerm) return options;
        return options.filter(opt => 
            opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [options, searchTerm, onSearchChange]);

    // Handle clicking outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search if no selection was made to keep UI clean, 
                // OR keep it if you want persistence. Here we reset for cleaner "Select" feel.
                if (!selectedOption) setSearchTerm(''); 
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedOption]);

    const handleSelect = (option: Option) => {
        onChange(option.id);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null);
        setSearchTerm('');
    };

    const handleInputFocus = () => {
        setIsOpen(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        setIsOpen(true);
        if (onSearchChange) onSearchChange(val);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && <label className="block text-xs font-bold text-text-muted uppercase mb-1.5">{label}</label>}
            
            <div 
                className={`
                    relative flex items-center w-full bg-bg-input border rounded-xl transition-all duration-200
                    ${isOpen ? 'ring-2 ring-primary-500/20 border-primary-500' : 'border-border-default hover:border-primary-300'}
                    ${disabled ? 'opacity-60 cursor-not-allowed bg-bg-subtle' : 'cursor-text'}
                `}
                onClick={() => !disabled && inputRef.current?.focus()}
            >
                {/* Left Icon */}
                {icon && <div className="pl-3 text-text-subtle">{icon}</div>}

                {/* Input Area */}
                <input
                    ref={inputRef}
                    type="text"
                    value={isOpen ? searchTerm : (selectedOption?.label || '')}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    placeholder={selectedOption ? selectedOption.label : placeholder}
                    disabled={disabled}
                    className={`
                        w-full bg-transparent border-none focus:ring-0 text-sm py-2.5 px-3
                        ${selectedOption && !isOpen ? 'text-text-default font-medium' : 'text-text-default'}
                        placeholder:text-text-muted
                    `}
                    autoComplete="off"
                />

                {/* Right Actions */}
                <div className="flex items-center pr-2 gap-1">
                    {value && !disabled && (
                        <button 
                            onClick={handleClear}
                            className="p-1 rounded-full text-text-subtle hover:text-text-default hover:bg-bg-subtle transition-colors"
                        >
                            <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <div className={`p-1 text-text-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                        <ChevronDownIcon className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && !disabled && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-bg-card border border-border-default rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar animate-fade-in flex flex-col">
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => handleSelect(option)}
                                className={`
                                    w-full text-right px-4 py-2.5 text-sm transition-colors flex items-center justify-between group
                                    ${value === option.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-text-default hover:bg-bg-hover'}
                                `}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {option.image && <img src={option.image} alt="" className="w-5 h-5 rounded-full object-cover"/>}
                                    <span className="truncate">{option.label}</span>
                                    {option.subLabel && <span className="text-xs text-text-muted truncate">({option.subLabel})</span>}
                                </div>
                                {value === option.id && <MagnifyingGlassIcon className="w-4 h-4 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </button>
                        ))
                    ) : (
                        <div className="p-4 text-center text-text-muted text-sm">
                            לא נמצאו תוצאות עבור "{searchTerm}"
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
