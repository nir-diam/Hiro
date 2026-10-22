import React from 'react';

export const CV_REVIEW_TAG = 'לבדוק קו"ח';

export function candidateNeedsCvReview(internalTags?: string[] | null): boolean {
  return Array.isArray(internalTags) && internalTags.includes(CV_REVIEW_TAG);
}

/** Shown on a candidate who stayed incomplete after one automatic re-parse. */
const CvReviewBadge: React.FC<{ internalTags?: string[] | null; className?: string }> = ({
  internalTags,
  className = '',
}) => {
  if (!candidateNeedsCvReview(internalTags)) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-950 shrink-0 ${className}`}
      title="הפרסור לא השלים שם, ניסיון, תגיות או פרטי קשר"
    >
      לבדוק קו&quot;ח
    </span>
  );
};

export default CvReviewBadge;
