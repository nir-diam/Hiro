/** Excel opens UTF-8 CSV correctly when file starts with BOM. */
export const CSV_UTF8_BOM = '\uFEFF';

export const CANDIDATES_EXPORT_FIELD_ORDER = [
    'id',
    'fullName',
    'phone',
    'email',
    'status',
    'title',
    'location',
    'source',
    'tags',
    'field',
    'age',
    'gender',
    'salaryMin',
    'salaryMax',
    'companySize',
    'sector',
    'jobScopes',
    'lastActivity',
    'updatedAt',
] as const;

export type CandidatesExportFieldKey = (typeof CANDIDATES_EXPORT_FIELD_ORDER)[number];

/** Maps list/detail `Candidate` UI shape to the loose row record consumed by `buildCandidatesExportCsv`. */
export function exportRowFromCandidate(c: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    status?: string;
    title?: string;
    location?: string;
    source?: string;
    tags?: unknown[];
    field?: string;
    age?: string;
    gender?: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    companySize?: string;
    sector?: string;
    jobScopes?: string[];
    lastActivity?: string;
    address?: string;
}): Record<string, unknown> {
    const last = c.lastActivity ?? '';
    return {
        id: c.id,
        fullName: c.name,
        phone: c.phone ?? '',
        email: c.email ?? '',
        status: c.status ?? '',
        title: c.title ?? '',
        location: c.location ?? '',
        source: c.source ?? '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        field: c.field ?? '',
        age: c.age ?? '',
        gender: c.gender ?? '',
        salaryMin: c.salaryMin,
        salaryMax: c.salaryMax,
        companySize: c.companySize ?? '',
        sector: c.sector ?? '',
        jobScopes: Array.isArray(c.jobScopes) ? c.jobScopes : [],
        lastActivity: last,
        updatedAt: last,
        address: c.address ?? '',
    };
}

export function csvEscapeCell(value: unknown): string {
    const s = value == null ? '' : String(value);
    if (/[\r\n",]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function tagLabel(t: unknown): string {
    if (typeof t === 'string') return t.trim();
    if (t && typeof t === 'object') {
        const o = t as Record<string, unknown>;
        return String(o.displayNameHe || o.displayNameEn || o.tagKey || o.name || '').trim();
    }
    return '';
}

function formatExportField(row: Record<string, unknown>, key: CandidatesExportFieldKey): string {
    switch (key) {
        case 'fullName':
            return String(row.fullName || row.name || '').trim();
        case 'location': {
            const parts = [row.location, row.address]
                .map((x) => String(x || '').trim())
                .filter(Boolean);
            return parts.join(' · ');
        }
        case 'tags': {
            const raw = row.tags;
            if (!Array.isArray(raw)) return '';
            return raw.map(tagLabel).filter(Boolean).join('; ');
        }
        case 'jobScopes': {
            const raw = row.jobScopes;
            if (!Array.isArray(raw)) return '';
            return raw.map((x) => String(x || '').trim()).filter(Boolean).join('; ');
        }
        case 'salaryMin':
        case 'salaryMax': {
            const v = row[key];
            if (v == null || v === '') return '';
            return String(v);
        }
        default: {
            const v = row[key];
            if (v == null) return '';
            return String(v).trim();
        }
    }
}

export function buildCandidatesExportCsv(
    rows: Record<string, unknown>[],
    headerLabels: Record<CandidatesExportFieldKey, string>,
): string {
    const headerLine = CANDIDATES_EXPORT_FIELD_ORDER.map((k) => csvEscapeCell(headerLabels[k] ?? k)).join(',');
    const lines = [headerLine];
    for (const row of rows) {
        const vals = CANDIDATES_EXPORT_FIELD_ORDER.map((k) => formatExportField(row, k));
        lines.push(vals.map(csvEscapeCell).join(','));
    }
    return lines.join('\r\n');
}

export function triggerCsvDownload(filename: string, csvContent: string): void {
    const blob = new Blob([CSV_UTF8_BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
