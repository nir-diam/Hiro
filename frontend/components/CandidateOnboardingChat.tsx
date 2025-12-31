
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaperAirplaneIcon, SparklesIcon, UserCircleIcon, ArrowLeftIcon, CheckCircleIcon } from './Icons';

interface Message {
    id: number;
    role: 'ai' | 'user';
    text: string;
    isTyping?: boolean;
}

const steps = [
    { key: 'name', question: "היי! אני Hiro, העוזר האישי שלך. בוא נבנה לך פרופיל מנצח ב-2 דקות. איך קוראים לך?" },
    { key: 'title', question: "נעים מאוד {name}! מה הטייטל המקצועי הנוכחי שלך או התפקיד שאתה מחפש?" },
    { key: 'experience', question: "מעולה. ספר לי בקצרה על הניסיון האחרון שלך (שם החברה ותפקיד).", multiline: true },
    { key: 'skills', question: "מהן 2-3 המיומנויות המרכזיות שלך? (למשל: מכירות, Python, ניהול צוות)" },
    { key: 'contact', question: "כמעט סיימנו. מה הטלפון והמייל שלך ליצירת קשר?" },
];

const CandidateOnboardingChat: React.FC = () => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [candidateData, setCandidateData] = useState<any>({});
    const [chatId, setChatId] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const apiBase = import.meta.env.VITE_API_BASE || '';

    // Resolve userId from localStorage
    useEffect(() => {
        try {
            const rawHero = localStorage.getItem('herouser');
            const rawUser = localStorage.getItem('user');
            const parsedHero = rawHero ? JSON.parse(rawHero) : null;
            const parsedUser = rawUser ? JSON.parse(rawUser) : null;
            const resolved = parsedHero?._id || parsedHero?.id || parsedUser?._id || parsedUser?.id || null;
            if (resolved) setUserId(resolved);
        } catch (e) {
            console.warn('Failed to parse user from localStorage', e);
        }
    }, []);

    // Load last conversation when component mounts and userId resolved
    useEffect(() => {
        const loadHistory = async () => {
            if (!userId) return;
            setIsLoading(true);
            setError(null);
            try {
                // First try server-side latest-by-user
                const res = await fetch(`${apiBase}/api/chat/user/${userId}/latest`);
                if (res.ok) {
                    const data = await res.json();
                    const history = (data.messages || []).map((m: any) => ({
                        id: crypto.randomUUID(),
                        role: m.role === 'model' ? 'ai' : 'user',
                        text: m.text,
                    }));
                    setChatId(data.chatId);
                    localStorage.setItem(`candidateOnboardingChatId:${userId}`, data.chatId);
                    setMessages(history.length ? history : [{ id: Date.now(), role: 'ai', text: steps[0].question }]);
                    return;
                }

                // Fallback to local saved chatId if server had none
                const savedChatId = localStorage.getItem(`candidateOnboardingChatId:${userId}`);
                if (savedChatId) {
                    const res2 = await fetch(`${apiBase}/api/chat/${savedChatId}`);
                    if (res2.ok) {
                        const data = await res2.json();
                        const history = (data.messages || []).map((m: any) => ({
                            id: crypto.randomUUID(),
                            role: m.role === 'model' ? 'ai' : 'user',
                            text: m.text,
                        }));
                        setChatId(savedChatId);
                        setMessages(history.length ? history : [{ id: Date.now(), role: 'ai', text: steps[0].question }]);
                        return;
                    }
                }

                // If nothing found
                addAiMessage(steps[0].question, true);
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינת היסטוריה');
                addAiMessage(steps[0].question, true);
            } finally {
                setIsLoading(false);
            }
        };
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const addAiMessage = (text: string, immediate = false) => {
        const push = () => setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text }]);
        if (immediate) {
            push();
            return;
        }
        setIsTyping(true);
        setTimeout(() => {
            setIsTyping(false);
            push();
        }, 600);
    };

    const parseContactInfo = (text: string) => {
        // Very basic extraction for demo purposes
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const phoneRegex = /(\d{3}[-\s]?\d{7,10})/g; // Simple IL phone regex
        
        const emails = text.match(emailRegex);
        const phones = text.match(phoneRegex);

        return {
            email: emails ? emails[0] : '',
            phone: phones ? phones[0] : ''
        };
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        // 1. Add User Message
        const userMsg: Message = { id: Date.now(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        const answer = input;
        setInput('');
        setIsLoading(true);
        setError(null);

        // Send to backend chat
        try {
            const res = await fetch(`${apiBase}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, userId, message: answer }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Chat failed');
            }
            const data = await res.json();
            if (data.chatId) {
                setChatId(data.chatId);
                if (userId) localStorage.setItem(`candidateOnboardingChatId:${userId}`, data.chatId);
            }
            const mapped: Message[] = (data.messages || []).map((m: any) => ({
                id: crypto.randomUUID(),
                role: m.role === 'model' ? 'ai' : 'user',
                text: m.text,
            }));
            setMessages(mapped);
        } catch (e: any) {
            setError(e.message || 'Chat failed');
        } finally {
            setIsLoading(false);
        }

        // 2. Process Answer based on current step
        const stepKey = steps[currentStep].key;
        let updatedData = { ...candidateData };

        switch (stepKey) {
            case 'name':
                updatedData.fullName = answer;
                break;
            case 'title':
                updatedData.title = answer;
                break;
            case 'experience':
                // Creating a mock experience entry
                updatedData.professionalSummary = `מועמד בעל ניסיון ב-${answer}.`;
                updatedData.workExperience = [{
                    id: 1,
                    title: updatedData.title,
                    company: answer, // Simplistic assumption
                    startDate: '2022-01',
                    endDate: 'Present',
                    description: 'הוזן במהלך ההרשמה'
                }];
                break;
            case 'skills':
                updatedData.tags = answer.split(/[,،\s]+/).filter(Boolean); // Split by comma or space
                break;
            case 'contact':
                const contactInfo = parseContactInfo(answer);
                updatedData.email = contactInfo.email || 'user@example.com';
                updatedData.phone = contactInfo.phone || answer; // Fallback to full text if regex fails
                break;
        }

        setCandidateData(updatedData);

        // 3. Move to next step or Finish (local UI flow)
        if (currentStep < steps.length - 1) {
            const nextStep = steps[currentStep + 1];
            let nextQuestion = nextStep.question.replace('{name}', updatedData.fullName?.split(' ')[0] || '');
            setCurrentStep(prev => prev + 1);
            addAiMessage(nextQuestion);
        } else {
            // Finish
            setIsTyping(true);
            setTimeout(() => {
                setIsTyping(false);
                setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: "מעולה! הפרופיל שלך נוצר. מעביר אותך לאזור האישי..." }]);
                
                // Redirect after delay
                setTimeout(() => {
                    navigate('/candidate-portal/profile', { state: { candidateData: updatedData, isNewUser: true } });
                }, 2000);
            }, 1000);
        }
    };

    return (
        <div className="min-h-screen bg-bg-default flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-bg-card rounded-2xl shadow-xl overflow-hidden flex flex-col h-[80vh] border border-border-default">
                
                {/* Header */}
                <div className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center">
                            <SparklesIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-bold text-text-default">בניית פרופיל חכמה</h2>
                            <p className="text-xs text-text-muted">Hiro AI Assistant</p>
                        </div>
                    </div>
                    <button onClick={() => navigate('/candidate-portal/register')} className="text-text-muted hover:text-text-default">
                        <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg-subtle/20">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex items-end gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'ai' ? 'bg-primary-100 text-primary-600' : 'bg-gray-200 text-gray-600'}`}>
                                    {msg.role === 'ai' ? <SparklesIcon className="w-4 h-4" /> : <UserCircleIcon className="w-5 h-5" />}
                                </div>
                                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                    msg.role === 'user' 
                                        ? 'bg-primary-600 text-white rounded-br-none' 
                                        : 'bg-white border border-border-default text-text-default rounded-bl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {isTyping && (
                         <div className="flex justify-start">
                            <div className="flex items-end gap-3 max-w-[80%]">
                                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center flex-shrink-0">
                                    <SparklesIcon className="w-4 h-4" />
                                </div>
                                <div className="bg-white border border-border-default p-4 rounded-2xl rounded-bl-none shadow-sm flex gap-1">
                                    <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce"></span>
                                    <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-bg-card border-t border-border-default">
                    <div className="relative flex items-center gap-2">
                        {steps[currentStep]?.multiline ? (
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="כתוב כאן..."
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3 pl-12 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none max-h-32"
                                rows={3}
                                autoFocus
                            />
                        ) : (
                             <input 
                                type="text" 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="כתוב כאן..."
                                className="w-full bg-bg-input border border-border-default rounded-full py-3 px-4 pl-12 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                autoFocus
                            />
                        )}
                        <button 
                            onClick={handleSend}
                            disabled={!input.trim()}
                            className="absolute left-2 bottom-2 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-md"
                        >
                            <PaperAirplaneIcon className="w-4 h-4 transform rotate-180" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CandidateOnboardingChat;
