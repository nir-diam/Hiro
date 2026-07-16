
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, PlusIcon, SparklesIcon, GlobeAmericasIcon, 
    MapPinIcon, Squares2X2Icon, TableCellsIcon, 
    TrashIcon, XMarkIcon, LinkedInIcon, BriefcaseIcon,
    ChartBarIcon, BoltIcon, ShieldCheckIcon, Cog6ToothIcon, ChatBubbleBottomCenterTextIcon,
    BuildingOffice2Icon, ExclamationTriangleIcon, CheckCircleIcon, AdjustmentsHorizontalIcon, FunnelIcon,
    AvatarIcon, ArrowTopRightOnSquareIcon, UserGroupIcon, ArrowUpTrayIcon, ArrowDownTrayIcon,
    EnvelopeIcon, PhoneIcon,
} from './Icons';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from '@google/genai';
import HiroAIChat from './HiroAIChat';
import { HorizontalScrollArea } from './HorizontalScrollArea';
import { useScreenTablePreferences } from '../hooks/useScreenTablePreferences';
import {
    fetchPicklistValuesByKey,
    picklistRowLabel,
    SECTOR_PICKLIST_FALLBACK,
    SECTOR_PICKLIST_KEY,
    type PicklistValueRow,
} from '../services/picklistValuesApi';
import BusinessFieldHierarchyFields, { mainFieldsFromApi, mainFieldsToApi } from './BusinessFieldHierarchyFields';
import { FormMultiSelect } from './FormMultiSelect';
import { downloadRowsAsXlsx } from '../utils/exportRowsToXlsx';
import AuditHistoryRow from './AuditHistoryRow';
import { authHeaders } from '../utils/authHeaders';
import { resolveEntryTimestamp } from '../utils/auditHistoryFormat';
import { formatCompanyHistoryActionType, formatCompanyHistoryDescription, type CompanyHistoryEntryLike } from '../utils/companyHistoryText';

// --- Types ---
type BusinessModel = 'B2B' | 'B2C' | 'B2G' | 'משולב' | 'לא ידוע';
type ProductType = 'מוצר (Product)' | 'שירותים (Services)' | 'פלטפורמה' | 'פרויקטים' | 'לא ידוע';
type GrowthIndicator = 'Growing' | 'Stable' | 'Shrinking' | 'Unknown';
type DataConfidence = 'High' | 'Medium' | 'Low' | 'Pending Review';
type CompanyQualityMode = 'needs_review' | 'verified';

const qualityModeFromConfidence = (dc: DataConfidence): CompanyQualityMode =>
    dc === 'High' ? 'verified' : 'needs_review';

const confidenceFromQualityMode = (mode: CompanyQualityMode): DataConfidence =>
    mode === 'verified' ? 'High' : 'Pending Review';
type CorporateStructure = 'חברה עצמאית (ללא שיוך)' | 'חברת אם (Parent/Holding)' | 'חברת בת (Subsidiary)';

type CompanyId = string | number;

interface Company {
    id: CompanyId;
    // Identity
    name: string; // Hebrew / Common
    nameEn: string;
    legalName: string;
    aliases: string[]; 
    
    // Links
    website: string;
    logo?: string;
    linkedinUrl: string;
    email?: string;
    phone?: string;
    
    // Hard Facts
    foundedYear: string;
    location: string; // HQ City
    hqCountry: string;
    address?: string;  // Physical address
    activityStatus?: 'פעילה' | 'לא פעילה' | 'בפירוק' | 'לא ידוע';
    
    // Scale
    employeeCount: string;
    
    // Business Logic
    mainField: string; // תעשיית אם (parent picklist)
    mainField2: string[]; // שני תחומים ראשיים נוספים
    subField: string[];  // תעשייה ראשית / תת-תחום (child picklist)
    secondaryField: string; // תחום עיסוק משני (free text)
    businessModel: BusinessModel[];
    productType: ProductType[];
    type: string;      // Organization Type (High-tech, Industry...)
    classification: string; // Public/Private
    
    // Structure (New)
    structure: CorporateStructure;
    parentCompany?: string;
    subsidiaries?: string[];

    // Insights
    growthIndicator: GrowthIndicator;
    description: string;
    
    // Tags
    tags: string[];         // General tags
    techTags: string[];     // Technology stack specifically

    // Meta
    dataConfidence: DataConfidence;
    lastVerified: string;
    /** Candidates linked via candidate_organizations */
    candidateCount?: number;

    isSelected?: boolean;
}

// --- AI Tools Definitions ---
const addCompaniesTool: FunctionDeclaration = {
    name: 'addCompaniesToDatabase',
    description: 'Add one or more companies to the system database based on the conversation.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            companies: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Name of the company" },
                        description: { type: Type.STRING, description: "Short description if available" },
                        mainField: { type: Type.STRING, description: "Industry or Field" }
                    },
                    required: ['name']
                }
            }
        },
        required: ['companies']
    }
};

const BM: BusinessModel[] = ['B2B', 'B2C', 'B2G', 'משולב', 'לא ידוע'];
const PT: ProductType[] = ['מוצר (Product)', 'שירותים (Services)', 'פלטפורמה', 'פרויקטים', 'לא ידוע'];
const GI: GrowthIndicator[] = ['Growing', 'Stable', 'Shrinking', 'Unknown'];
const CS: CorporateStructure[] = ['חברה עצמאית (ללא שיוך)', 'חברת אם (Parent/Holding)', 'חברת בת (Subsidiary)'];
const DC: DataConfidence[] = ['High', 'Medium', 'Low', 'Pending Review'];

function normalizeBusinessModel(s: string): BusinessModel {
    if (BM.includes(s as BusinessModel)) return s as BusinessModel;
    const u = s.toLowerCase();
    if ((u.includes('b2b') && u.includes('b2c')) || u.includes('mixed') || u.includes('משולב') || u.includes('hybrid')) return 'משולב';
    if (u.includes('b2b')) return 'B2B';
    if (u.includes('b2c')) return 'B2C';
    if (u.includes('b2g')) return 'B2G';
    return 'לא ידוע';
}
function asBusinessModel(v: unknown): BusinessModel {
    return normalizeBusinessModel(String(v || ''));
}
function normalizeProductType(s: string): ProductType {
    if (PT.includes(s as ProductType)) return s as ProductType;
    const u = s.toLowerCase();
    if (u.includes('platform') || u.includes('פלטפורמ')) return 'פלטפורמה';
    if (u.includes('project') || u.includes('פרויקט')) return 'פרויקטים';
    if (u.includes('service') || u.includes('שירות')) return 'שירותים (Services)';
    if (u.includes('product') || u.includes('מוצר')) return 'מוצר (Product)';
    return 'לא ידוע';
}
function asProductType(v: unknown): ProductType {
    return normalizeProductType(String(v || ''));
}
function parseStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
    const s = String(v ?? '').trim();
    return s ? [s] : [];
}
function asBusinessModelArray(v: unknown): BusinessModel[] {
    const items = parseStringArray(v).map((x) => normalizeBusinessModel(x));
    return items.filter((x, i, arr) => arr.indexOf(x) === i);
}
function asProductTypeArray(v: unknown): ProductType[] {
    const items = parseStringArray(v).map((x) => normalizeProductType(x));
    return items.filter((x, i, arr) => arr.indexOf(x) === i);
}
function mergeStringArrayFromRaw(raw: unknown, existing: string[]): string[] {
    const fromRaw = parseStringArray(raw);
    return fromRaw.length ? fromRaw : existing;
}
function mergeEnumArrayFromRaw<T extends string>(
    raw: unknown,
    existing: T[],
    normalize: (v: unknown) => T,
): T[] {
    if (Array.isArray(raw) && raw.length) {
        return raw.map((x) => normalize(x)).filter((x, i, arr) => arr.indexOf(x) === i);
    }
    if (raw != null && String(raw).trim() !== '') {
        return [normalize(raw)];
    }
    return existing;
}
function asGrowthIndicator(v: unknown): GrowthIndicator {
    const s = String(v || '');
    return (GI.includes(s as GrowthIndicator) ? s : 'Unknown') as GrowthIndicator;
}
function normalizeCorporateStructure(s: string): CorporateStructure {
    if (CS.includes(s as CorporateStructure)) return s as CorporateStructure;
    const u = s.toLowerCase();
    if (u.includes('parent') || u.includes('holding') || u.includes('חברת אם')) return 'חברת אם (Parent/Holding)';
    if (u.includes('subsidiary') || u.includes('חברת בת')) return 'חברת בת (Subsidiary)';
    if (u.includes('independent') || u.includes('עצמאי') || u.includes('ללא שיוך')) return 'חברה עצמאית (ללא שיוך)';
    return 'חברה עצמאית (ללא שיוך)';
}
function asCorporateStructure(v: unknown): CorporateStructure {
    return normalizeCorporateStructure(String(v || ''));
}
function normalizeClassification(s: string): string {
    const VALID = ['פרטית', 'ציבורית (בורסאית)', 'ממשלתית', 'מלכ"ר'];
    if (VALID.includes(s)) return s;
    const u = s.toLowerCase();
    if (u.includes('ציבורי') || u.includes('public') || u.includes('בורסאי')) return 'ציבורית (בורסאית)';
    if (u.includes('ממשלת') || u.includes('government')) return 'ממשלתית';
    if (u.includes('מלכ') || u.includes('nonprofit') || u.includes('non-profit')) return 'מלכ"ר';
    if (u.includes('פרטי') || u.includes('private')) return 'פרטית';
    return s;
}
function asDataConfidence(v: unknown): DataConfidence {
    const s = String(v || '');
    return (DC.includes(s as DataConfidence) ? s : 'Medium') as DataConfidence;
}

const EMPLOYEE_COUNT_BUCKETS = ['1-10', '11-50', '51-200', '201-1000', '1000+', '10000+'] as const;

const EMPLOYEE_COUNT_LABELS: Record<string, string> = {
    '1-10': '1-10 (Seed)',
    '11-50': '11-50 (Startup)',
    '51-200': '51-200 (Growth)',
    '201-1000': '201-1000 (Scale)',
    '1000+': '1000+ (Enterprise)',
    '10000+': '10000+ (Mega Enterprise)',
};

const PDL_SIZE_TO_HIRO: Record<string, string> = {
    '201-500': '201-1000',
    '501-1000': '201-1000',
    '1001-5000': '1000+',
    '5001-10000': '10000+',
    '10001+': '10000+',
};

const PROMPT_EMPLOYEE_TO_BUCKET: Record<string, string> = {
    '(seed) 1-10': '1-10',
    '(startup) 11-50': '11-50',
    '(growth) 51-200': '51-200',
    '(scale) 201-1000': '201-1000',
    '(enterprise) +1000': '1000+',
    '(mega enterprise) +10000': '10000+',
};

/** Map enrich prompt / PDL / legacy values to Hiro `<select>` buckets. */
function coerceEmployeeCountBucket(value: unknown): string {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        const n = value;
        if (n <= 10) return '1-10';
        if (n <= 50) return '11-50';
        if (n <= 200) return '51-200';
        if (n <= 1000) return '201-1000';
        if (n <= 10000) return '1000+';
        return '10000+';
    }
    const rawKey = String(value).trim().toLowerCase().replace(/\s+/g, ' ');
    if (PROMPT_EMPLOYEE_TO_BUCKET[rawKey]) return PROMPT_EMPLOYEE_TO_BUCKET[rawKey];

    let s = String(value).trim().replace(/[\u2010-\u2015\u2212–—]/g, '-');
    s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    if (['unknown', 'n/a', 'estimate range', 'estimate', 'לא ידוע'].includes(lower)) return '';
    if ((EMPLOYEE_COUNT_BUCKETS as readonly string[]).includes(s)) return s;
    if (PDL_SIZE_TO_HIRO[s]) return PDL_SIZE_TO_HIRO[s];
    if (s === '+1000' || s === '1000+') return '1000+';
    if (s === '+10000' || s === '10000+') return '10000+';
    const embedded = s.match(/\b(1-10|11-50|51-200|201-1000)\b/i);
    if (embedded) return embedded[1];
    const plusHit = s.match(/\+\s*(1000|10000)\b/i) || s.match(/\b(1000|10000)\s*\+/i);
    if (plusHit) return plusHit[1] === '10000' ? '10000+' : '1000+';
    const n = parseInt(s.replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n >= 0 && /^\d/.test(s)) {
        if (n <= 10) return '1-10';
        if (n <= 50) return '11-50';
        if (n <= 200) return '51-200';
        if (n <= 1000) return '201-1000';
        if (n <= 10000) return '1000+';
        return '10000+';
    }
    return '';
}

