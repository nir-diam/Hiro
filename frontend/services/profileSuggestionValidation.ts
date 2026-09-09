export type ValidatedSuggestionItem = {
    label: string;
    reason: string;
    validated: boolean;
    validationNote?: string;
    meta?: Record<string, unknown>;
};

export type JobRoleCatalogEntry = {
    category: string;
    categoryId: string;
    fieldType: string;
    clusterId: string;
    role: string;
    roleId: string;
    synonyms: string[];
};

export type ApprovedTagRecord = {
    id: string;
    tagKey?: string;
    displayNameHe?: string;
    displayNameEn?: string;
    synonyms?: string[];
    status?: string;
};

const normalizeLabel = (value: string) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[״"'`]/g, '');

export const flattenJobRoleCatalog = (categories: any[]): JobRoleCatalogEntry[] => {
    const rows: JobRoleCatalogEntry[] = [];
    for (const category of categories || []) {
        for (const fieldType of category?.fieldTypes || []) {
            for (const role of fieldType?.roles || []) {
                rows.push({
                    category: String(category?.name || '').trim(),
                    categoryId: String(category?.id || ''),
                    fieldType: String(fieldType?.name || '').trim(),
                    clusterId: String(fieldType?.id || ''),
                    role: String(role?.value || '').trim(),
                    roleId: String(role?.id || ''),
                    synonyms: Array.isArray(role?.synonyms) ? role.synonyms.map(String) : [],
                });
            }
        }
    }
    return rows.filter((row) => row.role);
};

export const buildApprovedTagIndex = (tags: ApprovedTagRecord[]) => {
    const byNormalized = new Map<string, ApprovedTagRecord>();
    for (const tag of tags || []) {
        const labels = [
            tag.displayNameHe,
            tag.displayNameEn,
            tag.tagKey,
            ...(Array.isArray(tag.synonyms) ? tag.synonyms : []),
        ].filter(Boolean) as string[];
        for (const label of labels) {
            byNormalized.set(normalizeLabel(label), tag);
        }
    }
    return byNormalized;
};

const scoreLabelMatch = (input: string, candidate: string) => {
    const a = normalizeLabel(input);
    const b = normalizeLabel(candidate);
    if (!a || !b) return 0;
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 80;
    return 0;
};

export const matchApprovedTag = (
    name: string,
    tagIndex: Map<string, ApprovedTagRecord>,
    allTags: ApprovedTagRecord[],
): { tag: ApprovedTagRecord; matchedLabel: string } | null => {
    const direct = tagIndex.get(normalizeLabel(name));
    if (direct) {
        return {
            tag: direct,
            matchedLabel: direct.displayNameHe || direct.displayNameEn || direct.tagKey || name,
        };
    }
    let best: { tag: ApprovedTagRecord; matchedLabel: string; score: number } | null = null;
    for (const tag of allTags) {
        const labels = [
            tag.displayNameHe,
            tag.displayNameEn,
            tag.tagKey,
            ...(Array.isArray(tag.synonyms) ? tag.synonyms : []),
        ].filter(Boolean) as string[];
        for (const label of labels) {
            const score = scoreLabelMatch(name, label);
            if (score >= 80 && (!best || score > best.score)) {
                best = { tag, matchedLabel: label, score };
            }
        }
    }
    return best ? { tag: best.tag, matchedLabel: best.matchedLabel } : null;
};

export const matchJobRole = (
    name: string,
    catalog: JobRoleCatalogEntry[],
): JobRoleCatalogEntry | null => {
    let best: { entry: JobRoleCatalogEntry; score: number } | null = null;
    for (const entry of catalog) {
        const labels = [entry.role, ...entry.synonyms];
        for (const label of labels) {
            const score = scoreLabelMatch(name, label);
            if (score >= 80 && (!best || score > best.score)) {
                best = { entry, score };
            }
        }
    }
    return best?.entry || null;
};

const extractItemReason = (item: any, fallback?: string) => {
    if (item && typeof item === 'object' && typeof item.reason === 'string' && item.reason.trim()) {
        return item.reason.trim();
    }
    return fallback || '';
};

const extractItemName = (item: any) => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') {
        return String(item.name || item.role || item.value || item.label || '').trim();
    }
    return '';
};

