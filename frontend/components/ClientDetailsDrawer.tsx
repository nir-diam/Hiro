import React, { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    XMarkIcon, BuildingOffice2Icon, CalendarDaysIcon, UserGroupIcon, MapPinIcon, 
    ArrowLeftIcon, CheckCircleIcon, PhoneIcon, EnvelopeIcon, BriefcaseIcon,
    ClipboardDocumentCheckIcon
} from './Icons';
import { Client } from './ClientsListView';
import { useLanguage } from '../context/LanguageContext';

// --- MOCK DATA ---
const mockClientTasks = [
];

const mockClientContacts = [
];

// --- COMPONENTS ---

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
            isActive ? 'border-primary-500 text-primary-600 bg-primary-50/30' : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-subtle'
        }`}
    >
        {icon}
        <span className="hidden sm:inline">{title}</span>
    </button>
);

const DetailsContent: React.FC<{ client: Client }> = ({ client }) => {
    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Badges Card */}
            <div className="bg-gradient-to-br from-white to-bg-subtle p-5 rounded-2xl border border-border-default shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-white border border-border-default rounded-2xl shadow-sm text-primary-600">
                            <BuildingOffice2Icon className="w-7 h-7"/>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-text-default leading-tight line-clamp-2">{client.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-bold text-primary-700">{client.industry}</span>
                                <span className="w-1 h-1 rounded-full bg-border-default"></span>
                                <span className="text-xs text-text-muted flex items-center gap-1">
                                    <MapPinIcon className="w-3 h-3"/> {client.city}, {client.region}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">סטטוס</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <CheckCircleIcon className={`w-4 h-4 ${client.status === 'פעיל' ? 'text-green-500' : 'text-amber-500'}`}/>
                             <span className="truncate">{client.status}</span>
                         </div>
                    </div>
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">משרות פתוחות</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <BriefcaseIcon className="w-4 h-4 text-blue-500"/>
                             <span>{client.openJobs}</span>
                         </div>
                    </div>
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm col-span-2 sm:col-span-1">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">מנהל תיק</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <UserGroupIcon className="w-4 h-4 text-purple-500"/>
                             <span className="truncate">{client.accountManager}</span>
                         </div>
                    </div>
                </div>
            </div>

            {/* Contact Info */}
            <div className="bg-white p-5 rounded-2xl border border-border-default shadow-sm space-y-4">
                <h4 className="font-bold text-text-default text-sm flex items-center gap-2">
                    <PhoneIcon className="w-5 h-5 text-primary-500"/>
                    פרטי התקשרות ראשיים
                </h4>
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">איש קשר:</span>
                        <span className="font-medium text-text-default">{client.contactPerson}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">טלפון:</span>
                        <span className="font-medium text-text-default" dir="ltr">{client.phone}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">אימייל:</span>
                        <span className="font-medium text-text-default">{client.email}</span>
                    </div>
                </div>
            </div>
            
            {/* Pipeline Info */}
            <div className="bg-white p-5 rounded-2xl border border-border-default shadow-sm space-y-4">
                <h4 className="font-bold text-text-default text-sm flex items-center gap-2">
                    <BriefcaseIcon className="w-5 h-5 text-primary-500"/>
                    סטטוס תהליך
                </h4>
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">שלב נוכחי:</span>
                        <span className="font-medium text-text-default bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md">{client.pipelineStage}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">שווי פייפליין:</span>
                        <span className="font-bold text-green-600">₪{client.pipelineValue.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-text-muted">קשר אחרון:</span>
                        <span className={`font-medium ${client.daysSinceLastContact > 14 ? 'text-red-500' : 'text-text-default'}`}>
                            לפני {client.daysSinceLastContact} ימים
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TasksContent: React.FC<{ client: Client }> = ({ client }) => (
    <div className="space-y-4 animate-fade-in">
        {mockClientTasks.map((task) => (
            <div key={task.id} className="bg-white p-4 rounded-xl border border-border-default shadow-sm hover:shadow-md transition-shadow flex items-start gap-3">
                <div className="mt-1">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        task.status === 'completed' ? 'bg-green-500 border-green-500' :
                        task.status === 'overdue' ? 'border-red-500' : 'border-gray-300'
                    }`}>
                        {task.status === 'completed' && <CheckCircleIcon className="w-3 h-3 text-white" />}
                    </div>
                </div>
                <div className="flex-1">
                    <h4 className={`text-sm font-bold ${task.status === 'completed' ? 'text-text-muted line-through' : 'text-text-default'}`}>
                        {task.title}
                    </h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                            <UserGroupIcon className="w-3.5 h-3.5" />
                            {task.assignee}
                        </span>
                        <span className={`flex items-center gap-1 ${task.status === 'overdue' ? 'text-red-500 font-medium' : ''}`}>
                            <CalendarDaysIcon className="w-3.5 h-3.5" />
                            {new Date(task.dueDate).toLocaleDateString('he-IL')}
                        </span>
                    </div>
                </div>
            </div>
        ))}
        <button className="w-full py-3 text-sm font-bold text-primary-600 bg-white border-2 border-dashed border-primary-200 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all flex items-center justify-center gap-2">
            <ClipboardDocumentCheckIcon className="w-4 h-4" />
            צפה בכל המשימות
        </button>
    </div>
);

