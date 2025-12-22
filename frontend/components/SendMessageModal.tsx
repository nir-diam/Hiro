import React, { useState, useEffect, useId } from 'react';
import { XMarkIcon, WhatsappIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon } from './Icons';

type MessageMode = 'whatsapp' | 'sms' | 'email';

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: MessageMode;
  candidateName: string;
  candidatePhone: string;
}

const modalConfig = {
    whatsapp: {
        title: "שליחת WhatsApp",
        buttonText: "שליחת WhatsApp",
        buttonIcon: <WhatsappIcon className="w-5 h-5" />,
        buttonClass: "bg-[#25D366] hover:bg-[#128C7E]",
        showSubject: false,
    },
    sms: {
        title: "שליחת SMS",
        buttonText: "שליחת SMS",
        buttonIcon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />,
        buttonClass: "bg-primary-600 hover:bg-primary-700",
        showSubject: false,
    },
    email: {
        title: "שליחת מייל",
        buttonText: "שליחת מייל",
        buttonIcon: <EnvelopeIcon className="w-5 h-5" />,
        buttonClass: "bg-secondary-600 hover:bg-secondary-700",
        showSubject: true,
    }
};

const SendMessageModal: React.FC<SendMessageModalProps> = ({ isOpen, onClose, mode, candidateName, candidatePhone }) => {
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    const titleId = useId();
    const config = modalConfig[mode];

    useEffect(() => {
        if (isOpen) {
            setContent('');
            setSubject('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log(`Sending ${mode} to ${candidateName}`, { subject, content });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()} style={{ animation: 'modalFadeIn 0.2s ease-out' }}>
                <form onSubmit={handleSubmit}>
                    <header className="flex items-center justify-between p-4 border-b border-border-default">
                        <h2 id={titleId} className="text-xl font-bold text-text-default">{config.title}</h2>
                        <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>
                    <main className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">טלפון של מועמד:</label>
                                <input type="text" value={candidatePhone} disabled className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">תבנית שמורה:</label>
                                <select className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option>---</option>
                                    <option>תבנית אישור הגעה</option>
                                    <option>תבנית דחייה</option>
                                </select>
                            </div>
                        </div>
                        <div>
                             <label className="block text-sm font-semibold text-text-muted mb-1.5">משרה מקושרת:</label>
                            <select className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                <option>---</option>
                                <option>מנהל/ת שיווק דיגיטלי (בזק)</option>
                                <option>מפתח/ת Fullstack (Wix)</option>
                            </select>
                        </div>
                         {config.showSubject && (
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">נושא:</label>
                                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                            </div>
                        )}
                        <div>
                             <label className="block text-sm font-semibold text-text-muted mb-1.5">תוכן ההודעה:</label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                rows={8}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                            ></textarea>
                            <div className="text-xs text-text-subtle text-left mt-1">{content.length} / 5000</div>
                        </div>
                    </main>
                     <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
                        <button type="submit" className={`flex items-center gap-2 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm ${config.buttonClass}`}>
                            {config.buttonIcon}
                            <span>{config.buttonText}</span>
                        </button>
                    </footer>
                </form>
                <style>{`@keyframes modalFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
            </div>
        </div>
    );
};

export default SendMessageModal;