const ensureStringArray = (val: unknown): string[] => {
    if (!Array.isArray(val)) return [];
    return val
        .map((item) => {
            if (typeof item === 'string') return item.trim();
            if (item && typeof item === 'object') {
                return String((item as { name?: string; value?: string; label?: string }).name
                    || (item as { value?: string }).value
                    || (item as { label?: string }).label
                    || '').trim();
            }
            return '';
        })
        .filter(Boolean);
};

/** All tag-like label strings currently on the profile (tags, tagDetails, skills). */
export const collectAllProfileTagLabelStrings = (contextData: any): string[] => {
    const labels: string[] = [];
    const push = (value: unknown) => {
        const text = String(value || '').trim();
        if (text) labels.push(text);
    };

    for (const tag of contextData?.tags || []) {
        push(typeof tag === 'string' ? tag : (tag as { value?: string })?.value || tag);
    }
    for (const detail of contextData?.tagDetails || []) {
        push(detail?.displayNameHe);
        push(detail?.displayNameEn);
        push(detail?.tagKey);
    }
    for (const name of ensureStringArray(contextData?.softSkills)) push(name);
    for (const name of ensureStringArray(contextData?.skills?.soft)) push(name);
    for (const name of ensureStringArray(contextData?.techSkills)) push(name);
    for (const name of ensureStringArray(contextData?.skills?.technical)) push(name);

    return labels;
};

export const collectExistingProfileTags = (contextData: any) => {
    const labels = new Set<string>();
    for (const label of collectAllProfileTagLabelStrings(contextData)) {
        labels.add(normalizeLabel(label));
    }
    return labels;
};

export const buildExistingProfileTagIdentity = (
    contextData: any,
    tagIndex: Map<string, ApprovedTagRecord>,
    approvedTags: ApprovedTagRecord[],
) => {
    const normalizedLabels = new Set<string>();
    const tagIds = new Set<string>();
    const tagKeys = new Set<string>();

    for (const label of collectAllProfileTagLabelStrings(contextData)) {
        normalizedLabels.add(normalizeLabel(label));
        const match = matchApprovedTag(label, tagIndex, approvedTags);
        if (!match?.tag) continue;
        if (match.tag.id) tagIds.add(String(match.tag.id));
        if (match.tag.tagKey) tagKeys.add(normalizeLabel(match.tag.tagKey));
        normalizedLabels.add(normalizeLabel(match.matchedLabel));
        if (match.tag.displayNameHe) normalizedLabels.add(normalizeLabel(match.tag.displayNameHe));
        if (match.tag.displayNameEn) normalizedLabels.add(normalizeLabel(match.tag.displayNameEn));
    }

    return { normalizedLabels, tagIds, tagKeys };
};

const isApprovedTagAlreadyOnProfile = (
    match: { tag: ApprovedTagRecord; matchedLabel: string },
    existing: ReturnType<typeof buildExistingProfileTagIdentity>,
    rawName: string,
) => {
    if (existing.normalizedLabels.has(normalizeLabel(rawName))) return true;
    if (existing.normalizedLabels.has(normalizeLabel(match.matchedLabel))) return true;
    if (match.tag.id && existing.tagIds.has(String(match.tag.id))) return true;
    if (match.tag.tagKey && existing.tagKeys.has(normalizeLabel(match.tag.tagKey))) return true;
    return false;
};

export const collectExistingDesiredRoles = (contextData: any) => {
    const labels = new Set<string>();
    for (const role of contextData?.desiredRoles || []) {
        const value = typeof role === 'string' ? role : role?.value;
        if (value) labels.add(normalizeLabel(String(value)));
    }
    return labels;
};

export type WorkExperienceEntry = {
    id?: string | number;
    title?: string;
    company?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    [key: string]: unknown;
};

export const normalizeWorkExperienceIncoming = (value: unknown): WorkExperienceEntry[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value
            .map((item) => (item && typeof item === 'object' ? (item as WorkExperienceEntry) : null))
            .filter(Boolean) as WorkExperienceEntry[];
    }
    if (typeof value === 'object') return [value as WorkExperienceEntry];
    if (typeof value === 'string' && value.trim()) {
        return [{ title: '', company: '', description: value.trim(), startDate: '', endDate: '' }];
    }
    return [];
};

