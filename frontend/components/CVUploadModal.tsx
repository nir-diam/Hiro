
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { XMarkIcon, ArrowUpTrayIcon, SparklesIcon, CheckCircleIcon, DocumentTextIcon } from './Icons';

interface CVUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (data: any) => void;
}

const loadingMessages = [
    'קורא את הקובץ...',
    'מפענח את הטקסט...',
    'מחלץ פרטים אישיים...',
    'מנתח ניסיון תעסוקתי...',
    'בונה את הפרופיל שלך...',
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

const CVUploadModal: React.FC<CVUploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let interval: ReturnType<typeof setTimeout>;
        if (isProcessing) {
            let messageIndex = 0;
            interval = setInterval(() => {
                messageIndex = (messageIndex + 1) % loadingMessages.length;
                setLoadingMessage(loadingMessages[messageIndex]);
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [isProcessing]);

    if (!isOpen) return null;

    const processFile = async (file: File) => {
        setIsProcessing(true);
        setError(null);

        try {
            // FIX: Removed "as string" from API key initialization as per guidelines
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const base64Data = await blobToBase64(file);

            const responseSchema = {
                type: Type.OBJECT,
                properties: {
                    fullName: { type: Type.STRING, description: "The candidate's full name in Hebrew." },
                    email: { type: Type.STRING, description: "Email address." },
                    phone: { type: Type.STRING, description: "Phone number." },
                    location: { type: Type.STRING, description: "City or area of residence (e.g. 'Tel Aviv')." },
                    title: { type: Type.STRING, description: "The candidate's main professional title (e.g., 'Senior Marketing Manager'). INFER this from the most recent or significant role if not explicitly stated at the top." },
                    professionalSummary: { type: Type.STRING, description: "A concise professional summary (2-3 sentences) in Hebrew describing the candidate's main role, years of experience, and key education details. GENERATE one based on the resume content if a summary section is missing." },
                    education: {
                        type: Type.ARRAY,
                        description: "List of educational background.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                degree: { type: Type.STRING, description: "Degree or certification name" },
                                institution: { type: Type.STRING, description: "Institution name" },
                                years: { type: Type.STRING, description: "Years of study" }
                            }
                        }
                    },
                    educationSummary: { type: Type.STRING, description: "A fallback string summary of education if structured data cannot be perfectly extracted." },
                    skills: { 
                        type: Type.ARRAY, 
                        items: { type: Type.STRING },
                        description: "List of professional skills, technologies, and keywords. EXTRACT these from work experience descriptions if a dedicated skills list is missing."
                    },
                    languages: {
                        type: Type.ARRAY,
                        items: {
                             type: Type.OBJECT,
                             properties: {
                                 name: { type: Type.STRING },
                                 level: { type: Type.NUMBER },
                                 levelText: { type: Type.STRING }
                             }
                        }
                    },
                    workExperience: {
                        type: Type.ARRAY,
                        description: "List of work experiences. Try to extract as many details as possible.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING, description: "Job title" },
                                company: { type: Type.STRING, description: "Company name" },
                                startDate: { type: Type.STRING, description: "Start date (YYYY-MM or Year)" },
                                endDate: { type: Type.STRING, description: "End date (YYYY-MM, Year, or 'Present')" },
                                description: { type: Type.STRING, description: "Description of responsibilities and achievements" }
                            }
                        }
                    }
                },
                required: ['fullName', 'email', 'phone', 'title', 'professionalSummary']
            };

            const prompt = `You are an expert HR recruiter. Analyze the provided CV file and extract structured data in Hebrew. 
            
            CRITICAL INSTRUCTIONS:
            1. **Main Profile (Title)**: If there is no explicit title at the top, INFER the professional title based on the candidate's most recent or most significant role.
            2. **Professional Summary**: If a "Summary" or "Profile" section is missing, YOU MUST GENERATE a summary based on their experience, years in the field, and education.
            3. **Skills/Tags**: If there is no list of skills, EXTRACT key technologies, tools, and soft skills mentioned in the work experience text.
            4. **Work Experience**: Do your best to identify job blocks even if formatting is complex.
            5. **Education**: Ensure education is extracted.

            Respond ONLY in JSON format matching the schema.`;

            // FIX: Updated model to gemini-3-pro-preview for complex structured text parsing task
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: {
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: file.type, data: base64Data } }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                },
            });

            const parsedData = JSON.parse(response.text);
            onUploadSuccess(parsedData);

        } catch (err) {
            console.error("Error parsing CV:", err);
            setError("אירעה שגיאה בעיבוד הקובץ. אנא נסה שנית או העלה קובץ אחר.");
            setIsProcessing(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.type === 'application/pdf' || file.type === 'text/plain')) {
            processFile(file);
        } else {
            setError("קובץ לא נתמך. נא להעלות PDF או TXT.");
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-border-default relative">
                <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full text-text-muted hover:bg-bg-hover z-10">
                    <XMarkIcon className="w-6 h-6" />
                </button>

                <div className="p-8 text-center">
                    {isProcessing ? (
                        <div className="py-12">
                            <div className="relative w-20 h-20 mx-auto mb-6">
                                <div className="absolute inset-0 border-4 border-bg-subtle rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin"></div>
                                <SparklesIcon className="absolute inset-0 m-auto w-8 h-8 text-primary-500 animate-pulse" />
                            </div>
                            <h3 className="text-xl font-bold text-text-default mb-2">מנתח נתונים...</h3>
                            <p className="text-primary-600 font-medium animate-pulse">{loadingMessage}</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-16 h-16 bg-primary-100 text-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <DocumentTextIcon className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-text-default mb-2">העלאת קורות חיים</h2>
                            <p className="text-text-muted mb-8">
                                המערכת תנתח את הקובץ באופן אוטומטי ותמלא עבורך את פרופיל המועמד.
                            </p>

                            <div 
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                                className={`border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer relative ${
                                    isDragging 
                                    ? 'border-primary-500 bg-primary-50' 
                                    : 'border-border-default bg-bg-subtle hover:border-primary-300 hover:bg-bg-hover'
                                }`}
                            >
                                <input 
                                    type="file" 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={handleFileSelect}
                                    accept=".pdf,.txt"
                                />
                                <ArrowUpTrayIcon className={`w-10 h-10 mx-auto mb-4 ${isDragging ? 'text-primary-600' : 'text-text-subtle'}`} />
                                <p className="text-sm font-bold text-text-default">לחץ להעלאה או גרור קובץ לכאן</p>
                                <p className="text-xs text-text-muted mt-1">PDF, TXT (עד 5MB)</p>
                            </div>

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-red-600 text-sm">
                                    <XMarkIcon className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CVUploadModal;
