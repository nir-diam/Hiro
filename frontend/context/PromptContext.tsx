import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';

export interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    template: string;
    model: string;
    temperature: number;
    variables: string[];
    category: 'candidates' | 'jobs' | 'companies' | 'communications' | 'analysis' | 'chatbots' | 'other';
    createdAt?: string;
    updatedAt?: string;
    comments?: string;
}

interface PromptContextType {
    prompts: PromptTemplate[];
    isLoading: boolean;
    addPrompt: (prompt: PromptTemplate) => Promise<PromptTemplate>;
    updatePrompt: (id: string, updates: Partial<PromptTemplate>) => Promise<PromptTemplate>;
    deletePrompt: (id: string) => Promise<void>;
    resetToDefaults: () => Promise<void>;
    getPromptContent: (id: string, variables: Record<string, string>) => { text: string; model: string; temperature: number };
}

const PromptContext = createContext<PromptContextType | undefined>(undefined);
const apiBase = import.meta.env.VITE_API_BASE || '';

const fetchPrompts = async () => {
    const res = await fetch(`${apiBase}/api/prompts`);
    if (!res.ok) throw new Error('Failed to load prompts');
    return res.json();
};

export const PromptProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadPrompts = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchPrompts();
            setPrompts(data);
        } catch (err) {
            console.error('Failed to load prompts', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPrompts();
    }, [loadPrompts]);

    const addPrompt = useCallback(async (prompt: PromptTemplate) => {
        const res = await fetch(`${apiBase}/api/prompts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prompt),
        });
        if (!res.ok) throw new Error('Failed to create prompt');
        const created = await res.json();
        setPrompts((prev) => [...prev, created]);
        return created;
    }, []);

    const updatePrompt = useCallback(async (id: string, updates: Partial<PromptTemplate>) => {
        const res = await fetch(`${apiBase}/api/prompts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update prompt');
        const updated = await res.json();
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
    }, []);

    const deletePrompt = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase}/api/prompts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete prompt');
        setPrompts((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const resetToDefaults = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/prompts/reset`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to reset prompts');
            const data = await res.json();
            setPrompts(data);
        } catch (err) {
            console.error('Failed to reset prompts', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const getPromptContent = useCallback(
        (id: string, variableMap: Record<string, string>) => {
            const prompt = prompts.find((p) => p.id === id);
            if (!prompt) {
                console.error(`Prompt ${id} not found`);
                return { text: '', model: 'gemini-3-flash-preview', temperature: 0.5 };
            }
            let text = prompt.template;
            if (variableMap) {
                Object.entries(variableMap).forEach(([key, value]) => {
                    const regex = new RegExp(`{{${key}}}`, 'g');
                    text = text.replace(regex, value || '');
                });
            }
            return { text, model: prompt.model, temperature: prompt.temperature };
        },
        [prompts],
    );

    const value = useMemo(
        () => ({
            prompts,
            isLoading,
            addPrompt,
            updatePrompt,
            deletePrompt,
            resetToDefaults,
            getPromptContent,
        }),
        [prompts, isLoading, addPrompt, updatePrompt, deletePrompt, resetToDefaults, getPromptContent],
    );

    return <PromptContext.Provider value={value}>{children}</PromptContext.Provider>;
};

export const usePrompts = () => {
    const context = useContext(PromptContext);
    if (context === undefined) {
        throw new Error('usePrompts must be used within a PromptProvider');
    }
    return context;
};