export const isDuplicateWorkExperience = (entry: WorkExperienceEntry, existing: WorkExperienceEntry[]) => {
    const company = normalizeLabel(String(entry.company || ''));
    const title = normalizeLabel(String(entry.title || ''));
    if (!company && !title) return false;
    return existing.some((row) => {
        const rowCompany = normalizeLabel(String(row.company || ''));
        const rowTitle = normalizeLabel(String(row.title || ''));
        if (company && rowCompany && company === rowCompany) {
            if (!title || !rowTitle || title === rowTitle) return true;
        }
        if (title && rowTitle && title === rowTitle && (!company || !rowCompany || company === rowCompany)) {
            return true;
        }
        return false;
    });
};

export const formatWorkExperienceDates = (start?: string, end?: string) => {
    const startText = String(start || '').trim();
    const endRaw = String(end || '').trim();
    const endText =
        !endRaw || /present|היום|כיום|ongoing|current/i.test(endRaw) ? 'היום' : endRaw;
    if (startText && endText) return `${startText} – ${endText}`;
    if (startText) return `מ-${startText}`;
    if (endText) return `עד ${endText}`;
    return '';
};

/** Human-readable block for suggestion popup / textarea editing */
export const formatWorkExperienceEntry = (entry: WorkExperienceEntry): string => {
    const title = String(entry.title || '').trim();
    const company = String(entry.company || '').trim();
    const dates = formatWorkExperienceDates(entry.startDate, entry.endDate);
    const description = String(entry.description || '').trim();
    const header = [title, company ? `@ ${company}` : ''].filter(Boolean).join(' ');
    const lines: string[] = [];
    if (header) lines.push(header);
    if (dates) lines.push(dates);
    if (description) lines.push(description);
    return lines.join('\n');
};

export const formatWorkExperienceSuggestionValue = (value: unknown): string => {
    const items = normalizeWorkExperienceIncoming(value);
    if (!items.length) return '';
    return items.map((item) => formatWorkExperienceEntry(item)).join('\n\n');
};

/** Parse friendly edited text back to a work experience entry */
export const parseWorkExperienceFriendlyText = (
    text: string,
    fallback?: WorkExperienceEntry,
): WorkExperienceEntry => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return fallback || { title: '', company: '', description: '', startDate: '', endDate: '' };
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...(fallback || {}), ...(parsed as WorkExperienceEntry) };
        }
        if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object') {
            return { ...(fallback || {}), ...(parsed[0] as WorkExperienceEntry) };
        }
    } catch {
        /* friendly text */
    }

    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    let title = String(fallback?.title || '').trim();
    let company = String(fallback?.company || '').trim();
    let startDate = String(fallback?.startDate || '').trim();
    let endDate = String(fallback?.endDate || '').trim();
    let description = String(fallback?.description || '').trim();

    const atMatch = first.match(/^(.+?)\s+@\s+(.+)$/);
    if (atMatch) {
        title = atMatch[1].trim();
        company = atMatch[2].trim();
    } else if (first) {
        title = first;
    }

    let descStartIdx = 1;
    if (lines[1] && (/^\d{4}/.test(lines[1]) || lines[1].includes('–') || lines[1].includes('-'))) {
        const period = lines[1].replace(/–/g, '-');
        const parts = period.split('-').map((p) => p.trim());
        if (parts[0]) startDate = parts[0];
        if (parts[1]) {
            endDate = /היום|present|כיום/i.test(parts[1]) ? 'Present' : parts[1];
        }
        descStartIdx = 2;
    }

    if (lines.length > descStartIdx) {
        description = lines.slice(descStartIdx).join('\n');
    }

    return {
        ...(fallback || {}),
        title,
        company,
        description,
        startDate,
        endDate,
    };
};

export const filterNewWorkExperienceSuggestions = (
    value: unknown,
    contextData: any,
): WorkExperienceEntry[] => {
    const existing = Array.isArray(contextData?.workExperience) ? contextData.workExperience : [];
    return normalizeWorkExperienceIncoming(value).filter((entry) => !isDuplicateWorkExperience(entry, existing));
};

