import { normalizeOriginalTextHistory } from './parsedTextHistory';

const MAX_CV_CHARS = 20000;
const MAX_HISTORY_ENTRY_CHARS = 8000;

function clipText(value: unknown, max = MAX_CV_CHARS): string {
    return String(value ?? '').trim().slice(0, max);
}

function buildGeneratedCvPlainText(data: {
    fullName?: string;
    title?: string;
    professionalSummary?: string;
    workExperience?: any[];
    education?: any[];
    tags?: string[];
    softSkills?: string[];
    techSkills?: string[];
    languages?: any[];
}): string {
    const lines: string[] = [];
    const name = String(data.fullName || '').trim();
    const title = String(data.title || '').trim();
    if (name) lines.push(name);
    if (title) lines.push(title);

    const summary = String(data.professionalSummary || '').trim();
    if (summary) {
        lines.push('');
        lines.push('תקציר מקצועי:');
        lines.push(summary);
    }

    const work = Array.isArray(data.workExperience) ? data.workExperience : [];
    if (work.length) {
        lines.push('');
        lines.push('ניסיון תעסוקתי:');
        for (const exp of work) {
            const jobTitle = String(exp?.title || '').trim();
            const company = String(exp?.company || '').trim();
            const dates = [exp?.startDate, exp?.endDate].filter(Boolean).join(' – ');
            const header = [jobTitle, company].filter(Boolean).join(' @ ');
            if (header) lines.push(`- ${header}${dates ? ` (${dates})` : ''}`);
            const desc = String(exp?.description || '').trim();
            if (desc) lines.push(desc);
        }
    }

    const education = Array.isArray(data.education) ? data.education : [];
    if (education.length) {
        lines.push('');
        lines.push('השכלה:');
        for (const edu of education) {
            const line =
                String(edu?.value || edu?.degree || edu?.institution || edu?.school || '').trim() ||
                [edu?.degree, edu?.institution].filter(Boolean).join(' — ');
            if (line) lines.push(`- ${line}`);
        }
    }

    const skills = [
        ...(Array.isArray(data.softSkills) ? data.softSkills : []),
        ...(Array.isArray(data.techSkills) ? data.techSkills : []),
        ...(Array.isArray(data.tags) ? data.tags : []),
    ]
        .map((s) => String(s || '').trim())
        .filter(Boolean);
    if (skills.length) {
        lines.push('');
        lines.push(`מיומנויות: ${skills.slice(0, 40).join(', ')}`);
    }

    return lines.join('\n').trim();
}

/** Build Hiro AI chat context: profile fields + original CV + generated/parsed CV. */
export function buildCandidateChatContext(formData: any) {
    const fd = formData && typeof formData === 'object' ? formData : {};
    const parsedCvText = clipText(fd.searchText ?? fd.resumeText ?? fd.cvText ?? '');
    const originalHistory = normalizeOriginalTextHistory(fd.originalText);
    const originalCvTexts = originalHistory.map((entry) => entry.text).filter(Boolean);
    const latestOriginalCv = originalCvTexts.length
        ? clipText(originalCvTexts[originalCvTexts.length - 1], MAX_CV_CHARS)
        : '';
    const originalCvTextHistory = originalCvTexts
        .slice(-3)
        .map((text) => clipText(text, MAX_HISTORY_ENTRY_CHARS));

    const generatedResume = {
        fullName: fd.fullName || [fd.firstName, fd.lastName].filter(Boolean).join(' '),
        title: fd.title || '',
        professionalSummary: fd.professionalSummary || '',
        workExperience: Array.isArray(fd.workExperience) ? fd.workExperience : [],
        education: Array.isArray(fd.education) ? fd.education : [],
        tags: Array.isArray(fd.tags) ? fd.tags : [],
        softSkills: Array.isArray(fd.softSkills) ? fd.softSkills : fd.skills?.soft || [],
        techSkills: Array.isArray(fd.techSkills) ? fd.techSkills : fd.skills?.technical || [],
        languages: Array.isArray(fd.languages) ? fd.languages : [],
    };

    const generatedCvText = clipText(buildGeneratedCvPlainText(generatedResume));

    return {
        ...fd,
        id: fd.backendId || fd.id,
        searchText: parsedCvText,
        resumeText: parsedCvText || clipText(fd.resumeText),
        originalCvText: latestOriginalCv,
        originalCvTextHistory,
        generatedResume,
        generatedCvText,
    };
}
