import React, { useMemo, useState } from 'react';
import { XMarkIcon } from './Icons';
import {
    formatHistoryTimestamp,
    resolveHistoryActorAvatar,
    resolveHistoryActorName,
} from '../utils/auditHistoryFormat';

export interface AuditHistoryRowProps {
    timestamp?: string | Date | null;
    actor?: string | null;
    actorDisplayName?: string | null;
    userName?: string | null;
    userEmail?: string | null;
    userAvatar?: string | null;
    actionLabel: string;
    description: string;
    /** When true, wraps **bold** segments in <strong> */
    richDescription?: boolean;
}

const MAX_VISIBLE_ITEMS = 3;

export function splitHistoryDescriptionItems(description: string): string[] {
    const trimmed = description.trim();
    if (!trimmed) return [];
    if (!trimmed.includes(' · ')) return [trimmed];
    return trimmed.split(' · ').map((part) => part.trim()).filter(Boolean);
}

function renderRichDescription(text: string): React.ReactNode {
    const parts = text.split(/(\*\*.+?\*\*)/g);
    return parts.map((part, idx) => {
        const match = /^\*\*(.+)\*\*$/.exec(part);
        if (match) {
            return (
                <strong key={idx} className="font-bold text-text-default">
                    {match[1]}
                </strong>
            );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
}

interface HistoryDescriptionListProps {
    items: string[];
    richDescription: boolean;
    className?: string;
}

const HistoryDescriptionList: React.FC<HistoryDescriptionListProps> = ({
    items,
    richDescription,
    className = '',
}) => (
    <ol className={`space-y-1.5 ${className}`}>
        {items.map((item, index) => (
            <li key={index} className="flex gap-2 text-sm text-text-muted leading-relaxed">
                <span className="font-semibold text-text-subtle flex-shrink-0 tabular-nums">{index + 1}.</span>
                <span className="min-w-0 break-words">
                    {richDescription ? renderRichDescription(item) : item}
                </span>
            </li>
        ))}
    </ol>
);

interface HistoryDescriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: string[];
    richDescription: boolean;
    actionLabel?: string;
    timestamp?: string;
}

const HistoryDescriptionModal: React.FC<HistoryDescriptionModalProps> = ({
    isOpen,
    onClose,
    items,
    richDescription,
    actionLabel,
    timestamp,
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border-default flex flex-col max-h-[85vh] animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-3 p-5 border-b border-border-default">
                    <div>
                        <h3 className="text-lg font-bold text-text-default">תיאור השינוי</h3>
                        {(actionLabel || timestamp) && (
                            <p className="text-xs text-text-muted mt-1">
                                {[actionLabel, timestamp].filter(Boolean).join(' · ')}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-hover text-text-muted flex-shrink-0"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>
                <div className="overflow-y-auto p-5">
                    <HistoryDescriptionList items={items} richDescription={richDescription} />
                </div>
                <footer className="p-4 border-t border-border-default bg-bg-subtle/30">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-2.5 rounded-lg bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors"
                    >
                        סגור
                    </button>
                </footer>
            </div>
        </div>
    );
};

const AuditHistoryRow: React.FC<AuditHistoryRowProps> = ({
    timestamp,
    actor,
    actorDisplayName,
    userName,
    userEmail,
    userAvatar,
    actionLabel,
    description,
    richDescription = true,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const actorName = resolveHistoryActorName({ actor, actorDisplayName, userName, userEmail });
    const avatarText =
        resolveHistoryActorAvatar({ actor, actorDisplayName, userName, userAvatar }) ||
        (actorName === 'סוכן AI (Hiro)' ? 'AI' : '?');

    const descriptionItems = useMemo(() => splitHistoryDescriptionItems(description), [description]);
    const visibleItems = descriptionItems.slice(0, MAX_VISIBLE_ITEMS);
    const hiddenCount = Math.max(0, descriptionItems.length - MAX_VISIBLE_ITEMS);
    const formattedTimestamp = formatHistoryTimestamp(timestamp);

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_100px_minmax(0,2fr)] gap-3 md:gap-4 items-start p-4 border border-border-default rounded-xl bg-bg-card/80 hover:bg-bg-subtle/40 transition-colors">
                <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5 md:hidden">מתי</div>
                    <time className="text-sm font-medium text-text-default whitespace-nowrap">
                        {formattedTimestamp}
                    </time>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5 md:hidden w-full">מי</div>
                    <div
                        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold border ${
                            actorName === 'סוכן AI (Hiro)'
                                ? 'bg-violet-100 text-violet-700 border-violet-200'
                                : 'bg-primary-100 text-primary-700 border-primary-200'
                        }`}
                    >
                        {userAvatar ? (
                            <img src={userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                            avatarText
                        )}
                    </div>
                    <span className="text-sm font-semibold text-text-default truncate">{actorName}</span>
                </div>

                <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5 md:hidden">פעולה</div>
                    <span className="inline-flex text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                        {actionLabel}
                    </span>
                </div>

                <div className="min-w-0 md:col-span-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-0.5 md:hidden">תיאור</div>
                    {descriptionItems.length <= 1 ? (
                        <p className="text-sm text-text-muted leading-relaxed break-words">
                            {richDescription ? renderRichDescription(description) : description}
                        </p>
                    ) : (
                        <div>
                            <HistoryDescriptionList items={visibleItems} richDescription={richDescription} />
                            {hiddenCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(true)}
                                    className="mt-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline transition-colors"
                                    title="הצג את כל השינויים"
                                >
                                    ...... (+{hiddenCount})
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <HistoryDescriptionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                items={descriptionItems}
                richDescription={richDescription}
                actionLabel={actionLabel}
                timestamp={formattedTimestamp !== '—' ? formattedTimestamp : undefined}
            />
        </>
    );
};

export default AuditHistoryRow;
