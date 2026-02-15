
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    PlusIcon, PencilIcon, TrashIcon, UserGroupIcon, Cog6ToothIcon, 
    TableCellsIcon, Squares2X2Icon, PhoneIcon, EnvelopeIcon, WhatsappIcon, 
    ChatBubbleBottomCenterTextIcon, FolderIcon, XMarkIcon, CheckIcon, FunnelIcon 
} from './Icons';
import Drawer from './Drawer';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
interface Contact {
  id: number;
  name: string;
  phone: string;
  mobilePhone: string;
  email: string;
  role: string;
  linkedin: string;
  username: string;
  isActive: boolean;
  notes: string;
}

interface ContactGroup {
    id: string;
    name: string;
    contactIds: number[];
}

// --- MOCK DATA ---
export const mockContacts: Contact[] = [
    { id: 1, name: 'ישראל ישראלי', phone: '054-1234567', mobilePhone: '050-1112222', email: 'israel@getter.co.il', role: 'מנהל גיוס', linkedin: 'https://linkedin.com/in/israel', username: '', isActive: true, notes: 'איש קשר ראשי לכל המשרות הטכנולוגיות.' },
    { id: 2, name: 'דנה כהן', phone: '052-7654321', mobilePhone: '050-3334444', email: 'dana@getter.co.il', role: 'רכזת גיוס', linkedin: 'https://linkedin.com/in/dana', username: '', isActive: true, notes: 'לתאם מולה ראיונות טכניים.' },
    { id: 3, name: 'אבי לוי', phone: '050-9876543', mobilePhone: '050-5556666', email: 'avi@getter.co.il', role: 'מנהל תיק לקוח', linkedin: 'https://linkedin.com/in/avi', username: '', isActive: false, notes: 'לא פעיל כרגע.' },
];

const initialGroups: ContactGroup[] = [
    { id: 'vip', name: 'מנהלים בכירים (VIP)', contactIds: [1] },
    { id: 'tech', name: 'מגייסי טכנולוגיה', contactIds: [1, 2] }
];

const defaultVisibleColumns = ['name', 'role', 'actions', 'phone', 'email', 'isActive'];

// --- Sub-components ---
const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
    </div>
);
const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={4} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"></textarea>
    </div>
);

