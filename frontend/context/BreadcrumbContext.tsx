import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type BreadcrumbParentCrumb = { label: string; path: string };

type BreadcrumbContextValue = {
  contactProfileParent: BreadcrumbParentCrumb | null;
  setContactProfileParent: (crumb: BreadcrumbParentCrumb | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contactProfileParent, setContactProfileParentState] = useState<BreadcrumbParentCrumb | null>(null);
  const setContactProfileParent = useCallback((crumb: BreadcrumbParentCrumb | null) => {
    setContactProfileParentState(crumb);
  }, []);
  const value = useMemo(
    () => ({ contactProfileParent, setContactProfileParent }),
    [contactProfileParent, setContactProfileParent],
  );
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
};

export function useBreadcrumbContext(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error('useBreadcrumbContext must be used within BreadcrumbProvider');
  }
  return ctx;
}
