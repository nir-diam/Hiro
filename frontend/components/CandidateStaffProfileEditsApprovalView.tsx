import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const FIELD_LABELS_HE: Record<string, string> = {
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  fullName: 'שם מלא',
  phone: 'טלפון',
  email: 'אימייל',
  idNumber: 'תעודת זהות',
  address: 'עיר / כתובת',
  location: 'מיקום',
  gender: 'מגדר',
  maritalStatus: 'מצב משפחתי',
  birthYear: 'שנת לידה',
  title: 'כותרת',
  professionalSummary: 'תקציר מקצועי',
  workExperience: 'ניסיון תעסוקתי',
  education: 'השכלה',
  languages: 'שפות',
  skills: 'כישורים',
  desiredRoles: 'תפקידים מבוקשים',
  salaryMin: 'שכר מינימום',
  salaryMax: 'שכר מקסימום',
  employmentType: 'סוג העסקה',
  employmentTypes: 'סוג העסקה',
  jobScope: 'היקף משרה',
  jobScopes: 'היקף משרה',
  drivingLicense: 'רישיון נהיגה',
  drivingLicenses: 'רישיון נהיגה',
  preferredWorkModels: 'מודל עבודה',
  availability: 'זמינות',
};

/** Legacy scalar + current array are the same recruiter field — show once. */
const FIELD_ALIAS_TO_CANONICAL: Record<string, string> = {
  jobScope: 'jobScopes',
  employmentType: 'employmentTypes',
  drivingLicense: 'drivingLicenses',
};

type FieldEntry = { from?: unknown; to?: unknown };
type ProposalPayload = {
  candidateId: string;
  fullName?: string | null;
  proposal: {
    id: string;
    status: string;
    createdAt?: string;
    expiresAt?: string;
    proposedBy?: string | null;
    note?: string | null;
    fields: Record<string, FieldEntry>;
  };
};

const formatValue = (value: unknown): string => {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join(', ') : '—';
  }
  if (typeof value === 'string') return value.length > 160 ? `${value.slice(0, 157)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value, null, 0);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  } catch {
    return '—';
  }
};

const canonicalFieldKey = (field: string): string => FIELD_ALIAS_TO_CANONICAL[field] || field;

const visibleProposalFields = (
  fields: Record<string, FieldEntry>,
): Array<[string, FieldEntry]> => {
  const keys = new Set(Object.keys(fields));
  return Object.entries(fields).filter(([key]) => {
    const canon = FIELD_ALIAS_TO_CANONICAL[key];
    return !(canon && keys.has(canon));
  });
};

const relatedProposalFieldKeys = (field: string, fields: Record<string, FieldEntry>): string[] => {
  const canon = canonicalFieldKey(field);
  const related = Object.keys(fields).filter((key) => canonicalFieldKey(key) === canon);
  return related.length ? related : [field];
};

const CandidateStaffProfileEditsApprovalView: React.FC = () => {
  const [searchParams] = useSearchParams();
  const candidateId = String(searchParams.get('cid') || '').trim();
  const token = String(searchParams.get('token') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProposalPayload | null>(null);
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'reject'>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const proposalFields = data?.proposal?.fields || {};
  const fields = useMemo(
    () => visibleProposalFields(data?.proposal?.fields || {}),
    [data],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!candidateId || !token) {
        setError('קישור לא תקין');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${apiBase()}/api/candidates/${encodeURIComponent(candidateId)}/staff-profile-proposal?token=${encodeURIComponent(token)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'לא נמצאה בקשת אישור');
        if (!cancelled) {
          setData(body as ProposalPayload);
          const initial: Record<string, 'approve' | 'reject'> = {};
          Object.keys(body?.proposal?.fields || {}).forEach((k) => {
            initial[k] = 'approve';
          });
          setDecisions(initial);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'טעינה נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [candidateId, token]);

  const setAll = useCallback((decision: 'approve' | 'reject') => {
    setDecisions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = decision;
      });
      return next;
    });
  }, []);

  const submit = useCallback(async () => {
    if (!candidateId || !token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase()}/api/candidates/${encodeURIComponent(candidateId)}/resolve-staff-profile-proposal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisions, accessToken: token, actor: 'המועמד' }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'שמירה נכשלה');
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'שמירה נכשלה');
    } finally {
      setSubmitting(false);
    }
  }, [candidateId, token, decisions, submitting]);

  return (
    <div className="min-h-screen bg-bg-subtle px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border-default bg-bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border-default bg-primary-600 px-5 py-4 text-white">
          <h1 className="text-lg font-bold">אישור עדכוני פרופיל</h1>
          <p className="text-sm text-primary-100 mt-1">
            {data?.fullName ? `עבור ${data.fullName}` : 'בחרו אילו שינויים לאשר'}
          </p>
          {data?.proposal?.createdAt || data?.proposal?.proposedBy ? (
            <p className="text-xs text-primary-100/90 mt-1">
              {data.proposal.proposedBy ? `עודכן על ידי ${data.proposal.proposedBy}` : 'עודכן'}
              {data.proposal.createdAt
                ? ` · ${new Date(data.proposal.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`
                : ''}
            </p>
          ) : null}
        </div>
        <div className="p-5 space-y-4">
          {loading ? <p className="text-sm text-text-muted">טוען…</p> : null}
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          ) : null}
          {done ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              התשובה נשמרה. תודה!
            </div>
          ) : null}
          {!loading && !done && data ? (
            <>
              {data.proposal.note ? (
                <p className="text-sm text-text-muted">הערה מהצוות: {data.proposal.note}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-semibold hover:bg-bg-hover"
                  onClick={() => setAll('approve')}
                >
                  אשר הכל
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-semibold hover:bg-bg-hover"
                  onClick={() => setAll('reject')}
                >
                  דחה הכל
                </button>
              </div>
              <ul className="space-y-3">
                {fields.map(([field, entry]) => (
                  <li
                    key={field}
                    className="rounded-xl border border-border-default bg-bg-subtle/40 px-3 py-3"
                  >
                    <div className="font-bold text-sm text-text-default mb-1">
                      {FIELD_LABELS_HE[field] || field}
                    </div>
                    <div className="text-xs text-text-muted space-y-1">
                      <p>
                        <span className="font-semibold">היה:</span> {formatValue(entry?.from)}
                      </p>
                      <p>
                        <span className="font-semibold">מוצע:</span> {formatValue(entry?.to)}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((d) => {
                            const next = { ...d };
                            relatedProposalFieldKeys(field, proposalFields).forEach((key) => {
                              next[key] = 'approve';
                            });
                            return next;
                          })
                        }
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
                          decisions[field] === 'approve'
                            ? 'bg-emerald-600 text-white'
                            : 'border border-border-default bg-bg-card'
                        }`}
                      >
                        אשר
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDecisions((d) => {
                            const next = { ...d };
                            relatedProposalFieldKeys(field, proposalFields).forEach((key) => {
                              next[key] = 'reject';
                            });
                            return next;
                          })
                        }
                        className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${
                          decisions[field] === 'reject'
                            ? 'bg-amber-600 text-white'
                            : 'border border-border-default bg-bg-card'
                        }`}
                      >
                        דחה
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={submitting || fields.length === 0}
                onClick={() => void submit()}
                className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-60"
              >
                {submitting ? 'שולח…' : 'שמירת החלטות'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CandidateStaffProfileEditsApprovalView;
