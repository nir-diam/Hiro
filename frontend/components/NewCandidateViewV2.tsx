
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GoogleGenAI, Type } from '@google/genai';

// Import the refactored, reusable components
import MainContent from './MainContent';
import ResumeViewer from './ResumeViewer';
import CandidateProfile from './CandidateProfile';
import AIFeedbackModal from './AIFeedbackModal';

// Add ArrowLeftIcon to the imports
import { 
    ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon, BuildingOffice2Icon, 
    FlagIcon, UserPlusIcon, DocumentTextIcon, PencilIcon, XMarkIcon, ArrowLeftIcon 
} from './Icons';
import { MessageMode } from '../hooks/useUIState';
import CVUploadModal from './CVUploadModal';
import { useLanguage } from '../context/LanguageContext';

type CreationMode = 'choice' | 'ai_input' | 'ai_result' | 'manual';

const initialCandidateState = {
    fullName: "",
    status: "חדש",
    phone: "",
    email: "",
    address: "",
    idNumber: "",
    maritalStatus: "-",
    gender: "זכר",
    drivingLicense: "-",
    mobility: "-",
    employmentType: 'שכיר',
    jobScope: 'מלאה',
    availability: 'מיידי (עד חודש)',
    physicalWork: 'לא רלוונטי',
    birthYear: "",
    birthMonth: "",
    birthDay: "",
    age: "",
    education: [] as { id: number; value: string }[],
    skills: { soft: [], technical: [] },
    languages: [] as { id: number; name: string; level: number; levelText: string }[],
    salaryMin: 8000,
    salaryMax: 12000,
    tags: [] as string[],
    title: "",
    professionalSummary: "",
    workExperience: [] as any[],
    industryAnalysis: {
        industries: [] as { label: string; percentage: number; color: string }[],
        smartTags: {
            domains: [] as string[],
            orgDNA: { label: '', subLabel: '', icon: null }
        }
    }
};

const initialResumeState = {
    name: '',
    contact: '',
    summary: 'התוכן יופיע כאן לאחר ניתוח קורות החיים.',
    experience: [],
};

const loadingMessages = [
    'קורא את הקובץ...',
    'מנתח ניסיון תעסוקתי...',
    'מזהה כישורים ותגיות...',
    'ממפה פרופיל תעשייתי...',
    'בונה את הפרופיל הסופי...'
];

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

