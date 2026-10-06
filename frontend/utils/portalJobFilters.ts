import type { LocationItem } from '../components/LocationSelector';
import type { SelectedJobField } from '../components/JobFieldSelector';

export type PortalJobDateSort = '' | 'newest' | 'oldest';

export type JobSearchFilterState = {
    locations: LocationItem[];
    jobFields: SelectedJobField[];
    jobScopes: string[];
    dateSort: PortalJobDateSort;
};

export const EMPTY_JOB_SEARCH_FILTERS: JobSearchFilterState = {
    locations: [],
    jobFields: [],
    jobScopes: [],
    dateSort: '',
};

export const PORTAL_JOB_SCOPE_OPTIONS = [
    'משרה מלאה',
    'משרה חלקית',
    'משמרות',
    'פרילנס',
    'היברידי',
] as const;

const SCOPE_ALIASES: Record<string, string[]> = {
    'משרה מלאה': ['משרה מלאה', 'מלאה'],
    'משרה חלקית': ['משרה חלקית', 'חלקית'],
    משמרות: ['משמרות', 'חלקית'],
    פרילנס: ['פרילנס'],
    היברידי: ['היברידי'],
};

export type PortalJobFilterRow = {
    id: string;
    title: string;
    company: string;
    location: string;
    region?: string;
    field?: string;
    role?: string;
    description?: string;
    jobTypes: string[];
    updatedAtTs?: number;
    matchScore?: number;
};

function normalizeText(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

export function jobFieldKey(field: SelectedJobField): string {
    return `${field.categoryId || field.category}::${field.roleId || field.role}`;
}

export function jobMatchesLocations(
    job: Pick<PortalJobFilterRow, 'location' | 'region'>,
    locations: LocationItem[],
): boolean {
    if (!locations.length) return true;
    const jobCity = normalizeText(job.location);
    const jobRegion = normalizeText(job.region);
    if (!jobCity && !jobRegion) return false;

    return locations.some((loc) => {
        const val = normalizeText(loc.value);
        if (!val) return false;
        if (loc.type === 'region') {
            return jobRegion === val || jobCity.includes(val) || val.includes(jobCity);
        }
        return jobCity === val || jobCity.includes(val) || val.includes(jobCity);
    });
}

export function jobMatchesFields(
    job: Pick<PortalJobFilterRow, 'title' | 'field' | 'role' | 'description'>,
    fields: SelectedJobField[],
): boolean {
    if (!fields.length) return true;
    const hay = [job.title, job.field, job.role, job.description]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (!hay) return false;

    return fields.some((field) => {
        const needles = [field.role, field.category, field.fieldType]
            .map((part) => String(part || '').trim().toLowerCase())
            .filter((part) => part.length >= 2);
        return needles.some((needle) => hay.includes(needle));
    });
}

export function jobMatchesScopes(jobTypes: string[], selectedScopes: string[]): boolean {
    if (!selectedScopes.length) return true;
    const normalizedJobTypes = jobTypes.map((type) => String(type || '').trim()).filter(Boolean);
    if (!normalizedJobTypes.length) return false;

    return selectedScopes.some((scope) => {
        const aliases = SCOPE_ALIASES[scope] || [scope];
        return normalizedJobTypes.some((jobType) =>
            aliases.some(
                (alias) =>
                    jobType === alias ||
                    jobType.includes(alias) ||
                    alias.includes(jobType),
            ),
        );
    });
}

export function parseJobTimestamp(value: unknown): number {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    const raw = String(value).trim();
    if (!raw) return 0;

    const isoMs = Date.parse(raw);
    if (Number.isFinite(isoMs) && !Number.isNaN(isoMs)) return isoMs;

    const hebrewMatch = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (hebrewMatch) {
        const day = Number(hebrewMatch[1]);
        const month = Number(hebrewMatch[2]);
        let year = Number(hebrewMatch[3]);
        if (year < 100) year += 2000;
        const ms = new Date(year, month - 1, day).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    return 0;
}

export function resolvePortalJobUpdatedAtMs(job: {
    jobUpdatedAtMs?: number;
    jobUpdatedAt?: string | null;
    jobOpenDate?: string | null;
    lastAnalyzed?: string | null;
}): number {
    if (typeof job.jobUpdatedAtMs === 'number' && Number.isFinite(job.jobUpdatedAtMs) && job.jobUpdatedAtMs > 0) {
        return job.jobUpdatedAtMs;
    }
    return (
        parseJobTimestamp(job.jobUpdatedAt) ||
        parseJobTimestamp(job.jobOpenDate) ||
        parseJobTimestamp(job.lastAnalyzed)
    );
}

export function filterAndSortPortalJobs<T extends PortalJobFilterRow>(
    jobs: T[],
    filters: JobSearchFilterState,
    searchTerm: string,
): T[] {
    const term = searchTerm.trim().toLowerCase();
    let result = jobs.filter((job) => {
        if (term) {
            const hay = [
                job.title,
                job.company,
                job.location,
                job.field,
                job.role,
                job.description,
            ]
                .map((part) => String(part || '').trim())
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!hay.includes(term)) return false;
        }
        if (!jobMatchesLocations(job, filters.locations)) return false;
        if (!jobMatchesFields(job, filters.jobFields)) return false;
        if (!jobMatchesScopes(job.jobTypes, filters.jobScopes)) return false;
        return true;
    });

    if (filters.dateSort === 'newest') {
        result = [...result].sort((a, b) => {
            const diff = (b.updatedAtTs ?? 0) - (a.updatedAtTs ?? 0);
            if (diff !== 0) return diff;
            return String(b.id).localeCompare(String(a.id));
        });
    } else if (filters.dateSort === 'oldest') {
        result = [...result].sort((a, b) => {
            const diff = (a.updatedAtTs ?? 0) - (b.updatedAtTs ?? 0);
            if (diff !== 0) return diff;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    return result;
}

export function dateSortLabel(sort: PortalJobDateSort): string {
    switch (sort) {
        case 'newest':
            return 'חדש ביותר';
        case 'oldest':
            return 'ישן ביותר';
        default:
            return 'תאריך';
    }
}

export function cycleDateSort(current: PortalJobDateSort): PortalJobDateSort {
    if (current === '') return 'newest';
    if (current === 'newest') return 'oldest';
    return '';
}
