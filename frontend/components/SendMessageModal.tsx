
import React, { useState, useEffect, useId } from 'react';
import { XMarkIcon, WhatsappIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon, PaperClipIcon, PlusIcon, TrashIcon } from './Icons';

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
        allowAttachments: false,
    },
    sms: {
        title: "שליחת SMS",
        buttonText: "שליחת SMS",
        buttonIcon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />,
        buttonClass: "bg-primary-600 hover:bg-primary-700",
        showSubject: false,
        allowAttachments: false,
    },
    email: {
        title: "שליחת מייל",
        buttonText: "שליחת מייל",
        buttonIcon: <EnvelopeIcon className="w-5 h-5" />,
        buttonClass: "bg-secondary-600 hover:bg-secondary-700",
        showSubject: true,
        allowAttachments: true,
    }
};

const SendMessageModal: React.FC<SendMessageModalProps> = ({ isOpen, onClose, mode, candidateName, candidatePhone }) => {
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    
    // Changed from single string to array of strings for multiple attachments
    const [attachments, setAttachments] = useState<string[]>(['']); 
    
    const titleId = useId();
    const config = modalConfig[mode];

    useEffect(() => {
        if (isOpen) {
            setContent('');
            setSubject('');
            setAttachments(['']);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const validAttachments = attachments.filter(a => a !== '');
        console.log(`Sending ${mode} to ${candidateName}`, { subject, content, attachments: validAttachments });
        onClose();
    };

    const handleAttachmentChange = (index: number, value: string) => {
        const newAttachments = [...attachments];
        newAttachments[index] = value;
        setAttachments(newAttachments);
    };

    const addAttachmentRow = () => {
        setAttachments([...attachments, '']);
    };

    const removeAttachmentRow = (index: number) => {
        const newAttachments = attachments.filter((_, i) => i !== index);
        setAttachments(newAttachments.length > 0 ? newAttachments : ['']); // Keep at least one empty if user deletes all
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()} style={{ animation: 'modalFadeIn 0.2s ease-out' }}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
                    <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                        <h2 id={titleId} className="text-xl font-bold text-text-default">{config.title}</h2>
                        <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>
                    
                    <main className="p-6 space-y-4 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">נמען:</label>
                                <input type="text" value={`${candidateName} (${candidatePhone})`} disabled className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">תבנית שמורה:</label>
                                <select className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option>---</option>
                                    <option>תבנית אישור הגעה</option>
                                    <option>תבנית דחייה</option>
                                    <option>בקשה להמלצות</option>
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

                        {/* Multiple Attachments - Only for Email */}
                        {config.allowAttachments && (
                            <div className="bg-bg-subtle/30 p-3 rounded-xl border border-border-subtle">
                                <label className="block text-sm font-semibold text-text-muted mb-2">קבצים וצרופות:</label>
                                <div className="space-y-2">
                                    {attachments.map((att, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <PaperClipIcon className="w-5 h-5 text-text-muted flex-shrink-0"/>
                                            <select 
                                                value={att} 
                                                onChange={e => handleAttachmentChange(index, e.target.value)} 
                                                className="flex-grow bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                            >
                                                <option value="">בחר קובץ מהמאגר...</option>
                                                <option value="brochure">ברושור חברה 2025</option>
                                                <option value="pricing">מחירון שירותים</option>
                                                <option value="quote_101">הצעת מחיר QT-2025-001</option>
                                                <option value="cv_file">קורות חיים (Gideon_CV.pdf)</option>
                                            </select>
                                            
                                            {/* Only show delete button if there's more than 1 input or if this input has a value */}
                                            {(attachments.length > 1 || att !== '') && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => removeAttachmentRow(index)}
                                                    className="p-2 text-text-subtle hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button 
                                    type="button"
                                    onClick={addAttachmentRow}
                                    className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" />
                                    הוסף קובץ נוסף
                                </button>
                            </div>
                        )}
                        
                        {!config.allowAttachments && (
                             <div className="text-xs text-text-muted italic bg-bg-subtle/30 p-2 rounded text-center">
                                * שליחת קבצים אינה נתמכת בערוץ זה (WhatsApp/SMS). אנא השתמש במייל לשליחת מסמכים.
                            </div>
                        )}

                    </main>
                     <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
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
