
import React, { useState, useEffect } from 'react';
import { XMarkIcon, PhoneIcon, EnvelopeIcon, UserPlusIcon, BriefcaseIcon, AcademicCapIcon, SparklesIcon, WalletIcon, LanguageIcon, ChatBubbleBottomCenterTextIcon, WhatsappIcon, BookmarkIcon, BookmarkIconSolid, PaperAirplaneIcon, LockClosedIcon, CheckCircleIcon, ClockIcon } from './Icons';

// Mock jobs available for the recruiter (CRM or One-off poster)
const myOpenJobs = [
    { id: 101, title: 'מנהל/ת שיווק דיגיטלי' },
    { id: 102, title: 'מפתח/ת Fullstack' },
    { id: 103, title: 'רכז/ת גיוס' }
];

interface CandidatePoolProfileDrawerProps {
  candidate: any | null;
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (candidate: any) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
  isPurchased: boolean; // New prop
}

const TimelineItem: React.FC<{ title: string; company: string; duration: string; isLast?: boolean }> = ({ title, company, duration, isLast = false }) => (
    <div className="relative pl-8">
        {!isLast && <div className="absolute left-3 top-4 w-px h-full bg-border-default"></div>}
        <div className="flex items-center">
            <div className="absolute left-0 bg-bg-card z-10 p-1">
                <div className="w-4 h-4 bg-primary-500 rounded-full border-4 border-primary-100"></div>
            </div>
            <div>
                <h4 className="font-bold text-text-default">{title}</h4>
                <p className="text-sm text-text-muted">{company}</p>
                <p className="text-xs text-text-subtle mt-1">{duration}</p>
            </div>
        </div>
    </div>
);

const ActionButton: React.FC<{ children: React.ReactNode; href?: string; onClick?: () => void; title: string }> = ({ children, href, onClick, title }) => {
    const commonClasses = "w-12 h-12 flex items-center justify-center bg-primary-100/70 text-primary-600 rounded-full hover:bg-primary-200 transition-colors";
    if (href) {
        return <a href={href} title={title} className={commonClasses}>{children}</a>;
    }
    return <button onClick={onClick} title={title} className={commonClasses}>{children}</button>;
};


