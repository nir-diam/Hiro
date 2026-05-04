import React from 'react';
import { ExclamationTriangleIcon, XMarkIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

export interface ScreeningWarningAgg {
    candidateId: string;
    warnings: { code: string; until?: string; lastExitReason?: string | null; group?: string; reasons?: string[] }[];
}

interface ScreeningCollisionWarningModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    aggregate: ScreeningWarningAgg[];
}

function warningLines(
    t: (key: string) => string,
    w: ScreeningWarningAgg['warnings'][0],
): string[] {
    if (w.code === 'hard_requirements' && Array.isArray(w.reasons) && w.reasons.length) {
        return w.reasons.map((r) => t(`screening.warn.${r}`));
    }
    return [t(`screening.warn.${w.code}`)];
}

const ScreeningCollisionWarningModal: React.FC<ScreeningCollisionWarningModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    aggregate,
}) => {
    const { t } = useLanguage();
    if (!isOpen) return null;

    const count = aggregate.length;

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[240] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-bg-card rounded-2xl shadow-xl border border-amber-200 max-w-lg w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3 p-4 border-b border-border-default bg-amber-50/80">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <ExclamationTriangleIcon className="w-6 h-6 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-text-default text-lg">{t('screening.collision.title')}</h3>
                        <p className="text-sm text-text-muted mt-1 leading-relaxed">{t('screening.collision.lead', { count })}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 max-h-52 overflow-y-auto text-sm text-text-default space-y-2">
                    {aggregate.slice(0, 8).map((row) => (
                        <div key={row.candidateId} className="rounded-lg border border-border-subtle bg-bg-subtle/40 px-3 py-2">
                            <div className="font-mono text-[11px] text-text-muted mb-1 truncate" dir="ltr">
                                {row.candidateId}
                            </div>
                            <ul className="list-disc list-inside text-xs space-y-0.5">
                                {row.warnings.flatMap((w) =>
                                    warningLines(t, w).map((line, i) => <li key={`${row.candidateId}-${w.code}-${i}`}>{line}</li>),
                                )}
                            </ul>
                        </div>
                    ))}
                    {aggregate.length > 8 ? (
                        <p className="text-xs text-text-muted">{t('screening.collision.more', { count: aggregate.length - 8 })}</p>
                    ) : null}
                </div>
                <div className="flex gap-2 p-4 border-t border-border-default bg-bg-subtle/20">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-border-default font-semibold text-text-default hover:bg-bg-hover"
                    >
                        {t('screening.collision.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700"
                    >
                        {t('screening.collision.continue')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScreeningCollisionWarningModal;
