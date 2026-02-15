import React, { useMemo } from 'react';
import IndustryExperienceTable from './IndustryExperienceTable';
import { XMarkIcon } from './Icons';

interface IndustryExperienceModalProps {
  onClose: () => void;
  experiences?: any[];
  candidateName?: string;
  candidateTitle?: string;
  candidateSummary?: string;
}

const parseDateValue = (value?: string) => {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'present') return new Date();
  const parts = normalized.split('-');
  const year = Number(parts[0]);
  const month = parts[1] ? Number(parts[1]) - 1 : 0;
  if (!isNaN(year)) {
    return new Date(year, isNaN(month) ? 0 : month, 1);
  }
  const fallback = new Date(normalized);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const computeYearDiff = (start?: string, end?: string) => {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end) || new Date();
  if (!startDate || isNaN(startDate.getTime())) return 1;
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffYears = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 365)));
  return diffYears;
};

const computeYearsAgo = (end?: string) => {
  const endDate = parseDateValue(end);
  if (!endDate || isNaN(endDate.getTime())) return 0;
  const now = new Date();
  return Math.max(0, now.getFullYear() - endDate.getFullYear());
};

const normalizeExperiences = (items: any[] = []) => {
  return items.map((exp, index) => {
    if (!exp || typeof exp === 'string') {
      return {
        id: `legacy-${index}`,
        company: 'חברה לא מזוהה',
        industry: 'לא צוין',
        field: '',
        yearsOfExperience: 1,
        yearsAgo: 0,
        tags: [],
        location: '',
        type: '',
        size: '',
        title: typeof exp === 'string' ? exp : 'ניסיון',
        startDate: '',
        endDate: '',
      };
    }

    const start = exp.startDate || exp.from || exp.start || exp.createdAt || '';
    const end = exp.endDate || exp.to || exp.end || '';
    const durationYears = computeYearDiff(start, end);
    const ago = computeYearsAgo(end);

    return {
      id: exp.id || exp.name || `exp-${index}`,
      title: exp.title || exp.position || exp.role || 'תפקיד',
      company: exp.company || exp.employer || exp.organization || 'חברה',
      industry: exp.companyField || exp.industry || exp.field || 'לא צוין',
      field: exp.field || exp.companyField || '',
      yearsOfExperience: durationYears,
      yearsAgo: ago,
      tags: Array.isArray(exp.tags) ? exp.tags : [],
      location: exp.location || exp.city || '',
      type: exp.type || exp.companyType || '',
      size: exp.size || exp.companySize || '',
      startDate: start,
      endDate: end || (exp.isCurrent ? 'Present' : ''),
      description: exp.description || exp.summary || '',
    };
  });
};

const IndustryExperienceModal: React.FC<IndustryExperienceModalProps> = ({
  onClose,
  experiences = [],
  candidateName,
  candidateSummary,
  candidateTitle,
}) => {
  const normalized = useMemo(() => normalizeExperiences(experiences), [experiences]);
  const totalYears = useMemo(
    () => normalized.reduce((acc, item) => acc + (item.yearsOfExperience || 0), 0),
    [normalized],
  );
  const uniqueCompanies = useMemo(
    () => [...new Set(normalized.map((item) => item.company).filter(Boolean))],
    [normalized],
  );

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-bg-card text-text-default rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 opacity-0 scale-95 animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-col gap-2 p-4 border-b border-border-default flex-shrink-0">
          <div className="flex justify-between items-start gap-3">
            <div>
              <p className="text-xs text-text-muted">ניסיון תעסוקתי מלא</p>
              <h2 className="text-2xl font-bold text-text-default">
                {candidateName || 'חוויית עבודה'}
              </h2>
              {candidateTitle && (
                <p className="text-sm text-text-muted">{candidateTitle}</p>
              )}
              <div className="text-sm text-text-muted mt-1 flex flex-wrap gap-3">
                <span>{normalized.length} תפקידים</span>
                <span>{totalYears} שנות ניסיון</span>
                <span>{uniqueCompanies.length} חברות</span>
              </div>
            </div>
          <button 
            onClick={onClose}
              className="p-2 rounded-full border border-border-subtle text-text-muted hover:text-text-default hover:border-border-default transition"
            aria-label="סגור חלון"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
          </div>
          {candidateSummary && (
            <p className="text-sm text-text-muted leading-relaxed border-l-4 border-primary-300 pl-3">
              {candidateSummary}
            </p>
          )}
        </header>
        <main className="flex-1 overflow-hidden">
          {normalized.length === 0 ? (
            <div className="flex items-center justify-center h-full text-text-muted">
              אין רשומות ניסיון להצגה.
            </div>
          ) : (
            <div className="h-full">
              <IndustryExperienceTable experiences={normalized} />
            </div>
          )}
        </main>
      </div>
      <style>{`
        @keyframes modal-in {
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
        .animate-modal-in {
            animation: modal-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default IndustryExperienceModal;