const ContactsContent: React.FC<{ client: Client }> = ({ client }) => (
    <div className="space-y-3 animate-fade-in">
        {mockClientContacts.map((contact) => (
            <div key={contact.id} className="bg-white p-4 rounded-xl border border-border-default shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm border border-primary-200">
                    {contact.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-text-default text-sm truncate">{contact.name}</h4>
                    <p className="text-xs text-primary-600 font-medium">{contact.role}</p>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 rounded-lg bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-primary-600 transition-colors">
                        <PhoneIcon className="w-4 h-4" />
                    </button>
                    <button className="p-2 rounded-lg bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-primary-600 transition-colors">
                        <EnvelopeIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        ))}
        <button className="w-full py-3 text-sm font-bold text-primary-600 bg-white border-2 border-dashed border-primary-200 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all flex items-center justify-center gap-2">
            <UserGroupIcon className="w-4 h-4" />
            צפה בכל אנשי הקשר
        </button>
    </div>
);


interface ClientDetailsDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
}

const ClientDetailsDrawer: React.FC<ClientDetailsDrawerProps> = ({ client, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'tasks' | 'contacts'>('details');
  const titleId = useId();
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details'); // Reset to details tab when opened
    }
  }, [isOpen]);
  
  const handleViewFullProfile = (clientId: number) => {
    onClose();
    navigate(`/clients/${clientId}`);
  };

  if (!isOpen || !client) return null;

  const renderContent = () => {
    switch(activeTab) {
      case 'details': return <DetailsContent client={client} />;
      case 'tasks': return <TasksContent client={client} />;
      case 'contacts': return <ContactsContent client={client} />;
      default: return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-default shadow-2xl flex flex-col transform transition-transform border-r border-border-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideInFromLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <header className="px-5 py-4 border-b border-border-default flex items-center justify-between flex-shrink-0 bg-white z-10 shadow-sm">
          <div className="flex flex-col">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">מבט מהיר</span>
              <h2 id={titleId} className="text-lg font-black text-text-default truncate max-w-[250px] leading-none">{client.name}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-default transition-all"
            aria-label="סגור"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>
        
        <nav className="flex items-center border-b border-border-default flex-shrink-0 bg-white px-2">
            <TabButton title="פרטים" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} icon={<BuildingOffice2Icon className="w-4 h-4"/>} />
            <TabButton title="משימות" isActive={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<ClipboardDocumentCheckIcon className="w-4 h-4"/>} />
            <TabButton title="אנשי קשר" isActive={activeTab === 'contacts'} onClick={() => setActiveTab('contacts')} icon={<UserGroupIcon className="w-4 h-4"/>} />
        </nav>

        <main className="flex-1 overflow-y-auto p-5 custom-scrollbar relative bg-bg-subtle/30">
          {renderContent()}
        </main>

        <footer className="p-4 bg-white border-t border-border-default flex-shrink-0 shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.05)] z-10">
            <button 
                onClick={() => handleViewFullProfile(client.id)} 
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-[0.98] group"
            >
                <span>ניהול תיק לקוח מלא</span>
                <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
        </footer>
        <style>{`
            @keyframes slideInFromLeft {
                from { transform: translateX(-100%); opacity: 0.5; }
                to { transform: translateX(0); opacity: 1; }
            }
            .animate-fade-in {
                animation: fadeIn 0.3s ease-out forwards;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `}</style>
      </div>
    </div>
  );
};

export default ClientDetailsDrawer;
