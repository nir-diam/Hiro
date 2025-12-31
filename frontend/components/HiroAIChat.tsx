
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


const HiroAIChat: React.FC<HiroAIChatProps> = ({ isOpen, onClose, userId, tagsText, skipHistory, initialMessage }) => {
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
            const apiBase = import.meta.env.VITE_API_BASE || '';
            setIsLoading(true);
            setError(null);
            try {
                // Try server-side latest
                const res = await fetch(`${apiBase}/api/chat/user/${resolvedUserId}/latest`);
                if (res.ok) {
                    const data = await res.json();
                    const mapped = (data.messages || []).map((m: any) => ({
                        role: m.role === 'model' ? 'model' : 'user',
                        text: m.text,
                    })) as Message[];
                    setChatId(data.chatId);
                    localStorage.setItem(`hiroChatId:${resolvedUserId}`, data.chatId);
                    setMessages(mapped);
                    return;
                }
                // Fallback to stored chatId
                const saved = localStorage.getItem(`hiroChatId:${resolvedUserId}`);
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
    }, [isOpen, resolvedUserId, skipHistory, initialMessage]);

    const handleSend = async () => {
        if (!input.trim()) return;
        if (isListening) recognitionRef.current.stop();
        const userMessage: Message = { role: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);
        const apiBase = import.meta.env.VITE_API_BASE || '';
        try {
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, userId: resolvedUserId, message: input, tagsText }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Chat failed');
            }
            const data = await res.json();
            setChatId(data.chatId);
            setMessages(data.messages || []);
        } catch (err: any) {
            setError(err.message || 'Chat failed');
        } finally {
            setIsLoading(false);
        }
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto'; // Reset height
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

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
                            if (resolvedUserId) localStorage.removeItem(`hiroChatId:${resolvedUserId}`);
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
                <div className="flex items-end gap-2">
                    <div className="relative flex-grow bg-bg-input border border-border-default rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500 transition-all">
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
                    <button 
                        onClick={handleSend} 
                        disabled={isLoading || (!input.trim() && !isListening)} 
                        className="w-11 h-11 flex-shrink-0 flex items-center justify-center bg-primary-600 text-white rounded-full hover:bg-primary-700 transition disabled:bg-primary-300 disabled:cursor-not-allowed shadow-md mb-0.5"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                </div>
            </footer>
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
