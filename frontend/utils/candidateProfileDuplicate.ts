/** Staff-created duplicate copies (צור העתק) — hidden from candidate portal switcher only. */
export const isStaffDuplicateProfile = (profile: Record<string, unknown> | null | undefined): boolean => {
    if (!profile) return false;
    if (profile.staffProfileCopy === true) return true;
    const label = String(profile.profileName || profile.fullName || profile.title || '').trim();
    return /_duplicate\d*$/i.test(label);
};

/** Linked profile version row (shadow / portal) — not the primary candidate row. */
export const isLinkedCandidateProfileVersion = (
    profile: Record<string, unknown> | null | undefined,
): boolean => {
    if (!profile) return false;
    const id = String(profile.backendId || profile.id || '').trim();
    const canonicalId = String(profile.canonicalCandidateId || '').trim();
    return Boolean(id && canonicalId && id !== canonicalId);
};

/** Staff shadow copy or any linked version row — save in-place without primary confirm dialog. */
export const shouldSaveCandidateProfileDirectly = (
    profile: Record<string, unknown> | null | undefined,
): boolean => isStaffDuplicateProfile(profile) || isLinkedCandidateProfileVersion(profile);

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
