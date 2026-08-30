
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
    MapPinIcon, BriefcaseIcon, EnvelopeIcon, PhoneIcon, ArrowDownTrayIcon,
    CheckCircleIcon, ShareIcon, BuildingOffice2Icon,
    AcademicCapIcon, LanguageIcon, SparklesIcon, HiroLogotype, ArrowLeftIcon,
} from './Icons';
import { WorkingHoursInput } from './WorkingHoursInput';
import { useLanguage } from '../context/LanguageContext';
import { buildCandidateFullName } from '../utils/candidateName';
import { useAuth } from '../context/AuthContext';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicProfileData = {
    id: string;
    name: string;
    title: string;
    location: string;
    summary: string;
    email: string;
    phone: string;
    avatar: string;
    tags: string[];
    experience: Array<{ role: string; company: string; period: string; description: string }>;
    education: Array<{ degree: string; institution: string; year: string }>;
    languages: Array<{ lang: string; level: string }>;
    verified: boolean;
    resumeUrl: string;
    workingHours: string;
};

const EMPTY_PROFILE: PublicProfileData = {
    id: '',
    name: '',
    title: '',
    location: '',
    summary: '',
    email: '',
    phone: '',
    avatar: '',
    tags: [],
    experience: [],
    education: [],
    languages: [],
    verified: false,
    resumeUrl: '',
    workingHours: 'גמיש',
};

const mapCandidateToPublicProfile = (raw: Record<string, unknown>): PublicProfileData => {
    const name =
        buildCandidateFullName(raw.firstName as string, raw.lastName as string) ||
        String(raw.fullName || raw.profileName || '').trim() ||
        'מועמד';
    const tagDetails = Array.isArray(raw.tagDetails) ? raw.tagDetails : [];
    const tagsFromDetails = tagDetails
        .map((tag: any) => String(tag?.displayNameHe || tag?.tagKey || tag?.displayNameEn || '').trim())
        .filter(Boolean);
    const tagsFromList = Array.isArray(raw.tags)
        ? raw.tags
              .map((tag) => (typeof tag === 'string' ? tag : String((tag as any)?.value || (tag as any)?.displayNameHe || '').trim()))
              .filter(Boolean)
        : [];
    const tags = [...new Set([...tagsFromDetails, ...tagsFromList])];
    const experience = (Array.isArray(raw.workExperience) ? raw.workExperience : []).map((row: any) => ({
        role: String(row?.title || row?.role || '').trim(),
        company: String(row?.company || '').trim(),
        period: [row?.startDate, row?.endDate].filter(Boolean).join(' - '),
        description: String(row?.description || '').trim(),
    }));
    const education = (Array.isArray(raw.education) ? raw.education : []).map((row: any) => ({
        degree: String(row?.degree || row?.title || '').trim(),
        institution: String(row?.institution || row?.school || '').trim(),
        year: String(row?.year || row?.endDate || row?.graduationYear || '').trim(),
    }));
    const languages = (Array.isArray(raw.languages) ? raw.languages : []).map((row: any) => ({
        lang: String(row?.language || row?.lang || row?.name || '').trim(),
        level: String(row?.level || row?.levelText || '').trim(),
    })).filter((row) => row.lang);

    return {
        id: String(raw.id || '').trim(),
        name,
        title: String(raw.title || raw.profileName || '').trim(),
        location: String(raw.address || raw.location || raw.city || '').trim(),
        summary: String(raw.professionalSummary || raw.summary || '').trim(),
        email: String(raw.email || '').trim(),
        phone: String(raw.phone || '').trim(),
        avatar: String(raw.profilePicture || raw.avatar || '').trim(),
        tags,
        experience,
        education,
        languages,
        verified: Boolean(raw.approveByCandidate),
        resumeUrl: String(raw.resumeUrl || '').trim(),
        workingHours: String(raw.preferredWorkingHours || raw.availability || 'גמיש').trim() || 'גמיש',
    };
};

const ExperienceItem: React.FC<{ role: string; company: string; period: string; description: string }> = ({ role, company, period, description }) => (
    <div className="relative pl-8 pb-8 border-r border-border-default last:border-0 last:pb-0">
        <div className="absolute -right-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-bg-card"></div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
            <h4 className="text-lg font-bold text-text-default">{role || '—'}</h4>
            {period ? (
                <span className="text-sm font-medium text-text-muted bg-bg-subtle px-2 py-0.5 rounded">{period}</span>
            ) : null}
        </div>
        {company ? (
            <div className="flex items-center gap-2 text-sm text-primary-700 font-medium mb-3">
                <BuildingOffice2Icon className="w-4 h-4" />
                <span>{company}</span>
            </div>
        ) : null}
        {description ? <p className="text-text-muted text-sm leading-relaxed">{description}</p> : null}
    </div>
);

