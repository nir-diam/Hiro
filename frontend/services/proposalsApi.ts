import { authHeaders } from '../utils/authHeaders';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

export type ProposalStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted';

export type ProposalDto = {
  id: string;
  clientId: string;
  contactId?: string | null;
  templateId?: string | null;
  number: string;
  date: string;
  validUntil?: string | null;
  currency: string;
  amount: number;
  vatRate: number;
  includeVat: boolean;
  closeProbability?: number | null;
  status: ProposalStatus;
  notes?: string;
  contentHtml?: string;
  clientName?: string;
  contactName?: string;
  totalAmount?: string;
  createdByName?: string;
};

export type ProposalTemplateDto = {
  id: string;
  clientId: string;
  name: string;
  content: string;
  updatedByName?: string;
  lastUpdated?: string;
};

async function parseJson(res: Response) {
  const text = await res.text().catch(() => '');
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function fetchProposalTemplates(clientId?: string): Promise<ProposalTemplateDto[]> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  const res = await fetch(`${apiBase()}/api/proposals/templates${qs}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  const data = await parseJson(res);
  const rows = Array.isArray((data as any)?.data) ? (data as any).data : Array.isArray(data) ? data : [];
  return rows as ProposalTemplateDto[];
}

export async function createProposalTemplate(
  body: { name: string; content: string; clientId?: string },
): Promise<ProposalTemplateDto> {
  const res = await fetch(`${apiBase()}/api/proposals/templates`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  return (await parseJson(res)) as ProposalTemplateDto;
}

export async function updateProposalTemplate(
  id: string,
  body: { name: string; content: string; clientId?: string },
): Promise<ProposalTemplateDto> {
  const res = await fetch(`${apiBase()}/api/proposals/templates/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  return (await parseJson(res)) as ProposalTemplateDto;
}

export async function deleteProposalTemplate(id: string, clientId?: string): Promise<void> {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  const res = await fetch(`${apiBase()}/api/proposals/templates/${encodeURIComponent(id)}${qs}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  });
  await parseJson(res);
}

export async function fetchProposals(opts: {
  clientId?: string;
  contactId?: string;
} = {}): Promise<ProposalDto[]> {
  const params = new URLSearchParams();
  if (opts.clientId) params.set('clientId', opts.clientId);
  if (opts.contactId) params.set('contactId', opts.contactId);
  const qs = params.toString() ? `?${params}` : '';
  const res = await fetch(`${apiBase()}/api/proposals${qs}`, {
    credentials: 'include',
    headers: authHeaders(),
  });
  const data = await parseJson(res);
  const rows = Array.isArray((data as any)?.data) ? (data as any).data : Array.isArray(data) ? data : [];
  return rows as ProposalDto[];
}

export async function createProposal(body: Partial<ProposalDto> & { clientId: string }): Promise<ProposalDto> {
  const res = await fetch(`${apiBase()}/api/proposals`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  return (await parseJson(res)) as ProposalDto;
}

export async function updateProposal(id: string, body: Partial<ProposalDto>): Promise<ProposalDto> {
  const res = await fetch(`${apiBase()}/api/proposals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  });
  return (await parseJson(res)) as ProposalDto;
}

export async function deleteProposal(id: string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/proposals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  });
  await parseJson(res);
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'טיוטה',
  sent: 'נשלח',
  accepted: 'אושר',
  rejected: 'נדחה',
  converted: 'הפך לחשבונית',
};

function splitContactName(fullName: string): { first: string; last: string } {
  const s = String(fullName || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export type ProposalTemplatePlaceholderContext = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactRole?: string;
  companyName?: string;
  repName?: string;
  repEmail?: string;
  repPhone?: string;
  proposalNumber?: string;
  proposalDate?: string;
  proposalTotal?: string;
  proposalCurrency?: string;
  proposalValidUntil?: string;
};

/** Replace `{token}` placeholders in proposal template HTML (unknown tokens left unchanged). */
export function applyProposalTemplatePlaceholders(
  html: string,
  ctx: ProposalTemplatePlaceholderContext = {},
): string {
  const { first, last } = splitContactName(ctx.contactName || '');
  const now = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'long',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
  const map: Record<string, string> = {
    contact_first_name: first,
    contact_last_name: last,
    contact_full_name: ctx.contactName || '',
    contact_role: ctx.contactRole || '',
    contact_phone: ctx.contactPhone || '',
    contact_email: ctx.contactEmail || '',
    contact_id: '',
    company_name: ctx.companyName || '',
    company_id: '',
    company_address: '',
    company_city: '',
    proposal_number: ctx.proposalNumber || '',
    proposal_date: ctx.proposalDate || now,
    proposal_total: ctx.proposalTotal || '',
    proposal_currency: ctx.proposalCurrency || 'ILS',
    proposal_valid_until: ctx.proposalValidUntil || '',
    rep_name: ctx.repName || '',
    rep_email: ctx.repEmail || '',
    rep_phone: ctx.repPhone || '',
    current_date: now,
    digital_signature_link: '',
  };
  let out = String(html ?? '');
  for (const [key, val] of Object.entries(map)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return out;
}
