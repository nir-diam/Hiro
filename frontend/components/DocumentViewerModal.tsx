
import React, { useEffect, useRef } from 'react';
import { XMarkIcon, ArrowTopRightOnSquareIcon, PrinterIcon } from './Icons';

interface DocumentViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    documentTitle: string;
    documentUrl?: string; // Optional real URL, if missing use mock
    clientName: string;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ isOpen, onClose, documentTitle, documentUrl, clientName }) => {
    const modalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // --- MOCK PDF CONTENT ---
    // Simulating a contract view if no URL is provided
    const MockContractView = () => (
        <div className="bg-white p-8 md:p-12 shadow-inner overflow-y-auto h-full text-black font-serif relative" dir="rtl">
            <div className="max-w-3xl mx-auto space-y-6">
                 {/* Header */}
                <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-8">
                     <div className="text-2xl font-bold tracking-tight">מימד אנושי</div>
                     <div className="text-sm text-gray-500">השמה עם נגיעה אישית</div>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold underline">הסכם התקשרות - {new Date().getFullYear()}</h1>
                </div>
                
                <p className="text-sm"><strong>תאריך:</strong> {new Date().toLocaleDateString('he-IL')}</p>
                
                <p className="text-sm">
                    שנערך ונחתם בין <strong>{clientName}</strong> (להלן "החברה") ח.פ 514359603
                    <br/>
                    לבין <strong>מימד אנושי בע"מ</strong> ח.פ 037042769 (להלן "חברת ההשמה")
                </p>

                <h3 className="font-bold text-lg mt-6">1. כללי</h3>
                <p className="text-sm leading-relaxed">
                    1.1. הואיל והוסכם בין הצדדים כי מימד אנושי תספק שירותי השמה לחברה.<br/>
                    1.2. חברת ההשמה תבצע מיון קפדני ותפנה לחברה מועמדים/ות מתאימים/ות עפ"י דרישות ומקיומות של החברה.<br/>
                    1.3. עם השלמת ביצוע ההשמה לחברה, חברת ההשמה מסיימת את הקשר עם המועמד והופך להיות עובד מן המניין של החברה החל מיום עבודתו/ה הראשון.
                </p>

                <h3 className="font-bold text-lg mt-6">2. עמלת השמה</h3>
                <p className="text-sm leading-relaxed">
                    2.1. לא יהיה כלל יחסי עובד מעביד או התחייבויות כלפי העובד/ת מצד חברת ההשמה כלפי העובד לא בתקופת הניסיון ולא בכלל.<br/>
                    2.2. ביטוח חבות מעבידים יהיה באחריות החברה המעסיקה.<br/>
                    2.3. מועמד ייחשב 'מוכר' לחברה אם נוצר קשר טלפוני בין החברה למועמד או שנשלח על ידי חברת השמה אחרת בחצי השנה שקדמה לשליחת קורות חיים. במקרה כזה, חברת ההשמה לא תהיה זכאית לתשלום עבור הפנייתו.<br/>
                    2.4. תמורת השירות עבור מיון, אבחון וגיוס <span className="bg-yellow-200 px-1">ישולם למימד אנושי סך של 85% משכר הברוטו</span> של העובד עבור חודש עבודה אחד לאחר שהעובד השלים 30 ימים מיום עבודתו הראשון של העובד אצל החברה.
                </p>

                <h3 className="font-bold text-lg mt-6">3. תנאי תשלום</h3>
                <p className="text-sm leading-relaxed">
                    3.1. לכל תשלום יתווסף מע"מ כחוק.<br/>
                    3.2. אופן התשלום: <span className="font-bold underline">שוטף + 30 יום</span> מיום הפקת החשבונית.<br/>
                    3.3. למען הסר ספק, עובד שייקלט דרכנו וסיים את עבודתו בחברה תוך פחות מ 30 ימים לא נקבל עבורו תשלום כלל וכלל.
                </p>
                
                 <div className="mt-12 flex justify-between px-10">
                    <div className="text-center">
                        <div className="border-b border-black w-40 mb-2 h-8"></div>
                        <span>חתימת החברה</span>
                    </div>
                     <div className="text-center relative">
                        {/* Fake Signature */}
                        <div className="absolute -top-4 left-0 w-40 h-16 opacity-80 pointer-events-none transform -rotate-3 text-blue-800 font-cursive text-2xl">
                             מימד אנושי
                        </div>
                        <div className="border-b border-black w-40 mb-2 h-8"></div>
                        <span>חתימת מימד אנושי</span>
                    </div>
                </div>
                
                <div className="text-center text-xs text-gray-400 mt-20">
                    עמוד 1 מתוך 1 | מסמך זה הופק דיגיטלית באמצעות מערכת Hiro
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex flex-col animate-fade-in" onClick={onClose}>
            {/* Toolbar */}
            <div className="bg-white border-b border-border-default px-6 py-4 flex justify-between items-center flex-shrink-0 shadow-md">
                <div className="flex items-center gap-4 text-text-default">
                    <h2 className="text-xl font-bold">{documentTitle}</h2>
                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-semibold border border-gray-200 hidden sm:inline-block">
                        לקוח: {clientName}
                    </span>
                </div>
                
                <div className="flex items-center gap-3">
                     <button 
                        onClick={() => window.print()}
                        className="hidden sm:flex items-center gap-2 px-4 py-2 bg-bg-subtle text-text-default rounded-lg hover:bg-bg-hover transition font-semibold text-sm"
                    >
                        <PrinterIcon className="w-5 h-5" />
                        הדפס
                    </button>
                     <a 
                        href={documentUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-semibold text-sm"
                    >
                        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">פתח בחלון חדש</span>
                         <span className="sm:hidden">פתח</span>
                    </a>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Document Viewer Container */}
            <div className="flex-grow bg-gray-200 overflow-hidden flex justify-center p-4 md:p-8" onClick={(e) => e.stopPropagation()}>
                <div 
                    ref={modalRef}
                    className="bg-white shadow-2xl w-full max-w-5xl h-full rounded-sm overflow-hidden border border-gray-300"
                >
                    {documentUrl ? (
                         <iframe 
                            src={documentUrl} 
                            className="w-full h-full" 
                            title={documentTitle}
                        />
                    ) : (
                        <MockContractView />
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocumentViewerModal;
