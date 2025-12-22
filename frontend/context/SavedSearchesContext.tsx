import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';

// Define the shape of a saved search. Using `any` for complex state objects for simplicity in this context.
export interface SavedSearch {
  id: number;
  name: string;
  isPublic: boolean;
  searchParams: any;
  additionalFilters: any[];
  languageFilters: any[];
  // New properties for job alerts
  isAlert?: boolean;
  frequency?: 'daily' | 'weekly';
  notificationMethods?: ('email' | 'system')[];
}

interface SavedSearchesContextType {
  savedSearches: SavedSearch[];
  addSearch: (name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => void;
  deleteSearch: (id: number) => void;
  updateSearch: (id: number, name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => void;
}

const SavedSearchesContext = createContext<SavedSearchesContextType | undefined>(undefined);

export const SavedSearchesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try {
      const item = localStorage.getItem('savedSearches');
      return item ? JSON.parse(item) : [];
    } catch (error) {
      console.error("Error reading saved searches from localStorage", error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    } catch (error) {
      console.error("Error saving searches to localStorage", error);
    }
  }, [savedSearches]);

  const addSearch = (name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => {
    const newSearch: SavedSearch = {
      id: Date.now(),
      name,
      isPublic,
      searchParams,
      additionalFilters,
      languageFilters,
      ...(alertConfig || {}),
    };
    setSavedSearches(prev => [...prev, newSearch]);
  };

  const deleteSearch = (id: number) => {
    setSavedSearches(prev => prev.filter(search => search.id !== id));
  };

  const updateSearch = (id: number, name: string, isPublic: boolean, searchParams: any, additionalFilters: any[], languageFilters: any[], alertConfig?: { isAlert: boolean; frequency: 'daily' | 'weekly'; notificationMethods: ('email' | 'system')[] }) => {
    const updatedSearch: SavedSearch = { id, name, isPublic, searchParams, additionalFilters, languageFilters, ...(alertConfig || {}) };
    setSavedSearches(prev => prev.map(search => (search.id === id ? updatedSearch : search)));
  };

  const value = useMemo(() => ({
    savedSearches,
    addSearch,
    deleteSearch,
    updateSearch,
  }), [savedSearches]);

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
