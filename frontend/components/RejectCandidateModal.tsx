
import React, { useState } from 'react';
import { XMarkIcon, NoSymbolIcon } from './Icons';

export interface RejectCandidateJob {
    id: number;
    title: string;
    company: string;
    reasons: { label: string; value: string }[];
}

interface RejectCandidateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReject: (data: any) => void;
    jobs: RejectCandidateJob[];
}

const rejectionReasons = [
    'חוסר ניסיון רלוונטי',
    'ציפיות שכר גבוהות',
    'חוסר התאמה טכנולוגית',
    'חוסר התאמה אישיותית',
    'מרחק גיאוגרפי',
    'מועמד משך עניין',
    'אחר'
];

const RejectCandidateModal: React.FC<RejectCandidateModalProps> = ({ isOpen, onClose, onReject, jobs }) => {
    const [globalReason, setGlobalReason] = useState(rejectionReasons[0]);
    const [globalNote, setGlobalNote] = useState('');
    
    // Track selected reasons per job
    // State shape: { jobId: { "Reason Label": true/false } }
    const [selectedJobReasons, setSelectedJobReasons] = useState<Record<number, Record<string, boolean>>>({});
    
    // Track custom "other" reason per job
    const [jobCustomNotes, setJobCustomNotes] = useState<Record<number, string>>({});

    // Initialize state when jobs change
    React.useEffect(() => {
        if (isOpen) {
            const initialReasons: Record<number, Record<string, boolean>> = {};
            const initialNotes: Record<number, string> = {};
            jobs.forEach(job => {
                initialReasons[job.id] = {};
                job.reasons.forEach(r => {
                    initialReasons[job.id][r.label] = true; // pre-check identified gaps
                });
                initialNotes[job.id] = '';
            });
            setSelectedJobReasons(initialReasons);
            setJobCustomNotes(initialNotes);
            setGlobalReason(rejectionReasons[0]);
            setGlobalNote('');
        }
    }, [isOpen, jobs]);

    if (!isOpen) return null;

    const toggleJobReason = (jobId: number, reasonLabel: string) => {
        setSelectedJobReasons(prev => ({
            ...prev,
            [jobId]: {
                ...prev[jobId],
                [reasonLabel]: !prev[jobId]?.[reasonLabel]
            }
        }));
    };

    const handleReject = () => {
        // Collect data
        const data = {
            globalReason,
            globalNote,
            jobsData: jobs.map(job => {
                const selectedLabels = Object.entries(selectedJobReasons[job.id] || {})
                    .filter(([_, isSelected]) => isSelected)
                    .map(([label]) => label);
                
                return {
                    jobId: job.id,
                    selectedGaps: job.reasons.filter(r => selectedLabels.includes(r.label)),
                    customNote: jobCustomNotes[job.id]
                };
            })
        };
        onReject(data);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose} dir="rtl">
            <div 
                className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                            <NoSymbolIcon className="w-6 h-6" />
                        </div>
                        <h3 className="font-bold text-lg text-text-default">שלילת מועמד ({jobs.length} משרות)</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* General Reasons */}
                    <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default space-y-4">
                        <h4 className="font-bold text-text-default text-sm">סיבת שלילה כללית</h4>
                        <div>
                            <select 
                                value={globalReason} 
                                onChange={(e) => setGlobalReason(e.target.value)}
                                className="w-full bg-white border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500 focus:border-primary-500"
                            >
                                {rejectionReasons.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <textarea 
                                rows={2} 
                                value={globalNote}
                                onChange={(e) => setGlobalNote(e.target.value)}
                                placeholder="הערה כללית לפסילה של כל המשרות שנבחרו..."
                                className="w-full bg-white border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                            ></textarea>
                        </div>
                    </div>

                    {/* Per-job Gaps */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-text-default text-sm mb-2">סיבות פרטניות לפי משרה</h4>
                        {jobs.map(job => (
                            <div key={job.id} className="border border-border-default rounded-xl p-4 bg-white shadow-sm space-y-4">
                                <div className="flex flex-col">
                                    <span className="font-bold text-text-default">{job.title}</span>
                                    <span className="text-xs text-text-muted">{job.company}</span>
                                </div>
                                
                                {job.reasons.length > 0 ? (
                                    <div className="space-y-2 bg-red-50/30 p-3 rounded-lg border border-red-100/50">
                                        <label className="text-xs font-bold text-red-600 block mb-2">פערים שזוהו בסינון:</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {job.reasons.map((reason, idx) => (
                                                <label key={idx} className="flex items-start gap-2 cursor-pointer group">
                                                    <div className="pt-0.5">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                                                            checked={!!selectedJobReasons[job.id]?.[reason.label]}
                                                            onChange={() => toggleJobReason(job.id, reason.label)}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-text-default group-hover:text-red-700 transition-colors">{reason.label}</span>
                                                        <span className="text-[11px] text-text-muted leading-tight">{reason.value}</span>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-text-muted italic">לא זוהו פערים מערכתיים למשרה זו.</p>
                                )}
                                
                                <div>
                                    <input 
                                        type="text"
                                        value={jobCustomNotes[job.id] || ''}
                                        onChange={(e) => setJobCustomNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                                        placeholder="הוסף סיבת שלילה ספציפית למשרה זו (אופציונלי)"
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-xs focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3 shrink-0">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors"
                    >
                        ביטול
                    </button>
                    <button 
                        onClick={handleReject}
                        className="px-8 py-2.5 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-200 transition-all transform active:scale-95 flex items-center gap-2"
                    >
                        <NoSymbolIcon className="w-4 h-4" />
                        <span>שלול מועמד</span>
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default RejectCandidateModal;
