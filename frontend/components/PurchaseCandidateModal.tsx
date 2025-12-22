
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, CheckCircleIcon, UserCircleIcon, MagnifyingGlassIcon, BriefcaseIcon } from './Icons';
import { jobsData as allJobsData, Job } from './JobsView';

interface PurchaseCandidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: any | null;
}

const PurchaseCandidateModal: React.FC<PurchaseCandidateModalProps> = ({ isOpen, onClose, candidate }) => {
    const navigate = useNavigate();
    const [isAssigning, setIsAssigning] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [assignedJobId, setAssignedJobId] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
            setIsAssigning(false);
            setSearchTerm('');
            setAssignedJobId(null);
        }
    }, [isOpen]);

    const filteredJobs = useMemo(() => {
        if (!searchTerm) return allJobsData;
        return allJobsData.filter(job => 
            job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.client.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm]);

    const handleAssignJob = (jobId: number) => {
        setAssignedJobId(jobId);
    };

    const handleViewFullProfile = () => {
        onClose();
        if (candidate) {
            navigate(`/candidates/${candidate.id}`);
        }
    };

    if (!isOpen || !candidate) return null;
    
    const assignedJob = assignedJobId ? allJobsData.find(j => j.id === assignedJobId) : null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default transition-all duration-300" 
                onClick={e => e.stopPropagation()}
                style={{ animation: 'fadeIn 0.3s ease-out' }}
            >
                <header className="flex items-center justify-end p-2">
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="p-6 pt-0 text-center">
                    <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center border-4 border-green-200">
                        <CheckCircleIcon className="w-8 h-8 text-green-600"/>
                    </div>
                    <h2 className="text-xl font-bold text-text-default mt-4">
                        {candidate.name} נוסף בהצלחה!
                    </h2>
                    <p className="text-text-muted mt-1">המועמד נוסף למאגר שלך. כעת תוכל לשייך אותו למשרה קיימת.</p>

                    <div className="mt-6 space-y-4 text-right">
                        {!isAssigning && !assignedJobId && (
                             <button onClick={() => setIsAssigning(true)} className="w-full bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm flex items-center justify-center gap-2">
                                <BriefcaseIcon className="w-5 h-5"/>
                                <span>שייך למשרה קיימת</span>
                            </button>
                        )}
                       
                        {(isAssigning || assignedJobId) && (
                            <div className="bg-bg-subtle p-4 rounded-lg space-y-3">
                                {assignedJobId ? (
                                    <div className="text-center p-4 bg-green-50 border border-green-200 rounded-md">
                                        <p className="font-semibold text-green-800">
                                            המועמד שויך בהצלחה למשרת <br/>"{assignedJob?.title}"
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2"/>
                                            <input 
                                                type="text" 
                                                placeholder="חפש משרה..." 
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                className="w-full bg-bg-input border border-border-default rounded-lg p-2 pr-10 text-sm" 
                                            />
                                        </div>
                                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                                            {filteredJobs.map(job => (
                                                <button key={job.id} onClick={() => handleAssignJob(job.id)} className="w-full text-right p-2 rounded-md hover:bg-primary-50 flex justify-between items-center">
                                                    <div>
                                                        <p className="font-semibold text-text-default">{job.title}</p>
                                                        <p className="text-xs text-text-muted">{job.client}</p>
                                                    </div>
                                                    <span className="text-xs font-semibold text-primary-600 bg-primary-100 py-1 px-3 rounded-full">שייך</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                         <button 
                            onClick={handleViewFullProfile}
                            className="w-full bg-bg-card border border-border-default text-text-default font-semibold py-2.5 px-4 rounded-lg hover:bg-bg-hover transition shadow-sm flex items-center justify-center gap-2"
                        >
                           <UserCircleIcon className="w-5 h-5"/>
                           <span>צפה בפרופיל המלא</span>
                        </button>
                    </div>
                </main>

                <footer className="p-4 text-center">
                    <button onClick={onClose} className="text-sm font-semibold text-text-muted hover:underline">
                        סיום
                    </button>
                </footer>
                 <style>{`
                    @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                `}</style>
            </div>
        </div>
    );
};

export default PurchaseCandidateModal;
