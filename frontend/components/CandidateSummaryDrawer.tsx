
import React, { useState, useEffect, useId } from 'react';
import { 
    XMarkIcon, PhoneIcon, EnvelopeIcon, LinkedInIcon, CheckBadgeIcon, ArrowLeftIcon, UserIcon,
    BriefcaseIcon, CalendarDaysIcon, DocumentTextIcon,
    CheckCircleIcon, CalendarIcon, NoSymbolIcon, ArrowUturnLeftIcon, ArchiveBoxIcon,
    DocumentIcon, PhotoIcon, UserGroupIcon, BellIcon, Cog6ToothIcon, WhatsappIcon, ChatBubbleBottomCenterTextIcon, PlusIcon, BookmarkIcon, BookmarkIconSolid,
    PaperAirplaneIcon
} from './Icons';
import type { Candidate } from './CandidatesListView';
interface CandidateWithExtras extends Candidate {
  email?: string;
  salaryMin?: number;
  salaryMax?: number;
  age?: string | number;
  fullName?: string;
  professionalSummary?: string;
  summary?: string;
  workExperience?: any[];
  experience?: any[];
  education?: any[];
  searchText?: string;
  cvText?: string;
  resumeUrl?: string;
}
import ResumeViewer from './ResumeViewer';
import { MessageModalConfig } from '../hooks/useUIState';
import { TagInput } from './TagInput';
import { useNavigate } from 'react-router-dom';

type EventType = 'ראיון' | 'פגישה' | 'תזכורת' | 'משימת מערכת';
interface MockEvent {
  id: number;
  type: EventType;
  title: string;
  date: string;
}

type JobStatus = 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון' | 'הועבר ללקוח' | 'התקבל';
interface MockJob {
  id: number;
  jobTitle: string;
  company: string;
  status: JobStatus;
  updatedAt: string;
}

type DocumentType = 'קורות חיים' | 'תעודה' | 'מסמך זיהוי' | 'אחר';
interface MockDocument {
  id: number;
  name: string;
  type: DocumentType;
  uploadDate: string;
}

const apiBase = (import.meta as any).env?.VITE_API_BASE || '';

const getAuthHeaders = () => {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const crc32base64 = async (file: File) => {
    const table = new Uint32Array(256).map((_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const buf = new Uint8Array(await file.arrayBuffer());
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    crc = (crc ^ -1) >>> 0;
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, crc);
    return btoa(String.fromCharCode(...bytes));
};

const safeArray = (x: any) => Array.isArray(x) ? x : [];

const formatDateRange = (start?: string, end?: string) => {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s && !e) return '';
  if (s && !e) return s;
  if (!s && e) return e;
  return `${s} - ${e}`;
};

const formatWorkExp = (we: any) => {
  const range = formatDateRange(we?.startDate, we?.endDate);
  const title = String(we?.title || '').trim();
  const company = String(we?.company || '').trim();
  const desc = String(we?.description || '').trim();
  const head = [range, title, company].filter(Boolean).join(' · ');
  if (head && desc) return `${head}\n${desc}`;
  return head || desc || '';
};

const formatEdu = (edu: any) => {
  if (typeof edu === 'string') return edu;
  if (edu && typeof edu === 'object') {
    if (typeof edu.value === 'string') return edu.value;
    const parts = [edu.title, edu.institution, edu.year, edu.description].filter(Boolean);
    return parts.join(' · ');
  }
  return '';
};


// --- STYLES & HELPERS ---
const eventTypeStyles: { [key in EventType]: { icon: React.ReactNode; bg: string; text: string; } } = {
  'ראיון': { icon: <CalendarIcon className="w-4 h-4" />, bg: 'bg-secondary-100', text: 'text-secondary-800' },
  'פגישה': { icon: <UserGroupIcon className="w-4 h-4" />, bg: 'bg-primary-100', text: 'text-primary-800' },
  'תזכורת': { icon: <BellIcon className="w-4 h-4" />, bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'משימת מערכת': { icon: <Cog6ToothIcon className="w-5 h-5" />, bg: 'bg-gray-200', text: 'text-gray-800' },
};

const jobStatusStyles: { [key in JobStatus]: { bg: string; text: string; icon: React.ReactElement<{ className?: string }> } } = {
  'פעיל': { bg: 'bg-accent-100', text: 'text-accent-800', icon: <CheckCircleIcon className="w-4 h-4 text-accent-600" /> },
  'הוזמן לראיון': { bg: 'bg-secondary-100', text: 'text-secondary-800', icon: <CalendarIcon className="w-4 h-4 text-secondary-600" /> },
  'הועבר ללקוח': { bg: 'bg-blue-100', text: 'text-blue-800', icon: <PaperAirplaneIcon className="w-4 h-4 text-blue-600" /> },
  'התקבל': { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckBadgeIcon className="w-4 h-4 text-green-600" /> },
  'לא רלוונטי': { bg: 'bg-gray-200', text: 'text-gray-700', icon: <NoSymbolIcon className="w-4 h-4 text-gray-500" /> },
  'מועמד משך עניין': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <ArrowUturnLeftIcon className="w-4 h-4 text-yellow-600" /> },
  'בארכיון': { bg: 'bg-bg-card border border-border-default', text: 'text-text-muted', icon: <ArchiveBoxIcon className="w-4 h-4 text-text-subtle" /> },
};

const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'pdf': return <DocumentIcon className="w-6 h-6 text-red-500"/>;
        case 'doc':
        case 'docx': return <DocumentIcon className="w-6 h-6 text-secondary-500"/>;
        case 'jpg':
        case 'jpeg':
        case 'png': return <PhotoIcon className="w-6 h-6 text-accent-500"/>;
        default: return <DocumentIcon className="w-6 h-6 text-gray-500"/>;
    }
}

