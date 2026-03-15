
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

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
import { generateExperienceSummaryForCandidate } from '../services/experienceSummaryService';

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
    tagDetails: [] as any[],
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
    workExperience: [],
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
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [creationMode, setCreationMode] = useState<CreationMode>('choice');
    const [formData, setFormData] = useState<any>(initialCandidateState);
    const [resumeData, setResumeData] = useState<any>(initialResumeState);
    const [pastedResumeText, setPastedResumeText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [parsedSummary, setParsedSummary] = useState<string[] | null>(null);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [aiCandidateId, setAiCandidateId] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [generateSummaryError, setGenerateSummaryError] = useState<string | null>(null);
    const [candidateId, setCandidateId] = useState<string | null>(null);
    useEffect(() => {
        setResumeData((prev: any) => ({
            ...prev,
            candidateId: candidateId || aiCandidateId || prev.candidateId,
        }));
    }, [candidateId, aiCandidateId]);

    useEffect(() => {
        const existingId = formData.id || (formData.backendId || null);
        if (existingId && existingId !== candidateId) {
            setCandidateId(existingId);
            setAiCandidateId(existingId);
        }
    }, [formData.id, formData.backendId]);

    const getAuthHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const crc32base64 = async (file: File) => {
        const table = new Uint32Array(256).map((_, n) => {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            return c >>> 0;
        });
        const buf = new Uint8Array(await file.arrayBuffer());
        let crc = 0 ^ -1;
        for (let i = 0; i < buf.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
        }
        crc = (crc ^ -1) >>> 0;
        const bytes = new Uint8Array(4);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, crc);
        return btoa(String.fromCharCode(...bytes));
    };

    const ensureCandidateRecord = async () => {
        if (candidateId) return candidateId;
        if (!apiBase) {
            alert('כתובת API חסרה.');
            return null;
        }
        try {
            const payload = { ...formData };
            if (!payload.fullName) payload.fullName = 'מועמד חדש';
            const res = await fetch(`${apiBase}/api/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'הוספת מועמד נכשלה.');
            }
            const created = await res.json();
            setCandidateId(created.id || null);
            setAiCandidateId(created.id || null);
            return created.id || null;
        } catch (err: any) {
            console.error('Failed to ensure candidate record', err);
            alert(err?.message || 'שגיאה ביצירת מועמד.');
            return null;
        }
    };

    const uploadResumeFile = async (file: File) => {
        const id = await ensureCandidateRecord();
        if (!id) return;
        const folder = 'resumes';
        try {
            const presignRes = await fetch(`${apiBase}/api/candidates/${id}/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
            });
            if (!presignRes.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, key } = await presignRes.json();
            const urlObj = new URL(uploadUrl);
            const checksum = urlObj.searchParams.get('x-amz-checksum-crc32');
            const checksumAlgo = urlObj.searchParams.get('x-amz-sdk-checksum-algorithm');
            const headers: Record<string, string> = {};
            if (file.type) headers['Content-Type'] = file.type;
            if (checksum && checksumAlgo === 'CRC32') {
                headers['x-amz-checksum-crc32'] = await crc32base64(file);
                headers['x-amz-sdk-checksum-algorithm'] = 'CRC32';
            }
            const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: Object.keys(headers).length ? headers : undefined,
                body: file,
            });
            if (!putRes.ok) throw new Error('Upload to S3 failed');
            const attachRes = await fetch(`${apiBase}/api/candidates/${id}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({ key, type: 'resume' }),
            });
            if (!attachRes.ok) throw new Error('Failed to attach media');
            const updated = await attachRes.json();
            handleResumeUploaded(updated);
        } catch (err: any) {
            console.error('Resume upload failed', err);
            alert(err?.message || 'העלאת הקובץ נכשלה.');
        }
    };

    const handleResumeUploaded = (updated: any) => {
        setFormData((prev: any) => ({ ...prev, ...updated }));
        if (updated.id) {
            setCandidateId(updated.id);
            setAiCandidateId(updated.id);
        }
        setResumeData((prev: any) => ({
            ...prev,
            resumeUrl: updated.resumeUrl || prev.resumeUrl,
            candidateId: updated.id || prev.candidateId,
            workExperience: updated.workExperience || prev.workExperience || [],
        }));
    };

    const handleGenerateExperienceSummary = async () => {
        console.log('handleGenerateExperienceSummary (NewCandidate) invoked', { aiCandidateId, formDataId: formData.id });
        if (isGeneratingSummary) return;

        let targetId = aiCandidateId;
        if (!targetId) {
            // Must save candidate record first to get a UUID for the summary endpoint
            setIsParsing(true);
            try {
                const payload = { ...formData };
                if (!payload.fullName) payload.fullName = 'מועמד חדש';
                const base = apiBase || '';
                const res = await fetch(`${base}/api/candidates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('שגיאה ביצירת מועמד ראשוני.');
                const created = await res.json();
                setAiCandidateId(created.id);
                targetId = created.id;
            } catch (err: any) {
                setGenerateSummaryError(err.message || 'שגיאה ביצירת מועמד.');
                return;
            } finally {
                setIsParsing(false);
            }
        }

        if (!targetId) return;

        const exp = Array.isArray(formData.workExperience) && formData.workExperience.length > 0 ? formData.workExperience[0] : null;
        const payload = {
            title: exp?.title || formData.title || '',
            company: exp?.company || '',
            companyField: exp?.companyField || '',
            description: exp?.description || '',
        };

        if (!payload.title && !payload.company && !payload.companyField) {
            setGenerateSummaryError('הוסף תפקיד או חברה לפני שמפעילים את הכתיבה.');
            return;
        }

        setIsGeneratingSummary(true);
        setGenerateSummaryError(null);
        try {
            const summary = await generateExperienceSummaryForCandidate(targetId, payload);
            if (summary) {
                setFormData((prev: any) => ({ ...prev, professionalSummary: summary }));
            }
        } catch (err: any) {
            setGenerateSummaryError(err.message || 'שגיאה ביצירת תיאור ניסיון.');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const resetAiFlow = () => {
        setAiCandidateId(null);
        setParsedSummary(null);
        setResumeData(initialResumeState);
        setParseError(null);
        setPastedResumeText('');
    };

    const goToChoice = () => {
        resetAiFlow();
        if (typeof window !== 'undefined') {
            window.location.href = 'https://hiro.co.il/#/candidates';
            return;
        }
        setCreationMode('choice');
    };

    const startAiInput = () => {
        resetAiFlow();
        setCreationMode('ai_input');
    };

    const applyParsedData = (candidateData: any) => {
        if (!candidateData) return;

        const mapExperience = (items: any[]) => (Array.isArray(items)
            ? items
                .map((exp: any, index: number) => ({
                    id: exp.id || Date.now() + index,
                    title: exp.title || exp.position || '',
                    company: exp.company || exp.organization || '',
                    startDate: exp.startDate || exp.from || '',
                    endDate: exp.endDate || exp.to || '',
                    description: exp.description || exp.summary || '',
                    companyField: exp.companyField || '',
                }))
                .filter((exp) => exp.title || exp.description)
            : []);

        const mapEducation = (items: any[]) => (Array.isArray(items)
            ? items
                .map((edu: any, index: number) => ({
                    id: edu.id || index,
                    value: (
                        edu.value ||
                        edu.degree ||
                        edu.institution ||
                        edu.fieldOfStudy ||
                        ''
                    ).trim(),
                }))
                .filter((edu) => edu.value)
            : []);

        const mapLanguages = (items: any[]) => (Array.isArray(items)
            ? items.map((lang: any, index: number) => ({
                id: lang.id || index,
                name: lang.name || lang.language || '',
                level: typeof lang.level === 'number' ? lang.level : 50,
                levelText: lang.levelText || lang.proficiency || '',
            }))
            : []);

        const experience = mapExperience(candidateData.workExperience || []);
        const education = mapEducation(candidateData.education || []);
        const languages = mapLanguages(candidateData.languages || []);
        const tags = Array.isArray(candidateData.tags) ? candidateData.tags : [];
        const skillsRaw = candidateData.skills || {};
        const skills = {
            soft: Array.isArray(skillsRaw.soft) ? skillsRaw.soft : [],
            technical: Array.isArray(skillsRaw.technical) ? skillsRaw.technical : [],
        };

        const tagDetails = Array.isArray(candidateData.tagDetails) ? candidateData.tagDetails : [];
        setFormData((prev: any) => ({
            ...prev,
            fullName: candidateData.fullName || prev.fullName,
            email: candidateData.email || prev.email,
            phone: candidateData.phone || prev.phone,
            address: candidateData.address || prev.address,
            title: candidateData.title || prev.title,
            professionalSummary: candidateData.professionalSummary || candidateData.summary || prev.professionalSummary,
            tags: tags.length > 0 ? tags : prev.tags,
            tagDetails: tagDetails.length > 0 ? tagDetails : prev.tagDetails,
            skills,
            workExperience: experience.length > 0 ? experience : prev.workExperience,
            education: education.length > 0 ? education : prev.education,
            languages: languages.length > 0 ? languages : prev.languages,
            industryAnalysis: candidateData.industryAnalysis || prev.industryAnalysis,
        }));

        setResumeData({
            name: candidateData.fullName || 'Candidate',
            contact: `${candidateData.email || ''} ${candidateData.phone || ''}`.trim(),
            summary: candidateData.professionalSummary || candidateData.summary || 'No summary extracted.',
            experience: experience.map((exp: any) => `<b>${exp.title}</b> at ${exp.company}<br/>${exp.description}`),
            workExperience: experience,
        });

        setCreationMode('ai_result');
    };

    const handleParse = useCallback(async (inputType: 'file' | 'text', data: Blob | string) => {
        setIsParsing(true);
        setParseError(null);
        setParsedSummary(null);
        setAiCandidateId(null);

        let messageIndex = 0;
        const interval = setInterval(() => {
            setLoadingMessage(loadingMessages[messageIndex % loadingMessages.length]);
            messageIndex++;
        }, 1500);

        try {
            if (!apiBase) {
                throw new Error('חסר כתובת API (VITE_API_BASE)');
            }

            const payload: Record<string, unknown> = {};

            if (inputType === 'file' && data instanceof Blob) {
                const file = data as File;
                payload.fileBase64 = await blobToBase64(file);
                if (file.type) payload.mimeType = file.type;
                if (file.name) payload.fileName = file.name;
            } else if (inputType === 'text' && typeof data === 'string') {
                const trimmed = data.trim();
                if (!trimmed) {
                    throw new Error('אנא הזן טקסט תקין לניתוח.');
                }
                payload.resumeText = trimmed;
            } else {
                throw new Error('קובץ או טקסט לא חוקיים.');
            }

            const response = await fetch(`${apiBase}/api/candidates/ai`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await response.json();

            if (!response.ok) {
                throw new Error(json.message || 'שגיאה בשרת במהלך ניתוח AI.');
            }

            const candidate = json.candidate || {};
            const summaryItems: string[] = [];
            if (candidate.fullName) summaryItems.push('שם מלא');
            if (candidate.phone) summaryItems.push('טלפון');
            if (candidate.title) summaryItems.push('פרופיל ראשי');
            if (candidate.industryAnalysis?.industries?.length) summaryItems.push('ניתוח תעשייתי');

            setParsedSummary(summaryItems);
            setAiCandidateId(candidate.id || null);
            applyParsedData(candidate);
        } catch (error: any) {
            setParseError(error.message || 'שגיאה בניתוח קורות החיים. אנא נסה שנית או הזן ידנית.');
        } finally {
            setIsParsing(false);
            clearInterval(interval);
            setLoadingMessage('');
        }
    }, [apiBase, applyParsedData]);

    const processFileUpload = useCallback(async (file: File) => {
        await handleParse('file', file);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [handleParse]);

    const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            await processFileUpload(file);
        }
    }, [processFileUpload]);

    const handleDrop = useCallback(async (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) {
            await processFileUpload(file);
        }
    }, [processFileUpload]);

    const handleSave = async () => {
        if (!apiBase) {
            setParseError('חסר כתובת API (VITE_API_BASE)');
            return;
        }
        setIsParsing(true);
        setParseError(null);
        try {
            const payload = { ...formData };
            if (!payload.fullName) payload.fullName = 'מועמד חדש';
            const method = aiCandidateId ? 'PUT' : 'POST';
            const url = aiCandidateId
                ? `${apiBase}/api/candidates/${aiCandidateId}`
                : `${apiBase}/api/candidates`;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                let msg = 'שמירה נכשלה, בדוק את הפרטים ונסה שוב.';
                try {
                    const errJson = await res.json();
                    msg = errJson.message || msg;
                } catch {
                    const txt = await res.text();
                    if (txt) msg = txt;
                }
                throw new Error(msg);
            }
            const saved = await res.json();
            const resolvedId = saved.id || saved.backendId || saved.candidateId || null;
            setCandidateId(resolvedId);
            setAiCandidateId(resolvedId);
            if (resolvedId) {
                setFormData((prev: any) => ({ ...prev, ...saved }));
                navigate(`/candidates/${resolvedId}`);
            }
        } catch (err: any) {
            setParseError(err.message || 'שמירה נכשלה, נסה שוב.');
        } finally {
            setIsParsing(false);
        }
    };

    // --- RENDER HELPERS ---

    const ChoiceScreen = () => (
        <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 animate-fade-in">
            <h2 className="text-3xl font-black text-text-default mb-2">{t('new_candidate.title')}</h2>
            <p className="text-text-muted mb-12">{t('new_candidate.subtitle')}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
                {/* AI Option */}
                <button 
                    onClick={startAiInput}
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
            <button onClick={goToChoice} className="text-sm font-bold text-text-muted hover:text-primary-600 flex items-center gap-1 transition-colors">
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

                <label
                    className="flex flex-col items-center justify-center w-full h-48 border-2 border-border-default border-dashed rounded-3xl bg-bg-subtle/30 cursor-pointer hover:bg-bg-subtle hover:border-primary-400 transition-all"
                    onDrop={handleDrop}
                    onDragOver={(event) => event.preventDefault()}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ArrowUpTrayIcon className="w-10 h-10 mb-4 text-primary-500" />
                        <p className="mb-1 text-lg font-bold text-text-default">{t('new_candidate.dropzone_text')}</p>
                        <p className="text-sm text-text-muted">PDF, DOC, DOCX, PNG, JPG, JPEG</p>
                    </div>
                    <input
                        type="file"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    />
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
                <button onClick={startAiInput} className="text-sm font-bold text-green-800 hover:underline">{t('new_candidate.try_another')}</button>
            </div>

            <div className="bg-bg-card rounded-3xl border border-border-default shadow-sm p-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-text-default px-4">{t('new_candidate.review_profile')}</h2>
                <div className="flex gap-3">
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
                <MainContent 
                    formData={formData} 
                    onFormChange={setFormData} 
                    onGenerateExperienceSummary={handleGenerateExperienceSummary}
                    isGeneratingSummary={isGeneratingSummary}
                    generateSummaryError={generateSummaryError}
                />
                <ResumeViewer
                    resumeData={resumeData}
                    onUploadResume={uploadResumeFile}
                    onResumeUploaded={handleResumeUploaded}
                    candidateId={candidateId || aiCandidateId}
                />
            </div>
        </div>
    );

    const ManualScreen = () => (
        <div className="max-w-5xl mx-auto py-8 space-y-6 animate-fade-in">
            <div className="bg-bg-card rounded-3xl border border-border-default shadow-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={goToChoice} className="p-2 rounded-full hover:bg-bg-hover"><ArrowLeftIcon className="w-5 h-5 transform rotate-180" /></button>
                    <h2 className="text-xl font-bold text-text-default">{t('new_candidate.manual_title')}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={goToChoice} className="px-6 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">{t('new_candidate.btn_cancel')}</button>
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
                <MainContent 
                    formData={formData} 
                    onFormChange={setFormData} 
                    onGenerateExperienceSummary={handleGenerateExperienceSummary}
                    isGeneratingSummary={isGeneratingSummary}
                    generateSummaryError={generateSummaryError}
                />
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