const CandidatePoolProfileDrawer: React.FC<CandidatePoolProfileDrawerProps> = ({ candidate, isOpen, onClose, onPurchase, isFavorite, onToggleFavorite, isPurchased }) => {
  // We use local state to handle the transition, but initialize/sync it with the prop
  const [isUnlocked, setIsUnlocked] = useState(isPurchased);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  
  // In a real app, 'inviteSent' would come from the backend prop 'candidate.hasInvite'. 
  // For now, we simulate it with local state that resets when candidate changes.
  const [inviteSent, setInviteSent] = useState(false);

  useEffect(() => {
      setIsUnlocked(isPurchased);
      // Reset invite state when opening a new candidate (unless we had real data)
      setInviteSent(false); 
      setSelectedJobId('');
  }, [isPurchased, candidate]); 

  if (!isOpen || !candidate) return null;

  // Anonymize name if not purchased
  const displayName = isUnlocked 
    ? candidate.name 
    : (() => {
        const parts = candidate.name.split(' ');
        return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : candidate.name;
    })();

  const handleSendInvite = () => {
      if (!selectedJobId) return;
      // Here you would implement the logic to send the invite API call
      setInviteSent(true);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-30 z-[60] transition-opacity"
      onClick={onClose}
    >
      <div 
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-card shadow-2xl flex flex-col transform transition-transform text-text-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideInFromLeft 0.3s forwards' }}
      >
        <header className="p-4 border-b border-border-default flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => onToggleFavorite(candidate.id)} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
            </button>
            <h2 className="text-lg font-bold text-text-default">פרופיל מועמד</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
                <img 
                    src={candidate.avatarUrl} 
                    alt="Candidate" 
                    className={`w-24 h-24 rounded-full object-cover border-4 border-bg-card shadow-lg transition-all duration-700 ${isUnlocked ? '' : 'filter blur-sm'}`}
                />
            </div>
            <h3 className="text-2xl font-extrabold text-text-default">{displayName}</h3>
            <p className="text-primary-600 font-semibold">{candidate.title}</p>
            <p className="text-sm text-text-muted mt-1">{candidate.level}</p>
          </div>

          {!isUnlocked ? (
                <div className="my-6 space-y-4">
                    
                    {/* Logic: If invite sent, show "Waiting" card. If not, show "Action" card */}
                    {inviteSent ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center shadow-sm animate-fade-in">
                             <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                                <PaperAirplaneIcon className="w-7 h-7 transform -rotate-45 translate-x-0.5 translate-y-0.5" />
                            </div>
                            <h3 className="text-lg font-bold text-green-800 mb-1">ההזמנה נשלחה בהצלחה!</h3>
                            <p className="text-sm text-green-700 mb-4 leading-relaxed">
                                המועמד קיבל את הפנייה שלך. <br/>
                                פרטי הקשר ייחשפו ברגע שהמועמד יאשר עניין.
                            </p>
                            <div className="flex justify-center items-center gap-2 text-xs font-semibold text-green-600 bg-white/60 py-1.5 px-3 rounded-full inline-flex">
                                <ClockIcon className="w-3.5 h-3.5" />
                                <span>נשלח היום</span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-xl p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <SparklesIcon className="w-5 h-5 text-primary-600" />
                                <h3 className="text-lg font-bold text-primary-900">בדיקת התאמה (Invite)</h3>
                            </div>
                            
                            <p className="text-sm text-text-muted mb-4">
                                שלח למועמד הזמנה להתרשם מהמשרה שלך. הפרטים ייחשפו רק במידה והמועמד יאשר עניין.
                            </p>
                            <div className="space-y-3">
                                <div className="relative">
                                    <BriefcaseIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <select 
                                        value={selectedJobId}
                                        onChange={(e) => setSelectedJobId(e.target.value)}
                                        className="w-full bg-white border border-primary-200 text-text-default text-sm rounded-lg p-2.5 pr-10 focus:ring-primary-500 focus:border-primary-500 cursor-pointer"
                                    >
                                        <option value="" disabled>בחר משרה להציע...</option>
                                        {myOpenJobs.map(job => (
                                            <option key={job.id} value={job.id}>{job.title}</option>
                                        ))}
                                    </select>
                                </div>
                                <button 
                                    onClick={handleSendInvite}
                                    disabled={!selectedJobId}
                                    className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition shadow-md disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    <PaperAirplaneIcon className="w-5 h-5" />
                                    <span>שלח הזמנה</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Secondary Action: Direct Reveal (Hard Sell) - Only show if invite NOT sent, or as a "force" option below */}
                    {!inviteSent && (
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-3 my-3">
                                <div className="h-px bg-border-default flex-grow"></div>
                                <span className="text-xs text-text-subtle font-medium">או אם זה דחוף</span>
                                <div className="h-px bg-border-default flex-grow"></div>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsUnlocked(true);
                                    onPurchase(candidate);
                                }}
                                className="text-sm font-semibold text-text-muted hover:text-primary-700 flex items-center justify-center gap-1.5 mx-auto py-2 px-4 rounded-lg hover:bg-bg-subtle transition-colors"
                            >
                                <LockClosedIcon className="w-4 h-4" />
                                <span>חשוף פרטים מיידית (1 קרדיט)</span>
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="my-6 p-4 bg-bg-subtle rounded-xl border border-border-default animate-fade-in">
                    <h4 className="font-bold text-text-default mb-3">פרטי קשר ופעולות</h4>
                    <div className="space-y-2 text-sm mb-4 text-right">
                        <div className="flex items-center gap-3"><EnvelopeIcon className="w-5 h-5 text-text-subtle"/><span>{candidate.contact.email}</span></div>
                        <div className="flex items-center gap-3"><PhoneIcon className="w-5 h-5 text-text-subtle"/><span>{candidate.contact.phone}</span></div>
                    </div>
                    <div className="flex items-center justify-around">
                        <ActionButton href={`tel:${candidate.contact.phone}`} title="התקשר"><PhoneIcon className="w-6 h-6"/></ActionButton>
                        <ActionButton href={`mailto:${candidate.contact.email}`} title="שלח מייל"><EnvelopeIcon className="w-6 h-6"/></ActionButton>
                        <ActionButton title="שלח SMS"><ChatBubbleBottomCenterTextIcon className="w-6 h-6"/></ActionButton>
                        <ActionButton title="שלח Whatsapp"><WhatsappIcon className="w-6 h-6"/></ActionButton>
                    </div>
                </div>
            )}
          
          <div className="space-y-8">
              {/* Experience */}
              <div>
                  <h4 className="font-bold text-text-default mb-4 flex items-center gap-2"><BriefcaseIcon className="w-5 h-5 text-primary-500" /> ניסיון תעסוקתי</h4>
                  <div className="space-y-4">
                      {candidate.detailedExperience.map((exp: any, index: number) => (
                          <TimelineItem 
                            key={index}
                            title={exp.title} 
                            company={exp.field} 
                            duration={exp.duration} 
                            isLast={index === candidate.detailedExperience.length - 1}
                          />
                      ))}
                  </div>
              </div>

               {/* Education */}
              <div>
                  <h4 className="font-bold text-text-default mb-4 flex items-center gap-2"><AcademicCapIcon className="w-5 h-5 text-primary-500" /> השכלה</h4>
                  <div className="space-y-4">
                     {candidate.education.map((edu: any, index: number) => (
                        <TimelineItem 
                            key={index}
                            title={edu.title} 
                            company={edu.institution} 
                            duration={edu.duration} 
                            isLast={index === candidate.education.length - 1} 
                        />
                     ))}
                  </div>
              </div>

               {/* Skills */}
               <div>
                  <h4 className="font-bold text-text-default mb-3 flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-primary-500" /> מיומנויות</h4>
                  <div className="flex flex-wrap gap-2">
                      {candidate.skills.map((skill: string) => (
                        <span key={skill} className="bg-bg-subtle text-text-default text-sm font-medium px-3 py-1.5 rounded-full">{skill}</span>
                      ))}
                  </div>
              </div>

              {/* Salary */}
               <div>
                  <h4 className="font-bold text-text-default mb-2 flex items-center gap-2"><WalletIcon className="w-5 h-5 text-primary-500" /> ציפיות שכר</h4>
                  <p className="font-semibold text-text-default text-lg">{candidate.salaryExpectation}</p>
              </div>

              {/* Languages */}
               <div>
                  <h4 className="font-bold text-text-default mb-3 flex items-center gap-2"><LanguageIcon className="w-5 h-5 text-primary-500" /> שפות</h4>
                  <div className="flex flex-wrap gap-2">
                      {candidate.languages.map((lang: string) => (
                        <span key={lang} className="bg-bg-subtle text-text-default text-sm font-medium px-3 py-1.5 rounded-full">{lang}</span>
                      ))}
                  </div>
              </div>

              {/* Interests */}
               <div>
                  <h4 className="font-bold text-text-default mb-3 flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-primary-500" /> תחומי עניין</h4>
                  <div className="flex flex-wrap gap-2">
                      {candidate.interests.map((interest: string) => (
                        <span key={interest} className="bg-primary-100 text-primary-800 text-sm font-medium px-3 py-1.5 rounded-full">{interest}</span>
                      ))}
                  </div>
              </div>

          </div>
        </div>

        <style>{`
            @keyframes slideInFromLeft {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
             @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
            .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        `}</style>
      </div>
    </div>
  );
};

export default CandidatePoolProfileDrawer;
