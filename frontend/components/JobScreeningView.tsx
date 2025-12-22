import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockExistingJob, mockJobCandidates } from '../data/mockJobData';
import { ArrowLeftIcon, ChevronRightIcon, CheckCircleIcon, NoSymbolIcon, PaperAirplaneIcon, XMarkIcon } from './Icons';
import ResumeViewer from './ResumeViewer';
import JobDetailsDrawer from './JobDetailsDrawer';

// This is a new component for the dedicated job screening view.
// It uses a split-screen layout to allow recruiters to efficiently
// cycle through candidates for a single job.

const JobScreeningView: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();

    // In a real app, you would fetch the job and candidates based on the jobId.
    // For now, we're using the centralized mock data.
    const job = mockExistingJob;
    const candidates = mockJobCandidates;

    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<{[key: number]: string}>({});
    const [feedback, setFeedback] = useState('');
    const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);

    const currentCandidate = candidates[currentIndex];

    const handleNext = () => {
        if (currentIndex < candidates.length - 1) {
            setCurrentIndex(currentIndex + 1);
            resetForm();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            resetForm();
        }
    };
    
    const resetForm = () => {
        setAnswers({});
        setFeedback('');
    };

    const handleAnswerChange = (questionId: number, answer: string) => {
        setAnswers(prev => ({...prev, [questionId]: answer}));
    };

    const handlePass = () => {
        console.log(`Candidate ${currentCandidate.name} PASSED for job ${job.title}`, {answers, feedback});
        handleNext();
    };

    const handleFail = () => {
        console.log(`Candidate ${currentCandidate.name} FAILED for job ${job.title}`, {answers, feedback});
        handleNext();
    };

    if (!job || !currentCandidate) {
        return <div>Loading... or Job/Candidate not found.</div>;
    }
    
    // Generate dynamic resume data based on the current candidate
    const currentResumeData = {
        name: currentCandidate.name,
        contact: `${currentCandidate.phone}`,
        summary: `מועמד/ת לתפקיד ${currentCandidate.title || 'כללי'}. מגיע/ה עם ניסיון רב בתחום, כפי שניתן לראות בניסיון התעסוקתי. בעל/ת מוטיבציה גבוהה להשתלב בתפקיד מאתגר ולהביא לידי ביטוי את היכולות המקצועיות. מקור גיוס: ${currentCandidate.source}.`,
        experience: [
            `<b>2020 - הווה: ${currentCandidate.title || 'תפקיד בכיר'}</b><br/>עבודה בחברה מובילה בתחום, אחריות על X, Y, Z. שימוש בטכנולוגיות מתקדמות והובלת פרויקטים.`,
            `<b>2018 - 2020: תפקיד קודם</b><br/>ניסיון קודם בתפקיד דומה בחברת ${currentCandidate.source}.`
        ]
    };

    return (
        <div className="flex flex-col h-full bg-bg-default -m-6">
            <header className="flex items-center justify-between p-4 bg-bg-card border-b border-border-default flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-text-default">
                        סינון מהיר למשרה:{' '}
                        <button
                            onClick={() => setIsJobDrawerOpen(true)}
                            className="text-primary-600 hover:underline focus:outline-none"
                        >
                            {job.title}
                        </button>
                    </h1>
                    <p className="text-sm text-text-muted">לקוח: {job.client}</p>
                </div>
                <button onClick={() => navigate(`/jobs/edit/${job.id}`)} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>
            
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-px bg-border-default overflow-y-auto">
                {/* Left Panel: Candidate Resume */}
                <div className="bg-bg-card overflow-y-auto">
                   <ResumeViewer resumeData={currentResumeData} />
                </div>

                {/* Right Panel: Job Info & Screening */}
                <div className="bg-bg-card p-4 overflow-y-auto flex flex-col">
                     <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-text-default">שאלון סינון טלפוני</h2>
                        <div className="flex items-center gap-2">
                           <button onClick={handlePrev} disabled={currentIndex === 0} className="p-3 rounded-full bg-bg-card border border-border-default text-text-default hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed">
                                <ChevronRightIcon className="w-6 h-6" /> {/* Previous in RTL */}
                            </button>
                            <span className="font-bold text-text-default text-lg tabular-nums">({currentIndex + 1} / {candidates.length})</span>
                            <button onClick={handleNext} disabled={currentIndex === candidates.length - 1} className="p-3 rounded-full bg-bg-card border border-border-default text-text-default hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed">
                                <ArrowLeftIcon className="w-6 h-6" /> {/* Next in RTL */}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-4 flex-grow">
                        {job.telephoneQuestions.map(q => (
                            <div key={q.id}>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{q.question}</label>
                                <textarea
                                    value={answers[q.id] || ''}
                                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                    rows={3}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                    placeholder="תשובת המועמד..."
                                />
                            </div>
                        ))}
                         <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">חוות דעת</label>
                            <textarea
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                rows={4}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                placeholder="חוות דעת על המועמד..."
                            />
                        </div>
                    </div>
                     <div className="flex justify-end items-center gap-3 pt-4 flex-shrink-0">
                        <button onClick={handleFail} className="flex items-center gap-2 bg-red-500 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-red-600 transition shadow-sm">
                            <NoSymbolIcon className="w-5 h-5" />
                            <span>פסילה</span>
                        </button>
                        <button onClick={handlePass} className="flex items-center gap-2 bg-green-500 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-600 transition shadow-sm">
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>העברה לשלב הבא</span>
                        </button>
                    </div>
                </div>
            </div>
            
            <JobDetailsDrawer
                job={job}
                isOpen={isJobDrawerOpen}
                onClose={() => setIsJobDrawerOpen(false)}
            />
        </div>
    );
};

export default JobScreeningView;