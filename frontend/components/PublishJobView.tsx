
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    LinkIcon, PencilIcon, SparklesIcon, ArrowLeftIcon, PlusIcon, TrashIcon, XMarkIcon, 
    ClipboardDocumentIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, PaperAirplaneIcon,
    ShareIcon, WhatsappIcon, EnvelopeIcon, EyeIcon, UserGroupIcon,
    FunnelIcon, ArrowPathIcon, PhotoIcon, ArrowTopRightOnSquareIcon
} from './Icons';
import AccordionSection from './AccordionSection';
import HiroAIChat from './HiroAIChat';
import { useLanguage } from '../context/LanguageContext';
import {
  fetchJobPublication,
  saveJobPublication,
  buildPublicJobUrl,
  resolvePublicClientRouteKey,
  createTrackingSrcKey,
  mapTrackingLinkFromApi,
  type TrackingLinkRow,
  fetchJobPublicationCandidates,
  fetchCompanyCreatedImages,
  fetchJobCompanyImagesWithFallback,
  generateHeroImage,
  type LandingLayout,
  type LayoutVariantContent,
  type LandingLayoutsMap,
  type CompanyCreatedImage,
  type LandingContact,
} from '../services/publishingApi';
import { fetchRecruitmentSourceOptions } from '../services/recruitmentSourcesApi';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolvePublishJobId = (routeJobId?: string, jobRecord?: { id?: unknown } | null): string => {
  const route = String(routeJobId || '').trim();
  const fromJob = String(jobRecord?.id || '').trim();
  if (UUID_RE.test(route)) return route;
  if (UUID_RE.test(fromJob)) return fromJob;
  return route || fromJob;
};

const LANDING_LAYOUT_OPTIONS: Array<{
  id: LandingLayout;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'detailed',
    title: 'מפורט (ברירת מחדל)',
    description: 'כל הפרטים שחולצו מהמודעה: דרישות, תנאים ופירוט מלא.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'summary',
    title: 'תקציר',
    description: 'כותרת ונקודות עיקריות בולטות, נקי ומרווח יותר.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    ),
  },
  {
    id: 'short',
    title: 'כותרת ותיאור קצר',
    description: 'מיקוד בחזון וטיזר קצר למשרה עצמה.',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8" />
      </svg>
    ),
  },
  {
    id: 'title_only',
    title: 'כותרת בלבד',
    description: 'מינימליזם טהור - רק גירוי ויזואלי מהמשתמש.',
    icon: <span className="font-bold text-lg leading-none block w-5 h-5 text-center">T</span>,
  },
];

function defaultVariantFromJob(layout: LandingLayout, job: any): LayoutVariantContent {
  const applied = applyLandingLayout(layout, job);
  return {
    publicJobTitle: applied.title,
    publicJobDescription: applied.description,
    publicJobRequirements: applied.requirements,
    contactEmail: '',
    contactPhone1: '',
    contactPhone2: '',
  };
}

function resolveCanonicalPublishContent(
  layouts: LandingLayoutsMap,
  pub: any,
  job: any,
): LayoutVariantContent {
  const fromDetailed = layouts.detailed;
  const fromPub = {
    publicJobTitle: pub?.publicJobTitle || '',
    publicJobDescription: htmlToPlainText(pub?.publicJobDescription || ''),
    publicJobRequirements: pub?.publicJobRequirements || '',
    contactEmail: pub?.contactEmail || '',
    contactPhone1: pub?.contactPhone1 || '',
    contactPhone2: pub?.contactPhone2 || '',
  };
  const fromJob = defaultVariantFromJob('detailed', job);
  const pick = (key: keyof LayoutVariantContent) =>
    String(fromDetailed?.[key] || fromPub[key] || fromJob[key] || '').trim()
      ? String(fromDetailed?.[key] || fromPub[key] || fromJob[key] || '')
      : String(fromPub[key] || fromJob[key] || '');

  return {
    publicJobTitle: pick('publicJobTitle'),
    publicJobDescription: pick('publicJobDescription'),
    publicJobRequirements: pick('publicJobRequirements'),
    contactEmail: pick('contactEmail'),
    contactPhone1: pick('contactPhone1'),
    contactPhone2: pick('contactPhone2'),
  };
}

function buildLayoutVariant(layout: LandingLayout, canonical: LayoutVariantContent): LayoutVariantContent {
  const applied = applyLandingLayout(layout, {
    publicJobTitle: canonical.publicJobTitle,
    title: canonical.publicJobTitle,
    PublicDescription: canonical.publicJobDescription,
    requirements: canonical.publicJobRequirements
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  });
  return {
    ...canonical,
    publicJobTitle: applied.title,
    publicJobDescription: applied.description,
    publicJobRequirements: applied.requirements,
  };
}

function normalizeLandingLayoutsFromPublication(pub: any, job: any): {
  layouts: LandingLayoutsMap;
  active: LandingLayout;
} {
  const active = (pub?.landingLayout as LandingLayout) || 'detailed';
  const layouts: LandingLayoutsMap =
    pub?.landingLayouts && typeof pub.landingLayouts === 'object'
      ? { ...pub.landingLayouts }
      : {};

  if (!layouts.detailed && (pub?.publicJobTitle || pub?.publicJobDescription)) {
    layouts.detailed = {
      publicJobTitle: pub.publicJobTitle || '',
      publicJobDescription: htmlToPlainText(pub.publicJobDescription || ''),
      publicJobRequirements: pub.publicJobRequirements || '',
      contactEmail: pub.contactEmail || '',
      contactPhone1: pub.contactPhone1 || '',
      contactPhone2: pub.contactPhone2 || '',
    };
  }

  if (!layouts[active]) {
    layouts[active] = defaultVariantFromJob(active, job);
  }

  return { layouts, active };
}

function applyLandingLayout(layout: LandingLayout, job: any): {
  title: string;
  description: string;
  requirements: string;
} {
  const fullTitle = job?.publicJobTitle || job?.title || '';
  const fullDesc = publicDescriptionFromJob(job);
  const reqs = Array.isArray(job?.requirements)
    ? job.requirements
    : job?.requirements
      ? [String(job.requirements)]
      : [];
  const reqsText = reqs.filter(Boolean).join('\n');

  switch (layout) {
    case 'detailed':
      return { title: fullTitle, description: fullDesc, requirements: reqsText };
    case 'summary': {
      const lines = fullDesc.split('\n').map((l) => l.trim()).filter(Boolean);
      const bullets = lines
        .filter((l) => l.startsWith('-') || l.startsWith('•'))
        .map((l) => l.replace(/^[-•]\s*/, '').trim());
      const highlights =
        bullets.length >= 2
          ? bullets.slice(0, 6).map((b) => `- ${b}`).join('\n')
          : lines
              .slice(0, 5)
              .map((l) => `- ${l.replace(/\*\*/g, '').trim()}`)
              .join('\n');
      return {
        title: fullTitle,
        description: highlights ? `**עיקרי התפקיד:**\n${highlights}` : fullDesc,
        requirements: reqs.slice(0, 6).join('\n'),
      };
    }
    case 'short': {
      const plain = fullDesc.replace(/\*\*/g, '');
      const firstPara = plain.split('\n\n')[0] || plain.split('\n')[0] || '';
      const teaser = firstPara.length > 300 ? `${firstPara.slice(0, 297)}...` : firstPara;
      return { title: fullTitle, description: teaser, requirements: '' };
    }
    case 'title_only':
      return { title: fullTitle, description: '', requirements: '' };
    default:
      return { title: fullTitle, description: fullDesc, requirements: reqsText };
  }
}

