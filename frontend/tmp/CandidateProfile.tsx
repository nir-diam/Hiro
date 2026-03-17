
import React, { useState, useEffect, useRef } from 'react';
import { PhoneIcon, EnvelopeIcon, LinkedInIcon, WhatsappIcon, MatchIcon, ClipboardDocumentListIcon, AvatarIcon, PencilIcon, BookmarkIcon, BookmarkIconSolid, BriefcaseIcon, ChevronDownIcon, ChevronUpIcon, ChatBubbleBottomCenterTextIcon, BuildingOffice2Icon, FlagIcon, CheckCircleIcon, SparklesIcon, WrenchScrewdriverIcon, PlusIcon, XMarkIcon, ClockIcon, PinIcon, MapPinIcon, AcademicCapIcon, LanguageIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons';
import { MessageMode } from '../hooks/useUIState';
import DevAnnotation from './DevAnnotation';
import { useLanguage } from '../context/LanguageContext';
import TagSelectorModal, { TagCategory } from './TagSelectorModal';

// --- TYPES ---
interface ProfileVersion {
    id: number;
    title: string;
    source: string;
    date: string;
    isPinned: boolean;
    summary: string; 
}

interface SmartTagData {
    id: string;
    label: string;
    type: 'role' | 'seniority' | 'skill' | 'tool' | 'soft' | 'industry' | 'certification' | 'language';
    isVerified?: boolean;
    isAiSuggested?: boolean;
    customTooltip?: string; // NEW: Allow custom text for hover
}

// --- SUB-COMPONENTS ---

const SocialButton: React.FC<{ children: React.ReactNode, onClick?: () => void, title?: string, className?: string }> = ({ children, onClick, title, className }) => (
  <button onClick={onClick} title={title} className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative z-20 ${className || 'bg-primary-100/70 text-primary-600 hover:bg-primary-200'}`}>
    {children}
  </button>
);

const SmartTag: React.FC<SmartTagData> = ({ label, type, isVerified, isAiSuggested, customTooltip }) => {
    const { t } = useLanguage();
    
    const baseClasses = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all cursor-default select-none border whitespace-nowrap relative group/tag";
    
    const configs = {
        role: "bg-primary-600 text-white font-bold border-primary-600 shadow-sm",
        seniority: "bg-white border-primary-400 text-primary-700 font-bold",
        skill: "bg-slate-100 text-slate-800 border-slate-200 font-semibold",
        tool: "bg-blue-50 text-blue-800 border-blue-100 font-bold",
        soft: "bg-transparent border-slate-200 text-slate-600 italic font-medium",
        industry: "bg-emerald-50 text-emerald-800 border-emerald-100 font-bold",
        certification: "bg-orange-50 text-orange-800 border-orange-100 font-bold",
        language: "bg-pink-50 text-pink-700 border-pink-100 font-medium",
    };

    const typeLabels = {
        role: "תפקיד",
        seniority: "בכירות",
        skill: "מיומנות",
        tool: "כלי עבודה",
        soft: "כישורים רכים",
        industry: "תעשייה",
        certification: "השכלה/הסמכה",
        language: "שפה"
    };

    const sourceLabel = isAiSuggested ? "AI (בינה מלאכותית)" : "הוזן ידנית / מועמד";

    return (
        <div 
            className={`${baseClasses} ${configs[type]} ${isAiSuggested ? 'border-dashed' : 'border-solid'} hover:shadow-md hover:-translate-y-0.5`} 
        >
            {isAiSuggested && <SparklesIcon className="w-3 h-3 opacity-70" />}
            <span>{label}</span>
            {isVerified && <CheckCircleIcon className="w-3 h-3 text-current opacity-80" />}
            
            {/* Custom Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[220px] px-3 py-2 bg-gray-900/95 text-white text-[11px] rounded-lg opacity-0 group-hover/tag:opacity-100 transition-opacity duration-200 pointer-events-none z-50 backdrop-blur-sm shadow-xl flex flex-col items-center gap-0.5 transform scale-95 group-hover/tag:scale-100 origin-bottom text-center leading-tight">
                {customTooltip ? (
                    <span className="font-medium whitespace-pre-wrap">{customTooltip}</span>
                ) : (
                    <>
                        <span className="font-bold border-b border-gray-700 pb-0.5 mb-0.5">{typeLabels[type]}</span>
                        <span className="text-gray-300 text-[9px]">{sourceLabel}</span>
                    </>
                )}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/95"></div>
            </div>
        </div>
    );
};

// --- SmartTagRow with Expansion & Quick Add ---
const SmartTagRow: React.FC<{ 
    tags: SmartTagData[]; 
    limit: number; 
    icon: React.ReactNode; 
    bgColor: string; 
    iconColor: string; 
    rowTitle: string;
    onAddTagClick: () => void;
    addPlaceholder: string;
    priorityType?: 'industry' | 'role' | 'skill'; 
}> = ({ tags, limit, icon, bgColor, iconColor, rowTitle, onAddTagClick, addPlaceholder, priorityType }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const safeTags = tags || [];
    const hasMore = safeTags.length > limit;

    let visibleTags = [];
    if (isExpanded) {
        visibleTags = safeTags;
    } else {
        visibleTags = safeTags.slice(0, limit);
        if (priorityType && hasMore) {
            const isPriorityVisible = visibleTags.some(t => t.type === priorityType);
            if (!isPriorityVisible) {
                const hiddenTags = safeTags.slice(limit);
                const priorityTagIndex = hiddenTags.findIndex(t => t.type === priorityType);
                if (priorityTagIndex !== -1) {
                    const priorityTag = hiddenTags[priorityTagIndex];
                    visibleTags = [...visibleTags.slice(0, limit - 1), priorityTag];
                }
            }
        }
    }

    const hiddenCount = safeTags.length - limit;

    return (
        <div className="flex items-start gap-4 group/row min-h-[40px] py-1">
            <div className={`p-2 ${bgColor} ${iconColor} rounded-xl shrink-0 mt-0.5 shadow-sm flex items-center justify-center`} title={rowTitle}>
                {icon}
            </div>
            
            <div className="flex flex-wrap items-center gap-2 flex-1 pt-1">
                {visibleTags.map((tag) => (
                    <SmartTag key={tag.id} {...tag} />
                ))}

                {hasMore && (
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition-all shadow-sm flex items-center gap-1
                            ${isExpanded 
                                ? 'bg-white text-text-muted border-border-default hover:bg-bg-hover' 
                                : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'}`}
                    >
                        {isExpanded ? (
                            <>פחות <ChevronUpIcon className="w-3 h-3"/></>
                        ) : (
                            <>{hiddenCount}+ <ChevronDownIcon className="w-3 h-3"/></>
                        )}
                    </button>
                )}

                <button
                    onClick={onAddTagClick}
                    className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded-full hover:bg-bg-subtle text-text-muted hover:text-primary-600 flex items-center gap-1"
                    title={addPlaceholder}
                >
                    <PlusIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

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

    const isLongText = collapsible && localValue && localValue.length > 100;
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

