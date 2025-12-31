
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon, HiroLogotype, UserIcon, CheckCircleIcon } from './Icons';

// Google Icon SVG Component (Reused)
const GoogleIcon: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"></path>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A8.003 8.003 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"></path>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.012 35.244 44 30.028 44 24c0-1.341-.138-2.65-.389-3.917z"></path>
    </svg>
);

const CandidateSignup: React.FC = () => {
    const navigate = useNavigate();
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name: fullName, role: 'candidate' }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Signup failed');
            }
            const data = await res.json();
            if (!data.token) throw new Error('Missing token from server');
            localStorage.setItem('token', data.token);
            // After successful signup, navigate to the Profile Wizard (Resume Upload)
            navigate('/candidate-portal/register');
        } catch (err: any) {
            setError(err.message || 'Signup failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center w-full h-full p-4 min-h-screen bg-bg-default">
            <div className="w-full max-w-4xl bg-bg-card rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
                
                {/* Branding Section */}
                <div className="relative hidden md:flex flex-col items-center justify-center bg-bg-subtle p-12 text-center order-1 overflow-hidden">
                    {/* Decorative shapes */}
                    <div className="absolute -top-16 -left-16 w-64 h-64 bg-primary-100/50 rounded-full"></div>
                    <div className="absolute -bottom-24 -right-12 w-72 h-72 bg-secondary-100/50 rounded-full"></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                        <HiroLogotype className="text-7xl mb-6" />
                        <h2 className="text-2xl font-bold text-text-default mb-4">מצא את המשרה הבאה שלך</h2>
                        <p className="max-w-xs leading-relaxed text-lg text-text-muted font-medium">
                            הצטרף לאלפי מועמדים שכבר מצאו עבודה בעזרת Hiro.
                        </p>
                        <div className="mt-8 space-y-3 text-right">
                             <div className="flex items-center gap-3 text-sm text-text-default">
                                <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                <span>בניית פרופיל חכמה עם AI</span>
                             </div>
                             <div className="flex items-center gap-3 text-sm text-text-default">
                                <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                <span>התאמת משרות מדויקת</span>
                             </div>
                             <div className="flex items-center gap-3 text-sm text-text-default">
                                <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                <span>מעקב אחרי סטטוס מועמדות</span>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Form Section */}
                <div className="p-8 md:p-12 order-2 flex flex-col justify-center">
                    <div className="text-right mb-6">
                        <h2 className="text-3xl font-extrabold text-text-default">הרשמה</h2>
                        <p className="text-text-muted mt-2">הזן את פרטיך ליצירת חשבון חדש.</p>
                    </div>

                    <button className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-bg-card border border-border-default rounded-lg hover:bg-bg-hover transition-colors shadow-sm mb-6">
                        <GoogleIcon />
                        <span className="text-sm font-semibold text-text-default">הרשמה באמצעות גוגל</span>
                    </button>

                    <div className="relative flex py-2 items-center mb-4">
                        <div className="flex-grow border-t border-border-default"></div>
                        <span className="flex-shrink mx-4 text-xs font-medium text-text-subtle">או הרשמה במייל</span>
                        <div className="flex-grow border-t border-border-default"></div>
                    </div>

                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">שם מלא</label>
                            <div className="relative">
                                <UserIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input 
                                    type="text" 
                                    value={fullName} 
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="ישראל ישראלי" 
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">כתובת אימייל</label>
                            <div className="relative">
                                <EnvelopeIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input 
                                    type="email" 
                                    value={email} 
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your.email@example.com" 
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                             <label className="block text-sm font-semibold text-text-muted mb-1.5 text-right">סיסמה</label>
                             <div className="relative">
                                <LockClosedIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                             <input type="checkbox" id="terms" required className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500" />
                             <label htmlFor="terms" className="text-xs text-text-muted cursor-pointer">
                                אני מאשר/ת את <a href="#" className="text-primary-600 hover:underline">תנאי השימוש</a> ו<a href="#" className="text-primary-600 hover:underline">מדיניות הפרטיות</a>
                             </label>
                        </div>

                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
                        >
                            {isLoading ? 'יוצר חשבון...' : 'צור חשבון והמשך'}
                        </button>
                    </form>
                    
                    <div className="mt-8 text-center border-t border-border-default pt-4">
                        <p className="text-sm text-text-muted">
                            יש לך כבר חשבון? <button onClick={() => navigate('/candidate-portal/login')} className="font-semibold text-primary-600 hover:underline">התחבר כאן</button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CandidateSignup;
