import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  MapPinIcon, BriefcaseIcon, CheckCircleIcon, ArrowLeftIcon, CloudArrowUpIcon,
  DocumentTextIcon, PlayIcon, WhatsappIcon, LinkedInIcon, EnvelopeIcon, LinkIcon,
} from './Icons';
import {
  fetchPublicLanding,
  recordLandingVisit,
  submitLandingApplication,
  fileToBase64,
  buildPublicJobUrl,
  buildPublicJobHashPath,
  fetchPublicBoardBranding,
  resolvePublicClientRouteKey,
  DEFAULT_CAREER_THEME,
  type PublicLandingData,
  type LandingPageField,
  type ScreeningQuestion,
  type CareerPageTheme,
  type LandingLayout,
} from '../services/publishingApi';
import {
  setLandingPostHogConfig,
  captureJobPageViewed,
  captureApplicationStarted,
  captureApplicationSubmittedSuccess,
  captureApplicationSubmittedFailed,
} from '../utils/landingPosthog';

function mergeTheme(theme?: CareerPageTheme): CareerPageTheme {
  return { ...DEFAULT_CAREER_THEME, ...(theme || {}) };
}

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function applyClientBrandingToTheme(
  theme: CareerPageTheme,
  branding?: PublicLandingData['clientBranding'],
): CareerPageTheme {
  const brand = branding?.primaryColor?.trim();
  if (!brand) return theme;
  return {
    ...theme,
    structure: brand,
    buttonBg: brand,
    bannerBg: brand,
  };
}

const themedInputClass =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none transition-all';

const themedTextareaClass = `${themedInputClass} resize-none`;

const FIELD_INPUTS: Record<string, { type: string; placeholder?: string; dir?: string }> = {
  fullName: { type: 'text', placeholder: 'ישראל ישראלי' },
  firstName: { type: 'text', placeholder: 'ישראל' },
  lastName: { type: 'text', placeholder: 'ישראלי' },
  phone: { type: 'tel', placeholder: '050-1234567', dir: 'ltr' },
  email: { type: 'email', placeholder: 'name@email.com', dir: 'ltr' },
  city: { type: 'text', placeholder: 'תל אביב' },
  idNumber: { type: 'text', placeholder: '123456789', dir: 'ltr' },
  drivingLicense: { type: 'text', placeholder: 'B' },
  linkedin: { type: 'url', placeholder: 'https://linkedin.com/in/...', dir: 'ltr' },
  notes: { type: 'text', placeholder: 'הערות נוספות' },
};

