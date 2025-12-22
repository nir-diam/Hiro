
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockContacts } from './ClientContactsTab'; // Assuming mockContacts is exported
import { 
    PhoneIcon, EnvelopeIcon, LinkedInIcon, WhatsappIcon, ChatBubbleBottomCenterTextIcon,
    PencilIcon, BriefcaseIcon, CalendarDaysIcon
} from './Icons';
import ContactDetailsTab from './ContactDetailsTab';
import { MessageModalConfig } from '../hooks/useUIState';

type Tab = 'details' | 'events' | 'jobs' | 'communications';

const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    { id: 'details', label: 'פרטים אישיים', icon: <PencilIcon className="w-5 h-5" /> },
    { id: 'events', label: 'אירועים', icon: <CalendarDaysIcon className="w-5 h-5" /> },
    { id: 'jobs', label: 'משרות משויכות', icon: <BriefcaseIcon className="w-5 h-5" /> },
];

const SocialButton: React.FC<{ children: React.ReactNode, onClick?: () => void, title?: string, href?: string }> = ({ children, onClick, title, href }) => {
    const commonProps = {
        title,
        className: "w-10 h-10 flex items-center justify-center bg-primary-100/70 text-primary-600 rounded-lg hover:bg-primary-200 transition-colors"
    };
    if (href) {
        return <a href={href} {...commonProps}>{children}</a>
    }
    return <button onClick={onClick} {...commonProps}>{children}</button>;
};

interface ContactProfileViewProps {
    openMessageModal: (config: MessageModalConfig) => void;
}

const ContactProfileView: React.FC<ContactProfileViewProps> = ({ openMessageModal }) => {
    const { contactId } = useParams<{ contactId: string }>();
    const [activeTab, setActiveTab] = useState<Tab>('details');

    const contact = mockContacts.find(c => c.id === Number(contactId));

    if (!contact) {
        return <div className="text-center p-8">איש קשר לא נמצא.</div>;
    }

    const [formData, setFormData] = useState(contact);

    const handleFormChange = (updatedData: any) => {
        setFormData(updatedData);
    };

    const handleActionClick = (mode: 'email' | 'sms' | 'whatsapp') => {
        openMessageModal({
            mode,
            candidateName: contact.name,
            candidatePhone: contact.mobilePhone || contact.phone,
        });
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return <ContactDetailsTab formData={formData} onFormChange={handleFormChange} />;
            case 'events':
                return <div className="text-center p-8 text-text-muted">אין אירועים להצגה.</div>;
            case 'jobs':
                 return <div className="text-center p-8 text-text-muted">אין משרות משויכות.</div>;
            default:
                return null;
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="bg-bg-card rounded-2xl shadow-sm p-6">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">{contact.name}</h1>
                        <p className="text-text-muted">{contact.role} at {contact.email.split('@')[1]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <SocialButton href={`tel:${contact.mobilePhone || contact.phone}`} title="Phone"><PhoneIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton onClick={() => handleActionClick('email')} title="Send Email"><EnvelopeIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton onClick={() => handleActionClick('sms')} title="Send SMS"><ChatBubbleBottomCenterTextIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton href={contact.linkedin} title="LinkedIn Profile"><LinkedInIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton onClick={() => handleActionClick('whatsapp')} title="Send WhatsApp"><WhatsappIcon className="w-5 h-5" /></SocialButton>
                    </div>
                </div>
            </div>

            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto">
                    {tabs.map(tab => (
                        <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${activeTab === tab.id ? 'border-b-2 border-primary-500 text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <main>
                {renderContent()}
            </main>
        </div>
    );
};

export default ContactProfileView;
