
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PaperAirplaneIcon, SparklesIcon, UserCircleIcon, ArrowPathIcon, MicrophoneIcon, StopIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from './Icons';
import {
    buildProfileSuggestionPrompt,
    enrichProfileSuggestions,
    fetchProfileValidationCatalogs,
    formatWorkExperienceSuggestionValue,
    normalizeWorkExperienceIncoming,
    parseWorkExperienceFriendlyText,
    isDuplicateWorkExperience,
    type ValidatedSuggestionItem,
    type WorkExperienceEntry,
} from '../services/profileSuggestionValidation';

interface Message {
    role: 'user' | 'model';
    text: string;
    createdAt?: string;
}

const formatMessageTimestamp = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

interface HiroAIChatProps {
    isOpen: boolean;
    onClose: () => void;
    userId?: string;
    tagsText?: string;
    skipHistory?: boolean;
    initialMessage?: string;
    chatType?: string; // distinguish chat contexts (e.g., candidate-profile vs admin)
    /** Prompt id from AI Prompts admin (`prompts` table). Defaults by chatType when omitted. */
    promptId?: string;
    systemPrompt?: string; // optional legacy override if prompt row is missing
    contextData?: any; // optional profile context JSON
    onProfileUpdate?: (patch: any, meta?: { suggestions?: any[] }) => void | Promise<void>; // optional profile updater callback
    allowTagCreation?: boolean;
}

const DEFAULT_CHAT_PROMPT_IDS: Record<string, string> = {
    'candidate-profile': 'candidate_profile_chat',
    'job-publishing': 'job_publishing_chat',
    'job-fields': 'Admin_Job_Categories_Smart_Agent',
    'company-profile': 'company_profile_chat',
    default: 'taxonomy_tags_chat',
};

const INSTRUCTION_PROMPT_KEYWORDS = [
    'נתח את ה-JSON',
    'החזר אך ורק JSON תקין',
];

const isInstructionPrompt = (message: any) => {
    if (!message || message.role !== 'user' || typeof message.text !== 'string') return false;
    return INSTRUCTION_PROMPT_KEYWORDS.every(keyword => message.text.includes(keyword));
};

const getCandidateFirstName = (contextData?: any) => {
    const fullName = String(contextData?.fullName || '').trim();
    if (!fullName) return 'חבר';
    return fullName.split(/\s+/)[0] || 'חבר';
};

const buildCandidateWelcomeText = (contextData?: any) => {
    const firstName = getCandidateFirstName(contextData);
    return `היי ${firstName}, אני הירו, הסוכן האישי שלך, איך אני יכול לעזור לך לשדרג את הפרופיל היום?`;
};

const isCandidateWelcomeMessage = (msg?: Message | null) =>
    !!msg &&
    msg.role === 'model' &&
    typeof msg.text === 'string' &&
    msg.text.includes('אני הירו, הסוכן האישי שלך');

const buildCandidateWelcomeMessage = (contextData?: any, createdAt?: string): Message => ({
    role: 'model',
    text: buildCandidateWelcomeText(contextData),
    createdAt: createdAt || new Date().toISOString(),
});

type SuggestedPrompt = { text: string; comingSoon?: boolean };

