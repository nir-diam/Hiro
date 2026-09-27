const profileRowId = (profile: Record<string, unknown> | null | undefined): string =>
    String(profile?.backendId || profile?.id || '').trim();

const profileCanonicalId = (profile: Record<string, unknown> | null | undefined): string =>
    String(profile?.canonicalCandidateId || '').trim();

/** Staff-created duplicate copies (צור העתק) — hidden from candidate portal profile switcher only. */
export const isStaffDuplicateProfile = (profile: Record<string, unknown> | null | undefined): boolean => {
    if (!profile) return false;
    const id = profileRowId(profile);
    const canonicalId = profileCanonicalId(profile);
    // Must be a linked row pointing at a different primary — not the live row itself.
    if (!id || !canonicalId || canonicalId === id) return false;
    return profile.staffProfileCopy === true;
};

export const mergeCandidateProfileIdentity = (
    candidateData: Record<string, unknown> | null | undefined,
    activeProfile?: Record<string, unknown> | null,
    currentProfileId?: string | number | null,
): Record<string, unknown> => ({
    ...(candidateData || {}),
    backendId:
        String(currentProfileId || candidateData?.backendId || candidateData?.id || '').trim() ||
        undefined,
    canonicalCandidateId:
        candidateData?.canonicalCandidateId ?? activeProfile?.canonicalCandidateId ?? null,
    staffProfileCopy: candidateData?.staffProfileCopy ?? activeProfile?.staffProfileCopy ?? false,
    profileName:
        activeProfile?.profileName ??
        candidateData?.profileName ??
        candidateData?.fullName ??
        candidateData?.title,
    fullName: candidateData?.fullName,
    title: candidateData?.title,
});

/** Remove internal staff-copy suffix from profile display names. */
export const stripDuplicateProfileNameSuffix = (name: string): string =>
    String(name || '')
        .trim()
        .replace(/_duplicate\d*$/i, '')
        .trim();

/** Linked profile version row (shadow / portal) — not the primary candidate row. */
export const isLinkedCandidateProfileVersion = (
    profile: Record<string, unknown> | null | undefined,
): boolean => {
    const id = profileRowId(profile);
    const canonicalId = profileCanonicalId(profile);
    return Boolean(id && canonicalId && id !== canonicalId);
};

/** Canonical primary row (live candidate) — not a staff shadow copy or linked version. */
export const isCanonicalPrimaryCandidateProfile = (
    profile: Record<string, unknown> | null | undefined,
): boolean => {
    if (!profile || isStaffDuplicateProfile(profile)) return false;
    const id = profileRowId(profile);
    const canonicalId = profileCanonicalId(profile);
    return Boolean(id) && (!canonicalId || canonicalId === id);
};

/** Highlight on the canonical (original) profile card only. */
export const originalPrimaryCandidateProfileCardClass = (active: boolean): string =>
    active ? 'border-emerald-400/90 ring-1 ring-emerald-500/30' : 'border-border-subtle';

const profileCreatedAtMs = (profile: Record<string, unknown> | null | undefined): number => {
    const raw = profile?.createdAt ?? profile?.updatedAt ?? 0;
    const ms = new Date(String(raw || 0)).getTime();
    return Number.isFinite(ms) ? ms : 0;
};

/** Canonical primary id for a profile version family. */
export const resolveProfileFamilyPrimaryId = (
    profile: Record<string, unknown> | null | undefined,
): string => {
    const id = profileRowId(profile);
    const canonicalId = profileCanonicalId(profile);
    if (canonicalId && canonicalId !== id) return canonicalId;
    return id;
};

/** All profiles in the same version family (primary + linked portal versions). */
export const filterProfilesInSameFamily = <T extends Record<string, unknown>>(
    profiles: T[],
    anchor?: Record<string, unknown> | null,
): T[] => {
    if (!profiles.length) return profiles;
    const familyRoot = resolveProfileFamilyPrimaryId(anchor || profiles[0]);
    if (!familyRoot) return profiles;
    return profiles.filter((profile) => {
        const id = profileRowId(profile);
        const canonicalId = profileCanonicalId(profile);
        return id === familyRoot || canonicalId === familyRoot;
    });
};

