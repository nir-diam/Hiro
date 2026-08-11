
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    CloudArrowUpIcon, DocumentTextIcon, UserIcon, ArrowRightIcon, 
    CheckCircleIcon, SparklesIcon
} from './Icons';

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
};

const loadingMessages = [
    'קורא את הקובץ...',
    'מנתח ניסיון תעסוקתי...',
    'מזהה כישורים ותגיות...',
    'ממפה פרופיל תעשייתי...',
    'בונה את הפרופיל הסופי...',
];

const ACCEPTED_RESUME_TYPES = new Set([
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg',
]);

const ACCEPTED_RESUME_EXT = /\.(pdf|txt|doc|docx|png|jpe?g)$/i;

const isAcceptedResumeFile = (file: File) =>
    ACCEPTED_RESUME_TYPES.has(file.type) || ACCEPTED_RESUME_EXT.test(file.name);

const authHeaders = (): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const getLoggedInUserId = (): string | null => {
    try {
        const raw = localStorage.getItem('herouser') || localStorage.getItem('user');
        if (!raw) return null;
        const user = JSON.parse(raw);
        const id = user?.id || user?.userId;
        return id ? String(id) : null;
    } catch {
        return null;
    }
};

const CandidateRegistrationWizard: React.FC = () => {
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [step, setStep] = useState<'choice' | 'upload' | 'processing' | 'success'>('choice');
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (step === 'processing') {
            let msgIndex = 0;
            interval = setInterval(() => {
                msgIndex = (msgIndex + 1) % loadingMessages.length;
                setLoadingMessage(loadingMessages[msgIndex]);
            }, 1500);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [step]);

    const processFile = async (file: File) => {
        if (!isAcceptedResumeFile(file)) {
            alert('קובץ לא נתמך. אפשר להעלות PDF, Word, TXT או תמונה (PNG/JPG).');
            return;
        }

        if (!apiBase) {
            alert('חסרה כתובת API. בדוק את ההגדרות.');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            alert('יש להירשם או להתחבר לפני העלאת קורות חיים.');
            navigate('/candidate-portal/signup');
            return;
        }

        setUploadError(null);
        setStep('processing');

        try {
            const userId = getLoggedInUserId();
            const payload: Record<string, unknown> = {
                fileBase64: await blobToBase64(file),
                sendWelcomeEmail: false,
                profileName: 'פרופיל ראשי',
            };
            if (file.type) payload.mimeType = file.type;
            if (file.name) payload.fileName = file.name;
            if (userId) payload.userId = userId;

            const response = await fetch(`${apiBase}/api/candidates/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            const json = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(json.message || 'שגיאה בעיבוד קורות החיים.');
            }

            const candidate = json.candidate || json;
            if (!candidate?.id) {
                throw new Error('השרת לא החזיר מזהה מועמד.');
            }

            if (userId && String(candidate.userId || '') !== userId) {
                await fetch(`${apiBase}/api/candidates/${candidate.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify({ userId, profileName: 'פרופיל ראשי' }),
                }).catch((linkErr) => {
                    console.warn('Failed to link candidate to portal user', linkErr);
                });
            }

            setStep('success');
            setTimeout(() => {
                navigate('/candidate-portal/profile');
            }, 1500);
        } catch (error: unknown) {
            console.error('Resume upload failed', error);
            const message = error instanceof Error ? error.message : 'אירעה שגיאה בעיבוד הקובץ.';
            setUploadError(message);
            alert(`${message}\n\nאפשר לנסות שוב או לעבור להרשמה ידנית.`);
            setStep('upload');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) void processFile(file);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) void processFile(file);
    };

    const handleManualEntry = () => {
        navigate('/candidate-portal/onboarding');
    };

    return (
        <div className="min-h-screen bg-bg-default flex flex-col items-center justify-center p-4">
            
            <div className="bg-bg-card w-full max-w-3xl rounded-3xl shadow-2xl border border-border-default overflow-hidden relative min-h-[500px] flex flex-col">
                <div className="p-6 border-b border-border-default flex justify-between items-center bg-bg-subtle/30">
                    <h1 className="text-2xl font-bold text-text-default">יצירת פרופיל מועמד</h1>
                    {step !== 'choice' && step !== 'success' && (
                        <button onClick={() => { setUploadError(null); setStep('choice'); }} className="text-sm font-medium text-text-muted hover:text-primary-600 flex items-center gap-1">
                            <ArrowRightIcon className="w-4 h-4" /> חזרה
                        </button>
                    )}
                </div>

                <div className="flex-1 p-8 flex flex-col items-center justify-center relative">
                    
                    {step === 'choice' && (
                        <>
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in mb-8">
                                <button 
                                    onClick={() => setStep('upload')}
                                    className="flex flex-col items-center text-center p-8 rounded-2xl border-2 border-primary-100 bg-primary-50/30 hover:bg-primary-50 hover:border-primary-500 transition-all group h-full"
                                >
                                    <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <CloudArrowUpIcon className="w-10 h-10 text-primary-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-text-default mb-2">העלאת קורות חיים</h3>
                                    <p className="text-sm text-text-muted">
                                        הדרך המהירה ביותר. ה-AI שלנו ינתח את הקובץ ויבנה לך פרופיל מקצועי בשניות.
                                    </p>
                                    <span className="mt-6 px-4 py-1.5 bg-primary-600 text-white text-sm font-bold rounded-full shadow-sm group-hover:shadow-md transition-all">מומלץ</span>
                                </button>

                                <button 
                                    onClick={handleManualEntry}
                                    className="flex flex-col items-center text-center p-8 rounded-2xl border-2 border-border-default hover:border-text-subtle hover:bg-bg-subtle transition-all group h-full"
                                >
                                    <div className="w-20 h-20 rounded-full bg-bg-subtle shadow-inner flex items-center justify-center mb-6 group-hover:bg-white transition-colors">
                                        <UserIcon className="w-10 h-10 text-text-muted" />
                                    </div>
                                    <h3 className="text-xl font-bold text-text-default mb-2">הרשמה ידנית (עם עזרה)</h3>
                                    <p className="text-sm text-text-muted">
                                        אין לך קובץ זמין? לא נורא. ה-AI יעזור לך לבנות את הפרופיל בשיחה קצרה.
                                    </p>
                                    <span className="mt-6 text-primary-600 font-bold text-sm group-hover:underline">להרשמה ידנית &larr;</span>
                                </button>
                            </div>
                            
                            <div className="text-center animate-fade-in border-t border-border-default pt-4 w-full">
                                <p className="text-text-muted text-sm">
                                    יש לך כבר חשבון?{' '}
                                    <button 
                                        onClick={() => navigate('/candidate-portal/login')}
                                        className="text-primary-600 font-bold hover:underline"
                                    >
                                        התחבר כאן
                                    </button>
                                </p>
                            </div>
                        </>
                    )}

                    {step === 'upload' && (
                        <div className="w-full max-w-lg animate-fade-in">
                            <div 
                                onDragEnter={handleDrag} 
                                onDragLeave={handleDrag} 
                                onDragOver={handleDrag} 
                                onDrop={handleDrop}
                                className={`border-3 border-dashed rounded-3xl p-10 text-center transition-all ${
                                    dragActive 
                                    ? 'border-primary-500 bg-primary-50 scale-105' 
                                    : 'border-border-default bg-bg-subtle/20 hover:border-primary-300'
                                }`}
                            >
                                <div className="w-24 h-24 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <DocumentTextIcon className="w-12 h-12" />
                                </div>
                                <h3 className="text-xl font-bold text-text-default mb-2">גרור קובץ לכאן</h3>
                                <p className="text-text-muted mb-4">או לחץ לבחירה מהמחשב</p>
                                <p className="text-xs text-text-subtle mb-6">PDF, Word, TXT, PNG, JPG</p>

                                {uploadError && (
                                    <p className="text-sm text-red-600 mb-4">{uploadError}</p>
                                )}
                                
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    className="hidden"
                                    onChange={handleFileSelect}
                                />
                                <button 
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-primary-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30"
                                >
                                    בחר קובץ
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="text-center animate-fade-in">
                            <div className="relative w-32 h-32 mx-auto mb-8">
                                <div className="absolute inset-0 border-4 border-primary-100 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                                <SparklesIcon className="absolute inset-0 m-auto w-12 h-12 text-primary-600 animate-pulse" />
                            </div>
                            <h2 className="text-2xl font-bold text-text-default mb-2">אנחנו בונים את הפרופיל שלך</h2>
                            <p className="text-primary-600 font-medium text-lg min-h-[1.5em]">{loadingMessage}</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center animate-fade-in">
                            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                                <CheckCircleIcon className="w-12 h-12" />
                            </div>
                            <h2 className="text-2xl font-bold text-text-default mb-2">הפרופיל נוצר בהצלחה!</h2>
                            <p className="text-text-muted">מעבירים אותך לאזור האישי לבדיקה ואישור הפרטים...</p>
                        </div>
                    )}

                </div>
            </div>
            
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
        </div>
    );
};

export default CandidateRegistrationWizard;
