import type { ScreeningQuestion } from '../components/CandidateScreeningWizard';

export type JobDigitalQuestion = {
    id: number;
    text: string;
    type?: 'text' | 'yes_no' | 'multiple_choice' | 'video';
    order?: number;
    options?: { id: string; text: string; isCorrect?: boolean }[];
    isMandatory?: boolean;
    disqualifyIfWrong?: boolean;
    disqualificationReason?: string;
    introText?: string;
    presentationMode?: 'text' | 'video';
    timeLimit?: number;
    retriesAllowed?: boolean;
};

export type DigitalScreeningStatus = 'none' | 'pending' | 'partial' | 'passed' | 'failed';

export type DigitalScreeningSummary = {
    status: DigitalScreeningStatus;
    label: string;
    answeredCount: number;
    totalCount: number;
    failedReasons: string[];
};

export type DigitalAnswerRow = {
    questionId: number;
    question: string;
    answer: string;
};

export type ScreeningDataByJob = Record<
    string,
    {
        digitalAnswers?: DigitalAnswerRow[];
        screeningAnswers?: { question: string; answer: string }[];
    }
>;

export function jobHasDigitalScreening(job?: { digitalQuestions?: JobDigitalQuestion[] | null } | null): boolean {
    const questions = Array.isArray(job?.digitalQuestions) ? job!.digitalQuestions! : [];
    return questions.some((q) => String(q?.text || '').trim());
}

/** Only explicit true counts as mandatory — honors unchecked "שאלת חובה" in job editor. */
export function isQuestionMandatory(q: JobDigitalQuestion): boolean {
    const raw = q.isMandatory ?? (q as { required?: unknown }).required;
    if (raw === false || raw === 'false' || raw === 0) return false;
    if (raw === true || raw === 'true' || raw === 1) return true;
    return false;
}

export function hasWizardAnswer(value: unknown): boolean {
    if (value == null) return false;
    if (value instanceof Blob) return value.size > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return Boolean(value);
}

export function mapJobQuestionsToWizard(questions: JobDigitalQuestion[]): ScreeningQuestion[] {
    return [...questions]
        .filter((q) => String(q?.text || '').trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((q) => ({
            id: q.id,
            text: q.text,
            type: q.type || 'text',
            options: q.options?.map((o) => ({ id: o.id, text: o.text })),
            isMandatory: isQuestionMandatory(q),
            introText: q.introText,
            presentationMode: q.presentationMode,
            timeLimit: q.timeLimit,
            retriesAllowed: q.retriesAllowed !== false,
        }));
}

export function isDigitalScreeningComplete(
    questions: JobDigitalQuestion[],
    digitalAnswers?: DigitalAnswerRow[] | null,
): boolean {
    const active = questions.filter((q) => String(q?.text || '').trim());
    const mandatory = active.filter(isQuestionMandatory);
    if (!mandatory.length) return active.length > 0;
    if (!Array.isArray(digitalAnswers) || !digitalAnswers.length) return false;
    const byId = new Map(digitalAnswers.map((a) => [Number(a.questionId), a]));
    return mandatory.every((q) => {
        const row = byId.get(Number(q.id));
        return Boolean(String(row?.answer || '').trim());
    });
}

export function wizardAnswersToDigitalRows(
    questions: JobDigitalQuestion[],
    answers: Record<number, unknown>,
): DigitalAnswerRow[] {
    const byId = new Map(questions.map((q) => [Number(q.id), q]));
    return Object.entries(answers).map(([idRaw, value]) => {
        const questionId = Number(idRaw);
        const q = byId.get(questionId);
        let answer = '';
        if (value instanceof Blob) {
            answer = '[video]';
        } else if (value != null) {
            answer = String(value).trim();
        }
        return {
            questionId,
            question: q?.text || '',
            answer,
        };
    });
}

function isKillerQuestion(q: JobDigitalQuestion): boolean {
    return q.disqualifyIfWrong === true;
}

function isAnswerPassing(q: JobDigitalQuestion, answer: string): boolean {
    const ans = String(answer || '').trim();
    if (!ans) return !isQuestionMandatory(q);

    if (q.type === 'yes_no' || q.type === 'multiple_choice') {
        const options = Array.isArray(q.options) ? q.options : [];
        if (options.length) {
            const selected = options.find((o) => o.text === ans);
            if (selected) return selected.isCorrect !== false;
        }
        if (q.type === 'yes_no' && isKillerQuestion(q)) {
            return ans === 'כן';
        }
    }

    if (ans === '[video]') return true;
    return true;
}

export function summarizeDigitalScreening(
    questions: JobDigitalQuestion[],
    digitalAnswers?: DigitalAnswerRow[] | null,
    screeningStatus?: string | null,
    rejectionReason?: string | null,
): DigitalScreeningSummary {
    const active = questions.filter((q) => String(q?.text || '').trim());
    const totalCount = active.length;
    if (!totalCount) {
        return { status: 'none', label: '—', answeredCount: 0, totalCount: 0, failedReasons: [] };
    }

    const answers = Array.isArray(digitalAnswers) ? digitalAnswers : [];
    const byId = new Map(answers.map((a) => [Number(a.questionId), a]));
    const answeredCount = active.filter((q) => {
        const row = byId.get(Number(q.id));
        return Boolean(String(row?.answer || '').trim());
    }).length;

    if (answeredCount === 0) {
        return {
            status: 'pending',
            label: 'ממתין למילוי',
            answeredCount: 0,
            totalCount,
            failedReasons: [],
        };
    }

    const failedReasons: string[] = [];
    for (const q of active) {
        if (!isKillerQuestion(q)) continue;
        const row = byId.get(Number(q.id));
        const ans = String(row?.answer || '').trim();
        if (!ans) continue;
        if (!isAnswerPassing(q, ans)) {
            failedReasons.push(
                String(q.disqualificationReason || q.text || '').trim() || 'שאלה פוסלת',
            );
        }
    }

    if (screeningStatus === 'rejected' || failedReasons.length > 0) {
        const reason = String(rejectionReason || '').trim();
        if (reason && !failedReasons.includes(reason)) failedReasons.unshift(reason);
        return {
            status: 'failed',
            label: failedReasons.length ? `נפסל · ${failedReasons[0]}` : 'נפסל',
            answeredCount,
            totalCount,
            failedReasons,
        };
    }

    if (!isDigitalScreeningComplete(active, answers)) {
        return {
            status: 'partial',
            label: `חלקי · ${answeredCount}/${totalCount}`,
            answeredCount,
            totalCount,
            failedReasons: [],
        };
    }

    return {
        status: 'passed',
        label: `עבר · ${answeredCount}/${totalCount}`,
        answeredCount,
        totalCount,
        failedReasons: [],
    };
}

export function digitalScreeningBadgeClass(status: DigitalScreeningStatus): string {
    switch (status) {
        case 'passed':
            return 'bg-green-50 text-green-800 border-green-200';
        case 'failed':
            return 'bg-red-50 text-red-800 border-red-200';
        case 'partial':
            return 'bg-blue-50 text-blue-800 border-blue-200';
        case 'pending':
            return 'bg-amber-50 text-amber-800 border-amber-200';
        default:
            return 'bg-gray-50 text-gray-500 border-gray-200';
    }
}

export function formatApplicationJobTitle(app: { role?: string; company?: string; job?: { title?: string; client?: string } | null }): string {
    const role = String(app.role || app.job?.title || '').trim();
    const company = String(app.company || app.job?.client || '').trim();
    if (role && company) return `${role} - ${company}`;
    return role || company || 'משרה';
}
