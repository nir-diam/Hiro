const apiBase = import.meta.env.VITE_API_BASE || '';

interface ExperiencePayload {
    title: string;
    company: string;
    companyField: string;
    description: string;
}

export const generateExperienceSummaryForCandidate = async (candidateId: string, payload: ExperiencePayload) => {
    const url = `${apiBase}/api/candidates/${candidateId}/generate-experience-summary`;
    console.log('generateExperienceSummaryForCandidate API call', { url, payload });
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message || 'הבקשה נכשלה');
    }
    const data = await response.json();
    if (!data?.summary) {
        throw new Error('המודל לא החזיר תיאור.');
    }
    return data.summary as string;
};

