
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon, PencilIcon, TrashIcon, 
    Cog6ToothIcon, ChevronDownIcon, ArrowPathIcon, TableCellsIcon, Squares2X2Icon, 
    XMarkIcon, UserGroupIcon, PhoneIcon, EnvelopeIcon, WhatsappIcon, ChatBubbleBottomCenterTextIcon,
    FunnelIcon, ChevronUpIcon
} from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import LocationSelector, { LocationItem } from './LocationSelector';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
type ClientStatus = 'פעיל' | 'לא פעיל' | 'בהקפאה';
export interface Client {
  id: number;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  openJobs: number;
  status: ClientStatus;
  accountManager: string;
  city: string;
  region: string;
  industry: string;
  field: string;
  contactIsActive: boolean;
  creationDate: string; // ISO date string
  recruitingCoordinator: string;
}

interface ContactWithClient {
  id: number;
  name: string;
  clientName: string;
  clientId: number;
  role: string;
  email: string;
  phone: string;
  isActive: boolean;
}


// --- MOCK DATA ---
export const clientsData: Client[] = [
  { id: 1, name: 'גטר גרופ', contactPerson: 'ישראל ישראלי', phone: '050-1112222', email: 'israel@getter.co.il', openJobs: 3, status: 'פעיל', accountManager: 'ישראל ישראלי', city: 'פתח תקווה', region: 'מרכז', industry: 'מסחר וקמעונאות', field: 'יבוא וסחר', contactIsActive: true, creationDate: '2023-05-10', recruitingCoordinator: 'דנה כהן' },
  { id: 2, name: 'נעמן גרופ', contactPerson: 'דנה כהן', phone: '052-3334444', email: 'dana@naaman.co.il', openJobs: 8, status: 'פעיל', accountManager: 'אביב לוי', city: 'ראש העין', region: 'מרכז', industry: 'קמעונאות', field: 'כלי בית', contactIsActive: true, creationDate: '2022-11-20', recruitingCoordinator: 'אביב לוי' },
  { id: 3, name: 'שטראוס מים', contactPerson: 'אביב לוי', phone: '053-5556666', email: 'aviv@strauss-water.com', openJobs: 1, status: 'בהקפאה', accountManager: 'ישראל ישראלי', city: 'פתח תקווה', region: 'מרכז', industry: 'מוצרי צריכה', field: 'מים', contactIsActive: true, creationDate: '2024-01-15', recruitingCoordinator: 'דנה כהן' },
  { id: 4, name: 'FedEx', contactPerson: 'יעל שחר', phone: '054-7778888', email: 'yael@fedex.co.il', openJobs: 0, status: 'לא פעיל', accountManager: 'שרית בן חיים', city: 'נתב"ג', region: 'מרכז', industry: 'לוגיסטיקה', field: 'שילוח בינלאומי', contactIsActive: false, creationDate: '2021-08-30', recruitingCoordinator: 'יעל שחר' },
  { id: 5, name: 'צ\'יטה שליחויות', contactPerson: 'משה משה', phone: '058-9990000', email: 'moshe@chita.co.il', openJobs: 2, status: 'פעיל', accountManager: 'אביב לוי', city: 'חיפה', region: 'צפון', industry: 'לוגיסטיקה', field: 'שליחויות', contactIsActive: true, creationDate: '2023-09-01', recruitingCoordinator: 'אביב לוי' },
  { id: 6, name: 'פריץ לוגיסטיקה', contactPerson: 'שרה שרה', phone: '050-1231234', email: 'sara@fritz.co.il', openJobs: 5, status: 'פעיל', accountManager: 'שרית בן חיים', city: 'אשדוד', region: 'דרום', industry: 'לוגיסטיקה', field: 'שילוח', contactIsActive: true, creationDate: '2022-02-18', recruitingCoordinator: 'דנה כהן' },
];

