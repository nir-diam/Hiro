import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { NewTaskLinkedOverride } from '../utils/newTaskLinkedContext';

type NewTaskLinkedContextValue = {
  linkedOverride: NewTaskLinkedOverride | null;
  registerNewTaskLinkedOverride: (value: NewTaskLinkedOverride | null) => void;
};

const NewTaskLinkedContext = createContext<NewTaskLinkedContextValue>({
  linkedOverride: null,
  registerNewTaskLinkedOverride: () => {},
});

export const NewTaskLinkedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [linkedOverride, setLinkedOverride] = useState<NewTaskLinkedOverride | null>(null);
  const registerNewTaskLinkedOverride = useCallback((value: NewTaskLinkedOverride | null) => {
    setLinkedOverride(value);
  }, []);

  const value = useMemo(
    () => ({ linkedOverride, registerNewTaskLinkedOverride }),
    [linkedOverride, registerNewTaskLinkedOverride],
  );

  return <NewTaskLinkedContext.Provider value={value}>{children}</NewTaskLinkedContext.Provider>;
};

export function useNewTaskLinkedContext(): NewTaskLinkedContextValue {
  return useContext(NewTaskLinkedContext);
}
