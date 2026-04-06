import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EnvelopeIcon, LockClosedIcon, HiroLogotype, BriefcaseIcon } from './Icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (config: {
                        client_id: string;
                        callback: (response: { credential: string }) => void;
                        ux_mode?: string;
                    }) => void;
                    renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
                };
            };
        };
    }
}

/** GIS `initialize` should run once per page load (Google recommendation). */
let googleGsiInitialized = false;

// Google Icon SVG Component
const GoogleIcon: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A8.003 8.003 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"></path>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.012 35.244 44 30.028 44 24c0-1.341-.138-2.65-.389-3.917z"></path>
    </svg>
);

const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const { refreshUser } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginCode, setLoginCode] = useState('');
    const [pending2FA, setPending2FA] = useState(false);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';
    const googleBtnHostRef = useRef<HTMLDivElement>(null);

    const completeAuthSession = useCallback(
        async (data: { token: string; user?: unknown }) => {
            if (!data.token) throw new Error('Missing token from server');
            localStorage.setItem('token', data.token);
            if (data.user) {
                localStorage.setItem('herouser', JSON.stringify(data.user));
                localStorage.setItem('user', JSON.stringify(data.user));
            }
            await refreshUser();
            const role = (data.user as { role?: string } | undefined)?.role?.toLowerCase() || '';
            if (role === 'candidate') {
                navigate('/candidate-portal/profile');
            } else {
                navigate('/dashboard');
            }
        },
        [navigate, refreshUser],
    );

    /** GIS only calls `initialize` once per page; route credential handling through a ref. */
    const googleSignInHandlerRef = useRef<(credential: string) => Promise<void>>(async () => {});

    googleSignInHandlerRef.current = async (credential: string) => {
        setError(null);
        setGoogleLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'התחברות גוגל נכשלה');
            }
            await completeAuthSession(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'התחברות גוגל נכשלה');
        } finally {
            setGoogleLoading(false);
        }
    };

    useEffect(() => {
        if (!googleClientId || !googleBtnHostRef.current) return;

        const el = googleBtnHostRef.current;
        let cancelled = false;

        const render = () => {
            if (cancelled || !window.google || !el) return;
            if (!googleGsiInitialized) {
                window.google.accounts.id.initialize({
                    client_id: googleClientId,
                    ux_mode: 'popup',
                    callback: (response: { credential: string }) => {
                        void googleSignInHandlerRef.current(response.credential);
                    },
                });
                googleGsiInitialized = true;
            }
            el.innerHTML = '';
            const width = Math.min(400, Math.max(280, el.offsetWidth || 360));
            window.google.accounts.id.renderButton(el, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width,
                locale: 'he',
            });
        };

        const tryRender = () => {
            if (cancelled || !window.google) return;
            render();
        };

        if (window.google) {
            tryRender();
        } else {
            let script = document.querySelector<HTMLScriptElement>('script[data-hiro-gsi-client]');
            if (!script) {
                script = document.createElement('script');
                script.src = 'https://accounts.google.com/gsi/client';
                script.async = true;
                script.defer = true;
                script.dataset.hiroGsiClient = '1';
                script.onload = () => tryRender();
                document.body.appendChild(script);
            } else {
                script.addEventListener('load', () => tryRender());
                requestAnimationFrame(() => requestAnimationFrame(tryRender));
            }
        }

        return () => {
            cancelled = true;
            el.innerHTML = '';
        };
    }, [apiBase, googleClientId]);

    const handleResendCode = async () => {
        if (!email.trim() || !password) {
            setError('נדרש אימייל וסיסמה לשליחת קוד מחדש.');
            return;
        }
        setError(null);
        setInfo(null);
        setResendLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/auth/resend-login-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(body.message || 'שליחת קוד נכשלה');
            }
            setLoginCode('');
            setInfo(body.message || 'קוד חדש נשלח לאימייל.');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'שליחת קוד נכשלה');
        } finally {
            setResendLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setInfo(null);
        setLoading(true);
        try {
            if (pending2FA) {
                const code = loginCode.trim();
                if (!/^\d{6}$/.test(code)) {
                    throw new Error('הזינו קוד בן 6 ספרות שנשלח לאימייל.');
                }
                const res = await fetch(`${apiBase}/api/auth/verify-login-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.message || 'אימות נכשל');
                }
                await completeAuthSession(data);
                return;
            }

            const res = await fetch(`${apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'Login failed');
            }
            if (data.twoFactorRequired) {
                setPending2FA(true);
                setLoginCode('');
                setInfo(data.message || 'נשלח קוד לאימייל. הזינו אותו למטה.');
                return;
            }
            await completeAuthSession(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full h-full p-4 min-h-screen bg-bg-default">
            <div className="w-full max-w-4xl bg-bg-card rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
                
                {/* Form Section */}
                <div className="p-8 md:p-12 order-2 md:order-1 flex flex-col justify-center">
                    <div className="text-right mb-6">
                        <h2 className="text-3xl font-extrabold text-text-default">התחברות</h2>
                        <p className="text-text-muted mt-2">ברוכים השבים! אנא הזינו את פרטיכם.</p>
                    </div>

                    {googleClientId ? (
                        <div className="w-full relative min-h-[48px]">
                            {googleLoading && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-bg-card/85 text-sm text-text-muted">
                                    מתחבר עם גוגל...
                                </div>
                            )}
                            <div
                                ref={googleBtnHostRef}
                                className="flex w-full justify-center [&_.gsi-material-button]:w-full [&>div]:w-full"
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() =>
                                setError(
                                    'miss VITE_GOOGLE_CLIENT_ID for oauth login'
                                )
                            }
                            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-bg-card border border-border-default rounded-lg hover:bg-bg-hover transition-colors shadow-sm"
                        >
                            <GoogleIcon />
                            <span className="text-sm font-semibold text-text-default">התחברות באמצעות גוגל</span>
                        </button>
                    )}

                    <div className="flex items-center my-6">
                        <div className="flex-grow border-t border-border-default"></div>
                        <span className="flex-shrink mx-4 text-xs font-medium text-text-subtle">או</span>
                        <div className="flex-grow border-t border-border-default"></div>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">כתובת אימייל</label>
                            <div className="relative">
                                <EnvelopeIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input 
                                    type="email" 
                                    value={email} 
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (pending2FA) {
                                            setPending2FA(false);
                                            setLoginCode('');
                                            setInfo(null);
                                        }
                                    }}
                                    placeholder="הזינו את כתובת האימייל" 
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="block text-sm font-semibold text-text-muted">סיסמה</label>
                                <a href="#" className="text-sm font-semibold text-primary-600 hover:underline">שכחת סיסמה?</a>
                            </div>
                             <div className="relative">
                                <LockClosedIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                />
                            </div>
                        </div>

                        {pending2FA && (
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">
                                    קוד אימות מהאימייל
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={loginCode}
                                    onChange={(e) =>
                                        setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                    }
                                    placeholder="000000"
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm tracking-[0.35em] text-center font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                />
                                <div className="flex justify-end mt-2">
                                    <button
                                        type="button"
                                        onClick={handleResendCode}
                                        disabled={resendLoading || loading}
                                        className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                                    >
                                        {resendLoading ? 'שולח...' : 'שלח קוד מחדש'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {info && (
                            <p className="text-sm text-emerald-700 text-right">{info}</p>
                        )}
                        {error && (
                            <p className="text-sm text-red-600 text-right">{error}</p>
                        )}

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-transform transform hover:scale-105 shadow-lg shadow-primary-500/40 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading
                                ? pending2FA
                                    ? 'מאמת...'
                                    : 'מתחבר...'
                                : pending2FA
                                  ? 'אשר והתחבר'
                                  : 'התחברות'}
                        </button>
                    </form>

                  
                        אין לכם חשבון? 
                           <p className="text-center text-sm text-text-muted mt-6">
                        <button onClick={() => navigate('/candidate-portal/signup')} className="font-semibold text-primary-600 hover:underline">הרשמה</button>
                    </p> 
                    
                    <div className="mt-8 pt-6 border-t border-border-default text-center">
                        <p className="text-sm text-text-muted mb-3">מגייסים עובדים ללא הרשמה?</p>
                        <button 
                            type="button"
                            onClick={() => navigate('/post-job')}
                            className="flex items-center justify-center gap-2 w-full bg-secondary-100 text-secondary-800 font-bold py-2.5 px-4 rounded-lg hover:bg-secondary-200 transition"
                        >
                            <BriefcaseIcon className="w-5 h-5" />
                            פרסם משרה
                        </button>
                    </div>
                </div>

                {/* Branding Section */}
                <div className="relative hidden md:flex flex-col items-center justify-center bg-bg-subtle p-12 text-center order-1 md:order-2 overflow-hidden">
                    {/* Decorative shapes */}
                    <div className="absolute -top-16 -left-16 w-64 h-64 bg-primary-100/50 rounded-full"></div>
                    <div className="absolute -bottom-24 -right-12 w-72 h-72 bg-secondary-100/50 rounded-full"></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <HiroLogotype className="text-7xl mb-6" />
                        <p className="max-w-xs leading-relaxed text-lg text-text-muted font-medium">
                            מערכת הגיוס החכמה שמחברת מגייסים ומועמדים — התחברו עם האימייל והסיסמה שלכם.
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default LoginScreen;