const allContactsData: ContactWithClient[] = clientsData.flatMap((client, i) => {
    const contactsForClient: ContactWithClient[] = [
        {
            id: client.id * 10 + 1,
            name: client.contactPerson,
            clientId: client.id,
            clientName: client.name,
            role: 'איש קשר ראשי',
            email: client.email,
            phone: client.phone,
            isActive: client.contactIsActive,
        }
    ];
    if (i % 2 === 0) {
        contactsForClient.push({
            id: client.id * 10 + 2,
            name: `עובד נוסף ${i+1}`,
            clientId: client.id,
            clientName: client.name,
            role: 'רכז גיוס',
            email: `recruiter${i+1}@${client.name.split(' ')[0].toLowerCase()}.com`,
            phone: `050-111${i}${i}${i}${i}`,
            isActive: true,
        });
    }
    return contactsForClient;
});

// Columns and styles
const statusStyles: { [key in ClientStatus]: { text: string; bg: string; } } = {
  'פעיל': { text: 'text-green-800', bg: 'bg-green-100' },
  'בהקפאה': { text: 'text-amber-800', bg: 'bg-amber-100' },
  'לא פעיל': { text: 'text-gray-700', bg: 'bg-gray-200' },
};

const initialClientFilters = {
    searchTerm: '',
    status: '',
    accountManager: '',
    locations: [] as LocationItem[],
    industry: '',
    field: '',
    contactStatus: '',
    clientId: '',
    recruitingCoordinator: '',
    creationDateFrom: '',
    creationDateTo: '',
};

const initialContactFilters = {
    searchTerm: '',
    clientName: '',
    role: '',
    status: '', // 'active' | 'inactive'
};

const FilterInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string }> = ({ label, name, value, onChange, type = 'text', placeholder }) => (
    <div>
        <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition" />
    </div>
);


const FilterSelect: React.FC<{label?: string, name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder: string, className?: string }> = ({ label, name, value, onChange, options, placeholder, className }) => (
    <div className={className}>
        {label && <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>}
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition">
            <option value="">{placeholder}</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

// --- SUB COMPONENTS ---

const ClientCard: React.FC<{ client: Client; onNavigate: () => void; }> = ({ client, onNavigate }) => (
    <div onClick={onNavigate} className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-semibold text-primary-700">{client.name}</p>
                <p className="text-sm text-text-muted">{client.contactPerson}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[client.status].bg} ${statusStyles[client.status].text}`}>{client.status}</span>
        </div>
        <div className="mt-4 flex justify-between items-end">
            <div className="text-sm">
                <p className="text-text-muted">משרות פתוחות: <span className="font-bold text-text-default">{client.openJobs}</span></p>
            </div>
            <p className="text-xs text-text-subtle">מנהל/ת תיק: {client.accountManager}</p>
        </div>
    </div>
);

const ContactCard: React.FC<{ contact: ContactWithClient; onNavigate: () => void }> = ({ contact, onNavigate }) => (
    <div onClick={onNavigate} className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <p className="font-semibold text-primary-700">{contact.name}</p>
                <p className="text-sm text-text-muted">{contact.clientName}</p>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${contact.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>{contact.isActive ? 'פעיל' : 'לא פעיל'}</span>
        </div>
        <div className="mt-4 text-xs text-text-subtle space-y-1">
            <p><strong>תפקיד:</strong> {contact.role}</p>
            <p><strong>דוא"ל:</strong> {contact.email}</p>
            <p><strong>טלפון:</strong> {contact.phone}</p>
        </div>
    </div>
);

const TabButton: React.FC<{ title: string; icon: React.ReactNode; isActive: boolean; onClick: () => void; }> = ({ title, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${isActive ? 'border-b-2 border-primary-500 text-primary-600' : 'text-text-muted hover:text-text-default'}`}
    >
        {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
        <span>{title}</span>
    </button>
);

interface ClientsListViewProps {
    openMessageModal: (config: MessageModalConfig) => void;
}