const JobLandingPage: React.FC = () => {
  const { clientName: clientNameParam, jobIdOrCode } = useParams<{ clientName?: string; jobIdOrCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const src = searchParams.get('src');
  const visitRecorded = useRef(false);
  const posthogPageViewed = useRef(false);

  const [landing, setLanding] = useState<PublicLandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({});
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const pageTheme = useMemo(
    () => applyClientBrandingToTheme(mergeTheme(landing?.theme), landing?.clientBranding),
    [landing?.theme, landing?.clientBranding],
  );
  const accentStyle = useMemo(
    () => ({ '--accent': pageTheme.structure }) as React.CSSProperties,
    [pageTheme.structure],
  );
  const displayLogo = landing?.logo?.trim() || landing?.clientBranding?.logoUrl?.trim() || null;
  const displayCompanyName = useMemo(() => {
    if (landing?.companyName?.trim()) return landing.companyName.trim();
    if (clientNameParam) {
      const decoded = decodeURIComponent(clientNameParam);
      if (!CLIENT_UUID_RE.test(decoded)) return decoded;
    }
    return '';
  }, [landing?.companyName, clientNameParam]);
  const layout: LandingLayout = landing?.landingLayout || 'detailed';

  useEffect(() => {
    if (!landing || posthogPageViewed.current) return;
    posthogPageViewed.current = true;
    setLandingPostHogConfig(landing.posthog);
    captureJobPageViewed({
      jobId: landing.jobId,
      companyId: landing.companyId ?? null,
      src: src || 'direct',
    });
  }, [landing, src]);

  const analyticsContext = useCallback(
    () => ({
      jobId: landing?.jobId || jobIdOrCode || '',
      companyId: landing?.companyId ?? null,
      src: src || 'direct',
    }),
    [landing, jobIdOrCode, src],
  );

  const trackApplicationStarted = useCallback(() => {
    const ctx = analyticsContext();
    if (!ctx.jobId) return;
    captureApplicationStarted(ctx);
  }, [analyticsContext]);

  useEffect(() => {
    if (!jobIdOrCode) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetchPublicLanding(jobIdOrCode, src, clientNameParam)
      .then((data) => {
        if (!active) return;
        setLanding(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load job');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [jobIdOrCode, src, clientNameParam]);

  useEffect(() => {
    if (!clientNameParam || !jobIdOrCode) return;
    const decoded = decodeURIComponent(clientNameParam);
    if (!CLIENT_UUID_RE.test(decoded)) return;
    let active = true;
    fetchPublicBoardBranding(clientNameParam).then((branding) => {
      if (!active) return;
      const domain = resolvePublicClientRouteKey(branding?.domain);
      if (domain && decoded.toLowerCase() !== domain.toLowerCase()) {
        const hashPath = buildPublicJobHashPath(jobIdOrCode, undefined, domain);
        const query = src ? `?src=${encodeURIComponent(src)}` : '';
        navigate(`${hashPath}${query}`, { replace: true });
      }
    });
    return () => { active = false; };
  }, [clientNameParam, jobIdOrCode, src, navigate]);

  useEffect(() => {
    const domain = landing?.clientBranding?.domain?.trim();
    if (!domain || !clientNameParam || !landing) return;
    const decoded = decodeURIComponent(clientNameParam);
    if (decoded.toLowerCase() !== domain.toLowerCase()) {
      const hashPath = buildPublicJobHashPath(landing.jobId, landing.postingCode, domain);
      const query = src ? `?src=${encodeURIComponent(src)}` : '';
      navigate(`${hashPath}${query}`, { replace: true });
    }
  }, [landing, clientNameParam, src, navigate]);

  useEffect(() => {
    if (!jobIdOrCode || !landing || visitRecorded.current) return;
    visitRecorded.current = true;
    recordLandingVisit(jobIdOrCode, src);
  }, [jobIdOrCode, landing, src]);

  const shareUrl = useMemo(() => {
    if (!landing) return '';
    const routeKey = resolvePublicClientRouteKey(landing.clientBranding?.domain);
    return buildPublicJobUrl(landing.jobId, src || undefined, landing.postingCode, routeKey);
  }, [landing, src]);

  const titleSizeClass =
    layout === 'title_only'
      ? 'text-5xl sm:text-6xl lg:text-7xl'
      : layout === 'short'
        ? 'text-4xl sm:text-5xl lg:text-6xl'
        : 'text-4xl sm:text-5xl lg:text-6xl';

  const contentSpacing = layout === 'summary' ? 'space-y-10' : layout === 'short' ? 'space-y-8' : 'space-y-12';

  const handleNativeShare = async () => {
    if (!landing) return;
    const url = shareUrl;
    const payload = {
      title: landing.jobTitle,
      text: `${landing.jobTitle} — ${landing.companyName}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(payload);
      } catch {
        /* user cancelled */
      }
    } else {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  const descriptionLines = useMemo(() => {
    if (!landing) return [];
    const text = landing.descriptionPlain || landing.description;
    if (landing.description.includes('<')) {
      return null;
    }
    return text.split('\n');
  }, [landing]);

  const handleInputChange = (key: string, value: string) => {
    trackApplicationStarted();
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      trackApplicationStarted();
      setCvFile(e.target.files[0]);
      setFileName(e.target.files[0].name);
    }
  };

  const handleScreeningAnswerChange = (qId: string, value: string) => {
    trackApplicationStarted();
    setScreeningAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const handlePrivacyChange = (checked: boolean) => {
    trackApplicationStarted();
    setPrivacyAccepted(checked);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobIdOrCode || !landing) return;
    const ctx = analyticsContext();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      let cvBase64: string | undefined;
      if (cvFile) {
        cvBase64 = await fileToBase64(cvFile);
      }
      await submitLandingApplication(jobIdOrCode, {
        ...formData,
        src: src || 'direct',
        privacyAccepted,
        screeningAnswers,
        cvBase64,
        cvFileName: cvFile?.name,
        cvMimeType: cvFile?.type,
      });
      captureApplicationSubmittedSuccess(ctx);
      setIsSubmitted(true);
    } catch (err: any) {
      const message = err?.message || 'שגיאה בשליחת המועמדות';
      captureApplicationSubmittedFailed(ctx, message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: LandingPageField) => {
    if (field.key === 'cv' || field.key === 'privacy') return null;
    const cfg = FIELD_INPUTS[field.key] || { type: 'text' };
    const required = field.status === 'mandatory';
    return (
      <div key={field.key} className={field.key === 'fullName' || field.key === 'notes' ? 'sm:col-span-2' : ''}>
        <label className="block text-sm font-bold text-slate-700 mb-2">
          {field.label}
          {required ? <span className="text-rose-500"> *</span> : (
            <span className="text-slate-400 font-normal text-xs mr-2">(רשות)</span>
          )}
        </label>
        {field.key === 'notes' ? (
          <textarea
            rows={3}
            value={formData[field.key] || ''}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={themedTextareaClass}
            style={accentStyle}
          />
        ) : (
          <input
            required={required}
            type={cfg.type}
            dir={cfg.dir as 'ltr' | 'rtl' | undefined}
            value={formData[field.key] || ''}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={cfg.placeholder}
            className={themedInputClass}
            style={accentStyle}
          />
        )}
      </div>
    );
  };

  const renderScreeningQuestion = (q: ScreeningQuestion, index: number) => {
    const qId = String(q.id);
    const required = q.isMandatory !== false;
    const options =
      q.answerType === 'בחירה מרובה' && q.multipleChoiceOptions
        ? q.multipleChoiceOptions.split(',').map((o) => o.trim()).filter(Boolean)
        : [];

    return (
      <div key={qId}>
        <label className="block text-sm font-bold text-slate-800 mb-3 leading-tight">
          {index + 1}. {q.question}
          {required ? <span className="text-rose-500"> *</span> : (
            <span className="text-slate-400 font-normal text-xs block mt-1">(רשות)</span>
          )}
        </label>

        {q.answerType === 'Yes/No' && (
          <div className="flex gap-4">
            {['כן', 'לא'].map((opt) => (
              <label key={opt} className="flex-1 cursor-pointer">
                <input
                  required={required}
                  type="radio"
                  value={opt}
                  name={`sq-${qId}`}
                  className="peer sr-only"
                  onChange={(e) => handleScreeningAnswerChange(qId, e.target.value)}
                />
                <div className="px-6 py-3 rounded-xl border-2 border-slate-200 bg-white text-center font-bold text-slate-600 transition-all peer-checked:border-[var(--accent)] peer-checked:bg-[color-mix(in_srgb,var(--accent)_12%,white)] peer-checked:text-[var(--accent)] hover:border-slate-300">
                  {opt}
                </div>
              </label>
            ))}
          </div>
        )}

        {q.answerType === 'בחירה מרובה' && options.length > 0 && (
          <div className="flex flex-col gap-3">
            {options.map((opt) => (
              <label key={opt} className="cursor-pointer group">
                <input
                  required={required}
                  type="radio"
                  value={opt}
                  name={`sq-${qId}`}
                  className="peer sr-only"
                  onChange={(e) => handleScreeningAnswerChange(qId, e.target.value)}
                />
                <div className="px-5 py-4 rounded-xl border border-slate-200 bg-white font-semibold text-sm text-slate-700 transition-all peer-checked:border-[var(--accent)] peer-checked:ring-1 peer-checked:ring-[var(--accent)] peer-checked:text-[var(--accent)] peer-checked:bg-[color-mix(in_srgb,var(--accent)_8%,white)] hover:bg-slate-50 flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center transition-colors group-hover:border-[var(--accent)]">
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] opacity-0 group-has-[:checked]:opacity-100 transition-opacity" />
                  </div>
                  {opt}
                </div>
              </label>
            ))}
          </div>
        )}

        {(q.answerType === 'טקסט חופשי' || (q.answerType === 'בחירה מרובה' && !options.length)) && (
          <textarea
            rows={3}
            required={required}
            value={screeningAnswers[qId] || ''}
            onChange={(e) => handleScreeningAnswerChange(qId, e.target.value)}
            className={`${themedTextareaClass} shadow-sm`}
            style={accentStyle}
          />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center font-sans" dir="rtl">
        <p className="text-slate-500 font-bold">טוען משרה...</p>
      </div>
    );
  }

  if (error || !landing) {
    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-6 font-sans" dir="rtl">
        <div className="text-center max-w-md bg-white p-10 rounded-2xl shadow-lg border border-slate-200">
          <h1 className="text-xl font-black text-slate-900 mb-2">המשרה לא נמצאה</h1>
          <p className="text-slate-500">{error || 'לא ניתן לטעון את דף המשרה'}</p>
        </div>
      </div>
    );
  }

  const displayData = landing;
  const formFields = displayData.landingPageFields.filter((f) => f.key !== 'privacy');
  const showCv = displayData.landingPageFields.some((f) => f.key === 'cv');
  const cvRequired = displayData.landingPageFields.some((f) => f.key === 'cv' && f.status === 'mandatory');
  const showPrivacy = displayData.landingPageFields.some((f) => f.key === 'privacy');
  const publishedQuestions = displayData.screeningQuestions || [];
  const videoEmbedUrl = displayData.videoUrl
    ? displayData.videoUrl.includes('embed')
      ? displayData.videoUrl
      : displayData.videoUrl.replace('watch?v=', 'embed/').concat('?autoplay=1&mute=1')
    : null;

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 font-sans" dir="rtl">
        <div className="text-center animate-scale-in max-w-lg w-full bg-white p-12 rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-slate-100">
          <div className="w-24 h-24 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-8 relative">
            <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20" />
            <CheckCircleIcon className="w-12 h-12 relative z-10" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">איזה יופי, הגשת מועמדות!</h1>
          <p className="text-slate-500 text-lg mb-10 leading-relaxed">
            קורות החיים שלך התקבלו בהצלחה והועברו לצוות הגיוס של {displayData.companyName}. אנו ניצור עמך קשר בהקדם.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            חזרה למשרה
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans pb-24 md:pb-0" style={{ background: pageTheme.formBg }} dir="rtl">
      <header
        className="backdrop-blur-md border-b border-white/10 sticky top-0 z-50 transition-all shadow-sm"
        style={{ background: pageTheme.bannerBg, color: pageTheme.bannerText }}
      >
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {displayLogo ? (
              <div className="h-14 px-3 rounded-xl flex items-center justify-center bg-white/95 border border-white/20 shadow-sm">
                <img src={displayLogo} alt={displayCompanyName || 'לוגו'} className="max-h-10 max-w-[180px] object-contain" />
              </div>
            ) : null}
            {displayCompanyName ? (
              <div>
                <p className="text-white/80 text-sm font-medium">משרה פתוחה</p>
                <h2 className="text-xl font-black tracking-tight">{displayCompanyName}</h2>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleNativeShare}
            className="md:hidden text-sm font-bold px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 transition"
          >
            {shareCopied ? 'הועתק!' : 'שתף'}
          </button>
        </div>
      </header>

      <main className={`max-w-[1400px] mx-auto px-4 py-10 sm:py-16 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12 xl:gap-20 ${layout === 'title_only' ? 'lg:grid-cols-1 max-w-3xl' : ''}`}>
        <div className={`${contentSpacing} animate-fade-in-up`}>
          <div>
            <h1 className={`${titleSizeClass} font-black text-slate-900 tracking-tight mb-8 leading-[1.1]`}>
              {displayData.jobTitle}
            </h1>
            {layout !== 'title_only' && (
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm text-sm font-bold text-slate-700">
                <BriefcaseIcon className="w-4 h-4" style={{ color: pageTheme.structure }} />
                {displayData.jobType}
              </div>
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm text-sm font-bold text-slate-700">
                <MapPinIcon className="w-4 h-4" style={{ color: pageTheme.structure }} />
                {displayData.location}
              </div>
            </div>
            )}
          </div>

          {(displayData.heroImage || videoEmbedUrl) && (
            <div className="relative rounded-[2rem] overflow-hidden shadow-2xl group border-[6px] border-white aspect-video bg-slate-200">
              {showVideo && videoEmbedUrl ? (
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={videoEmbedUrl}
                  title="Company video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  {displayData.heroImage && (
                    <img
                      src={displayData.heroImage}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  {videoEmbedUrl && (
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent flex items-end p-8">
                      <button
                        type="button"
                        onClick={() => setShowVideo(true)}
                        className="flex items-center gap-3 bg-white/20 backdrop-blur-md hover:bg-white text-white hover:text-slate-900 border border-white/30 rounded-full px-6 py-3 font-bold transition-all shadow-lg hover:shadow-xl group/btn"
                      >
                        <PlayIcon className="w-5 h-5 fill-current text-white group-hover/btn:text-slate-900" />
                        <span>צפו בסרטון החברה</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {(displayData.descriptionPlain || displayData.description)?.trim() &&
            displayData.landingLayout !== 'title_only' && (
          <article className={`prose prose-slate max-w-none text-slate-600 ${layout === 'short' ? 'prose-base' : 'prose-lg'}`}>
            <h3 className="text-2xl mt-0 font-black" style={{ color: pageTheme.structure }}>על התפקיד</h3>
            {descriptionLines === null ? (
              <div dangerouslySetInnerHTML={{ __html: displayData.description }} />
            ) : (
              descriptionLines.map((line, idx) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return (
                    <h4 key={idx} className="text-xl mt-8 mb-4 border-b-2 pb-2 inline-block" style={{ borderColor: pageTheme.additionalDetails, color: pageTheme.structure }}>
                      {line.replace(/\*\*/g, '')}
                    </h4>
                  );
                }
                if (line.startsWith('-')) {
                  return (
                    <div key={idx} className={`flex gap-4 items-start ${layout === 'summary' ? 'mb-4 text-lg' : 'mb-3'}`}>
                      <div className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: pageTheme.structure }} />
                      <p className="m-0 font-medium">{line.replace('-', '').trim()}</p>
                    </div>
                  );
                }
                return line.trim() ? <p key={idx} className="font-medium text-lg">{line}</p> : <br key={idx} />;
              })
            )}
          </article>
          )}

          {displayData.requirements.length > 0 && displayData.landingLayout !== 'title_only' && (
            <div
              className="rounded-[2rem] p-8 sm:p-10 border"
              style={{ background: `${pageTheme.additionalDetails}22`, borderColor: pageTheme.additionalDetails }}
            >
              <h3 className="text-2xl font-black mb-8 flex items-center gap-3" style={{ color: pageTheme.structure }}>
                <CheckCircleIcon className="w-8 h-8" style={{ color: pageTheme.structure }} />
                אלה הדברים שאנחנו מחפשים:
              </h3>
              {layout === 'summary' ? (
                <ul className="space-y-3 text-slate-700 font-medium">
                  {displayData.requirements.map((req, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span style={{ color: pageTheme.structure }}>•</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {displayData.requirements.map((req, idx) => (
                  <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm border flex gap-4 transition-transform hover:-translate-y-1" style={{ borderColor: pageTheme.additionalDetails }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-black" style={{ background: `${pageTheme.structure}22`, color: pageTheme.structure }}>
                      {idx + 1}
                    </div>
                    <span className="font-semibold text-slate-700 leading-snug">{req}</span>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {(displayData.contactEmail || displayData.contactPhone1 || displayData.contactPhone2) && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-4">יצירת קשר</h3>
              <div className="space-y-2 text-slate-600 font-medium">
                {displayData.contactEmail && (
                  <p>
                    <a href={`mailto:${displayData.contactEmail}`} className="hover:underline" style={{ color: pageTheme.structure }} dir="ltr">
                      {displayData.contactEmail}
                    </a>
                  </p>
                )}
                {displayData.contactPhone1 && (
                  <p>
                    <a href={`tel:${displayData.contactPhone1}`} className="hover:underline" style={{ color: pageTheme.structure }} dir="ltr">
                      {displayData.contactPhone1}
                    </a>
                  </p>
                )}
                {displayData.contactPhone2 && (
                  <p>
                    <a href={`tel:${displayData.contactPhone2}`} className="hover:underline" style={{ color: pageTheme.structure }} dir="ltr">
                      {displayData.contactPhone2}
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pt-8 border-t border-slate-200 hidden md:block">
            <p className="text-sm font-bold text-slate-500 mb-4 tracking-wide uppercase">שתפו את ההזדמנות הזאת עם חברים:</p>
            <div className="flex gap-3">
              <button type="button" className="w-12 h-12 rounded-full border border-slate-200 bg-white hover:bg-[#25D366]/10 text-slate-400 hover:text-[#25D366] hover:border-[#25D366]/30 flex items-center justify-center transition-all shadow-sm" title="WhatsApp" onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${displayData.jobTitle}\n${shareUrl}`)}`, '_blank')}>
                <WhatsappIcon className="w-6 h-6" />
              </button>
              <button type="button" className="w-12 h-12 rounded-full border border-slate-200 bg-white hover:bg-[#0077b5]/10 text-slate-400 hover:text-[#0077b5] hover:border-[#0077b5]/30 flex items-center justify-center transition-all shadow-sm" title="LinkedIn" onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank')}>
                <LinkedInIcon className="w-5 h-5" />
              </button>
              <button type="button" className="w-12 h-12 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all shadow-sm" title="Email" onClick={() => window.open(`mailto:?subject=${encodeURIComponent(displayData.jobTitle)}&body=${encodeURIComponent(shareUrl)}`, '_blank')}>
                <EnvelopeIcon className="w-5 h-5" />
              </button>
              <button type="button" className="w-12 h-12 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-all shadow-sm" title="Copy Link" style={{ color: pageTheme.structure }} onClick={() => navigator.clipboard.writeText(shareUrl)}>
                <LinkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className={`lg:sticky lg:top-28 self-start animate-fade-in-up ${layout === 'title_only' ? 'max-w-xl mx-auto w-full' : ''}`} style={{ animationDelay: '200ms' }}>
          <div className="bg-white rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.06)] border border-slate-200 p-8 sm:p-10 relative overflow-hidden" style={{ background: pageTheme.formBg }}>
            <div className="absolute top-0 right-0 w-full h-2" style={{ background: pageTheme.bannerBg }} />
            <h2 className="text-3xl font-black text-slate-900 mb-2 mt-2">הגשת מועמדות</h2>
            <p className="text-slate-500 font-medium mb-8">מלאו את הפרטים והצטרפו אלינו למסע.</p>

            <form id="apply-form" onSubmit={handleSubmit} className="space-y-6" style={accentStyle}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {formFields.filter((f) => f.key !== 'cv').map(renderField)}
              </div>

              {showCv && (
                <div className="pt-4">
                  <label className="block text-sm font-bold text-slate-700 mb-3">
                    קורות חיים {cvRequired && <span className="text-rose-500">*</span>}
                  </label>
                  <label
                    className="w-full flex border-2 border-dashed rounded-2xl cursor-pointer transition-colors px-6 py-10 focus-within:ring-2 focus-within:ring-[var(--accent)] outline-none relative group"
                    style={{
                      borderColor: `color-mix(in srgb, ${pageTheme.structure} 35%, white)`,
                      background: `color-mix(in srgb, ${pageTheme.structure} 6%, white)`,
                    }}
                  >
                    <div className="m-auto flex flex-col items-center gap-3 text-center relative z-10">
                      {fileName ? (
                        <>
                          <div className="w-14 h-14 bg-white shadow-sm rounded-full flex items-center justify-center mb-1" style={{ color: pageTheme.structure }}>
                            <DocumentTextIcon className="w-7 h-7" />
                          </div>
                          <span className="font-black text-slate-900">{fileName}</span>
                          <span className="text-sm font-bold underline decoration-2 underline-offset-4" style={{ color: pageTheme.structure }}>החלף קובץ</span>
                        </>
                      ) : (
                        <>
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-300 shadow-sm border"
                            style={{
                              color: pageTheme.structure,
                              background: `color-mix(in srgb, ${pageTheme.structure} 12%, white)`,
                              borderColor: `color-mix(in srgb, ${pageTheme.structure} 25%, white)`,
                            }}
                          >
                            <CloudArrowUpIcon className="w-7 h-7" />
                          </div>
                          <span className="text-lg font-black" style={{ color: pageTheme.structure }}>לחצו או גררו קובץ לכאן</span>
                          <span className="text-sm font-medium text-slate-500">תומך ב- PDF, DOCX (עד 5MB)</span>
                        </>
                      )}
                    </div>
                    <input type="file" required={cvRequired && !fileName} accept=".pdf,.doc,.docx" onChange={handleFileChange} className="sr-only" />
                  </label>
                </div>
              )}

              {publishedQuestions.length > 0 && (
                <>
                  <hr className="border-slate-100 my-8" />
                  <div className="space-y-8 bg-slate-50/80 -mx-8 px-8 py-8 border-y border-slate-100">
                    <div className="mb-4">
                      <h3 className="text-lg font-black text-slate-900">מענה קצר לשאלות הסינון</h3>
                      <p className="text-sm text-slate-500 font-medium">כדי שנוכל להתקדם בצורה מהירה יותר.</p>
                    </div>
                    {publishedQuestions.map(renderScreeningQuestion)}
                  </div>
                </>
              )}

              <div className="pt-6 text-center">
                {showPrivacy && (
                  <label className="flex items-center justify-center gap-3 mb-6 cursor-pointer group w-max mx-auto text-right">
                    <input
                      required
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => handlePrivacyChange(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 transition-all cursor-pointer"
                      style={{ accentColor: pageTheme.structure }}
                    />
                    <span className="text-sm font-semibold text-slate-500">
                      אני מאשר/ת את <a href="#" className="underline" style={{ color: pageTheme.structure }}>תנאי השימוש</a> והפרטיות.
                    </span>
                  </label>
                )}

                {submitError && <p className="text-sm text-red-600 mb-4">{submitError}</p>}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full font-black text-xl py-5 rounded-2xl transition-all duration-300 shadow-lg active:scale-[0.98] outline-none flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: pageTheme.buttonBg, color: pageTheme.buttonText }}
                >
                  {isSubmitting ? 'שולח...' : 'שלח מועמדות למשרה'}
                  <ArrowLeftIcon className="w-5 h-5 -mx-1" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 p-4 bg-white/95 backdrop-blur border-t border-slate-200 flex gap-2 shadow-lg">
        <button
          type="button"
          onClick={handleNativeShare}
          className="flex-1 py-3 rounded-xl font-bold border border-slate-200 text-slate-700"
        >
          {shareCopied ? 'הועתק!' : 'שתף משרה'}
        </button>
        <a
          href="#apply-form"
          className="flex-[2] py-3 rounded-xl font-bold text-center"
          style={{ background: pageTheme.buttonBg, color: pageTheme.buttonText }}
        >
          הגש מועמדות
        </a>
      </div>
    </div>
  );
};

export default JobLandingPage;
