import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { XMarkIcon, SparklesIcon, FlagIcon } from './Icons';
import AIFeedbackModal from './AIFeedbackModal';
import { fetchDeepInsight } from '../utils/candidateJobMatchingApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  jobId: string;
  jobTitle: string;
  candidateName?: string;
}

const JobMatchDeepInsightModal: React.FC<Props> = ({
  isOpen,
  onClose,
  candidateId,
  jobId,
  jobTitle,
  candidateName,
}) => {
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !candidateId || !jobId) return;
    setMarkdown(null);
    setError(null);
    setLoading(true);
    fetchDeepInsight(candidateId, jobId)
      .then((data) => setMarkdown(data.markdown || ''))
      .catch((e) => setError(e.message || 'שגיאה בייצור ניתוח AI'))
      .finally(() => setLoading(false));
  }, [isOpen, candidateId, jobId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-bg-card rounded-2xl shadow-2xl border border-border-default w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-default shrink-0">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-primary-500" />
              <div>
                <h2 className="font-bold text-text-default text-base">ניתוח עומק AI</h2>
                <p className="text-xs text-text-muted">
                  {candidateName ? `${candidateName} ← ` : ''}{jobTitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFeedbackOpen(true)}
                className="p-1.5 rounded-lg text-text-subtle hover:text-red-500 hover:bg-red-50 transition-colors"
                title="דווח על אי-דיוק"
              >
                <FlagIcon className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted transition-colors"
                aria-label="סגור"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <svg className="animate-spin h-8 w-8 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-text-muted text-sm">מנתח התאמה עם AI...</p>
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {markdown && !loading && (
              <div className="prose prose-sm max-w-none text-text-default leading-relaxed
                prose-headings:text-text-default prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
                prose-h3:text-base prose-h3:border-b prose-h3:border-border-subtle prose-h3:pb-1
                prose-ul:space-y-1 prose-li:marker:text-primary-500
                prose-strong:text-text-default
                prose-blockquote:border-primary-300 prose-blockquote:text-text-muted">
                <ReactMarkdown>{markdown}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border-subtle bg-bg-subtle/50 rounded-b-2xl shrink-0">
            <p className="text-xs text-text-subtle text-center">
              ניתוח זה הופק על ידי מודל AI ועשוי להכיל אי-דיוקים. הכרעה סופית נתונה לרכז הגיוס.
            </p>
          </div>
        </div>
      </div>
      <AIFeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        context={`Deep Insight: ${jobTitle}`}
      />
    </>
  );
};

export default JobMatchDeepInsightModal;