const NewCandidateViewV2: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLanguage();
    const [creationMode, setCreationMode] = useState<CreationMode>('choice');
    const [formData, setFormData] = useState<any>(initialCandidateState);
    const [resumeData, setResumeData] = useState<any>(initialResumeState);
    const [pastedResumeText, setPastedResumeText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [parsedSummary, setParsedSummary] = useState<string[] | null>(null);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    const applyParsedData = (importedData: any) => {
        let educationData: any[] = [];
        if (importedData.education && importedData.education.length > 0) {
                educationData = importedData.education.map((edu: any, index: number) => ({ 
                id: index, 
                value: `${edu.years ? edu.years + ' : ' : ''}${edu.degree || ''}${edu.institution ? ', ' + edu.institution : ''}` 
            }));
        } else if (importedData.educationSummary) {
            educationData = [{ id: 0, value: importedData.educationSummary }];
        }

        const workExperience = importedData.workExperience?.map((exp: any, index: number) => ({
            id: Date.now() + index,
            title: exp.title || '',
            company: exp.company || '',
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
            description: exp.description || '',
            companyField: ''
        })) || [];

        const industryColors = ['bg-purple-500', 'bg-indigo-400', 'bg-blue-400', 'bg-sky-400'];
        const industries = importedData.industryAnalysis?.industries?.map((ind: any, index: number) => ({
            label: ind.label,
            percentage: ind.percentage,
            color: industryColors[index % industryColors.length]
        })) || [];

        const smartTags = {
            domains: importedData.industryAnalysis?.professionalFocus || [],
            orgDNA: {
                label: importedData.industryAnalysis?.organizationalEnvironment?.type || '',
                subLabel: importedData.industryAnalysis?.organizationalEnvironment?.details || '',
                icon: <BuildingOffice2Icon className="w-3.5 h-3.5" />
            }
        };

        setFormData((prev: any) => ({
            ...prev,
            fullName: importedData.fullName || prev.fullName,
            email: importedData.email || prev.email,
            phone: importedData.phone || prev.phone,
            address: importedData.address || prev.address,
            title: importedData.title || prev.title,
            professionalSummary: importedData.professionalSummary || importedData.summary || prev.professionalSummary,
            tags: importedData.skills || prev.tags,
            workExperience: workExperience.length > 0 ? workExperience : prev.workExperience,
            education: educationData.length > 0 ? educationData : prev.education,
            languages: importedData.languages && importedData.languages.length > 0 ? importedData.languages.map((lang: any, index: number) => ({id: index, name: lang.name, level: 50, levelText: lang.level || 'טוב'})) : prev.languages,
            industryAnalysis: {
                industries: industries,
                parentCategory: importedData.industryAnalysis?.parentCategory || '',
                smartTags: smartTags
            }
        }));
        
        setResumeData({
            name: importedData.fullName || 'Candidate',
            contact: `${importedData.email || ''} ${importedData.phone || ''}`,
            summary: importedData.professionalSummary || importedData.summary || 'No summary extracted.',
            experience: workExperience.map((exp: any) => `<b>${exp.title}</b> at ${exp.company}<br/>${exp.description}`),
        });
        setCreationMode('ai_result');
    };

    const handleParse = useCallback(async (inputType: 'file' | 'text', data: Blob | string) => {
        setIsParsing(true);
        setParseError(null);
        setParsedSummary(null);

        let messageIndex = 0;
        const interval = setInterval(() => {
            setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
            messageIndex++;
        }, 1500);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    fullName: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    address: { type: Type.STRING },
                    title: { type: Type.STRING },
                    professionalSummary: { type: Type.STRING },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    industryAnalysis: {
                        type: Type.OBJECT,
                        properties: {
                            industries: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        label: { type: Type.STRING },
                                        percentage: { type: Type.INTEGER }
                                    },
                                    required: ['label', 'percentage']
                                }
                            },
                            professionalFocus: { type: Type.ARRAY, items: { type: Type.STRING } },
                            organizationalEnvironment: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    details: { type: Type.STRING }
                                },
                                required: ['type', 'details']
                            }
                        },
                        required: ['industries', 'professionalFocus', 'organizationalEnvironment']
                    },
                    workExperience: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                company: { type: Type.STRING },
                                startDate: { type: Type.STRING },
                                endDate: { type: Type.STRING },
                                description: { type: Type.STRING }
                            }
                        } 
                    },
                    education: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                degree: { type: Type.STRING },
                                institution: { type: Type.STRING },
                                years: { type: Type.STRING }
                            }
                        }
                    },
                    languages: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, level: { type: Type.STRING } } } }
                },
                required: ['fullName', 'title', 'professionalSummary', 'skills', 'industryAnalysis']
            };
            
            let requestContents: any;
            let promptText = `Analyze the provided CV and extract structured data in Hebrew. Infer the professional title and generate a punchy professional summary.`;

            if (inputType === 'file' && data instanceof Blob) {
                const base64Data = await blobToBase64(data);
                requestContents = {
                    parts: [
                        { text: promptText },
                        { inlineData: { mimeType: data.type, data: base64Data } }
                    ]
                };
            } else {
                requestContents = `${promptText}\n\n${data}`;
            }
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: requestContents,
                 config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                },
            });
            
            const parsedJson = JSON.parse(response.text);
            
            const summaryItems: string[] = [];
            if (parsedJson.fullName) summaryItems.push('שם מלא');
            if (parsedJson.phone) summaryItems.push('טלפון');
            if (parsedJson.title) summaryItems.push('פרופיל ראשי');
            if (parsedJson.industryAnalysis) summaryItems.push('ניתוח תעשייתי');
            
            setParsedSummary(summaryItems);
            applyParsedData(parsedJson);

        } catch (error: any) {
            setParseError("שגיאה בניתוח קורות החיים. אנא נסה שנית או הזן ידנית.");
        } finally {
            setIsParsing(false);
            clearInterval(interval);
            setLoadingMessage('');
        }
    }, []);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await handleParse('file', file);
    }, [handleParse]);

    const handleSave = () => {
        alert('מועמד נשמר בהצלחה!');
        navigate('/candidates');
    };

    // --- RENDER HELPERS ---

    const ChoiceScreen = () => (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 animate-fade-in">
            <h2 className="text-3xl font-black text-text-default mb-2">{t('new_candidate.title')}</h2>
            <p className="text-text-muted mb-12">{t('new_candidate.subtitle')}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
                {/* AI Option */}
                <button 
                    onClick={() => setCreationMode('ai_input')}
                    className="flex flex-col items-center text-center p-8 bg-bg-card rounded-3xl border-2 border-primary-500 shadow-xl shadow-primary-500/10 hover:shadow-primary-500/20 hover:scale-105 transition-all group"
                >
                    <div className="w-20 h-20 bg-primary-100 text-primary-600 rounded-2xl flex items-center justify-center mb-6 group-hover:rotate-6 transition-transform">
                        <SparklesIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-text-default mb-3">{t('new_candidate.card_ai_title')}</h3>
                    <p className="text-sm text-text-muted leading-relaxed">
                        {t('new_candidate.card_ai_desc')}
                    </p>
                </button>

                {/* Manual Option */}
                <button 
                    onClick={() => setCreationMode('manual')}
                    className="flex flex-col items-center text-center p-8 bg-bg-card rounded-3xl border-2 border-border-default hover:border-primary-300 hover:shadow-lg hover:scale-105 transition-all group"
                >
                    <div className="w-20 h-20 bg-bg-subtle text-text-muted rounded-2xl flex items-center justify-center mb-6 group-hover:-rotate-6 transition-transform">
                        <UserPlusIcon className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-bold text-text-default mb-3">{t('new_candidate.card_manual_title')}</h3>
                    <p className="text-sm text-text-muted leading-relaxed">
                        {t('new_candidate.card_manual_desc')}
                    </p>
                </button>
            </div>
        </div>
    );

    const AIInputScreen = () => (
        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in py-8">
            <button onClick={() => setCreationMode('choice')} className="text-sm font-bold text-text-muted hover:text-primary-600 flex items-center gap-1 transition-colors">
                <ArrowLeftIcon className="w-4 h-4 transform rotate-180" />
                {t('new_candidate.back_to_choice')}
            </button>

            <div className="bg-bg-card rounded-3xl shadow-xl border border-border-default p-8 relative overflow-hidden">
                {isParsing && (
                    <div className="absolute inset-0 bg-bg-card/95 z-50 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                        <div className="relative w-24 h-24 mb-6">
                             <div className="absolute inset-0 border-4 border-primary-100 rounded-full"></div>
                             <div className="absolute inset-0 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
                             <SparklesIcon className="absolute inset-0 m-auto w-10 h-10 text-primary-600 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold mb-2">{t('new_candidate.analyzing')}</h3>
                        <p className="text-primary-600 font-medium text-lg">{loadingMessage}</p>
                    </div>
                )}

                <div className="mb-10">
                    <h3 className="text-2xl font-black text-text-default mb-4">{t('new_candidate.ai_parsing_title')}</h3>
                    <textarea
                        value={pastedResumeText}
                        onChange={(e) => setPastedResumeText(e.target.value)}
                        rows={6}
                        placeholder={t('new_candidate.ai_parsing_placeholder')}
                        className="w-full bg-bg-input border border-border-default rounded-2xl p-4 text-sm focus:ring-2 focus:ring-primary-500 transition-all resize-none"
                    />
                    <button
                        onClick={() => handleParse('text', pastedResumeText)}
                        disabled={!pastedResumeText.trim()}
                        className="mt-4 w-full sm:w-auto bg-primary-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-700 transition disabled:opacity-50"
                    >
                        {t('new_candidate.btn_analyze_text')}
                    </button>
                </div>

                <div className="flex items-center gap-4 my-8">
                    <div className="h-px bg-border-default flex-grow"></div>
                    <span className="text-xs font-bold text-text-subtle uppercase">{t('new_candidate.or_upload')}</span>
                    <div className="h-px bg-border-default flex-grow"></div>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-border-default border-dashed rounded-3xl bg-bg-subtle/30 cursor-pointer hover:bg-bg-subtle hover:border-primary-400 transition-all">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ArrowUpTrayIcon className="w-10 h-10 mb-4 text-primary-500" />
                        <p className="mb-1 text-lg font-bold text-text-default">{t('new_candidate.dropzone_text')}</p>
                        <p className="text-sm text-text-muted">PDF, TXT</p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.txt" />
                </label>
            </div>
        </div>
    );

    const AIResultScreen = () => (
        <div className="max-w-5xl mx-auto py-8 space-y-6 animate-fade-in">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-green-800">{t('new_candidate.success_title')}</h3>
                        <p className="text-sm text-green-700">{t('new_candidate.success_extracted', { items: parsedSummary?.join(', ') })}</p>
                    </div>
                </div>
                <button onClick={() => setCreationMode('ai_input')} className="text-sm font-bold text-green-800 hover:underline">{t('new_candidate.try_another')}</button>
            </div>

            <div className="bg-bg-card rounded-3xl border border-border-default shadow-sm p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-text-default px-4">{t('new_candidate.review_profile')}</h2>
                <div className="flex gap-3">
                    <button onClick={() => setCreationMode('choice')} className="px-6 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">{t('new_candidate.btn_cancel')}</button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20">{t('new_candidate.btn_save')}</button>
                </div>
            </div>

            <CandidateProfile 
                candidateData={formData} 
                onMatchJobsClick={() => {}}
                onScreenCandidateClick={() => {}}
                onOpenMessageModal={() => {}}
                onTagsChange={(t) => setFormData({...formData, tags: t})}
                onFormChange={setFormData}
                isFavorite={false}
                onToggleFavorite={() => {}}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MainContent formData={formData} onFormChange={setFormData} />
                <ResumeViewer resumeData={resumeData} />
            </div>
        </div>
    );

    const ManualScreen = () => (
        <div className="max-w-5xl mx-auto py-8 space-y-6 animate-fade-in">
            <div className="bg-bg-card rounded-3xl border border-border-default shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => setCreationMode('choice')} className="p-2 rounded-full hover:bg-bg-hover"><ArrowLeftIcon className="w-5 h-5 transform rotate-180" /></button>
                    <h2 className="text-xl font-bold text-text-default">{t('new_candidate.manual_title')}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setCreationMode('choice')} className="px-6 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">{t('new_candidate.btn_cancel')}</button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20">{t('new_candidate.btn_save')}</button>
                </div>
            </div>

            <CandidateProfile 
                candidateData={formData} 
                onMatchJobsClick={() => {}}
                onScreenCandidateClick={() => {}}
                onOpenMessageModal={() => {}}
                onTagsChange={(t) => setFormData({...formData, tags: t})}
                onFormChange={setFormData}
                isFavorite={false}
                onToggleFavorite={() => {}}
            />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MainContent formData={formData} onFormChange={setFormData} />
                <div className="bg-bg-subtle/50 rounded-3xl border-2 border-dashed border-border-default flex flex-col items-center justify-center p-12 text-center">
                    <DocumentTextIcon className="w-16 h-16 text-text-subtle mb-4" />
                    <h3 className="text-lg font-bold text-text-default">{t('new_candidate.no_cv_title')}</h3>
                    <p className="text-sm text-text-muted max-w-xs mt-2">{t('new_candidate.no_cv_desc')}</p>
                </div>
            </div>
        </div>
    );

    // --- MAIN RENDER LOGIC ---

    return (
        <div className="min-h-full">
            {creationMode === 'choice' && <ChoiceScreen />}
            {creationMode === 'ai_input' && <AIInputScreen />}
            {creationMode === 'ai_result' && <AIResultScreen />}
            {creationMode === 'manual' && <ManualScreen />}
            
            <AIFeedbackModal 
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                context="Manual vs AI Flow"
            />
        </div>
    );
};

export default NewCandidateViewV2;
