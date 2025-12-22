
import React, { useState, useEffect, useRef } from 'react';
import { PhoneIcon, EnvelopeIcon, LanguageIcon, AcademicCapIcon, MapPinIcon, LinkedInIcon, WhatsappIcon, MatchIcon, ClipboardDocumentListIcon, AvatarIcon, PencilIcon, BookmarkIcon, BookmarkIconSolid, BriefcaseIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, ChatBubbleBottomCenterTextIcon, BuildingOffice2Icon, TagIcon, FlagIcon } from './Icons';
import { MessageMode } from '../hooks/useUIState';
import { TagInput } from './TagInput';
import DevAnnotation from './DevAnnotation';

const SocialButton: React.FC<{ children: React.ReactNode, onClick?: () => void, title?: string, className?: string }> = ({ children, onClick, title, className }) => (
  <button onClick={onClick} title={title} className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative z-20 ${className || 'bg-primary-100/70 text-primary-600 hover:bg-primary-200'}`}>
    {children}
  </button>
);

const TimelineEvent: React.FC<{ day: string; month: string; time: string; title: string; company: string; color: string }> = ({ day, month, time, title, company, color }) => (
    <div className="flex-1 min-w-[90px] bg-white border border-border-default rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden group">
        <div className={`absolute top-0 right-0 w-1 h-full bg-${color}-500`}></div>
        <div className="flex justify-between items-start mb-1.5 pl-1">
             <div className="text-center bg-bg-subtle rounded-md px-1.5 py-0.5 min-w-[2.5rem]">
                <span className="block text-lg font-extrabold text-text-default leading-none">{day}</span>
                <span className="block text-[9px] text-text-muted font-medium">{month}</span>
             </div>
             <span className="text-[9px] font-mono text-text-subtle bg-bg-subtle px-1 py-0.5 rounded">{time}</span>
        </div>
        <div>
            <p className="font-bold text-text-default text-xs leading-tight mb-0.5 truncate">{title}</p>
            <p className="text-[10px] text-text-muted truncate" title={company}>{company}</p>
        </div>
    </div>
);

const EditableField: React.FC<{
    value: string;
    placeholder: string;
    onSave: (newValue: string) => void;
    className?: string;
    icon?: React.ReactNode;
    multiline?: boolean;
    collapsible?: boolean;
}> = ({ value, placeholder, onSave, className = "", icon, multiline = false, collapsible = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Calculate split point at 50% of the text length
    const isLongText = collapsible && localValue && localValue.length > 100; // Minimum threshold to even consider collapsing
    const cutOffPoint = Math.floor(localValue.length / 2);
    
    const displayValue = !isEditing && !isExpanded && isLongText 
        ? localValue.slice(0, cutOffPoint) + '...' 
        : localValue;

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
        }
    }, [isEditing]);

    const handleSave = () => {
        onSave(localValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) {
            handleSave();
        } else if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    return (
        <div className={`relative group flex items-start gap-2 ${className} z-10`}>
            {icon && <span className="mt-1 text-text-subtle shrink-0">{icon}</span>}
            <div className="flex-grow min-w-0">
                {isEditing ? (
                    multiline ? (
                         <textarea
                            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border border-primary-500 rounded p-1 text-inherit focus:ring-2 focus:ring-primary-200 outline-none resize-none relative z-30"
                            placeholder={placeholder}
                            rows={6}
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border-b-2 border-primary-500 outline-none text-inherit relative z-30"
                            placeholder={placeholder}
                        />
                    )
                ) : (
                    <div className="relative pr-6">
                         <div 
                            onClick={() => setIsEditing(true)}
                            className="cursor-pointer hover:bg-bg-hover/50 rounded-md py-0.5 px-1 min-h-[1.5em]"
                        >
                            <p className="whitespace-pre-line break-words leading-relaxed">
                                {displayValue || <span className="text-text-subtle opacity-60 italic">{placeholder}</span>}
                            </p>
                        </div>
                        
                        {/* Show More / Show Less Button */}
                        {isLongText && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                className="text-xs font-bold text-primary-600 hover:text-primary-800 mt-1 flex items-center gap-1 select-none bg-primary-50 px-2 py-0.5 rounded-full w-fit"
                            >
                                {isExpanded ? (
                                    <>הצג פחות <ChevronUpIcon className="w-3 h-3" /></>
                                ) : (
                                    <>המשך לקרוא <ChevronDownIcon className="w-3 h-3" /></>
                                )}
                            </button>
                        )}

                        {/* Edit Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600 z-20"
                            aria-label="ערוך"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// Mock data for the experience visualization if not present in candidateData
// Updated with theme-aware color variables
const mockExperienceDistribution = [
    { label: 'מסחר וקמעונאות', percentage: 65, color: 'bg-primary-500' },
    { label: 'טכנולוגיה ושירותים', percentage: 35, color: 'bg-secondary-400' },
];

const mockSmartTags = {
    domains: ['יבוא וסחר סיטונאי', 'הפצה טכנולוגית'],
    orgDNA: {
        label: 'ניסיון בארגוני Enterprise',
        subLabel: '500+ עובדים',
        icon: <BuildingOffice2Icon className="w-3.5 h-3.5" />
    }
};

const ExperienceBar: React.FC<{ 
    data?: { label: string, percentage: number, color: string }[];
    smartTags?: { domains: string[], orgDNA?: { label: string, subLabel: string, icon?: any } }
}> = ({ data = mockExperienceDistribution, smartTags = mockSmartTags }) => (
    <div className="w-full mt-2 mb-4">
        <div className="flex justify-between items-center mb-2">
             <h4 className="text-sm font-bold text-text-default flex items-center gap-2">
                <BriefcaseIcon className="w-4 h-4 text-primary-500"/>
                <span>פרופיל תעשייתי</span>
             </h4>
        </div>
        
        {/* Visual Bar */}
        <div className="flex h-2 w-full rounded-full overflow-hidden bg-bg-subtle mb-2">
            {data.map((item, index) => (
                <div 
                    key={index} 
                    className={`${item.color} h-full relative group cursor-help`} 
                    style={{ width: `${item.percentage}%` }} 
                    title={`${item.label}: ${item.percentage}%`}
                />
            ))}
        </div>

        {/* Legend - Inline */}
        <div className="flex flex-wrap gap-3 mb-3 items-center">
             {data.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5 text-[11px]">
                    <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                    <span className="text-text-default font-medium">{item.label}</span>
                    <span className="text-text-muted">({item.percentage}%)</span>
                </div>
            ))}
        </div>

        {/* Insights Strip - Horizontal Row */}
        <div className="flex flex-col sm:flex-row gap-3 text-xs bg-bg-subtle/30 p-2 rounded-lg border border-border-default/40 items-start sm:items-center">
            {/* Org DNA */}
            {smartTags?.orgDNA && (
                <div className="flex items-center gap-2 min-w-0 sm:border-l sm:border-border-default sm:pl-3 sm:max-w-[40%]">
                    <div className="text-text-muted flex-shrink-0">
                        {smartTags.orgDNA.icon || <BuildingOffice2Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                        <span className="font-bold text-text-default block leading-tight truncate" title={smartTags.orgDNA.label}>
                            {smartTags.orgDNA.label}
                        </span>
                        {smartTags.orgDNA.subLabel && (
                            <span className="text-[10px] text-text-subtle block leading-tight truncate" title={smartTags.orgDNA.subLabel}>
                                {smartTags.orgDNA.subLabel}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Domains */}
            <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                {smartTags?.domains.map((tag, i) => (
                     <span key={i} className="text-[11px] text-text-default bg-white border border-border-default px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                        {tag}
                    </span>
                ))}
            </div>
        </div>
    </div>
);

interface CandidateProfileProps {
    candidateData: any;
    onMatchJobsClick: () => void;
    onScreenCandidateClick: () => void;
    onOpenMessageModal: (config: { mode: MessageMode, candidateName: string, candidatePhone: string }) => void;
    onTagsChange: (tags: string[]) => void;
    onFormChange: (data: any) => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onReportInaccuracy?: () => void;
    hideActions?: boolean;
}

const CandidateProfile: React.FC<CandidateProfileProps> = ({ candidateData, onMatchJobsClick, onScreenCandidateClick, onOpenMessageModal, onTagsChange, onFormChange, isFavorite, onToggleFavorite, onReportInaccuracy, hideActions = false }) => {
  const jobMatchesCount = 8; 
  const getInitials = (name: string) => (name || '').split(' ').map(n => n[0]).join('');
  const candidateInitials = getInitials(candidateData.fullName);

  const companyName = "AllJobs";
  const companyInitials = getInitials(companyName);
  
  const openModal = (mode: MessageMode) => {
    onOpenMessageModal({
        mode,
        candidateName: candidateData.fullName,
        candidatePhone: candidateData.phone,
    });
  };

  return (
    <div className="candidate-profile-card bg-gradient-to-br from-primary-50/80 via-bg-card to-primary-50/40 rounded-2xl shadow-lg p-4 md:p-5 relative mb-6 border border-border-subtle">
         {/* Favorite Button */}
         <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} 
            className="absolute top-4 left-4 p-2 text-text-subtle hover:text-primary-600 transition-colors z-30 bg-bg-card/50 rounded-full shadow-sm hover:bg-bg-card"
            title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
        >
            {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
        </button>

        {/* Report Flag Button - Only if handler provided */}
        {onReportInaccuracy && (
            <button 
                onClick={(e) => { e.stopPropagation(); onReportInaccuracy(); }} 
                className="absolute top-4 left-16 p-2 text-text-subtle hover:text-red-500 transition-colors z-30 bg-bg-card/50 rounded-full shadow-sm hover:bg-bg-card"
                title="דווח על אי-דיוק"
            >
                <FlagIcon className="w-6 h-6" />
            </button>
        )}
        
        <div className="flex flex-col lg:flex-row justify-between items-stretch gap-6">
          
          {/* Right Side - Candidate Info */}
          <div className="w-full lg:w-7/12 relative z-10 flex flex-col justify-center">
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right">
                  <div className="relative flex-shrink-0 hidden sm:block">
                      <div className="w-24 h-24 rounded-full border-4 border-bg-card shadow-md overflow-hidden ring-2 ring-primary-100">
                        <AvatarIcon initials={candidateInitials} size={96} fontSize={42} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                      </div>
                      <div className="absolute top-0 -right-2 w-8 h-8 bg-bg-card rounded-full flex items-center justify-center shadow-sm border border-border-subtle" title={`מקור: ${companyName}`}>
                        <AvatarIcon initials={companyInitials} size={24} fontSize={10} bgClassName="fill-gray-100" textClassName="fill-gray-600 font-bold" />
                      </div>
                  </div>
                  <div className="w-full sm:mr-6 flex-1">
                      <div className="flex items-center justify-center sm:justify-start flex-wrap mb-1">
                          <h2 className="text-3xl font-extrabold text-text-default tracking-tight">{candidateData.fullName || 'שם מועמד'}</h2>
                          <div className="flex items-center text-text-muted mr-3 text-sm bg-bg-subtle/50 px-2 py-0.5 rounded-md border border-border-subtle">
                                <span className="font-semibold">{candidateData.age || '35'}</span>
                                <span className="mx-1.5">•</span>
                                <MapPinIcon className="w-3.5 h-3.5 ml-1" />
                                <span>{candidateData.address || 'מיקום'}</span>
                          </div>
                      </div>
                      
                      <div className="mb-3">
                          <EditableField 
                              value={candidateData.title || ''} 
                              placeholder="פרופיל ראשי (לדוגמה: מנהל שיווק)" 
                              onSave={(val) => onFormChange({ ...candidateData, title: val })}
                              className="text-lg font-bold text-primary-700"
                          />
                      </div>

                      <div className="mb-4 bg-bg-subtle/30 p-3 rounded-lg border border-border-subtle/50">
                         <EditableField 
                              value={candidateData.professionalSummary || ''} 
                              placeholder="תמצית השכלה / תקציר מקצועי" 
                              onSave={(val) => onFormChange({ ...candidateData, professionalSummary: val })}
                              className="text-text-default text-sm leading-relaxed"
                              multiline
                              collapsible={true}
                          />
                      </div>

                      <div className="flex items-center justify-center sm:justify-start gap-2 mt-2 flex-wrap">
                          {/* Highlight Badges */}
                          <div title="שליטה באנגלית כשפת אם" className="flex items-center gap-1.5 bg-white text-text-default font-medium text-xs px-2.5 py-1 rounded-md border border-border-default shadow-sm">
                              <LanguageIcon className="w-3.5 h-3.5 text-primary-500" />
                              <span>אנגלית שפת אם</span>
                          </div>
                          <div title="תואר אקדמי" className="flex items-center gap-1.5 bg-white text-text-default font-medium text-xs px-2.5 py-1 rounded-md border border-border-default shadow-sm">
                              <AcademicCapIcon className="w-3.5 h-3.5 text-primary-500" />
                              <span>תואר אקדמי</span>
                          </div>
                          {/* Job Scope Badge */}
                          <div title="היקף משרה רצוי" className="flex items-center gap-1.5 bg-secondary-50 text-secondary-800 font-medium text-xs px-2.5 py-1 rounded-md border border-secondary-200 shadow-sm">
                              <BriefcaseIcon className="w-3.5 h-3.5" />
                              <span>{candidateData.jobScope || 'משרה מלאה'}</span>
                          </div>
                      </div>

                      <div className="flex items-center justify-center sm:justify-start text-xs text-text-muted mt-3 flex-wrap gap-y-1">
                          <span className="flex items-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5"/>
                              עודכן לאחרונה: 14:01 28/05/2025
                          </span>
                          <span className="mx-2 hidden sm:inline">•</span>
                          <span>ציפיות שכר: <span className="font-semibold text-text-default">12,000 ₪</span></span>
                      </div>

                      <div className="flex items-center justify-center sm:justify-start gap-3 mt-5 relative z-20">
                           {/* Contact Actions */}
                            <a href={`tel:${candidateData.phone}`} title={candidateData.phone} className="w-9 h-9 flex items-center justify-center bg-white border border-border-default text-text-muted rounded-full hover:text-primary-600 hover:border-primary-200 transition-all shadow-sm">
                                <PhoneIcon className="w-4 h-4" />
                            </a>
                            <SocialButton onClick={() => openModal('email')} title="שלח אימייל"><EnvelopeIcon className="w-4 h-4" /></SocialButton>
                            <SocialButton onClick={() => openModal('whatsapp')} title="שלח וואטסאפ"><WhatsappIcon className="w-4 h-4" /></SocialButton>
                            <SocialButton onClick={() => openModal('sms')} title="שלח SMS"><ChatBubbleBottomCenterTextIcon className="w-4 h-4" /></SocialButton>
                            <div className="h-6 w-px bg-border-default mx-1"></div>
                            <a href="#" target="_blank" rel="noopener noreferrer" title="LinkedIn Profile" className="w-9 h-9 flex items-center justify-center bg-[#0077b5]/10 text-[#0077b5] rounded-full hover:bg-[#0077b5]/20 transition-all">
                                <LinkedInIcon className="w-4 h-4" />
                            </a>
                      </div>
                      
                      {/* Action Buttons */}
                      {!hideActions && (
                          <div className="flex flex-wrap items-center justify-start gap-3 mt-6 pt-4 border-t border-border-default/50">
                              <DevAnnotation
                                  title="AI Matching"
                                  description="Calculates relevance score based on candidate skills vs job requirements."
                                  logic={["Vectors Embedding for skills", "Industry overlap analysis"]}
                              >
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onMatchJobsClick(); }}
                                      className="flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20"
                                  >
                                      <MatchIcon className="w-5 h-5" />
                                      <span>התאמות ({jobMatchesCount})</span>
                                  </button>
                              </DevAnnotation>
                              <button
                                  onClick={(e) => { e.stopPropagation(); onScreenCandidateClick(); }}
                                  className="flex items-center justify-center gap-2 bg-white border border-border-default text-text-default font-bold py-2 px-4 rounded-xl hover:bg-bg-hover transition-all shadow-sm"
                              >
                                  <ClipboardDocumentListIcon className="w-5 h-5 text-text-muted" />
                                  <span>סינון מועמד</span>
                              </button>
                          </div>
                      )}

                  </div>
              </div>
          </div>

          {/* Left Side - Timeline & Analysis - Hidden on mobile */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between hidden lg:flex relative z-0 h-full border-r border-border-default/50 pr-6">
              
               {/* Timeline Section */}
              <div className="mb-2">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">פעילות אחרונה</h4>
                  <div className="flex justify-between items-stretch gap-2">
                      <TimelineEvent day="14" month="יולי" time="13:00" title="קו''ח" company="בזק" color="primary" />
                      <TimelineEvent day="10" month="יולי" time="09:00" title="שיחה" company="Wix" color="accent" />
                      <TimelineEvent day="06" month="יולי" time="10:00" title="ראיון" company="Fiverr" color="secondary" />
                  </div>
              </div>

              {/* Visual Experience Distribution Bar - Horizontal Compact */}
              <ExperienceBar 
                 data={candidateData.industryAnalysis?.industries} 
                 smartTags={candidateData.industryAnalysis?.smartTags}
              />

              <div className="w-full mt-auto">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">תגיות וכישורים</h4>
                    <button className="text-[10px] text-primary-600 hover:underline">+ הוסף תגית</button>
                </div>
                <TagInput tags={candidateData.tags || []} setTags={onTagsChange} placeholder="הוסף תגית..." limit={6} />
              </div>
          </div>
        </div>
    </div>
  );
};

export default CandidateProfile;
