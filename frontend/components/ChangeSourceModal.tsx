import React, { useEffect, useState } from 'react';
import { XMarkIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { fetchRecruitmentSources } from '../services/recruitmentSourcesApi';

export type ChangeSourceSelection = { name: string; id: string | null };

interface ChangeSourceModalProps {
    clientId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (selection: ChangeSourceSelection) => void | Promise<void>;
    selectedCount: number;
}

const ChangeSourceModal: React.FC<ChangeSourceModalProps> = ({
    clientId,
    isOpen,
    onClose,
    onSave,
    selectedCount,
}) => {
    const { t } = useLanguage();
    const [sources, setSources] = useState<{ id: string; name: string }[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string>('');

    useEffect(() => {
        if (!isOpen || !clientId) {
            setSources([]);
            setLoadError(null);
            setSelectedId('');
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setSelectedId('');
        void fetchRecruitmentSources(clientId)
            .then((rows) => {
                if (cancelled) return;
                setSources(rows.map((r) => ({ id: r.id, name: r.name })));
            })
            .catch(() => {
                if (!cancelled) setLoadError(t('change_source.load_error'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, clientId, t]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (!selectedId) return;
        const row = sources.find((s) => s.id === selectedId);
        await onSave({ name: row?.name ?? '', id: selectedId });
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-bg-card flex flex-col rounded-3xl shadow-xl border border-border-subtle w-full max-w-[360px] animate-scale-in relative"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative p-6 pb-2 text-center">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute left-4 top-4 p-2 text-text-muted hover:bg-bg-hover rounded-full transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <div className="mx-auto mb-3 bg-primary-100 text-primary-700 w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg">
                        {selectedCount}
                    </div>
                    <h2 className="text-xl font-bold text-text-default">{t('change_source.title')}</h2>
                    <p className="text-sm text-text-subtle mt-1">{t('change_source.subtitle')}</p>
                    {!clientId && (
                        <p className="text-xs text-amber-600 mt-2">{t('change_source.no_client')}</p>
                    )}
                </div>

                <div className="p-5">
                    {loadError && (
                        <p className="text-sm text-red-600 mb-2 text-center">{loadError}</p>
                    )}
                    {loading && (
                        <p className="text-sm text-text-muted text-center py-4">{t('change_source.loading')}</p>
                    )}
                    {!loading && !loadError && sources.length === 0 && clientId && (
                        <p className="text-sm text-text-muted text-center py-4">{t('change_source.empty')}</p>
                    )}
                    {!loading && (
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto px-1">
                            {sources.map((source) => (
                                <button
                                    type="button"
                                    key={source.id}
                                    onClick={() => setSelectedId(source.id)}
                                    className={`p-3 rounded-2xl border text-sm font-semibold transition-all flex items-center justify-between
                                    ${
                                        selectedId === source.id
                                            ? 'border-primary-500 bg-primary-50/50 text-primary-700'
                                            : 'border-transparent hover:bg-bg-subtle text-text-default'
                                    }`}
                                >
                                    {source.name}
                                    {selectedId === source.id && (
                                        <div className="w-4 h-4 rounded-full border-2 border-primary-500 bg-white flex items-center justify-center">
                                            <div className="w-2 h-2 bg-primary-500 rounded-full" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-5 pt-0 flex gap-3 w-full rounded-b-3xl">
                    <button
                        type="button"
                        onClick={() => void handleConfirm()}
                        disabled={!selectedId || !clientId || !!loadError}
                        className="px-4 py-2.5 rounded-xl font-bold bg-primary-500 text-white hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-center"
                    >
                        {t('change_source.confirm')}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl font-semibold text-text-default hover:bg-bg-hover transition-colors flex-1 text-center bg-bg-subtle hover:bg-border-subtle"
                    >
                        {t('change_source.cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangeSourceModal;
