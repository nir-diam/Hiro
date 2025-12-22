import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon, HiroLogotype } from './Icons';

const CandidateLoginView: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        // Mock login action: immediately navigate to the profile
        navigate('/candidate-portal/profile');
    };

    return (
        <div className="flex items-center justify-center w-full h-full p-4">
            <div className="w-full max-w-md bg-bg-card rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8 md:p-12">
                    <div className="text-center mb-8">
                         <HiroLogotype className="text-5xl mx-auto mb-4" />
                        <h2 className="text-2xl font-extrabold text-text-default">אזור אישי למועמדים</h2>
                        <p className="text-text-muted mt-2">התחבר/י כדי לצפות ולעדכן את הפרופיל שלך.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
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
                                />
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-transform transform hover:scale-105 shadow-lg shadow-primary-500/40">
                            התחברות
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CandidateLoginView;
