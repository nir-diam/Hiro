export const deriveLocalCandidateId = (sourceId: string | number | undefined | null, fallback = 0): number => {
    if (sourceId === undefined || sourceId === null) {
        return fallback;
    }

    if (typeof sourceId === 'number') {
        if (Number.isFinite(sourceId)) {
            return sourceId;
        }
        return fallback;
    }

    const numericValue = Number(sourceId);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
        return numericValue;
    }

    let hash = 0;
    for (let i = 0; i < sourceId.length; i++) {
        hash = ((hash << 5) - hash) + sourceId.charCodeAt(i);
        hash |= 0;
    }
    const positiveHash = Math.abs(hash);
    if (positiveHash === 0) {
        return fallback || 1;
    }
    return positiveHash;
};

