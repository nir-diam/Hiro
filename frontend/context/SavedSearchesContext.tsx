import React, { createContext, useState, useContext, useMemo, useEffect, useCallback } from 'react';
import {
  fetchSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from '../services/savedSearchesApi';

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
}

interface SavedSearchesContextType {
  savedSearches: SavedSearch[];
  addSearch: (name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => Promise<void>;
  deleteSearch: (id: number | string) => Promise<void>;
  updateSearch: (id: number | string, name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => Promise<void>;
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
    alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] },
  ) => {
    const payload = {
      name, isPublic, searchParams, additionalFilters, languageFilters,
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
    alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] },
  ) => {
    const payload = {
      name, isPublic, searchParams, additionalFilters, languageFilters,
      ...(alertConfig || {}),
    };

    setSavedSearches(prev => prev.map(s => s.id === id ? { ...s, ...payload } : s));

    try {
      const updated = await updateSavedSearch(id, payload as Omit<SavedSearch, 'id'>);
      setSavedSearches(prev => prev.map(s => s.id === id ? updated : s));
    } catch { /* keep optimistic update */ }
  }, []);

  const value = useMemo(() => ({
    savedSearches,
    addSearch,
    deleteSearch,
    updateSearch,
  }), [savedSearches, addSearch, deleteSearch, updateSearch]);

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
