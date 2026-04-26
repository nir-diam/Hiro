const HEBREW_MONTH_TO_NUM: Record<string, number> = {
    ינואר: 1,
    פברואר: 2,
    מרץ: 3,
    אפריל: 4,
    מאי: 5,
    יוני: 6,
    יולי: 7,
    אוגוסט: 8,
    ספטמבר: 9,
    אוקטובר: 10,
    נובמבר: 11,
    דצמבר: 12,
};

export const normalizeBirthYear = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null;
};

export const normalizeBirthMonthNum = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
    const he = HEBREW_MONTH_TO_NUM[s];
    if (he != null) return he;
    return null;
};

export const normalizeBirthDayNum = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

/** Age from birth fields: uses full date when month (and ideally day) exist; otherwise year difference only. */
export const computeAgeFromBirth = (birthYear: unknown, birthMonth: unknown, birthDay: unknown): string => {
    const y = normalizeBirthYear(birthYear);
    if (y == null) return '';
    const mNum = normalizeBirthMonthNum(birthMonth);
    const dNum = normalizeBirthDayNum(birthDay);
    const now = new Date();
    if (mNum == null && dNum == null) {
        const a = now.getFullYear() - y;
        return a >= 0 && a <= 130 ? String(a) : '';
    }
    const month = mNum ?? 1;
    const day = dNum ?? 1;
    const birth = new Date(y, month - 1, day);
    if (Number.isNaN(birth.getTime())) return '';
    let age = now.getFullYear() - birth.getFullYear();
    const md = now.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
    if (age < 0 || age > 130) return '';
    return String(age);
};
