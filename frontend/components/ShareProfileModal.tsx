
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, LinkIcon, WhatsappIcon, EnvelopeIcon, CheckCircleIcon, GlobeAmericasIcon, EyeIcon, LockClosedIcon, ArrowTopRightOnSquareIcon } from './Icons';

interface ShareProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidate: {
        name: string;
        title: string;
        image: string;
        summary: string;
    };
}

const ShareProfileModal: React.FC<ShareProfileModalProps> = ({ isOpen, onClose, candidate }) => {
    const navigate = useNavigate();
    const [isPublic, setIsPublic] = useState(true);
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [allowDownload, setAllowDownload] = useState(true);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;
    
    // Construct the URL dynamically based on current location to avoid hardcoded domain issues
    const baseUrl = window.location.href.split('#')[0];
    const slug = candidate.name.toLowerCase().replace(/\s+/g, '-');
    // For display, we might want a cleaner URL if we had a real domain, but for functionality:
    const publicLink = `${baseUrl}#/p/${slug}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(publicLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenLink = () => {
        // Navigate internally to avoid blob URL issues in new tab
        navigate(`/p/${slug}`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden transform transition-all scale-100" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-gray-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">שיתוף פרופיל מקצועי</h2>
                        <p className="text-sm text-gray-500 mt-1">נהל כיצד המעסיקים יראו וימצאו אותך ברשת</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="p-0 flex flex-col md:flex-row h-full overflow-hidden">
                    
                    {/* Left Side: Settings & Actions */}
                    <div className="w-full md:w-1/2 p-6 flex flex-col gap-6 border-l border-border-default order-2 md:order-1">
                        
                        {/* Privacy Controls */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">הגדרות חשיפה</h3>
                            
                            <label className="flex items-start gap-3 p-3 rounded-xl border border-border-default cursor-pointer hover:border-primary-300 transition-colors bg-white">
                                <div className={`mt-0.5 p-1 rounded-full ${isPublic ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                    <GlobeAmericasIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sm text-gray-900">נראה במנועי חיפוש (Google)</span>
                                        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">מאפשר למגייסים למצוא אותך בחיפוש שם בגוגל.</p>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 p-3 rounded-xl border border-border-default cursor-pointer hover:border-primary-300 transition-colors bg-white">
                                <div className={`mt-0.5 p-1 rounded-full ${showContactInfo ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {showContactInfo ? <EyeIcon className="w-5 h-5" /> : <LockClosedIcon className="w-5 h-5" />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-sm text-gray-900">הצג פרטי התקשרות</span>
                                        <input type="checkbox" checked={showContactInfo} onChange={e => setShowContactInfo(e.target.checked)} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">טלפון ומייל יהיו גלויים לכל מי שצופה בפרופיל.</p>
                                </div>
                            </label>
                        </div>

                        <hr className="border-border-default" />

                        {/* Share Actions */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3">שיתוף מהיר</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <button className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-border-default hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-all group">
                                    <WhatsappIcon className="w-6 h-6 text-green-500 group-hover:scale-110 transition-transform" />
                                    <span className="text-xs font-semibold">WhatsApp</span>
                                </button>
                                <button className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-border-default hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all group">
                                    <EnvelopeIcon className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
                                    <span className="text-xs font-semibold">Email</span>
                                </button>
                            </div>
                        </div>

                        {/* Copy Link */}
                        <div className="mt-auto">
                            <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-border-default">
                                <span className="text-xs text-gray-500 truncate flex-1 font-mono pl-2" dir="ltr">{publicLink}</span>
                                <div className="flex items-center gap-1">
                                     <button 
                                        onClick={handleOpenLink}
                                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-200 rounded-md transition-colors"
                                        title="פתח קישור (פרופיל ציבורי)"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={handleCopy}
                                        className={`text-sm font-bold px-4 py-2 rounded-md transition-all ${copied ? 'bg-green-500 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        {copied ? 'הועתק!' : 'העתק'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Previews */}
                    <div className="w-full md:w-1/2 bg-gray-50 p-6 flex flex-col gap-6 order-1 md:order-2 overflow-y-auto">
                        
                        {/* Google Result Preview */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">תצוגה בגוגל (SEO)</span>
                                {isPublic ? <CheckCircleIcon className="w-4 h-4 text-green-500" /> : <XMarkIcon className="w-4 h-4 text-gray-400" />}
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-border-default shadow-sm opacity-90">
                                <div className="text-sm text-[#202124] mb-1 flex items-center gap-1">
                                    <div className="w-4 h-4 bg-gray-200 rounded-full"></div>
                                    <span className="text-xs">Hiro.co.il</span>
                                    <span className="text-xs text-gray-400">› profile › {candidate.name}</span>
                                </div>
                                <h3 className="text-lg text-[#1a0dab] hover:underline cursor-pointer truncate font-medium">
                                    {candidate.name} - {candidate.title} | Hiro Professional Profile
                                </h3>
                                <p className="text-sm text-[#4d5156] line-clamp-2 mt-1">
                                    {candidate.summary.substring(0, 150)}... צפה בפרופיל המקצועי המלא, ניסיון תעסוקתי, השכלה ותיק עבודות.
                                </p>
                            </div>
                        </div>

                        {/* Social Card Preview */}
                        <div>
                             <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">תצוגה ברשתות חברתיות</span>
                             <div className="bg-white rounded-xl border border-border-default shadow-sm overflow-hidden">
                                 <div className="h-32 bg-gradient-to-r from-primary-600 to-primary-800 relative">
                                     <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                                     <div className="absolute bottom-0 left-4 transform translate-y-1/2">
                                         <img src={candidate.image} alt="Profile" className="w-16 h-16 rounded-full border-4 border-white shadow-md object-cover" />
                                     </div>
                                 </div>
                                 <div className="pt-10 pb-4 px-4">
                                     <h3 className="font-bold text-gray-900">{candidate.name}</h3>
                                     <p className="text-sm text-gray-500">{candidate.title}</p>
                                     <p className="text-xs text-gray-400 mt-2">Hiro • Professional Profile</p>
                                 </div>
                             </div>
                        </div>

                    </div>
                </main>
            </div>
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
        </div>
    );
};

export default ShareProfileModal;