export const enrichProfileSuggestions = (
    suggestions: any[],
    contextData: any,
    jobFields: any[],
    approvedTags: ApprovedTagRecord[],
) => {
    const roleCatalog = flattenJobRoleCatalog(jobFields);
    const tagIndex = buildApprovedTagIndex(approvedTags);
    const existingTagIdentity = buildExistingProfileTagIdentity(contextData, tagIndex, approvedTags);
    const existingRoles = collectExistingDesiredRoles(contextData);

    return suggestions
        .map((suggestion) => {
            if (!suggestion?.field) return suggestion;

            if (suggestion.field === 'tags') {
                const rawItems = Array.isArray(suggestion.value) ? suggestion.value : [suggestion.value];
                const validatedItems: ValidatedSuggestionItem[] = [];
                const rejectedItems: ValidatedSuggestionItem[] = [];
                const seenSuggestedTagIds = new Set<string>();

                for (const raw of rawItems) {
                    const name = extractItemName(raw);
                    if (!name) continue;
                    const reason = extractItemReason(raw, suggestion.reason);
                    const match = matchApprovedTag(name, tagIndex, approvedTags);
                    if (!match) {
                        rejectedItems.push({
                            label: name,
                            reason,
                            validated: false,
                            validationNote: 'לא נמצאה תגית מאושרת במערכת',
                        });
                        continue;
                    }
                    if (isApprovedTagAlreadyOnProfile(match, existingTagIdentity, name)) {
                        rejectedItems.push({
                            label: match.matchedLabel,
                            reason,
                            validated: false,
                            validationNote: 'כבר קיים בפרופיל',
                        });
                        continue;
                    }
                    const dedupeKey = match.tag.id
                        ? String(match.tag.id)
                        : normalizeLabel(match.tag.tagKey || match.matchedLabel);
                    if (seenSuggestedTagIds.has(dedupeKey)) continue;
                    seenSuggestedTagIds.add(dedupeKey);
                    validatedItems.push({
                        label: match.matchedLabel,
                        reason,
                        validated: true,
                        validationNote: `תגית מאושרת: ${match.matchedLabel}`,
                        meta: {
                            tagId: match.tag.id,
                            tagKey: match.tag.tagKey,
                            displayNameHe: match.tag.displayNameHe,
                            displayNameEn: match.tag.displayNameEn,
                        },
                    });
                }

                if (!validatedItems.length) return null;

                return {
                    ...suggestion,
                    value: validatedItems.map((item) => item.label),
                    validatedItems,
                    rejectedItems,
                    reason: suggestion.reason || 'תגיות חדשות מאושרות להוספה לפרופיל',
                };
            }

            if (suggestion.field === 'desiredRoles') {
                const rawItems = Array.isArray(suggestion.value) ? suggestion.value : [suggestion.value];
                const validatedItems: ValidatedSuggestionItem[] = [];
                const rejectedItems: ValidatedSuggestionItem[] = [];

                for (const raw of rawItems) {
                    const name = extractItemName(raw);
                    if (!name) continue;
                    const reason = extractItemReason(raw, suggestion.reason);
                    if (existingRoles.has(normalizeLabel(name))) {
                        rejectedItems.push({
                            label: name,
                            reason,
                            validated: false,
                            validationNote: 'כבר קיים בפרופיל',
                        });
                        continue;
                    }
                    const match = matchJobRole(name, roleCatalog);
                    if (!match) {
                        rejectedItems.push({
                            label: name,
                            reason,
                            validated: false,
                            validationNote: 'לא נמצא בתחומי משרה המנוהלים',
                        });
                        continue;
                    }
                    validatedItems.push({
                        label: match.role,
                        reason,
                        validated: true,
                        validationNote: `${match.category} › ${match.fieldType}`,
                        meta: {
                            value: match.role,
                            category: match.category,
                            fieldType: match.fieldType,
                            categoryId: match.categoryId,
                            clusterId: match.clusterId,
                            roleId: match.roleId,
                            owner: 'candidate',
                        },
                    });
                }

                if (!validatedItems.length) return null;

                return {
                    ...suggestion,
                    value: validatedItems.map((item) => ({
                        ...(item.meta || {}),
                        reason: item.reason,
                    })),
                    validatedItems,
                    rejectedItems,
                    reason: suggestion.reason || 'תפקידים מבוקשים מתוך תחומי המשרה המנוהלים',
                };
            }

            if (suggestion.field === 'workExperience') {
                const existing = Array.isArray(contextData?.workExperience) ? contextData.workExperience : [];
                const incoming = normalizeWorkExperienceIncoming(suggestion.value);
                if (!incoming.length) return null;

                if (suggestion.replaceExisting) {
                    return {
                        ...suggestion,
                        value: incoming,
                        reason: suggestion.reason || 'שכתוב ניסיון תעסוקתי לפי קורות החיים',
                    };
                }

                const merged: WorkExperienceEntry[] = [];
                const seenKeys = new Set<string>();

                for (const entry of incoming) {
                    const entryId = String(entry.id || '').trim();
                    if (entryId) {
                        const match = existing.find((row: any) => String(row?.id || '').trim() === entryId);
                        if (match) {
                            const key = `id:${entryId}`;
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                merged.push({ ...match, ...entry, id: match.id });
                            }
                            continue;
                        }
                    }

                    const dupIdx = existing.findIndex((row: any) => isDuplicateWorkExperience(entry, [row]));
                    if (dupIdx >= 0) {
                        const match = existing[dupIdx];
                        const key = `dup:${match.id || `${match.company}-${match.title}`}`;
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            merged.push({ ...match, ...entry, id: match.id || entry.id });
                        }
                        continue;
                    }

                    const newKey = `new:${entry.company}-${entry.title}-${entry.startDate}`;
                    if (!seenKeys.has(newKey)) {
                        seenKeys.add(newKey);
                        merged.push(entry);
                    }
                }

                if (!merged.length) return null;
                return {
                    ...suggestion,
                    value: merged.length === 1 ? merged[0] : merged,
                    reason: suggestion.reason || 'עדכון/הוספת ניסיון תעסוקתי לפרופיל',
                };
            }

            return suggestion;
        })
        .filter(Boolean);
};

