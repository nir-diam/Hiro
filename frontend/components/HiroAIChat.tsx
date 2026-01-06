
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PaperAirplaneIcon, SparklesIcon, UserCircleIcon, ArrowPathIcon, MicrophoneIcon, StopIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from './Icons';

interface Message {
    role: 'user' | 'model';
    text: string;
}

interface HiroAIChatProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    tagsText?: string;
    skipHistory?: boolean;
    initialMessage?: string;
    chatType?: string; // distinguish chat contexts (e.g., candidate-profile vs admin)
    systemPrompt?: string; // override system prompt per context
    contextData?: any; // optional profile context JSON
    onProfileUpdate?: (patch: any) => void; // optional profile updater callback
}

const SimpleMarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
    const html = useMemo(() => {
        const lines = text.split('\n');
        const elements: string[] = [];
        let inList = false;

        lines.forEach(line => {
            let processedLine = line
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

            if (processedLine.trim().startsWith('* ') || processedLine.trim().startsWith('- ')) {
                if (!inList) {
                    elements.push('<ul>');
                    inList = true;
                }
                elements.push(`<li>${processedLine.replace(/^\s*[-*]\s*/, '')}</li>`);
            } else {
                if (inList) {
                    elements.push('</ul>');
                    inList = false;
                }
                if (processedLine.trim() !== '') {
                    elements.push(`<p>${processedLine}</p>`);
                }
            }
        });

        if (inList) {
            elements.push('</ul>');
        }

        return elements.join('');
    }, [text]);

    return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
};


