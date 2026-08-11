import { buildCandidateFullName } from './candidateName';

export type ProfileCompletenessFieldId =
    | 'professionalSummary'
    | 'workExperience'
    | 'availability'
    | 'desiredRoles'
    | 'phone'
    | 'title'
    | 'profilePicture'
    | 'fullName'
    | 'email'
    | 'city';

export const PROFILE_COMPLETENESS_WEIGHTS: Record<ProfileCompletenessFieldId, number> = {
    professionalSummary: 15,
    workExperience: 15,
    availability: 10,
    desiredRoles: 15,
    phone: 10,
    title: 10,
    profilePicture: 10,
    fullName: 5,
    email: 5,
    city: 5,
};

export const PROFILE_COMPLETENESS_LABELS: Record<ProfileCompletenessFieldId, string> = {
    professionalSummary: 'תקציר מקצועי',
    workExperience: 'ניסיון תעסוקתי',
    availability: 'זמינות למשרה',
    desiredRoles: 'תפקידים מבוקשים (הוספת תפקיד)',
    phone: 'מספר טלפון',
    title: 'כותרת מקצועית',
    profilePicture: 'תמונת פרופיל',
    fullName: 'שם מלא',
    email: 'אימייל',
    city: 'עיר מגורים',
};

/** DOM id to scroll to when nudging the candidate to complete a field. */
export const PROFILE_COMPLETENESS_SCROLL_TARGET: Record<ProfileCompletenessFieldId, string> = {
    professionalSummary: 'profile-header-card',
    workExperience: 'work-experience',
    availability: 'job-availability',
    desiredRoles: 'profile-header-card',
    phone: 'personal-details',
    title: 'profile-header-card',
    profilePicture: 'profile-header-card',
    fullName: 'personal-details',
    email: 'personal-details',
    city: 'profile-header-card',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CandidateProfileCompletenessInput = {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    title?: string | null;
    professionalSummary?: string | null;
    phone?: string | null;
    email?: string | null;
    profilePicture?: string | null;
    cityDisplay?: string | null;
    availability?: string | null;
    desiredRoles?: unknown[] | null;
    workExperience?: unknown[] | null;
};

const FIELD_ORDER: ProfileCompletenessFieldId[] = [
    'professionalSummary',
    'workExperience',
    'availability',
    'desiredRoles',
    'phone',
    'title',
    'profilePicture',
    'fullName',
    'email',
    'city',
];

function hasText(value: unknown): boolean {
    return Boolean(String(value ?? '').trim());
}

function hasFullName(input: CandidateProfileCompletenessInput): boolean {
    if (hasText(input.firstName) && hasText(input.lastName)) return true;
    const built = buildCandidateFullName(input.firstName, input.lastName) || String(input.fullName || '').trim();
    return built.split(/\s+/).filter(Boolean).length >= 2;
}

function hasPhone(input: CandidateProfileCompletenessInput): boolean {
    const digits = String(input.phone || '').replace(/\D/g, '');
    return digits.length >= 9;
}

function hasEmail(input: CandidateProfileCompletenessInput): boolean {
    const e = String(input.email || '').trim();
    return Boolean(e && EMAIL_RE.test(e));
}

function hasWorkExperience(input: CandidateProfileCompletenessInput): boolean {
    const rows = Array.isArray(input.workExperience) ? input.workExperience : [];
    return rows.some((row) => {
        if (!row || typeof row !== 'object') return false;
        const r = row as Record<string, unknown>;
        return hasText(r.title) || hasText(r.company) || hasText(r.description);
    });
}

function hasDesiredRoles(input: CandidateProfileCompletenessInput): boolean {
    const rows = Array.isArray(input.desiredRoles) ? input.desiredRoles : [];
    return rows.some((row) => {
        if (typeof row === 'string') return hasText(row);
        if (row && typeof row === 'object') {
            const r = row as Record<string, unknown>;
            return hasText(r.value) || hasText(r.label) || hasText(r.name);
        }
        return false;
    });
}

function hasAvailability(input: CandidateProfileCompletenessInput): boolean {
    const raw = String(input.availability ?? '').trim();
    if (!raw) return false;
    if (/^[🟢🟡🟠🔴]/.test(raw)) return true;
    return raw !== 'גמיש' && raw !== 'ללא אילוצי שעות' && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(raw);
}

function isFieldComplete(id: ProfileCompletenessFieldId, input: CandidateProfileCompletenessInput): boolean {
    switch (id) {
        case 'professionalSummary':
            return hasText(input.professionalSummary);
        case 'workExperience':
            return hasWorkExperience(input);
        case 'availability':
            return hasAvailability(input);
        case 'desiredRoles':
            return hasDesiredRoles(input);
        case 'phone':
            return hasPhone(input);
        case 'title':
            return hasText(input.title);
        case 'profilePicture':
            return hasText(input.profilePicture);
        case 'fullName':
            return hasFullName(input);
        case 'email':
            return hasEmail(input);
        case 'city':
            return hasText(input.cityDisplay);
        default:
            return false;
    }
}

export type CandidateProfileCompletenessResult = {
    percent: number;
    missing: ProfileCompletenessFieldId[];
    completed: ProfileCompletenessFieldId[];
    firstMissing: ProfileCompletenessFieldId | null;
};

export function computeCandidateProfileCompleteness(
    input: CandidateProfileCompletenessInput,
): CandidateProfileCompletenessResult {
    let percent = 0;
    const missing: ProfileCompletenessFieldId[] = [];
    const completed: ProfileCompletenessFieldId[] = [];

    for (const id of FIELD_ORDER) {
        if (isFieldComplete(id, input)) {
            percent += PROFILE_COMPLETENESS_WEIGHTS[id];
            completed.push(id);
        } else {
            missing.push(id);
        }
    }

    missing.sort((a, b) => PROFILE_COMPLETENESS_WEIGHTS[b] - PROFILE_COMPLETENESS_WEIGHTS[a]);

    return {
        percent: Math.min(100, Math.round(percent)),
        missing,
        completed,
        firstMissing: missing[0] ?? null,
    };
}

export function scrollToProfileCompletenessTarget(fieldId: ProfileCompletenessFieldId): void {
    const targetId = PROFILE_COMPLETENESS_SCROLL_TARGET[fieldId];
    if (!targetId || typeof document === 'undefined') return;
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