const CANDIDATE_SUGGESTED_PROMPT_GROUPS: { title: string; prompts: SuggestedPrompt[] }[] = [
    {
        title: 'שדרוג הפרופיל וקורות החיים',
        prompts: [
            { text: 'תעזור לי לנסח פסקת תקציר אטרקטיבית לפרופיל שלי' },
            { text: 'איך אני יכול לשפר את קורות החיים שלי כדי לבלוט יותר?' },
            { text: 'אילו כישורים כדאי לי להוסיף לפרופיל כדי להתאים למשרות ניהול?' },
            { text: 'תעזור לי לתרגם את קורות החיים שלי לאנגלית' },
        ],
    },
    {
        title: 'הכנה לראיונות ותהליכים',
        prompts: [
            { text: 'אילו שאלות נפוצות שואלים בראיונות לתפקיד מנהל שיווק?' },
            { text: 'תעשה לי סימולציית ראיון קצרה לתפקיד הבא שלי' },
            { text: 'מה כדאי לי לשאול את המראיין בסוף הראיון?' },
            { text: 'איך כדאי לי להסביר פער של שנה בקורות החיים?' },
        ],
    },
    {
        title: 'התאמה למשרות וקריירה',
        prompts: [
            { text: 'אילו משרות פתוחות כרגע יכולות להתאים לניסיון שלי?', comingSoon: true },
            { text: 'האם הפרופיל שלי מספיק חזק למשרת דירקטור שיווק?' },
            { text: 'מה טווח השכר המקובל היום לתפקיד שלי בהייטק?' },
            { text: 'לאילו תפקידים נוספים כדאי לי לכוון עם הניסיון שיש לי?' },
        ],
    },
    {
        title: 'עדכון נתונים זריז',
        prompts: [
            { text: 'תוסיף לפרופיל שלי שעבדתי שנה ב-Wix בתור מנהל שיווק' },
            { text: 'תעדכן את ציפיות השכר שלי ל-25K-27K' },
            { text: 'אני מחפש עכשיו רק משרות היברידיות במרכז, תעדכן בהעדפות' },
        ],
    },
];

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
    allowTagCreation = true,
    skipHistory,
    initialMessage,
    chatType,
    promptId,
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
    const effectivePromptId = promptId || DEFAULT_CHAT_PROMPT_IDS[chatScope] || DEFAULT_CHAT_PROMPT_IDS.default;
    const isCandidateProfileChat = chatScope === 'candidate-profile';

    /** Always keep the Hiro greeting as the first bubble in candidate-profile chat (not in the input). */
    const ensureWelcomeFirst = useCallback((msgs: Message[]) => {
        if (!isCandidateProfileChat) return msgs;
        const welcomeText = buildCandidateWelcomeText(contextData);
        const rest = (msgs || []).filter((m) => !isCandidateWelcomeMessage(m));
        const priorWelcome = (msgs || []).find(isCandidateWelcomeMessage);
        return [
            buildCandidateWelcomeMessage(contextData, priorWelcome?.createdAt),
            ...rest,
        ].map((m, i) => (i === 0 ? { ...m, text: welcomeText } : m));
    }, [isCandidateProfileChat, contextData]);

    const hasUserMessages = useMemo(
        () => messages.some((m) => m.role === 'user'),
        [messages],
    );
    const showSuggestedPrompts = isCandidateProfileChat && !hasUserMessages && !isLoading;

    // Keep greeting text in sync when candidate name/context arrives after open
    useEffect(() => {
        if (!isOpen || !isCandidateProfileChat) return;
        setMessages((prev) => ensureWelcomeFirst(prev));
    }, [isOpen, isCandidateProfileChat, contextData?.fullName, ensureWelcomeFirst]);

    // Tag suggestions modal state
    const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
    const [isSuggestOpen, setIsSuggestOpen] = useState(false);
    const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false);
    const [selectedTagIdx, setSelectedTagIdx] = useState<Set<number>>(new Set());
    const [profileSuggestions, setProfileSuggestions] = useState<any[]>([]);
    const [selectedProfileIdx, setSelectedProfileIdx] = useState<Set<number>>(new Set());
    const [isProfileSuggestOpen, setIsProfileSuggestOpen] = useState(false);
    const [isProfileSuggestLoading, setIsProfileSuggestLoading] = useState(false);
    const [profileSuggestPosition, setProfileSuggestPosition] = useState<{ x: number; y: number } | null>(null);
    const [isProfileSuggestDragging, setIsProfileSuggestDragging] = useState(false);
    const [profileSuggestDragOffset, setProfileSuggestDragOffset] = useState({ x: 0, y: 0 });
    const [profileIntent, setProfileIntent] = useState<string>('');
    const [suggestionEdits, setSuggestionEdits] = useState<Record<number, string>>({});
    const [excludedSuggestionItems, setExcludedSuggestionItems] = useState<Record<number, Set<string>>>({});
    const validationCatalogRef = useRef<{ jobFields: any[]; approvedTags: any[] } | null>(null);

    const loadValidationCatalogs = useCallback(async () => {
        if (validationCatalogRef.current) return validationCatalogRef.current;
        const catalogs = await fetchProfileValidationCatalogs(apiBase);
        validationCatalogRef.current = catalogs;
        return catalogs;
    }, [apiBase]);

    const finalizeProfileSuggestions = useCallback(async (rawSuggestions: any[]) => {
        const cleaned = rawSuggestions
            .map((s: any) => normalizeProposalSuggestion(s))
            .filter((s: any) => s && (s.field || s.tool) && s.value);

        if (!contextData || chatScope !== 'candidate-profile') {
            return cleaned;
        }

        const { jobFields, approvedTags } = await loadValidationCatalogs();
        return enrichProfileSuggestions(cleaned, contextData, jobFields, approvedTags);
    }, [contextData, chatScope, loadValidationCatalogs]);

    const openProfileSuggestions = useCallback((suggestions: any[], intent = '') => {
        if (!suggestions.length) return;
        setProfileSuggestions(suggestions);
        setSuggestionEdits({});
        setExcludedSuggestionItems({});
        setProfileIntent(intent);
        setSelectedProfileIdx(new Set(suggestions.map((_, i) => i)));
        setIsProfileSuggestOpen(true);
    }, []);

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

    useEffect(() => {
        const handleProfileMouseMove = (e: MouseEvent) => {
            if (isProfileSuggestDragging) {
                setProfileSuggestPosition({
                    x: e.clientX - profileSuggestDragOffset.x,
                    y: e.clientY - profileSuggestDragOffset.y,
                });
            }
        };

        const handleProfileMouseUp = () => {
            setIsProfileSuggestDragging(false);
        };

        if (isProfileSuggestDragging) {
            window.addEventListener('mousemove', handleProfileMouseMove);
            window.addEventListener('mouseup', handleProfileMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleProfileMouseMove);
            window.removeEventListener('mouseup', handleProfileMouseUp);
        };
    }, [isProfileSuggestDragging, profileSuggestDragOffset]);

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
                const seed = initialMessage
                    ? [{ role: 'model' as const, text: initialMessage, createdAt: new Date().toISOString() }]
                    : [];
                setMessages(ensureWelcomeFirst(seed));
                return;
            }
            if (!resolvedUserId) {
                if (isCandidateProfileChat) {
                    setMessages(ensureWelcomeFirst([]));
                }
                return;
            }
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/api/chat/user/${resolvedUserId}/latest${chatScope ? `?chatType=${encodeURIComponent(chatScope)}` : ''}`);
                if (res.ok) {
                    const data = await res.json();
                    const mapped = prepareMessagesForDisplay(data.messages || []);
                    setChatId(data.chatId);
                    localStorage.setItem(`hiroChatId:${resolvedUserId}:${chatScope}`, data.chatId);
                    setMessages(ensureWelcomeFirst(mapped));
                    return;
                }
                // Fallback to stored chatId
                const saved = localStorage.getItem(`hiroChatId:${resolvedUserId}:${chatScope}`);
                if (saved) {
                    const res2 = await fetch(`${apiBase}/api/chat/${saved}`);
                    if (res2.ok) {
                        const data2 = await res2.json();
                        const mapped2 = prepareMessagesForDisplay(data2.messages || []);
                        setChatId(saved);
                        setMessages(ensureWelcomeFirst(mapped2));
                        return;
                    }
                }
                setMessages(ensureWelcomeFirst([]));
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינת היסטוריה');
            } finally {
                setIsLoading(false);
            }
        };
        loadHistory();
    }, [isOpen, resolvedUserId, skipHistory, initialMessage, chatType, ensureWelcomeFirst]);

    const handleSend = async (overrideText?: string) => {
        const textToSend = (overrideText ?? input).trim();
        if (!textToSend) return;
        if (isListening) recognitionRef.current.stop();
        const userMessage: Message = { role: 'user', text: textToSend, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);
        const apiBase = import.meta.env.VITE_API_BASE || '';
        const chatScope = chatType || 'default';
        try {
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId,
                    userId: resolvedUserId,
                    message: textToSend,
                    tagsText,
                    chatType: chatScope,
                    contextData,
                    promptId: effectivePromptId,
                    systemPrompt,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Chat failed');
            }
            const data = await res.json();
            setChatId(data.chatId);
            if (resolvedUserId) {
                localStorage.setItem(`hiroChatId:${resolvedUserId}:${chatScope}`, data.chatId);
            }

            // Extract profile suggestions (any model message with a JSON array)
            const lastModelForProposals = (data.messages || [])
                .slice()
                .reverse()
                .find((m: any) => m.role === 'model');
            let parsedArray: any[] | null = null;
            let candidateIntent = '';
            if (lastModelForProposals?.text) {
                const candidate = parseJsonBlock(lastModelForProposals.text);
                parsedArray = extractProposalArray(candidate);
                candidateIntent = candidate?.intent || '';
            }
            if (!parsedArray || !parsedArray.length) {
                setProfileSuggestions([]);
                setProfileIntent('');
                setSelectedProfileIdx(new Set());
                setIsProfileSuggestOpen(false);
            }
            if (parsedArray && parsedArray.length) {
                const cleaned = await finalizeProfileSuggestions(parsedArray);
                if (cleaned.length) {
                    openProfileSuggestions(cleaned, candidateIntent);
                    setMessages(prev => [...prev, { role: 'model', text: 'הצעות שיפור מוכנות – בחר וסמן בחלון ההצעות.', createdAt: new Date().toISOString() }]);
                }
            }
            if ((!parsedArray || !parsedArray.length) && chatScope === 'company-profile' && lastModelForProposals?.text) {
                const companies = extractCompanyListFromText(lastModelForProposals.text);
                if (companies.length) {
                    const cleaned = companies.map((name, index) => ({
                        tool: 'createOrganization',
                        value: { name, mainField: 'נדל"ן' },
                        reason: 'הוספת חברה לפי בקשת המשתמש',
                        id: `company-suggestion-${index}-${name}`,
                    }));
                    setProfileSuggestions(cleaned);
                    setSelectedProfileIdx(new Set(cleaned.map((_, i) => i)));
                    setIsProfileSuggestOpen(true);
                    setProfileIntent('createOrganization');
                    setMessages(prev => [...prev, { role: 'model', text: 'הצעות לחברות חדשות מוכנות – בחר מה להוסיף.', createdAt: new Date().toISOString() }]);
                }
            }

            const cleanedMessages = prepareMessagesForDisplay(data.messages || []);
            setMessages(ensureWelcomeFirst(cleanedMessages));

            // Parse AI suggestions for tags (expects JSON block with "tags": [...])
            if (allowTagCreation) {
                const lastModelForTags = (data.messages || []).slice().reverse().find((m: any) => m.role === 'model');
                if (lastModelForTags?.text) {
                    const parsed = parseTagSuggestions(lastModelForTags.text);
                    if (parsed.length) {
                        setTagSuggestions(parsed);
                        setSelectedTagIdx(new Set(parsed.map((_, idx) => idx)));
                        setIsSuggestOpen(true);
                    }
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

const extractCompanyListFromText = (text: string) => {
    if (!text) return [];
    const lines = text.split('\n');
    const companies: string[] = [];
    const candidatePattern = /(?:[*\-•]|\d+\.)\s*(?:\*\*([^*]+)\*\*|([^*]+))(?:\:|–|—|-)?/;
    for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const match = trimmed.match(candidatePattern);
        if (!match) continue;
        const name = (match[1] || match[2] || '').trim();
        if (!name) continue;
        if (name.length < 2 || name.length > 60) continue;
        companies.push(name.replace(/["']/g, '').trim());
    }
    return Array.from(new Set(companies));
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

const extractProposalArray = (candidate: any): any[] | null => {
    if (!candidate) return null;
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate.proposals)) return candidate.proposals;
    if (Array.isArray(candidate.updates)) return candidate.updates;
    return null;
};

const normalizeProposalSuggestion = (proposal: any) => {
    if (!proposal || typeof proposal !== 'object') return null;
    const valueCandidate = proposal.proposedValue ?? proposal.value ?? proposal.organization ?? null;
    const basisValue = valueCandidate === null ? undefined : valueCandidate;
    if (basisValue === undefined) return null;

    const extractFieldFromPath = (path?: string) => {
        if (!path || typeof path !== 'string') return undefined;
        return path.replace(/^\//, '').split('/')[0];
    };

    const normalized: any = {
        reason: proposal.reason || proposal.title || 'הצעה למידע מעודכן',
    };

    if (proposal.tool) {
        normalized.tool = proposal.tool;
        normalized.value = basisValue;
    }

    const pathField = extractFieldFromPath(proposal.path);
    if (pathField) {
        normalized.field = pathField;
        normalized.value = basisValue;
    }

    if (!normalized.field && normalized.tool === 'upsertWorkExperience') {
        normalized.field = 'workExperience';
    }

    if (!normalized.field && proposal.field) {
        normalized.field = proposal.field;
        normalized.value = basisValue;
    }

    if (!normalized.field && normalized.tool === 'createOrganization') {
        normalized.value = proposal.organization || basisValue;
    }

    if (!normalized.field && !normalized.tool) return null;
    if (proposal.replaceExisting === true) {
        normalized.replaceExisting = true;
    }
    return normalized;
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
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) || Array.isArray(parsed?.proposals) || Array.isArray(parsed?.updates)) {
                return 'הצעות שיפור מוכנות – בדוק את חלון ההצעות.';
            }
            if (typeof parsed?.message === 'string' && parsed.message.trim().length > 0) {
                return parsed.message;
            }
        } catch {
            // not pure json
        }
        const withoutFences = text.replace(/```json[\s\S]*?```/g, '').trim();
        if (withoutFences && withoutFences !== text) return withoutFences;
        const withoutBraces = text.replace(/\{[\s\S]*?\}/g, '').trim();
        if (withoutBraces && withoutBraces !== text) return withoutBraces;
        return trimmed;
    };
    const prepareMessagesForDisplay = (messages: any[]) => {
        return (messages || [])
            .filter((m: any) => !isInstructionPrompt(m))
            .map((m: any) => ({
                role: m.role === 'model' ? 'model' : 'user',
                text: m.role === 'model' ? sanitizeModelText(m.text) : m.text,
                createdAt: m.createdAt || undefined,
            })) as Message[];
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
                        descriptionHe: t.descriptionHe || '',
                        domains: Array.isArray(t.domains) ? t.domains : [],
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
        
        // Forbidden keywords that indicate conversational or summary text, not tags
        const forbiddenKeywords = [
            'סיכום', 'כותרת', 'מיקום', 'מילות מפתח', 'הצעה', 'טיפ', 'הנה', 
            'איך להמשיך', 'ייבוא רשימה', 'היררכיה', 'תחום עיסוק', 'מיומנויות',
            'בכירות', 'סוג משרה', 'שפות', 'כישורים רכים', 'עולם המכירות',
            'עולם ה-Product', 'תגיות מערכת', 'הסמכות', 'עולם התפעול', 'כללי שיום',
            'Naming Conventions', 'Hierarchy', 'Strategic Tags', 'Parsing', 'Process Tags',
            'שורת סיכום', 'מילות מפתח חזקות'
        ];

        // Allow bullets or numbered lines, optional (category), optional dash/description
        const regex = /^\s*(?:[-*•]|\d+[.)])\s*([^()\n]+?)(?:\s*\(([^)]+)\))?(?:\s*[–—-].*)?$/;
        const simpleNumbered = /^\s*\d+\.\s*(.+)$/;
        const parsed: any[] = [];
        for (const l of lines) {
            const trimmedLine = l.trim();
            if (!trimmedLine) continue;

            // Skip lines that look like headers (end with colon or are too long)
            if (trimmedLine.endsWith(':') || trimmedLine.endsWith('：')) continue;
            
            // Skip lines containing forbidden keywords
            if (forbiddenKeywords.some(k => trimmedLine.includes(k))) continue;

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

            // Final filter for quality
            if (!name || name.length < 2 || name.length > 50) continue;
            if (name.includes(':')) continue; // Double check for embedded colons

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
        if (!allowTagCreation) return;
        if (!tagSuggestions.length) {
            setIsSuggestOpen(false);
            return;
        }
        setIsApplyingSuggestions(true);
        let firstError: string | null = null;
        const resolvedTags: any[] = [];
        const seenTagIds = new Set<string>();

        const createOrResolveTag = async (t: any) => {
            const payload = {
                displayNameHe: t.displayNameHe,
                displayNameEn: t.displayNameEn,
                category: t.category,
                type: t.type || 'skill',
                status: 'draft',
                qualityState: 'initial_detection',
                matchable: true,
                tagKey: slugifyTagKey(t.tagKey || t.displayNameEn || t.displayNameHe || 'tag'),
                synonyms: t.synonyms || [],
                domains: t.domains || [],
                descriptionHe: t.descriptionHe || '',
            };
            const res = await fetch(`${apiBase}/api/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.status === 409) {
                const body = (await res.json().catch(() => null)) as {
                    message?: string;
                    duplicate?: {
                        id?: string;
                        tagKey?: string;
                        displayNameHe?: string;
                        displayNameEn?: string;
                    };
                } | null;
                const dup = body?.duplicate;
                if (dup?.id) {
                    return {
                        id: dup.id,
                        tagKey: dup.tagKey || payload.tagKey,
                        displayNameHe: dup.displayNameHe || t.displayNameHe,
                        displayNameEn: dup.displayNameEn || t.displayNameEn || '',
                        type: payload.type,
                        reused: true,
                    };
                }
                throw new Error(body?.message || 'Tag already exists');
            }
            if (!res.ok) {
                let msg = await res.text();
                try {
                    const parsed = JSON.parse(msg) as { message?: string };
                    if (parsed?.message) msg = parsed.message;
                } catch {
                    /* keep raw text */
                }
                throw new Error(msg || 'Failed to create tag');
            }
            const createdTag = await res.json();
            return { ...createdTag, type: createdTag.type || payload.type };
        };

        for (let i = 0; i < tagSuggestions.length; i++) {
            if (!selectedTagIdx.has(i)) continue;
            const t = tagSuggestions[i];
            try {
                const tag = await createOrResolveTag(t);
                const tagId = String(tag?.id || '').trim();
                if (tagId && seenTagIds.has(tagId)) continue;
                if (tagId) seenTagIds.add(tagId);
                resolvedTags.push(tag);
            } catch (err: any) {
                if (!firstError) firstError = err?.message || 'Failed to create tag';
            }
        }
        setIsApplyingSuggestions(false);
        setIsSuggestOpen(false);
        setTagSuggestions([]);
        setSelectedTagIdx(new Set());
        if (resolvedTags.length) {
            window.dispatchEvent(new CustomEvent('hiro-tags-created', { detail: resolvedTags }));
            if (onProfileUpdate && contextData) {
                const existing = Array.isArray(contextData.tags) ? contextData.tags : [];
                const names = resolvedTags
                    .map((tag) => tag.displayNameHe || tag.displayNameEn || tag.tagKey || tag.name)
                    .filter(Boolean);
                const existingDetails = Array.isArray(contextData.tagDetails) ? contextData.tagDetails : [];
                const existingKeys = new Set(
                    existingDetails.map((d: any) =>
                        String(d?.tagId || d?.tag_id || d?.tagKey || d?.displayNameHe || '').trim().toLowerCase(),
                    ),
                );
                const newDetails = resolvedTags
                    .filter((tag) => {
                        const key = String(tag.id || tag.tagKey || tag.displayNameHe || '')
                            .trim()
                            .toLowerCase();
                        if (!key || existingKeys.has(key)) return false;
                        existingKeys.add(key);
                        return true;
                    })
                    .map((tag) => ({
                        tagId: tag.id,
                        tagKey: tag.tagKey || tag.displayNameEn || tag.displayNameHe,
                        displayNameHe: tag.displayNameHe || tag.displayNameEn || tag.tagKey,
                        displayNameEn: tag.displayNameEn || '',
                        rawType: tag.type || 'skill',
                        isCurrent: true,
                        isInSummary: true,
                    }));
                if (names.length || newDetails.length) {
                    void onProfileUpdate({
                        tags: Array.from(new Set([...existing, ...names])),
                        tagDetails: [...existingDetails, ...newDetails],
                    });
                }
            }
        }
        if (firstError) alert(firstError);
        else if (resolvedTags.length) alert('Tags applied successfully.');
        else alert('No tags were applied.');
    };

    const requestProfileSuggestions = async (mode: 'default' | 'soft' = 'default') => {
        if (!contextData) {
            alert('אין נתוני פרופיל זמינים כרגע.');
            return;
        }
        setIsProfileSuggestLoading(true);
        setError(null);
        try {
            const { jobFields, approvedTags } = await loadValidationCatalogs();
            const instructionPrompt = buildProfileSuggestionPrompt(mode, jobFields, approvedTags, contextData);
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId,
                    userId: resolvedUserId,
                    chatType: chatScope,
                    contextData,
                    promptId: effectivePromptId,
                    systemPrompt,
                    message: instructionPrompt,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            const lastModel = (data.messages || [])
                .slice()
                .reverse()
                .find((m: any) => m.role === 'model');
            let parsedArray: any[] | null = null;
            let candidateIntent = '';
            if (lastModel?.text) {
                const candidate = parseJsonBlock(lastModel.text);
                parsedArray = extractProposalArray(candidate);
                candidateIntent = candidate?.intent || '';
            }
            const cleaned = await finalizeProfileSuggestions(parsedArray || []);
            if (!cleaned.length) {
                alert('לא נמצאו הצעות שיפור תקפות (תגיות/תפקידים מאומתים) מהמודל.');
                return;
            }
            openProfileSuggestions(cleaned, candidateIntent);
            setChatId(data.chatId || chatId);
            setMessages(prev => [...prev, { role: 'model', text: 'הצעות שיפור מוכנות – בחר וסמן בחלון ההצעות.', createdAt: new Date().toISOString() }]);
        } catch (e: any) {
            setError(e.message || 'שגיאה בבקשת הצעות פרופיל');
        } finally {
            setIsProfileSuggestLoading(false);
        }
    };

    const triggerProfileSuggestions = (emitChat = false, mode: 'default' | 'soft' = 'default') => {
        if (emitChat) {
            setMessages(prev => [...prev, { role: 'model', text: 'בודק את הפרופיל ומכין הצעות שיפור...', createdAt: new Date().toISOString() }]);
        }
        requestProfileSuggestions(mode);
    };

    const formatSuggestionValue = (value: any, field?: string) => {
        if (field === 'workExperience') {
            return formatWorkExperienceSuggestionValue(value);
        }
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
            try {
                return JSON.stringify(value, null, 2);
            } catch {
                return String(value);
            }
        }
        return value !== undefined && value !== null ? String(value) : '';
    };

    const arrayFieldsWithChips = new Set(['tags', 'softSkills', 'techSkills']);

    const normalizeSuggestionItemLabel = (item: any) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') return item.name || item.value || item.label || JSON.stringify(item);
        return String(item);
    };

    const filterSuggestionValue = (field: string | undefined, value: any, idx: number) => {
        if (!field || !arrayFieldsWithChips.has(field) || !Array.isArray(value)) return value;
        const excluded = excludedSuggestionItems[idx];
        if (!excluded || excluded.size === 0) return value;
        return value.filter((item: any) => {
            const label = normalizeSuggestionItemLabel(item);
            return !excluded.has(label);
        });
    };

    const handleExcludeSuggestionItem = (idx: number, value: string) => {
        setExcludedSuggestionItems(prev => {
            const next = { ...prev };
            const existing = new Set(next[idx] || []);
            existing.add(value);
            next[idx] = existing;
            return next;
        });
    };

    const parseSuggestionEdit = (text: string, original: any, field?: string) => {
        if (field === 'workExperience') {
            const originalItems = normalizeWorkExperienceIncoming(original);
            try {
                const parsed = JSON.parse(text);
                return normalizeWorkExperienceIncoming(parsed);
            } catch {
                const blocks = text.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
                if (blocks.length > 1) {
                    return blocks.map((block, i) =>
                        parseWorkExperienceFriendlyText(block, originalItems[i] || originalItems[0]),
                    );
                }
                const single = parseWorkExperienceFriendlyText(text, originalItems[0]);
                return originalItems.length > 1 ? [single] : single;
            }
        }
        if (Array.isArray(original) || (typeof original === 'object' && original !== null)) {
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(original) && Array.isArray(parsed)) return parsed;
                if (typeof parsed === 'object' && parsed !== null) return parsed;
            } catch {
                return original;
            }
        }
        return text;
    };

    const getWorkExperienceEditItems = (idx: number, value: unknown): WorkExperienceEntry[] => {
        const edit = suggestionEdits[idx];
        if (edit !== undefined) {
            const parsed = parseSuggestionEdit(edit, value, 'workExperience');
            return normalizeWorkExperienceIncoming(parsed);
        }
        return normalizeWorkExperienceIncoming(value);
    };

    const updateWorkExperienceEditItem = (
        idx: number,
        value: unknown,
        entryIdx: number,
        patch: Partial<WorkExperienceEntry>,
    ) => {
        const items = getWorkExperienceEditItems(idx, value);
        const next = items.map((item, i) => (i === entryIdx ? { ...item, ...patch } : item));
        const payload = next.length === 1 ? next[0] : next;
        setSuggestionEdits((prev) => ({
            ...prev,
            [idx]: JSON.stringify(payload),
        }));
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
        const creationRequests: any[] = [];

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

        const selectedProfileSuggestions: any[] = [];
        profileSuggestions.forEach((s, idx) => {
            if (!selectedProfileIdx.has(idx)) return;
            const field = s.field;
            const value = s.value;
            const editValue = suggestionEdits[idx];
            let actualValue = editValue !== undefined ? parseSuggestionEdit(editValue, value, field) : value;
            if (Array.isArray(s.validatedItems) && s.validatedItems.length) {
                const activeItems = (s.validatedItems as ValidatedSuggestionItem[]).filter(
                    (item) => !excludedSuggestionItems[idx]?.has(item.label),
                );
                if (field === 'tags') {
                    actualValue = activeItems.map((item) => item.label);
                } else if (field === 'desiredRoles') {
                    actualValue = activeItems.map((item) => ({
                        ...(item.meta || {}),
                        value: item.meta?.value || item.label,
                        owner: 'candidate',
                    }));
                }
            }
            const filteredValue = filterSuggestionValue(field, actualValue, idx);
            const normalizedValue = field && arrayFieldsWithChips.has(field) ? filteredValue : actualValue;
            if (s.tool === 'createOrganization') {
                if (actualValue) creationRequests.push({ tool: 'createOrganization', value: actualValue });
                return;
            }
            if (!field || value === undefined || value === null) return;
            selectedProfileSuggestions.push({ ...s, value: normalizedValue });

            switch (field) {
                case 'tags':
                case 'softSkills':
                case 'techSkills':
                    mergeStringArray(field, normalizedValue);
                    if (field === 'tags' && Array.isArray(s.validatedItems) && s.validatedItems.length) {
                        const activeItems = (s.validatedItems as ValidatedSuggestionItem[]).filter(
                            (item) => !excludedSuggestionItems[idx]?.has(item.label),
                        );
                        const existingDetails = Array.isArray(patch.tagDetails)
                            ? patch.tagDetails
                            : Array.isArray(current.tagDetails)
                                ? [...current.tagDetails]
                                : [];
                        const newDetails = activeItems.map((item) => ({
                            tagKey: String(item.meta?.tagKey || item.label),
                            displayNameHe: String(item.meta?.displayNameHe || item.label),
                            displayNameEn: String(item.meta?.displayNameEn || ''),
                            rawType: 'skill',
                            isCurrent: true,
                            isInSummary: true,
                        }));
                        patch.tagDetails = [...existingDetails, ...newDetails];
                    }
                    break;
                case 'desiredRoles': {
                    const existing = Array.isArray(current.desiredRoles) ? [...current.desiredRoles] : [];
                    const incoming = ensureArray(normalizedValue);
                    for (const item of incoming) {
                        if (typeof item === 'object' && item?.value) {
                            if (!existing.some((role: any) => role.value === item.value)) {
                                existing.push({
                                    value: item.value,
                                    owner: item.owner || 'candidate',
                                    category: item.category,
                                    fieldType: item.fieldType,
                                    categoryId: item.categoryId,
                                    clusterId: item.clusterId,
                                    roleId: item.roleId,
                                });
                            }
                        } else if (typeof item === 'string' && item.trim()) {
                            const trimmed = item.trim();
                            if (!existing.some((role: any) => role.value === trimmed)) {
                                existing.push({ value: trimmed, owner: 'candidate' });
                            }
                        }
                    }
                    patch.desiredRoles = existing;
                    break;
                }
                case 'workExperience': {
                    const list = Array.isArray(current.workExperience) ? [...current.workExperience] : [];
                    const incoming = normalizeWorkExperienceIncoming(actualValue);
                    if (s.replaceExisting) {
                        patch.workExperience = incoming.map((entry) => ({
                            ...entry,
                            id: entry.id || `${Date.now()}-${Math.random()}`,
                        }));
                        break;
                    }
                    for (const entry of incoming) {
                        const entryId = String(entry.id || '').trim();
                        if (entryId) {
                            const idx = list.findIndex((row: any) => String(row?.id || '').trim() === entryId);
                            if (idx >= 0) {
                                list[idx] = { ...list[idx], ...entry, id: list[idx].id };
                                continue;
                            }
                        }
                        const dupIdx = list.findIndex((row: any) => isDuplicateWorkExperience(entry, [row]));
                        if (dupIdx >= 0) {
                            list[dupIdx] = { ...list[dupIdx], ...entry, id: list[dupIdx].id || entry.id };
                            continue;
                        }
                        list.push({
                            ...entry,
                            id: entry.id || `${Date.now()}-${Math.random()}`,
                        });
                    }
                    patch.workExperience = list;
                    break;
                }
            case 'salaryMin':
            case 'salaryMax':
                patch[field] = Number(actualValue) || 0;
                    break;
                default:
                patch[field] = actualValue;
            }
        });

        // Keep skills object in sync with soft/tech skills
        const combinedSoft = patch.softSkills || ensureArray(current.softSkills);
        const combinedTech = patch.techSkills || ensureArray(current.techSkills);
        patch.skills = {
            soft: combinedSoft,
            technical: combinedTech,
        };

        const hasPatch = Object.keys(patch).length > 0;
        const hasSelectedSuggestions = selectedProfileSuggestions.length > 0;
        if (hasPatch || creationRequests.length > 0 || hasSelectedSuggestions) {
            // Keep skills object in sync with soft/tech skills
            const combinedSoft = patch.softSkills || ensureArray(current.softSkills);
            const combinedTech = patch.techSkills || ensureArray(current.techSkills);
            patch.skills = {
                soft: combinedSoft,
                technical: combinedTech,
            };
            onProfileUpdate(patch, { suggestions: selectedProfileSuggestions });
        }
        creationRequests.forEach((req) => onProfileUpdate?.(req));
        if (!Object.keys(patch).length && creationRequests.length === 0) {
            alert('לא נבחרה אף הצעה לשמירה.');
        } else {
            alert('הפרופיל עודכן לפי ההצעות שנבחרו.');
        }
        setIsProfileSuggestOpen(false);
        setProfileSuggestions([]);
        setProfileIntent('');
        setSelectedProfileIdx(new Set());
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
                            setMessages(ensureWelcomeFirst([])); 
                            setChatId(null); 
                            setError(null); 
                            if (resolvedUserId) localStorage.removeItem(`hiroChatId:${resolvedUserId}:${chatScope}`);
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
                {messages.length === 0 && !isCandidateProfileChat && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-text-muted opacity-60 select-none">
                        <SparklesIcon className="w-12 h-12 mb-2"/>
                        <p>במה אפשר לעזור לך היום?</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'model' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-primary-100 rounded-full select-none"><SparklesIcon className="w-5 h-5 text-primary-600"/></div>}
                        <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-white border border-border-default text-text-default rounded-bl-none'}`}>
                                {msg.role === 'model' ? <SimpleMarkdownRenderer text={msg.text} /> : <p className="whitespace-pre-wrap">{msg.text}</p>}
                            </div>
                            {msg.createdAt && (
                                <span className={`text-[10px] text-text-muted px-1 ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                                    {formatMessageTimestamp(msg.createdAt)}
                                </span>
                            )}
                        </div>
                        {msg.role === 'user' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-bg-subtle rounded-full border border-border-default select-none"><UserCircleIcon className="w-6 h-6 text-text-muted"/></div>}
                    </div>
                ))}
                {showSuggestedPrompts && (
                    <div className="space-y-3 pt-1">
                        {CANDIDATE_SUGGESTED_PROMPT_GROUPS.map((group) => (
                            <div key={group.title} className="space-y-2">
                                <p className="text-xs font-semibold text-text-muted px-1">{group.title}</p>
                                <div className="flex flex-wrap gap-2">
                                    {group.prompts.map((prompt) => (
                                        <button
                                            key={prompt.text}
                                            type="button"
                                            disabled={prompt.comingSoon || isLoading}
                                            onClick={() => handleSend(prompt.text)}
                                            className={`text-xs text-right px-3 py-2 rounded-xl border transition-colors max-w-full ${
                                                prompt.comingSoon
                                                    ? 'border-border-subtle bg-bg-subtle/60 text-text-muted cursor-not-allowed opacity-70'
                                                    : 'border-primary-200 bg-white hover:bg-primary-50 hover:border-primary-300 text-text-default shadow-sm'
                                            }`}
                                        >
                                            {prompt.text}
                                            {prompt.comingSoon && (
                                                <span className="mr-1 text-[10px] font-semibold text-primary-600">(בקרוב)</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
                        onClick={() => handleSend()} 
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
        <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4 overflow-hidden pointer-events-none">
            <div
                className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-4 cursor-default"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    if (!profileSuggestPosition) {
                        const width = 800;
                        const height = 500;
                        setProfileSuggestPosition({
                            x: Math.max(20, window.innerWidth / 2 - width / 2),
                            y: Math.max(20, window.innerHeight / 2 - height / 2),
                        });
                    }
                    setIsProfileSuggestDragging(true);
                    setProfileSuggestDragOffset({
                        x: e.clientX - (profileSuggestPosition?.x || 0),
                        y: e.clientY - (profileSuggestPosition?.y || 0),
                    });
                }}
                style={{
                    position: 'absolute',
                    top: profileSuggestPosition?.y ?? '50%',
                    left: profileSuggestPosition?.x ?? '50%',
                    transform: profileSuggestPosition ? 'translate(0, 0)' : 'translate(-50%, -50%)',
                    cursor: isProfileSuggestDragging ? 'grabbing' : 'grab',
                    pointerEvents: 'auto',
                }}
            >
                    <div className="flex items-center justify-between">
                        <div>
                            <h3
                                className="text-lg font-bold text-text-default cursor-pointer"
                                onClick={() => triggerProfileSuggestions(true)}
                            >
                                הצעות לשיפור הפרופיל
                            </h3>
                            {profileIntent && (
                                <p className="text-xs text-text-muted">
                                    {profileIntent === 'createOrganization' && 'יצירת חברה חדשה'}
                                    {profileIntent === 'update' && 'עדכון חברה קיימת'}
                                </p>
                            )}
                        </div>
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
                            const displayLabel = s.field
                                ? labelMap[s.field] || s.field
                                : s.tool === 'createOrganization'
                                ? 'צור חברה חדשה'
                                : 'הצעה';
                            const value = s.value;
                            const isArray = Array.isArray(value);
                            const isObject = !isArray && typeof value === 'object' && value !== null;
                            const editValue = suggestionEdits[idx] ?? formatSuggestionValue(value, s.field);
            const handleEditChange = (next: string) => {
                setSuggestionEdits(prev => ({ ...prev, [idx]: next }));
            };
            const field = s.field;
            const filteredValue = filterSuggestionValue(field, value, idx);
            const showChipsOnly = field && arrayFieldsWithChips.has(field);
            const workExperienceItems = field === 'workExperience' ? getWorkExperienceEditItems(idx, value) : [];
            const validatedItems = Array.isArray(s.validatedItems)
                ? (s.validatedItems as ValidatedSuggestionItem[]).filter(
                    (item) => !excludedSuggestionItems[idx]?.has(item.label),
                )
                : [];
            const showValidatedItems = validatedItems.length > 0;
            return (
                <label key={idx} className="flex items-start gap-3 p-3 border border-border-default rounded-xl cursor-pointer">
                    <input
                        type="checkbox"
                        checked={selectedProfileIdx.has(idx)}
                        onChange={() => toggleProfileSuggestion(idx)}
                        className="mt-1"
                    />
                    <div className="space-y-1 flex-1">
                        <div className="font-bold text-text-default">{displayLabel}</div>
                        {showValidatedItems ? (
                            <div className="space-y-2 mt-2">
                                {validatedItems.map((item, itemIdx) => (
                                    <div key={`${idx}-validated-${itemIdx}`} className="rounded-lg border border-border-default p-2 bg-bg-subtle/40">
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <span className="flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-semibold px-2 py-1 rounded-full">
                                                {item.label}
                                                <button
                                                    type="button"
                                                    onClick={() => handleExcludeSuggestionItem(idx, item.label)}
                                                    className="text-primary-500 hover:text-primary-700"
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                </button>
                                            </span>
                                            {item.validationNote && (
                                                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                    {item.validationNote}
                                                </span>
                                            )}
                                        </div>
                                        {item.reason && (
                                            <p className="text-xs text-text-subtle mt-1">למה: {item.reason}</p>
                                        )}
                                    </div>
                                ))}
                                {Array.isArray(s.rejectedItems) && s.rejectedItems.length > 0 && (
                                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                        לא הוצגו: {s.rejectedItems.map((item: ValidatedSuggestionItem) => item.label).join(', ')}
                                    </div>
                                )}
                            </div>
                        ) : field === 'workExperience' ? (
                            <div className="space-y-3 mt-2">
                                {workExperienceItems.map((entry, entryIdx) => (
                                    <div
                                        key={`${idx}-work-${entryIdx}`}
                                        className="rounded-lg border border-border-default p-3 bg-bg-subtle/40 space-y-2"
                                    >
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <input
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-xs"
                                                placeholder="תפקיד"
                                                value={String(entry.title || '')}
                                                onChange={(e) =>
                                                    updateWorkExperienceEditItem(idx, value, entryIdx, { title: e.target.value })
                                                }
                                            />
                                            <input
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-xs"
                                                placeholder="חברה"
                                                value={String(entry.company || '')}
                                                onChange={(e) =>
                                                    updateWorkExperienceEditItem(idx, value, entryIdx, { company: e.target.value })
                                                }
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-xs"
                                                placeholder="שנת התחלה"
                                                value={String(entry.startDate || '')}
                                                onChange={(e) =>
                                                    updateWorkExperienceEditItem(idx, value, entryIdx, { startDate: e.target.value })
                                                }
                                            />
                                            <input
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-xs"
                                                placeholder="שנת סיום (או היום)"
                                                value={String(entry.endDate || '')}
                                                onChange={(e) =>
                                                    updateWorkExperienceEditItem(idx, value, entryIdx, { endDate: e.target.value })
                                                }
                                            />
                                        </div>
                                        <textarea
                                            className="w-full bg-white border border-border-default rounded-lg p-2 text-xs text-text-muted resize-none"
                                            rows={3}
                                            placeholder="תיאור התפקיד"
                                            value={String(entry.description || '')}
                                            onChange={(e) =>
                                                updateWorkExperienceEditItem(idx, value, entryIdx, { description: e.target.value })
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : showChipsOnly ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {Array.isArray(filteredValue) && filteredValue.length > 0 ? (
                                    filteredValue.map((item: any, itemIdx: number) => {
                                        const label = normalizeSuggestionItemLabel(item);
                                        return (
                                            <span key={`${idx}-${itemIdx}`} className="flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-semibold px-2 py-1 rounded-full">
                                                {label}
                                                <button
                                                    type="button"
                                                    onClick={() => handleExcludeSuggestionItem(idx, label)}
                                                    className="text-primary-500 hover:text-primary-700"
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                </button>
                                            </span>
                                        );
                                    })
                                ) : (
                                    <span className="text-xs text-text-subtle">אין פריטים</span>
                                )}
                            </div>
                        ) : (
                            <textarea
                                className="w-full bg-bg-subtle border border-border-default rounded-lg p-2 text-xs text-text-muted resize-none"
                                rows={isArray || isObject ? 4 : 2}
                                value={editValue}
                                onChange={(e) => handleEditChange(e.target.value)}
                            />
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
            {allowTagCreation && isSuggestOpen && (
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
                            <label key={idx} className="flex items-start gap-3 p-3 border border-border-default rounded-xl cursor-pointer">
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
                                                        <span key={i} className="px-2 py-0.5 bg-gray-100 rounded-full border">{typeof s === 'string' ? s : s.phrase}</span>
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
