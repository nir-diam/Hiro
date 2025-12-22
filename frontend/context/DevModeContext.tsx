
import React, { createContext, useState, useContext, ReactNode } from 'react';

interface DevModeContextType {
    isDevMode: boolean;
    toggleDevMode: () => void;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

export const DevModeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isDevMode, setIsDevMode] = useState(false);

    const toggleDevMode = () => {
        setIsDevMode(prev => !prev);
    };

    return (
        <DevModeContext.Provider value={{ isDevMode, toggleDevMode }}>
            {children}
        </DevModeContext.Provider>
    );
};

export const useDevMode = () => {
    const context = useContext(DevModeContext);
    if (context === undefined) {
        throw new Error('useDevMode must be used within a DevModeProvider');
    }
    return context;
};
