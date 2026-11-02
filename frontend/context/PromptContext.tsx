import React, { createContext, useState, useContext, ReactNode, useMemo, useCallback, useEffect } from 'react';
import { authHeaders } from '../utils/authHeaders';
import { useAuth } from './AuthContext';

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

const promptsFetchCache = new Map<string, Promise<PromptTemplate[]>>();

const promptRequestInit = (json = false): RequestInit => ({
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...authHeaders(json) },
});

const fetchPrompts = async () => {
    const cacheKey = apiBase || '_default';
    const cached = promptsFetchCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async () => {
        const res = await fetch(`${apiBase}/api/prompts`, promptRequestInit());
        if (!res.ok) {
            promptsFetchCache.delete(cacheKey);
            throw new Error('Failed to load prompts');
        }
        return res.json();
    })();
    promptsFetchCache.set(cacheKey, promise);
    promise.catch(() => promptsFetchCache.delete(cacheKey));
    return promise;
};

export const PromptProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { ready, canPage } = useAuth();
    const canAdminPrompts = canPage('page:admin');
    const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadPrompts = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchPrompts();
            setPrompts(data);
        } catch (err) {
            console.error('Failed to load prompts', err);
            setPrompts([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!ready) return;
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token || !canAdminPrompts) {
            setPrompts([]);
            setIsLoading(false);
            promptsFetchCache.delete(apiBase || '_default');
            return;
        }
        void loadPrompts();
    }, [ready, canAdminPrompts, loadPrompts]);

    const addPrompt = useCallback(async (prompt: PromptTemplate) => {
        const res = await fetch(`${apiBase}/api/prompts`, {
            ...promptRequestInit(true),
            method: 'POST',
            body: JSON.stringify(prompt),
        });
        if (!res.ok) throw new Error('Failed to create prompt');
        const created = await res.json();
        promptsFetchCache.delete(apiBase || '_default');
        setPrompts((prev) => [...prev, created]);
        return created;
    }, []);

    const updatePrompt = useCallback(async (id: string, updates: Partial<PromptTemplate>) => {
        const res = await fetch(`${apiBase}/api/prompts/${id}`, {
            ...promptRequestInit(true),
            method: 'PUT',
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update prompt');
        const updated = await res.json();
        promptsFetchCache.delete(apiBase || '_default');
        setPrompts((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
    }, []);

    const deletePrompt = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase}/api/prompts/${id}`, {
            ...promptRequestInit(),
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete prompt');
        promptsFetchCache.delete(apiBase || '_default');
        setPrompts((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const resetToDefaults = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/prompts/reset`, {
                ...promptRequestInit(),
                method: 'POST',
            });
            if (!res.ok) throw new Error('Failed to reset prompts');
            const data = await res.json();
            promptsFetchCache.delete(apiBase || '_default');
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
                return { text: '', model: 'gemini-3.8-flash', temperature: 0.5 };
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