function htmlToPlainText(raw: string): string {
    if (!raw) return '';
    if (!raw.includes('<')) return raw;
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Same public-description sources as NewJobView (`formData.publicDescription`). */
function publicDescriptionFromJob(job: any): string {
    const raw = job?.PublicDescription ?? job?.publicDescription ?? job?.public_description;
    if (raw == null || raw === '') return '';
    return htmlToPlainText(String(raw));
}

// --- TYPES for complex screening questions ---
type AnswerType = 'Yes/No' | 'טקסט חופשי' | 'בחירה מרובה';

interface ScreeningQuestion {
    id: number;
    question: string;
    answerType: AnswerType;
    idealAnswer: string;
    isMandatory: boolean;
    category: string;
    isPublished: boolean;
    multipleChoiceOptions: string;
    order: number;
}

interface SourceCandidate {
    id: string;
    name: string;
    source: string;
    date: string;
    status: string;
    matchScore: number;
    city: string;
}

const emptyJob = {
    id: '',
    title: '',
    requirements: [] as string[],
    postingCode: '',
};

interface LandingPageField {
    key: string;
    label: string;
    status: 'mandatory' | 'optional';
}

const allPossibleFields: Omit<LandingPageField, 'status'>[] = [
    { key: 'firstName', label: 'שם פרטי' },
    { key: 'lastName', label: 'שם משפחה' },
    { key: 'fullName', label: 'שם מלא' },
    { key: 'phone', label: 'טלפון' },
    { key: 'email', label: 'דוא"ל' },
    { key: 'city', label: 'עיר מגורים' },
    { key: 'idNumber', label: 'תעודת זהות' },
    { key: 'drivingLicense', label: 'רישיון נהיגה' },
    { key: 'linkedin', label: 'קישור לינקדאין' },
    { key: 'cv', label: 'קורות חיים' },
    { key: 'interestedInJobs', label: 'מתעניין במשרות' },
    { key: 'notes', label: 'הערות' },
    { key: 'privacy', label: 'אישור פרטיות' },
];

const initialFields: LandingPageField[] = [
    { key: 'fullName', label: 'שם מלא', status: 'mandatory' },
    { key: 'phone', label: 'טלפון', status: 'mandatory' },
    { key: 'email', label: 'דוא"ל', status: 'mandatory' },
    { key: 'cv', label: 'קורות חיים', status: 'mandatory' },
    { key: 'privacy', label: 'אישור פרטיות', status: 'mandatory' },
    { key: 'linkedin', label: 'קישור לינקדאין', status: 'optional' },
];

const ToggleSwitch: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, checked, onChange }) => (
  <label className="flex items-center justify-between cursor-pointer bg-bg-subtle/70 p-3 rounded-lg border border-border-default/80">
    <span className="text-sm font-medium text-text-default">{label}</span>
    <div className="relative">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className={`block w-12 h-6 rounded-full transition ${checked ? 'bg-primary-600' : 'bg-border-default'}`}></div>
      <div className={`dot absolute left-1 top-1 bg-bg-card w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-6' : ''}`}></div>
    </div>
  </label>
);


interface PublishJobViewProps {
    job?: any;
}