const ClientsListView: React.FC<ClientsListViewProps> = ({ openMessageModal }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [clients] = useState<Client[]>(clientsData);
    const [activeTab, setActiveTab] = useState<'clients' | 'contacts'>('clients');

    // Columns definitions using translation
    const allClientColumns = useMemo(() => [
        { id: 'name', header: t('clients.col_name') },
        { id: 'contactPerson', header: t('clients.col_contact_person') },
        { id: 'openJobs', header: t('clients.col_open_jobs') },
        { id: 'status', header: t('clients.col_status') },
        { id: 'accountManager', header: t('clients.col_account_manager') },
        { id: 'city', header: t('clients.col_city') },
        { id: 'region', header: t('clients.col_region') },
        { id: 'industry', header: t('clients.col_industry') },
        { id: 'field', header: t('clients.col_field') },
    ], [t]);

    const allContactColumns = useMemo(() => [
        { id: 'name', header: t('contacts.col_name') },
        { id: 'clientName', header: t('clients.col_name') }, // Reusing client name label for clarity
        { id: 'role', header: t('contacts.col_role') },
        { id: 'email', header: t('contacts.col_email') },
        { id: 'phone', header: t('contacts.col_phone') },
        { id: 'isActive', header: t('contacts.col_status') },
    ], [t]);

    const defaultVisibleClientColumns = useMemo(() => ['name', 'contactPerson', 'openJobs', 'status', 'accountManager', 'city'], []);
    const defaultVisibleContactColumns = useMemo(() => ['name', 'role', 'clientName', 'phone', 'email', 'isActive'], []);

    // State for clients tab
    const [clientFilters, setClientFilters] = useState(initialClientFilters);
    const [isClientAdvancedFilterOpen, setIsClientAdvancedFilterOpen] = useState(false);
    const [clientViewMode, setClientViewMode] = useState<'table' | 'grid'>('table');
    const [visibleClientColumns, setVisibleClientColumns] = useState<string[]>(defaultVisibleClientColumns);
    const [isClientSettingsOpen, setIsClientSettingsOpen] = useState(false);
    const clientSettingsRef = useRef<HTMLDivElement>(null);
    const clientDragItemIndex = useRef<number | null>(null);
    const [draggingClientColumn, setDraggingClientColumn] = useState<string | null>(null);
    const [clientSortConfig, setClientSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    
    // State for contacts tab
    const [contactFilters, setContactFilters] = useState(initialContactFilters);
    const [contactViewMode, setContactViewMode] = useState<'table' | 'grid'>('table');
    const [visibleContactColumns, setVisibleContactColumns] = useState<string[]>(defaultVisibleContactColumns);
    const [isContactSettingsOpen, setIsContactSettingsOpen] = useState(false);
    const contactSettingsRef = useRef<HTMLDivElement>(null);
    const contactDragItemIndex = useRef<number | null>(null);
    const [draggingContactColumn, setDraggingContactColumn] = useState<string | null>(null);
    const [contactSortConfig, setContactSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [selectedContactIds, setSelectedContactIds] = useState<Set<number>>(new Set());

    // --- Client Logic ---
    const requestClientSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (clientSortConfig && clientSortConfig.key === key && clientSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setClientSortConfig({ key, direction });
    };

    const getClientSortIndicator = (key: string) => {
        if (!clientSortConfig || clientSortConfig.key !== key) return null;
        return <span className="text-text-subtle">{clientSortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
    };
    
    const handleClientFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setClientFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleResetClientFilters = () => {
        setClientFilters(initialClientFilters);
        setIsClientAdvancedFilterOpen(false);
    };

    const sortedAndFilteredClients = useMemo(() => {
        let filtered = clients.filter(client => {
            const search = clientFilters.searchTerm.toLowerCase();
            const matchesSearch = !search || client.name.toLowerCase().includes(search) || client.phone.includes(search) || client.email.toLowerCase().includes(search);
            const matchesStatus = !clientFilters.status || client.status === clientFilters.status;
            const matchesManager = !clientFilters.accountManager || client.accountManager === clientFilters.accountManager;
            const matchesLocations = !clientFilters.locations || clientFilters.locations.length === 0 || clientFilters.locations.some(loc => (loc.type === 'city' && client.city === loc.value) || (loc.type === 'region' && client.region === loc.value));
            const matchesIndustry = !clientFilters.industry || client.industry === clientFilters.industry;
            const matchesField = !clientFilters.field || client.field === clientFilters.field;
            const matchesContactStatus = !clientFilters.contactStatus || (clientFilters.contactStatus === 'פעיל' && client.contactIsActive) || (clientFilters.contactStatus === 'לא פעיל' && !client.contactIsActive);
            const matchesClientId = !clientFilters.clientId || String(client.id).includes(clientFilters.clientId);
            const matchesRecruiter = !clientFilters.recruitingCoordinator || client.recruitingCoordinator === clientFilters.recruitingCoordinator;
            const matchesDateFrom = !clientFilters.creationDateFrom || client.creationDate >= clientFilters.creationDateFrom;
            const matchesDateTo = !clientFilters.creationDateTo || client.creationDate <= clientFilters.creationDateTo;

            return matchesSearch && matchesStatus && matchesManager && matchesLocations && matchesIndustry && matchesField && matchesContactStatus && matchesClientId && matchesRecruiter && matchesDateFrom && matchesDateTo;
        });

        if (clientSortConfig !== null) {
            filtered.sort((a, b) => {
                const aValue = (a as any)[clientSortConfig.key];
                const bValue = (b as any)[clientSortConfig.key];
                if (aValue < bValue) return clientSortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return clientSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [clients, clientFilters, clientSortConfig]);

    const handleClientColumnToggle = (columnId: string) => {
        setVisibleClientColumns(prev => {
            if (prev.includes(columnId)) return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allClientColumns.findIndex(c => c.id === a) - allClientColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };

    const handleClientDragStart = (index: number, colId: string) => {
        clientDragItemIndex.current = index;
        setDraggingClientColumn(colId);
    };

    const handleClientDragEnter = (index: number) => {
        if (clientDragItemIndex.current === null || clientDragItemIndex.current === index) return;
        const newCols = [...visibleClientColumns];
        const draggedItem = newCols.splice(clientDragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        clientDragItemIndex.current = index;
        setVisibleClientColumns(newCols);
    };

    const handleClientDragEnd = () => {
        clientDragItemIndex.current = null;
        setDraggingClientColumn(null);
    };
    
    // --- Contact Logic ---
     const requestContactSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (contactSortConfig && contactSortConfig.key === key && contactSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setContactSortConfig({ key, direction });
    };

    const getContactSortIndicator = (key: string) => {
        if (!contactSortConfig || contactSortConfig.key !== key) return null;
        return <span className="text-text-subtle">{contactSortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
    };
    
    const handleContactFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setContactFilters(prev => ({ ...prev, [name]: value }));
    };

    const sortedAndFilteredContacts = useMemo(() => {
        let filtered = allContactsData.filter(contact => {
            const search = contactFilters.searchTerm.toLowerCase();
            const matchesSearch = !search || contact.name.toLowerCase().includes(search) || contact.clientName.toLowerCase().includes(search) || contact.email.toLowerCase().includes(search);
            const matchesClient = !contactFilters.clientName || contact.clientName === contactFilters.clientName;
            const matchesRole = !contactFilters.role || contact.role.toLowerCase().includes(contactFilters.role.toLowerCase());
            const matchesStatus = !contactFilters.status || (contactFilters.status === 'active' && contact.isActive) || (contactFilters.status === 'inactive' && !contact.isActive);

            return matchesSearch && matchesClient && matchesRole && matchesStatus;
        });

        if (contactSortConfig !== null) {
            filtered.sort((a, b) => {
                const aValue = (a as any)[contactSortConfig.key];
                const bValue = (b as any)[contactSortConfig.key];
                if (aValue < bValue) return contactSortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return contactSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [contactFilters, contactSortConfig]);

    const handleContactColumnToggle = (columnId: string) => {
        setVisibleContactColumns(prev => {
            if (prev.includes(columnId)) return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allContactColumns.findIndex(c => c.id === a) - allContactColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };
    
    const handleContactDragStart = (index: number, colId: string) => {
        contactDragItemIndex.current = index;
        setDraggingContactColumn(colId);
    };

    const handleContactDragEnter = (index: number) => {
        if (contactDragItemIndex.current === null || contactDragItemIndex.current === index) return;
        const newCols = [...visibleContactColumns];
        const draggedItem = newCols.splice(contactDragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        contactDragItemIndex.current = index;
        setVisibleContactColumns(newCols);
    };
    const handleContactDragEnd = () => {
        contactDragItemIndex.current = null;
        setDraggingContactColumn(null);
    };

    const handleSelectContact = (id: number) => {
        setSelectedContactIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const areAllContactsSelected = useMemo(() => 
        sortedAndFilteredContacts.length > 0 && sortedAndFilteredContacts.every(c => selectedContactIds.has(c.id)),
        [selectedContactIds, sortedAndFilteredContacts]
    );

    const handleSelectAllContacts = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedContactIds(new Set(sortedAndFilteredContacts.map(c => c.id)));
        } else {
            setSelectedContactIds(new Set());
        }
    };
    
    // --- General Logic ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (clientSettingsRef.current && !clientSettingsRef.current.contains(event.target as Node)) setIsClientSettingsOpen(false);
          if (contactSettingsRef.current && !contactSettingsRef.current.contains(event.target as Node)) setIsContactSettingsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filterOptions = useMemo(() => ({
        statuses: [...new Set(clientsData.map(c => c.status))],
        accountManagers: [...new Set(clientsData.map(c => c.accountManager))],
        industries: [...new Set(clientsData.map(c => c.industry))],
        fields: [...new Set(clientsData.map(c => c.field))],
        recruitingCoordinators: [...new Set(clientsData.map(c => c.recruitingCoordinator))],
        contactClients: [...new Set(allContactsData.map(c => c.clientName))],
        contactRoles: [...new Set(allContactsData.map(c => c.role))],
    }), []);
    
    const renderClientCell = (client: Client, columnId: string) => {
        switch (columnId) {
            case 'name': return <span className="font-semibold text-primary-700">{client.name}</span>;
            case 'openJobs': return <span className="font-semibold">{client.openJobs}</span>;
            case 'status': return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[client.status].bg} ${statusStyles[client.status].text}`}>{client.status}</span>;
            default: return (client as any)[columnId];
        }
    };

     const renderContactCell = (contact: ContactWithClient, columnId: string) => {
        switch (columnId) {
            case 'name': return <span className="font-semibold text-primary-700">{contact.name}</span>;
            case 'clientName': return <span className="text-text-default">{contact.clientName}</span>;
            case 'isActive': return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${contact.isActive ? statusStyles['פעיל'].bg : statusStyles['לא פעיל'].bg} ${contact.isActive ? statusStyles['פעיל'].text : statusStyles['לא פעיל'].text}`}>{contact.isActive ? 'פעיל' : 'לא פעיל'}</span>;
            default: return (contact as any)[columnId];
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; } .animate-slide-up { animation: slide-up 0.3s ease-out forwards; } @keyframes slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } } `}</style>
            <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">{t('clients.title')}</h1>
                    <p className="text-sm text-text-muted">
                        {activeTab === 'clients' ? t('clients.total_clients', {count: sortedAndFilteredClients.length}) : t('clients.total_contacts', {count: sortedAndFilteredContacts.length})}
                    </p>
                </div>
                <button onClick={() => navigate('/clients/new')} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                    <PlusIcon className="w-5 h-5"/>
                    <span>{activeTab === 'clients' ? t('clients.new_client_btn') : t('clients.new_contact_btn')}</span>
                </button>
            </header>
            
            <div className="border-b border-border-default mb-4">
                <nav className="flex items-center -mb-px gap-4">
                    <TabButton title={t('clients.tabs_clients')} icon={<BuildingOffice2Icon />} isActive={activeTab === 'clients'} onClick={() => setActiveTab('clients')} />
                    <TabButton title={t('clients.tabs_contacts')} icon={<UserGroupIcon />} isActive={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} />
                </nav>
            </div>

            {activeTab === 'clients' && (
                <>
                    <div className="bg-bg-subtle/70 rounded-xl border border-border-default mb-4 p-3 space-y-3">
                        {/* Simple Filters */}
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="relative flex-grow min-w-[15rem] flex-shrink-0">
                                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input type="text" placeholder={t('clients.search_placeholder_clients')} name="searchTerm" value={clientFilters.searchTerm} onChange={handleClientFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm" />
                            </div>
                            <FilterSelect placeholder={t('clients.filter_status')} name="status" value={clientFilters.status} onChange={handleClientFilterChange} options={filterOptions.statuses} className="flex-grow min-w-[8rem] flex-shrink-0" />
                            <FilterSelect placeholder={t('clients.filter_account_manager')} name="accountManager" value={clientFilters.accountManager} onChange={handleClientFilterChange} options={filterOptions.accountManagers} className="flex-grow min-w-[8rem] flex-shrink-0" />
                            <button onClick={() => setIsClientAdvancedFilterOpen(!isClientAdvancedFilterOpen)} className="text-sm font-semibold text-primary-600 bg-primary-100/70 py-2.5 px-4 rounded-lg hover:bg-primary-200 transition flex items-center gap-1">
                                <span>{t('clients.filter_advanced')}</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isClientAdvancedFilterOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        {/* Advanced Filters */}
                        {isClientAdvancedFilterOpen && (
                             <div className="pt-4 mt-3 border-t border-border-default space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    <div className="relative">
                                        <label className="block text-xs font-semibold text-text-muted mb-1">{t('clients.filter_location')}</label>
                                        <LocationSelector 
                                            selectedLocations={clientFilters.locations}
                                            onChange={(newLocations) => setClientFilters(prev => ({ ...prev, locations: newLocations }))}
                                            placeholder={t('clients.filter_location_placeholder')}
                                            className="w-full"
                                        />
                                    </div>
                                    <FilterSelect label={t('clients.filter_industry')} name="industry" value={clientFilters.industry} onChange={handleClientFilterChange} options={filterOptions.industries} placeholder={t('filter.status_all')} />
                                    <FilterSelect label={t('clients.filter_field')} name="field" value={clientFilters.field} onChange={handleClientFilterChange} options={filterOptions.fields} placeholder={t('filter.status_all')} />
                                    <FilterSelect label={t('clients.filter_contact_status')} name="contactStatus" value={clientFilters.contactStatus} onChange={handleClientFilterChange} options={['פעיל', 'לא פעיל']} placeholder={t('filter.status_all')} />
                                    <FilterInput label={t('clients.filter_client_id')} name="clientId" value={clientFilters.clientId} onChange={handleClientFilterChange} />
                                    <FilterSelect label={t('clients.filter_recruiter')} name="recruitingCoordinator" value={clientFilters.recruitingCoordinator} onChange={handleClientFilterChange} options={filterOptions.recruitingCoordinators} placeholder={t('filter.status_all')} />
                                    <FilterInput label={t('clients.filter_creation_date_from')} name="creationDateFrom" value={clientFilters.creationDateFrom} onChange={handleClientFilterChange} type="date" />
                                    <FilterInput label={t('clients.filter_creation_date_to')} name="creationDateTo" value={clientFilters.creationDateTo} onChange={handleClientFilterChange} type="date" />
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button onClick={handleResetClientFilters} className="text-sm font-semibold text-text-muted hover:text-primary-600 flex items-center gap-1.5"><ArrowPathIcon className="w-4 h-4" /> {t('clients.reset_filters')}</button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-semibold text-text-muted">{t('clients.total_clients', {count: sortedAndFilteredClients.length})}</span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                                <button onClick={() => setClientViewMode('table')} title={t('candidates.view_list')} className={`p-1.5 rounded-md ${clientViewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                                <button onClick={() => setClientViewMode('grid')} title={t('candidates.view_grid')} className={`p-1.5 rounded-md ${clientViewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                            </div>
                            <div className="relative" ref={clientSettingsRef}>
                                <button onClick={() => setIsClientSettingsOpen(!isClientSettingsOpen)} title={t('candidates.customize_columns')} className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isClientSettingsOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                    <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {allClientColumns.map(column => (
                                        <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                        <input type="checkbox" checked={visibleClientColumns.includes(column.id)} onChange={() => handleClientColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                        {column.header}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <main className="flex-1 overflow-y-auto">
                        {sortedAndFilteredClients.length > 0 ? (
                            clientViewMode === 'table' ? (
                                <div className="overflow-x-auto border border-border-default rounded-lg">
                                    <table className="w-full text-sm text-right min-w-[800px]">
                                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                            <tr>
                                                {visibleClientColumns.map((colId, index) => {
                                                    const col = allClientColumns.find(c => c.id === colId);
                                                    if (!col) return null;
                                                    return (
                                                        <th key={col.id} draggable onDragStart={() => handleClientDragStart(index, col.id)} onDragEnter={() => handleClientDragEnter(index)} onDragEnd={handleClientDragEnd} onDrop={handleClientDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestClientSort(col.id)} className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingClientColumn === col.id ? 'dragging' : ''}`}>
                                                            <div className="flex items-center gap-1">{col.header} {getClientSortIndicator(col.id)}</div>
                                                        </th>
                                                    );
                                                })}
                                                <th className="p-4">{t('clients.col_actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle">
                                        {sortedAndFilteredClients.map(client => (
                                            <tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)} className="hover:bg-bg-hover cursor-pointer group">
                                                {visibleClientColumns.map(colId => (
                                                    <td key={colId} className="p-4 text-text-muted">{renderClientCell(client, colId)}</td>
                                                ))}
                                                <td className="p-4">
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => navigate(`/clients/edit/${client.id}`)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"><PencilIcon className="w-4 h-4"/></button>
                                                        <button onClick={() => alert('Deleting...')} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {sortedAndFilteredClients.map(client => (
                                        <ClientCard key={client.id} client={client} onNavigate={() => navigate(`/clients/${client.id}`)} />
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="text-center py-10 bg-bg-subtle rounded-lg border border-dashed border-border-default">
                                <BuildingOffice2Icon className="w-12 h-12 text-text-subtle mx-auto mb-3" />
                                <p className="text-text-muted font-semibold">{t('clients.no_clients')}</p>
                            </div>
                        )}
                    </main>
                </>
            )}

            {activeTab === 'contacts' && (
                <>
                    <div className="bg-bg-subtle/70 rounded-xl border border-border-default mb-4 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">חיפוש חופשי</label>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input type="text" placeholder={t('clients.search_placeholder_contacts')} name="searchTerm" value={contactFilters.searchTerm} onChange={handleContactFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm" />
                                </div>
                            </div>
                             <FilterSelect label={t('clients.col_name')} name="clientName" value={contactFilters.clientName} onChange={handleContactFilterChange} options={filterOptions.contactClients} placeholder={t('filter.status_all')} />
                             <FilterSelect label={t('clients.filter_status')} name="status" value={contactFilters.status} onChange={handleContactFilterChange} options={['active', 'inactive']} placeholder={t('filter.status_all')} />
                        </div>
                    </div>
                     <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-semibold text-text-muted">{t('clients.total_contacts', {count: sortedAndFilteredContacts.length})}</span>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                                <button onClick={() => setContactViewMode('table')} title={t('candidates.view_list')} className={`p-1.5 rounded-md ${contactViewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                                <button onClick={() => setContactViewMode('grid')} title={t('candidates.view_grid')} className={`p-1.5 rounded-md ${contactViewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                            </div>
                            <div className="relative" ref={contactSettingsRef}>
                                <button onClick={() => setIsContactSettingsOpen(!isContactSettingsOpen)} title={t('candidates.customize_columns')} className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isContactSettingsOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                    <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {allContactColumns.map(column => (
                                        <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                        <input type="checkbox" checked={visibleContactColumns.includes(column.id)} onChange={() => handleContactColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                        {column.header}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <main className="flex-1 overflow-y-auto">
                       {contactViewMode === 'table' ? (
                            <div className="overflow-x-auto bg-bg-card rounded-lg border border-border-default">
                                <table className="w-full text-sm text-right min-w-[800px]">
                                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                        <tr>
                                            <th className="p-4 w-12"><input type="checkbox" onChange={handleSelectAllContacts} checked={areAllContactsSelected} className="h-4 w-4 rounded border-border-default" /></th>
                                            {visibleContactColumns.map((colId, index) => {
                                                const col = allContactColumns.find(c => c.id === colId);
                                                if (!col) return null;
                                                return (
                                                    <th key={col.id} draggable onDragStart={() => handleContactDragStart(index, col.id)} onDragEnter={() => handleContactDragEnter(index)} onDragEnd={handleContactDragEnd} onDrop={handleContactDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestContactSort(col.id)} className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingContactColumn === col.id ? 'dragging' : ''}`}>{col.header} {getContactSortIndicator(col.id)}</th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                    {sortedAndFilteredContacts.map(contact => (
                                        <tr key={contact.id} className={`group transition-colors ${selectedContactIds.has(contact.id) ? 'bg-primary-50' : 'hover:bg-bg-hover'}`}>
                                            <td className="p-4"><input type="checkbox" checked={selectedContactIds.has(contact.id)} onChange={() => handleSelectContact(contact.id)} className="h-4 w-4 rounded border-border-default" /></td>
                                            {visibleContactColumns.map(col => <td key={col} className="p-4 text-text-muted">{renderContactCell(contact, col)}</td>)}
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                       ) : (
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {sortedAndFilteredContacts.map(contact => (
                                    <ContactCard key={contact.id} contact={contact} onNavigate={() => navigate(`/clients/${contact.clientId}/contacts/${contact.id}`)} />
                                ))}
                            </div>
                       )}
                    </main>
                </>
            )}

            {selectedContactIds.size > 0 && activeTab === 'contacts' && (
                <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
                    <div className="w-full max-w-xl mx-auto pointer-events-auto">
                        <div className="bg-bg-card rounded-xl shadow-2xl border border-border-default px-4 py-2 animate-slide-up flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold">{t('contacts.selected_count', {count: selectedContactIds.size})}</span>
                                <button onClick={() => setSelectedContactIds(new Set())} className="text-sm font-semibold text-primary-600 hover:underline">{t('contacts.clear_selection')}</button>
                            </div>
                            <div className="flex items-center gap-2 font-semibold text-sm">
                                <button onClick={() => console.log("Bulk SMS:", selectedContactIds)} className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('contacts.bulk_sms')}</button>
                                <button onClick={() => console.log("Bulk Email:", selectedContactIds)} className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('contacts.bulk_email')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientsListView;