const approvedTagsCatalogCache = new Map<string, Promise<ApprovedTagRecord[]>>();
const jobFieldsCatalogCache = new Map<string, Promise<any[]>>();

export async function fetchApprovedTagsCatalog(apiBase: string): Promise<ApprovedTagRecord[]> {
    const base = apiBase || '';
    const cacheKey = base || '_default';
    const cached = approvedTagsCatalogCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
        try {
            const tagsRes = await fetch(`${base}/api/tags?statuses=active&limit=2000&page=1`);
            if (!tagsRes.ok) return [];
            const tagsPayload = await tagsRes.json();
            return Array.isArray(tagsPayload?.data)
                ? tagsPayload.data
                : Array.isArray(tagsPayload)
                    ? tagsPayload
                    : [];
        } catch {
            return [];
        }
    })();
    approvedTagsCatalogCache.set(cacheKey, promise);
    return promise;
}

async function fetchJobFieldsCatalog(apiBase: string): Promise<any[]> {
    const base = apiBase || '';
    const cacheKey = base || '_default';
    const cached = jobFieldsCatalogCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
        try {
            const jobFieldsRes = await fetch(`${base}/api/job-fields`);
            if (!jobFieldsRes.ok) return [];
            const jobFields = await jobFieldsRes.json();
            return Array.isArray(jobFields) ? jobFields : [];
        } catch {
            return [];
        }
    })();
    jobFieldsCatalogCache.set(cacheKey, promise);
    return promise;
}

export async function fetchProfileValidationCatalogs(apiBase: string) {
    const [jobFields, approvedTags] = await Promise.all([
        fetchJobFieldsCatalog(apiBase),
        fetchApprovedTagsCatalog(apiBase),
    ]);

    return {
        jobFields,
        approvedTags,
    };
};

