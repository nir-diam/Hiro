import React, { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import {
  fetchSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  blacklistCandidateFromSearch,
  removeCandidateFromSearchBlacklist,
} from '../services/savedSearchesApi';

export interface FilterState {
  searchParams?: Record<string, any>;
  complexRules?: any[];
  additionalFilters?: any[];
  languageFilters?: any[];
  companyFilters?: {
    sizes: string[];
    sectors: string[];
    industries: string[];
    fields: string[];
    roles: string[];
  };
  searchTerm?: string;
  smartSearchQuery?: string;
}

export interface BlacklistEntry {
  candidateEmail?: string | null;
  candidatePhone?: string | null;
}

export interface SavedSearch {
  id: number | string;
  name: string;
  isPublic: boolean;
  searchParams: any;
  additionalFilters: any[];
  languageFilters: any[];
  isAlert?: boolean;
  frequency?: 'daily' | 'weekly';
  notificationMethods?: ('email' | 'system')[];
  filterState?: FilterState;
  blacklist?: BlacklistEntry[];
}

interface SavedSearchesContextType {
  savedSearches: SavedSearch[];
  addSearch: (name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], filterState?: FilterState, alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => Promise<void>;
  deleteSearch: (id: number | string) => Promise<void>;
  updateSearch: (id: number | string, name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], filterState?: FilterState, alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => Promise<void>;
  blacklistFromSearch: (searchId: number | string, candidateEmail: string | null, candidatePhone: string | null) => Promise<void>;
  removeFromSearchBlacklist: (searchId: number | string, candidateEmail: string | null, candidatePhone: string | null) => Promise<void>;
}

const SavedSearchesContext = createContext<SavedSearchesContextType | undefined>(undefined);

const LOCAL_KEY = 'savedSearches';

const readLocalSearches = (): SavedSearch[] => {
  try {
    const item = localStorage.getItem(LOCAL_KEY);
    return item ? JSON.parse(item) : [];
  } catch {
    return [];
  }
};

const writeLocalSearches = (searches: SavedSearch[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(searches));
  } catch { /* ignore */ }
};

