import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SearchableSelect from './SearchableSelect';
import {
  LinkIcon, UserIcon, ChartBarIcon, PaintBrushIcon, MegaphoneIcon, WhatsappIcon,
  PencilIcon, ArrowTopRightOnSquareIcon, TableCellsIcon, Squares2X2Icon,
  ShareIcon, BuildingOffice2Icon,
} from './Icons';
import { authHeaders } from '../utils/authHeaders';
import {
  fetchPublishingLinks,
  fetchPublishingCandidates,
  fetchPublishingStats,
  fetchCareerTheme,
  saveCareerTheme,
  fetchHeroGallery,
  addHeroGalleryImage,
  removeHeroGalleryImage,
  getLinkHeroImage,
  getLinkPublicUrl,
  buildPublicJobBoardUrl,
  buildPublicJobBoardAppUrl,
  fetchPublicBoardBranding,
  resolvePublicClientRouteKey,
  type CareerPageTheme,
  type PublishingLinkRow,
  type PublishingCandidateRow,
  type PublishingStats,
  type HeroGalleryImage,
} from '../services/publishingApi';

const initialTheme: CareerPageTheme = {
  bannerBg: 'linear-gradient(90deg, #1e293b, #334155)',
  bannerText: '#ffffff',
  structure: '#4f46e5',
  buttonBg: '#4f46e5',
  buttonText: '#ffffff',
  formBg: '#f8fafc',
  additionalDetails: '#cbd5e1',
};

const ADMIN_PUBLISHING_CLIENT_KEY = 'hiro_admin_publishing_client_id';

const ColorPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const isGradient = value && value.startsWith('linear-gradient');

  const parseGradient = (str: string) => {
    if (!str.startsWith('linear-gradient')) return { angle: '90', c1: '#64748b', c2: '#94a3b8' };
    const match = str.match(/linear-gradient\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (match) return { angle: match[1].replace('deg', '').trim(), c1: match[2].trim(), c2: match[3].trim() };
    return { angle: '90', c1: '#64748b', c2: '#94a3b8' };
  };

  const gradientData = isGradient ? parseGradient(value) : { angle: '90', c1: value, c2: '#ffffff' };

  const handleGradientChange = (field: 'angle' | 'c1' | 'c2', val: string) => {
    const newData = { ...gradientData, [field]: val };
    onChange(`linear-gradient(${newData.angle}deg, ${newData.c1}, ${newData.c2})`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(isGradient ? gradientData.c1 : value)}
          className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${!isGradient ? 'bg-slate-200 text-slate-800' : 'bg-transparent text-slate-500 hover:bg-slate-100'}`}
        >
          צבע אחיד
        </button>
        <button
          type="button"
          onClick={() => onChange(`linear-gradient(90deg, ${isGradient ? gradientData.c1 : value}, #94a3b8)`)}
          className={`text-xs px-3 py-1.5 rounded-md font-bold transition-all ${isGradient ? 'bg-slate-200 text-slate-800' : 'bg-transparent text-slate-500 hover:bg-slate-100'}`}
        >
          גרדיאנט
        </button>
      </div>

      {!isGradient ? (
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer" style={{ background: value }}>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-[-10px] w-20 h-20 cursor-pointer p-0 opacity-0" />
          </div>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-12 w-full lg:w-40 border border-slate-200 rounded-xl px-4 text-sm font-mono text-slate-600 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none uppercase transition-all"
            dir="ltr"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 border border-slate-200 rounded-xl p-3 bg-slate-50">
          <div className="h-6 rounded-lg shadow-inner border border-slate-200" style={{ background: value }} />
          <div className="flex gap-3 items-center">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer" style={{ background: gradientData.c1 }}>
              <input type="color" value={gradientData.c1} onChange={(e) => handleGradientChange('c1', e.target.value)} className="absolute inset-[-10px] w-16 h-16 cursor-pointer p-0 opacity-0" />
            </div>
            <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer" style={{ background: gradientData.c2 }}>
              <input type="color" value={gradientData.c2} onChange={(e) => handleGradientChange('c2', e.target.value)} className="absolute inset-[-10px] w-16 h-16 cursor-pointer p-0 opacity-0" />
            </div>
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">זווית:</span>
              <input type="number" min="0" max="360" value={gradientData.angle} onChange={(e) => handleGradientChange('angle', e.target.value)} className="w-16 h-8 text-sm font-mono border border-slate-200 rounded-lg px-2 text-center" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PublishingSettingsView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const tenantClientId = user?.clientId?.trim() || null;
  const [adminClientId, setAdminClientId] = useState<string | null>(() => {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(ADMIN_PUBLISHING_CLIENT_KEY);
  });
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [clientsListLoading, setClientsListLoading] = useState(false);
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [activeTab, setActiveTab] = useState<'links' | 'candidates' | 'stats' | 'design'>('links');
  const effectiveClientId = isPlatformAdmin ? adminClientId : tenantClientId;
  const adminNeedsClient = isPlatformAdmin && !effectiveClientId;

  const handleAdminClientChange = useCallback((val: string | number | null) => {
    const id = val ? String(val) : null;
    setAdminClientId(id);
    if (typeof sessionStorage !== 'undefined') {
      if (id) sessionStorage.setItem(ADMIN_PUBLISHING_CLIENT_KEY, id);
      else sessionStorage.removeItem(ADMIN_PUBLISHING_CLIENT_KEY);
    }
  }, []);
  const [themeConfig, setThemeConfig] = useState<CareerPageTheme>(initialTheme);
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [links, setLinks] = useState<PublishingLinkRow[]>([]);
  const [candidates, setCandidates] = useState<PublishingCandidateRow[]>([]);
  const [stats, setStats] = useState<PublishingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [heroGallery, setHeroGallery] = useState<HeroGalleryImage[]>([]);
  const [newGalleryUrl, setNewGalleryUrl] = useState('');
  const [newGalleryLabel, setNewGalleryLabel] = useState('');
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [linksViewMode, setLinksViewMode] = useState<'table' | 'cards'>('table');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [publicBoardCopied, setPublicBoardCopied] = useState(false);
  const [whatsappShareCopied, setWhatsappShareCopied] = useState(false);
  const [boardRouteKey, setBoardRouteKey] = useState<string | null>(null);

  useEffect(() => {
    if (!apiBase || !isPlatformAdmin) {
      setClientOptions([]);
      return;
    }
    let cancelled = false;
    setClientsListLoading(true);
    fetch(`${apiBase}/api/clients?activeOnly=true`, {
      headers: authHeaders(true),
      cache: 'no-store',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : ((rows as { data?: unknown })?.data ?? []);
        const opts = (Array.isArray(list) ? list : [])
          .map((c: Record<string, unknown>) => ({
            id: String(c.id ?? ''),
            label: String(c.displayName || c.name || '').trim(),
          }))
          .filter((o) => o.id && o.label)
          .sort((a, b) => a.label.localeCompare(b.label, 'he'));
        setClientOptions(opts);
      })
      .catch(() => {
        if (!cancelled) setClientOptions([]);
      })
      .finally(() => {
        if (!cancelled) setClientsListLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiBase, isPlatformAdmin]);

  useEffect(() => {
    if (!isPlatformAdmin || adminClientId || !clientOptions.length) return;
    const saved = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(ADMIN_PUBLISHING_CLIENT_KEY)
      : null;
    const savedValid = saved && clientOptions.some((o) => o.id === saved);
    handleAdminClientChange(savedValid ? saved : clientOptions[0].id);
  }, [isPlatformAdmin, adminClientId, clientOptions, handleAdminClientChange]);

  const selectedClientLabel = useMemo(() => {
    if (!effectiveClientId) return null;
    return clientOptions.find((o) => o.id === effectiveClientId)?.label || null;
  }, [clientOptions, effectiveClientId]);

  useEffect(() => {
    const clientId = effectiveClientId;
    if (!clientId) {
      setBoardRouteKey(null);
      return;
    }
    fetchPublicBoardBranding(clientId).then((branding) => {
      const domain = resolvePublicClientRouteKey(branding?.domain);
      if (domain) setBoardRouteKey(domain);
    });
  }, [effectiveClientId]);

  const boardClientKey = boardRouteKey;

  const handleCopyPublicBoardUrl = async () => {
    if (!boardClientKey) return;
    const url = buildPublicJobBoardUrl(boardClientKey);
    try {
      await navigator.clipboard.writeText(url);
      setPublicBoardCopied(true);
      setTimeout(() => setPublicBoardCopied(false), 2500);
    } catch {
      window.prompt('העתק את הקישור:', url);
    }
  };

  const handleCopyWhatsAppPreviewUrl = async () => {
    if (!boardClientKey) return;
    const url = buildPublicJobBoardUrl(boardClientKey);
    try {
      await navigator.clipboard.writeText(url);
      setWhatsappShareCopied(true);
      setTimeout(() => setWhatsappShareCopied(false), 2500);
    } catch {
      window.prompt('העתק את הקישור לשיתוף בוואטסאפ (תצוגה מקדימה):', url);
    }
  };

  const handleCopyPublicUrl = async (link: PublishingLinkRow) => {
    const url = getLinkPublicUrl(link);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId(null), 2500);
    } catch {
      window.prompt('העתק את הקישור:', url);
    }
  };

  const renderLinkActions = (link: PublishingLinkRow, compact = false) => (
    <div className={`flex ${compact ? 'justify-center' : 'flex-wrap justify-center'} gap-2`}>
      <button
        type="button"
        className="p-2 bg-slate-100 hover:bg-primary-50 text-slate-500 hover:text-primary-600 rounded-lg transition-colors border border-slate-200"
        title="ערוך פרסום משרה"
        onClick={() => navigate(`/jobs/${link.jobId}/publish`)}
      >
        <PencilIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        className="p-2 bg-slate-100 hover:bg-primary-50 text-slate-500 hover:text-primary-600 rounded-lg transition-colors border border-slate-200"
        title="פתח דף נחיתה"
        onClick={() => window.open(getLinkPublicUrl(link), '_blank', 'noopener,noreferrer')}
      >
        <ArrowTopRightOnSquareIcon className="w-5 h-5" />
      </button>
      <button
        type="button"
        className={`p-2 rounded-lg transition-colors border ${
          copiedLinkId === link.id
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border-slate-200'
        }`}
        title="העתק קישור ציבורי לצפייה חיצונית"
        onClick={() => handleCopyPublicUrl(link)}
      >
        <ShareIcon className="w-5 h-5" />
      </button>
      <button type="button" className="p-2 bg-slate-100 hover:bg-primary-50 text-slate-500 hover:text-primary-600 rounded-lg transition-colors border border-slate-200" title="שתף בוואטסאפ" onClick={() => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(getLinkPublicUrl(link))}`, '_blank')}>
        <WhatsappIcon className="w-5 h-5" />
      </button>
      <button type="button" className="p-2 bg-slate-100 hover:bg-sky-50 text-slate-500 hover:text-sky-600 rounded-lg transition-colors border border-slate-200" title="העתק קישור" onClick={() => handleCopyPublicUrl(link)}>
        <LinkIcon className="w-5 h-5" />
      </button>
    </div>
  );

  const loadTabData = useCallback(async (tab: typeof activeTab) => {
    setLoading(true);
    setLoadError(null);
    try {
      if (!isPlatformAdmin && !tenantClientId) {
        setLinks([]);
        setCandidates([]);
        setStats(null);
        setThemeConfig(initialTheme);
        setHeroGallery([]);
        setLoadError('אין לחשבון משתמש לקוח מקושר');
        return;
      }
      if (isPlatformAdmin && !effectiveClientId) {
        setLinks([]);
        setCandidates([]);
        setStats(null);
        setThemeConfig(initialTheme);
        setHeroGallery([]);
        setLoadError(null);
        return;
      }
      if (tab === 'design' && !effectiveClientId) {
        setThemeConfig(initialTheme);
        setHeroGallery([]);
        if (isPlatformAdmin) {
          setLoadError('בחרו לקוח כדי לערוך עיצוב דף קריירה');
        }
        return;
      }
      const scopeId = effectiveClientId;
      if (tab === 'links') setLinks(await fetchPublishingLinks(scopeId));
      if (tab === 'candidates') setCandidates(await fetchPublishingCandidates(scopeId));
      if (tab === 'stats') setStats(await fetchPublishingStats(scopeId));
      if (tab === 'design' && scopeId) {
        setThemeConfig(await fetchCareerTheme(scopeId));
        setHeroGallery(await fetchHeroGallery(scopeId));
      }
    } catch (err: any) {
      setLoadError(err?.message || 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }, [effectiveClientId, isPlatformAdmin, tenantClientId]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const handleColorChange = (key: keyof CareerPageTheme, value: string) => {
    setThemeConfig((prev) => ({ ...prev, [key]: value }));
    setIsSaved(false);
    setSaveError(null);
  };

  const handleSaveTheme = async () => {
    if (!effectiveClientId) {
      setSaveError('יש לבחור לקוח לפני שמירה');
      return;
    }
    setSaveError(null);
    try {
      const saved = await saveCareerTheme(themeConfig, effectiveClientId);
      setThemeConfig(saved);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'שמירה נכשלה');
    }
  };

  const handleResetTheme = () => {
    setThemeConfig(initialTheme);
    setIsSaved(false);
  };

  const handleAddGalleryImage = async () => {
    if (!newGalleryUrl.trim() || !effectiveClientId) return;
    setGalleryError(null);
    try {
      const images = await addHeroGalleryImage(newGalleryUrl.trim(), newGalleryLabel.trim() || undefined, effectiveClientId);
      setHeroGallery(images);
      setNewGalleryUrl('');
      setNewGalleryLabel('');
    } catch (err: any) {
      setGalleryError(err?.message || 'הוספת התמונה נכשלה');
    }
  };

  const handleRemoveGalleryImage = async (imageId: string) => {
    if (!effectiveClientId) return;
    setGalleryError(null);
    try {
      const images = await removeHeroGalleryImage(imageId, effectiveClientId);
      setHeroGallery(images);
    } catch (err: any) {
      setGalleryError(err?.message || 'מחיקת התמונה נכשלה');
    }
  };

  const statCards = stats
    ? [
        { label: 'סה"כ משרות מפורסמות', value: stats.totalPublishedJobs.toLocaleString('he-IL') },
        { label: 'משרות עם קישורים פעילים', value: stats.jobsWithActiveLinks.toLocaleString('he-IL') },
        { label: 'סה"כ קישורים שנוצרו', value: stats.totalLinks.toLocaleString('he-IL') },
        { label: 'סה"כ כניסות לדפי תכלול', value: stats.totalVisits.toLocaleString('he-IL') },
        { label: 'סה"כ הגשות דרך הדפים', value: stats.totalSubmissions.toLocaleString('he-IL'), color: 'text-green-600' },
        { label: 'יחס המרה (כניסות/הגשות)', value: `${stats.conversionRate}%`, color: 'text-indigo-600' },
      ]
    : [];

  return (
    <div className="bg-bg-default h-full w-full flex flex-col font-sans">
      <div className="bg-white border-b border-border-default px-6 py-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black text-text-default">דפי נחיתה ופרסום</h1>
            <p className="text-text-muted mt-1 font-medium">ניהול דפי קריירה, לינקים למשרות, עיצוב ומעקב מועמדים מקמפיינים.</p>
            {!isPlatformAdmin && selectedClientLabel && (
              <p className="text-sm text-primary-700 mt-1 font-semibold">לקוח: {selectedClientLabel}</p>
            )}
            {isPlatformAdmin && selectedClientLabel && (
              <p className="text-sm text-primary-700 mt-1 font-semibold">מציג נתונים עבור: {selectedClientLabel}</p>
            )}
            <p className="text-xs text-text-muted mt-1">מוצגות משרות פתוחות בלבד (ללא טיוטות וללא &quot;לקוח כללי&quot;/&quot;לקוח חדש&quot;). עמודת &quot;שם מעסיק&quot; = חברת היעד של המשרה (רפא, אורד וכו׳) — משרות גיוס של מימד אנושי ללקוחות אלו.</p>
          </div>
          {isPlatformAdmin ? (
            <div className="w-full lg:w-72 flex-shrink-0">
              <label className="block text-xs font-bold text-text-muted mb-1.5">בחירת לקוח</label>
              <SearchableSelect
                options={clientOptions}
                value={adminClientId}
                onChange={handleAdminClientChange}
                placeholder={clientsListLoading ? 'טוען לקוחות...' : 'בחרו לקוח'}
                className="w-full"
                icon={<BuildingOffice2Icon className="w-4 h-4 text-text-subtle" />}
                disabled={clientsListLoading}
              />
            </div>
          ) : null}
        </div>
        <div className="flex justify-end">
        <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'links', label: 'קישורים', icon: <LinkIcon className="w-5 h-5" /> },
            { id: 'candidates', label: 'מועמדים', icon: <UserIcon className="w-5 h-5" /> },
            { id: 'stats', label: 'סטטיסטיקה', icon: <ChartBarIcon className="w-5 h-5" /> },
            { id: 'design', label: 'עיצוב דף קריירה', icon: <PaintBrushIcon className="w-5 h-5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-text-muted hover:text-text-default hover:bg-slate-200/50'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto auto-rows-max h-full">
          {loadError && <p className="text-sm text-red-600 mb-4">{loadError}</p>}
          {loading && <p className="text-sm text-text-muted mb-4">טוען...</p>}
          {adminNeedsClient && !loading && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center text-amber-900">
              <BuildingOffice2Icon className="w-10 h-10 mx-auto mb-3 text-amber-600" />
              <p className="font-bold text-lg">בחרו לקוח מהרשימה למעלה</p>
              <p className="text-sm mt-2 text-amber-800">כמנהל מערכת, יש לבחור לקוח כדי לצפות בקישורי פרסום, מועמדים, סטטיסטיקה ועיצוב.</p>
            </div>
          )}

          {activeTab === 'links' && !loading && !adminNeedsClient && (
            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden animate-fade-in-up">
              <div className="px-6 py-5 border-b border-border-default flex justify-between items-center bg-slate-50 gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-lg font-bold text-text-default flex items-center gap-2">
                    <MegaphoneIcon className="w-6 h-6 text-primary-500" />
                    קישורי פרסום פעילים
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopyPublicBoardUrl}
                    disabled={!boardClientKey}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      publicBoardCopied
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : 'bg-primary-600 text-white border-primary-600 hover:bg-primary-700'
                    }`}
                    title="העתק קישור שיתוף ללוח המשרות — עם תצוגה מקדימה בוואטסאפ"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {publicBoardCopied ? 'הקישור הועתק!' : 'העתק קישור שיתוף'}
                  </button>
                  <button
                    type="button"
                    disabled={!boardClientKey}
                    onClick={handleCopyWhatsAppPreviewUrl}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                      whatsappShareCopied
                        ? 'bg-green-50 text-green-800 border-green-200'
                        : 'border-green-200 bg-green-50 text-green-800 hover:bg-green-100'
                    }`}
                    title="העתק קישור שיתוף לוואטסאפ — עם תצוגה מקדימה (og:image, כותרת)"
                  >
                    <WhatsappIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{whatsappShareCopied ? 'הועתק לוואטסאפ!' : 'העתק לוואטסאפ'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!boardClientKey}
                    onClick={() => {
                      window.open(buildPublicJobBoardAppUrl(boardClientKey), '_blank', 'noopener,noreferrer');
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="פתח לוח משרות בתצוגה חיצונית"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">תצוגה חיצונית</span>
                  </button>
                </div>
                {links.length > 0 && (
                  <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setLinksViewMode('table')}
                      className={`p-2 rounded-md transition-all ${linksViewMode === 'table' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="תצוגת טבלה"
                    >
                      <TableCellsIcon className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinksViewMode('cards')}
                      className={`p-2 rounded-md transition-all ${linksViewMode === 'cards' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="תצוגת כרטיסים"
                    >
                      <Squares2X2Icon className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                {links.length === 0 ? (
                  <p className="p-8 text-center text-text-muted">אין קישורי פרסום עדיין. הגדירו פרסום למשרות בעמוד פרסום המשרה.</p>
                ) : linksViewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6">
                    {links.map((link) => {
                      const heroImage = getLinkHeroImage(link);
                      const publicUrl = getLinkPublicUrl(link);

                      return (
                      <div key={link.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
                        <div className="relative h-44 overflow-hidden">
                          {heroImage ? (
                            <img
                              src={heroImage}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="absolute inset-0"
                              style={{ background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #0f766e 100%)' }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
                          <div className="relative h-full flex flex-col justify-between p-5">
                            <span className="self-start inline-block px-4 py-1.5 rounded-lg text-xs font-black text-white bg-slate-900/80 backdrop-blur-sm tracking-wide border border-white/10">
                              {link.client}
                            </span>
                            <button
                              type="button"
                              onClick={() => navigate(`/jobs/${link.jobId}/publish`)}
                              className="text-lg font-black text-white hover:text-teal-200 text-right leading-snug transition-colors drop-shadow-sm"
                              title="ערוך פרסום משרה"
                            >
                              {link.jobTitle}
                            </button>
                          </div>
                        </div>
                        <div className="p-5 flex-1 flex flex-col gap-4">
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200">{link.status}</span>
                            <span className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-800 border border-teal-100">{link.source}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCopyPublicUrl(link)}
                            className={`w-full text-right rounded-xl border px-3 py-2.5 transition-colors ${
                              copiedLinkId === link.id
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                            }`}
                            title="העתק קישור ציבורי לצפייה חיצונית"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <ShareIcon className="w-4 h-4 shrink-0 text-indigo-500" />
                              <span className="text-xs font-bold">
                                {copiedLinkId === link.id ? 'הקישור הועתק!' : 'קישור ציבורי לצפייה חיצונית'}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono truncate dir-ltr text-left opacity-80">{publicUrl}</div>
                          </button>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">כניסות</div>
                              <div className="text-2xl font-black text-slate-900 mt-0.5">{link.visits}</div>
                            </div>
                            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">הגשות</div>
                              <div className="text-2xl font-black text-green-600 mt-0.5">{link.submissions}</div>
                            </div>
                            <div className="bg-white rounded-xl p-3 text-center border border-slate-100">
                              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">המרה</div>
                              <div className="text-2xl font-black text-indigo-600 mt-0.5">{link.subPercent}%</div>
                            </div>
                          </div>

                          <div className="bg-white rounded-xl p-3 border border-slate-100">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                              <span>יחס המרה</span>
                              <span className="text-slate-800">{link.subPercent}%</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-l from-teal-500 to-indigo-500 rounded-full transition-all" style={{ width: `${Math.min(link.subPercent, 100)}%` }} />
                            </div>
                          </div>

                          <div className="mt-auto pt-2 border-t border-slate-200">
                            {renderLinkActions(link)}
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>
                ) : (
                  <table className="min-w-full text-right align-middle text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-border-default">
                      <tr>
                        <th className="px-6 py-4 font-bold text-text-muted">שם מעסיק</th>
                        <th className="px-6 py-4 font-bold text-text-muted">כותרת משרה</th>
                        <th className="px-6 py-4 font-bold text-text-muted">סטטוס</th>
                        <th className="px-6 py-4 font-bold text-text-muted">מקור גיוס</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">כניסות</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">הגשות</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">% המרה</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                      {links.map((link) => (
                        <tr key={link.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-text-default">{link.client}</td>
                          <td className="px-6 py-4 font-semibold">
                            <button
                              type="button"
                              onClick={() => navigate(`/jobs/${link.jobId}/publish`)}
                              className="text-primary-600 hover:text-primary-800 hover:underline text-right"
                              title="ערוך פרסום משרה"
                            >
                              {link.jobTitle}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-slate-200 text-slate-700">{link.status}</span>
                          </td>
                          <td className="px-6 py-4 font-medium text-text-muted">{link.source}</td>
                          <td className="px-6 py-4 text-center font-bold">{link.visits}</td>
                          <td className="px-6 py-4 text-center font-bold text-green-600">{link.submissions}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span className="font-bold w-10 text-left">{link.subPercent}%</span>
                              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(link.subPercent, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">{renderLinkActions(link)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'candidates' && !loading && !adminNeedsClient && (
            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden animate-fade-in-up">
              <div className="px-6 py-5 border-b border-border-default bg-slate-50">
                <h2 className="text-lg font-bold text-text-default flex items-center gap-2">
                  <UserIcon className="w-6 h-6 text-indigo-500" />
                  מועמדים מדפי פרסום
                </h2>
              </div>
              <div className="overflow-x-auto">
                {candidates.length === 0 ? (
                  <p className="p-8 text-center text-text-muted">טרם התקבלו מועמדויות מדפי פרסום.</p>
                ) : (
                  <table className="min-w-full text-right align-middle text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-border-default">
                      <tr>
                        <th className="px-6 py-4 font-bold text-text-muted">שם המועמד</th>
                        <th className="px-6 py-4 font-bold text-text-muted">שם מעסיק</th>
                        <th className="px-6 py-4 font-bold text-text-muted">כותרת משרה</th>
                        <th className="px-6 py-4 font-bold text-text-muted">עיר</th>
                        <th className="px-6 py-4 font-bold text-text-muted">תאריך הגשה</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">מקור גיוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                      {candidates.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-primary-600">{c.name}</td>
                          <td className="px-6 py-4 font-semibold text-text-default">{c.client}</td>
                          <td className="px-6 py-4 font-medium text-text-muted max-w-[200px] truncate">{c.jobTitle}</td>
                          <td className="px-6 py-4 font-medium text-text-default">{c.city}</td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-text-default">{c.date}</div>
                            <div className="text-xs font-medium text-text-muted">{c.time}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">{c.source}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stats' && !loading && !adminNeedsClient && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
              {statCards.map((stat, idx) => (
                <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between h-36">
                  <div className="text-sm font-bold text-text-muted">{stat.label}</div>
                  <div className={`text-4xl font-black tracking-tight ${stat.color || 'text-text-default'}`}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'design' && !loading && !adminNeedsClient && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_800px] gap-8 animate-fade-in-up items-start">
              <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden sticky top-8">
                <div className="px-6 py-5 border-b border-border-default bg-slate-50 flex items-center justify-between">
                  <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <PaintBrushIcon className="w-6 h-6 text-indigo-500" />
                    מיתוג דף קריירה
                  </h2>
                  <button type="button" onClick={handleResetTheme} className="text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">
                    איפוס לעיצוב ברירת מחדל
                  </button>
                </div>
                <div className="p-6 sm:p-8 space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                    {[
                      { key: 'bannerBg', label: 'רקע הבאנר העליון' },
                      { key: 'bannerText', label: 'טקסט הבאנר' },
                      { key: 'structure', label: 'אלמנטי מבנה מרכזיים' },
                      { key: 'buttonBg', label: 'רקע כפתורים' },
                      { key: 'buttonText', label: 'טקסט כפתורים' },
                      { key: 'formBg', label: 'רקע אזור הטופס' },
                      { key: 'additionalDetails', label: 'תיבות מידע נוספות' },
                    ].map((setting) => (
                      <div key={setting.key} className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-700">{setting.label}</label>
                        <ColorPicker
                          value={themeConfig[setting.key as keyof CareerPageTheme]}
                          onChange={(val) => handleColorChange(setting.key as keyof CareerPageTheme, val)}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="pt-8 border-t border-slate-100 space-y-4">
                    <h3 className="text-lg font-black text-slate-900">מאגר תמונות לבאנרים</h3>
                    <p className="text-sm text-text-muted">תמונות אלו יהיו זמינות לבחירה בעמוד פרסום המשרה.</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={newGalleryUrl}
                        onChange={(e) => setNewGalleryUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                        dir="ltr"
                      />
                      <input
                        type="text"
                        value={newGalleryLabel}
                        onChange={(e) => setNewGalleryLabel(e.target.value)}
                        placeholder="תווית (אופציונלי)"
                        className="sm:w-40 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddGalleryImage}
                        className="px-4 py-2 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 text-sm"
                      >
                        הוסף
                      </button>
                    </div>
                    {galleryError && <p className="text-sm text-red-600">{galleryError}</p>}
                    {heroGallery.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {heroGallery.map((img) => (
                          <div key={img.id} className="relative group rounded-xl overflow-hidden border border-slate-200">
                            <img src={img.url} alt={img.label || ''} className="w-full aspect-video object-cover" />
                            <button
                              type="button"
                              onClick={() => handleRemoveGalleryImage(img.id)}
                              className="absolute top-1 left-1 bg-red-600 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                            >
                              מחק
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted">אין תמונות במאגר עדיין.</p>
                    )}
                  </div>

                  {saveError && <p className="text-sm text-red-600">{saveError}</p>}

                  <div className="pt-8 border-t border-slate-100 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveTheme}
                      className={`px-8 py-3.5 rounded-xl font-bold text-white transition-all shadow-lg active:scale-[0.98] flex items-center gap-2 ${
                        isSaved ? 'bg-green-600 shadow-green-500/20' : 'bg-slate-900 hover:bg-indigo-600'
                      }`}
                    >
                      {isSaved ? 'העיצוב נשמר בהצלחה!' : 'שמור שינויים והחל'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-100 rounded-[2rem] border-[8px] border-slate-200 overflow-hidden shadow-2xl relative h-[700px] flex flex-col pointer-events-none select-none">
                <div className="absolute top-0 inset-x-0 h-8 bg-slate-200 flex items-center px-4 gap-2 border-b border-slate-300">
                  <div className="w-3 h-3 rounded-full bg-slate-400" />
                  <div className="w-3 h-3 rounded-full bg-slate-400" />
                  <div className="w-3 h-3 rounded-full bg-slate-400" />
                </div>
                <div className="mt-8 flex-1 overflow-auto pointer-events-auto bg-white" dir="rtl">
                  <div style={{ background: themeConfig.bannerBg, color: themeConfig.bannerText }} className="px-8 py-10">
                    <div className="w-16 h-16 bg-white/20 rounded-xl mb-6 flex items-center justify-center backdrop-blur-sm">🏢</div>
                    <h1 className="text-4xl font-black mb-2">מנהל/ת שיווק והפצה</h1>
                    <div className="flex gap-4 font-bold opacity-80 text-sm">
                      <span>📍 מרכז</span>
                      <span>💼 משרה מלאה</span>
                    </div>
                  </div>
                  <div className="p-8 grid grid-cols-1 sm:grid-cols-[1fr_300px] gap-8 items-start relative">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-xl font-bold mb-3 border-b-2 pb-1 inline-block" style={{ borderBottomColor: themeConfig.structure, color: themeConfig.structure }}>תיאור המשרה</h3>
                        <div className="space-y-2 text-slate-600 text-sm leading-relaxed">
                          <div className="h-4 bg-slate-100 rounded w-full" />
                          <div className="h-4 bg-slate-100 rounded w-11/12" />
                        </div>
                      </div>
                      <div style={{ background: themeConfig.additionalDetails }} className="p-6 rounded-2xl">
                        <h3 className="text-lg font-bold mb-3 border-b-2 pb-1 inline-block" style={{ borderBottomColor: themeConfig.structure, color: themeConfig.structure }}>דרישות סף</h3>
                      </div>
                    </div>
                    <div style={{ background: themeConfig.formBg }} className="p-6 rounded-3xl border border-slate-100 shadow-sm">
                      <h3 className="text-lg font-black text-slate-900 mb-6 text-center">הגשת מועמדות</h3>
                      <button type="button" style={{ background: themeConfig.buttonBg, color: themeConfig.buttonText }} className="w-full py-4 rounded-xl font-bold shadow-md">
                        שלח מועמדות
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublishingSettingsView;