/** Map row from organizationController.list (GET /api/organizations) → table Company */
function mapOrganizationApiToCompany(o: Record<string, unknown>): Company {
    const subsidiaries = o.subsidiaries;
    const tags = o.tags;
    const techTags = o.techTags;
    const aliases = o.aliases;
    return {
        id: String(o.id ?? ''),
        name: String(o.name ?? ''),
        nameEn: String(o.nameEn ?? ''),
        legalName: String(o.legalName ?? ''),
        aliases: Array.isArray(aliases) ? aliases.map(String) : [],
        website: String(o.website ?? ''),
        logo: typeof o.logo === 'string' && o.logo.trim() ? o.logo.trim() : undefined,
        linkedinUrl: String(o.linkedinUrl ?? ''),
        email: o.email != null && o.email !== '' ? String(o.email) : '',
        phone: o.phone != null && o.phone !== '' ? String(o.phone) : '',
        foundedYear: String(o.foundedYear ?? ''),
        location: String(o.location ?? ''),
        hqCountry: String(o.hqCountry ?? ''),
        employeeCount: coerceEmployeeCountBucket(o.employeeCount),
        mainField: String(o.mainField ?? ''),
        mainField2: Array.isArray(o.mainField2) ? (o.mainField2 as unknown[]).map(String) : [],
        subField: parseStringArray(o.subField),
        secondaryField: (() => {
            const sf = String(o.secondaryField ?? '');
            const subs = parseStringArray(o.subField);
            return sf && !subs.includes(sf) ? sf : '';
        })(),
        businessModel: asBusinessModelArray(o.businessModel),
        productType: asProductTypeArray(o.productType),
        type: String(o.type ?? ''),
        classification: normalizeClassification(String(o.classification ?? '')),
        structure: asCorporateStructure(o.structure),
        parentCompany: o.parentCompany != null && o.parentCompany !== '' ? String(o.parentCompany) : undefined,
        subsidiaries:
            Array.isArray(subsidiaries) && subsidiaries.length ? subsidiaries.map(String) : undefined,
        growthIndicator: asGrowthIndicator(o.growthIndicator),
        description: String(o.description ?? ''),
        tags: Array.isArray(tags) ? tags.map(String) : [],
        techTags: Array.isArray(techTags) ? techTags.map(String) : [],
        dataConfidence: asDataConfidence(o.dataConfidence),
        lastVerified: String(o.lastVerified ?? ''),
        activityStatus: (o.activityStatus as Company['activityStatus']) || 'לא ידוע',
        address: o.address != null && o.address !== '' ? String(o.address) : '',
        candidateCount: typeof o.candidateCount === 'number' && Number.isFinite(o.candidateCount)
            ? o.candidateCount
            : Number(o.candidateCount) || 0,
    };
}

function companyToOrganizationPayload(c: Company): Record<string, unknown> {
    return {
        name: c.name,
        nameEn: c.nameEn || null,
        legalName: c.legalName || null,
        aliases: c.aliases?.length ? c.aliases : [],
        description: c.description || null,
        mainField: c.mainField || null,
        mainField2: c.mainField2?.length ? c.mainField2 : [],
        subField: c.subField?.length ? c.subField : [],
        secondaryField: c.secondaryField || null,
        employeeCount: c.employeeCount || null,
        type: c.type || null,
        website: c.website || null,
        logo: c.logo || null,
        linkedinUrl: c.linkedinUrl || null,
        email: c.email || null,
        phone: c.phone || null,
        foundedYear: c.foundedYear || null,
        location: c.location || null,
        hqCountry: c.hqCountry || null,
        classification: c.classification || null,
        businessModel: c.businessModel?.length ? c.businessModel : [],
        productType: c.productType?.length ? c.productType : [],
        structure: c.structure || null,
        parentCompany: c.parentCompany || null,
        subsidiaries: c.subsidiaries?.length ? c.subsidiaries : [],
        growthIndicator: c.growthIndicator || null,
        dataConfidence: c.dataConfidence || null,
        lastVerified: c.lastVerified || null,
        tags: c.tags?.length ? c.tags : [],
        techTags: c.techTags?.length ? c.techTags : [],
        activityStatus: c.activityStatus || null,
        address: c.address || null,
    };
}

function organizationApiHeaders(jsonBody = false): Record<string, string> {
    const h: Record<string, string> = {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
    };
    if (jsonBody) h['Content-Type'] = 'application/json';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

/** Presign S3 upload for org logo; falls back to candidate upload-url when org route is not deployed yet. */
async function requestOrganizationLogoPresign(
    apiBase: string,
    file: File,
    organizationId?: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
    const payload = {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        organizationId,
    };
    let res = await fetch(`${apiBase}/api/organizations/logo/upload-url`, {
        method: 'POST',
        credentials: 'include',
        headers: organizationApiHeaders(true),
        body: JSON.stringify(payload),
    });
    if (res.status === 404) {
        const uploadSegment = organizationId || 'new';
        res = await fetch(
            `${apiBase}/api/candidates/${encodeURIComponent(uploadSegment)}/upload-url`,
            {
                method: 'POST',
                credentials: 'include',
                headers: organizationApiHeaders(true),
                body: JSON.stringify({
                    fileName: file.name,
                    contentType: file.type || 'application/octet-stream',
                    folder: 'organizations/logos',
                    sendWelcomeEmail: false,
                }),
            },
        );
    }
    if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
            const errJson = (await res.json()) as { message?: string };
            if (errJson?.message) msg = errJson.message;
        } catch {
            const t = await res.text().catch(() => '');
            if (t) msg = t;
        }
        throw new Error(msg);
    }
    return (await res.json()) as { uploadUrl: string; publicUrl: string };
}

