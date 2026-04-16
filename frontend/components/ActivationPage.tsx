import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LockClosedIcon, HiroLogotype } from './Icons';
import { useLanguage } from '../context/LanguageContext';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

const ActivationPage: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const guid =
        searchParams.get('guid') ||
        searchParams.get('activation') ||
        (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('guid') : null);

    const [checking, setChecking] = useState(true);
    const [valid, setValid] = useState(false);
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);

    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) {
            setChecking(false);
            setValid(false);
            setCheckError(t('activation.invalid_link'));
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${apiBase()}/api/auth/activation/${encodeURIComponent(guid)}`);
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok || !data.valid) {
                    setValid(false);
                    setCheckError(data.message || t('activation.invalid_link'));
                    return;
                }
                setValid(true);
                setMaskedEmail(typeof data.email === 'string' ? data.email : null);
            } catch {
                if (!cancelled) setCheckError(t('activation.network_error'));
            } finally {
                if (!cancelled) setChecking(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [guid, t]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (!guid) return;
        if (password.length < 6) {
            setSubmitError(t('activation.password_short'));
            return;
        }
        if (password !== password2) {
            setSubmitError(t('activation.password_mismatch'));
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch(`${apiBase()}/api/auth/activation/${encodeURIComponent(guid)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || t('activation.submit_failed'));
            }
            setDone(true);
            setTimeout(() => navigate('/login', { replace: true }), 2000);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : t('activation.submit_failed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-subtle flex flex-col items-center justify-center p-4" dir="rtl">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-8">
                    <HiroLogotype className="h-10 w-auto text-primary-600" />
                </div>
                <div className="bg-bg-card rounded-2xl shadow-lg border border-border-default p-8">
                    <h1 className="text-xl font-bold text-text-default text-center mb-2">{t('activation.title')}</h1>
                    <p className="text-sm text-text-muted text-center mb-6">{t('activation.subtitle')}</p>

                    {checking && (
                        <p className="text-sm text-text-muted text-center py-8">{t('activation.checking')}</p>
                    )}

                    {!checking && !valid && (
                        <div className="rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-3 text-center">
                            {checkError || t('activation.invalid_link')}
                        </div>
                    )}

                    {!checking && valid && !done && (
                        <form onSubmit={submit} className="space-y-4">
                            {maskedEmail && (
                                <p className="text-sm text-text-muted text-center">
                                    {t('activation.for_account')} <span className="font-semibold text-text-default">{maskedEmail}</span>
                                </p>
                            )}
                            {submitError && (
                                <div className="rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-3 py-2">{submitError}</div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('activation.password')}</label>
                                <div className="relative">
                                    <LockClosedIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pr-10 pl-3 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('activation.password_confirm')}</label>
                                <div className="relative">
                                    <LockClosedIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        required
                                        minLength={6}
                                        value={password2}
                                        onChange={(e) => setPassword2(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pr-10 pl-3 text-sm"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-60"
                            >
                                {submitting ? t('activation.saving') : t('activation.submit')}
                            </button>
                        </form>
                    )}

                    {done && (
                        <p className="text-sm text-green-700 text-center font-medium">{t('activation.success_redirect')}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivationPage;
