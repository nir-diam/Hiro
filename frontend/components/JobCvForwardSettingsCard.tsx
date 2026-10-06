import React, { useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon, ChevronDownIcon, UserIcon, EnvelopeIcon } from './Icons';
import SearchableSelect from './SearchableSelect';
import { useLanguage } from '../context/LanguageContext';
import {
    CV_FORWARD_VARIABLES_FALLBACK,
    fetchCvForwardVariables,
    type CvForwardVariableMeta,
} from '../services/cvForwardApi';
import {
    canEnableCvForward,
    type CvForwardRecipientForm,
    type CvForwardSettingsForm,
    DEFAULT_CV_FORWARD_SUBJECT_PREFIX,
    isValidEmail,
} from '../utils/cvForwardSettings';

export type CvForwardStaffUserOption = {
    id: string;
    name: string;
    email?: string;
};

type JobCvForwardSettingsCardProps = {
    settings: CvForwardSettingsForm;
    onChange: (settings: CvForwardSettingsForm) => void;
    staffUsers: CvForwardStaffUserOption[];
    staffUsersLoading?: boolean;
    clientName?: string;
};

function recipientKey(r: CvForwardRecipientForm): string {
    if (r.type === 'external') return `external:${r.email}`;
    return r.email ? `user:${r.userId}:${r.email}` : `user:${r.userId}`;
}

function insertTextAtCursor(input: HTMLInputElement, text: string): string {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    const caret = start + text.length;
    window.requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(caret, caret);
    });
    return next;
}

