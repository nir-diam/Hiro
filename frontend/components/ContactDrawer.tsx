
import React, { useState } from 'react';
import Drawer from './Drawer';
import { 
    UserIcon, PhoneIcon, EnvelopeIcon, BriefcaseIcon, 
    CalendarDaysIcon, ChatBubbleBottomCenterTextIcon, 
    CheckCircleIcon, ClockIcon, PlusIcon, ArrowRightIcon, WhatsappIcon
} from './Icons';
import { Contact, Client } from './ClientsListView';
import { MessageModalConfig } from '../hooks/useUIState';

interface ContactDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    contact: Contact | null;
    onStartProcess: (type: 'sales' | 'retention') => void;
    openMessageModal: (config: MessageModalConfig) => void;
}

const ContactDrawer: React.FC<ContactDrawerProps> = ({ isOpen, onClose, contact, onStartProcess, openMessageModal }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'processes' | 'history'>('overview');

    if (!contact) return null;

    // Mock History Data
    const history = [
        { id: 1, type: 'call', date: '2025-05-28 10:00', content: 'שיחת היכרות ראשונית', user: 'אני' },
        { id: 2, type: 'email', date: '2025-05-25 14:30', content: 'נשלחה הצעת מחיר לשירותי השמה', user: 'מערכת' },
        { id: 3, type: 'note', date: '2025-05-20 09:15', content: 'מתעניין בעיקר בגיוס אנשי מכירות', user: 'דנה כהן' },
    ];

    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === id 
                ? 'border-primary-500 text-primary-600 bg-primary-50/30' 
                : 'border-transparent text-text-muted hover:bg-bg-subtle'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <Drawer 
            isOpen={isOpen} 
            onClose={onClose} 
            title="כרטיס איש קשר"
            footer={
                <div className="flex gap-3 w-full">
                    <button onClick={onClose} className="flex-1 py-2 rounded-xl text-text-muted font-bold hover:bg-bg-hover transition-colors">
                        סגור
                    </button>
                    <button className="flex-1 py-2 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition-colors shadow-md">
                        שמור שינויים
                    </button>
                </div>
            }
        >
            <div className="flex flex-col h-full">
                {/* Header Profile */}
                <div className="flex items-center gap-4 mb-6 p-4 bg-bg-subtle rounded-2xl border border-border-default">
                    <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-2xl font-bold border-2 border-white shadow-sm relative">
                        {contact.avatar || contact.name.charAt(0)}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-text-muted overflow-hidden">
                            {contact.clientLogo ? (
                                <img src={contact.clientLogo} alt={contact.clientName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                contact.clientName.substring(0, 2)
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-text-default">{contact.name}</h3>
                        <p className="text-sm text-primary-600 font-semibold">{contact.role}</p>
                        <p className="text-xs text-text-muted mt-1">{contact.clientName}</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2 mb-6">
                    <a href={`tel:${contact.phone}`} className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-green-100 transition-colors border border-green-200">
                        <PhoneIcon className="w-4 h-4"/> חייג
                    </a>
                    <button 
                        onClick={() => openMessageModal({ mode: 'email', candidateName: contact.name, candidatePhone: contact.phone })}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                        <EnvelopeIcon className="w-4 h-4"/> מייל
                    </button>
                    <button 
                        onClick={() => openMessageModal({ mode: 'sms', candidateName: contact.name, candidatePhone: contact.phone })}
                        className="flex-1 py-2 bg-purple-50 text-purple-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-200"
                    >
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> SMS
                    </button>
                    <button 
                        onClick={() => openMessageModal({ mode: 'whatsapp', candidateName: contact.name, candidatePhone: contact.phone })}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                        <WhatsappIcon className="w-4 h-4"/> וואטסאפ
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border-default mb-4">
                    <TabButton id="overview" label="פרטים" icon={<UserIcon className="w-4 h-4"/>} />
                    <TabButton id="processes" label="תהליכים" icon={<BriefcaseIcon className="w-4 h-4"/>} />
                    <TabButton id="history" label="פעילות" icon={<ClockIcon className="w-4 h-4"/>} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">טלפון</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{contact.phone}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">אימייל</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{contact.email}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">תפקיד</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{contact.role}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">קשר אחרון</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{contact.lastContact}</div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'processes' && (
                        <div className="space-y-4">
                            <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
                                <h4 className="font-bold text-primary-900 mb-2">פתיחת תהליך חדש</h4>
                                <p className="text-xs text-primary-700 mb-4">הוסף את איש הקשר ללוח המשימות (Kanban) לניהול תהליך ממוקד.</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => onStartProcess('sales')}
                                        className="flex items-center justify-center gap-2 bg-white text-primary-700 py-2 rounded-lg border border-primary-200 hover:border-primary-400 font-bold text-xs shadow-sm transition-all"
                                    >
                                        <PlusIcon className="w-3 h-3"/> תהליך מכירה
                                    </button>
                                    <button 
                                        onClick={() => onStartProcess('retention')}
                                        className="flex items-center justify-center gap-2 bg-white text-primary-700 py-2 rounded-lg border border-primary-200 hover:border-primary-400 font-bold text-xs shadow-sm transition-all"
                                    >
                                        <PlusIcon className="w-3 h-3"/> תהליך שימור
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-text-muted">תהליכים פעילים</h4>
                                {/* Mock Active Process */}
                                <div className="bg-white border border-border-default p-3 rounded-xl flex justify-between items-center shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-10 bg-yellow-400 rounded-full"></div>
                                        <div>
                                            <p className="font-bold text-sm text-text-default">תהליך מכירה</p>
                                            <p className="text-xs text-text-muted">סטטוס: משא ומתן</p>
                                        </div>
                                    </div>
                                    <button className="text-text-subtle hover:text-primary-600">
                                        <ArrowRightIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="relative border-r border-border-default mr-3 space-y-6">
                            {history.map((item, idx) => (
                                <div key={item.id} className="relative pr-6">
                                    <div className="absolute top-1 -right-1.5 w-3 h-3 bg-bg-card border-2 border-primary-500 rounded-full"></div>
                                    <div className="text-xs text-text-muted mb-1">{item.date} • {item.user}</div>
                                    <div className="bg-bg-subtle p-3 rounded-lg rounded-tr-none text-sm text-text-default border border-border-default">
                                        {item.content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>
        </Drawer>
    );
};

export default ContactDrawer;
