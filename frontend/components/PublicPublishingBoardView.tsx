import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  TableCellsIcon, Squares2X2Icon, MapPinIcon, BriefcaseIcon,
} from './Icons';
import {
  fetchPublicJobBoard,
  fetchPublicBoardBranding,
  buildPublicJobHashPath,
  buildPublicJobBoardHashPath,
  resolvePublicClientRouteKey,
  type PublicBoardJob,
  type PublicBoardBranding,
} from '../services/publishingApi';
import { useAuth } from '../context/AuthContext';
import PublicBoardFilters, {
  filterPublicBoardJobs,
  type PublicBoardFilterState,
} from './PublicBoardFilters';

const DEFAULT_BRAND_COLOR = '#1e293b';

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getJobHeroImage = (job: PublicBoardJob) =>
  job.heroImage?.trim() || job.heroImageUrl?.trim() || null;

const PublicPublishingBoardView: React.FC = () => {
  const navigate = useNavigate();
  const { clientName: clientNameParam } = useParams<{ clientName?: string }>();
  const { user, ready: authReady } = useAuth();
  const [jobs, setJobs] = useState<PublicBoardJob[]>([]);
  const [boardBranding, setBoardBranding] = useState<PublicBoardBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [filters, setFilters] = useState<PublicBoardFilterState>({
    search: '',
    fields: [],
    jobTypes: [],
    locations: [],
  });

  useEffect(() => {
    if (!authReady || clientNameParam) return;
    const clientId = user?.clientId?.trim();
    if (!clientId) return;
    fetchPublicBoardBranding(clientId).then((branding) => {
      const domain = resolvePublicClientRouteKey(branding?.domain);
      if (domain) navigate(buildPublicJobBoardHashPath(domain), { replace: true });
    });
  }, [authReady, clientNameParam, user?.clientId, navigate]);

  useEffect(() => {
    if (!clientNameParam) return;
    const decoded = decodeURIComponent(clientNameParam);
    if (!CLIENT_UUID_RE.test(decoded)) return;
    let active = true;
    fetchPublicBoardBranding(clientNameParam).then((branding) => {
      if (!active) return;
      const domain = resolvePublicClientRouteKey(branding?.domain);
      if (domain && decoded.toLowerCase() !== domain.toLowerCase()) {
        navigate(buildPublicJobBoardHashPath(domain), { replace: true });
      }
    });
    return () => { active = false; };
  }, [clientNameParam, navigate]);

  useEffect(() => {
    const domain = boardBranding?.domain?.trim();
    if (!domain || !clientNameParam) return;
    const decoded = decodeURIComponent(clientNameParam);
    if (decoded.toLowerCase() !== domain.toLowerCase()) {
      navigate(buildPublicJobBoardHashPath(domain), { replace: true });
    }
  }, [boardBranding, clientNameParam, navigate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchPublicJobBoard(clientNameParam ? { client: clientNameParam } : undefined)
      .then(({ jobs: rows, branding }) => {
        if (!active) return;
        setJobs(rows);
        setBoardBranding(branding);
      })
      .catch((err) => {
        if (active) setLoadError(err?.message || 'שגיאה בטעינת המשרות');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [clientNameParam]);

  const branding = useMemo(() => {
    const decodedClient = clientNameParam ? decodeURIComponent(clientNameParam) : '';
    const nameFromUrl = decodedClient && !CLIENT_UUID_RE.test(decodedClient) ? decodedClient : '';
    if (boardBranding) {
      return {
        name: boardBranding.clientName?.trim() || nameFromUrl || '',
        logoUrl: boardBranding.logoUrl?.trim() || null,
        primaryColor: boardBranding.primaryColor?.trim() || DEFAULT_BRAND_COLOR,
      };
    }
    if (clientNameParam) {
      return {
        name: nameFromUrl || '',
        logoUrl: null,
        primaryColor: DEFAULT_BRAND_COLOR,
      };
    }
    return { name: '', logoUrl: null, primaryColor: DEFAULT_BRAND_COLOR };
  }, [clientNameParam, boardBranding]);

  const brandStyle = useMemo(
    () => ({ '--brand': branding.primaryColor }) as React.CSSProperties,
    [branding.primaryColor],
  );

  const filteredJobs = useMemo(
    () => filterPublicBoardJobs(jobs, filters),
    [jobs, filters],
  );

  const openJob = (job: PublicBoardJob) => {
    const clientKey =
      resolvePublicClientRouteKey(boardBranding?.domain) ||
      (clientNameParam && !CLIENT_UUID_RE.test(decodeURIComponent(clientNameParam))
        ? decodeURIComponent(clientNameParam)
        : undefined);
    navigate(`${buildPublicJobHashPath(job.jobId, job.postingCode, clientKey)}?src=job_board`);
  };

  return (
    <div className="bg-bg-default min-h-screen w-full flex flex-col font-sans" style={brandStyle}>
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto auto-rows-max h-full">
          {(branding.name || branding.logoUrl) && (
            <header
              className="mb-6 rounded-2xl overflow-hidden shadow-sm border border-border-default"
              style={{ borderColor: `${branding.primaryColor}33` }}
            >
              <div
                className="px-6 py-5 flex items-center gap-4 flex-wrap"
                style={{ backgroundColor: branding.primaryColor }}
              >
                {branding.logoUrl ? (
                  <div className="h-14 px-3 rounded-xl bg-white/95 flex items-center justify-center shadow-sm">
                    <img
                      src={branding.logoUrl}
                      alt={branding.name}
                      className="max-h-10 max-w-[180px] object-contain"
                    />
                  </div>
                ) : null}
                <div>
                  <p className="text-white/80 text-sm font-medium">משרות פתוחות</p>
                  <h1 className="text-xl md:text-2xl font-black text-white">{branding.name}</h1>
                </div>
              </div>
            </header>
          )}

          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p
                  className="text-sm font-bold uppercase tracking-widest mb-1"
                  style={{ color: branding.primaryColor }}
                >
                  {branding.name || 'לוח משרות'}
                </p>
                <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
                  משרות פעילות
                </h1>
                {!loading && (
                  <p className="text-slate-500 font-medium mt-2 text-sm md:text-base">
                    {filteredJobs.length} משרות פתוחות להגשה · עודכן לאחרונה
                  </p>
                )}
              </div>
            </div>
          </div>

          {!loading && jobs.length > 0 && (
            <PublicBoardFilters
              jobs={jobs}
              filters={filters}
              setFilters={setFilters}
              resultsCount={filteredJobs.length}
              accentColor={branding.primaryColor}
            />
          )}

          {loadError && <p className="text-sm text-red-600 mb-4">{loadError}</p>}
          {loading && <p className="text-sm text-text-muted mb-4">טוען...</p>}

          {!loading && (
            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden animate-fade-in-up">
              {(filteredJobs.length > 0 || jobs.length > 0) && (
                <div className="px-6 py-4 border-b border-border-default flex justify-end bg-slate-50">
                  <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                      style={viewMode === 'table' ? { backgroundColor: branding.primaryColor } : undefined}
                      title="תצוגת טבלה"
                    >
                      <TableCellsIcon className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                      style={viewMode === 'cards' ? { backgroundColor: branding.primaryColor } : undefined}
                      title="תצוגת כרטיסים"
                    >
                      <Squares2X2Icon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                {jobs.length === 0 ? (
                  <p className="p-8 text-center text-text-muted">אין משרות מפורסמות כרגע.</p>
                ) : filteredJobs.length === 0 ? (
                  <p className="p-8 text-center text-text-muted">לא נמצאו משרות התואמות את הסינון.</p>
                ) : viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-6">
                    {filteredJobs.map((job) => {
                      const heroImage = getJobHeroImage(job);

                      return (
                        <div
                          key={job.jobId}
                          className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                        >
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
                                style={{
                                  background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.primaryColor}cc 50%, #0f172a 100%)`,
                                }}
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
                            <div className="relative h-full flex flex-col justify-end p-5">
                              <button
                                type="button"
                                onClick={() => openJob(job)}
                                className="text-lg font-black text-white hover:opacity-90 text-right leading-snug transition-opacity drop-shadow-sm"
                              >
                                {job.title}
                              </button>
                            </div>
                          </div>
                          <div className="p-5 flex-1 flex flex-col gap-4">
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-slate-700 border border-slate-200">
                                <MapPinIcon className="w-3.5 h-3.5" />
                                {job.location}
                              </span>
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border"
                                style={{
                                  backgroundColor: `${branding.primaryColor}14`,
                                  color: branding.primaryColor,
                                  borderColor: `${branding.primaryColor}33`,
                                }}
                              >
                                <BriefcaseIcon className="w-3.5 h-3.5" />
                                {job.jobType}
                              </span>
                              {job.postedDate && (
                                <span
                                  className="inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border"
                                  style={{
                                    backgroundColor: `${branding.primaryColor}0d`,
                                    color: branding.primaryColor,
                                    borderColor: `${branding.primaryColor}22`,
                                  }}
                                >
                                  {job.postedDate}
                                </span>
                              )}
                            </div>

                            {job.description && (
                              <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{job.description}</p>
                            )}

                            <div className="mt-auto pt-2 border-t border-slate-200">
                              <button
                                type="button"
                                onClick={() => openJob(job)}
                                className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90 shadow-sm"
                                style={{ backgroundColor: branding.primaryColor }}
                              >
                                צפה במשרה והגש מועמדות
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <table className="min-w-full text-right align-middle text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-border-default">
                      <tr>
                        <th className="px-6 py-4 font-bold text-text-muted">כותרת משרה</th>
                        <th className="px-6 py-4 font-bold text-text-muted">מיקום</th>
                        <th className="px-6 py-4 font-bold text-text-muted">סוג משרה</th>
                        <th className="px-6 py-4 font-bold text-text-muted">תאריך פרסום</th>
                        <th className="px-6 py-4 font-bold text-text-muted text-center">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                      {filteredJobs.map((job) => (
                        <tr key={job.jobId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-semibold">
                            <button
                              type="button"
                              onClick={() => openJob(job)}
                              className="hover:underline text-right"
                              style={{ color: branding.primaryColor }}
                            >
                              {job.title}
                            </button>
                          </td>
                          <td className="px-6 py-4 font-medium text-text-muted">{job.location}</td>
                          <td className="px-6 py-4 font-medium text-text-muted">{job.jobType}</td>
                          <td className="px-6 py-4 font-medium text-text-default">{job.postedDate}</td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => openJob(job)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                              style={{ backgroundColor: branding.primaryColor }}
                            >
                              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                              צפה במשרה
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PublicPublishingBoardView;