const HiroAIChat: React.FC<HiroAIChatProps> = ({
    isOpen,
    onClose,
    userId,
    tagsText,
    skipHistory,
    initialMessage,
    chatType,
    systemPrompt,
    contextData,
    onProfileUpdate,
}) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatId, setChatId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(undefined);
    const [isListening, setIsListening] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const chatScope = chatType || 'default';

    // Tag suggestions modal state
    const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
    const [isSuggestOpen, setIsSuggestOpen] = useState(false);
    const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false);
    const [selectedTagIdx, setSelectedTagIdx] = useState<Set<number>>(new Set());
    const [profileSuggestions, setProfileSuggestions] = useState<any[]>([]);
    const [selectedProfileIdx, setSelectedProfileIdx] = useState<Set<number>>(new Set());
    const [isProfileSuggestOpen, setIsProfileSuggestOpen] = useState(false);
    const [isProfileSuggestLoading, setIsProfileSuggestLoading] = useState(false);

    // Draggable & Resizable State
    const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Initial position: Bottom Left if not set
            if (!position) {
                const width = isExpanded ? 800 : 450;
                const height = isExpanded ? 800 : 600;
                // Calculate safe initial position (e.g. bottom left with padding)
                // We use window.innerHeight to place it near bottom
                setPosition({ 
                    x: 20, 
                    y: Math.max(20, window.innerHeight - height - 20) 
                });
            }
            
            // Scroll to bottom
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [messages, isLoading, isOpen, isExpanded]);

    // Auto-resize Textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`; // Max height 120px
        }
    }, [input]);

    // Draggable Logic
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!position) return;
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPosition({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    // Speech Recognition Setup
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = 'he-IL';

            recognitionRef.current.onresult = (event: any) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        setInput(prev => prev + event.results[i][0].transcript);
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech Recognition Error", event.error);
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert("הדפדפן שלך לא תומך בזיהוי דיבור.");
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
        } else {
            setIsListening(true);
            recognitionRef.current.start();
        }
    };
    
    useEffect(() => {
        // Try to resolve userId from props; fallback to localStorage (herouser first, then user)
        if (userId) {
            setResolvedUserId(userId);
            return;
        }
        try {
            const rawHero = localStorage.getItem('herouser');
            const rawUser = localStorage.getItem('user');
            const parsedHero = rawHero ? JSON.parse(rawHero) : null;
            const parsedUser = rawUser ? JSON.parse(rawUser) : null;
            const id =
                parsedHero?._id || parsedHero?.id ||
                parsedUser?._id || parsedUser?.id;
            if (id) setResolvedUserId(id);
        } catch (e) {
            console.warn('Failed to parse user from localStorage', e);
        }
    }, [userId]);

    // Load latest history when chat opens and user resolved (unless skipping history)
    useEffect(() => {
        const loadHistory = async () => {
            if (!isOpen) return;
            if (skipHistory) {
                setChatId(null);
                setMessages(initialMessage ? [{ role: 'model', text: initialMessage }] : []);
                return;
            }
            if (!resolvedUserId) return;
            setIsLoading(true);
            setError(null);
            try {
                // Try server-side latest (scoped by chatType if backend supports query)
                const res = await fetch(`${apiBase}/api/chat/user/${resolvedUserId}/latest${chatScope ? `?chatType=${encodeURIComponent(chatScope)}` : ''}`);
                if (res.ok) {
                    const data = await res.json();
                    const mapped = (data.messages || []).map((m: any) => ({
                        role: m.role === 'model' ? 'model' : 'user',
                        text: m.text,
                    })) as Message[];
                    setChatId(data.chatId);
                    localStorage.setItem(`hiroChatId:${resolvedUserId}:${chatScope}`, data.chatId);
                    setMessages(mapped);
                    return;
                }
                // Fallback to stored chatId
                const saved = localStorage.getItem(`hiroChatId:${resolvedUserId}:${chatScope}`);
                if (saved) {
                    const res2 = await fetch(`${apiBase}/api/chat/${saved}`);
                    if (res2.ok) {
                        const data2 = await res2.json();
                        const mapped2 = (data2.messages || []).map((m: any) => ({
                            role: m.role === 'model' ? 'model' : 'user',
                            text: m.text,
                        })) as Message[];
                        setChatId(saved);
                        setMessages(mapped2);
                        return;
                    }
                }
                // Otherwise start empty
                setMessages([]);
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינת היסטוריה');
            } finally {
                setIsLoading(false);
            }
        };
        loadHistory();
    }, [isOpen, resolvedUserId, skipHistory, initialMessage, chatType]);

    const handleSend = async () => {
        if (!input.trim()) return;
        if (isListening) recognitionRef.current.stop();
        const userMessage: Message = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);
        const apiBase = import.meta.env.VITE_API_BASE || '';
        const chatScope = chatType || 'default';
        try {
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, userId: resolvedUserId, message: input, tagsText, chatType: chatScope, contextData, systemPrompt }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Chat failed');
            }
            const data = await res.json();
            setChatId(data.chatId);

            // Extract profile suggestions (any model message with a JSON array)
            const allModels = (data.messages || []).filter((m: any) => m.role === 'model');
            let parsedArray: any[] | null = null;
            for (let i = allModels.length - 1; i >= 0; i--) {
                const candidate = parseJsonBlock(allModels[i]?.text || '');
                if (Array.isArray(candidate)) {
                    parsedArray = candidate;
                    break;
                }
            }
            if (parsedArray && parsedArray.length) {
                const cleaned = parsedArray
                    .map((s: any) => ({
                        field: s.field,
                        value: s.value,
                        reason: s.reason || '',
                    }))
                    .filter((s: any) => s.field && s.value);
                if (cleaned.length) {
                    setProfileSuggestions(cleaned);
                    setSelectedProfileIdx(new Set(cleaned.map((_, i) => i)));
                    setIsProfileSuggestOpen(true);
                    setMessages(prev => [...prev, { role: 'model', text: 'הצעות שיפור מוכנות – בחר וסמן בחלון ההצעות.' }]);
                }
            }

            const cleanedMessages = (data.messages || []).map((m: any) =>
                m.role === 'model' ? { ...m, text: sanitizeModelText(m.text) } : m
            );
            setMessages(cleanedMessages);

            // Parse AI suggestions for tags (expects JSON block with "tags": [...])
            const lastModel = (data.messages || []).slice().reverse().find((m: any) => m.role === 'model');
            if (lastModel?.text) {
                const parsed = parseTagSuggestions(lastModel.text);
                if (parsed.length) {
                    setTagSuggestions(parsed);
                    setSelectedTagIdx(new Set(parsed.map((_, idx) => idx)));
                    setIsSuggestOpen(true);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Chat failed');
        } finally {
            setIsLoading(false);
        }
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset height
    };

    const ensureArray = (val: any) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
                return [val];
            } catch {
                return [val];
            }
        }
        return [];
    };

    const parseJsonBlock = (text: string) => {
        if (!text) return null;
        const fenced = text.match(/```json([\s\S]*?)```/);
        if (fenced) {
            try { return JSON.parse(fenced[1]); } catch {}
        }
        // Try direct JSON parse
        try { return JSON.parse(text); } catch {}
        // Try to extract first array/object substring
        const firstArray = text.indexOf('[');
        if (firstArray !== -1) {
            const lastArray = text.lastIndexOf(']');
            if (lastArray > firstArray) {
                const candidate = text.slice(firstArray, lastArray + 1);
                try { return JSON.parse(candidate); } catch {}
            }
        }
        const firstObj = text.indexOf('{');
        if (firstObj !== -1) {
            const lastObj = text.lastIndexOf('}');
            if (lastObj > firstObj) {
                const candidate = text.slice(firstObj, lastObj + 1);
                try { return JSON.parse(candidate); } catch {}
            }
        }
        return null;
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    const cleanName = (val: string) => (val || '').replace(/[*•]/g, '').trim();

    const sanitizeModelText = (text: string) => {
        if (!text) return '';
        const trimmed = text.trim();
        // If it looks like JSON, replace with friendly note
        if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.includes('```json')) {
            return 'הצעות שיפור מוכנות – בדוק את חלון ההצעות.';
        }
        const withoutFences = text.replace(/```json[\s\S]*?```/g, '').trim();
        if (withoutFences && withoutFences !== text) return withoutFences || 'הצעות שיפור מוכנות – בדוק את חלון ההצעות.';
        const withoutBraces = text.replace(/\{[\s\S]*?\}/g, '').trim();
        if (withoutBraces && withoutBraces !== text) return withoutBraces || 'הצעות שיפור מוכנות – בדוק את חלון ההצעות.';
        return trimmed || 'הצעות שיפור מוכנות – בדוק את חלון ההצעות.';
    };
    const slugifyTagKey = (val: string) => {
        const slug = (val || '')
            .toLowerCase()
            .replace(/[^a-z0-9א-ת]+/gi, '_')
            .replace(/_{2,}/g, '_')
            .replace(/^_+|_+$/g, '');
        return slug || 'tag';
    };

    const parseTagSuggestions = (text: string) => {
        // Try JSON first
        const match = text.match(/```json([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                const jsonText = match[1] ? match[1] : match[0];
                const parsed = JSON.parse(jsonText);
                const tags = Array.isArray(parsed?.tags) ? parsed.tags : Array.isArray(parsed) ? parsed : [];
                return tags
                    .map((t: any) => ({
                        displayNameHe: cleanName(t.displayNameHe || t.name || t.value || ''),
                        displayNameEn: cleanName(t.displayNameEn || ''),
                        category: t.category || '',
                        type: t.type || 'skill',
                        synonyms: Array.isArray(t.synonyms) ? t.synonyms : [],
                        tagKey: slugifyTagKey(t.tagKey || t.displayNameEn || t.displayNameHe || 'tag')
                    }))
                    .filter((t: any) => t.displayNameHe || t.displayNameEn);
            } catch {
                /* fallthrough to heuristic */
            }
        }

        // Heuristic: parse numbered/bulleted lines like "1. Foo (Category) – description"
        const lines = text.split('\n');
        // Allow bullets or numbered lines, optional (category), optional dash/description
        const regex = /^\s*(?:[-*•]|\d+[.)])\s*([^()\n]+?)(?:\s*\(([^)]+)\))?(?:\s*[–—-].*)?$/;
        const simpleNumbered = /^\s*\d+\.\s*(.+)$/;
        const parsed: any[] = [];
        for (const l of lines) {
            if (l.toLowerCase().includes('טיפ קטן')) continue;
            const m = l.match(regex);
            const sn = !m ? l.match(simpleNumbered) : null;
            let name = '';
            let category = '';
            if (m) {
                name = cleanName(m[1] || '');
                name = name.split('–')[0].split('—')[0].split('-')[0].trim();
                category = (m[2] || '').trim();
            } else if (sn) {
                const raw = cleanName(sn[1] || '');
                // split off dash/description and optional parens
                const dashSplit = raw.split(/[–—-]/)[0].trim();
                const parenMatch = dashSplit.match(/^(.+?)\s*\(([^)]+)\)/);
                if (parenMatch) {
                    name = parenMatch[1].trim();
                    category = parenMatch[2].trim();
                } else {
                    name = dashSplit;
                }
            } else {
                continue;
            }
            if (!name || name.length < 2) continue;
            parsed.push({
                displayNameHe: name,
                displayNameEn: '',
                category,
                type: 'role',
                synonyms: [],
                tagKey: slugifyTagKey(name),
            });
        }
        return parsed;
    };

    const toggleTagSelection = (idx: number) => {
        setSelectedTagIdx(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const applyTagSuggestions = async () => {
        if (!tagSuggestions.length) {
            setIsSuggestOpen(false);
            return;
        }
        setIsApplyingSuggestions(true);
        let firstError: string | null = null;
        const created: any[] = [];
        for (let i = 0; i < tagSuggestions.length; i++) {
            if (!selectedTagIdx.has(i)) continue;
            const t = tagSuggestions[i];
            try {
                const res = await fetch(`${apiBase}/api/tags`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            displayNameHe: t.displayNameHe,
                            displayNameEn: t.displayNameEn,
                            category: t.category,
                            type: t.type || 'skill',
                            status: 'active',
                            qualityState: 'verified',
                            matchable: true,
                            tagKey: slugifyTagKey(t.tagKey || t.displayNameEn || t.displayNameHe || 'tag'),
                            synonyms: t.synonyms || [],
                            domains: t.domains || [],
                        }),
                });
                if (!res.ok) throw new Error(await res.text());
                const createdTag = await res.json();
                created.push(createdTag);
            } catch (err: any) {
                if (!firstError) firstError = err?.message || 'Failed to create tag';
            }
        }
        setIsApplyingSuggestions(false);
        setIsSuggestOpen(false);
        setTagSuggestions([]);
        setSelectedTagIdx(new Set());
        if (created.length) {
            window.dispatchEvent(new CustomEvent('hiro-tags-created', { detail: created }));
        }
        if (firstError) alert(firstError);
        else if (created.length) alert('Tags created successfully.');
    };

    const requestProfileSuggestions = async (mode: 'default' | 'soft' = 'default') => {
        if (!contextData) {
            alert('אין נתוני פרופיל זמינים כרגע.');
            return;
        }
        setIsProfileSuggestLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId,
                    userId: resolvedUserId,
                    chatType: chatScope,
                    contextData,
                    systemPrompt,
                    message: mode === 'soft'
                        ? `נתח את ה-JSON של פרופיל המועמד והצע עד 8 שיפורים קצרים המתמקדים במיומנויות רכות (tags), תקציר מקצועי וניסיון תעסוקתי.\nהחזר אך ורק JSON תקין, ללא טקסט נוסף, ללא Markdown, ללא bullet points.\nמבנה חובה (מערך):\n[\n  { "field": "tags|professionalSummary|workExperience", "value": "string or array", "reason": "string (<=140 chars)" }\n]\nהקפד שהתוויות tags יהיו מערך של מחרוזות. שמור על עברית ותמציתיות. אל תוסיף כלום מעבר ל-JSON.`
                        : `נתח את ה-JSON של פרופיל המועמד והצע עד 10 שיפורים קצרים בתחומים: תפקיד/כותרת, תקציר מקצועי, ניסיון תעסוקתי, העדפות/תחומי עניין, ציפיות שכר, מיומנויות רכות, מיומנויות טכניות, הערות מועמד, תגיות.\nהחזר אך ורק JSON תקין, ללא טקסט נוסף, ללא Markdown, ללא bullet points.\nמבנה חובה (מערך):\n[\n  { "field": "title|professionalSummary|workExperience|preferences|interests|salaryMin|salaryMax|softSkills|techSkills|candidateNotes|tags|desiredRoles|location|availability", "value": "string or array", "reason": "string (<=140 chars)" }\n]\nאם value הוא מערך – החזר מערך מחרוזות; אם טקסט – מחרוזת בלבד. שמור על עברית ותמציתיות. אל תוסיף כלום מעבר ל-JSON.`
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const allModels = (data.messages || []).filter((m: any) => m.role === 'model');
            let parsedArray: any[] | null = null;
            for (let i = allModels.length - 1; i >= 0; i--) {
                const candidate = parseJsonBlock(allModels[i]?.text || '');
                if (Array.isArray(candidate)) {
                    parsedArray = candidate;
                    break;
                }
            }
            const arr = parsedArray || [];
            const cleaned = arr
                .map((s: any) => ({
                    field: s.field,
                    value: s.value,
                    reason: s.reason || '',
                }))
                .filter((s: any) => s.field && s.value);
            if (!cleaned.length) {
                alert('לא נמצאו הצעות שיפור מהמודל (JSON לא זוהה).');
                return;
            }
            setProfileSuggestions(cleaned);
            setSelectedProfileIdx(new Set(cleaned.map((_, i) => i)));
            setIsProfileSuggestOpen(true);
            setChatId(data.chatId || chatId);
            setMessages(prev => [...prev, { role: 'model', text: 'הצעות שיפור מוכנות – בחר וסמן בחלון ההצעות.' }]);
        } catch (e: any) {
            setError(e.message || 'שגיאה בבקשת הצעות פרופיל');
        } finally {
            setIsProfileSuggestLoading(false);
        }
    };

    const triggerProfileSuggestions = (emitChat = false, mode: 'default' | 'soft' = 'default') => {
        if (emitChat) {
            setMessages(prev => [...prev, { role: 'model', text: 'בודק את הפרופיל ומכין הצעות שיפור...' }]);
        }
        requestProfileSuggestions(mode);
    };

    const toggleProfileSuggestion = (idx: number) => {
        setSelectedProfileIdx(prev => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });
    };

    const applyProfileSuggestions = () => {
        if (!onProfileUpdate) {
            setIsProfileSuggestOpen(false);
            return;
        }
        const current = contextData || {};
        const patch: any = {};

        const skillNames = (list: any) =>
            ensureArray(list)
                .map((v: any) => {
                    if (typeof v === 'string') return v;
                    if (v && typeof v === 'object') return v.name || v.value || '';
                    return '';
                })
                .filter(Boolean);

        const mergeStringArray = (field: string, value: any) => {
            const incomingRaw = ensureArray(value);
            const existingRaw = patch[field] !== undefined
                ? ensureArray(patch[field])
                : ensureArray(current[field]);
            const incoming =
                field === 'techSkills' || field === 'softSkills'
                    ? skillNames(incomingRaw)
                    : incomingRaw.map((v: any) => (typeof v === 'string' ? v : String(v || ''))).filter(Boolean);
            const existing =
                field === 'techSkills' || field === 'softSkills'
                    ? skillNames(existingRaw)
                    : existingRaw.map((v: any) => (typeof v === 'string' ? v : String(v || ''))).filter(Boolean);
            const combined = Array.from(new Set([...existing, ...incoming]));
            patch[field] = combined;
            return combined;
        };

        profileSuggestions.forEach((s, idx) => {
            if (!selectedProfileIdx.has(idx)) return;
            const field = s.field;
            const value = s.value;
            if (!field || value === undefined || value === null) return;

            switch (field) {
                case 'tags':
                case 'softSkills':
                case 'techSkills':
                case 'desiredRoles':
                    mergeStringArray(field, value);
                    break;
                case 'workExperience': {
                    const list = Array.isArray(current.workExperience) ? [...current.workExperience] : [];
                    if (Array.isArray(value)) {
                        value.forEach((v: any) => {
                            if (v && typeof v === 'object') list.push({ ...v, id: v.id || Date.now() + Math.random() });
                            else if (typeof v === 'string') list.push({ id: Date.now() + Math.random(), title: '', company: '', description: v, startDate: '', endDate: 'Present' });
                        });
                    } else if (typeof value === 'string') {
                        list.push({ id: Date.now() + Math.random(), title: '', company: '', description: value, startDate: '', endDate: 'Present' });
                    }
                    patch.workExperience = list;
                    break;
                }
                case 'salaryMin':
                case 'salaryMax':
                    patch[field] = Number(value) || 0;
                    break;
                default:
                    patch[field] = value;
            }
        });

        // Keep skills object in sync with soft/tech skills
        const combinedSoft = patch.softSkills || ensureArray(current.softSkills);
        const combinedTech = patch.techSkills || ensureArray(current.techSkills);
        patch.skills = {
            soft: combinedSoft,
            technical: combinedTech,
        };

        if (Object.keys(patch).length === 0) {
            setIsProfileSuggestOpen(false);
            return;
        }
        onProfileUpdate(patch);
        setIsProfileSuggestOpen(false);
        setProfileSuggestions([]);
        setSelectedProfileIdx(new Set());
        alert('הפרופיל עודכן לפי ההצעות שנבחרו.');
    };

    if (!isOpen || !position) return null;

    const dimensionsClass = isExpanded 
        ? 'w-[90vw] md:w-[800px] h-[80vh] md:h-[800px]' 
        : 'w-[90vw] md:w-[450px] h-[60vh] md:h-[600px]';

    return createPortal(
        <div 
            className={`fixed bg-bg-card rounded-2xl shadow-2xl border border-border-default z-[9999] flex flex-col overflow-hidden transition-[width,height] duration-200 ease-in-out ${dimensionsClass}`}
            style={{ 
                left: position.x, 
                top: position.y,
                // Add a subtle scale effect when initially opening
                animation: 'popup 0.3s cubic-bezier(0.16, 1, 0.3, 1)' 
            }}
        >
            <header 
                className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0 bg-bg-card/95 backdrop-blur-sm cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-primary-500"/>
                    <h2 className="text-lg font-bold text-text-default">Hiro AI Assistant</h2>
                </div>
                <div className="flex items-center gap-2" onMouseDown={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)} 
                        title={isExpanded ? "הקטן חלון" : "הגדל חלון"} 
                        className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors"
                    >
                        {isExpanded ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
                    </button>
                        <button
                        onClick={() => { 
                            setMessages([]); 
                            setChatId(null); 
                            setError(null); 
                            if (resolvedUserId) localStorage.removeItem(`hiroChatId:${resolvedUserId}:${chatType || 'default'}`);
                        }} 
                        title="אתחול שיחה" 
                        className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors">
                        <ArrowPathIcon className="w-5 h-5" />
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-subtle/30 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-text-muted opacity-60 select-none">
                        <SparklesIcon className="w-12 h-12 mb-2"/>
                        <p>במה אפשר לעזור לך היום?</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'model' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-primary-100 rounded-full select-none"><SparklesIcon className="w-5 h-5 text-primary-600"/></div>}
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-white border border-border-default text-text-default rounded-bl-none'}`}>
                            {msg.role === 'model' ? <SimpleMarkdownRenderer text={msg.text} /> : <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>
                        {msg.role === 'user' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-bg-subtle rounded-full border border-border-default select-none"><UserCircleIcon className="w-6 h-6 text-text-muted"/></div>}
                    </div>
                ))}
                {isLoading && (
                        <div className="flex items-start gap-3">
                        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-primary-100 rounded-full"><SparklesIcon className="w-5 h-5 text-primary-600"/></div>
                        <div className="max-w-[80%] p-3 rounded-2xl text-sm bg-white border border-border-default text-text-default rounded-bl-none flex items-center gap-2">
                            <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></span>
                            <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></span>
                            <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></span>
                        </div>
                    </div>
                )}
                    {error && (
                    <div className="p-3 bg-red-100 text-red-700 text-sm rounded-lg">{error}</div>
                    )}
                <div ref={messagesEndRef} />
            </main>

            <footer className="p-3 bg-bg-card border-t border-border-default flex-shrink-0">
                <div className="flex items-end gap-2 flex-wrap">
                    <div className="relative flex-grow bg-bg-input border border-border-default rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 transition-all min-w-[220px]">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={isListening ? "מקשיב..." : "שאל אותי משהו..."}
                            className={`w-full bg-transparent text-text-default text-sm py-3 pl-10 pr-4 outline-none resize-none max-h-[120px] min-h-[44px] overflow-y-auto custom-scrollbar`}
                            disabled={isLoading}
                            rows={1}
                        />
                        <button 
                            onClick={toggleListening}
                            title={isListening ? "הפסק הקלטה" : "דבר אליי"}
                            className={`absolute left-2 bottom-2 p-1.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-text-subtle hover:bg-bg-subtle hover:text-primary-600'}`}
                        >
                            {isListening ? <StopIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex items-end gap-2">
                        <button 
                            onClick={handleSend} 
                            disabled={isLoading || (!input.trim() && !isListening)} 
                            className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-primary-600 text-white rounded-full hover:bg-primary-700 transition disabled:bg-primary-300 disabled:cursor-not-allowed shadow-md mb-0.5"
                        >
                            <PaperAirplaneIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => triggerProfileSuggestions(true)}
                            disabled={isProfileSuggestLoading || isLoading}
                            className="px-3 py-2 text-sm font-semibold border border-border-default rounded-lg bg-white hover:bg-bg-subtle text-text-muted disabled:opacity-60"
                        >
                            {isProfileSuggestLoading ? 'בודק...' : 'הצעות שיפור לפרופיל'}
                        </button>
                        <button
                            onClick={() => triggerProfileSuggestions(true, 'soft')}
                            disabled={isProfileSuggestLoading || isLoading}
                            className="px-3 py-2 text-sm font-semibold border border-border-default rounded-lg bg-white hover:bg-bg-subtle text-text-muted disabled:opacity-60"
                        >
                            {isProfileSuggestLoading ? 'בודק...' : 'הצעות מיומנויות רכות'}
                        </button>
                    </div>
                </div>
            </footer>
        {isProfileSuggestOpen && (
            <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4" onClick={() => setIsProfileSuggestOpen(false)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                        <h3
                            className="text-lg font-bold text-text-default cursor-pointer"
                            onClick={() => triggerProfileSuggestions(true)}
                        >
                            הצעות לשיפור הפרופיל
                        </h3>
                        <button onClick={() => setIsProfileSuggestOpen(false)} className="p-2 rounded-full hover:bg-gray-100">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {profileSuggestions.map((s, idx) => {
                            const labelMap: Record<string, string> = {
                                title: 'כותרת/תפקיד',
                                professionalSummary: 'תקציר מקצועי',
                                workExperience: 'ניסיון תעסוקתי',
                                preferences: 'העדפות',
                                interests: 'תחומי עניין',
                                salaryMin: 'שכר מינימום',
                                salaryMax: 'שכר מקסימום',
                                softSkills: 'מיומנויות רכות',
                                techSkills: 'מיומנויות טכניות',
                                candidateNotes: 'הערות מועמד',
                                tags: 'תגיות',
                                desiredRoles: 'תפקידים מבוקשים',
                                location: 'מיקום',
                                availability: 'זמינות',
                            };
                            const displayLabel = labelMap[s.field] || s.field;
                            const value = s.value;
                            const isArray = Array.isArray(value);
                            return (
                                <label key={idx} className="flex items-start gap-3 p-3 border border-border-default rounded-xl hover:bg-bg-subtle cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedProfileIdx.has(idx)}
                                        onChange={() => toggleProfileSuggestion(idx)}
                                        className="mt-1"
                                    />
                                    <div className="space-y-1">
                                        <div className="font-bold text-text-default">{displayLabel}</div>
                                        {isArray ? (
                                            <div className="flex flex-wrap gap-1">
                                                {(value as any[]).map((v, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-bg-subtle border border-border-default rounded-full text-xs text-text-muted">
                                                        {String(v)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-text-muted break-words">{String(value)}</div>
                                        )}
                                        {s.reason && <div className="text-xs text-text-subtle">סיבה: {s.reason}</div>}
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setIsProfileSuggestOpen(false)} className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg">בטל</button>
                        <button
                            onClick={applyProfileSuggestions}
                            className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition"
                        >
                            החל הצעות נבחרות
                        </button>
                    </div>
                </div>
            </div>
        )}
            {isSuggestOpen && (
                <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4" onClick={() => setIsSuggestOpen(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-text-default">Tag suggestions from AI</h3>
                            <button onClick={() => setIsSuggestOpen(false)} className="p-2 rounded-full hover:bg-gray-100">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        {tagSuggestions.length === 0 ? (
                            <p className="text-sm text-text-muted">No suggestions found.</p>
                        ) : (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {tagSuggestions.map((t, idx) => (
                                    <label key={idx} className="flex items-start gap-3 p-3 border border-border-default rounded-xl hover:bg-bg-subtle cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={selectedTagIdx.has(idx)}
                                            onChange={() => toggleTagSelection(idx)}
                                            className="mt-1"
                                        />
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-text-default">{t.displayNameHe || t.displayNameEn}</span>
                                                <span className="text-xs text-text-muted">({t.type || 'skill'})</span>
                                            </div>
                                            {t.displayNameEn && <div className="text-xs text-text-muted">{t.displayNameEn}</div>}
                                            {t.category && <div className="text-xs text-text-muted">Category: {t.category}</div>}
                                            {t.synonyms?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 text-xs text-text-muted">
                                                    {t.synonyms.map((s: any, i: number) => (
                                                        <span key={i} className="px-2 py-0.5 bg-gray-100 rounded-full border">{s.phrase || s}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setIsSuggestOpen(false)} className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg">Cancel</button>
                            <button
                                onClick={applyTagSuggestions}
                                disabled={isApplyingSuggestions}
                                className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition disabled:bg-primary-300"
                            >
                                {isApplyingSuggestions ? 'Saving...' : 'Apply selected'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                @keyframes popup {
                    0% { opacity: 0; transform: scale(0.9) translateY(20px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                .prose ul { list-style: disc; padding-right: 1.5rem; }
                .prose p { margin: 0; }
                .prose strong { font-weight: bold; }
                /* Custom scrollbar for chat area */
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); border-radius: 20px; border: 2px solid transparent; background-clip: content-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(107, 114, 128, 0.8); }
            `}</style>
        </div>,
        document.body
    );
};

export default HiroAIChat;
