
import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { XMarkIcon, SparklesIcon, ChartBarIcon, LightBulbIcon } from './Icons';
import { Job } from './JobsView';

interface JobsAIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedJobs: Job[];
}

const JobsAIAnalysisModal: React.FC<JobsAIAnalysisModalProps> = ({ isOpen, onClose, selectedJobs }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [analysis, setAnalysis] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && selectedJobs.length > 0) {
            analyzeJobs();
        }
    }, [isOpen, selectedJobs]);

    const analyzeJobs = async () => {
        setIsLoading(true);
        setAnalysis(null);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            // Prepare data for AI
            const jobsSummary = selectedJobs.map(j => ({
                title: j.title,
                client: j.client,
                status: j.status,
                daysOpen: Math.floor((new Date().getTime() - new Date(j.openDate).getTime()) / (1000 * 60 * 60 * 24)),
                candidates: j.associatedCandidates,
                waiting: j.waitingForScreening,
                process: j.activeProcess
            }));

            const prompt = `
            Analyze the following recruitment data for ${selectedJobs.length} jobs.
            Data: ${JSON.stringify(jobsSummary)}
            
            Provide a concise strategic analysis in Hebrew:
            1. Identify bottlenecks (high candidates but low process).
            2. Identify successful jobs.
            3. Suggest specific actions for the recruiter to improve efficiency.
            
            Format as an HTML-ready string (using <b>, <ul>, <li>, <br> tags) but do NOT wrap in \`\`\`html.
            Keep it professional and actionable.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });

            setAnalysis(response.text || 'לא התקבל ניתוח.');
        } catch (error) {
            console.error("AI Error:", error);
            setAnalysis('אירעה שגיאה בניתוח הנתונים.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl border border-border-default flex flex-col overflow-hidden animate-fade-in max-h-[80vh]">
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-bg-subtle/30">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-purple-100 rounded-lg text-purple-700">
                            <SparklesIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-text-default">ניתוח משרות חכם</h2>
                            <p className="text-xs text-text-muted">ניתוח {selectedJobs.length} משרות נבחרות</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                <main className="p-6 overflow-y-auto custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 relative mb-4">
                                <div className="absolute inset-0 rounded-full border-4 border-purple-100"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-purple-600 border-t-transparent animate-spin"></div>
                                <SparklesIcon className="absolute inset-0 m-auto w-6 h-6 text-purple-600 animate-pulse"/>
                            </div>
                            <h3 className="text-lg font-bold text-text-default mb-1">מעבד נתונים...</h3>
                            <p className="text-text-muted text-sm">ה-AI מנתח את ביצועי המשרות והתהליכים</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-gradient-to-r from-purple-50 to-white p-4 rounded-xl border border-purple-100">
                                <h3 className="font-bold text-purple-900 flex items-center gap-2 mb-3">
                                    <LightBulbIcon className="w-5 h-5" />
                                    תובנות והמלצות
                                </h3>
                                <div 
                                    className="text-sm text-text-default leading-relaxed space-y-2 [&>ul]:list-disc [&>ul]:pr-5 [&>ul>li]:mb-1"
                                    dangerouslySetInnerHTML={{ __html: analysis || '' }} 
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default text-center">
                                    <span className="text-xs font-bold text-text-muted uppercase block mb-1">סה"כ מועמדים</span>
                                    <span className="text-2xl font-black text-text-default">
                                        {selectedJobs.reduce((acc, j) => acc + j.associatedCandidates, 0)}
                                    </span>
                                </div>
                                <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default text-center">
                                    <span className="text-xs font-bold text-text-muted uppercase block mb-1">ממוצע ימים באוויר</span>
                                    <span className="text-2xl font-black text-text-default">
                                        {Math.round(selectedJobs.reduce((acc, j) => acc + Math.floor((new Date().getTime() - new Date(j.openDate).getTime()) / (1000 * 60 * 60 * 24)), 0) / selectedJobs.length)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default JobsAIAnalysisModal;
