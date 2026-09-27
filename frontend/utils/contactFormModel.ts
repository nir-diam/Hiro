export type ContactEmailEntry = { id: string; value: string; isPrimary: boolean };
export type ContactPhoneEntry = {
  id: string;
  value: string;
  kind: 'office' | 'mobile';
  isPrimary: boolean;
};
export type ContactLinkEntry = {
  id: string;
  label: string;
  url: string;
  isPrimary: boolean;
};
export type ContactAddressEntry = { id: string; value: string; isPrimary: boolean };

export interface ContactFormState {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
  links: ContactLinkEntry[];
  addresses: ContactAddressEntry[];
  linkedin: string;
  username: string;
  isActive: boolean;
  notes: string;
  hasSystemAccess?: boolean;
  isInvited?: boolean;
  groupId?: string | null;
  organizationId?: string | null;
  distributionEmail: boolean;
  distributionSms: boolean;
  distributionWhatsapp: boolean;
}

export const newContactEntryId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const buildFullName = (firstName: string, lastName: string): string =>
  [firstName, lastName].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

/** Pending linked org id stored on contact metadata when organizationId is not set yet. */
export const contactOrganizationTmpId = (
  row: { organizationTmpId?: string | null; metadata?: unknown } | null | undefined,
): string | null => {
  if (!row) return null;
  if (row.organizationTmpId != null && String(row.organizationTmpId).trim()) {
    return String(row.organizationTmpId).trim();
  }
  const meta = row.metadata;
  if (meta && typeof meta === 'object' && meta !== null && 'organizationTmpId' in meta) {
    const value = (meta as { organizationTmpId?: unknown }).organizationTmpId;
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
};

export const splitFullName = (name: string): { firstName: string; lastName: string } => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const normalizeEmailEntries = (raw: unknown, fallback = ''): ContactEmailEntry[] => {
  if (Array.isArray(raw) && raw.length) {
    const entries = raw
      .map((e: any) => ({
        id: String(e?.id || newContactEntryId()),
        value: String(e?.value || '').trim(),
        isPrimary: Boolean(e?.isPrimary),
      }))
      .filter((e) => e.value);
    if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
    return entries;
  }
  const email = String(fallback || '').trim();
  return email ? [{ id: newContactEntryId(), value: email, isPrimary: true }] : [];
};

const normalizePhoneEntries = (
  raw: unknown,
  { phone = '', mobilePhone = '' }: { phone?: string; mobilePhone?: string } = {},
): ContactPhoneEntry[] => {
  if (Array.isArray(raw) && raw.length) {
    const entries = raw
      .map((e: any) => ({
        id: String(e?.id || newContactEntryId()),
        value: String(e?.value || '').trim(),
        kind: e?.kind === 'mobile' ? ('mobile' as const) : ('office' as const),
        isPrimary: Boolean(e?.isPrimary),
      }))
      .filter((e) => e.value);
    for (const kind of ['office', 'mobile'] as const) {
      const ofKind = entries.filter((e) => e.kind === kind);
      if (ofKind.length && !ofKind.some((e) => e.isPrimary)) ofKind[0].isPrimary = true;
    }
    return entries;
  }
  const entries: ContactPhoneEntry[] = [];
  const office = String(phone || '').trim();
  const mobile = String(mobilePhone || '').trim();
  if (office) entries.push({ id: newContactEntryId(), value: office, kind: 'office', isPrimary: true });
  if (mobile) entries.push({ id: newContactEntryId(), value: mobile, kind: 'mobile', isPrimary: true });
  return entries;
};

const normalizeLinkEntries = (raw: unknown): ContactLinkEntry[] => {
  if (!Array.isArray(raw) || !raw.length) return [];
  const entries = raw
    .map((e: any) => ({
      id: String(e?.id || newContactEntryId()),
      label: String(e?.label || '').trim(),
      url: String(e?.url || e?.value || '').trim(),
      isPrimary: Boolean(e?.isPrimary),
    }))
    .filter((e) => e.url);
  if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
  return entries;
};

const normalizeAddressEntries = (raw: unknown): ContactAddressEntry[] => {
  if (!Array.isArray(raw) || !raw.length) return [];
  const entries = raw
    .map((e: any) => ({
      id: String(e?.id || newContactEntryId()),
      value: String(e?.value || '').trim(),
      isPrimary: Boolean(e?.isPrimary),
    }))
    .filter((e) => e.value);
  if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
  return entries;
};

export const emptyContactForm = (partial: Partial<ContactFormState> = {}): ContactFormState => ({
  id: partial.id || 'tmp-new',
  firstName: partial.firstName || '',
  lastName: partial.lastName || '',
  name: partial.name || '',
  role: partial.role || '',
  emails: partial.emails || [],
  phones: partial.phones || [],
  links: partial.links || [],
  addresses: partial.addresses || [],
  linkedin: partial.linkedin || '',
  username: partial.username || '',
  isActive: partial.isActive ?? true,
  notes: partial.notes || '',
  hasSystemAccess: partial.hasSystemAccess ?? false,
  isInvited: partial.isInvited ?? false,
  groupId: partial.groupId ?? null,
  organizationId: partial.organizationId ?? null,
  distributionEmail: partial.distributionEmail !== false,
  distributionSms: partial.distributionSms !== false,
  distributionWhatsapp: partial.distributionWhatsapp !== false,
});

export const contactFromApi = (row: Record<string, unknown>): ContactFormState => {
  const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
  const firstName = String(row.firstName || '').trim() || splitFullName(String(row.name || '')).firstName;
  const lastName = String(row.lastName || '').trim() || splitFullName(String(row.name || '')).lastName;
  const name = String(row.name || '').trim() || buildFullName(firstName, lastName);
  return emptyContactForm({
    id: String(row.id || 'tmp-new'),
    firstName,
    lastName,
    name,
    role: String(row.role || ''),
    emails: normalizeEmailEntries(meta.emails ?? row.emails, String(row.email || '')),
    phones: normalizePhoneEntries(meta.phones ?? row.phones, {
      phone: String(row.phone || ''),
      mobilePhone: String(row.mobilePhone || ''),
    }),
    links: normalizeLinkEntries(meta.links ?? row.links),
    addresses: normalizeAddressEntries(meta.addresses ?? row.addresses),
    linkedin: String(row.linkedin || ''),
    username: String(row.username || ''),
    isActive: Boolean(row.isActive ?? true),
    notes: String(row.notes || ''),
    hasSystemAccess: Boolean(row.hasSystemAccess ?? false),
    isInvited: Boolean(row.isInvited ?? false),
    groupId: row.groupId != null ? String(row.groupId) : null,
    organizationId: row.organizationId != null ? String(row.organizationId) : null,
    distributionEmail: row.distributionEmail !== false,
    distributionSms: row.distributionSms !== false,
    distributionWhatsapp: row.distributionWhatsapp !== false,
  });
};

export const contactToApiPayload = (form: ContactFormState): Record<string, unknown> => {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const name = buildFullName(firstName, lastName);
  const emails = form.emails.map((e) => ({ ...e, value: e.value.trim() })).filter((e) => e.value);
  const phones = form.phones.map((p) => ({ ...p, value: p.value.trim() })).filter((p) => p.value);
  const links = form.links
    .map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.url);
  const addresses = form.addresses.map((a) => ({ ...a, value: a.value.trim() })).filter((a) => a.value);
  const primaryEmail = emails.find((e) => e.isPrimary)?.value || emails[0]?.value || '';
  const primaryOffice = phones.find((p) => p.kind === 'office' && p.isPrimary)?.value
    || phones.find((p) => p.kind === 'office')?.value
    || '';
  const primaryMobile = phones.find((p) => p.kind === 'mobile' && p.isPrimary)?.value
    || phones.find((p) => p.kind === 'mobile')?.value
    || '';

  return {
    firstName,
    lastName,
    name,
    role: form.role,
    email: primaryEmail,
    phone: primaryOffice,
    mobilePhone: primaryMobile,
    emails,
    phones,
    links,
    addresses,
    linkedin: form.linkedin,
    username: form.username,
    isActive: form.isActive,
    notes: form.notes,
    hasSystemAccess: Boolean(form.hasSystemAccess),
    isInvited: Boolean(form.isInvited),
    groupId: form.groupId || null,
    distributionEmail: form.distributionEmail !== false,
    distributionSms: form.distributionSms !== false,
    distributionWhatsapp: form.distributionWhatsapp !== false,
  };
};