// --- TAB CONTENT COMPONENTS ---
const DetailsContent: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
    const [tags, setTags] = useState<string[]>(candidate.tags);

    useEffect(() => {
        setTags(candidate.tags);
    }, [candidate]);

    return (
        <div className="space-y-8">
            {/* Part 1: Summary & Personal Details */}
            <div>
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full font-bold text-3xl">
                    {candidate.avatar}
                    </div>
                    <div>
                    <h3 className="text-2xl font-extrabold text-text-default flex items-center">{candidate.name} <CheckBadgeIcon className="w-6 h-6 text-secondary-500 mr-2" /></h3>
                    <p className="text-text-muted">{candidate.title}</p>
                    </div>
                </div>

                <div className="mt-6 bg-bg-subtle p-4 rounded-lg border border-border-default">
                    <h4 className="font-bold text-text-muted mb-2 text-sm">תקציר אחרון (מראיון טלפוני / קו"ח)</h4>
                    <p className="text-sm text-text-default leading-relaxed">
                        {candidate.professionalSummary || 'אין תקציר זמין.'}
                    </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
                    <div>
                        <p className="font-semibold text-text-muted">גיל</p>
                        <p className="font-bold text-text-default">35</p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">כתובת</p>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(candidate.address || '')}`} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                            {candidate.address || 'לא צוין'}
                        </a>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">ציפיות שכר</p>
                        <p className="font-bold text-text-default">12,000 ₪</p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">לינקדאין</p>
                        <a href="#" className="font-bold text-primary-600 hover:underline flex items-center gap-1">
                            <LinkedInIcon className="w-4 h-4" />
                            <span>פרופיל</span>
                        </a>
                    </div>
                </div>
        
                <div className="mt-6 pt-6 border-t border-border-default space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">סטטוס נוכחי:</span>
                        <span className="font-bold text-text-default">{candidate.status}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">פעילות אחרונה:</span>
                        <span className="font-bold text-text-default">{candidate.lastActivity}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">מקור גיוס:</span>
                        <span className="font-bold text-text-default">{candidate.source}</span>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border-default space-y-4">
                    <div>
                        <p className="font-semibold text-text-muted text-sm mb-2">תגיות מועמד</p>
                        <TagInput tags={tags} setTags={setTags} placeholder="הוסף תגית..." />
                    </div>
                </div>
            </div>
        </div>
    );
};


const EventsContent: React.FC = () => (
    <div className="space-y-3">
        <div className="text-sm text-text-muted bg-bg-subtle/70 border border-border-default rounded-lg p-4">
            אין אירועים להצגה (עדיין לא מחובר לשרת).
        </div>
    </div>
);