export const SavedSearchesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(readLocalSearches);
  const [loaded, setLoaded] = useState(false);

  const loadFromBackend = useCallback(() => {
    fetchSavedSearches()
      .then((rows) => {
        setSavedSearches(rows);
        writeLocalSearches(rows);
      })
      .catch(() => {
        // Backend unreachable — keep localStorage data.
      })
      .finally(() => setLoaded(true));
  }, []);

  // Load from backend on mount; skip entirely if no token (e.g. login page) to avoid 401 noise.
  useEffect(() => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      setLoaded(true);
      return;
    }
    loadFromBackend();
  }, [loadFromBackend]);

  // Re-fetch after login (token written to localStorage in the same tab doesn't fire 'storage').
  // LoginScreen sets 'token' in localStorage then navigates — we detect the change via a custom event.
  useEffect(() => {
    const onTokenSet = () => {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (token) loadFromBackend();
    };
    window.addEventListener('hiro:token-set', onTokenSet);
    return () => window.removeEventListener('hiro:token-set', onTokenSet);
  }, [loadFromBackend]);

  // Keep localStorage in sync whenever state changes (after initial load).
  useEffect(() => {
    if (loaded) writeLocalSearches(savedSearches);
  }, [savedSearches, loaded]);

  const addSearch = useCallback(async (
    name: string,
    isPublic: boolean,
    searchParams: any,
    additionalFilters: any[],
    languageFilters: any[],
    filterState?: FilterState,
    alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] },
  ) => {
    const payload = {
      name, isPublic, searchParams, additionalFilters, languageFilters,
      ...(filterState ? { filterState } : {}),
      ...(alertConfig || {}),
    };

    try {
      const saved = await createSavedSearch(payload as Omit<SavedSearch, 'id'>);
      setSavedSearches(prev => [...prev, saved]);
    } catch {
      // Backend failed — store locally with a temp id so the UI still works.
      const local: SavedSearch = { id: Date.now(), ...payload };
      setSavedSearches(prev => [...prev, local]);
    }
  }, []);

  const deleteSearch = useCallback(async (id: number | string) => {
    setSavedSearches(prev => prev.filter(s => s.id !== id));
    try {
      await deleteSavedSearch(id);
    } catch { /* already removed from state */ }
  }, []);

  const updateSearch = useCallback(async (
    id: number | string,
    name: string,
    isPublic: boolean,
    searchParams: any,
    additionalFilters: any[],
    languageFilters: any[],
    filterState?: FilterState,
    alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] },
  ) => {
    const payload = {
      name, isPublic, searchParams, additionalFilters, languageFilters,
      ...(filterState ? { filterState } : {}),
      ...(alertConfig || {}),
    };

    setSavedSearches(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));

    try {
      const updated = await updateSavedSearch(id, payload as Omit<SavedSearch, 'id'>);
      setSavedSearches(prev => prev.map(s => s.id === id ? updated : s));
    } catch { /* keep optimistic update */ }
  }, []);

  const blacklistFromSearch = useCallback(async (
    searchId: number | string,
    candidateEmail: string | null,
    candidatePhone: string | null,
  ) => {
    const entry: BlacklistEntry = { candidateEmail, candidatePhone };
    // Optimistic update — immediately hide the candidate in the UI.
    setSavedSearches(prev => prev.map(s =>
      s.id === searchId
        ? { ...s, blacklist: [...(s.blacklist ?? []), entry] }
        : s,
    ));
    try {
      const { blacklist } = await blacklistCandidateFromSearch(searchId, candidateEmail, candidatePhone);
      setSavedSearches(prev => prev.map(s => s.id === searchId ? { ...s, blacklist } : s));
    } catch { /* keep optimistic update */ }
  }, []);

  const removeFromSearchBlacklist = useCallback(async (
    searchId: number | string,
    candidateEmail: string | null,
    candidatePhone: string | null,
  ) => {
    const emailKey = candidateEmail ? String(candidateEmail).trim().toLowerCase() : '';
    const phoneKey = candidatePhone ? String(candidatePhone).trim() : '';

    setSavedSearches(prev => prev.map(s => {
      if (s.id !== searchId) return s;
      const blacklist = (s.blacklist ?? []).filter((b) => {
        const bEmail = b.candidateEmail ? String(b.candidateEmail).trim().toLowerCase() : '';
        const bPhone = b.candidatePhone ? String(b.candidatePhone).trim() : '';
        if (emailKey && phoneKey) return !(bEmail === emailKey && bPhone === phoneKey);
        if (emailKey) return bEmail !== emailKey;
        if (phoneKey) return bPhone !== phoneKey;
        return true;
      });
      return { ...s, blacklist };
    }));

    try {
      const { blacklist } = await removeCandidateFromSearchBlacklist(searchId, candidateEmail, candidatePhone);
      setSavedSearches(prev => prev.map(s => s.id === searchId ? { ...s, blacklist } : s));
    } catch { /* keep optimistic update */ }
  }, []);

  const value = useMemo(() => ({
    savedSearches,
    addSearch,
    deleteSearch,
    updateSearch,
    blacklistFromSearch,
    removeFromSearchBlacklist,
  }), [savedSearches, addSearch, deleteSearch, updateSearch, blacklistFromSearch, removeFromSearchBlacklist]);

  return (
    <SavedSearchesContext.Provider value={value}>
      {children}
    </SavedSearchesContext.Provider>
  );
};

export const useSavedSearches = () => {
  const context = useContext(SavedSearchesContext);
  if (context === undefined) {
    throw new Error('useSavedSearches must be used within a SavedSearchesProvider');
  }
  return context;
};