export const syncContactName = (form: ContactFormState): ContactFormState => ({
  ...form,
  name: buildFullName(form.firstName, form.lastName),
});

export const setPrimaryEmail = (emails: ContactEmailEntry[], id: string): ContactEmailEntry[] =>
  emails.map((e) => ({ ...e, isPrimary: e.id === id }));

export const setPrimaryPhone = (phones: ContactPhoneEntry[], id: string, kind: 'office' | 'mobile'): ContactPhoneEntry[] =>
  phones.map((e) => ({
    ...e,
    isPrimary: e.kind === kind ? e.id === id : e.isPrimary,
  }));

export const setPrimaryLink = (links: ContactLinkEntry[], id: string): ContactLinkEntry[] =>
  links.map((e) => ({ ...e, isPrimary: e.id === id }));

export const setPrimaryAddress = (addresses: ContactAddressEntry[], id: string): ContactAddressEntry[] =>
  addresses.map((e) => ({ ...e, isPrimary: e.id === id }));

export const primaryEmail = (form: ContactFormState): string =>
  form.emails.find((e) => e.isPrimary)?.value || form.emails[0]?.value || '';

export const primaryPhone = (form: ContactFormState, kind: 'office' | 'mobile'): string =>
  form.phones.find((p) => p.kind === kind && p.isPrimary)?.value
  || form.phones.find((p) => p.kind === kind)?.value
  || '';
