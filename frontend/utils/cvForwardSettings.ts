export type CvForwardRecipientForm =
    | {
          type: 'user';
          userId: string;
          email?: string;
          name?: string;
      }
    | {
          type: 'external';
          email: string;
          name?: string;
      };

export type CvForwardSettingsForm = {
    enabled: boolean;
    recipients: CvForwardRecipientForm[];
    subjectPrefixTemplate: string;
};

export const DEFAULT_CV_FORWARD_SUBJECT_PREFIX = '{{מקור_גיוס}}';

export const DEFAULT_CV_FORWARD_SETTINGS: CvForwardSettingsForm = {
    enabled: false,
    recipients: [],
    subjectPrefixTemplate: DEFAULT_CV_FORWARD_SUBJECT_PREFIX,
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEmail(value: string): boolean {
    return EMAIL_RE.test(String(value || '').trim());
}

function normalizeRecipient(raw: unknown): CvForwardRecipientForm | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const type = String(o.type || '').trim().toLowerCase();
    const name = String(o.name || '').trim() || undefined;

    if (type === 'user') {
        const userId = String(o.userId || o.id || '').trim();
        if (!UUID_RE.test(userId)) return null;
        const emailRaw = String(o.email || '').trim().toLowerCase();
        const email = isValidEmail(emailRaw) ? emailRaw : undefined;
        return { type: 'user', userId, ...(email ? { email } : {}), ...(name ? { name } : {}) };
    }

    if (type === 'external') {
        const email = String(o.email || '')
            .trim()
            .toLowerCase();
        if (!isValidEmail(email)) return null;
        return { type: 'external', email, ...(name ? { name } : {}) };
    }

    return null;
}

/** Hydrate job.cvForwardSettings from API into form state. */
export function cvForwardSettingsFromJob(raw: unknown): CvForwardSettingsForm {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...DEFAULT_CV_FORWARD_SETTINGS, recipients: [] };
    }

    const o = raw as Record<string, unknown>;
    const seen = new Set<string>();
    const recipients: CvForwardRecipientForm[] = [];

    if (Array.isArray(o.recipients)) {
        for (const entry of o.recipients) {
            const normalized = normalizeRecipient(entry);
            if (!normalized) continue;
            const key =
                normalized.type === 'external'
                    ? normalized.email
                    : normalized.email
                      ? `user:${normalized.userId}:${normalized.email}`
                      : `user:${normalized.userId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            recipients.push(normalized);
        }
    }

    return {
        enabled: Boolean(o.enabled),
        recipients,
        subjectPrefixTemplate:
            o.subjectPrefixTemplate !== undefined && o.subjectPrefixTemplate !== null
                ? String(o.subjectPrefixTemplate)
                : DEFAULT_CV_FORWARD_SUBJECT_PREFIX,
    };
}

/** Serialize form state for PUT/POST /api/jobs. */
export function cvForwardSettingsToPayload(settings: CvForwardSettingsForm): CvForwardSettingsForm {
    const recipients = (settings.recipients || [])
        .map((r) => {
            if (r.type === 'user') {
                return {
                    type: 'user' as const,
                    userId: r.userId,
                    ...(r.email ? { email: r.email.trim().toLowerCase() } : {}),
                    ...(r.name ? { name: r.name.trim() } : {}),
                };
            }
            return {
                type: 'external' as const,
                email: r.email.trim().toLowerCase(),
                ...(r.name ? { name: r.name.trim() } : {}),
            };
        })
        .filter(Boolean);

    const enabled = Boolean(settings.enabled) && recipients.length > 0;

    return {
        enabled,
        recipients,
        subjectPrefixTemplate: String(settings.subjectPrefixTemplate ?? DEFAULT_CV_FORWARD_SUBJECT_PREFIX),
    };
}

export function canEnableCvForward(settings: CvForwardSettingsForm): boolean {
    return (settings.recipients || []).length > 0;
}