export const buildProfileSuggestionPrompt = (
    mode: 'default' | 'soft',
    jobFields: any[],
    approvedTags: ApprovedTagRecord[],
    contextData: any,
) => {
    const roleSamples = flattenJobRoleCatalog(jobFields)
        .slice(0, 120)
        .map((row) => `${row.category} › ${row.fieldType} › ${row.role}`)
        .join('\n');
    const tagSamples = approvedTags
        .slice(0, 200)
        .map((tag) => tag.displayNameHe || tag.displayNameEn || tag.tagKey)
        .filter(Boolean)
        .join(', ');
    const existingTags = collectAllProfileTagLabelStrings(contextData).slice(0, 80).join(', ');
    const existingRoles = [...collectExistingDesiredRoles(contextData)].slice(0, 40).join(', ');
    const existingWorkLines = (Array.isArray(contextData?.workExperience) ? contextData.workExperience : [])
        .slice(0, 12)
        .map((row: any) => {
            const title = String(row?.title || '').trim();
            const company = String(row?.company || '').trim();
            const id = String(row?.id || '').trim();
            const label = [title, company].filter(Boolean).join(' @ ');
            return id ? `${label} [id:${id}]` : label;
        })
        .filter(Boolean)
        .join('; ');
    const originalCvSnippet = String(contextData?.originalCvText || '').trim().slice(0, 4000);
    const generatedCvSnippet = String(contextData?.generatedCvText || contextData?.searchText || '').trim().slice(0, 4000);

    const sharedRules = `
חובה: החזר אך ורק JSON תקין (מערך), ללא Markdown.
לשדה tags – הצע רק תגיות חדשות (דלתא) שלא קיימות כבר בפרופיל, ובחר אך ורק מתוך תגיות מאושרות.
לשדה desiredRoles – הצע רק תפקידים חדשים (דלתא) שלא קיימים כבר בפרופיל, ובחר אך ורק מתוך תחומי המשרה המנוהלים.
לשדה workExperience – ניתן: (א) להוסיף משרות חדשות, (ב) לעדכן/לשכתב תיאור של משרה קיימת (העבר id מהפרופיל או אותה חברה+תפקיד), (ג) replaceExisting:true עם מערך מלא לשכתוב כל הניסיון. value: {title, company, description, startDate, endDate, id?} או מערך.
השתמש ב-originalCvText (קורות חיים מקוריים) וב-generatedCvText/searchText (קורות חיים מפורסים/מג'ונרטים) כמקור לעובדות.
לכל תגית/תפקיד/משרה בנפרד חובה reason קצר (עד 140 תווים) המסביר למה ההצעה רלוונטית.
מבנה tags:
{ "field": "tags", "value": [{ "name": "שם תגית מאושרת", "reason": "למה" }], "reason": "סיכום קצר" }
מבנה desiredRoles:
{ "field": "desiredRoles", "value": [{ "role": "שם תפקיד מתחומי משרה", "reason": "למה" }], "reason": "סיכום קצר" }
מבנה workExperience (משרה חדשה בלבד):
{ "field": "workExperience", "value": { "title": "...", "company": "...", "description": "...", "startDate": "2023", "endDate": "2024" }, "reason": "סיכום קצר" }
תגיות קיימות בפרופיל (אל תחזור עליהן): ${existingTags || 'אין'}
תפקידים מבוקשים קיימים (אל תחזור עליהם): ${existingRoles || 'אין'}
ניסיון תעסוקתי קיים (ניתן לעדכן/לשכתב): ${existingWorkLines || 'אין'}
קורות חיים מקוריים (קטע): ${originalCvSnippet || 'אין'}
קורות חיים מג'ונרטים/מפורסים (קטע): ${generatedCvSnippet || 'אין'}
תגיות מאושרות (דוגמאות): ${tagSamples || 'אין'}
תחומי משרה מנוהלים (דוגמאות):
${roleSamples || 'אין'}
`.trim();

    if (mode === 'soft') {
        return `נתח את ה-JSON של פרופיל המועמד והצע עד 8 שיפורים קצרים המתמקדים במיומנויות רכות, תקציר מקצועי וניסיון תעסוקתי.
${sharedRules}
מבנה כללי לשאר שדות:
{ "field": "professionalSummary|workExperience|softSkills|techSkills", "value": "string or array", "reason": "string" }`;
    }

    return `נתח את ה-JSON של פרופיל המועמד והצע עד 10 שיפורים קצרים בתחומים: תפקיד/כותרת, תקציר מקצועי, ניסיון תעסוקתי, העדפות/תחומי עניין, ציפיות שכר, מיומנויות רכות, מיומנויות טכניות, הערות מועמד, תגיות, תפקידים מבוקשים, מיקום, זמינות.
${sharedRules}
מבנה כללי לשאר שדות:
{ "field": "title|professionalSummary|workExperience|preferences|interests|salaryMin|salaryMax|softSkills|techSkills|candidateNotes|location|availability", "value": "string or array", "reason": "string (<=140 chars)" }`;
};
