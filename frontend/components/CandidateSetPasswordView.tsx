import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LockClosedIcon, HiroLogotype } from './Icons';
import { useAuth } from '../context/AuthContext';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

const CandidateSetPasswordView: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const magic = searchParams.get('magic');
    const { refreshUser } = useAuth();

    const [checking, setChecking] = useState(true);
    const [valid, setValid] = useState(false);
    const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);

    const [password, setPassword] = useState('');
    const [password2, setPassword2] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        if (!magic) {
            setChecking(false);
            setValid(false);
            setCheckError('קישור ההתחברות אינו תקף');
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(
                    `${apiBase()}/api/auth/candidate-portal/magic/check?token=${encodeURIComponent(magic)}`,
                );
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok || !data.valid) {
                    setValid(false);
                    setCheckError(data.message || 'קישור ההתחברות אינו תקף או שפג תוקפו');
                    return;
                }
                setValid(true);
                setMaskedEmail(typeof data.email === 'string' ? data.email : null);
            } catch {
                if (!cancelled) setCheckError('שגיאת רשת — נסו שוב');
            } finally {
                if (!cancelled) setChecking(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [magic]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);
        if (!magic) return;
        if (password.length < 6) {
            setSubmitError('הסיסמה חייבת להכיל לפחות 6 תווים');
            return;
        }
        if (password !== password2) {
            setSubmitError('הסיסמאות אינן תואמות');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch(`${apiBase()}/api/auth/candidate-portal/magic/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: magic, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'יצירת הסיסמה נכשלה');
            }
            if (!data.token) {
                throw new Error('Missing token from server');
            }
            localStorage.setItem('token', data.token);
            if (data.user) {
                localStorage.setItem('herouser', JSON.stringify(data.user));
                localStorage.setItem('user', JSON.stringify(data.user));
            }
            await refreshUser();
            navigate('/candidate-portal/profile', { replace: true });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'יצירת הסיסמה נכשלה';
            setSubmitError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full h-full p-4">
            <div className="w-full max-w-md bg-bg-card rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8 md:p-12">
                    <div className="text-center mb-8">
                        <HiroLogotype className="text-5xl mx-auto mb-4" />
                        <h2 className="text-2xl font-extrabold text-text-default">יצירת סיסמה לאזור האישי</h2>
                        <p className="text-text-muted mt-2">
                            {checking
                                ? 'מאמתים את הקישור...'
                                : valid
                                  ? 'בחר/י סיסמה כדי להתחבר לפרופיל שלך ב-Hiro'
                                  : 'לא ניתן להשתמש בקישור זה'}
                        </p>
                        {valid && maskedEmail ? (
                            <p className="text-sm text-text-subtle mt-2" dir="ltr">
                                {maskedEmail}
                            </p>
                        ) : null}
                    </div>

                    {checking ? (
                        <p className="text-center text-text-muted text-sm">רק רגע...</p>
                    ) : null}

                    {!checking && valid ? (
                        <form onSubmit={submit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">
                                    סיסמה חדשה
                                </label>
                                <div className="relative">
                                    <LockClosedIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="לפחות 6 תווים"
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">
                                    אימות סיסמה
                                </label>
                                <div className="relative">
                                    <LockClosedIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="password"
                                        value={password2}
                                        onChange={(e) => setPassword2(e.target.value)}
                                        placeholder="הקליד/י שוב את הסיסמה"
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>

                            {submitError ? (
                                <p className="text-sm text-red-600 text-center">{submitError}</p>
                            ) : null}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-transform transform hover:scale-105 shadow-lg shadow-primary-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'שומר...' : 'יצירת סיסמה והתחברות'}
                            </button>
                        </form>
                    ) : null}

                    {!checking && !valid ? (
                        <div className="text-center space-y-4">
                            {checkError ? (
                                <p className="text-sm text-red-600">{checkError}</p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => navigate('/candidate-portal/login')}
                                className="text-primary-600 font-bold hover:underline"
                            >
                                חזרה להתחברות
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default CandidateSetPasswordView;