const PublishJobView: React.FC<PublishJobViewProps> = ({ job: jobFromParent }) => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [job, setJob] = useState(jobFromParent || emptyJob);
    const [jobLoading, setJobLoading] = useState(false);
    const [jobError, setJobError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

    const [fallbackPostingCode] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
    const publishingCode = (job as any).postingCode || fallbackPostingCode;
    const [copySuccess, setCopySuccess] = useState(false);
    const [publicJobTitle, setPublicJobTitle] = useState((job as any).publicJobTitle || '');
    const [publicJobDescription, setPublicJobDescription] = useState(() =>
        publicDescriptionFromJob(jobFromParent || emptyJob),
    );
    const [publicJobRequirements, setPublicJobRequirements] = useState(
        Array.isArray(job.requirements) ? job.requirements.join('\n') : '',
    );
    const [landingContact, setLandingContact] = useState<LandingContact>({
        contactEmail: '',
        contactPhone1: '',
        contactPhone2: '',
    });
    const [videoUrl, setVideoUrl] = useState('');
    const [heroImageUrl, setHeroImageUrl] = useState('');
    const [heroGallery, setHeroGallery] = useState<CompanyCreatedImage[]>([]);
    const [heroGalleryLoading, setHeroGalleryLoading] = useState(false);
    const [clientLogoUrl, setClientLogoUrl] = useState<string | null>(null);
    const [clientDisplayName, setClientDisplayName] = useState('');
    const [brandColor, setBrandColor] = useState('#1e293b');
    const [publicRouteKey, setPublicRouteKey] = useState('');
    const [isGeneratingHero, setIsGeneratingHero] = useState(false);
    const [heroFeedback, setHeroFeedback] = useState<string | null>(null);
    const [isDesignMenuOpen, setIsDesignMenuOpen] = useState(false);
    const [selectedLandingLayout, setSelectedLandingLayout] = useState<LandingLayout | null>(null);
    const [landingLayouts, setLandingLayouts] = useState<LandingLayoutsMap>({});
    const heroDesignMenuRef = useRef<HTMLDivElement>(null);
    
    const [landingPageFields, setLandingPageFields] = useState<LandingPageField[]>(initialFields);
    const [isAddParamOpen, setIsAddParamOpen] = useState(false);
    const addParamRef = useRef<HTMLDivElement>(null);

    const initialScreeningQuestions: ScreeningQuestion[] = Array.isArray((job as any).screeningQuestions)
        ? (job as any).screeningQuestions
        : [];
    const [screeningQuestions, setScreeningQuestions] = useState<ScreeningQuestion[]>(initialScreeningQuestions);
    
    const [trackingLinks, setTrackingLinks] = useState<TrackingLinkRow[]>([]);
    
    const [newLinkSource, setNewLinkSource] = useState('');
    const [recruitmentSourceOptions, setRecruitmentSourceOptions] = useState<{ id: string; name: string }[]>([]);
    const [publishToGeneralBoard, setPublishToGeneralBoard] = useState(true);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);

    const [selectedSourceFilter, setSelectedSourceFilter] = useState<string | null>(null);
    const [sourceCandidates, setSourceCandidates] = useState<SourceCandidate[]>([]);
    const candidatesTableRef = useRef<HTMLDivElement>(null);

    const jobDisplayTitle = (job as any).title || (job as any).jobTitle || publicJobTitle || '—';
    const targetJobId = resolvePublishJobId(jobId, job as { id?: unknown });
    const postingCode = (job as any)?.postingCode || publishingCode;
    const linkRouteKey = publicRouteKey || undefined;

    const buildLinkUrl = (srcKey?: string) =>
        buildPublicJobUrl(targetJobId, srcKey, postingCode, linkRouteKey);

    const trackingLinksToPayload = (links: TrackingLinkRow[]) =>
        links.map((link) => ({
            id: link.id,
            source: link.source,
            srcKey: link.srcKey,
            url: buildPublicJobUrl(targetJobId, link.srcKey, postingCode, linkRouteKey),
            visits: link.views,
            submissions: link.applicants,
        }));

    useEffect(() => {
        const scrollContainer = document.getElementById('main-scroll-container');
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        }
    }, []);

    // If no job was passed from parent, fetch by jobId from route
    useEffect(() => {
        if (jobFromParent) return;
        let active = true;
        if (!jobId || !apiBase) {
            return;
        }
        setJobLoading(true);
        setJobError(null);
        fetch(`${apiBase}/api/jobs/${jobId}`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error('Failed to load job');
                }
                return res.json();
            })
            .then((data) => {
                if (!active) return;
                setJob(data);
            })
            .catch((err) => {
                if (!active) return;
                setJobError(err.message || 'Failed to load job');
            })
            .finally(() => {
                if (!active) return;
                setJobLoading(false);
            });
        return () => {
            active = false;
        };
    }, [apiBase, jobId, jobFromParent]);

    // If parent updates the job prop, sync it into local state
    useEffect(() => {
        if (jobFromParent) {
            setJob(jobFromParent);
        }
    }, [jobFromParent]);

    useEffect(() => {
        const anyJob: any = job;
        if (!anyJob?.id) return;
        // Seed layout map defaults from job when publication has not loaded variants yet.
        setLandingLayouts((prev) => {
            if (Object.keys(prev).length) return prev;
            return {
                detailed: defaultVariantFromJob('detailed', anyJob),
                summary: defaultVariantFromJob('summary', anyJob),
                short: defaultVariantFromJob('short', anyJob),
                title_only: defaultVariantFromJob('title_only', anyJob),
            };
        });
    }, [job]);

    useEffect(() => {
        if (!targetJobId || !postingCode) return;
        setTrackingLinks((prev) => {
            if (!prev.length) return prev;
            return prev.map((link) => ({
                ...link,
                url: buildPublicJobUrl(targetJobId, link.srcKey, postingCode, linkRouteKey),
            }));
        });
    }, [targetJobId, postingCode, linkRouteKey]);

    useEffect(() => {
        if (!targetJobId || !apiBase) return;
        if (!jobFromParent && jobLoading) return;
        if (!jobFromParent && jobId && !(job as any)?.title && !(job as any)?.publicJobTitle) return;

        let isMounted = true;
        fetchJobPublication(targetJobId)
            .then((pub) => {
                if (!isMounted || !pub) return;
                const { layouts, active: activeLayout } = normalizeLandingLayoutsFromPublication(pub, job);
                setLandingLayouts(layouts);
                setSelectedLandingLayout(activeLayout);
                const canonical = resolveCanonicalPublishContent(layouts, pub, job);
                const activeVariant = layouts[activeLayout];
                setPublicJobTitle(activeVariant?.publicJobTitle?.trim() || canonical.publicJobTitle);
                setPublicJobDescription(canonical.publicJobDescription);
                setPublicJobRequirements(canonical.publicJobRequirements);
                if (pub.clientLandingContact) {
                    setLandingContact(pub.clientLandingContact);
                }
                if (pub.clientBranding) {
                    setClientLogoUrl(pub.clientBranding.logoUrl || null);
                    setBrandColor(pub.clientBranding.primaryColor || '#1e293b');
                    if (pub.clientBranding.clientName) {
                        setClientDisplayName(pub.clientBranding.clientName);
                    }
                    const routeKey = resolvePublicClientRouteKey(pub.clientBranding?.domain);
                    if (routeKey) setPublicRouteKey(routeKey);
                }
                if (pub.videoUrl != null) setVideoUrl(pub.videoUrl || '');
                if (pub.heroImageUrl != null) setHeroImageUrl(pub.heroImageUrl || '');
                if (Array.isArray(pub.landingPageFields) && pub.landingPageFields.length) {
                    setLandingPageFields(pub.landingPageFields);
                }
                if (Array.isArray(pub.screeningQuestions)) {
                    setScreeningQuestions(pub.screeningQuestions);
                }
                if (Array.isArray(pub.trackingLinks)) {
                    const routeKeyFromPub = resolvePublicClientRouteKey(pub.clientBranding?.domain);
                    setTrackingLinks(
                        pub.trackingLinks.map((link: any) =>
                            mapTrackingLinkFromApi(
                                link,
                                targetJobId,
                                (job as any)?.postingCode || publishingCode,
                                routeKeyFromPub,
                            ),
                        ),
                    );
                }
                if (typeof pub.publishToGeneralBoard === 'boolean') {
                    setPublishToGeneralBoard(pub.publishToGeneralBoard);
                }
            })
            .catch(() => {});
        return () => { isMounted = false; };
    }, [job, jobId, apiBase, jobFromParent, jobLoading, publishingCode, targetJobId]);

    useEffect(() => {
        let active = true;
        setHeroGalleryLoading(true);

        const loadGallery = async () => {
            try {
                const images = await fetchCompanyCreatedImages();
                if (active) setHeroGallery(images || []);
                return;
            } catch {
                // fall through to job-scoped merge
            }

            if (!targetJobId) {
                if (active) setHeroGallery([]);
                return;
            }

            try {
                const images = await fetchJobCompanyImagesWithFallback(targetJobId);
                if (active) setHeroGallery(images || []);
            } catch {
                if (active) setHeroGallery([]);
            }
        };

        void loadGallery().finally(() => {
            if (active) setHeroGalleryLoading(false);
        });

        return () => { active = false; };
    }, [targetJobId, saveFeedback]);

    useEffect(() => {
        if (!apiBase) return;
        let isMounted = true;
        void fetchRecruitmentSourceOptions()
            .then((rows) => {
                if (!isMounted) return;
                setRecruitmentSourceOptions(rows.map((row) => ({ id: row.id, name: row.name })));
            })
            .catch(() => {
                if (!isMounted) return;
                setRecruitmentSourceOptions([]);
            });
        return () => { isMounted = false; };
    }, [apiBase]);

    const handleGenerateHeroImage = async (layoutOverride?: LandingLayout) => {
        const publishJobId = resolvePublishJobId(jobId, job as { id?: unknown });
        if (!publishJobId) return;

        const layout = layoutOverride || selectedLandingLayout;
        if (!layout) {
            setHeroFeedback('יש לבחור סגנון עיצוב מתפריט "צור עיצוב" לפני יצירת התמונה');
            setIsDesignMenuOpen(true);
            return;
        }
        if (!publicJobTitle.trim()) {
            setHeroFeedback('יש למלא כותרת משרה לפרסום לפני יצירת התמונה');
            return;
        }

        setIsGeneratingHero(true);
        setHeroFeedback(null);
        try {
            const result = await generateHeroImage(publishJobId, {
                aspectRatio: '16:9',
                landingLayout: layout,
                companyLogo: clientLogoUrl,
                clientName: clientDisplayName.trim() || undefined,
                brandColor,
                publicJobTitle: publicJobTitle.trim(),
                publicJobDescription: publicJobDescription,
                publicJobRequirements: publicJobRequirements,
                contactEmail: landingContact.contactEmail,
                contactPhone1: landingContact.contactPhone1,
                contactPhone2: landingContact.contactPhone2,
            });
            setHeroImageUrl(result.heroImageUrl || result.url);
            setHeroFeedback('המודעה נוצרה ב-Nano Banana ונשמרה');
            const refreshed = await fetchCompanyCreatedImages().catch(() =>
                fetchJobCompanyImagesWithFallback(publishJobId),
            );
            setHeroGallery(refreshed || []);
        } catch (err: any) {
            setHeroFeedback(err?.message || 'יצירת התמונה נכשלה');
        } finally {
            setIsGeneratingHero(false);
        }
    };

    useEffect(() => {
        const targetJobId = (job as any)?.id || jobId;
        if (!targetJobId || !apiBase) return;
        let active = true;
        fetchJobPublicationCandidates(String(targetJobId))
            .then((rows) => { if (active) setSourceCandidates(rows || []); })
            .catch(() => { if (active) setSourceCandidates([]); });
        return () => { active = false; };
    }, [(job as any)?.id, jobId, apiBase, saveFeedback]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (addParamRef.current && !addParamRef.current.contains(event.target as Node)) {
                setIsAddParamOpen(false);
            }
            if (heroDesignMenuRef.current && !heroDesignMenuRef.current.contains(event.target as Node)) {
                setIsDesignMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handlePublishingUpdate = (patch: Record<string, unknown>) => {
        if (patch.publicTitle != null) setPublicJobTitle(String(patch.publicTitle));
        if (patch.publicDescription != null) setPublicJobDescription(String(patch.publicDescription));
        if (patch.publicRequirements != null) setPublicJobRequirements(String(patch.publicRequirements));
    };

    const handleFieldStatusChange = (key: string, newStatus: 'mandatory' | 'optional') => {
        setLandingPageFields(prev => prev.map(field => field.key === key ? { ...field, status: newStatus } : field));
    };

    const handleRemoveField = (key: string) => {
        setLandingPageFields(prev => prev.filter(field => field.key !== key));
    };

    const availableFields = allPossibleFields.filter(
        p => !landingPageFields.some(f => f.key === p.key)
    );

    const handleAddField = (field: Omit<LandingPageField, 'status'>) => {
        setLandingPageFields(prev => [...prev, { ...field, status: 'optional' }]);
        setIsAddParamOpen(false);
    };
    
    const handleAddQuestion = () => {
        const newQuestion: ScreeningQuestion = {
            id: Date.now(),
            question: '',
            answerType: 'טקסט חופשי',
            idealAnswer: '',
            isMandatory: false,
            category: 'כללי',
            isPublished: true,
            multipleChoiceOptions: '',
            order: screeningQuestions.length + 1,
        };
        setScreeningQuestions(prev => [...prev, newQuestion]);
    };

    const handleQuestionChange = (index: number, field: keyof ScreeningQuestion, value: any) => {
        const newQuestions = [...screeningQuestions];
        const questionToUpdate = { ...newQuestions[index], [field]: value };

        if (field === 'answerType') {
            if (value === 'Yes/No') questionToUpdate.idealAnswer = 'Yes';
            else questionToUpdate.idealAnswer = '';
        }

        newQuestions[index] = questionToUpdate;
        setScreeningQuestions(newQuestions);
    };

    const handleRemoveQuestion = (index: number) => {
        setScreeningQuestions(prev => prev.filter((_, i) => i !== index));
    };
    
    const handleReorderQuestion = (index: number, direction: 'up' | 'down') => {
        const newQuestions = [...screeningQuestions];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newQuestions.length) return;
        [newQuestions[index], newQuestions[targetIndex]] = [newQuestions[targetIndex], newQuestions[index]];
        const reordered = newQuestions.map((q, i) => ({ ...q, order: i + 1 }));
        setScreeningQuestions(reordered);
    };

    const formToVariant = (): LayoutVariantContent => ({
        publicJobTitle,
        publicJobDescription,
        publicJobRequirements,
        contactEmail: '',
        contactPhone1: '',
        contactPhone2: '',
    });

    const persistPublication = async (linksOverride?: TrackingLinkRow[]) => {
        if (!apiBase) {
            throw new Error('לא הוגדר API בסיסי');
        }
        if (!targetJobId) {
            throw new Error('לא נמצא מזהה משרה לשמירה');
        }

        const activeLayout = selectedLandingLayout || 'detailed';
        const canonical = formToVariant();
        const updatedLayouts: LandingLayoutsMap = { ...landingLayouts };
        updatedLayouts.detailed = { ...(updatedLayouts.detailed || {}), ...canonical };
        updatedLayouts[activeLayout] = buildLayoutVariant(activeLayout, canonical);

        const payload = {
            publicJobTitle: canonical.publicJobTitle.trim() || null,
            publicJobDescription: canonical.publicJobDescription,
            publicJobRequirements: canonical.publicJobRequirements,
            landingLayout: activeLayout,
            landingLayouts: updatedLayouts,
            videoUrl: videoUrl.trim() || null,
            heroImageUrl: heroImageUrl.trim() || null,
            landingPageFields,
            screeningQuestions,
            trackingLinks: trackingLinksToPayload(linksOverride ?? trackingLinks),
            publishToGeneralBoard,
        };

        await saveJobPublication(targetJobId, payload);
        setLandingLayouts(updatedLayouts);
        const refreshed = await fetchJobPublicationCandidates(targetJobId);
        setSourceCandidates(refreshed || []);
        return payload;
    };

    const handleCreateLink = async () => {
        const label = newLinkSource.trim();
        if (!label || !targetJobId) return;

        const existingKeys = new Set(trackingLinks.map((l) => l.srcKey));
        let srcKey = createTrackingSrcKey(label);
        while (existingKeys.has(srcKey)) {
            srcKey = createTrackingSrcKey(label);
        }

        const newLink: TrackingLinkRow = {
            id: srcKey,
            source: label,
            srcKey,
            url: buildLinkUrl(srcKey),
            views: 0,
            applicants: 0,
        };
        const nextLinks = [newLink, ...trackingLinks];
        setTrackingLinks(nextLinks);
        setNewLinkSource('');

        try {
            setIsSaving(true);
            setSaveFeedback(null);
            await persistPublication(nextLinks);
            setSaveFeedback('הקישור נוצר ונשמר — ניתן לשתף ולפרסם');
        } catch (err: any) {
            setSaveFeedback(err?.message || 'יצירת הקישור נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenTrackingLink = async (link: TrackingLinkRow) => {
        try {
            setIsSaving(true);
            setSaveFeedback(null);
            await persistPublication();
            window.open(buildLinkUrl(link.srcKey), '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            setSaveFeedback(err?.message || 'לא ניתן לפתוח את דף הנחיתה — שמור את השינויים ונסה שוב');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveLink = (id: number | string) => {
        setTrackingLinks(prev => prev.filter(link => link.id !== id));
    };

    const handleSelectLandingLayout = async (layout: LandingLayout, options?: { generateAfter?: boolean }) => {
        const canonical = formToVariant();
        const updatedLayouts: LandingLayoutsMap = { ...landingLayouts };
        updatedLayouts.detailed = { ...(updatedLayouts.detailed || {}), ...canonical };
        if (selectedLandingLayout) {
            updatedLayouts[selectedLandingLayout] = buildLayoutVariant(selectedLandingLayout, canonical);
        }
        updatedLayouts[layout] = buildLayoutVariant(layout, canonical);

        setLandingLayouts(updatedLayouts);
        setSelectedLandingLayout(layout);
        setIsDesignMenuOpen(false);

        const targetJobId = (job as any)?.id || jobId;
        if (targetJobId && apiBase) {
            try {
                await saveJobPublication(String(targetJobId), {
                    landingLayout: layout,
                    landingLayouts: updatedLayouts,
                    publicJobTitle: canonical.publicJobTitle.trim() || null,
                    publicJobDescription: canonical.publicJobDescription,
                    publicJobRequirements: canonical.publicJobRequirements,
                });
            } catch {
                // User can still save manually from header
            }
        }

        if (options?.generateAfter) {
            await handleGenerateHeroImage(layout);
        }
    };

    const handleOpenLandingPreview = async () => {
        if (!targetJobId) return;
        try {
            setIsSaving(true);
            await persistPublication();
            window.open(buildLinkUrl(), '_blank', 'noopener,noreferrer');
        } catch (err: any) {
            setSaveFeedback(err?.message || 'לא ניתן לפתוח תצוגה מקדימה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(publishingCode).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        });
    };

    // Share Handlers
    const handleShareWhatsapp = (url: string, title: string) => {
        const text = encodeURIComponent(`משרה חדשה מעניינת: ${title}\n${url}`);
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    const handleShareEmail = (url: string, title: string) => {
        const subject = encodeURIComponent(`משרה חדשה: ${title}`);
        const body = encodeURIComponent(`היי,\n\nנתקלתי במשרה הזו שעשויה לעניין אותך:\n${title}\n\nלפרטים נוספים והגשה:\n${url}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    };

    const handleShareLinkedin = (url: string) => {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
    };
    
    const handleSourceClick = (sourceName: string) => {
        setSelectedSourceFilter(sourceName);
        if (candidatesTableRef.current) {
            candidatesTableRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const handleSavePublishingSettings = async () => {
        setIsSaving(true);
        setSaveFeedback(null);
        try {
            await persistPublication();
            setSaveFeedback('השינויים נשמרו בהצלחה');
        } catch (err: any) {
            setSaveFeedback(err?.message || 'שמירת השינויים נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredCandidates = useMemo(() => {
        if (!selectedSourceFilter) return sourceCandidates;
        return sourceCandidates.filter(c => c.source === selectedSourceFilter);
    }, [selectedSourceFilter, sourceCandidates]);

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-20 relative animate-fade-in">
             <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">פרסום משרה: {jobDisplayTitle}</h1>
                    <p className="text-sm text-text-muted">הגדר את עמוד הנחיתה, שאלות הסינון וקישורי המעקב עבור המשרה.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleSavePublishingSettings}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
                    >
                        {isSaving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckIcon className="w-5 h-5" />}
                        <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                    </button>
                    <button 
                        onClick={() => setIsChatOpen(true)}
                        className="flex items-center gap-2 bg-white text-primary-600 border border-primary-100 font-bold py-2 px-4 rounded-lg hover:bg-primary-50 transition shadow-sm"
                    >
                        <SparklesIcon className="w-5 h-5" />
                        <span>ייעוץ AI לפרסום</span>
                    </button>
                    <button onClick={() => navigate(`/jobs/edit/${(job as any)?.id || jobId}`)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>חזור למשרה</span>
                    </button>
                </div>
            </header>

           
            {jobLoading && (
                <p className="text-xs text-text-muted">טוען נתוני משרה...</p>
            )}
            {jobError && (
                <p className="text-xs text-red-600">{jobError}</p>
            )}
            {saveFeedback && (
                <p className={`text-xs ${saveFeedback.includes('בהצלחה') ? 'text-green-600' : 'text-red-600'}`}>
                    {saveFeedback}
                </p>
            )}

            <AccordionSection title="פרטי משרה לפרסום" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-text-muted">קוד לפרסום</label>
                        <div 
                            onClick={handleCopyCode}
                            className="bg-bg-subtle border border-border-default rounded-md p-1.5 flex items-center gap-2 cursor-pointer group hover:bg-primary-50 hover:border-primary-300 transition"
                        >
                            <span className="font-mono font-semibold text-sm text-text-default tracking-widest">{publishingCode}</span>
                            {copySuccess ? (
                                <CheckIcon className="w-4 h-4 text-green-500" />
                            ) : (
                                <ClipboardDocumentIcon className="w-4 h-4 text-text-subtle group-hover:text-primary-600" />
                            )}
                        </div>
                    </div>
                  
                     {copySuccess && <p className="text-xs text-green-600 -mt-2 text-left animate-fade-in">הקוד הועתק!</p>}

                    <div>
                        <label className="block text-base font-bold text-text-default mb-2">כותרת משרה (לפרסום)</label>
                        <input 
                            type="text" 
                            value={publicJobTitle}
                            onChange={(e) => setPublicJobTitle(e.target.value)}
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>
                    
                     <div>
                        <label className="block text-base font-bold text-text-default mb-2">תיאור משרה (לפרסום)</label>
                        <textarea
                            rows={6}
                            value={publicJobDescription}
                            onChange={(e) => setPublicJobDescription(e.target.value)}
                            placeholder="טקסט קצר ומושך למועמדים..."
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>

                     <div>
                        <label className="block text-base font-bold text-text-default mb-2">דרישות (לפרסום)</label>
                        <textarea 
                            value={publicJobRequirements}
                            onChange={(e) => setPublicJobRequirements(e.target.value)}
                            rows={4}
                            placeholder="כל דרישה בשורה נפרדת"
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        />
                    </div>

                    {selectedLandingLayout && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-border-subtle">
                        <p className="md:col-span-2 text-xs text-text-muted">
                            פרטי הקשר נלקחים מ{' '}
                            <button
                                type="button"
                                onClick={() => navigate('/settings/company')}
                                className="text-primary-600 hover:underline font-semibold"
                            >
                                הגדרות החברה
                            </button>
                            {' '}→ פרמטרים → פרטי קשר לדפי נחיתה
                        </p>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-text-muted mb-1 uppercase">אימייל</label>
                            <input
                                type="email"
                                value={landingContact.contactEmail}
                                readOnly
                                className="w-full bg-bg-subtle/70 border border-border-default text-text-default text-sm rounded-lg block p-2.5 cursor-default"
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1 uppercase">טלפון 1</label>
                            <input
                                type="tel"
                                value={landingContact.contactPhone1}
                                readOnly
                                className="w-full bg-bg-subtle/70 border border-border-default text-text-default text-sm rounded-lg block p-2.5 cursor-default"
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1 uppercase">טלפון 2</label>
                            <input
                                type="tel"
                                value={landingContact.contactPhone2}
                                readOnly
                                className="w-full bg-bg-subtle/70 border border-border-default text-text-default text-sm rounded-lg block p-2.5 cursor-default"
                                dir="ltr"
                            />
                        </div>
                    </div>
                    )}
                </div>
            </AccordionSection>

            <AccordionSection title="ערוצי פרסום" icon={<PaperAirplaneIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-3">
                    <ToggleSwitch 
                        label="פרסם בלוח המשרות הכללי"
                        name="publishToBoard"
                        checked={publishToGeneralBoard}
                        onChange={(e) => setPublishToGeneralBoard(e.target.checked)}
                    />
                </div>
            </AccordionSection>

            <AccordionSection title="הגדרות עמוד הנחיתה" icon={<SparklesIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-3">
                    {landingPageFields.map(field => (
                        <div key={field.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-bg-subtle/70 p-2 rounded-lg">
                            <span className="font-semibold text-text-default text-sm">{field.label}</span>
                            <div className="flex items-center bg-bg-card p-1 rounded-md border border-border-default">
                                <button onClick={() => handleFieldStatusChange(field.key, 'mandatory')} className={`px-3 py-0.5 text-xs rounded ${field.status === 'mandatory' ? 'bg-primary-500 text-white' : 'text-text-muted'}`}>חובה</button>
                                <button onClick={() => handleFieldStatusChange(field.key, 'optional')} className={`px-3 py-0.5 text-xs rounded ${field.status === 'optional' ? 'bg-primary-500 text-white' : 'text-text-muted'}`}>רשות</button>
                            </div>
                            <button onClick={() => handleRemoveField(field.key)} className="p-2 text-text-subtle hover:text-red-600 rounded-full hover:bg-red-50"><TrashIcon className="w-4 h-4"/></button>
                        </div>
                    ))}
                    <div className="relative" ref={addParamRef}>
                        <button onClick={() => setIsAddParamOpen(!isAddParamOpen)} className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition">
                            <PlusIcon className="w-5 h-5" />
                            <span>הוסף שדה</span>
                        </button>
                        {isAddParamOpen && availableFields.length > 0 && (
                             <div className="absolute bottom-full mb-2 w-full bg-bg-card border border-border-default rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                                {availableFields.map(field => (
                                    <button key={field.key} onClick={() => handleAddField(field)} className="w-full text-right px-4 py-2 text-sm hover:bg-bg-hover">{field.label}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </AccordionSection>

            <AccordionSection title="תמונת נושא / באנר / וידאו" icon={<PhotoIcon className="w-5 h-5" />} defaultOpen>
                <div className="space-y-4">
                    <p className="text-sm text-text-muted">בחר תמונה או הזן קישור לוידאו (YouTube) שיופיעו בראש דף הנחיתה.</p>
                    <div>
                        <label className="block text-sm font-semibold text-text-default mb-1">קישור לוידאו (YouTube)</label>
                        <div className="relative">
                            <input
                                type="url"
                                value={videoUrl}
                                onChange={(e) => setVideoUrl(e.target.value)}
                                placeholder="https://www.youtube.com/watch?v=..."
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition pr-10 shadow-sm"
                                dir="ltr"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-default mb-1">קישור לתמונת נושא / באנר</label>
                        <input
                            type="url"
                            value={heroImageUrl}
                            onChange={(e) => setHeroImageUrl(e.target.value)}
                            placeholder="https://..."
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                            dir="ltr"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => handleGenerateHeroImage()}
                            disabled={isGeneratingHero || !selectedLandingLayout}
                            className="flex flex-col items-center justify-center gap-2 p-4 border border-border-default rounded-xl hover:border-primary-500 hover:bg-primary-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isGeneratingHero ? (
                                <ArrowPathIcon className="w-6 h-6 text-primary-600 animate-spin" />
                            ) : (
                                <SparklesIcon className="w-6 h-6 text-primary-600" />
                            )}
                            <span className="font-semibold text-sm text-text-default">
                                {isGeneratingHero ? 'Nano Banana מצייר...' : 'צור תמונה עם Nano Banana'}
                            </span>
                            <span className="text-xs text-text-muted text-center leading-tight">
                                {selectedLandingLayout
                                    ? `סגנון: ${LANDING_LAYOUT_OPTIONS.find((o) => o.id === selectedLandingLayout)?.title || selectedLandingLayout} · ${brandColor}`
                                    : 'יש לבחור סגנון עיצוב מתפריט "צור עיצוב"'}
                            </span>
                        </button>
                        <div className="flex flex-col p-4 border border-border-default rounded-xl max-h-64 overflow-y-auto">
                            <span className="font-semibold text-sm text-text-default mb-2">תמונות הלקוח</span>
                            {heroGalleryLoading ? (
                                <span className="text-xs text-text-muted text-center py-4">טוען תמונות...</span>
                            ) : heroGallery.length === 0 ? (
                                <>
                                    <span className="font-semibold text-sm text-text-muted mb-1 opacity-50">אין תמונות ללקוח זה</span>
                                    <span className="text-xs text-text-subtle text-center">צור תמונה עם Nano Banana או הוסף בהגדרות → תמונות שנוצרו</span>
                                </>
                            ) : (
                                <div className="grid grid-cols-2 gap-2 w-full">
                                    {heroGallery.map((img) => (
                                        <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => setHeroImageUrl(img.url)}
                                            className={`relative aspect-video rounded-lg overflow-hidden border-2 transition ${heroImageUrl === img.url ? 'border-primary-500 ring-2 ring-primary-200' : 'border-border-default hover:border-primary-300'}`}
                                            title={img.label || 'בחר תמונה'}
                                        >
                                            <img src={img.url} alt={img.label || ''} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative" ref={heroDesignMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsDesignMenuOpen((v) => !v)}
                            disabled={isGeneratingHero}
                            className="w-full flex items-center justify-between text-white font-bold py-3 px-4 rounded-lg hover:opacity-90 transition disabled:opacity-60"
                            style={{ backgroundColor: brandColor || '#9e1c22' }}
                        >
                            <span>צור עיצוב</span>
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5" />
                                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isDesignMenuOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </button>
                        {selectedLandingLayout && (
                            <p className="text-xs text-text-muted mt-2">
                                נבחר: {LANDING_LAYOUT_OPTIONS.find((o) => o.id === selectedLandingLayout)?.title}
                            </p>
                        )}
                        {isDesignMenuOpen && (
                            <div className="mt-2 bg-white border border-border-default rounded-xl shadow-lg p-2 space-y-1 animate-fade-in z-20 relative">
                                {LANDING_LAYOUT_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => handleSelectLandingLayout(option.id, { generateAfter: true })}
                                        disabled={isGeneratingHero}
                                        className={`w-full text-right p-3 hover:bg-primary-50 rounded-lg flex items-start gap-4 transition group disabled:opacity-50 ${
                                            selectedLandingLayout === option.id ? 'bg-primary-50 ring-1 ring-primary-200' : ''
                                        }`}
                                    >
                                        <div className="bg-primary-100 text-primary-600 p-2 rounded-md group-hover:bg-primary-200 transition shrink-0">
                                            {option.icon}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-text-default text-sm">{option.title}</h4>
                                            <p className="text-xs text-text-muted mt-0.5">{option.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {heroImageUrl.trim() && (
                        <div className="rounded-xl border border-border-default overflow-hidden bg-slate-50">
                            <div className="px-4 py-3 border-b border-border-default flex items-center justify-between gap-3 bg-white">
                                <span className="text-sm font-bold text-text-default">תצוגה מקדימה — באנר נבחר</span>
                                <button
                                    type="button"
                                    onClick={() => window.open(heroImageUrl.trim(), '_blank', 'noopener,noreferrer')}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                                >
                                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    פתח בלשונית חדשה
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => window.open(heroImageUrl.trim(), '_blank', 'noopener,noreferrer')}
                                className="block w-full group cursor-pointer aspect-video bg-slate-200 relative overflow-hidden"
                                title="לחץ לפתיחה בלשונית חדשה"
                            >
                                <img
                                    src={heroImageUrl.trim()}
                                    alt="באנר משרה"
                                    className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
                                />
                                <p className="absolute bottom-0 inset-x-0 text-xs text-text-muted text-center py-2 bg-white/80 group-hover:text-primary-600 transition-colors">
                                    לחץ על התמונה לצפייה בגודל מלא
                                </p>
                            </button>
                        </div>
                    )}
                    {heroFeedback && (
                        <p className={`text-xs ${heroFeedback.includes('נכשל') ? 'text-red-600' : 'text-green-600'}`}>{heroFeedback}</p>
                    )}
                </div>
            </AccordionSection>
            
            <AccordionSection title="שאלות סינון למועמדים" icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-4">
                    {screeningQuestions.map((q, index) => (
                        <div key={q.id} className="bg-bg-subtle/50 p-4 rounded-lg border border-border-default space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-text-default">שאלה #{index + 1}</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => handleReorderQuestion(index, 'up')} disabled={index === 0} className="p-1.5 text-text-muted hover:text-text-default disabled:opacity-30"><ChevronUpIcon className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => handleReorderQuestion(index, 'down')} disabled={index === screeningQuestions.length - 1} className="p-1.5 text-text-muted hover:text-text-default disabled:opacity-30"><ChevronDownIcon className="w-4 h-4"/></button>
                                    <button type="button" onClick={() => handleRemoveQuestion(index)} className="p-1.5 text-red-500 hover:text-red-700"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                            <textarea value={q.question} onChange={e => handleQuestionChange(index, 'question', e.target.value)} rows={2} placeholder="הזן את שאלת הסינון..." className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <select name="answerType" value={q.answerType} onChange={e => handleQuestionChange(index, 'answerType', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option value="טקסט חופשי">טקסט חופשי</option>
                                    <option value="Yes/No">Yes/No</option>
                                    <option value="בחירה מרובה">בחירה מרובה</option>
                                </select>
                                
                                <div className="flex items-end gap-2">
                                    {q.answerType === 'Yes/No' && ( <select name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"><option>Yes</option><option>No</option></select> )}
                                    {q.answerType === 'טקסט חופשי' && <input name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" placeholder="תשובה אידיאלית (אופציונלי)" />}
                                    {q.answerType === 'בחירה מרובה' && (
                                        <div className="flex-grow space-y-2">
                                            <input name="multipleChoiceOptions" value={q.multipleChoiceOptions} onChange={e => handleQuestionChange(index, 'multipleChoiceOptions', e.target.value)} placeholder="אפשרויות (מופרד בפסיק)" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                                            <input name="idealAnswer" value={q.idealAnswer} onChange={e => handleQuestionChange(index, 'idealAnswer', e.target.value)} placeholder="תשובה אידיאלית" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                                        </div>
                                    )}
                                </div>

                                <select name="category" value={q.category} onChange={e => handleQuestionChange(index, 'category', e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option>כללי</option> <option>שעות עבודה</option> <option>שכר</option> <option>ניסיון</option> <option>השכלה</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between pt-2">
                                <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" name="isMandatory" checked={q.isMandatory} onChange={e => handleQuestionChange(index, 'isMandatory', e.target.checked)} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 bg-bg-input" /><span className="text-sm font-semibold text-text-muted">תנאי חובה</span></label>
                                <label className="flex items-center gap-2 text-sm font-medium text-text-default cursor-pointer flex-shrink-0" title="הצג שאלה זו בטופס הגשת המועמדות"><input type="checkbox" checked={q.isPublished} onChange={e => handleQuestionChange(index, 'isPublished', e.target.checked)} className="w-4 h-4 text-primary-600 bg-bg-card border-border-default rounded focus:ring-primary-500" /><span>פרסם</span></label>
                            </div>
                        </div>
                    ))}
                    <button type="button" onClick={handleAddQuestion} className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition">
                        <PlusIcon className="w-5 h-5" />
                        <span>הוסף שאלה חדשה</span>
                    </button>
                </div>
            </AccordionSection>

            <AccordionSection title="קישורים וסטטיסטיקה של דפי פרסום למשרה זו" icon={<LinkIcon className="w-5 h-5"/>} defaultOpen>
                 <p className="text-xs text-text-muted mb-4">
                    כל קישור מקבל מזהה ייחודי (<code className="font-mono">?src=</code>) למעקב קמפיינים. הקישור משתמש בקוד הפרסום של המשרה ונשמר אוטומטית בעת יצירה.
                 </p>
                 <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                    <div className="relative flex-grow w-full min-w-0">
                        <input
                            type="text"
                            list="publish-job-recruitment-source-options"
                            value={newLinkSource}
                            onChange={(e) => setNewLinkSource(e.target.value)}
                            placeholder="בחרו מקור גיוס מהרשימה או הקלידו שם חדש..."
                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                        />
                        <datalist id="publish-job-recruitment-source-options">
                            {recruitmentSourceOptions.map((source) => (
                                <option key={source.id} value={source.name} />
                            ))}
                        </datalist>
                    </div>
                    <button onClick={handleCreateLink} disabled={isSaving || !newLinkSource.trim()} className="w-full sm:w-auto bg-primary-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-600 transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                        <PlusIcon className="w-5 h-5"/>
                        <span>יצירת קישור</span>
                    </button>
                </div>
                
                {trackingLinks.length > 0 && (
                    <div className="border border-border-default rounded-lg overflow-hidden">
                         <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right min-w-[700px]">
                                <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
                                    <tr>
                                        <th className="px-4 py-3">מקור גיוס</th>
                                        <th className="px-4 py-3 text-center">כניסות</th>
                                        <th className="px-4 py-3 text-center">הגשות</th>
                                        <th className="px-4 py-3 text-center">אחוז המרה</th>
                                        <th className="px-4 py-3 text-center">פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {trackingLinks.map(link => {
                                        const conversionRate = link.views > 0 ? ((link.applicants / link.views) * 100).toFixed(1) : '0.0';
                                        return (
                                            <tr key={link.id} className="bg-bg-card hover:bg-bg-hover transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-text-default">{link.source}</div>
                                                    <div className="text-xs text-text-muted font-mono truncate max-w-[200px]" title={link.url}>{link.url}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <EyeIcon className="w-4 h-4 text-text-subtle" />
                                                        <span className="font-bold">{link.views}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                     <button 
                                                        className="flex items-center justify-center gap-1.5 hover:text-primary-600 transition-colors"
                                                        onClick={() => handleSourceClick(link.source)}
                                                        title="צפה במועמדים"
                                                     >
                                                        <UserGroupIcon className="w-4 h-4 text-text-subtle" />
                                                        <span className="font-bold underline decoration-dotted">{link.applicants}</span>
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="w-16 bg-bg-subtle rounded-full h-1.5 overflow-hidden">
                                                            <div className={`h-full rounded-full ${Number(conversionRate) > 10 ? 'bg-green-500' : Number(conversionRate) > 5 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{width: `${Math.min(Number(conversionRate), 100)}%`}}></div>
                                                        </div>
                                                        <span className="text-xs font-semibold">{conversionRate}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center items-center gap-1">
                                                        <button 
                                                            onClick={() => navigator.clipboard.writeText(link.url)} 
                                                            title="העתק קישור"
                                                            className="p-1.5 text-text-subtle hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
                                                        >
                                                            <ClipboardDocumentIcon className="w-4 h-4"/>
                                                            <span className="sr-only">העתק</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleShareWhatsapp(link.url, publicJobTitle)} 
                                                            title="שתף ב-WhatsApp"
                                                            className="p-1.5 text-text-subtle hover:text-[#25D366] rounded-md hover:bg-green-50 transition"
                                                        >
                                                            <WhatsappIcon className="w-4 h-4"/>
                                                        </button>
                                                         <button 
                                                            onClick={() => handleShareLinkedin(link.url)} 
                                                            title="שתף ב-LinkedIn"
                                                            className="p-1.5 text-text-subtle hover:text-[#0077b5] rounded-md hover:bg-blue-50 transition"
                                                        >
                                                            <ShareIcon className="w-4 h-4"/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleShareEmail(link.url, publicJobTitle)} 
                                                            title="שתף במייל"
                                                            className="p-1.5 text-text-subtle hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
                                                        >
                                                            <EnvelopeIcon className="w-4 h-4"/>
                                                        </button>
                                                        <div className="w-px h-4 bg-border-subtle mx-1"></div>
                                                        <button
                                                            onClick={() => handleOpenTrackingLink(link)}
                                                            title="פתח קישור"
                                                            className="p-1.5 text-text-subtle hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
                                                        >
                                                            <ArrowTopRightOnSquareIcon className="w-4 h-4"/>
                                                        </button>
                                                        <button onClick={() => handleRemoveLink(link.id)} title="מחק קישור" className="p-1.5 text-text-subtle hover:text-red-600 rounded-md hover:bg-red-50 transition">
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {/* Total Row */}
                                    <tr className="bg-bg-subtle font-bold border-t-2 border-border-default">
                                        <td className="px-4 py-3 text-text-default">סה"כ</td>
                                        <td className="px-4 py-3 text-center">{trackingLinks.reduce((acc, curr) => acc + curr.views, 0)}</td>
                                        <td className="px-4 py-3 text-center">{trackingLinks.reduce((acc, curr) => acc + curr.applicants, 0)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {(() => {
                                                const totalViews = trackingLinks.reduce((acc, curr) => acc + curr.views, 0);
                                                const totalApplicants = trackingLinks.reduce((acc, curr) => acc + curr.applicants, 0);
                                                return totalViews > 0 ? ((totalApplicants / totalViews) * 100).toFixed(1) + '%' : '0.0%';
                                            })()}
                                        </td>
                                        <td className="px-4 py-3"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </AccordionSection>

            {/* Candidates from Sources Section */}
            <div ref={candidatesTableRef}>
                <AccordionSection 
                    title={selectedSourceFilter ? `מועמדים שהגיעו מ: ${selectedSourceFilter}` : "כל המועמדים ממקורות פרסום"}
                    icon={<UserGroupIcon className="w-5 h-5"/>} 
                >
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-2">
                             <div className="flex items-center gap-2">
                                <FunnelIcon className="w-4 h-4 text-text-muted" />
                                <span className="text-sm text-text-muted">
                                    {selectedSourceFilter ? 'מסונן לפי מקור' : 'מציג הכל'}
                                </span>
                                {selectedSourceFilter && (
                                    <button 
                                        onClick={() => setSelectedSourceFilter(null)}
                                        className="text-xs font-semibold text-primary-600 hover:underline"
                                    >
                                        (נקה סינון)
                                    </button>
                                )}
                             </div>
                             <span className="text-sm font-bold text-text-default">{filteredCandidates.length} מועמדים</span>
                        </div>

                        {filteredCandidates.length > 0 ? (
                            <div className="border border-border-default rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-bg-subtle text-text-muted font-semibold">
                                        <tr>
                                            <th className="px-4 py-3">שם</th>
                                            <th className="px-4 py-3">עיר</th>
                                            <th className="px-4 py-3">מקור</th>
                                            <th className="px-4 py-3">תאריך</th>
                                            <th className="px-4 py-3">סטטוס</th>
                                            <th className="px-4 py-3">התאמה</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {filteredCandidates.map(candidate => (
                                            <tr key={candidate.id} className="bg-bg-card hover:bg-bg-hover transition-colors">
                                                <td className="px-4 py-3 font-semibold text-primary-700">{candidate.name}</td>
                                                <td className="px-4 py-3 text-text-default">{candidate.city}</td>
                                                <td className="px-4 py-3 text-text-muted">{candidate.source}</td>
                                                <td className="px-4 py-3 text-text-muted">{candidate.date}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${candidate.status === 'חדש' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                                        {candidate.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-bold text-text-default">{candidate.matchScore}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center p-8 bg-bg-subtle/50 rounded-lg text-text-muted">
                                לא נמצאו מועמדים {selectedSourceFilter ? `עבור המקור: ${selectedSourceFilter}` : ''}
                            </div>
                        )}
                    </div>
                </AccordionSection>
            </div>

            {/* Floating AI Button for Publishing View */}
            <div className="fixed bottom-8 left-8 z-40">
                <button
                    onClick={() => setIsChatOpen(true)}
                    className="w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-primary-700 transition-all transform hover:scale-110 hover:rotate-3 group"
                >
                    <SparklesIcon className="w-7 h-7 group-hover:animate-pulse" />
                </button>
            </div>

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                chatType="job-publishing"
                allowTagCreation={false}
                systemPrompt={`You are Hiro AI, a marketing expert helping optimize the public landing page for the job "${publicJobTitle}".`}
                contextData={{
                    job: {
                        title: publicJobTitle,
                        description: publicJobDescription,
                        requirements: publicJobRequirements,
                    },
                }}
                onProfileUpdate={handlePublishingUpdate}
            />
        </div>
    );
};

export default PublishJobView;