const JobsContent: React.FC = () => (
    <div className="space-y-4">
        <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-text-default">תהליכים פעילים והפניות</h3>
            <span className="text-xs text-text-muted">0 משרות</span>
        </div>
        <div className="text-sm text-text-muted bg-bg-subtle/70 border border-border-default rounded-lg p-4">
            אין תהליכים להצגה (עדיין לא מחובר לשרת).
        </div>
    </div>
);

const DocumentsContent: React.FC = () => (
    <div className="space-y-3">
        <div className="text-sm text-text-muted bg-bg-subtle/70 border border-border-default rounded-lg p-4">
            אין מסמכים להצגה (עדיין לא מחובר לשרת).
        </div>
    </div>
);


const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold border-b-2 transition-colors duration-200 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-hover/50'
        }`}
    >
        {icon}
        <span>{title}</span>
    </button>
);

const ActionButton: React.FC<{ icon: React.ReactNode; tooltip: string; onClick?: () => void; href?: string }> = ({ icon, tooltip, onClick, href }) => {
    const content = (
         <>
            {icon}
         </>
    );
    
    const className = "w-12 h-12 flex items-center justify-center bg-bg-card rounded-full shadow-md border border-border-default text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-all duration-200";

    if (href) {
        return <a href={href} title={tooltip} className={className}>{content}</a>
    }

    return (
        <button onClick={onClick} title={tooltip} className={className}>
            {content}
        </button>
    );
};

// --- MAIN COMPONENT ---
interface CandidateSummaryDrawerProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onViewFullProfile?: (candidateId: number) => void;
  onOpenMessageModal?: (config: MessageModalConfig) => void;
  viewMode?: 'recruiter' | 'manager';
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
}

const CandidateSummaryDrawer: React.FC<CandidateSummaryDrawerProps> = ({ candidate, isOpen, onClose, onViewFullProfile, onOpenMessageModal, viewMode = 'recruiter', isFavorite, onToggleFavorite }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'events' | 'jobs' | 'documents'>('details');
  const titleId = useId();
  const [fullCandidate, setFullCandidate] = useState<any | null>(null);
  const [loadingCandidate, setLoadingCandidate] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [resumeUploadState, setResumeUploadState] = useState({ inProgress: false, message: '' });
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details');
    }
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (!isOpen || !candidate?.backendId) {
        if (isMounted) {
          setFullCandidate(null);
          setLoadingCandidate(false);
          setCandidateError(null);
        }
        return;
      }
      setLoadingCandidate(true);
      setCandidateError(null);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiBase}/api/candidates/${candidate.backendId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`Failed to load candidate (${res.status})`);
        const data = await res.json();
        if (isMounted) setFullCandidate(data);
      } catch (e: any) {
        if (isMounted) setCandidateError(e?.message || 'Failed to load candidate');
      } finally {
        if (isMounted) setLoadingCandidate(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [isOpen, candidate?.backendId]);

  if (!isOpen || !candidate) return null;

  const mergedCandidate = { ...candidate, ...fullCandidate } as CandidateWithExtras;
  const contactItems = [
    mergedCandidate.phone || '',
    mergedCandidate.email || '',
    mergedCandidate.address || '',
  ].filter(Boolean);

  const resumeUrl = String(mergedCandidate.resumeUrl || candidate.resumeUrl || '').trim();
  const resumeData = {
    name: String(mergedCandidate.fullName || mergedCandidate.name || '').trim(),
    contact: contactItems.join(' • '),
    summary: String(mergedCandidate.professionalSummary || mergedCandidate.summary || ''),
    experience: safeArray(mergedCandidate.workExperience || mergedCandidate.experience).map(formatWorkExp).filter(Boolean),
    education: safeArray(mergedCandidate.education).map(formatEdu).filter(Boolean),
    raw: String(mergedCandidate.searchText || mergedCandidate.cvText || ''),
    resumeUrl,
    candidateId: mergedCandidate.backendId || mergedCandidate.id,
  };
  const displayTags = safeArray(mergedCandidate.tags);
  const displayCandidate: CandidateWithExtras = {
    ...candidate,
    ...fullCandidate,
    name: resumeData.name || candidate.name,
    title: mergedCandidate.title || candidate.title || '',
    phone: mergedCandidate.phone || candidate.phone || '',
    address: mergedCandidate.address || candidate.address || '',
    professionalSummary: resumeData.summary || candidate.professionalSummary || '',
    tags: displayTags,
  };
  const displayPhone = displayCandidate.phone || '';
  const displayEmail = displayCandidate.email || '';
  const displayAddress = displayCandidate.address || '';

  const handleDownloadResume = () => {
    if (resumeUrl) {
      window.open(resumeUrl, '_blank');
    } else {
      alert('אין קובץ קורות חיים להורדה כרגע.');
    }
  };

  const handleUploadResume = async (file: File) => {
    const id = candidate?.backendId || candidate?.id;
    if (!id) {
      alert('לא ניתן להעלות קובץ ללא מזהה מועמד.');
      return;
    }
    const folder = 'resumes';
    const base = apiBase || '';
    try {
      setResumeUploadState({ inProgress: true, message: 'מכין העלאה...' });
      const presignRes = await fetch(`${base}/api/candidates/${id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
      });
      if (!presignRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, key } = await presignRes.json();
      const urlObj = new URL(uploadUrl);
      const checksum = urlObj.searchParams.get('x-amz-checksum-crc32');
      const checksumAlgo = urlObj.searchParams.get('x-amz-sdk-checksum-algorithm');
      const headers: Record<string, string> = {};
      if (file.type) headers['Content-Type'] = file.type;
      if (checksum && checksumAlgo === 'CRC32') {
        headers['x-amz-checksum-crc32'] = await crc32base64(file);
        headers['x-amz-sdk-checksum-algorithm'] = 'CRC32';
      }
      setResumeUploadState({ inProgress: true, message: 'מעלה קובץ...' });
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: Object.keys(headers).length ? headers : undefined,
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to S3 failed');
      setResumeUploadState({ inProgress: true, message: 'שומר קובץ...' });
      const attachRes = await fetch(`${base}/api/candidates/${id}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key, type: 'resume' }),
      });
      if (!attachRes.ok) throw new Error('Failed to attach media');
      const updated = await attachRes.json();
      setFullCandidate(updated);
    } catch (err: any) {
      console.error('Resume upload failed', err);
      alert(err?.message || 'העלאת קובץ נכשלה.');
    } finally {
      setResumeUploadState({ inProgress: false, message: '' });
    }
  };

  const handleOpenModal = (mode: 'whatsapp' | 'sms' | 'email') => {
    if (candidate && onOpenMessageModal) {
        onOpenMessageModal({
            mode,
            candidateName: resumeData.name || candidate.name,
            candidatePhone: displayPhone || candidate.phone,
        });
    }
  };

  const renderContent = (candidateResumeData: any) => {
    switch(activeTab) {
      case 'details': {
        return (
          <div className="space-y-4">
            {candidateError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                {candidateError}
              </div>
            )}
            {loadingCandidate && (
              <div className="bg-bg-subtle/70 border border-border-default rounded-lg p-3 text-sm text-text-muted">
                טוען נתוני מועמד מהשרת...
              </div>
            )}
            <div className="space-y-8">
              {/* Reuse existing layout but swap ResumeViewer to real resumeData */}
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full font-bold text-3xl">
                    {displayCandidate.avatar}
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-text-default flex items-center">
                      {displayCandidate.name} <CheckBadgeIcon className="w-6 h-6 text-secondary-500 mr-2" />
                    </h3>
                    <p className="text-text-muted">{displayCandidate.title}</p>
                  </div>
                </div>

                <div className="mt-6 bg-bg-subtle p-4 rounded-lg border border-border-default">
                  <h4 className="font-bold text-text-muted mb-2 text-sm">תקציר (מקו"ח)</h4>
                  <p className="text-sm text-text-default leading-relaxed">
                    {mergedCandidate.professionalSummary || 'אין תקציר זמין.'}
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
                  <div>
                    <p className="font-semibold text-text-muted">גיל</p>
                    <p className="font-bold text-text-default">{String(displayCandidate.age || fullCandidate?.age || '') || 'לא צוין'}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-text-muted">כתובת</p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mergedCandidate.address || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-primary-600 hover:underline"
                    >
                      {displayAddress || 'לא צוין'}
                      {displayAddress || 'לא צוין'}
                    </a>
                  </div>
                  <div>
                    <p className="font-semibold text-text-muted">ציפיות שכר</p>
                    <p className="font-bold text-text-default">
                      {displayCandidate.salaryMin || displayCandidate.salaryMax
                        ? `${displayCandidate.salaryMin || 0} - ${displayCandidate.salaryMax || 0} ₪`
                        : 'לא צוין'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-text-muted">לינקדאין</p>
                    <p className="font-bold text-text-default">לא צוין</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border-default space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted font-semibold">סטטוס נוכחי:</span>
                    <span className="font-bold text-text-default">{displayCandidate.status}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted font-semibold">פעילות אחרונה:</span>
                    <span className="font-bold text-text-default">{displayCandidate.lastActivity}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted font-semibold">מקור גיוס:</span>
                    <span className="font-bold text-text-default">{displayCandidate.source}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border-default space-y-4">
                  <div>
                    <p className="font-semibold text-text-muted text-sm mb-2">תגיות מועמד</p>
                    <TagInput tags={displayTags} setTags={() => { /* TODO: persist via backend */ }} placeholder="הוסף תגית..." />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-bold text-text-default">קורות חיים</h3>
                <ResumeViewer
                  resumeData={candidateResumeData}
                  resumeFileUrl={resumeUrl}
                  className="h-[600px]"
                  onDownloadResume={handleDownloadResume}
                  onUploadResume={handleUploadResume}
                  candidateId={mergedCandidate.id || mergedCandidate.backendId}
                />
                
              </div>
            </div>
          </div>
        );
      }
      case 'events': return <EventsContent />;
      case 'jobs': return <JobsContent />;
      case 'documents': return <DocumentsContent />;
      default: return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-30 z-[60] transition-opacity"
      onClick={onClose}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-card shadow-2xl flex flex-col transform transition-transform text-text-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideIn 0.3s forwards' }}
      >
        <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-card z-10">
          <div className="flex items-center gap-2">
             <button 
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(candidate.id); }} 
                className="p-2 rounded-full text-text-subtle hover:text-primary-500 hover:bg-bg-hover transition-colors"
                title={isFavorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            >
                {isFavorite ? <BookmarkIconSolid className="w-5 h-5 text-primary-500" /> : <BookmarkIcon className="w-5 h-5" />}
            </button>
            <h2 id={titleId} className="text-lg font-bold text-text-default">סיכום מועמד</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>
        
        <nav className="flex items-center border-b border-border-default bg-bg-card z-10">
            <TabButton title="פרטים אישיים" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} icon={<UserIcon className="w-5 h-5"/>} />
            {viewMode === 'recruiter' && (
              <TabButton title="אירועים" isActive={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<CalendarDaysIcon className="w-5 h-5"/>} />
            )}
            <TabButton title="תהליכים" isActive={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon={<BriefcaseIcon className="w-5 h-5"/>} />
            <TabButton title="מסמכים" isActive={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<DocumentTextIcon className="w-5 h-5"/>} />
        </nav>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {renderContent(resumeData)}
         
        </div>

        <footer className="p-4 bg-bg-subtle border-t border-border-default space-y-4 z-10">
            <div className="flex items-center justify-around">
                <ActionButton href={displayPhone ? `tel:${displayPhone}` : undefined} tooltip="התקשר" icon={<PhoneIcon className="w-6 h-6" />} />
                <ActionButton icon={<EnvelopeIcon className="w-6 h-6" />} tooltip="שלח מייל" onClick={() => handleOpenModal('email')} />
                <ActionButton icon={<ChatBubbleBottomCenterTextIcon className="w-6 h-6" />} tooltip="שלח SMS" onClick={() => handleOpenModal('sms')} />
                <ActionButton icon={<WhatsappIcon className="w-6 h-6" />} tooltip="שלח Whatsapp" onClick={() => handleOpenModal('whatsapp')} />
            </div>
            {    <button
                    onClick={() => {
                        if (!candidate) return;
                        const id = candidate.backendId || candidate.id;
                        if (!id) return;
                        navigate(`/candidates/${id}`);
                        onClose();
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm"
                >
                    <span>צפה בפרופיל המלא</span>
                    <ArrowLeftIcon className="w-5 h-5 text-primary-700 rotate-180" />
                </button>}
        </footer>
        <style>{`
            @keyframes slideIn {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
        `}</style>
      </div>
    </div>
  );
};

export default CandidateSummaryDrawer;