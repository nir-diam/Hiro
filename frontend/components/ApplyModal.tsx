
import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { XMarkIcon, DocumentTextIcon, ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon } from './Icons';
import { Job } from './JobsView';
import AIAnalysisResult from './AIAnalysisResult';

interface ApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: { jobTitle: string, coverLetter: string, cvFile: File | string }) => void;
  job: Job | null;
}

const loadingMessages = [
    'מנתח את קורות החיים שלך...',
    'משווה בין הניסיון שלך לדרישות המשרה...',
    'מזהה נקודות חוזק והזדמנויות...',
    'מכין עבורך המלצות אישיות...',
    'כמעט מסיימים...'
];

const mockCVText = `גדעון שפירא
מנהל שיווק דיגיטלי עם 5 שנות ניסיון.
ניסיון:
- מנהל שיווק בבזק (2020-2023): ניהול צוות, אחריות על קמפיינים דיגיטליים ותקציב שנתי.
- מנהל קמפיינים PPC ב-Wix (2018-2019): ניהול קמפיינים בגוגל ופייסבוק.
השכלה:
- תואר ראשון בתקשורת, אוניברסיטת תל אביב.
כישורים:
- Google Ads, Facebook Ads, Google Analytics, ניהול צוות, אסטרטגיה.`;

const ApplyModal: React.FC<ApplyModalProps> = ({ isOpen, onClose, onApply, job }) => {
    const [coverLetter, setCoverLetter] = useState('');
    const [cvSelection, setCvSelection] = useState<'default' | 'new'>('default');
    const [newCvFile, setNewCvFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    const [analysisStep, setAnalysisStep] = useState<'form' | 'loading' | 'result' | 'error'>('form');
    const [analysisResult, setAnalysisResult] = useState<any>(null);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);

    useEffect(() => {
        if (isOpen) {
            setCoverLetter('');
            setCvSelection('default');
            setNewCvFile(null);
            setFileName(null);
            setAnalysisStep('form');
            setAnalysisResult(null);
            setAnalysisError(null);
        }
    }, [isOpen]);

    useEffect(() => {
        let interval: ReturnType<typeof setTimeout>;
        if (analysisStep === 'loading') {
            let messageIndex = 0;
            interval = setInterval(() => {
                messageIndex++;
                setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [analysisStep]);

    if (!isOpen || !job) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setNewCvFile(file);
            setFileName(file.name);
        }
    };
    
    const handleSubmit = () => {
        const cvFile = cvSelection === 'new' && newCvFile ? newCvFile : 'My_CV_Gideon_Shapira.pdf';
        onApply({ jobTitle: job.title, coverLetter, cvFile });
    };

    const handleAnalyze = async () => {
        setAnalysisStep('loading');
        setAnalysisError(null);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    matchScore: { type: Type.NUMBER, description: "Match score between 0 and 100" },
                    strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-4 key strengths" },
                    suggestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-4 suggestions for improvement" }
                },
                required: ['matchScore', 'strengths', 'suggestions']
            };

            const prompt = `Analyze this candidate's resume content for the job "${job.title}".
            
            Job Requirements: ${job.requirements.join(', ')}
            Job Description: ${job.description}
            
            Candidate Resume: ${mockCVText}
            
            Provide a detailed analysis in Hebrew, including a match score, specific strengths relative to this job, and tips for improving the resume for this specific application.`;

            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                },
            });

            if (result.text) {
                const data = JSON.parse(result.text);
                setAnalysisResult(data);
                setAnalysisStep('result');
            } else {
                throw new Error("Empty response from AI");
            }
        } catch (err) {
            console.error("AI Analysis Error:", err);
            setAnalysisError("אירעה שגיאה בניתוח ה-AI. ניתן להמשיך בהגשה רגילה.");
            setAnalysisStep('error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold">הגשת מועמדות</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover"><XMarkIcon className="w-5 h-5"/></button>
                </header>

                <main className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                    {analysisStep === 'loading' ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center">
                            <div className="relative w-20 h-20 mb-6">
                                <div className="absolute inset-0 border-4 border-primary-100 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                                <SparklesIcon className="absolute inset-0 m-auto w-10 h-10 text-primary-600 animate-pulse" />
                            </div>
                            <h3 className="text-xl font-bold text-text-default mb-2">מנתח מועמדות...</h3>
                            <p className="text-primary-600 font-medium">{loadingMessage}</p>
                        </div>
                    ) : analysisStep === 'result' ? (
                        <AIAnalysisResult result={analysisResult} onBack={() => setAnalysisStep('form')} />
                    ) : (
                        <>
                            <p>אתה מגיש מועמדות למשרת <span className="font-bold text-primary-700">{job.title}</span> ב<span className="font-bold">{job.client}</span>.</p>
                            
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">קורות חיים למשלוח</h3>
                                
                                <div className="space-y-2">
                                    <label className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${cvSelection === 'default' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:border-primary-200'}`}>
                                        <div className="flex items-center gap-3">
                                            <input type="radio" checked={cvSelection === 'default'} onChange={() => setCvSelection('default')} className="w-4 h-4 text-primary-600" />
                                            <div>
                                                <p className="text-sm font-bold">My_CV_Gideon_Shapira.pdf</p>
                                                <p className="text-xs text-text-muted">הקובץ השמור במערכת</p>
                                            </div>
                                        </div>
                                        <DocumentTextIcon className="w-6 h-6 text-text-subtle" />
                                    </label>

                                    <label className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all ${cvSelection === 'new' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:border-primary-200'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <input type="radio" checked={cvSelection === 'new'} onChange={() => setCvSelection('new')} className="w-4 h-4 text-primary-600" />
                                                <span className="text-sm font-bold">העלאת קובץ חדש</span>
                                            </div>
                                            <ArrowUpTrayIcon className="w-5 h-5 text-text-subtle" />
                                        </div>
                                        {cvSelection === 'new' && (
                                            <div className="mt-3">
                                                <input type="file" onChange={handleFileChange} className="block w-full text-xs text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-muted mb-2 uppercase tracking-wider">מכתב מקדים (אופציונלי)</label>
                                <textarea 
                                    value={coverLetter} 
                                    onChange={(e) => setCoverLetter(e.target.value)} 
                                    rows={4} 
                                    className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-primary-500 focus:border-primary-500 transition shadow-sm" 
                                    placeholder="ספר/י למגייסים למה את/ה מתאימ/ה לתפקיד..."
                                ></textarea>
                            </div>

                            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <SparklesIcon className="w-5 h-5 text-primary-600" />
                                    <h4 className="font-bold text-primary-900 text-sm">שפר/י את סיכויי הקבלה שלך</h4>
                                </div>
                                <p className="text-xs text-primary-800 leading-relaxed mb-3">
                                    ה-AI שלנו יכול לנתח את קורות החיים שלך מול דרישות המשרה ולתת לך טיפים לשיפור המועמדות לפני השליחה.
                                </p>
                                <button 
                                    type="button"
                                    onClick={handleAnalyze}
                                    className="w-full bg-white text-primary-700 font-bold py-2 rounded-lg border border-primary-200 hover:bg-primary-50 transition shadow-sm flex items-center justify-center gap-2 text-sm"
                                >
                                    נתח מועמדות עם AI
                                </button>
                            </div>

                            {analysisError && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2">
                                    <XMarkIcon className="w-4 h-4 flex-shrink-0" />
                                    {analysisError}
                                </div>
                            )}
                        </>
                    )}
                </main>

                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
                    <button onClick={onClose} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={analysisStep === 'loading' || (cvSelection === 'new' && !newCvFile)}
                        className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        שלח מועמדות
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ApplyModal;