const ContactCard: React.FC<{ 
    contact: Contact; 
    clientId: string; 
    onEdit: (c: Contact) => void; 
    onDelete: (c: Contact) => void; 
    onActionClick: (mode: 'email' | 'sms' | 'whatsapp', contact: Contact) => void;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ contact, clientId, onEdit, onDelete, onActionClick, isSelected, onSelect }) => (
    <div className={`bg-bg-card rounded-lg border shadow-sm p-4 flex flex-col justify-between transition-all relative ${isSelected ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-border-default'}`}>
        <div className="absolute top-4 left-4" onClick={e => e.stopPropagation()}>
            <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={onSelect} 
                className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" 
            />
        </div>
        <div>
            <div className="flex justify-between items-start pr-6"> {/* Added padding right for checkbox */}
                <Link to={`/clients/${clientId}/contacts/${contact.id}`} className="font-semibold text-primary-700 hover:underline">{contact.name}</Link>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${contact.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{contact.isActive ? 'פעיל' : 'לא פעיל'}</span>
            </div>
            <p className="text-sm text-text-muted">{contact.role}</p>
        </div>
        <div className="mt-4 text-xs text-text-subtle space-y-1">
            <p><strong>טלפון:</strong> {contact.phone}</p>
            <p><strong>נייד:</strong> {contact.mobilePhone}</p>
            <p><strong>דוא"ל:</strong> {contact.email}</p>
        </div>
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-border-subtle">
            <div className="flex items-center gap-1">
                <a href={`tel:${contact.mobilePhone || contact.phone}`} title="חייג" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><PhoneIcon className="w-5 h-5"/></a>
                <button onClick={() => onActionClick('email', contact)} title="שלח מייל" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><EnvelopeIcon className="w-5 h-5"/></button>
                <button onClick={() => onActionClick('sms', contact)} title="שלח SMS" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><ChatBubbleBottomCenterTextIcon className="w-5 h-5"/></button>
                <button onClick={() => onActionClick('whatsapp', contact)} title="שלח WhatsApp" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><WhatsappIcon className="w-5 h-5"/></button>
            </div>
            <div className="flex justify-end gap-1">
                <button onClick={() => onEdit(contact)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"><PencilIcon className="w-4 h-4"/></button>
                <button onClick={() => onDelete(contact)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
            </div>
        </div>
    </div>
);

interface ClientContactsTabProps {
    clientId: string;
    onOpenMessageModal: (config: MessageModalConfig) => void;
}


const ClientContactsTab: React.FC<ClientContactsTabProps> = ({ clientId, onOpenMessageModal }) => {
    const { t } = useLanguage();
    const [contacts, setContacts] = useState(mockContacts);
    const [groups, setGroups] = useState<ContactGroup[]>(initialGroups);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [formData, setFormData] = useState<Contact | null>(null);

    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    
    // Group & Selection State
    const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());
    const [filterGroupId, setFilterGroupId] = useState<string>('all');
    const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const groupMenuRef = useRef<HTMLDivElement>(null);

    const allColumns = useMemo(() => [
        { id: 'select', header: '' },
        { id: 'name', header: t('contacts.col_name') },
        { id: 'role', header: t('contacts.col_role') },
        { id: 'actions', header: t('contacts.col_actions') },
        { id: 'phone', header: t('contacts.col_phone') },
        { id: 'mobilePhone', header: t('contacts.col_mobile') },
        { id: 'email', header: t('contacts.col_email') },
        { id: 'isActive', header: t('contacts.col_status') },
    ], [t]);


    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
          if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
              setIsGroupMenuOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter Logic
    const filteredContacts = useMemo(() => {
        let items = contacts;
        if (filterGroupId !== 'all') {
            const group = groups.find(g => g.id === filterGroupId);
            if (group) {
                items = items.filter(c => group.contactIds.includes(c.id));
            }
        }
        return items;
    }, [contacts, filterGroupId, groups]);

    const sortedContacts = useMemo(() => {
        let sortableItems = [...filteredContacts];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = (a as any)[sortConfig.key];
                const bVal = (b as any)[sortConfig.key];
                if (aVal < bVal) { return sortConfig.direction === 'asc' ? -1 : 1; }
                if (aVal > bVal) { return sortConfig.direction === 'asc' ? 1 : -1; }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredContacts, sortConfig]);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };

    const handleDragStart = (index: number, colId: string) => { dragItemIndex.current = index; setDraggingColumn(colId); };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };
    const handleDragEnd = () => { dragItemIndex.current = null; setDraggingColumn(null); };

    useEffect(() => { if (editingContact) { setFormData(editingContact); } }, [editingContact]);
    const handleAdd = () => { setEditingContact({ id: 0, name: '', phone: '', mobilePhone: '', email: '', role: '', linkedin: '', username: '', isActive: true, notes: '' }); setIsDrawerOpen(true); };
    const handleEdit = (contact: Contact) => { setEditingContact(contact); setIsDrawerOpen(true); };
    const handleSave = () => {
        if (!formData) return;
        if (formData.id === 0) { setContacts([...contacts, { ...formData, id: Date.now() }]); } 
        else { setContacts(contacts.map(c => c.id === formData.id ? formData : c)); }
        closeDrawer();
    };
    const closeDrawer = () => { setIsDrawerOpen(false); setEditingContact(null); setFormData(null); };
    const handleDelete = (contact: Contact) => { setContactToDelete(contact); };
    const confirmDelete = () => { if (contactToDelete) { setContacts(prev => prev.filter(c => c.id !== contactToDelete.id)); setContactToDelete(null); } };
    const handleStatusToggle = (e: React.SyntheticEvent, contactId: number) => { 
        e.stopPropagation();
        setContacts(prev => prev.map(c => c.id === contactId ? { ...c, isActive: !c.isActive } : c)); 
    };

    const handleActionClick = (mode: 'email' | 'sms' | 'whatsapp', contact: Contact) => {
        onOpenMessageModal({
            mode,
            candidateName: contact.name,
            candidatePhone: contact.mobilePhone || contact.phone,
        });
    };
    
    // Selection Handlers
    const handleSelectContact = (id: number) => {
        setSelectedContactIds(prev => {
            const next = new Set(prev);
            if(next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
        else setSelectedContactIds(new Set());
    }

    // Group Handlers
    const handleAddToGroup = (groupId: string) => {
        const idsToAdd = Array.from(selectedContactIds);
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                // Add unique IDs
                const newIds = [...new Set([...g.contactIds, ...idsToAdd])];
                return { ...g, contactIds: newIds };
            }
            return g;
        }));
        setIsGroupMenuOpen(false);
        setSelectedContactIds(new Set()); // Optional: clear selection
    };

    const handleCreateGroup = () => {
        if (!newGroupName.trim()) return;
        const newGroup: ContactGroup = {
            id: Date.now().toString(),
            name: newGroupName,
            contactIds: Array.from(selectedContactIds)
        };
        setGroups(prev => [...prev, newGroup]);
        setNewGroupName('');
        setIsGroupMenuOpen(false);
        setSelectedContactIds(new Set());
    };

    const renderCell = (contact: Contact, columnId: string) => {
        switch(columnId) {
            case 'select': return (
                <div onClick={e => e.stopPropagation()}>
                     <input type="checkbox" checked={selectedContactIds.has(contact.id)} onChange={() => handleSelectContact(contact.id)} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                </div>
            );
            case 'name': return <Link to={`/clients/${clientId}/contacts/${contact.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-primary-700 hover:underline">{contact.name}</Link>;
            case 'isActive': return <label onClick={e => e.stopPropagation()} className="relative inline-flex items-center cursor-pointer"><input type="checkbox" checked={contact.isActive} onChange={(e) => handleStatusToggle(e, contact.id)} className="sr-only peer" /><div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-primary-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div></label>;
            case 'actions': return (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <a href={`tel:${contact.mobilePhone || contact.phone}`} title="חייג" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><PhoneIcon className="w-5 h-5"/></a>
                    <button onClick={() => handleActionClick('email', contact)} title="שלח מייל" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><EnvelopeIcon className="w-5 h-5"/></button>
                    <button onClick={() => handleActionClick('sms', contact)} title="שלח SMS" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><ChatBubbleBottomCenterTextIcon className="w-5 h-5"/></button>
                    <button onClick={() => handleActionClick('whatsapp', contact)} title="שלח WhatsApp" className="p-1.5 rounded-full text-text-subtle hover:bg-bg-hover hover:text-primary-600"><WhatsappIcon className="w-5 h-5"/></button>
                </div>
            );
            default: return (contact as any)[columnId];
        }
    };
    
    return (
        <div className="bg-bg-card p-6 rounded-lg border border-border-default relative">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; } @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } } .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }`}</style>
            
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                     <h2 className="text-xl font-bold">{t('clients.tabs_contacts')}</h2>
                     {/* Group Filter */}
                     <div className="relative">
                         <select 
                            value={filterGroupId} 
                            onChange={(e) => setFilterGroupId(e.target.value)}
                            className="bg-bg-subtle border border-border-default text-text-default text-sm rounded-lg py-1.5 px-3 pr-8 focus:ring-primary-500 focus:border-primary-500 appearance-none cursor-pointer font-medium"
                        >
                             <option value="all">כל אנשי הקשר</option>
                             {groups.map(g => (
                                 <option key={g.id} value={g.id}>{g.name} ({g.contactIds.length})</option>
                             ))}
                         </select>
                         <FunnelIcon className="w-3.5 h-3.5 text-text-subtle absolute top-1/2 left-2.5 -translate-y-1/2 pointer-events-none" />
                     </div>
                </div>

                <div className="flex items-center gap-2">
                     <button onClick={handleAdd} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                        <PlusIcon className="w-5 h-5"/>
                        <span>{t('contacts.add_new')}</span>
                    </button>
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} title="תצוגת טבלה" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                    <div className="relative" ref={settingsRef}>
                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                        {isSettingsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                            {allColumns.filter(c => c.id !== 'select').map(column => (
                                <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                {column.header}
                                </label>
                            ))}
                            </div>
                        </div>
                        )}
                    </div>
                </div>
            </div>

            {contacts.length > 0 ? (
                viewMode === 'table' ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[800px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input 
                                        type="checkbox" 
                                        checked={filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                                        onChange={handleSelectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                    />
                                </th>
                                {visibleColumns.map((colId, index) => {
                                    const col = allColumns.find(c => c.id === colId);
                                    if (!col) return null;
                                    return (
                                        <th key={col.id} draggable onDragStart={() => handleDragStart(index, col.id)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDrop={handleDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestSort(col.id)} className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''}`}>
                                            <div className="flex items-center gap-1">{col.header} {getSortIndicator(col.id)}</div>
                                        </th>
                                    )
                                })}
                                <th className="p-4">עריכה</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {sortedContacts.map(contact => (
                                <tr key={contact.id} className={`hover:bg-bg-hover group ${selectedContactIds.has(contact.id) ? 'bg-primary-50' : ''}`} onClick={() => handleSelectContact(contact.id)}>
                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                         <input type="checkbox" checked={selectedContactIds.has(contact.id)} onChange={() => handleSelectContact(contact.id)} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                                    </td>
                                    {visibleColumns.map(colId => (
                                        <td key={colId} className="p-4 text-text-muted">{renderCell(contact, colId)}</td>
                                    ))}
                                    <td className="p-4">
                                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => handleEdit(contact)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"><PencilIcon className="w-4 h-4"/></button>
                                            <button onClick={() => handleDelete(contact)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sortedContacts.map(contact => (
                            <ContactCard 
                                key={contact.id} 
                                contact={contact} 
                                clientId={clientId} 
                                onEdit={handleEdit} 
                                onDelete={handleDelete} 
                                onActionClick={handleActionClick}
                                isSelected={selectedContactIds.has(contact.id)}
                                onSelect={() => handleSelectContact(contact.id)}
                            />
                        ))}
                    </div>
                )
            ) : (
                <div className="text-center py-10 bg-bg-subtle rounded-lg border border-dashed border-border-default">
                    <UserGroupIcon className="w-12 h-12 text-text-subtle mx-auto mb-3" />
                    <p className="text-text-muted font-semibold">{t('contacts.no_contacts')}</p>
                </div>
            )}

            {/* Floating Bulk Actions Bar */}
            {selectedContactIds.size > 0 && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 bg-bg-card border border-border-default shadow-2xl rounded-full px-6 py-3 flex items-center gap-6 animate-slide-up">
                    <span className="font-bold text-primary-600 text-sm">{selectedContactIds.size} נבחרו</span>
                    <div className="h-6 w-px bg-border-default"></div>
                    
                    <div className="relative" ref={groupMenuRef}>
                        <button 
                            onClick={() => setIsGroupMenuOpen(!isGroupMenuOpen)}
                            className="flex items-center gap-2 font-semibold hover:text-primary-600 transition-colors text-sm"
                        >
                            <FolderIcon className="w-5 h-5"/>
                            <span>הוסף לקבוצה</span>
                        </button>
                        
                        {isGroupMenuOpen && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-64 bg-white border border-border-default rounded-xl shadow-xl overflow-hidden z-50">
                                <div className="p-3 border-b border-border-subtle">
                                    <p className="text-xs font-bold text-text-muted mb-2">בחר קבוצה:</p>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {groups.map(g => (
                                            <button 
                                                key={g.id}
                                                onClick={() => handleAddToGroup(g.id)}
                                                className="w-full text-right px-2 py-1.5 text-sm hover:bg-bg-hover rounded-md flex items-center justify-between"
                                            >
                                                <span>{g.name}</span>
                                                <span className="text-xs text-text-subtle">{g.contactIds.length}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-3 bg-bg-subtle/30">
                                    <p className="text-xs font-bold text-text-muted mb-1">צור חדשה:</p>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            placeholder="שם קבוצה..."
                                            className="w-full bg-white border border-border-default rounded-md px-2 py-1 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                                        />
                                        <button 
                                            onClick={handleCreateGroup}
                                            disabled={!newGroupName.trim()}
                                            className="p-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                                        >
                                            <PlusIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <button className="font-semibold hover:text-red-500 transition-colors flex items-center gap-2 text-sm">
                        <TrashIcon className="w-5 h-5"/> מחק
                    </button>

                    <div className="h-6 w-px bg-border-default"></div>
                    <button onClick={() => setSelectedContactIds(new Set())} className="p-1 bg-bg-subtle rounded-full hover:bg-bg-hover text-text-muted" title="נקה בחירה">
                        <XMarkIcon className="w-4 h-4"/>
                    </button>
                </div>
            )}

            {isDrawerOpen && editingContact && formData && (
                <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title={editingContact.id === 0 ? 'איש קשר חדש' : 'עריכת איש קשר'}
                    footer={<><button onClick={closeDrawer} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button><button onClick={handleSave} className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700">שמור</button></>}>
                    <div className="space-y-4">
                        <FormInput label="שם*" name="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                        <FormInput label="תפקיד" name="role" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} />
                        <FormInput label="טלפון*" name="phone" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
                        <FormInput label="טלפון נייד" name="mobilePhone" value={formData.mobilePhone} onChange={(e) => setFormData({...formData, mobilePhone: e.target.value})} />
                        <FormInput label="דוא״ל*" name="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                        <FormInput label="לינקדאין" name="linkedin" value={formData.linkedin} onChange={(e) => setFormData({...formData, linkedin: e.target.value})} />
                        <FormInput label="שם משתמש" name="username" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} />
                        <FormTextArea label="הערה פנימית" name="notes" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
                    </div>
                </Drawer>
            )}

            {contactToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setContactToDelete(null)}>
                    <div className="bg-bg-card rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-2">מחיקת איש קשר</h3>
                        <p className="text-text-muted mb-4">האם למחוק את {contactToDelete.name}? לא ניתן לשחזר פעולה זו.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setContactToDelete(null)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                            <button onClick={confirmDelete} className="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg">מחק</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientContactsTab;
