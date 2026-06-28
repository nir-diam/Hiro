import { SavedSearch } from '../context/SavedSearchesContext';

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): Record<string, string> => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const res = await fetch(`${apiBase()}/api/saved-searches`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load saved searches');
  return res.json();
}

export async function createSavedSearch(data: Omit<SavedSearch, 'id'>): Promise<SavedSearch> {
  const res = await fetch(`${apiBase()}/api/saved-searches`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save search');
  return res.json();
}

export async function updateSavedSearch(id: string | number, data: Omit<SavedSearch, 'id'>): Promise<SavedSearch> {
  const res = await fetch(`${apiBase()}/api/saved-searches/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update search');
  return res.json();
}

export async function deleteSavedSearch(id: string | number): Promise<void> {
  const res = await fetch(`${apiBase()}/api/saved-searches/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete search');
}

export async function blacklistCandidateFromSearch(
  searchId: string | number,
  candidateEmail: string | null,
  candidatePhone: string | null,
): Promise<{ blacklist: { candidateEmail?: string | null; candidatePhone?: string | null }[] }> {
  const res = await fetch(`${apiBase()}/api/saved-searches/${searchId}/blacklist`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ candidateEmail, candidatePhone }),
  });
  if (!res.ok) throw new Error('Failed to blacklist candidate');
  return res.json();
}

export type EnrichedBlacklistEntry = {
  candidateId?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidateName?: string | null;
};

export async function fetchSavedSearchBlacklist(
  searchId: string | number,
): Promise<{ blacklist: EnrichedBlacklistEntry[] }> {
  const res = await fetch(`${apiBase()}/api/saved-searches/${searchId}/blacklist`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load blacklist');
  return res.json();
}

export async function removeCandidateFromSearchBlacklist(
  searchId: string | number,
  candidateEmail: string | null,
  candidatePhone: string | null,
): Promise<{ blacklist: { candidateEmail?: string | null; candidatePhone?: string | null }[] }> {
  const res = await fetch(`${apiBase()}/api/saved-searches/${searchId}/blacklist`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ candidateEmail, candidatePhone }),
  });
  if (!res.ok) throw new Error('Failed to remove from blacklist');
  return res.json();
}
