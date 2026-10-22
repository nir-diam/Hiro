export const SCREENING_CV_REFERRALS_UPDATED = 'hiro:screening-cv-referrals-updated';

export type ScreeningCvReferralsUpdatedDetail = {
    jobId?: string | null;
};

export function dispatchScreeningCvReferralsUpdated(detail?: ScreeningCvReferralsUpdatedDetail): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SCREENING_CV_REFERRALS_UPDATED, { detail: detail || {} }));
}