const ExperienceBar: React.FC<{ 
    data?: { label: string, percentage: number, color: string }[];
    smartTags?: { domains: string[], orgDNA?: { label: string, subLabel: string, icon?: any } }
}> = ({ data, smartTags }) => {
    return (
        <div className="w-full mt-2 mb-4">
            <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-bg-subtle mb-3">
                {data?.map((item, index) => (
                    <div 
                        key={index} 
                        className={`${item.color} h-full`} 
                        style={{ width: `${item.percentage}%` }} 
                        title={`${item.label}: ${item.percentage}%`}
                    />
                ))}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3">
                {data?.map((item, index) => (
                    <div key={index} className="flex items-center gap-1.5 text-[10px]">
                        <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                        <span className="text-text-default font-bold uppercase">{item.label}</span>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-2">
                {smartTags?.orgDNA && (
                    <div className="flex items-center gap-2 bg-blue-50/50 border border-blue-100 px-3 py-1.5 rounded-xl">
                        <BuildingOffice2Icon className="w-4 h-4 text-blue-600"/>
                        <div className="text-right">
                             <span className="text-xs font-bold text-blue-900 block leading-none">{smartTags.orgDNA.label}</span>
                             <span className="text-[10px] text-blue-700">{smartTags.orgDNA.subLabel}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProfileVersionSwitcher: React.FC<{
    currentTitle: string;
    onVersionChange: (version: ProfileVersion) => void;
}> = ({ currentTitle, onVersionChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const [versions, setVersions] = useState<ProfileVersion[]>([
        { id: 1, title: currentTitle || 'מנהל שיווק דיגיטלי', source: 'AllJobs', date: '28/05/2025', isPinned: true, summary: 'מנהל שיווק מנוסה עם התמחות בטרנספורמציה דיגיטלית...' },
        { id: 2, title: 'מקדם אתרים SEO', source: 'LinkedIn', date: '10/01/2024', isPinned: false, summary: 'מומחה SEO עם רקע טכני חזק וניסיון של 3 שנים בסוכנות דיגיטל...' },
        { id: 3, title: 'Junior Marketing', source: 'חבר מביא חבר', date: '15/06/2022', isPinned: false, summary: 'בוגר תואר ראשון בתקשורת עם מוטיבציה גבוהה...' }
    ]);

    const [selectedId, setSelectedId] = useState(versions[0].id);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (version: ProfileVersion) => {
        setSelectedId(version.id);
        onVersionChange(version);
        setIsOpen(false);
    };

    const togglePin = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setVersions(prev => prev.map(v => ({
            ...v,
            isPinned: v.id === id ? !v.isPinned : false 
        })));
    };

    const selectedVersion = versions.find(v => v.id === selectedId) || versions[0];
    const year = new Date().getFullYear() === parseInt(selectedVersion.date.split('/')[2]) ? '2025' : selectedVersion.date.split('/')[2];

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-semibold border backdrop-blur-sm shadow-sm hover:shadow-md
                    ${isOpen 
                        ? 'bg-primary-50 text-primary-700 border-primary-200' 
                        : 'bg-white/80 text-text-subtle border-border-default hover:text-primary-600 hover:border-primary-200'
                    }`}
                title="החלף גרסת קורות חיים"
            >
                <ClockIcon className={`w-3.5 h-3.5 ${selectedVersion.isPinned ? 'text-primary-500' : 'text-text-subtle'}`} />
                <span>{selectedVersion.source}</span>
                <span className="w-px h-3 bg-current opacity-20"></span>
                <span className="font-mono">{year}</span>
                <ChevronDownIcon className={`w-3 h-3 opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-border-default z-50 overflow-hidden animate-fade-in origin-top-right">
                    <div className="p-2.5 bg-bg-subtle/50 border-b border-border-default flex justify-between items-center">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">היסטוריית גרסאות</p>
                        <span className="text-[10px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                            {versions.length} גרסאות
                        </span>
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto">
                        {versions.map((version, idx) => (
                            <div 
                                key={version.id}
                                onClick={() => handleSelect(version)}
                                className={`px-3 py-2.5 border-b border-border-subtle last:border-0 hover:bg-primary-50 transition-colors cursor-pointer group flex items-start gap-3 ${selectedId === version.id ? 'bg-primary-50/60' : ''}`}
                            >
                                <div className="mt-0.5 flex flex-col items-center gap-1">
                                     <div className={`w-2 h-2 rounded-full ${selectedId === version.id ? 'bg-primary-500' : 'bg-border-default'}`}></div>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <p className={`text-xs font-bold truncate ${selectedId === version.id ? 'text-primary-900' : 'text-text-default'}`}>
                                            {version.title}
                                        </p>
                                        <button 
                                            onClick={(e) => togglePin(e, version.id)}
                                            className={`ml-2 text-text-subtle hover:text-primary-600 transition-colors ${version.isPinned ? 'text-primary-500 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                            title={version.isPinned ? "בטל נעיצה" : "נעץ כברירת מחדל"}
                                        >
                                            <PinIcon className={`w-3 h-3 ${version.isPinned ? 'fill-current' : ''}`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-muted">
                                        <span>{version.date}</span>
                                        <span>•</span>
                                        <span className="truncate max-w-[80px]">{version.source}</span>
                                        {idx === 0 && <span className="bg-green-100 text-green-700 px-1 rounded ml-1">חדש</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};


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
    // New navigation props
    nextCandidateId?: number;
    prevCandidateId?: number;
    onNavigate?: (id: number) => void;
}

const CandidateProfile: React.FC<CandidateProfileProps> = ({ 
    candidateData, onMatchJobsClick, onScreenCandidateClick, onOpenMessageModal, 
    onTagsChange, onFormChange, isFavorite, onToggleFavorite, onReportInaccuracy, hideActions = false,
    nextCandidateId, prevCandidateId, onNavigate
}) => {
  const { t } = useLanguage();
  const jobMatchesCount = 8; 
  const getInitials = (name: string) => (name || '').split(' ').map(n => n[0]).join('');
  const candidateInitials = getInitials(candidateData.fullName);

  const [displayTitle, setDisplayTitle] = useState(candidateData.title);
  const [displaySummary, setDisplaySummary] = useState(candidateData.professionalSummary);

  const [localTags, setLocalTags] = useState<{
      roles: SmartTagData[],
      capabilities: SmartTagData[],
      behavior: SmartTagData[],
      qualifications: SmartTagData[] // New Category
  }>({
      roles: [],
      capabilities: [],
      behavior: [],
      qualifications: [] // Init
  });
  
  // Tag Modal State
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [activeTagCategory, setActiveTagCategory] = useState<TagCategory>('all');
  
  // Handlers for modal
  const openTagModal = (category: TagCategory) => {
      setActiveTagCategory(category);
      setIsTagModalOpen(true);
  };
  
  // Handler for scrolling to form sections (replacing modal for complex types)
  const scrollToFormSection = (sectionId: string) => {
      const element = document.getElementById(sectionId);
      const scrollContainer = document.getElementById('main-scroll-container'); // App.tsx container
      if (element && scrollContainer) {
          // Calculate offset to land nicely - adjusting for sticky headers
          const top = element.getBoundingClientRect().top;
          const containerTop = scrollContainer.getBoundingClientRect().top;
          const scrollTop = scrollContainer.scrollTop;
          const offset = 120; // Header height approximation
          
          scrollContainer.scrollTo({
              top: scrollTop + top - containerTop - offset,
              behavior: 'smooth'
          });
      }
  };
  
  const handleTagModalSave = (selectedTags: string[]) => {
      // Here we assume the modal returns string names of tags.
      // In a real app we'd need to map them back to the correct category structure.
      const newTagObjects: SmartTagData[] = selectedTags.map((t, i) => ({
          id: `new_${Date.now()}_${i}`,
          label: t,
          type: activeTagCategory === 'role' ? 'role' : activeTagCategory === 'skill' ? 'skill' : activeTagCategory === 'tool' ? 'tool' : 'skill'
      }));
      
      setLocalTags(prev => {
          if (activeTagCategory === 'role') return { ...prev, roles: [...prev.roles, ...newTagObjects] };
          if (activeTagCategory === 'skill' || activeTagCategory === 'tool') return { ...prev, capabilities: [...prev.capabilities, ...newTagObjects] };
          if (activeTagCategory === 'soft_skill') return { ...prev, behavior: [...prev.behavior, ...newTagObjects] };
          if (activeTagCategory === 'education' || activeTagCategory === 'language') return { ...prev, qualifications: [...prev.qualifications, ...newTagObjects] };
          
          // Default fallthrough
           return { ...prev, capabilities: [...prev.capabilities, ...newTagObjects] };
      });

      // Also propagate to parent if needed
      onTagsChange([...candidateData.tags, ...selectedTags]);
  };

  useEffect(() => {
      setDisplayTitle(candidateData.title);
      setDisplaySummary(candidateData.professionalSummary);
      
      const isMaya = candidateData.id === 2; 
      const isDavid = candidateData.id === 3; 

      if (isDavid) {
          setLocalTags({
              roles: [
                  { id: 'r1', label: "UX/UI Designer", type: "role", isVerified: true },
                  { id: 'r2', label: "Product Designer", type: "role" },
                  { id: 'sen1', label: "Senior", type: "seniority", isAiSuggested: true }, 
                  { id: 'ind1', label: "AdTech", type: "industry" }, 
                  { id: 'ind2', label: "Gaming", type: "industry" },
                  { id: 'r3', label: "Art Director", type: "role", isAiSuggested: true },
              ],
              capabilities: [
                  { id: 't1', label: "Figma", type: "tool" }, 
                  { id: 't2', label: "Sketch", type: "tool" },
                  { id: 't3', label: "Adobe XD", type: "tool" },
                  { id: 't4', label: "Principle", type: "tool" },
                  { id: 's1', label: "Prototyping", type: "skill" }, 
                  { id: 's2', label: "User Research", type: "skill" },
                  { id: 's3', label: "Wireframing", type: "skill" },
                  { id: 's4', label: "HTML/CSS", type: "skill", isAiSuggested: true },
              ],
              behavior: [
                  { id: 'b1', label: "Creative", type: "soft" },
                  { id: 'b2', label: "Pixel Perfect", type: "soft" },
                  { id: 'b3', label: "Team Player", type: "soft" },
                  { id: 'b4', label: "Communicative", type: "soft", isAiSuggested: true },
              ],
              qualifications: [
                  { id: 'cert1', label: "B.Des", type: "certification", customTooltip: "תואר ראשון בתקשורת חזותית\nבצלאל, 2014-2018" },
                  { id: 'cert2', label: "M.Des", type: "certification", customTooltip: "תואר שני בעיצוב וחדשנות\nשנקר, 2019-2021" },
                  { id: 'cert3', label: "Google UX Cert", type: "certification", customTooltip: "הסמכת UX מקצועית של גוגל (Coursera)" },
                  { id: 'lang1', label: "אנגלית", type: "language", customTooltip: "רמה גבוהה מאוד (Fluent)" },
                  { id: 'cert4', label: "Front-end Basics", type: "certification", customTooltip: "קורס פיתוח למעצבים (CodeAcademy)" },
                  { id: 'lang2', label: "ספרדית", type: "language", customTooltip: "רמה בסיסית" },
              ]
          });
      } else if (isMaya) {
           setLocalTags({
            roles: [
                { id: 'r1', label: candidateData.title, type: "role", isVerified: true },
                { id: 'r2', label: "Tech Lead", type: "role" },
                { id: 'r3', label: "System Architect", type: "role" },
                { id: 'r4', label: "Backend Lead", type: "role" },
                { id: 'r5', label: "Frontend Lead", type: "role" },
                { id: 'ind1', label: "הייטק", type: "industry" },
                { id: 'ind2', label: "SaaS", type: "industry" },
                { id: 'ind3', label: "Cyber", type: "industry" },
            ],
            capabilities: [
                { id: 's1', label: "React", type: "tool" },
                { id: 's2', label: "Node.js", type: "tool" },
                { id: 's3', label: "TypeScript", type: "tool", isAiSuggested: true },
                { id: 's4', label: "AWS", type: "tool" },
                { id: 's5', label: "Docker", type: "tool" },
                { id: 's6', label: "Kubernetes", type: "tool" },
                { id: 's7', label: "PostgreSQL", type: "tool" },
                { id: 's8', label: "MongoDB", type: "tool" },
                { id: 's9', label: "Redis", type: "tool" },
                { id: 's10', label: "GraphQL", type: "tool" },
                { id: 's11', label: "Next.js", type: "tool" },
            ],
            behavior: [
                { id: 'b1', label: "הובלה טכנולוגית", type: "soft" },
                { id: 'b2', label: "חניכת עובדים", type: "soft" },
                { id: 'b3', label: "פתרון בעיות", type: "soft" },
                { id: 'b4', label: "תקשורת בין-אישית", type: "soft" },
                { id: 'b5', label: "עבודה בצוות", type: "soft" },
                { id: 'b6', label: "ניהול זמן", type: "soft" }
            ],
            qualifications: [
                  { id: 'cert1', label: "B.Sc Computer Science", type: "certification", customTooltip: "תואר ראשון במדעי המחשב\nהטכניון, 2015-2019" },
                  { id: 'cert2', label: "AWS Certified", type: "certification", customTooltip: "הסמכת ארכיטקט ענן של אמזון" },
                  { id: 'lang1', label: "אנגלית", type: "language", customTooltip: "רמת שפת אם (Native)" },
            ]
          });
      } else {
          setLocalTags({
            roles: [
                { id: 'r1', label: candidateData.title, type: "role", isVerified: true },
                { id: 'sen', label: "בכיר", type: "seniority" },
                { id: 'ind', label: "הייטק", type: "industry" }
            ],
            capabilities: [
                 { id: 's1', label: "ניהול פרויקטים", type: "skill" },
                 { id: 's2', label: "React", type: "tool" },
                 { id: 's3', label: "TypeScript", type: "tool", isAiSuggested: true },
                 { id: 's4', label: "Figma", type: "tool" }
            ],
            behavior: [
                 { id: 'b1', label: "יחסי אנוש מעולים", type: "soft" },
                 { id: 'b2', label: "יכולת עבודה בצוות", type: "soft" },
                 { id: 'b3', label: "פתרון בעיות יצירתי", type: "soft" }
            ],
            qualifications: [
                 { id: 'cert1', label: "B.A", type: "certification", customTooltip: "תואר ראשון כללי" },
                 { id: 'lang1', label: "אנגלית", type: "language", customTooltip: "רמה גבוהה" },
            ]
          });
      }

  }, [candidateData]);

  const handleVersionChange = (version: ProfileVersion) => {
      setDisplayTitle(version.title);
      setDisplaySummary(version.summary);
  };

  const openModal = (mode: MessageMode) => {
    onOpenMessageModal({
        mode,
        candidateName: candidateData.fullName,
        candidatePhone: candidateData.phone,
    });
  };

  return (
    <div className="candidate-profile-card bg-bg-card rounded-2xl shadow-lg p-6 relative mb-6 border border-border-default overflow-hidden">
        
         <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
            
            {/* --- NAVIGATION BUTTONS (Updated per user feedback) --- */}
            <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-full border border-border-default p-0.5 shadow-sm">
                 <button 
                     onClick={(e) => { e.stopPropagation(); if (prevCandidateId && onNavigate) onNavigate(prevCandidateId); }} 
                     disabled={!prevCandidateId}
                     className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-bg-subtle text-text-subtle disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                     title="מועמד קודם"
                 >
                     <ChevronRightIcon className="w-5 h-5" /> {/* RTL: Right is Prev */}
                 </button>
                 <div className="w-px h-5 bg-border-default"></div>
                 <button 
                     onClick={(e) => { e.stopPropagation(); if (nextCandidateId && onNavigate) onNavigate(nextCandidateId); }} 
                     disabled={!nextCandidateId}
                     className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-bg-subtle text-text-subtle disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                     title="מועמד הבא"
                 >
                     <ChevronLeftIcon className="w-5 h-5" /> {/* RTL: Left is Next */}
                 </button>
            </div>
            
            <div className="w-px h-5 bg-border-default/50 mx-1"></div>

            <ProfileVersionSwitcher 
                currentTitle={candidateData.title}
                onVersionChange={handleVersionChange}
            />

            {onReportInaccuracy && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onReportInaccuracy(); }} 
                    className="p-2 text-text-subtle hover:text-red-500 transition-colors bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md border border-border-default"
                    title="דווח על אי-דיוק"
                >
                    <FlagIcon className="w-3.5 h-3.5" />
                </button>
            )}

            <button 
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} 
                className="p-2 text-text-subtle hover:text-primary-600 transition-colors bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md border border-border-default"
                title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
            >
                {isFavorite ? <BookmarkIconSolid className="w-4 h-4 text-primary-500" /> : <BookmarkIcon className="w-4 h-4" />}
            </button>
         </div>

        <div className="flex flex-col lg:flex-row justify-between items-stretch gap-8">
          
          {/* Main Info Area */}
          <div className="w-full lg:w-7/12 relative z-10">
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right">
                  <div className="relative flex-shrink-0">
                      <div className="w-24 h-24 rounded-full border-4 border-white shadow-md overflow-hidden ring-2 ring-primary-100">
                        <AvatarIcon initials={candidateInitials} size={96} fontSize={42} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                      </div>
                  </div>
                  <div className="w-full sm:mr-6 flex-1">
                      <div className="flex items-center justify-center sm:justify-start flex-wrap mb-1">
                          <h2 className="text-3xl font-extrabold text-text-default tracking-tight">{candidateData.fullName || 'שם מועמד'}</h2>
                          <div className="sm:mr-3 px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-black rounded uppercase border border-green-200">פרופיל מאומת</div>
                      </div>
                      
                      <div className="mb-3">
                          <EditableField 
                              value={displayTitle || ''} 
                              placeholder={t('profile.main_profile_label')} 
                              onSave={(val) => onFormChange({ ...candidateData, title: val })}
                              className="text-lg font-bold text-primary-700"
                          />
                      </div>

                      <div className="flex items-center justify-center sm:justify-start text-sm text-text-muted mb-4 gap-3">
                            <div className="flex items-center gap-1.5">
                                <MapPinIcon className="w-3.5 h-3.5" />
                                <span>{candidateData.address || 'מיקום'}</span>
                            </div>
                            <span className="text-border-default">|</span>
                            <span>{candidateData.age || '35'}</span>
                             <span className="text-border-default">|</span>
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-text-default">12,000 ₪</span>
                            </div>
                      </div>

                      <div className="mb-5">
                         <EditableField 
                              value={displaySummary || ''} 
                              placeholder={t('profile.summary_placeholder')} 
                              onSave={(val) => onFormChange({ ...candidateData, professionalSummary: val })}
                              className="text-text-default text-sm leading-relaxed"
                              multiline
                              collapsible={true}
                          />
                      </div>

                      {/* --- SMART TRUNCATED TAG ROWS --- */}
                      <div className="space-y-4 mb-6 relative">
                          <SmartTagRow 
                             tags={localTags.roles} 
                             limit={4} 
                             icon={<BriefcaseIcon className="w-4 h-4" />} 
                             bgColor="bg-primary-100" 
                             iconColor="text-primary-600"
                             rowTitle="תפקיד והקשר"
                             onAddTagClick={() => openTagModal('role')}
                             addPlaceholder="הוסף תפקיד..."
                             priorityType="industry"
                          />

                          <SmartTagRow 
                             tags={localTags.qualifications} 
                             limit={4} 
                             icon={<AcademicCapIcon className="w-4 h-4" />} 
                             bgColor="bg-orange-50" 
                             iconColor="text-orange-600"
                             rowTitle="השכלה ושפות"
                             onAddTagClick={() => scrollToFormSection('education')}
                             addPlaceholder="הוסף..."
                          />

                          <SmartTagRow 
                             tags={localTags.capabilities} 
                             limit={6} 
                             icon={<WrenchScrewdriverIcon className="w-4 h-4" />} 
                             bgColor="bg-blue-100" 
                             iconColor="text-blue-600"
                             rowTitle="כלים ומיומנויות"
                             onAddTagClick={() => openTagModal('tool')}
                             addPlaceholder="הוסף כלי..."
                          />

                          <SmartTagRow 
                             tags={localTags.behavior} 
                             limit={3} 
                             icon={<SparklesIcon className="w-4 h-4" />} 
                             bgColor="bg-amber-50" 
                             iconColor="text-amber-500"
                             rowTitle="כישורים רכים"
                             onAddTagClick={() => openTagModal('soft_skill')}
                             addPlaceholder="תכונה..."
                          />
                      </div>

                  </div>
              </div>
          </div>

          {/* Activity & Action Area (Compact Side) */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between hidden lg:flex relative z-0 h-full border-r border-border-default/50 pr-8">
              
              <div className="mb-4">
                  <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">{t('profile.recent_activity')}</h4>
                  <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-4">
                           <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">14</div>
                           <div className="min-w-0">
                               <p className="text-xs font-bold text-text-default">הגשה למשרה: מנהל שיווק</p>
                               <p className="text-[10px] text-text-muted">בזק • 13:00</p>
                           </div>
                      </div>
                      <div className="flex items-start gap-4">
                           <div className="w-10 h-10 bg-secondary-100 text-secondary-600 rounded-xl flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">10</div>
                           <div className="min-w-0">
                               <p className="text-xs font-bold text-text-default">שיחת סינון טלפוני</p>
                               <p className="text-[10px] text-text-muted">Wix • 09:45</p>
                           </div>
                      </div>
                  </div>
              </div>

              <div className="bg-bg-subtle/30 p-5 rounded-2xl border border-border-default/50 mb-auto">
                <h4 className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-4">{t('profile.industry_profile')}</h4>
                <ExperienceBar 
                    data={candidateData.industryAnalysis?.industries} 
                    smartTags={candidateData.industryAnalysis?.smartTags}
                />
              </div>
              
              {/* --- ACTION BUTTONS (Moved here based on request) --- */}
              <div className="mt-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                        <a href={`tel:${candidateData.phone}`} title={candidateData.phone} className="w-10 h-10 flex items-center justify-center bg-white border border-border-default text-text-muted rounded-xl hover:text-primary-600 hover:border-primary-200 transition-all shadow-sm">
                            <PhoneIcon className="w-5 h-5" />
                        </a>
                        <SocialButton onClick={() => openModal('email')} title={t('profile.send_email')}><EnvelopeIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton onClick={() => openModal('whatsapp')} title={t('profile.send_whatsapp')}><WhatsappIcon className="w-5 h-5" /></SocialButton>
                        <SocialButton onClick={() => openModal('sms')} title={t('profile.send_sms')}><ChatBubbleBottomCenterTextIcon className="w-5 h-5" /></SocialButton>
                        <div className="h-6 w-px bg-border-default"></div>
                        <a href="#" target="_blank" rel="noopener noreferrer" title="LinkedIn Profile" className="w-10 h-10 flex items-center justify-center bg-[#0077b5]/10 text-[#0077b5] rounded-xl hover:bg-[#0077b5]/20 transition-all">
                            <LinkedInIcon className="w-5 h-5" />
                        </a>
                  </div>
                  
                  {!hideActions && (
                      <div className="flex flex-col gap-3">
                          <DevAnnotation
                              title="AI Matching"
                              description="Calculates relevance score based on candidate skills vs job requirements."
                              logic={["Vectors Embedding for skills", "Industry overlap analysis"]}
                              position="top-left"
                          >
                              <button
                                  onClick={(e) => { e.stopPropagation(); onMatchJobsClick(); }}
                                  className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20"
                              >
                                  <MatchIcon className="w-5 h-5" />
                                  <span>{t('profile.matches')} ({jobMatchesCount})</span>
                              </button>
                          </DevAnnotation>
                          <button
                              onClick={(e) => { e.stopPropagation(); onScreenCandidateClick(); }}
                              className="w-full flex items-center justify-center gap-2 bg-white border border-border-default text-text-default font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover transition-all shadow-sm"
                          >
                              <ClipboardDocumentListIcon className="w-5 h-5 text-text-muted" />
                              <span>{t('profile.screen_candidate')}</span>
                          </button>
                      </div>
                  )}
              </div>

          </div>
        </div>

        {/* Tag Selector Modal - Reusable */}
        <TagSelectorModal 
            isOpen={isTagModalOpen}
            onClose={() => setIsTagModalOpen(false)}
            onSave={handleTagModalSave}
            existingTags={candidateData.tags || []}
            initialCategory={activeTagCategory}
        />
    </div>
  );
};

export default CandidateProfile;
