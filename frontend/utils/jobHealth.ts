export interface JobHealthInput {
    status?: string;
    healthProfile?: string;
    openDate?: string | null;
    associatedCandidates?: number;
    waitingForScreening?: number;
    activeProcess?: number;
}

export interface JobHealthData {
    color: string;
    message: string;
    pulse: boolean;
}

export function getJobHealthData(job: JobHealthInput): JobHealthData {
    if (job.healthProfile === 'disabled') {
        return { color: 'bg-gray-300', message: 'בקרת בריאות כבויה למשרה זו.', pulse: false };
    }
    if (job.status !== 'פתוחה') {
        return { color: 'bg-gray-300', message: `משרה בסטטוס ${job.status ?? ''}`, pulse: false };
    }

    const daysOpen = job.openDate
        ? Math.ceil((Date.now() - new Date(job.openDate).getTime()) / 86_400_000)
        : 0;
    const assoc = job.associatedCandidates ?? 0;
    const waiting = job.waitingForScreening ?? 0;
    const active = job.activeProcess ?? 0;

    if (job.healthProfile === 'executive') {
        if (daysOpen > 30 && assoc === 0) return { color: 'bg-red-500', message: 'קריטי: חודש ללא מועמדים (בכירים)!', pulse: true };
        if (assoc > 0 && active === 0 && daysOpen > 14) return { color: 'bg-red-500', message: 'תקיעות: יש מועמדים אך אין תהליך כבר שבועיים.', pulse: true };
        if (waiting > 5) return { color: 'bg-orange-500', message: 'עומס: משרת בכירים דורשת יחס אישי, 5+ ממתינים.', pulse: false };
    } else if (job.healthProfile === 'high_volume') {
        if (daysOpen > 7 && assoc < 5) return { color: 'bg-red-500', message: 'קריטי: שבוע ללא זרימת מועמדים מספקת (מסה)!', pulse: true };
        if (waiting > 50) return { color: 'bg-red-500', message: 'צוואר בקבוק: מעל 50 מועמדים ממתינים!', pulse: true };
        if (waiting > 25) return { color: 'bg-orange-500', message: 'עומס: הצטברות מועמדים לסינון (מעל 25).', pulse: false };
    } else {
        if (daysOpen > 14 && assoc === 0) return { color: 'bg-red-500', message: 'קריטי: המשרה פתוחה שבועיים ללא מועמדים!', pulse: true };
        if (waiting > 20) return { color: 'bg-red-500', message: 'צוואר בקבוק: מעל 20 מועמדים ממתינים לסינון!', pulse: true };
        if (daysOpen > 60 && active === 0) return { color: 'bg-red-500', message: 'קריטי: המשרה פתוחה חודשיים ללא התקדמות!', pulse: false };
        if (active === 0 && assoc > 0) return { color: 'bg-orange-500', message: 'דחיפות גבוהה: יש מועמדים אך אין תהליכים פעילים.', pulse: false };
        if (waiting > 10) return { color: 'bg-orange-500', message: 'עומס: הצטברות מועמדים לסינון (מעל 10).', pulse: false };
        if (assoc < 5 && daysOpen > 7) return { color: 'bg-yellow-400', message: 'אזהרה: כמות מועמדים נמוכה יחסית לוותק המשרה.', pulse: false };
    }

    return { color: 'bg-emerald-500', message: 'תהליך תקין: יש זרימה של מועמדים ותהליכים.', pulse: false };
}

export function daysOpenFromDate(openDate?: string | null): number {
    if (!openDate) return 0;
    return Math.ceil((Date.now() - new Date(openDate).getTime()) / 86_400_000);
}