/** Server organizations use UUID string ids */
function isPersistedOrganizationId(id: CompanyId): boolean {
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** Apply server `enrichmentMap` entry onto an existing org row (preview or merge). */
function mergeEnrichmentRawIntoCompany(c: Company, raw: Record<string, unknown>): Company {
    if (!raw || typeof raw !== 'object') return c;
    const nameFromApi = raw.name;
    return {
        ...c,
        name: typeof nameFromApi === 'string' && nameFromApi.trim() ? nameFromApi : c.name,
        nameEn: (typeof raw.nameEn === 'string' && raw.nameEn) || c.nameEn,
        legalName: (typeof raw.legalName === 'string' && raw.legalName) || c.legalName,
        aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : c.aliases,
        description: (typeof raw.description === 'string' && raw.description) || c.description,
        mainField: (typeof raw.mainField === 'string' && raw.mainField) || c.mainField,
        mainField2: Array.isArray(raw.mainField2) && raw.mainField2.length
            ? (raw.mainField2 as unknown[]).map(String)
            : c.mainField2,
        subField: mergeStringArrayFromRaw(raw.subField, c.subField),
        secondaryField: (() => {
            const rawSf = typeof raw.secondaryField === 'string' ? raw.secondaryField : '';
            const resolvedMain = (typeof raw.mainField === 'string' && raw.mainField) || c.mainField;
            const resolvedMf2: string[] = Array.isArray(raw.mainField2) && raw.mainField2.length
                ? (raw.mainField2 as unknown[]).map(String)
                : c.mainField2 ?? [];
            const resolvedSubs = mergeStringArrayFromRaw(raw.subField, c.subField);

            if (rawSf && !resolvedSubs.includes(rawSf)) return rawSf;

            const extras = resolvedMf2.filter((f) => f.trim() !== (resolvedMain || '').trim());
            if (extras.length > 0) return extras.join(', ');

            return c.secondaryField && !resolvedSubs.includes(c.secondaryField) ? c.secondaryField : '';
        })(),
        employeeCount: coerceEmployeeCountBucket(raw.employeeCount) || c.employeeCount,
        website: (typeof raw.website === 'string' && raw.website) ? raw.website : c.website,
        logo: (typeof raw.logo === 'string' && raw.logo.trim()) ? raw.logo.trim() : c.logo,
        linkedinUrl: (typeof raw.linkedinUrl === 'string' && raw.linkedinUrl) ? raw.linkedinUrl : c.linkedinUrl,
        email: (typeof raw.email === 'string' && raw.email && !String(c.email || '').trim()) ? raw.email : (c.email || ''),
        phone: (typeof raw.phone === 'string' && raw.phone && !String(c.phone || '').trim()) ? raw.phone : (c.phone || ''),
        foundedYear: (typeof raw.foundedYear === 'string' && raw.foundedYear) ? raw.foundedYear : c.foundedYear,
        location: (typeof raw.location === 'string' && raw.location) ? raw.location : c.location,
        hqCountry: (typeof raw.hqCountry === 'string' && raw.hqCountry) || c.hqCountry,
        type: (typeof raw.type === 'string' && raw.type) || c.type,
        classification: (typeof raw.classification === 'string' && raw.classification) ? normalizeClassification(raw.classification) : c.classification,
        businessModel: mergeEnumArrayFromRaw(raw.businessModel, c.businessModel, asBusinessModel),
        productType: mergeEnumArrayFromRaw(raw.productType, c.productType, asProductType),
        growthIndicator:
            raw.growthIndicator != null && String(raw.growthIndicator) !== ''
                ? asGrowthIndicator(raw.growthIndicator)
                : c.growthIndicator,
        structure:
            raw.structure != null && String(raw.structure) !== '' ? asCorporateStructure(raw.structure) : c.structure,
        parentCompany:
            raw.parentCompany != null && String(raw.parentCompany) !== '' ? String(raw.parentCompany) : c.parentCompany,
        subsidiaries: Array.isArray(raw.subsidiaries) && raw.subsidiaries.length
            ? (raw.subsidiaries as unknown[]).map(String)
            : c.subsidiaries,
        tags: Array.isArray(raw.tags) && raw.tags.length ? (raw.tags as unknown[]).map(String) : c.tags,
        techTags: Array.isArray(raw.techTags) && raw.techTags.length ? (raw.techTags as unknown[]).map(String) : c.techTags,
        dataConfidence: raw.dataConfidence != null && raw.dataConfidence !== '' ? asDataConfidence(raw.dataConfidence) : 'Pending Review',
        lastVerified: new Date().toISOString().split('T')[0],
        activityStatus: (typeof raw.activityStatus === 'string' && raw.activityStatus) ? raw.activityStatus as Company['activityStatus'] : c.activityStatus,
        address: (typeof raw.address === 'string' && raw.address) ? raw.address : c.address,
    };
}

function CompanyLogoMark({ company, size = 48 }: { company: Company; size?: number }) {
    const px = `${size}px`;
    const initial = (company.name || '?').charAt(0);
    if (company.logo) {
        return (
            <img
                src={company.logo}
                alt=""
                className="rounded object-contain bg-white border border-border-subtle flex-shrink-0"
                style={{ width: px, height: px }}
                referrerPolicy="no-referrer"
            />
        );
    }
    return (
        <div
            className="rounded-xl bg-primary-50 border border-border-default flex items-center justify-center text-primary-700 font-bold uppercase flex-shrink-0 shadow-sm"
            style={{ width: px, height: px, fontSize: Math.round(size * 0.38) }}
        >
            {initial}
        </div>
    );
}

// --- Column Definition ---
const allColumnsDef = [
    { id: 'logo', label: 'לוגו' },
    { id: 'name', label: 'שם החברה' },
    { id: 'mainField', label: 'תחום' },
    { id: 'structure', label: 'מבנה' }, 
    { id: 'businessModel', label: 'מודל עסקי' },
    { id: 'type', label: 'סוג' },
    { id: 'linkedinUrl', label: 'לינקדאין' },
    { id: 'foundedYear', label: 'שנת הקמה' },
    { id: 'employeeCount', label: 'גודל' },
    { id: 'location', label: 'מיקום' },
    { id: 'dataConfidence', label: 'אמינות' },
    { id: 'techTags', label: 'טכנולוגיות' },
    { id: 'candidateCount', label: 'משתמשים' },
    { id: 'lastVerified', label: 'עודכן' },
];

const defaultVisibleColumns = ['logo', 'name', 'structure', 'mainField', 'businessModel', 'linkedinUrl', 'foundedYear', 'employeeCount', 'dataConfidence', 'techTags', 'location'];

const COMPANY_TABLE_COLUMN_WIDTHS: Partial<Record<string, string>> = {
    logo: 'w-16',
    name: 'min-w-[200px] w-[200px]',
    mainField: 'min-w-[380px] w-[380px]',
};

const getCompanyTableColumnClass = (colId: string) => COMPANY_TABLE_COLUMN_WIDTHS[colId] || '';

const COMPANY_ALIASES_COLUMN_CLASS = 'min-w-[420px] w-[420px] max-w-[420px]';
const COMPANY_CHECKBOX_STICKY_CLASS =
    'sticky right-0 z-20 bg-bg-card border-l border-border-default shadow-[-2px_0_6px_-2px_rgba(0,0,0,0.08)]';
const COMPANY_CHECKBOX_HEADER_STICKY_CLASS = `${COMPANY_CHECKBOX_STICKY_CLASS} bg-bg-subtle z-30`;

const formatCompanyAliasesForExport = (company: Company) =>
    (company.aliases || []).map((alias) => String(alias).trim()).filter(Boolean).join(', ');

const CompanyAliasesPills: React.FC<{ company: Company }> = ({ company }) => {
    const items = (company.aliases || []).map((alias) => String(alias).trim()).filter(Boolean);
    if (!items.length) {
        return <span className="text-text-muted/40 text-xs italic">אין מילים נרדפות</span>;
    }

    return (
        <div
            className="w-full rounded-lg border border-border-subtle/70 bg-bg-subtle/25 p-2"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="grid grid-cols-2 gap-1.5 w-full">
                {items.map((phrase) => (
                    <span
                        key={phrase}
                        title="כינוי"
                        className="flex w-full min-w-0 items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border leading-tight bg-violet-50 text-violet-800 border-violet-200"
                    >
                        <span className="min-w-0 flex-1 break-words whitespace-normal">{phrase}</span>
                        <span className="shrink-0 text-[9px] opacity-70 font-semibold uppercase">כינוי</span>
                    </span>
                ))}
            </div>
        </div>
    );
};

// --- Company Users Tab Component ---
interface CompanyUser {
    id: string;
    name: string;
    role: string;
    yearsOfExperience: number;
    isCurrent: boolean;
    yearsSinceLeft: number | null;
}

type OrgLinkedCandidateRow = {
    id: string;
    fullName?: string;
    title?: string;
    roleAtOrg?: string | null;
    yearsInCompany?: number | null;
    isCurrent?: boolean;
    yearsSinceLeft?: number | null;
};

const mapOrgCandidateToUser = (row: OrgLinkedCandidateRow): CompanyUser => ({
    id: row.id,
    name: row.fullName || '—',
    role: row.roleAtOrg || row.title || '—',
    yearsOfExperience: row.yearsInCompany ?? 0,
    isCurrent: Boolean(row.isCurrent),
    yearsSinceLeft: row.yearsSinceLeft ?? null,
});

const CompanyUsersTab: React.FC<{ companyName: string; organizationId?: CompanyId | null }> = ({
    companyName,
    organizationId,
}) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const navigate = useNavigate();
    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [filters, setFilters] = useState({
        minYears: '',
        isCurrent: 'all', // 'all', 'yes', 'no'
        role: '',
        yearsSinceLeft: ''
    });

    const loadUsers = useCallback(async () => {
        if (!apiBase || !organizationId || !isPersistedOrganizationId(organizationId)) {
            setUsers([]);
            setFetchError(null);
            return;
        }
        setLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(
                `${apiBase}/api/organizations/${encodeURIComponent(String(organizationId))}/candidates`,
                { credentials: 'include', cache: 'no-store' },
            );
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(body || `HTTP ${res.status}`);
            }
            const data = await res.json();
            const rows = Array.isArray(data) ? data : [];
            setUsers(rows.map((row: OrgLinkedCandidateRow) => mapOrgCandidateToUser(row)));
        } catch (err: unknown) {
            console.error('[CompanyUsersTab] load candidates', err);
            setUsers([]);
            setFetchError(err instanceof Error ? err.message : 'טעינת מועמדים נכשלה');
        } finally {
            setLoading(false);
        }
    }, [apiBase, organizationId]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const filteredUsers = users.filter(user => {
        if (filters.minYears && user.yearsOfExperience < Number(filters.minYears)) return false;
        if (filters.isCurrent !== 'all') {
            const isCurrentBool = filters.isCurrent === 'yes';
            if (user.isCurrent !== isCurrentBool) return false;
        }
        if (filters.role && !user.role.toLowerCase().includes(filters.role.toLowerCase())) return false;
        if (filters.yearsSinceLeft && user.yearsSinceLeft !== null && user.yearsSinceLeft > Number(filters.yearsSinceLeft)) return false;
        return true;
    });

    const hasActiveFilters = filters.minYears || filters.isCurrent !== 'all' || filters.role || filters.yearsSinceLeft;

    const clearFilters = () => {
        setFilters({
            minYears: '',
            isCurrent: 'all',
            role: '',
            yearsSinceLeft: ''
        });
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-bg-subtle p-4 rounded-xl border border-border-default flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs font-semibold text-text-muted mb-1">תפקיד</label>
                    <input 
                        type="text" 
                        value={filters.role} 
                        onChange={e => setFilters(prev => ({ ...prev, role: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                        placeholder="חפש תפקיד..."
                    />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-semibold text-text-muted mb-1">מס׳ שנות ניסיון</label>
                    <input 
                        type="number" 
                        value={filters.minYears} 
                        onChange={e => setFilters(prev => ({ ...prev, minYears: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                        placeholder="לדוגמה: 2"
                    />
                </div>
                <div className="w-40">
                    <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס העסקה</label>
                    <select 
                        value={filters.isCurrent} 
                        onChange={e => setFilters(prev => ({ ...prev, isCurrent: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="all">הכל</option>
                        <option value="yes">עובד/ת נוכחי/ת</option>
                        <option value="no">עובד/ת עבר</option>
                    </select>
                </div>
                {filters.isCurrent !== 'yes' && (
                    <div className="w-40">
                        <label className="block text-xs font-semibold text-text-muted mb-1">עזב/ה לפני מס׳ שנים</label>
                        <input 
                            type="number" 
                            value={filters.yearsSinceLeft} 
                            onChange={e => setFilters(prev => ({ ...prev, yearsSinceLeft: e.target.value }))}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                            placeholder="לדוגמה: 3"
                        />
                    </div>
                )}
                {hasActiveFilters && (
                    <button 
                        onClick={clearFilters}
                        className="px-3 py-2 text-sm font-medium text-text-muted hover:text-text-default hover:bg-bg-hover rounded-lg transition-colors flex items-center gap-1"
                    >
                        <XMarkIcon className="w-4 h-4" />
                        נקה סינון
                    </button>
                )}
            </div>

            {fetchError && (
                <p className="text-sm text-red-600 font-medium">{fetchError}</p>
            )}

            <div className="border border-border-default rounded-xl overflow-hidden bg-bg-card">
                <table className="w-full text-right">
                    <thead className="bg-bg-subtle border-b border-border-default text-xs font-bold text-text-muted">
                        <tr>
                            <th className="p-4">שם מועמד/ת</th>
                            <th className="p-4">תפקיד ב-{companyName}</th>
                            <th className="p-4">שנות ניסיון בחברה</th>
                            <th className="p-4">סטטוס</th>
                            <th className="p-4 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-sm text-text-muted">
                                    טוען מועמדים...
                                </td>
                            </tr>
                        ) : filteredUsers.length > 0 ? filteredUsers.map(user => (
                            <tr
                                key={user.id}
                                className="hover:bg-bg-hover transition-colors group cursor-pointer"
                                onClick={() => navigate(`/candidates/${user.id}`)}
                            >
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <AvatarIcon initials={user.name.split(' ').map(n => n[0]).join('').substring(0, 2)} size={32} fontSize={12} />
                                        <span className="font-semibold text-text-default">{user.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-text-muted">{user.role}</td>
                                <td className="p-4 text-text-muted">{user.yearsOfExperience} שנים</td>
                                <td className="p-4">
                                    {user.isCurrent ? (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-600 text-white shadow-sm">
                                            נוכחי
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-600 text-white shadow-sm">
                                            עבר
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-left">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/candidates/${user.id}`);
                                        }}
                                        className="p-1.5 text-text-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        title="צפה בפרופיל"
                                    >
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center text-text-muted">
                                        <UserGroupIcon className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="text-sm font-medium">
                                            {!organizationId || !isPersistedOrganizationId(organizationId)
                                                ? 'שמור את החברה כדי לראות מועמדים מקושרים'
                                                : hasActiveFilters
                                                    ? 'לא נמצאו מועמדים התואמים לחיפוש'
                                                    : 'אין מועמדים מקושרים לחברה זו'}
                                        </p>
                                        {hasActiveFilters && (
                                            <button onClick={clearFilters} className="mt-2 text-xs text-primary-600 hover:underline">
                                                נקה את כל המסננים
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const CompanyCandidatesListModal: React.FC<{
    company: Company | null;
    onClose: () => void;
}> = ({ company, onClose }) => {
    if (!company) return null;
    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-border-default animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-text-default flex items-center gap-2">
                            <UserGroupIcon className="w-6 h-6 text-primary-500" />
                            מועמדים — {company.name}
                        </h2>
                        <p className="text-xs text-text-muted mt-1">
                            {company.candidateCount ?? 0} מועמדים מקושרים לחברה זו
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <CompanyUsersTab companyName={company.name} organizationId={company.id} />
            </div>
        </div>
    );
};

// --- Company Modal Component ---
const CompanyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (company: Company) => void | Promise<void>;
    company: Company | null;
    sectorOptions: PicklistValueRow[];
    /** When false, modal stays open after a successful save (e.g. multi-company enrich preview). */
    closeAfterSave?: boolean;
    enrichmentSession?: { current: number; total: number } | null;
}> = ({ isOpen, onClose, onSave, company, sectorOptions, closeAfterSave = true, enrichmentSession = null }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const logoFileInputRef = useRef<HTMLInputElement>(null);
    const [logoUploading, setLogoUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'users' | 'history'>('details');
    const [formData, setFormData] = useState<Company>({
        id: 0,
        name: '', nameEn: '', legalName: '', aliases: [],
        description: '',
        mainField: '', subField: [], secondaryField: '',
        mainField2: [],
        employeeCount: '',
        website: '', linkedinUrl: '', email: '', phone: '', logo: '',
        foundedYear: '', location: '', hqCountry: 'Israel',
        address: '', activityStatus: 'לא ידוע',
        type: 'הייטק', classification: 'פרטית',
        businessModel: [], productType: [],
        growthIndicator: 'Unknown',
        structure: 'חברה עצמאית (ללא שיוך)', parentCompany: '', subsidiaries: [],
        tags: [], techTags: [],
        dataConfidence: 'Pending Review', lastVerified: new Date().toISOString().split('T')[0]
    });
    
    const [tagsInput, setTagsInput] = useState('');
    const [techTagsInput, setTechTagsInput] = useState('');
    const [subsidiariesInput, setSubsidiariesInput] = useState('');
    const [aliasesInput, setAliasesInput] = useState('');
    const [historyEntries, setHistoryEntries] = useState<CompanyHistoryEntryLike[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !company?.id || !isPersistedOrganizationId(company.id)) {
            setHistoryEntries([]);
            setHistoryLoading(false);
            return;
        }
        const controller = new AbortController();
        let active = true;
        setHistoryLoading(true);

        (async () => {
            try {
                const res = await fetch(
                    `${apiBase}/api/organizations/${encodeURIComponent(String(company.id))}/history`,
                    { signal: controller.signal, headers: authHeaders() },
                );
                if (!res.ok) throw new Error('Failed to fetch history');
                const payload = await res.json();
                if (active) {
                    setHistoryEntries(Array.isArray(payload) ? payload : []);
                }
            } catch (err: unknown) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('[CompanyModal] failed to load history', err);
                }
                if (active) setHistoryEntries([]);
            } finally {
                if (active) setHistoryLoading(false);
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [isOpen, company?.id, apiBase]);

    useEffect(() => {
        if (isOpen) {
            setActiveTab('details');
            if (company) {
                setFormData({
                    ...company,
                    dataConfidence: confidenceFromQualityMode(qualityModeFromConfidence(company.dataConfidence)),
                });
                setTagsInput(company.tags.join(', '));
                setTechTagsInput(company.techTags.join(', '));
                setSubsidiariesInput(company.subsidiaries ? company.subsidiaries.join(', ') : '');
                setAliasesInput(company.aliases ? company.aliases.join(', ') : '');
            } else {
                setFormData({
                    id: '',
                    name: '', nameEn: '', legalName: '', aliases: [],
                    description: '',
                    mainField: '', subField: [], secondaryField: '',
        mainField2: [],
                    employeeCount: '',
                    website: '', linkedinUrl: '', email: '', phone: '', logo: '',
                    foundedYear: '', location: '', hqCountry: 'Israel',
                    address: '', activityStatus: 'לא ידוע',
                    type: 'הייטק', classification: 'פרטית',
                    businessModel: [], productType: [],
                    growthIndicator: 'Unknown',
                    structure: 'חברה עצמאית (ללא שיוך)', parentCompany: '', subsidiaries: [],
                    tags: [], techTags: [],
                    dataConfidence: 'Pending Review', lastVerified: new Date().toISOString().split('T')[0]
                });
                setTagsInput('');
                setTechTagsInput('');
                setSubsidiariesInput('');
                setAliasesInput('');
            }
        }
    }, [isOpen, company]);

    const sectorSelectRows = useMemo(() => {
        const v = (formData.type || '').trim();
        if (!v) return sectorOptions;
        if (sectorOptions.some((o) => o.value === v)) return sectorOptions;
        return [...sectorOptions, { id: `_legacy_${v}`, label: v, value: v, displayName: null }];
    }, [sectorOptions, formData.type]);

    const employeeCountSelectValues = useMemo(() => {
        const v = (formData.employeeCount || '').trim();
        const base = [...EMPLOYEE_COUNT_BUCKETS];
        if (v && !base.includes(v as (typeof EMPLOYEE_COUNT_BUCKETS)[number])) {
            base.push(v as (typeof EMPLOYEE_COUNT_BUCKETS)[number]);
        }
        return base;
    }, [formData.employeeCount]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert("יש לבחור קובץ תמונה (PNG, JPG, WebP וכו').");
            return;
        }
        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            alert('גודל הקובץ המקסימלי הוא 5MB.');
            return;
        }
        if (!apiBase) {
            alert('הגדר VITE_API_BASE כדי להעלות לוגו.');
            return;
        }
        setLogoUploading(true);
        try {
            const organizationId = isPersistedOrganizationId(formData.id) ? String(formData.id) : undefined;
            const { uploadUrl, publicUrl } = await requestOrganizationLogoPresign(
                apiBase,
                file,
                organizationId,
            );
            const putRes = await fetch(uploadUrl, { method: 'PUT', body: file });
            if (!putRes.ok) throw new Error('העלאה ל-S3 נכשלה');
            setFormData((prev) => ({ ...prev, logo: publicUrl }));
        } catch (err) {
            alert((err as Error).message || 'העלאת לוגו נכשלה');
        } finally {
            setLogoUploading(false);
        }
    };

    const saveCompanyForm = async () => {
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const techTags = techTagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const subsidiaries = subsidiariesInput.split(',').map(t => t.trim()).filter(Boolean);
        const aliases = aliasesInput.split(',').map(t => t.trim()).filter(Boolean);

        const qualityMode = qualityModeFromConfidence(formData.dataConfidence);
        const savedConfidence = confidenceFromQualityMode(qualityMode);
        const savedLastVerified =
            qualityMode === 'verified'
                ? new Date().toISOString().split('T')[0]
                : formData.lastVerified;

        await Promise.resolve(
            onSave({
                ...formData,
                tags,
                techTags,
                subsidiaries,
                aliases,
                dataConfidence: savedConfidence,
                lastVerified: savedLastVerified,
            })
        );
        if (closeAfterSave) onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await saveCompanyForm();
        } catch {
            /* handleSaveCompany already surfaced the error */
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden border border-border-default animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-black text-text-default">
                            {company ? 'עריכת פרופיל חברה' : 'הקמת חברה חדשה'}
                        </h2>
                        {enrichmentSession && enrichmentSession.total > 0 && (
                            <p className="text-xs text-text-muted font-semibold mt-0.5">
                                תצוגה מקדימה — העמקה (AI){' '}
                                <span className="text-primary-600">
                                    {enrichmentSession.current}/{enrichmentSession.total}
                                </span>
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                             <p className="text-xs text-text-muted">Intelligence & Data Enrichment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                {company && (
                    <div className="flex border-b border-border-default bg-bg-subtle/30 px-6 pt-2">
                        <button 
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'}`}
                            onClick={() => setActiveTab('details')}
                        >
                            פרטי חברה
                        </button>
                        <button 
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'users' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'}`}
                            onClick={() => setActiveTab('users')}
                        >
                            משתמשים
                        </button>
                        <button 
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'}`}
                            onClick={() => setActiveTab('history')}
                        >
                            היסטוריה
                        </button>
                    </div>
                )}
                
                {activeTab === 'details' && (
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
                     {/* Full form content here - Same as before */}
                     {/* Identity */}
                    <section>
                        <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <GlobeAmericasIcon className="w-4 h-4"/> זהות ופרטים ראשיים
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם החברה (עברית)</label>
                                <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 font-bold" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם באנגלית</label>
                                <input type="text" name="nameEn" value={formData.nameEn} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם משפטי מלא</label>
                                <input type="text" name="legalName" value={formData.legalName} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 text-text-muted" placeholder="Ltd / Inc..." dir="ltr" />
                            </div>
                            
                            <div className="md:col-span-3">
                                <label className="block text-xs font-semibold text-text-muted mb-1">שמות נוספים לזיהוי (מופרד בפסיק)</label>
                                <input type="text" value={aliasesInput} onChange={(e) => setAliasesInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="לדוגמה: ניסקו פרויקטים, קבוצת ניסקו..." />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">אתר אינטרנט</label>
                                <div className="relative">
                                    {formData.website ? (
                                        <a href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`} target="_blank" rel="noopener noreferrer" className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-700 transition-colors" title="פתח קישור">
                                            <GlobeAmericasIcon className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <GlobeAmericasIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    )}
                                    <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="https://..." dir="ltr" />
                                </div>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">עמוד לינקדאין</label>
                                <div className="relative">
                                    {formData.linkedinUrl ? (
                                        <a href={formData.linkedinUrl.startsWith('http') ? formData.linkedinUrl : `https://${formData.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-700 transition-colors" title="פתח קישור">
                                            <LinkedInIcon className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <LinkedInIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    )}
                                    <input type="url" name="linkedinUrl" value={formData.linkedinUrl} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="linkedin.com/company/..." dir="ltr" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">אימייל</label>
                                <div className="relative">
                                    {formData.email ? (
                                        <a href={`mailto:${formData.email}`} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-700 transition-colors" title="שלח אימייל">
                                            <EnvelopeIcon className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <EnvelopeIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    )}
                                    <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="info@company.co.il" dir="ltr" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">טלפון</label>
                                <div className="relative">
                                    {formData.phone ? (
                                        <a href={`tel:${formData.phone.replace(/\s/g, '')}`} className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-500 hover:text-primary-700 transition-colors" title="התקשר">
                                            <PhoneIcon className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <PhoneIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    )}
                                    <input type="tel" name="phone" value={formData.phone || ''} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="03-1234567" dir="ltr" />
                                </div>
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-xs font-semibold text-text-muted mb-1">לוגו</label>
                                <div className="flex flex-wrap items-center gap-2">
                                    {formData.logo ? (
                                        <img
                                            src={formData.logo}
                                            alt=""
                                            className="w-10 h-10 rounded object-contain bg-white border border-border-subtle flex-shrink-0"
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-bg-subtle border border-dashed border-border-default flex items-center justify-center text-[10px] text-text-muted flex-shrink-0">
                                            אין
                                        </div>
                                    )}
                                    <input
                                        type="url"
                                        name="logo"
                                        value={formData.logo || ''}
                                        onChange={handleChange}
                                        className="flex-1 min-w-[12rem] bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                        placeholder="https://... או העלה תמונה"
                                        dir="ltr"
                                    />
                                    <input
                                        ref={logoFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleLogoFileSelected}
                                    />
                                    <button
                                        type="button"
                                        disabled={logoUploading}
                                        onClick={() => logoFileInputRef.current?.click()}
                                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-border-default bg-bg-subtle text-text-default hover:bg-bg-hover disabled:opacity-50"
                                    >
                                        <ArrowUpTrayIcon className="w-4 h-4" />
                                        {logoUploading ? 'מעלה…' : 'העלה תמונה'}
                                    </button>
                                    {formData.logo ? (
                                        <button
                                            type="button"
                                            onClick={() => setFormData((prev) => ({ ...prev, logo: '' }))}
                                            className="px-3 py-2 text-sm font-semibold rounded-lg text-red-600 hover:bg-red-50"
                                        >
                                            הסר
                                        </button>
                                    ) : null}
                                </div>
                                <p className="text-[11px] text-text-muted mt-1">PNG, JPG, WebP, GIF או SVG — עד 5MB. לאחר העלאה ה-URL מתעדכן אוטומטית.</p>
                            </div>
                        </div>
                    </section>
                    
                    {/* Other sections preserved from your original code */}
                    <div className="w-full h-px bg-border-subtle"></div>

                     {/* SECTION 2: BUSINESS PROFILE */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BriefcaseIcon className="w-4 h-4"/> פרופיל עסקי
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                            <div className="md:col-span-4">
                                <BusinessFieldHierarchyFields
                                    apiBase={apiBase}
                                    values={{
                                        mainField: mainFieldsFromApi(formData.mainField, formData.mainField2),
                                        subField: formData.subField,
                                        secondaryField: formData.secondaryField,
                                    }}
                                    onChange={(next) => {
                                        const { mainField, mainField2 } = mainFieldsToApi(next.mainField);
                                        setFormData((prev) => ({
                                            ...prev,
                                            mainField,
                                            mainField2,
                                            subField: next.subField,
                                            secondaryField: next.secondaryField ?? '',
                                        }));
                                    }}
                                />
                            </div>
                            <div>
                                <FormMultiSelect
                                    label="מודל עסקי"
                                    options={BM.filter((v) => v !== 'לא ידוע').map((v) => ({ value: v, label: v }))}
                                    value={formData.businessModel}
                                    onChange={(businessModel) => setFormData((prev) => ({ ...prev, businessModel: businessModel as BusinessModel[] }))}
                                    placeholder="בחר מודל עסקי…"
                                />
                            </div>
                             <div>
                                <FormMultiSelect
                                    label="סוג מוצר"
                                    options={PT.filter((v) => v !== 'לא ידוע').map((v) => ({ value: v, label: v }))}
                                    value={formData.productType}
                                    onChange={(productType) => setFormData((prev) => ({ ...prev, productType: productType as ProductType[] }))}
                                    placeholder="בחר סוג מוצר…"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מגזר</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    {sectorSelectRows.map((row) => (
                                        <option key={row.id} value={row.value}>
                                            {picklistRowLabel(row)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סיווג משפטי</label>
                                <select name="classification" value={formData.classification} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="פרטית">פרטית</option>
                                    <option value="ציבורית (בורסאית)">ציבורית (בורסאית)</option>
                                    <option value="ממשלתית">ממשלתית</option>
                                    <option value='מלכ"ר'>מלכ"ר</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <div className="w-full h-px bg-border-subtle"></div>
                    
                    {/* SECTION 2.5: CORPORATE STRUCTURE (NEW) */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BuildingOffice2Icon className="w-4 h-4"/> מבנה ארגוני
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סוג מבנה</label>
                                <select name="structure" value={formData.structure} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="חברה עצמאית (ללא שיוך)">חברה עצמאית (ללא שיוך)</option>
                                    <option value="חברת אם (Parent/Holding)">חברת אם (Parent/Holding)</option>
                                    <option value="חברת בת (Subsidiary)">חברת בת (Subsidiary)</option>
                                </select>
                            </div>
                            
                            {formData.structure === 'חברת בת (Subsidiary)' && (
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שייכת ל (חברת האם)</label>
                                    <input type="text" name="parentCompany" value={formData.parentCompany} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="שם חברת האם..." />
                                </div>
                            )}

                             {formData.structure === 'חברת אם (Parent/Holding)' && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-text-muted mb-1">חברות בנות / מותגים (מופרד בפסיק)</label>
                                    <input type="text" value={subsidiariesInput} onChange={(e) => setSubsidiariesInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="לדוגמה: אלקטרה, אלקטרה מוצרי צריכה..." />
                                    <p className="text-[10px] text-text-muted mt-1">* עובדי החברות הבנות נכללים בספירת העובדים הכוללת.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="w-full h-px bg-border-subtle"></div>

                    {/* SECTION 3: SCALE & LOCATION */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ChartBarIcon className="w-4 h-4"/> סקייל וצמיחה
                        </h3>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">עובדים (כולל חברות בנות)</label>
                                <select name="employeeCount" value={formData.employeeCount} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="">—</option>
                                    {employeeCountSelectValues.map((bucket) => (
                                        <option key={bucket} value={bucket}>
                                            {EMPLOYEE_COUNT_LABELS[bucket] ?? bucket}
                                        </option>
                                    ))}
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מגמת צמיחה</label>
                                <select name="growthIndicator" value={formData.growthIndicator} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="Growing">צמיחה (Growing)</option>
                                    <option value="Stable">יציב (Stable)</option>
                                    <option value="Shrinking">הצטמצמות</option>
                                    <option value="Unknown">לא ידוע</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שנת הקמה</label>
                                <input type="text" name="foundedYear" value={formData.foundedYear} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="YYYY" />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מטה (עיר)</label>
                                <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="תל אביב" />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס פעילות</label>
                                <select name="activityStatus" value={formData.activityStatus || 'לא ידוע'} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="פעילה">פעילה</option>
                                    <option value="לא פעילה">לא פעילה</option>
                                    <option value="בפירוק">בפירוק</option>
                                    <option value="לא ידוע">לא ידוע</option>
                                </select>
                            </div>
                            <div className="md:col-span-4">
                                <label className="block text-xs font-semibold text-text-muted mb-1">כתובת פיזית</label>
                                <input type="text" name="address" value={formData.address || ''} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="רחוב, מספר, עיר, מיקוד" />
                            </div>
                         </div>
                    </section>

                     <div className="w-full h-px bg-border-subtle"></div>

                     {/* SECTION 4: TECH & TAGS */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BoltIcon className="w-4 h-4"/> טכנולוגיה ותיוג
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">Tech Stack (מופרד בפסיק - אנגלית)</label>
                                <input type="text" value={techTagsInput} onChange={(e) => setTechTagsInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="React, Python, AWS, Kubernetes..." dir="ltr"/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">תגיות כלליות (עברית)</label>
                                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="שיווק דיגיטלי, סייבר, מסחר..." />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">תיאור קצר</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} rows={2} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                            </div>
                        </div>
                    </section>
                </form>
                )}
                {activeTab === 'users' && (
                    <div className="flex-1 overflow-y-auto">
                    <CompanyUsersTab
                        companyName={formData.name}
                        organizationId={formData.id}
                    />
                    </div>
                )}
                {activeTab === 'history' && (
                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {historyLoading && (
                            <div className="p-4 text-center text-text-muted">טוען היסטוריה...</div>
                        )}
                        {!historyLoading && historyEntries.length === 0 && (
                            <div className="p-4 text-center text-text-muted">אין היסטוריית עדכונים</div>
                        )}
                        {!historyLoading && historyEntries.length > 0 && (
                            <>
                                <div className="hidden md:grid md:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_100px_minmax(0,2fr)] gap-4 px-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                                    <span>מתי</span>
                                    <span>מי</span>
                                    <span>פעולה</span>
                                    <span>תיאור השינוי</span>
                                </div>
                                {historyEntries.map((entry) => (
                                    <AuditHistoryRow
                                        key={entry.id}
                                        timestamp={resolveEntryTimestamp(entry as Record<string, unknown>)}
                                        actor={entry.actor}
                                        actorDisplayName={entry.actorDisplayName}
                                        userName={entry.userName}
                                        userEmail={entry.userEmail}
                                        actionLabel={formatCompanyHistoryActionType(entry)}
                                        description={formatCompanyHistoryDescription(entry)}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )}

                <footer className="p-4 border-t border-border-default bg-bg-subtle flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
                            <ShieldCheckIcon
                                className={`w-4 h-4 ${
                                    qualityModeFromConfidence(formData.dataConfidence) === 'verified'
                                        ? 'text-green-500'
                                        : 'text-amber-500'
                                }`}
                            />
                            <span>מצב איכות:</span>
                        </div>
                        <div className="flex bg-bg-subtle p-0.5 rounded-lg border border-border-default">
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        dataConfidence: confidenceFromQualityMode('needs_review'),
                                    }))
                                }
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                    qualityModeFromConfidence(formData.dataConfidence) === 'needs_review'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200 shadow-sm'
                                        : 'text-text-muted hover:text-text-default'
                                }`}
                            >
                                לביקורת
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        dataConfidence: confidenceFromQualityMode('verified'),
                                    }))
                                }
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                    qualityModeFromConfidence(formData.dataConfidence) === 'verified'
                                        ? 'bg-green-100 text-green-800 border border-green-200 shadow-sm'
                                        : 'text-text-muted hover:text-text-default'
                                }`}
                            >
                                מאומת
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-3">
                         <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">ביטול</button>
                        <button
                            type="button"
                            onClick={() => void saveCompanyForm().catch(() => {})}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all shadow-md"
                        >
                            {company ? 'שמור פרטים' : 'צור חברה'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

// ── Pagination bar shared between top and bottom ──────────────────────────
interface CompanyPaginationBarProps {
    currentPage: number;
    totalCount: number;
    pageSize: number;
    loading: boolean;
    onPageChange: (p: number) => void;
    position?: 'top' | 'bottom';
}
const CompanyPaginationBar: React.FC<CompanyPaginationBarProps> = ({
    currentPage, totalCount, pageSize, loading, onPageChange, position = 'bottom',
}) => {
    const totalPages = Math.ceil(totalCount / pageSize);
    const from = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
    const to = Math.min(currentPage * pageSize, totalCount);
    const isTop = position === 'top';
    return (
        <div className={`flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-2 ${isTop ? 'border-b' : 'border-t'} border-border-default bg-bg-card/80 backdrop-blur-sm`}>
            <span className="text-xs text-text-muted">
                {loading ? 'טוען…' : totalCount > 0 ? `${from}–${to} מתוך ${totalCount} חברות` : 'אין חברות'}
            </span>
            {totalPages > 1 && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                    <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => onPageChange(currentPage - 1)}
                        className="px-3 py-1 rounded-full border border-border-default text-xs bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-subtle"
                    >קודם</button>
                    <span className="text-text-default font-medium">{currentPage} / {totalPages}</span>
                    <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                        className="px-3 py-1 rounded-full border border-border-default text-xs bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-subtle"
                    >הבא</button>
                </div>
            )}
        </div>
    );
};


const AdminCompaniesView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [searchParams] = useSearchParams();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    
    // Filters State - Expanded for Advanced Search
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [activityFrom, setActivityFrom] = useState('');
    const [activityTo, setActivityTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 50;
    const [totalCount, setTotalCount] = useState(0);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [filters, setFilters] = useState({
        location: '',
        type: '',
        size: '',
        field: '',
        mainField: [] as string[],
        showPendingOnly: false,
        showMerged: false,
        // Advanced Fields
        name: '',
        nameEn: '',
        legalName: '',
        website: '',
        linkedin: '',
        subField: [] as string[],
        secondaryField: '',
        businessModel: [] as BusinessModel[],
        productType: [] as ProductType[],
        classification: '',
        structure: '',
        parent: '',
        founded: '',
        tags: '',
        tech: '',
    });

    const allColumnIds = useMemo(() => allColumnsDef.map((c) => c.id), []);
    const {
        viewMode,
        setViewMode,
        visibleColumns,
        setVisibleColumns,
        handleColumnToggle: toggleColumnPref,
        persistColumnsNow,
    } = useScreenTablePreferences('admin_global_companies', {
        defaultLayoutMode: 'list',
        defaultVisibleColumns,
        allColumnIds,
    });

    // Column Management State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    useEffect(() => {
        if (!isSettingsOpen) persistColumnsNow();
    }, [isSettingsOpen, persistColumnsNow]);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [candidatesListCompany, setCandidatesListCompany] = useState<Company | null>(null);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    /** Remaining orgs to review after `editingCompany` (enrich preview queue). */
    const [enrichmentPreviewQueue, setEnrichmentPreviewQueue] = useState<Company[]>([]);
    /** Total orgs in this enrich run (for 1/3 style header); 0 = not in enrich flow. */
    const [enrichmentSessionTotal, setEnrichmentSessionTotal] = useState(0);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<CompanyId>>(new Set());

    const loadOrganizations = useCallback(async (opts?: {
        includeMerged?: boolean;
        search?: string;
        page?: number;
        activityFrom?: string;
        activityTo?: string;
    }) => {
        if (!apiBase) {
            setCompanies([]);
            return;
        }
        setCompaniesLoading(true);
        try {
            const params = new URLSearchParams();
            const includeMerged = opts?.includeMerged ?? filters.showMerged;
            if (includeMerged) params.set('includeMerged', 'true');
            params.set('page', String(opts?.page ?? 1));
            params.set('limit', String(PAGE_SIZE));
            const search = opts?.search ?? debouncedSearchTerm;
            if (search) params.set('search', search);
            const from = opts?.activityFrom ?? activityFrom;
            const to = opts?.activityTo ?? activityTo;
            if (from) params.set('activityFrom', from);
            if (to) params.set('activityTo', to);
            const res = await fetch(`${apiBase}/api/organizations?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
                headers: organizationApiHeaders(false),
            });
            if (!res.ok) {
                const t = await res.text().catch(() => '');
                throw new Error(t || `HTTP ${res.status}`);
            }
            const data: unknown = await res.json();
            // Support both old array response and new { data, total } shape
            if (data && typeof data === 'object' && !Array.isArray(data) && 'data' in (data as object)) {
                const paged = data as { data: Record<string, unknown>[]; total: number };
                setCompanies(paged.data.map(mapOrganizationApiToCompany));
                setTotalCount(paged.total);
            } else {
                const list = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
                setCompanies(list.map(mapOrganizationApiToCompany));
                setTotalCount(list.length);
            }
        } catch (e) {
            console.error('[AdminCompaniesView] load organizations', e);
            setCompanies([]);
        } finally {
            setCompaniesLoading(false);
        }
    }, [apiBase, debouncedSearchTerm, activityFrom, activityTo, filters.showMerged]);

    const listQueryKey = useMemo(
        () => JSON.stringify({
            debouncedSearchTerm,
            activityFrom,
            activityTo,
            includeMerged: filters.showMerged,
            pageSize: PAGE_SIZE,
        }),
        [debouncedSearchTerm, activityFrom, activityTo, filters.showMerged],
    );
    const prevListQueryKeyRef = useRef(listQueryKey);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const urlSearch = (searchParams.get('search') || searchParams.get('q') || '').trim();
    useEffect(() => {
        if (!urlSearch) return;
        setSearchTerm(urlSearch);
        setDebouncedSearchTerm(urlSearch);
    }, [urlSearch]);

    useEffect(() => {
        const filtersChanged = prevListQueryKeyRef.current !== listQueryKey;
        prevListQueryKeyRef.current = listQueryKey;
        const pageToFetch = filtersChanged ? 1 : currentPage;
        if (filtersChanged && currentPage !== 1) {
            setCurrentPage(1);
        }
        void loadOrganizations({ page: pageToFetch });
    }, [listQueryKey, currentPage, loadOrganizations]);

    const [sectorPicklistRows, setSectorPicklistRows] = useState<PicklistValueRow[]>([]);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const rows = await fetchPicklistValuesByKey(apiBase, SECTOR_PICKLIST_KEY);
            if (!cancelled) setSectorPicklistRows(rows);
        })();
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    const sectorOptions = useMemo(
        () => (sectorPicklistRows.length > 0 ? sectorPicklistRows : SECTOR_PICKLIST_FALLBACK),
        [sectorPicklistRows],
    );
    
    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const filteredCompanies = useMemo(() => 
        companies.filter(c => {
            // Quick Filters
            const matchesLocation = !filters.location || c.location.includes(filters.location);
            const matchesType = !filters.type || c.type === filters.type;
            const matchesSize = !filters.size || c.employeeCount === filters.size;
            const mainFieldFilters = Array.isArray(filters.mainField)
                ? filters.mainField
                : filters.mainField
                  ? [String(filters.mainField)]
                  : filters.field
                    ? [String(filters.field)]
                    : [];
            const matchesField =
                !mainFieldFilters.length ||
                mainFieldFilters.some((f) => {
                    const companyMains = [c.mainField, ...(c.mainField2 || [])].filter(Boolean);
                    return companyMains.includes(f);
                });
            const matchesPending = !filters.showPendingOnly || c.dataConfidence === 'Pending Review';
            const matchesMerged = filters.showMerged || c.activityStatus !== 'merged';

            // Advanced Filters
            const matchesName = !filters.name || c.name.includes(filters.name);
            const matchesNameEn = !filters.nameEn || c.nameEn.toLowerCase().includes(filters.nameEn.toLowerCase());
            const matchesLegal = !filters.legalName || c.legalName.toLowerCase().includes(filters.legalName.toLowerCase());
            const matchesWeb = !filters.website || c.website.includes(filters.website);
            const matchesLinked = !filters.linkedin || c.linkedinUrl.includes(filters.linkedin);
            
            const matchesSub =
                !filters.subField.length ||
                filters.subField.some((f) => c.subField.includes(f));
            const matchesSecondary =
                !filters.secondaryField ||
                (c.secondaryField && c.secondaryField.includes(filters.secondaryField));
            const matchesBiz =
                !filters.businessModel.length ||
                filters.businessModel.some((f) => c.businessModel.includes(f));
            const matchesProd =
                !filters.productType.length ||
                filters.productType.some((f) => c.productType.includes(f));
            const matchesClass = !filters.classification || c.classification === filters.classification;
            
            const matchesStruct = !filters.structure || c.structure === filters.structure;
            const matchesParent = !filters.parent || (c.parentCompany && c.parentCompany.includes(filters.parent));
            const matchesFounded = !filters.founded || c.foundedYear.includes(filters.founded);
            
            const matchesTags = !filters.tags || c.tags.some(t => t.includes(filters.tags));
            const matchesTech = !filters.tech || c.techTags.some(t => t.toLowerCase().includes(filters.tech.toLowerCase()));

            return matchesLocation && matchesType && matchesSize && matchesField && matchesPending && matchesMerged &&
                   matchesName && matchesNameEn && matchesLegal && matchesWeb && matchesLinked &&
                   matchesSub && matchesSecondary && matchesBiz && matchesProd && matchesClass &&
                   matchesStruct && matchesParent && matchesFounded && matchesTags && matchesTech;
        }),
    [companies, filters]);

    // ... (Keep existing handler functions: Actions, Column Management, AI Enrichment, AI Chat - they are correct)

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    // --- Actions Handlers ---
    const handleEditCompany = (company: Company) => {
        setEnrichmentPreviewQueue([]);
        setEnrichmentSessionTotal(0);
        setEditingCompany(company);
        setIsModalOpen(true);
    };

    const handleCreateCompany = () => {
        setEnrichmentPreviewQueue([]);
        setEnrichmentSessionTotal(0);
        setEditingCompany(null);
        setIsModalOpen(true);
    };

    const handleSaveCompany = async (companyData: Company) => {
        if (!apiBase) {
            alert('הגדר VITE_API_BASE כדי לשמור ארגונים בשרת.');
            throw new Error('Missing VITE_API_BASE');
        }
        const body = companyToOrganizationPayload(companyData);
        const isEdit = Boolean(editingCompany && isPersistedOrganizationId(editingCompany.id));

        if (isEdit && editingCompany) {
            const res = await fetch(
                `${apiBase}/api/organizations/${encodeURIComponent(String(editingCompany.id))}`,
                {
                    method: 'PUT',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: organizationApiHeaders(true),
                    body: JSON.stringify(body),
                }
            );
            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                    const errJson = (await res.json()) as { message?: string };
                    if (errJson?.message) msg = errJson.message;
                } catch {
                    const t = await res.text().catch(() => '');
                    if (t) msg = t;
                }
                alert(msg);
                throw new Error(msg);
            }
        } else {
            const res = await fetch(`${apiBase}/api/organizations`, {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: organizationApiHeaders(true),
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                let msg = `HTTP ${res.status}`;
                try {
                    const errJson = (await res.json()) as { message?: string };
                    if (errJson?.message) msg = errJson.message;
                } catch {
                    const t = await res.text().catch(() => '');
                    if (t) msg = t;
                }
                alert(msg);
                throw new Error(msg);
            }
        }
        await loadOrganizations();
        setEnrichmentPreviewQueue((q) => {
            if (q.length === 0) return q;
            const [next, ...rest] = q;
            setEditingCompany(next);
            return rest;
        });
    };

    const handleDeleteCompany = async (id: CompanyId) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק חברה זו?')) return;

        if (!apiBase || !isPersistedOrganizationId(id)) {
            setCompanies((prev) => prev.filter((c) => c.id !== id));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            return;
        }

        try {
            const res = await fetch(`${apiBase}/api/organizations/${encodeURIComponent(String(id))}`, {
                method: 'DELETE',
                credentials: 'include',
                cache: 'no-store',
                headers: organizationApiHeaders(false),
            });
            if (!res.ok && res.status !== 204) {
                const t = await res.text().catch(() => '');
                throw new Error(t || res.statusText);
            }
            await loadOrganizations();
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : 'מחיקה נכשלה');
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`האם למחוק ${selectedIds.size} חברות שנבחרו?`)) return;

        if (!apiBase) {
            setCompanies((prev) => prev.filter((c) => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
            return;
        }

        const ids = [...selectedIds].filter(isPersistedOrganizationId);
        try {
            for (const id of ids) {
                const res = await fetch(`${apiBase}/api/organizations/${encodeURIComponent(String(id))}`, {
                    method: 'DELETE',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: organizationApiHeaders(false),
                });
                if (!res.ok && res.status !== 204) {
                    const t = await res.text().catch(() => '');
                    console.warn('[AdminCompaniesView] delete', id, t || res.status);
                }
            }
            await loadOrganizations();
            setSelectedIds(new Set());
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : 'מחיקה מרובה נכשלה');
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredCompanies.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelect = (id: CompanyId) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const handleClearFilters = () => {
        setFilters({
            location: '', type: '', size: '', field: '', mainField: [] as string[], showPendingOnly: false, showMerged: false,
            name: '', nameEn: '', legalName: '', website: '', linkedin: '',
            subField: [] as string[], secondaryField: '', businessModel: [] as BusinessModel[], productType: [] as ProductType[], classification: '',
            structure: '', parent: '', founded: '', tags: '', tech: ''
        });
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setActivityFrom('');
        setActivityTo('');
        setCurrentPage(1);
    };

    const handlePageChange = (newPage: number) => {
        setCurrentPage(newPage);
    };
    
    // --- Column Management Handlers ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleColumnToggle = (columnId: string) => {
        if (visibleColumns.includes(columnId) && visibleColumns.length <= 1) return;
        toggleColumnPref(columnId);
    };
    
    const handleDragStart = (index: number, colId: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };

    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };

    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };
    
    // --- AI Enrichment (Deep Dive) — server: POST /api/organizations/enrich (Gemini + SerpAPI/PDL) ---
    const handleBulkEnrich = async () => {
        if (selectedIds.size === 0) return;
        if (!apiBase) {
            alert('העשרה דורשת חיבור לשרת (VITE_API_BASE).');
            return;
        }
        const companyIds = [...selectedIds].filter(isPersistedOrganizationId);
        if (companyIds.length === 0) {
            alert('ניתן להעמיק רק בחברות שמורות בשרת. בחר שורות עם מזהה מערכת (UUID).');
            return;
        }
        setIsEnriching(true);

        try {
            const res = await fetch(`${apiBase}/api/organizations/enrich`, {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: organizationApiHeaders(true),
                body: JSON.stringify({ companyIds }),
            });
            const errText = await res.text().catch(() => '');
            if (!res.ok) {
                let msg = errText;
                try {
                    const j = JSON.parse(errText) as { message?: string };
                    if (j?.message) msg = j.message;
                } catch {
                    /* use raw */
                }
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = JSON.parse(errText) as { enrichmentMap?: Record<string, Record<string, unknown>> };
            const enrichmentMap = data?.enrichmentMap;
            if (!enrichmentMap || typeof enrichmentMap !== 'object') {
                throw new Error('תשובת שרת לא תקינה (חסר enrichmentMap)');
            }

            const merged: Company[] = [];
            for (const id of companyIds) {
                const row = companies.find((c) => String(c.id) === id);
                if (!row) continue;
                const raw = enrichmentMap[id];
                if (!raw || typeof raw !== 'object') continue;
                merged.push(mergeEnrichmentRawIntoCompany(row, raw));
            }
            if (merged.length === 0) {
                alert('לא הוחזרו נתוני העמקה לשורות שנבחרו. נסה שוב או בחר חברה אחרת.');
                return;
            }
            setEnrichmentSessionTotal(merged.length);
            setEnrichmentPreviewQueue(merged.slice(1));
            setEditingCompany(merged[0] ?? null);
            setIsModalOpen(true);
            setSelectedIds(new Set());
        } catch (error) {
            console.error('Enrichment failed:', error);
            alert(
                error instanceof Error
                    ? error.message
                    : 'אירעה שגיאה בתהליך ההעשרה. ייתכן והרשת אינה יציבה. אנא נסה שנית.'
            );
        } finally {
            setIsEnriching(false);
        }
    };

    // --- AI Chat Logic ---
    const handleOpenChat = () => {
        setIsChatOpen(true);
        if (!chatSession) {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             
             const systemInstruction = `You are a Company Research Assistant.
             Your goal is to help the user find information about companies, competitors, key contacts, and market trends.
             You have access to a tool 'addCompaniesToDatabase' to add companies.
             
             GUIDELINES:
             1. **Market Research**: Provide detailed analysis of companies, industries, and trends.
             2. **Competitor Analysis**: Identify direct and indirect competitors for a given company.
             3. **News & Updates**: Summarize recent news, acquisitions, or funding rounds.
             4. **Structure Analysis**: Always identify if a company is part of a larger group or holds subsidiaries.
             5. **Contact Finding**: Suggest relevant job titles or departments to contact for recruitment (do not invent personal emails unless public).
             6. **Language**: Always converse in Hebrew.
             
             Context: You are embedded in a "Global Company Database" for a recruitment system.`;
             
             const session = ai.chats.create({
                 model: 'gemini-3-flash-preview',
                 config: { 
                     systemInstruction,
                     tools: [{ functionDeclarations: [addCompaniesTool] }]
                 }
             });
             setChatSession(session);
             setChatMessages([{ role: 'model', text: 'היי, אני עוזר המחקר שלך. איך אני יכול לעזור לך עם מידע על חברות, מבנה ארגוני או מתחרים?' }]);
        }
    };
    
    const handleSendMessage = async (text: string) => {
        if (!text.trim() || !chatSession) return;
        setChatMessages(prev => [...prev, { role: 'user', text }]);
        setIsChatLoading(true);
        try {
            const result = await chatSession.sendMessage({ message: text });
            
            // Handle Function Calls
            if (result.functionCalls) {
                for (const call of result.functionCalls) {
                    if (call.name === 'addCompaniesToDatabase') {
                        const { companies: newCompaniesList } = call.args as any;
                        const addedCompanies: Company[] = newCompaniesList.map((c: any) => ({
                            id: '',
                            name: c.name,
                            nameEn: '',
                            legalName: '',
                            aliases: [],
                            description: c.description || 'Added by AI',
                            mainField: c.mainField || 'General',
                            mainField2: [],
                            subField: [],
                            secondaryField: '',
                            employeeCount: 'Unknown',
                            website: '',
                            linkedinUrl: '',
                            email: '',
                            phone: '',
                            foundedYear: '',
                            location: 'Unknown',
                            hqCountry: 'Israel',
                            type: 'Unknown',
                            classification: 'פרטית',
                            businessModel: [],
                            productType: [],
                            growthIndicator: 'Unknown',
                            structure: 'חברה עצמאית (ללא שיוך)',
                            tags: [],
                            techTags: [],
                            dataConfidence: 'Pending Review',
                            lastVerified: new Date().toISOString().split('T')[0],
                        }));

                        if (apiBase) {
                            for (const co of addedCompanies) {
                                try {
                                    const res = await fetch(`${apiBase}/api/organizations`, {
                                        method: 'POST',
                                        credentials: 'include',
                                        cache: 'no-store',
                                        headers: organizationApiHeaders(true),
                                        body: JSON.stringify(companyToOrganizationPayload(co)),
                                    });
                                    if (!res.ok) {
                                        const t = await res.text().catch(() => '');
                                        console.warn('[AdminCompaniesView] AI add POST', t || res.status);
                                    }
                                } catch (err) {
                                    console.warn('[AdminCompaniesView] AI add POST', err);
                                }
                            }
                            await loadOrganizations();
                        } else {
                            setCompanies((prev) => [...addedCompanies, ...prev]);
                        }
                        
                        const toolResponse = await chatSession.sendMessage({ 
                            message: `Successfully added ${addedCompanies.length} companies: ${addedCompanies.map(c => c.name).join(', ')}. Inform the user.` 
                        });
                        
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || `הוספתי ${addedCompanies.length} חברות למאגר בהצלחה.` }]);
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: result.text || '' }]);
            }
        } catch (e) {
            console.error(e);
            setChatMessages(prev => [...prev, { role: 'model', text: 'שגיאה בתקשורת.' }]);
        } finally {
            setIsChatLoading(false);
        }
    };
    
    const handleOpenCompanyCandidates = (company: Company, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isPersistedOrganizationId(company.id)) return;
        setCandidatesListCompany(company);
    };

    // ... (Keep renderCell function)
    const renderCell = (company: Company, columnId: string) => {
         // ... existing implementation
         switch (columnId) {
             case 'logo':
                 return <CompanyLogoMark company={company} size={48} />;
             case 'name':
                 return (
                     <>
                        <div className="font-bold text-text-default text-base">{company.name}</div>
                        <div className="text-xs text-text-muted truncate max-w-[200px]" title={company.description}>{company.description}</div>
                     </>
                 );
             case 'mainField':
                 return (
                     <div className="break-words leading-snug">
                        <div>{[company.mainField, ...(company.mainField2 || [])].filter(Boolean).join(' · ')}</div>
                        {company.subField.length > 0 && (
                            <span className="text-text-muted text-xs block mt-1">{company.subField.join(' · ')}</span>
                        )}
                        {company.secondaryField && (
                            <span className="text-text-subtle text-[10px] block mt-0.5">{company.secondaryField}</span>
                        )}
                     </div>
                 );
             case 'structure':
                 return (
                     <div className="flex flex-col gap-1">
                         {company.structure === 'חברת אם (Parent/Holding)' && (
                             <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold w-fit">
                                 <BuildingOffice2Icon className="w-3 h-3"/> חברת אם
                             </span>
                         )}
                         {company.structure === 'חברת בת (Subsidiary)' && (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium w-fit border border-blue-100">
                                 חברת בת
                             </span>
                         )}
                         {company.structure === 'חברה עצמאית (ללא שיוך)' && <span className="text-xs text-text-muted">עצמאית</span>}
                         
                         {company.subsidiaries && company.subsidiaries.length > 0 && (
                             <span className="text-[10px] text-text-subtle truncate max-w-[150px]" title={company.subsidiaries.join(', ')}>
                                 בנות: {company.subsidiaries.length}
                             </span>
                         )}
                     </div>
                 );
             case 'businessModel':
                  return company.businessModel.filter((m) => m !== 'לא ידוע').length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {company.businessModel.filter((m) => m !== 'לא ידוע').map((m) => (
                                <span
                                    key={m}
                                    className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                                        m === 'B2B' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                                    }`}
                                >
                                    {m}
                                </span>
                            ))}
                        </div>
                    ) : '-';
             case 'linkedinUrl':
                 return company.linkedinUrl ? (
                    <a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#0077b5] hover:text-[#005582]" onClick={e => e.stopPropagation()}>
                        <LinkedInIcon className="w-5 h-5 inline"/>
                    </a>
                ) : <span className="text-text-subtle text-xs">-</span>;
            case 'foundedYear': return <span className="text-text-muted font-mono">{company.foundedYear || '-'}</span>;
            case 'employeeCount': return <span className="font-mono text-text-default font-semibold">{company.employeeCount}</span>;
            case 'dataConfidence':
                if (company.dataConfidence === 'Pending Review') {
                    return (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">
                             <ExclamationTriangleIcon className="w-3 h-3" /> ממתין לסקירה
                        </span>
                    );
                }
                return (
                     <div className="flex items-center gap-1.5" title={`רמת אמינות: ${company.dataConfidence}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${company.dataConfidence === 'High' ? 'bg-green-500' : company.dataConfidence === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                        <span className="text-xs text-text-muted">{company.dataConfidence}</span>
                    </div>
                );
            case 'techTags':
                return (
                     <div className="flex flex-wrap gap-1" dir="ltr">
                        {company.techTags?.slice(0, 2).map((tag, i) => (
                            <span key={i} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                {tag}
                            </span>
                        ))}
                        {company.techTags?.length > 2 && <span className="text-[10px] text-text-muted font-medium">+{company.techTags.length - 2}</span>}
                    </div>
                );
            case 'location': 
                 return (
                    <div className="flex items-center gap-1 text-text-muted">
                         <MapPinIcon className="w-3.5 h-3.5"/> {company.location}
                    </div>
                 );
            case 'candidateCount': {
                const count = company.candidateCount ?? 0;
                const canOpen = isPersistedOrganizationId(company.id);
                return (
                    <button
                        type="button"
                        disabled={!canOpen}
                        onClick={(e) => handleOpenCompanyCandidates(company, e)}
                        className={`flex items-center gap-1.5 ${
                            canOpen
                                ? 'text-primary-600 hover:text-primary-700 hover:underline cursor-pointer'
                                : 'text-text-muted cursor-default'
                        }`}
                        title={
                            canOpen
                                ? 'לחץ לצפייה ברשימת המועמדים'
                                : 'שמור את החברה כדי לצפות במועמדים'
                        }
                    >
                        <UserGroupIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="font-semibold tabular-nums">{count}</span>
                    </button>
                );
            }
            case 'lastVerified': return <span className="text-xs text-text-muted">{company.lastVerified}</span>;
            default: return (company as any)[columnId];
         }
    };

    const getCompanyExportValue = (company: Company, columnId: string): string => {
        switch (columnId) {
            case 'logo':
                return '';
            case 'name':
                return company.name;
            case 'mainField':
                return [
                    [company.mainField, ...(company.mainField2 || [])].filter(Boolean).join(' · '),
                    company.subField.length ? company.subField.join(' · ') : '',
                    company.secondaryField || '',
                ].filter(Boolean).join(' | ');
            case 'structure':
                return company.structure;
            case 'businessModel':
                return company.businessModel.filter((m) => m !== 'לא ידוע').join(', ');
            case 'type':
                return company.type;
            case 'linkedinUrl':
                return company.linkedinUrl || '';
            case 'foundedYear':
                return company.foundedYear || '';
            case 'employeeCount':
                return company.employeeCount || '';
            case 'location':
                return company.location || '';
            case 'dataConfidence':
                return company.dataConfidence || '';
            case 'techTags':
                return (company.techTags || []).join(', ');
            case 'candidateCount':
                return String(company.candidateCount ?? 0);
            case 'lastVerified':
                return company.lastVerified || '';
            default:
                return String((company as unknown as Record<string, unknown>)[columnId] ?? '');
        }
    };

    const handleDownloadSelectedXlsx = () => {
        const selected = filteredCompanies.filter((c) => selectedIds.has(c.id));
        if (!selected.length) return;

        const exportColumnIds = visibleColumns.filter((id) => id !== 'logo');
        const columns = [
            ...exportColumnIds.map((id) => ({
                key: id,
                label: allColumnsDef.find((c) => c.id === id)?.label || id,
                getValue: (company: Company) => getCompanyExportValue(company, id),
            })),
            {
                key: 'aliases',
                label: 'מילים נרדפות',
                getValue: (company: Company) => formatCompanyAliasesForExport(company),
            },
        ];

        const stamp = new Date().toISOString().slice(0, 10);
        downloadRowsAsXlsx(selected, columns, `companies_${stamp}.xlsx`);
    };


    return (
        <div className="flex flex-col h-full bg-bg-default relative min-w-0">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            
            {/* 1. Header (Fixed at top) */}
            <div className="p-6 pb-0 flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                            <GlobeAmericasIcon className="w-8 h-8 text-primary-500"/>
                            מאגר חברות גלובאלי
                        </h1>
                      
                    </div>
                    <div className="flex gap-3">
                         <button 
                            onClick={() => setFilters(prev => ({ ...prev, showPendingOnly: !prev.showPendingOnly }))}
                            className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-xl transition shadow-sm border ${filters.showPendingOnly ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}
                        >
                            <ExclamationTriangleIcon className="w-5 h-5"/>
                            <span>ממתין לביקורת</span>
                        </button>
                        <button
                            onClick={() => {
                                setFilters(prev => ({ ...prev, showMerged: !prev.showMerged }));
                            }}
                            className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-xl transition shadow-sm border ${filters.showMerged ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}
                            title="הצג/הסתר חברות שמוזגו לחברה אחרת"
                        >
                            <ArrowTopRightOnSquareIcon className="w-5 h-5"/>
                            <span>כולל מוזגו</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void loadOrganizations({ page: currentPage })}
                            disabled={companiesLoading}
                            className="flex items-center gap-2 bg-white border border-border-default text-text-default font-bold py-2.5 px-4 rounded-xl hover:bg-bg-subtle transition shadow-sm disabled:opacity-50"
                            title="רענן מ־GET /api/organizations (organizationController.list)"
                        >
                            <span className="text-sm">{companiesLoading ? 'טוען…' : 'רענן מ־API'}</span>
                        </button>
                        <button 
                             onClick={handleOpenChat}
                             className="flex items-center gap-2 bg-white border border-border-default text-primary-700 font-bold py-2.5 px-4 rounded-xl hover:bg-primary-50 transition shadow-sm"
                         >
                             <ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>
                             <span>התייעץ עם AI</span>
                         </button>
                        <button 
                            onClick={handleCreateCompany}
                            className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-primary-700 transition shadow-md whitespace-nowrap"
                        >
                            <PlusIcon className="w-5 h-5"/>
                            <span>חברה חדשה</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Scrollable Content Area */}
            <div className="flex-1 overflow-auto min-w-0">
                <div className="p-6">
                    
                    {/* Filters Container */}
                    <div className="bg-bg-card border border-border-default rounded-2xl p-4 shadow-sm flex flex-col gap-4 mb-6">
                        {/* Pagination Top */}
                        <CompanyPaginationBar
                            currentPage={currentPage}
                            totalCount={totalCount}
                            pageSize={PAGE_SIZE}
                            loading={companiesLoading}
                            onPageChange={handlePageChange}
                            position="top"
                        />
                         <div className="flex flex-col md:flex-row gap-4">
                             {/* Search Bar */}
                             <div className="relative flex-grow">
                                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    placeholder="חפש לפי שם חברה, טכנולוגיות או מילות מפתח..." 
                                    value={searchTerm}
                                    onChange={(e) => { setSearchTerm(e.target.value); }}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-10 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                                />
                            </div>
                            
                            {/* Advanced Search Toggle */}
                            <button 
                                onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                                className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-xl transition border ${isAdvancedSearchOpen ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                            >
                                <AdjustmentsHorizontalIcon className="w-5 h-5" />
                                <span>חיפוש מתקדם</span>
                            </button>
                         </div>

                        {/* Standard Filters Row */}
                        {!isAdvancedSearchOpen && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex-1 min-w-[280px]">
                                    <BusinessFieldHierarchyFields
                                        apiBase={apiBase}
                                        compact
                                        showSecondary={false}
                                        values={{
                                            mainField: Array.isArray(filters.mainField)
                                                ? filters.mainField
                                                : filters.mainField
                                                  ? [filters.mainField]
                                                  : filters.field
                                                    ? [filters.field]
                                                    : [],
                                            subField: filters.subField,
                                        }}
                                        onChange={(next) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                mainField: next.mainField,
                                                field: next.mainField[0] || '',
                                                subField: next.subField,
                                            }))
                                        }
                                    />
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <input type="text" name="location" placeholder="מיקום" value={filters.location} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <select name="type" value={filters.type} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                                         <option value="">סוג חברה (הכל)</option>
                                         {sectorOptions.map((row) => (
                                             <option key={row.id} value={row.value}>
                                                 {picklistRowLabel(row)}
                                             </option>
                                         ))}
                                     </select>
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <select name="size" value={filters.size} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                                         <option value="">גודל (הכל)</option>
                                         <option value="1-10">1-10</option>
                                         <option value="11-50">11-50</option>
                                         <option value="51-200">51-200</option>
                                         <option value="201-1000">201-1000</option>
                                         <option value="1000+">1000+</option>
                                         <option value="10000+">10000+</option>
                                     </select>
                                </div>
                                <div className="flex gap-3 min-w-[280px]">
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] text-text-muted uppercase tracking-wider">מתאריך</label>
                                        <input
                                            type="date"
                                            value={activityFrom}
                                            onChange={(e) => setActivityFrom(e.target.value)}
                                            className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] text-text-muted uppercase tracking-wider">עד תאריך</label>
                                        <input
                                            type="date"
                                            value={activityTo}
                                            min={activityFrom || undefined}
                                            onChange={(e) => setActivityTo(e.target.value)}
                                            className="w-full bg-bg-input border border-border-default rounded-xl p-2 text-xs focus:border-primary-500 transition"
                                        />
                                    </div>
                                </div>
                                 <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default ml-auto">
                                    <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                                </div>
                            </div>
                        )}

                        {/* Advanced Filters Grid */}
                        {isAdvancedSearchOpen && (
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2 border-t border-border-default animate-fade-in">
                                {/* Identity */}
                                <input type="text" name="name" placeholder="שם חברה (עברית)" value={filters.name} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="nameEn" placeholder="שם באנגלית" value={filters.nameEn} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                <input type="text" name="legalName" placeholder="שם משפטי" value={filters.legalName} onChange={handleFilterChange} className="input-field" />
                                
                                {/* Digital */}
                                <input type="text" name="website" placeholder="אתר אינטרנט" value={filters.website} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                <input type="text" name="linkedin" placeholder="לינקדאין" value={filters.linkedin} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                
                                {/* Business — hierarchical picklists */}
                                <div className="md:col-span-2 lg:col-span-3">
                                    <BusinessFieldHierarchyFields
                                        apiBase={apiBase}
                                        values={{
                                            mainField: Array.isArray(filters.mainField)
                                                ? filters.mainField
                                                : filters.mainField
                                                  ? [filters.mainField]
                                                  : filters.field
                                                    ? [filters.field]
                                                    : [],
                                            subField: filters.subField,
                                            secondaryField: filters.secondaryField,
                                        }}
                                        onChange={(next) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                mainField: next.mainField,
                                                field: next.mainField[0] || '',
                                                subField: next.subField,
                                                secondaryField: next.secondaryField ?? '',
                                            }))
                                        }
                                    />
                                </div>
                                <FormMultiSelect
                                    compact
                                    options={BM.filter((v) => v !== 'לא ידוע').map((v) => ({ value: v, label: v }))}
                                    value={filters.businessModel}
                                    onChange={(businessModel) =>
                                        setFilters((prev) => ({ ...prev, businessModel: businessModel as BusinessModel[] }))
                                    }
                                    placeholder="מודל עסקי (הכל)"
                                />
                                <FormMultiSelect
                                    compact
                                    options={PT.filter((v) => v !== 'לא ידוע').map((v) => ({ value: v, label: v }))}
                                    value={filters.productType}
                                    onChange={(productType) =>
                                        setFilters((prev) => ({ ...prev, productType: productType as ProductType[] }))
                                    }
                                    placeholder="סוג מוצר (הכל)"
                                />

                                {/* Structure */}
                                <select name="classification" value={filters.classification} onChange={handleFilterChange} className="input-field">
                                    <option value="">סיווג משפטי (הכל)</option>
                                    <option value="פרטית">פרטית</option>
                                    <option value="ציבורית (בורסאית)">ציבורית</option>
                                    <option value="ממשלתית">ממשלתית</option>
                                </select>
                                <select name="structure" value={filters.structure} onChange={handleFilterChange} className="input-field">
                                    <option value="">מבנה ארגוני (הכל)</option>
                                    <option value="חברה עצמאית (ללא שיוך)">עצמאית</option>
                                    <option value="חברת אם (Parent/Holding)">חברת אם</option>
                                    <option value="חברת בת (Subsidiary)">חברת בת</option>
                                </select>
                                <input type="text" name="parent" placeholder="חברת אם" value={filters.parent} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="founded" placeholder="שנת הקמה" value={filters.founded} onChange={handleFilterChange} className="input-field" />
                                
                                {/* Tech & Tags */}
                                <input type="text" name="tags" placeholder="תגיות כלליות" value={filters.tags} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="tech" placeholder="Tech Stack" value={filters.tech} onChange={handleFilterChange} className="input-field" dir="ltr" />

                                <div className="col-span-full flex justify-end gap-2 mt-2">
                                     <button onClick={handleClearFilters} className="text-text-muted hover:text-red-500 font-bold text-sm px-4 py-2">נקה הכל</button>
                                     <button onClick={() => setIsAdvancedSearchOpen(false)} className="bg-bg-subtle text-text-default font-bold text-sm px-4 py-2 rounded-lg hover:bg-bg-hover">סגור</button>
                                </div>
                            </div>
                        )}
                        <style>{`.input-field { @apply w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none; }`}</style>
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedIds.size > 0 && (
                        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex items-center justify-between animate-fade-in flex-shrink-0 mb-4">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-primary-900 text-sm px-2">{selectedIds.size} נבחרו</span>
                                <div className="h-6 w-px bg-primary-200"></div>
                                <button 
                                    onClick={handleBulkEnrich} 
                                    disabled={isEnriching}
                                    className="flex items-center gap-2 bg-white text-primary-700 font-bold py-1.5 px-4 rounded-lg shadow-sm border border-primary-100 hover:bg-primary-50 transition disabled:opacity-50"
                                >
                                    {isEnriching ? (
                                        <span className="flex items-center gap-2">
                                            <SparklesIcon className="w-4 h-4 animate-spin text-purple-500" />
                                            מעשיר נתונים...
                                        </span>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4 text-purple-500" />
                                            <span>העשרה עמוקה (Deep Dive)</span>
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={handleBulkDelete}
                                    className="flex items-center gap-2 bg-white text-red-600 font-bold py-1.5 px-4 rounded-lg shadow-sm border border-red-100 hover:bg-red-50 transition"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    <span>מחק נבחרים</span>
                                </button>
                                <button
                                    onClick={handleDownloadSelectedXlsx}
                                    className="flex items-center gap-2 bg-white text-text-default font-bold py-1.5 px-4 rounded-lg shadow-sm border border-border-default hover:bg-bg-hover transition"
                                >
                                    <ArrowDownTrayIcon className="w-4 h-4" />
                                    <span>הורד XLSX</span>
                                </button>
                            </div>
                            <button onClick={() => setSelectedIds(new Set())} className="text-text-muted hover:text-primary-600 text-sm font-medium">ביטול בחירה</button>
                        </div>
                    )}

                    {/* Table View */}
                    {viewMode === 'table' ? (
                        <div className="bg-bg-card border border-border-default rounded-xl shadow-sm flex flex-col min-w-0">
                            <HorizontalScrollArea className="flex flex-col min-w-0" scrollClassName="overflow-x-auto w-full min-w-0 [scrollbar-width:thin]">
                            <table className="w-full min-w-[2400px] text-right text-sm" dir="rtl">
                                {/* Sticky Header */}
                                <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className={`p-4 w-12 text-center ${COMPANY_CHECKBOX_HEADER_STICKY_CLASS}`}>
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={filteredCompanies.length > 0 && selectedIds.size === filteredCompanies.length}
                                                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                            />
                                        </th>
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumnsDef.find(c => c.id === colId);
                                            if(!col) return null;
                                            return (
                                                <th 
                                                    key={col.id}
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover bg-bg-subtle ${draggingColumn === col.id ? 'dragging' : ''} ${getCompanyTableColumnClass(col.id)}`}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id)} 
                                                    onDragEnter={() => handleDragEnter(index)} 
                                                    onDragEnd={handleDragEnd} 
                                                    onDragOver={(e) => e.preventDefault()}
                                                >
                                                    {col.label}
                                                </th>
                                            )
                                        })}
                                        <th className="p-4 w-20 bg-bg-subtle">
                                            <div className="relative" ref={settingsRef}>
                                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                                {isSettingsOpen && (
                                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                        <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                                        {allColumnsDef.map(column => (
                                                            <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                                            <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                                            {column.label}
                                                            </label>
                                                        ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </th>
                                        <th className={`p-4 ${COMPANY_ALIASES_COLUMN_CLASS}`}>מילים נרדפות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {companiesLoading && companies.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={visibleColumns.length + 3}
                                                className="p-12 text-center text-text-muted text-sm"
                                            >
                                                טוען ארגונים מהשרת...
                                            </td>
                                        </tr>
                                    ) : null}
                                    {!companiesLoading &&
                                    companies.length === 0 &&
                                    filteredCompanies.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={visibleColumns.length + 3}
                                                className="p-12 text-center text-text-muted text-sm"
                                            >
                                                אין תוצאות
                                            </td>
                                        </tr>
                                    ) : null}
                                    {!companiesLoading &&
                                    companies.length > 0 &&
                                    filteredCompanies.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={visibleColumns.length + 3}
                                                className="p-12 text-center text-text-muted text-sm"
                                            >
                                                אין תוצאות התואמות לסינון / חיפוש.
                                            </td>
                                        </tr>
                                    ) : null}
                                    {filteredCompanies.map(company => (
                                        <tr 
                                            key={String(company.id)} 
                                            className={`hover:bg-bg-hover transition-colors group cursor-pointer ${selectedIds.has(company.id) ? 'bg-primary-50/50' : ''}`}
                                            onClick={() => handleEditCompany(company)}
                                        >
                                            <td
                                                className={`p-4 text-center ${COMPANY_CHECKBOX_STICKY_CLASS} ${
                                                    selectedIds.has(company.id) ? 'bg-primary-50/50' : ''
                                                } group-hover:bg-bg-hover`}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(company.id)}
                                                    onChange={() => handleSelect(company.id)}
                                                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                                />
                                            </td>
                                            {visibleColumns.map(colId => (
                                                <td key={colId} className={`p-4 align-top ${getCompanyTableColumnClass(colId)}`}>
                                                    {renderCell(company, colId)}
                                                </td>
                                            ))}

                                            <td className="p-4 text-center">
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-1">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id); }}
                                                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                                        title="מחק"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className={`p-4 align-top ${COMPANY_ALIASES_COLUMN_CLASS}`}>
                                                <CompanyAliasesPills company={company} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </HorizontalScrollArea>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredCompanies.map(company => (
                                <div 
                                    key={String(company.id)} 
                                    className={`bg-bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col relative cursor-pointer ${selectedIds.has(company.id) ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-border-default'}`}
                                    onClick={() => handleEditCompany(company)}
                                >
                                    <div className="absolute top-4 left-4 z-10" onClick={e => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(company.id)}
                                            onChange={() => handleSelect(company.id)}
                                            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                        />
                                    </div>
                                    
                                    <div className="flex items-start gap-4 mb-4">
                                        <CompanyLogoMark company={company} size={48} />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-lg text-text-default leading-tight truncate" title={company.name}>{company.name}</h3>
                                            <p className="text-xs text-text-muted mt-1 font-medium">
                                                {[company.mainField, ...(company.mainField2 || [])].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 mb-4 text-xs">
                                        {company.linkedinUrl && (
                                            <a href={company.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[#0077b5] hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                <LinkedInIcon className="w-3 h-3"/> לינקדאין
                                            </a>
                                        )}
                                        {company.website && (
                                            <a href={company.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-text-muted hover:text-primary-600 hover:underline">
                                                <GlobeAmericasIcon className="w-3 h-3"/> אתר
                                            </a>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {company.businessModel.filter((m) => m !== 'לא ידוע').map((m) => (
                                            <span key={m} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold">{m}</span>
                                        ))}
                                        {company.foundedYear && <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">הוקמה ב-{company.foundedYear}</span>}
                                        <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">{company.employeeCount} עובדים</span>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-border-subtle flex justify-between items-center text-xs text-text-subtle font-medium">
                                        <span className="flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5"/> {company.location}</span>
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id); }}
                                            className="hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination Footer — always visible, outside scroll area */}
            <CompanyPaginationBar
                currentPage={currentPage}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                loading={companiesLoading}
                onPageChange={handlePageChange}
                position="bottom"
            />

            <CompanyCandidatesListModal
                company={candidatesListCompany}
                onClose={() => setCandidatesListCompany(null)}
            />

            <CompanyModal 
                isOpen={isModalOpen}
                onClose={() => {
                    setEnrichmentPreviewQueue([]);
                    setEnrichmentSessionTotal(0);
                    setIsModalOpen(false);
                }}
                onSave={handleSaveCompany}
                company={editingCompany}
                sectorOptions={sectorOptions}
                closeAfterSave={enrichmentPreviewQueue.length === 0}
                enrichmentSession={
                    enrichmentSessionTotal > 0
                        ? {
                              current: enrichmentSessionTotal - enrichmentPreviewQueue.length,
                              total: enrichmentSessionTotal,
                          }
                        : null
                }
            />

            {/* AI Assistant Chat (Floating Button is in Header, Chat logic here) */}
             <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                isLoading={isChatLoading}
                error={null}
                onSendMessage={handleSendMessage}
                onReset={() => { setChatSession(null); setChatMessages([]); }}
            />
        </div>
    );
};

export default AdminCompaniesView;
