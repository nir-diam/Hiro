import React, { useState, useMemo } from 'react';
import { jobFieldsData, JobCategory, JobFieldType, JobRole } from '../data/jobFieldsData';
import { PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon } from './Icons';

const AdminJobFieldsView: React.FC = () => {
    const [data, setData] = useState<JobCategory[]>(jobFieldsData);
    const [selectedCategory, setSelectedCategory] = useState<JobCategory | null>(null);
    const [selectedFieldType, setSelectedFieldType] = useState<JobFieldType | null>(null);

    const handleSelectCategory = (category: JobCategory) => {
        setSelectedCategory(category);
        setSelectedFieldType(null); // Reset field type selection
    };
    
    const handleSelectFieldType = (fieldType: JobFieldType) => {
        setSelectedFieldType(fieldType);
    };

    const Column: React.FC<{ title: string; children: React.ReactNode; onAdd: () => void; }> = ({ title, children, onAdd }) => (
        <div className="flex-1 border-l border-border-default flex flex-col min-w-0">
            <header className="p-3 border-b border-border-default flex justify-between items-center flex-shrink-0">
                <h3 className="font-bold text-text-default truncate">{title}</h3>
                <button onClick={onAdd} className="p-1.5 text-primary-600 hover:bg-primary-100 rounded-full"><PlusIcon className="w-5 h-5"/></button>
            </header>
            <div className="overflow-y-auto">{children}</div>
        </div>
    );
    
    const ColumnItem: React.FC<{ item: { name: string } | { value: string }; isSelected: boolean; onClick: () => void; onEdit: () => void; onDelete: () => void; }> = ({ item, isSelected, onClick, onEdit, onDelete }) => (
        <div className={`group flex items-center justify-between p-3 cursor-pointer ${isSelected ? 'bg-primary-100' : 'hover:bg-bg-hover'}`} onClick={onClick}>
            <span className={`font-semibold ${isSelected ? 'text-primary-700' : 'text-text-default'}`}>
                {'name' in item ? item.name : item.value}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 text-text-subtle hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4"/></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 text-text-subtle hover:text-red-600 rounded-full"><TrashIcon className="w-4 h-4"/></button>
            </div>
        </div>
    );

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6 h-[80vh] flex flex-col">
            <h1 className="text-xl font-bold mb-1">ניהול תחומי משרה</h1>
            <p className="text-sm text-text-muted mb-6">ערוך את ההיררכיה של קטגוריות, תחומים ותפקידים במערכת.</p>

            <div className="flex-grow border border-border-default rounded-lg flex overflow-hidden">
                <Column title="קטגוריות" onAdd={() => alert('Add category')}>
                    {data.map(category => (
                        <ColumnItem 
                            key={category.name}
                            item={category}
                            isSelected={selectedCategory?.name === category.name}
                            onClick={() => handleSelectCategory(category)}
                            onEdit={() => alert(`Edit ${category.name}`)}
                            onDelete={() => alert(`Delete ${category.name}`)}
                        />
                    ))}
                </Column>

                <Column title={selectedCategory ? `תחומים ב"${selectedCategory.name}"` : 'בחר קטגוריה'} onAdd={() => selectedCategory && alert(`Add field to ${selectedCategory.name}`)}>
                    {selectedCategory?.fieldTypes.map(fieldType => (
                        <ColumnItem 
                            key={fieldType.name}
                            item={fieldType}
                            isSelected={selectedFieldType?.name === fieldType.name}
                            onClick={() => handleSelectFieldType(fieldType)}
                            onEdit={() => alert(`Edit ${fieldType.name}`)}
                            onDelete={() => alert(`Delete ${fieldType.name}`)}
                        />
                    ))}
                </Column>
                
                <Column title={selectedFieldType ? `תפקידים ב"${selectedFieldType.name}"` : 'בחר תחום'} onAdd={() => selectedFieldType && alert(`Add role to ${selectedFieldType.name}`)}>
                     {selectedFieldType?.roles.map(role => (
                        <div key={role.value} className="group p-3 hover:bg-bg-hover">
                           <div className="flex justify-between items-center">
                                <p className="font-semibold text-text-default">{role.value}</p>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => alert(`Edit ${role.value}`)} className="p-1 text-text-subtle hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4"/></button>
                                    <button onClick={() => alert(`Delete ${role.value}`)} className="p-1 text-text-subtle hover:text-red-600 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <p className="text-xs text-text-subtle">שמות נרדפים: {role.synonyms.join(', ')}</p>
                        </div>
                    ))}
                </Column>

            </div>
             <div className="flex justify-end pt-4 mt-4">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">שמור שינויים</button>
            </div>
        </div>
    );
};

export default AdminJobFieldsView;
