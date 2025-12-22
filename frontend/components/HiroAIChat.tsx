
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, PaperAirplaneIcon, SparklesIcon, UserCircleIcon, ArrowPathIcon, MicrophoneIcon, StopIcon } from './Icons';
import { GoogleGenAI, Chat } from '@google/genai';

interface Message {
    role: 'user' | 'model';
    text: string;
}

interface HiroAIChatProps {
    isOpen: boolean;
    onClose: () => void;
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    onSendMessage: (input: string) => void;
    onReset: () => void;
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


const HiroAIChat: React.FC<HiroAIChatProps> = ({ isOpen, onClose, messages, isLoading, error, onSendMessage, onReset }) => {
    const [input, setInput] = useState('');
    const [isListening, setIsListening] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (isOpen) {
            // Slight delay to ensure render before scroll
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    }, [messages, isLoading, isOpen]);

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
    
    const handleSend = () => {
        if (!input.trim()) return;
        if (isListening) recognitionRef.current.stop();
        onSendMessage(input);
        setInput('');
    };

    if (!isOpen) return null;

    // Use createPortal to render the chat widget directly into document.body
    // This escapes any parent container styling (like transforms or relative positioning)
    // that might prevent 'fixed bottom-4' from working correctly relative to the viewport.
    return createPortal(
        <div 
            className="fixed bottom-4 left-4 w-[90vw] md:w-[450px] h-[600px] max-h-[80vh] bg-bg-card rounded-2xl shadow-2xl border border-border-default z-[9999] flex flex-col overflow-hidden animate-slide-up"
            style={{ animation: 'slideUp 0.3s ease-out' }}
        >
            <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0 bg-bg-card/95 backdrop-blur-sm cursor-move">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-primary-500"/>
                    <h2 className="text-lg font-bold text-text-default">Hiro AI Assistant</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onReset} title="אתחול שיחה" className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                        <ArrowPathIcon className="w-5 h-5" />
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 space-y-4 bg-bg-subtle/30">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center text-text-muted opacity-60">
                        <SparklesIcon className="w-12 h-12 mb-2"/>
                        <p>במה אפשר לעזור לך היום?</p>
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                        {msg.role === 'model' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-primary-100 rounded-full"><SparklesIcon className="w-5 h-5 text-primary-600"/></div>}
                        <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user' ? 'bg-primary-600 text-white rounded-br-none' : 'bg-white border border-border-default text-text-default rounded-bl-none'}`}>
                            {msg.role === 'model' ? <SimpleMarkdownRenderer text={msg.text} /> : <p>{msg.text}</p>}
                        </div>
                            {msg.role === 'user' && <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-bg-subtle rounded-full border border-border-default"><UserCircleIcon className="w-6 h-6 text-text-muted"/></div>}
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
                <div className="flex items-center gap-2">
                    <div className="relative flex-grow">
                            <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                            placeholder={isListening ? "מקשיב..." : "שאל אותי משהו..."}
                            className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-full py-2.5 pl-12 pr-4 focus:ring-primary-500 focus:border-primary-500 transition shadow-sm ${isListening ? 'ring-2 ring-red-500/50 border-red-500' : ''}`}
                            disabled={isLoading}
                        />
                        <button 
                            onClick={toggleListening}
                            title={isListening ? "הפסק הקלטה" : "דבר אליי"}
                            className={`absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-text-subtle hover:bg-bg-subtle hover:text-primary-600'}`}
                        >
                            {isListening ? <StopIcon className="w-4 h-4" /> : <MicrophoneIcon className="w-4 h-4" />}
                        </button>
                    </div>
                    <button onClick={handleSend} disabled={isLoading || (!input.trim() && !isListening)} className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-primary-600 text-white rounded-full hover:bg-primary-700 transition disabled:bg-primary-300 shadow-md">
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                </div>
            </footer>
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .prose ul { list-style: disc; padding-right: 1.5rem; }
                .prose p { margin: 0; }
                .prose strong { font-weight: bold; }
            `}</style>
        </div>,
        document.body
    );
};

export default HiroAIChat;