/** Candidate-portal list — excludes staff shadow copies (צור העתק). */
export const filterCandidatePortalProfiles = <T extends Record<string, unknown>>(profiles: T[]): T[] =>
    profiles.filter((profile) => !profile.isDeleted && !isStaffDuplicateProfile(profile));

/** Profile the candidate portal should open — never a staff shadow copy. */
export const resolveCandidatePortalDisplayProfile = <T extends Record<string, unknown>>(
    profiles: T[],
    preferredId?: string | number | null,
): T | undefined => {
    const visible = filterCandidatePortalProfiles(profiles);
    if (!visible.length) return undefined;

    const preferred = String(preferredId ?? '').trim();
    if (preferred) {
        const direct = visible.find((profile) => profileRowId(profile) === preferred);
        if (direct) return direct;

        const requested = profiles.find((profile) => profileRowId(profile) === preferred);
        if (requested && isStaffDuplicateProfile(requested)) {
            const canonicalId = profileCanonicalId(requested);
            const fromCanonical = visible.find((profile) => profileRowId(profile) === canonicalId);
            if (fromCanonical) return fromCanonical;
        }
    }

    const primary = visible.find((profile) => isCanonicalPrimaryCandidateProfile(profile));
    if (primary) return primary;

    return visible.slice().sort((a, b) => profileCreatedAtMs(a) - profileCreatedAtMs(b))[0];
};

/** Staff "candidate view" link — always the canonical primary, not an internal shadow copy. */
export const resolveCandidatePortalPreviewId = (
    profile: Record<string, unknown> | null | undefined,
    fallbackId?: string | number | null,
): string => {
    if (!profile) return String(fallbackId ?? '').trim();
    if (isStaffDuplicateProfile(profile)) {
        return profileCanonicalId(profile) || String(fallbackId ?? '').trim();
    }
    return profileRowId(profile) || String(fallbackId ?? '').trim();
};

/** Linked or staff shadow row — tag edits apply in-place on this profile only. */
export const isNonPrimaryCandidateProfile = (
    profile: Record<string, unknown> | null | undefined,
): boolean => isStaffDuplicateProfile(profile) || isLinkedCandidateProfileVersion(profile);

/** Only staff shadow copies (צור העתק) skip the primary save confirmation dialog. */
export const shouldSaveCandidateProfileDirectly = (
    profile: Record<string, unknown> | null | undefined,
): boolean => isStaffDuplicateProfile(profile);

const hasDuplicateProfileNameSuffix = (profile: Record<string, unknown> | null | undefined): boolean => {
    const label = String(profile?.profileName || profile?.fullName || profile?.title || '').trim();
    return /_duplicate\d*$/i.test(label);
};

/** Staff shadow (or legacy internal copy) that can be promoted to the candidate portal. */
export const canShareStaffProfileWithCandidate = (
    profile: Record<string, unknown> | null | undefined,
): boolean => {
    if (!profile) return false;
    const id = profileRowId(profile);
    const canonicalId = profileCanonicalId(profile);
    if (!id || !canonicalId || canonicalId === id) return false;
    if (profile.staffProfileCopy === true) return true;
    return hasDuplicateProfileNameSuffix(profile);
};

/** @deprecated use shouldSaveCandidateProfileDirectly — kept for inverted call sites */
export const shouldConfirmBeforePrimarySave = (
    profile: Record<string, unknown> | null | undefined,
): boolean => !shouldSaveCandidateProfileDirectly(profile);

const ensureArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value];
    return [];
};