const JobCvForwardSettingsCard: React.FC<JobCvForwardSettingsCardProps> = ({
    settings,
    onChange,
    staffUsers,
    staffUsersLoading = false,
    clientName = '',
}) => {
    const { t, language } = useLanguage();
    const subjectInputRef = useRef<HTMLInputElement>(null);
    const [variables, setVariables] = useState<CvForwardVariableMeta[]>(CV_FORWARD_VARIABLES_FALLBACK);
    const [variablesLoading, setVariablesLoading] = useState(false);
    const [selectedStaffUserId, setSelectedStaffUserId] = useState<string | number | null>(null);
    const [externalEmailDraft, setExternalEmailDraft] = useState('');
    const [externalEmailError, setExternalEmailError] = useState<string | null>(null);
    const [variablesMenuOpen, setVariablesMenuOpen] = useState(false);
    const variablesMenuRef = useRef<HTMLDivElement>(null);

    const canEnable = canEnableCvForward(settings);
    const recipients = settings.recipients || [];

    useEffect(() => {
        let cancelled = false;
        setVariablesLoading(true);
        fetchCvForwardVariables()
            .then((rows) => {
                if (!cancelled && rows.length > 0) setVariables(rows);
            })
            .finally(() => {
                if (!cancelled) setVariablesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            if (!variablesMenuRef.current?.contains(event.target as Node)) {
                setVariablesMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selectedKeys = useMemo(() => new Set(recipients.map(recipientKey)), [recipients]);
    const selectedUserIds = useMemo(
        () => new Set(recipients.filter((r) => r.type === 'user').map((r) => r.userId)),
        [recipients],
    );

    const staffSelectOptions = useMemo(
        () =>
            staffUsers
                .filter((u) => !selectedUserIds.has(u.id))
                .map((u) => ({
                    id: u.id,
                    label: u.name,
                    subLabel: u.email || undefined,
                })),
        [staffUsers, selectedUserIds],
    );

    const patch = (partial: Partial<CvForwardSettingsForm>) => {
        onChange({ ...settings, ...partial });
    };

    const handleToggleEnabled = (checked: boolean) => {
        if (checked && !canEnable) return;
        patch({ enabled: checked });
    };

    const addStaffRecipient = () => {
        if (!selectedStaffUserId) return;
        const user = staffUsers.find((u) => u.id === String(selectedStaffUserId));
        if (!user) return;

        const next: CvForwardRecipientForm = {
            type: 'user',
            userId: user.id,
            name: user.name,
            ...(user.email ? { email: user.email.toLowerCase() } : {}),
        };
        const key = recipientKey(next);
        if (selectedKeys.has(key)) return;

        patch({ recipients: [...recipients, next] });
        setSelectedStaffUserId(null);
    };

    const addExternalRecipient = () => {
        const email = externalEmailDraft.trim().toLowerCase();
        if (!email) return;
        if (!isValidEmail(email)) {
            setExternalEmailError(t('new_job.cv_forward_invalid_email'));
            return;
        }
        const next: CvForwardRecipientForm = { type: 'external', email };
        const key = recipientKey(next);
        if (selectedKeys.has(key)) {
            setExternalEmailDraft('');
            setExternalEmailError(null);
            return;
        }
        patch({ recipients: [...recipients, next] });
        setExternalEmailDraft('');
        setExternalEmailError(null);
    };

    const removeRecipient = (key: string) => {
        const nextRecipients = recipients.filter((r) => recipientKey(r) !== key);
        patch({
            recipients: nextRecipients,
            enabled: nextRecipients.length > 0 ? settings.enabled : false,
        });
    };

    const insertVariableToken = (token: string) => {
        const input = subjectInputRef.current;
        if (!input) {
            patch({ subjectPrefixTemplate: `${settings.subjectPrefixTemplate || ''}${token}` });
            setVariablesMenuOpen(false);
            return;
        }
        const next = insertTextAtCursor(input, token);
        patch({ subjectPrefixTemplate: next });
        setVariablesMenuOpen(false);
    };

    const variableLabel = (variable: CvForwardVariableMeta) =>
        language === 'en' ? variable.labelEn : variable.labelHe;

    return (
        <div className="rounded-xl border border-border-default bg-bg-subtle/30 p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h4 className="font-bold text-text-default">{t('new_job.cv_forward_title')}</h4>
                    <p className="text-xs text-text-muted mt-1">{t('new_job.cv_forward_hint')}</p>
                </div>
                <label
                    className={`relative inline-flex items-center shrink-0 ${canEnable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                    title={!canEnable ? t('new_job.cv_forward_toggle_disabled_hint') : undefined}
                >
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={settings.enabled}
                        disabled={!canEnable}
                        onChange={(e) => handleToggleEnabled(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600 peer-disabled:opacity-70" />
                </label>
            </div>

            <div className="space-y-3">
                <label className="block text-xs font-semibold text-text-muted">{t('new_job.cv_forward_recipients')}</label>

                {recipients.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {recipients.map((recipient) => {
                            const key = recipientKey(recipient);
                            const label =
                                recipient.type === 'user'
                                    ? recipient.name || recipient.email || recipient.userId
                                    : recipient.email;
                            return (
                                <span
                                    key={key}
                                    className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-bg-card border border-border-default text-sm"
                                >
                                    {recipient.type === 'user' ? (
                                        <UserIcon className="w-3.5 h-3.5 text-primary-600 shrink-0" />
                                    ) : (
                                        <EnvelopeIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
                                    )}
                                    <span className="truncate max-w-[14rem]" title={label}>
                                        {label}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeRecipient(key)}
                                        className="p-0.5 rounded-full hover:bg-bg-hover text-text-muted hover:text-red-600"
                                        aria-label={t('new_job.cv_forward_remove_recipient')}
                                    >
                                        <XMarkIcon className="w-3.5 h-3.5" />
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-text-muted">{t('new_job.cv_forward_no_recipients')}</p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <div className="text-xs font-medium text-text-muted">
                            {clientName.trim()
                                ? t('new_job.cv_forward_client_list_label', { clientName: clientName.trim() })
                                : t('new_job.cv_forward_client_list_label_missing')}
                        </div>
                        <div className="flex gap-2 items-end">
                            <div className="flex-1 min-w-0">
                                <SearchableSelect
                                    options={staffSelectOptions}
                                    value={selectedStaffUserId}
                                    onChange={setSelectedStaffUserId}
                                    placeholder={
                                        staffUsersLoading
                                            ? t('new_job.cv_forward_staff_loading')
                                            : clientName.trim()
                                              ? t('new_job.cv_forward_staff_placeholder')
                                              : t('new_job.cv_forward_client_list_label_missing')
                                    }
                                    disabled={
                                        staffUsersLoading
                                        || !clientName.trim()
                                        || staffSelectOptions.length === 0
                                    }
                                />
                            </div>
                            <button
                                type="button"
                                onClick={addStaffRecipient}
                                disabled={!selectedStaffUserId}
                                className="shrink-0 px-3 py-2 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('new_job.cv_forward_add')}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-medium text-text-muted">{t('new_job.cv_forward_external_label')}</div>
                        <div className="flex gap-2 items-end">
                            <input
                                type="email"
                                value={externalEmailDraft}
                                onChange={(e) => {
                                    setExternalEmailDraft(e.target.value);
                                    if (externalEmailError) setExternalEmailError(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addExternalRecipient();
                                    }
                                }}
                                placeholder={t('new_job.cv_forward_external_placeholder')}
                                className="flex-1 min-w-0 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <button
                                type="button"
                                onClick={addExternalRecipient}
                                disabled={!externalEmailDraft.trim()}
                                className="shrink-0 px-3 py-2 text-sm font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('new_job.cv_forward_add')}
                            </button>
                        </div>
                        {externalEmailError ? (
                            <p className="text-xs text-red-600">{externalEmailError}</p>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <label className="block text-xs font-semibold text-text-muted">
                    {t('new_job.cv_forward_subject_prefix')}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        ref={subjectInputRef}
                        type="text"
                        value={settings.subjectPrefixTemplate}
                        onChange={(e) => patch({ subjectPrefixTemplate: e.target.value })}
                        placeholder={DEFAULT_CV_FORWARD_SUBJECT_PREFIX}
                        className="flex-1 min-w-0 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500 font-mono"
                    />
                    <div className="relative shrink-0" ref={variablesMenuRef}>
                        <button
                            type="button"
                            onClick={() => setVariablesMenuOpen((open) => !open)}
                            disabled={variablesLoading}
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-semibold rounded-lg border border-border-default bg-bg-card hover:bg-bg-hover disabled:opacity-50"
                        >
                            {t('new_job.cv_forward_add_variable')}
                            <ChevronDownIcon className="w-4 h-4" />
                        </button>
                        {variablesMenuOpen ? (
                            <div className="absolute z-20 mt-1 end-0 min-w-[12rem] rounded-lg border border-border-default bg-bg-card shadow-lg py-1">
                                {variablesLoading ? (
                                    <div className="px-3 py-2 text-sm text-text-muted">{t('sources.loading')}</div>
                                ) : variables.length === 0 ? (
                                    <div className="px-3 py-2 text-sm text-text-muted">
                                        {t('new_job.cv_forward_no_variables')}
                                    </div>
                                ) : (
                                    variables.map((variable) => (
                                        <button
                                            key={variable.key}
                                            type="button"
                                            onClick={() => insertVariableToken(variable.token)}
                                            className="w-full text-start px-3 py-2 text-sm hover:bg-bg-hover"
                                        >
                                            <div className="font-medium text-text-default">{variableLabel(variable)}</div>
                                            <div className="text-xs text-text-muted font-mono">{variable.token}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
                <p className="text-xs text-text-muted">{t('new_job.cv_forward_subject_hint')}</p>
            </div>
        </div>
    );
};

export default JobCvForwardSettingsCard;
