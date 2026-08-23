import { candidateCityDisplay } from './citySearchApi';
import { computeAgeFromBirth } from './ageFromBirth';

export type ProfileDisplayCandidateSlice = {
    field?: string;
    title?: string;
    address?: string;
    location?: string;
    age?: string;
    phone?: string;
    birthYear?: string | number;
    birthMonth?: string | number;
    birthDay?: string | number;
};

/** Same rules as the amber «פרטים חסרים» banner in CandidateProfile. */
export function buildMissingProfileFieldLabels(
    data: ProfileDisplayCandidateSlice,
    displayAge: string,
): string[] {
    const labels: string[] = [];
    const field = String(data.field ?? '').trim();
    const title = String(data.title ?? '').trim();
    if (!field && !title) labels.push('תחום משרה');
    else {
        if (!field) labels.push('תחום משרה');
        if (!title) labels.push('כותרת משרה');
    }
    if (!candidateCityDisplay(data)) labels.push('כתובת');
    if (!String(displayAge ?? '').trim() && !String(data.age ?? '').trim()) labels.push('גיל');
    if (!String(data.phone ?? '').trim()) labels.push('טלפון');
    return labels;
}

export function resolveProfileDisplayAge(data: ProfileDisplayCandidateSlice): string {
    const age = String(data.age ?? '').trim();
    if (age) return age;
    return computeAgeFromBirth(data.birthYear, data.birthMonth, data.birthDay);
}