const PublicCandidateProfile: React.FC = () => {
    const { t } = useLanguage();
    const { slug } = useParams();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const staffPreview = searchParams.get('staff') === '1';
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const lookupId = useMemo(() => {
        const raw = String(slug || '').trim();
        return UUID_RE.test(raw) ? raw : '';
    }, [slug]);

    const [candidateData, setCandidateData] = useState<PublicProfileData>(EMPTY_PROFILE);
    const [workingHours, setWorkingHours] = useState('גמיש');
    const [loading, setLoading] = useState(Boolean(lookupId));
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!lookupId) {
            setLoading(false);
            return;
        }
        const apiBase = import.meta.env.VITE_API_BASE || '';
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: HeadersInit = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(lookupId)}`, {
                    headers,
                    credentials: 'include',
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error('לא ניתן לטעון את פרופיל המועמד.');
                const payload = (await res.json()) as Record<string, unknown>;
                if (cancelled) return;
                const mapped = mapCandidateToPublicProfile(payload);
                setCandidateData(mapped);
                setWorkingHours(mapped.workingHours);
            } catch (err: unknown) {
                if (!cancelled) {
                    setLoadError(err instanceof Error ? err.message : 'טעינת פרופיל נכשלה.');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [lookupId]);

    const workingHoursLabel =
        workingHours === 'גמיש' || workingHours === 'ללא אילוצי שעות' || !workingHours
            ? 'שעות עבודה גמישות'
            : workingHours;

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: `${candidateData.name} - ${candidateData.title}`,
                url: window.location.href,
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('הקישור הועתק ללוח!');
        }
    };

    if (lookupId && loading) {
        return (
            <div className="min-h-screen bg-bg-default flex items-center justify-center text-text-muted">
                טוען פרופיל...
            </div>
        );
    }

    if (lookupId && loadError) {
        return (
            <div className="min-h-screen bg-bg-default flex flex-col items-center justify-center gap-4 px-4 text-center">
                <p className="text-red-600 font-semibold">{loadError}</p>
                {staffPreview && candidateData.id ? (
                    <Link
                        to={`/candidates/${candidateData.id}`}
                        className="inline-flex items-center gap-2 text-sm font-bold text-primary-700"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        חזרה לפרופיל צוות
                    </Link>
                ) : null}
            </div>
        );
    }

    const displayName = candidateData.name || 'מועמד';
    const displayTitle = candidateData.title || '—';
    const staffReturnId = candidateData.id || lookupId;

    return (
        <div className="min-h-screen bg-bg-default font-sans" dir="rtl">
            {staffPreview && isPlatformAdmin && staffReturnId ? (
                <div className="border-b border-amber-200 bg-amber-50">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
                        <p className="text-xs sm:text-sm font-semibold text-amber-900">תצוגת מועמד — פרופיל ציבורי</p>
                        <Link
                            to={`/candidates/${staffReturnId}`}
                            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-primary-700 hover:text-primary-800"
                        >
                            <ArrowLeftIcon className="w-4 h-4" />
                            חזרה לפרופיל צוות
                        </Link>
                    </div>
                </div>
            ) : null}

            <div className="bg-bg-card border-b border-border-default sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2 opacity-80">
                        <HiroLogotype className="h-6" />
                        <span className="text-xs font-medium text-text-muted border-r border-text-subtle pr-2 mr-2">פרופיל מקצועי</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleShare}
                        className="text-sm font-medium text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <ShareIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">שתף פרופיל</span>
                    </button>
                </div>
            </div>

            <div className="relative bg-gradient-to-b from-primary-600 to-primary-800 pb-16 pt-8 sm:pb-24 sm:pt-20 px-4">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="max-w-5xl mx-auto text-center relative z-10 flex flex-col sm:block items-center">
                    <div className="relative inline-block mb-3 sm:mb-0">
                        {candidateData.avatar ? (
                            <img
                                src={candidateData.avatar}
                                alt={displayName}
                                className="w-24 h-24 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl object-cover"
                            />
                        ) : (
                            <div className="w-24 h-24 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl bg-white/20 flex items-center justify-center text-3xl sm:text-5xl font-bold text-white">
                                {displayName.charAt(0)}
                            </div>
                        )}
                        {candidateData.verified ? (
                            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-white rounded-full p-1 sm:p-1.5 shadow-md" title="פרופיל מאומת">
                                <CheckCircleIcon className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500" />
                            </div>
                        ) : null}
                    </div>
                    <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-2 sm:mt-4 mb-1 sm:mb-2">{displayName}</h1>
                    <p className="text-lg sm:text-xl text-primary-100 font-medium mb-4 sm:mb-6">{displayTitle}</p>
                </div>
            </div>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 sm:-mt-16 pb-16 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4">{t('section.personal_details')}</h3>
                            <div className="flex flex-wrap gap-2 mb-4 text-sm text-text-muted">
                                <div className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-subtle px-3 py-2 font-medium text-text-default">
                                    <MapPinIcon className="h-4 w-4 shrink-0 text-primary-600" />
                                    <span>{candidateData.location || '—'}</span>
                                </div>
                                <div className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-subtle px-3 py-2 font-medium text-text-default">
                                    <BriefcaseIcon className="h-4 w-4 shrink-0 text-primary-600" />
                                    <span>{workingHoursLabel}</span>
                                </div>
                            </div>
                            <WorkingHoursInput
                                value={workingHours}
                                onChange={setWorkingHours}
                                label={t('form.working_hours')}
                            />
                        </div>

                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4">פרטי התקשרות</h3>
                            <div className="space-y-4">
                                <a
                                    href={candidateData.email ? `mailto:${candidateData.email}` : undefined}
                                    className={`flex items-center gap-3 text-sm p-2 rounded-lg -mx-2 ${candidateData.email ? 'text-text-muted hover:text-primary-600 hover:bg-bg-subtle transition-colors' : 'text-text-subtle pointer-events-none'}`}
                                >
                                    <div className="bg-primary-50 p-2 rounded-full text-primary-600">
                                        <EnvelopeIcon className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium truncate">{candidateData.email || '—'}</span>
                                </a>
                                <a
                                    href={candidateData.phone ? `tel:${candidateData.phone}` : undefined}
                                    className={`flex items-center gap-3 text-sm p-2 rounded-lg -mx-2 ${candidateData.phone ? 'text-text-muted hover:text-primary-600 hover:bg-bg-subtle transition-colors' : 'text-text-subtle pointer-events-none'}`}
                                >
                                    <div className="bg-primary-50 p-2 rounded-full text-primary-600">
                                        <PhoneIcon className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium">{candidateData.phone || '—'}</span>
                                </a>
                            </div>
                            {candidateData.resumeUrl ? (
                                <a
                                    href={candidateData.resumeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full mt-6 bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5" />
                                    הורד קורות חיים
                                </a>
                            ) : (
                                <button
                                    type="button"
                                    disabled
                                    className="w-full mt-6 bg-bg-subtle text-text-muted font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5" />
                                    אין קורות חיים להורדה
                                </button>
                            )}
                        </div>

                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4 flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-primary-500" />
                                מיומנויות וכישורים
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {candidateData.tags.length > 0 ? (
                                    candidateData.tags.map((tag) => (
                                        <span key={tag} className="bg-bg-subtle text-text-default text-sm font-medium px-3 py-1.5 rounded-lg border border-border-default">
                                            {tag}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-sm text-text-muted">—</span>
                                )}
                            </div>
                        </div>

                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4">השכלה ושפות</h3>
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-sm font-semibold text-text-muted mb-3">
                                    <AcademicCapIcon className="w-4 h-4" />
                                    השכלה
                                </div>
                                {candidateData.education.length > 0 ? (
                                    candidateData.education.map((edu, i) => (
                                        <div key={i} className="mb-3 last:mb-0">
                                            <p className="font-bold text-text-default text-sm">{edu.degree || '—'}</p>
                                            <p className="text-xs text-text-muted">
                                                {[edu.institution, edu.year].filter(Boolean).join(', ') || '—'}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-text-muted">—</p>
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-text-muted mb-3">
                                    <LanguageIcon className="w-4 h-4" />
                                    שפות
                                </div>
                                <div className="space-y-2">
                                    {candidateData.languages.length > 0 ? (
                                        candidateData.languages.map((lang, i) => (
                                            <div key={i} className="flex justify-between text-sm">
                                                <span className="text-text-default">{lang.lang}</span>
                                                <span className="text-text-muted">{lang.level || '—'}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-text-muted">—</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 sm:p-8">
                            <h3 className="text-xl font-bold text-text-default mb-4">אודות</h3>
                            <p className="text-text-muted leading-relaxed text-base whitespace-pre-line">
                                {candidateData.summary || '—'}
                            </p>
                        </div>

                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 sm:p-8">
                            <h3 className="text-xl font-bold text-text-default mb-6 flex items-center gap-2">
                                <BriefcaseIcon className="w-6 h-6 text-primary-500" />
                                ניסיון תעסוקתי
                            </h3>
                            <div className="space-y-8">
                                {candidateData.experience.length > 0 ? (
                                    candidateData.experience.map((job, index) => (
                                        <ExperienceItem key={index} {...job} />
                                    ))
                                ) : (
                                    <p className="text-sm text-text-muted">—</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="bg-bg-card border-t border-border-default py-8 text-center text-text-muted text-sm">
                <p>Powered by <strong>Hiro</strong> - מערכת גיוס חכמה</p>
                <p className="mt-2">&copy; {new Date().getFullYear()} כל הזכויות שמורות</p>
            </footer>
        </div>
    );
};

export default PublicCandidateProfile;