export const PROFILE_DUPLICATE_SKIP_KEYS = new Set([
    'id',
    'backendId',
    'createdAt',
    'updatedAt',
    'isDeleted',
    'isArchived',
    'matchScore',
    'matchAnalysis',
    'embedding',
    'searchText',
    'searchTextSavedAt',
    'originalText',
    'events',
    'candidateTags',
    'tagDetails',
    'tags',
    'internalNotes',
    'lastActivity',
    'lastActive',
    'statusExplanation',
    'recruitmentSourceId',
    'recruitmentSourceCreatedAt',
    'recruitmentSourceUpdatedAt',
    'approveByCandidate',
    'consentToJobOffers',
    'allowProfileVersion',
    'sendWelcomeEmail',
    'canonicalCandidateId',
]);

const cloneProfileRows = (rows: unknown, regenIds = false): unknown[] =>
    ensureArray(rows).map((row) => {
        if (!row || typeof row !== 'object') return row;
        const copy = { ...(row as Record<string, unknown>) };
        if (regenIds && 'id' in copy) {
            copy.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }
        return copy;
    });

export const buildDuplicateProfileName = (baseName: string, existingNames: string[] = []): string => {
    const trimmed = String(baseName || 'פרופיל').trim() || 'פרופיל';
    const existing = new Set(existingNames.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean));
    let candidate = `${trimmed}_duplicate`;
    let counter = 2;
    while (existing.has(candidate.toLowerCase())) {
        candidate = `${trimmed}_duplicate${counter}`;
        counter += 1;
    }
    return candidate;
};

export const buildTagEntriesFromSource = (source: Record<string, unknown>) => {
    const details = ensureArray(source.tagDetails);
    if (details.length) {
        return details
            .map((detail: any) => ({
                tagKey: String(detail.tagKey || detail.displayNameHe || detail.displayNameEn || '').trim(),
                displayNameHe: String(detail.displayNameHe || detail.tagKey || detail.displayNameEn || '').trim(),
                displayNameEn: String(detail.displayNameEn || '').trim(),
                raw_type: detail.rawType || detail.raw_type || 'skill',
                context: detail.context,
                confidence_score: detail.confidenceScore ?? detail.confidence_score,
                calculated_weight: detail.calculatedWeight ?? detail.calculated_weight,
                final_score: detail.finalScore ?? detail.final_score,
            }))
            .filter((entry) => entry.tagKey && entry.displayNameHe);
    }
    return ensureArray(source.tags)
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .map((tag) => ({
            tagKey: tag,
            displayNameHe: tag,
            displayNameEn: tag,
            raw_type: 'skill',
        }));
};

export const buildProfileDuplicatePayload = (
    source: Record<string, unknown>,
    profileName: string,
    userId?: string | null,
    primaryCandidateId?: string | null,
) => {
    const clone = JSON.parse(JSON.stringify(source || {})) as Record<string, unknown>;
    PROFILE_DUPLICATE_SKIP_KEYS.forEach((key) => {
        delete clone[key];
    });
    if (userId) clone.userId = userId;
    clone.profileName = profileName;
    clone.title = profileName;
    clone.fullName = profileName;
    clone.workExperience = cloneProfileRows(clone.workExperience, true);
    clone.education = cloneProfileRows(clone.education, true);
    clone.experience = cloneProfileRows(clone.experience, true);
    clone.documents = cloneProfileRows(clone.documents, true);
    clone.desiredRoles = cloneProfileRows(clone.desiredRoles, false);
    clone.languages = cloneProfileRows(clone.languages, false);
    clone.softSkills = cloneProfileRows(clone.softSkills, false);
    clone.techSkills = cloneProfileRows(clone.techSkills, false);
    if (clone.skills && typeof clone.skills === 'object') {
        const skills = clone.skills as Record<string, unknown>;
        clone.skills = {
            soft: cloneProfileRows(skills.soft, false),
            technical: cloneProfileRows(skills.technical, false),
        };
    }
    if (primaryCandidateId) {
        clone.canonicalCandidateId = primaryCandidateId;
    }
    clone.staffProfileCopy = true;
    return clone;
};

export const sanitizeProfileDuplicatePayload = (data: Record<string, unknown>) => {
    const copy = { ...data };
    delete copy.id;
    delete copy.backendId;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.workExperience = Array.isArray(copy.workExperience) ? copy.workExperience : [];
    if (!copy.skills || typeof copy.skills !== 'object') {
        copy.skills = {
            soft: Array.isArray(copy.softSkills) ? copy.softSkills : [],
            technical: Array.isArray(copy.techSkills) ? copy.techSkills : [],
        };
    }
    return copy;
};

/** Strip client-only fields; keep canonical link on linked rows but never on the primary row. */
export const buildCandidateSavePayload = (data: Record<string, unknown>) => {
    const copy = { ...data };
    delete copy.id;
    delete copy.backendId;
    if (isCanonicalPrimaryCandidateProfile(data)) {
        delete copy.canonicalCandidateId;
        delete copy.staffProfileCopy;
    }
    return copy;
};

/** Server / UI metadata — ignored when detecting unsaved form edits. */
const CANDIDATE_SAVE_COMPARE_IGNORE_KEYS = new Set([
    'id',
    'backendId',
    'createdAt',
    'updatedAt',
    'lastActivity',
    'lastActive',
    'matchScore',
    'matchAnalysis',
    'embedding',
    'searchText',
    'searchTextSavedAt',
    'events',
    'candidateTags',
    'statusExplanation',
    'approveByCandidate',
    'consentToJobOffers',
    'allowProfileVersion',
    'sendWelcomeEmail',
    'canonicalCandidateId',
    'staffProfileCopy',
]);

/**
 * Edits to these fields alone must not open the primary-profile save confirm dialog.
 * (Internal notes, recruitment source, distribution channels, original resume file, etc.)
 */
export const CANDIDATE_NON_CV_FORM_KEYS = new Set([
    'internalNotes',
    'recruiterNotes',
    'candidateNotes',
    'internalTags',
    'source',
    'recruitmentSourceId',
    'recruitmentSourceCreatedAt',
    'recruitmentSourceUpdatedAt',
    'distributionEmail',
    'distributionSms',
    'distributionWhatsapp',
    'resumeUrl',
    'originalText',
    'documents',
    'media',
    'resumeFileName',
    'resumeKey',
]);

const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
};

const pickComparableCandidateSaveData = (data: Record<string, unknown>) => {
    const payload = buildCandidateSavePayload(data);
    const copy = { ...payload };
    CANDIDATE_SAVE_COMPARE_IGNORE_KEYS.forEach((key) => {
        delete copy[key];
    });
    return copy;
};

/** True when current form differs from last saved/fetched baseline (any save-worthy field). */
export const hasCandidateFormChanges = (
    current: Record<string, unknown> | null | undefined,
    baseline: Record<string, unknown> | null | undefined,
): boolean => {
    if (!current || !baseline) return false;
    return (
        stableStringify(pickComparableCandidateSaveData(current))
        !== stableStringify(pickComparableCandidateSaveData(baseline))
    );
};

/** True when changes include generated-CV / profile-form fields (triggers primary save confirm). */
export const hasCandidateCvFormChanges = (
    current: Record<string, unknown> | null | undefined,
    baseline: Record<string, unknown> | null | undefined,
): boolean => {
    if (!current || !baseline || !hasCandidateFormChanges(current, baseline)) return false;

    const currentPick = pickComparableCandidateSaveData(current);
    const baselinePick = pickComparableCandidateSaveData(baseline);
    const keys = new Set([...Object.keys(currentPick), ...Object.keys(baselinePick)]);

    for (const key of keys) {
        if (CANDIDATE_NON_CV_FORM_KEYS.has(key)) continue;
        if (stableStringify(currentPick[key]) !== stableStringify(baselinePick[key])) {
            return true;
        }
    }
    return false;
};
