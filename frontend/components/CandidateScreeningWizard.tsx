
import React, { useState } from 'react';
import { 
    ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, DocumentTextIcon, 
    VideoCameraIcon, PlayIcon, XMarkIcon, SparklesIcon
} from './Icons';
import VideoRecorder from './VideoRecorder';

export interface ScreeningQuestion {
    id: number;
    text: string;
    type: 'text' | 'multiple_choice' | 'yes_no' | 'video';
    options?: { id: string; text: string }[];
    isMandatory: boolean;
    introText?: string;
    presentationMode?: 'text' | 'video'; // Recruiter video
    timeLimit?: number;
    retriesAllowed?: boolean;
}

interface CandidateScreeningWizardProps {
    jobTitle: string;
    questions: ScreeningQuestion[];
    onClose: () => void;
    onSubmit: (answers: Record<number, any>) => void;
}

const CandidateScreeningWizard: React.FC<CandidateScreeningWizardProps> = ({ jobTitle, questions, onClose, onSubmit }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [isCompleted, setIsCompleted] = useState(false);
    
    // For Recruiter Video Presentation
    const [isPlayingRecruiterVideo, setIsPlayingRecruiterVideo] = useState(false);

    const currentQuestion = questions[currentIndex];
    const progress = ((currentIndex + 1) / questions.length) * 100;

    const handleAnswerChange = (value: any) => {
        setAnswers(prev => ({ ...prev, [currentQuestion.id]: value }));
    };

    const handleNext = () => {
        if (currentQuestion.isMandatory && !answers[currentQuestion.id]) {
            alert('אנא ענה על שאלת החובה לפני שתמשיך.');
            return;
        }

        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setIsPlayingRecruiterVideo(false); // Reset video state for next question
        } else {
            setIsCompleted(true);
            setTimeout(() => {
                onSubmit(answers);
            }, 2000); // Fake delay for success animation
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            setIsPlayingRecruiterVideo(false);
        }
    };

    // Render Success State
    if (isCompleted) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center flex flex-col items-center">
                    <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm animate-bounce-short">
                        <CheckCircleIcon className="w-12 h-12" />
                    </div>
                    <h2 className="text-2xl font-black text-text-default mb-2">תודה רבה!</h2>
                    <p className="text-text-muted mb-8">התשובות שלך נקלטו בהצלחה והועברו לצוות הגיוס.</p>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                         <div className="h-full bg-green-500 animate-[progress_2s_ease-out_forwards]" style={{width: '100%'}}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}>
             {/* Modal Container */}
            <div 
                className="bg-bg-default w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] animate-scale-up border border-white/20"
                onClick={e => e.stopPropagation()}
            >
                
                {/* Header */}
                <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-border-default flex-shrink-0">
                    <div>
                        <h2 className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-0.5">תהליך סינון</h2>
                        <p className="text-lg font-black text-text-default truncate max-w-[250px] md:max-w-md">{jobTitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-bg-subtle rounded-full hover:bg-bg-hover transition-colors text-text-muted">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress Bar */}
                <div className="h-1.5 w-full bg-gray-100 flex-shrink-0">
                    <div 
                        className="h-full bg-primary-600 transition-all duration-500 ease-out" 
                        style={{ width: `${progress}%` }}
                    ></div>
                </div>

                {/* Main Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col">
                    
                    {/* Question Context / Intro */}
                    {currentQuestion.introText && (
                        <div className="mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl text-sm text-blue-900 leading-relaxed flex gap-3 items-start animate-fade-in">
                            <SparklesIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div>{currentQuestion.introText}</div>
                        </div>
                    )}

                    {/* Question Content */}
                    <div className="mb-8">
                        {currentQuestion.presentationMode === 'video' ? (
                            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-lg border border-border-default group cursor-pointer" onClick={() => setIsPlayingRecruiterVideo(!isPlayingRecruiterVideo)}>
                                {!isPlayingRecruiterVideo && (
                                    <>
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/30 transition-colors z-10">
                                            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/50 pl-1 transition-transform group-hover:scale-110">
                                                <PlayIcon className="w-8 h-8 text-white" />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full font-medium backdrop-blur-sm flex items-center gap-2">
                                           <VideoCameraIcon className="w-3 h-3"/> הודעה מהמגייס
                                        </div>
                                        {/* Placeholder Image for Recruiter */}
                                        <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600" className="w-full h-full object-cover opacity-80" alt="Recruiter" />
                                    </>
                                )}
                                {isPlayingRecruiterVideo && (
                                    <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-900">
                                        <p>(סימולציה: וידאו מנגן)</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <h3 className="text-2xl font-extrabold text-text-default leading-tight">
                                {currentQuestion.text}
                            </h3>
                        )}
                        
                        {/* Subtitle for video mode */}
                        {currentQuestion.presentationMode === 'video' && (
                            <p className="mt-4 text-xl font-bold text-text-default">{currentQuestion.text}</p>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="mt-auto md:mt-0">
                        
                        {currentQuestion.type === 'text' && (
                            <textarea 
                                value={answers[currentQuestion.id] || ''}
                                onChange={(e) => handleAnswerChange(e.target.value)}
                                className="w-full bg-white border border-border-default rounded-xl p-4 text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm min-h-[160px] resize-none transition-shadow"
                                placeholder="כתוב את התשובה שלך כאן..."
                                autoFocus
                            />
                        )}

                        {currentQuestion.type === 'multiple_choice' && (
                             <div className="space-y-3">
                                {currentQuestion.options?.map((opt) => (
                                    <label 
                                        key={opt.id}
                                        className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                            answers[currentQuestion.id] === opt.text 
                                            ? 'border-primary-600 bg-primary-50 shadow-md transform scale-[1.01]' 
                                            : 'border-border-default bg-white hover:border-primary-200 hover:bg-bg-subtle'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 ${answers[currentQuestion.id] === opt.text ? 'border-primary-600' : 'border-gray-300'}`}>
                                            {answers[currentQuestion.id] === opt.text && <div className="w-2.5 h-2.5 rounded-full bg-primary-600" />}
                                        </div>
                                        <input 
                                            type="radio" 
                                            name={`q-${currentQuestion.id}`} 
                                            value={opt.text}
                                            checked={answers[currentQuestion.id] === opt.text}
                                            onChange={() => handleAnswerChange(opt.text)}
                                            className="hidden"
                                        />
                                        <span className={`font-medium text-lg ${answers[currentQuestion.id] === opt.text ? 'text-primary-900' : 'text-text-default'}`}>
                                            {opt.text}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {currentQuestion.type === 'yes_no' && (
                            <div className="grid grid-cols-2 gap-4">
                                {['כן', 'לא'].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => handleAnswerChange(opt)}
                                        className={`py-8 rounded-2xl font-bold text-xl border-2 transition-all ${
                                            answers[currentQuestion.id] === opt 
                                            ? 'border-primary-600 bg-primary-50 text-primary-800 shadow-md transform scale-[1.02]' 
                                            : 'border-border-default bg-white text-text-muted hover:border-primary-300 hover:bg-bg-subtle'
                                        }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}

                        {currentQuestion.type === 'video' && (
                            <div className="bg-black/5 rounded-2xl p-1 border border-border-default">
                                <VideoRecorder 
                                    onRecordingComplete={(blob) => handleAnswerChange(blob)}
                                    timeLimit={currentQuestion.timeLimit}
                                    retriesAllowed={currentQuestion.retriesAllowed}
                                />
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer Navigation */}
                <div className="p-5 border-t border-border-default bg-bg-subtle flex justify-between items-center flex-shrink-0">
                    <button 
                        onClick={handlePrev} 
                        disabled={currentIndex === 0}
                        className="text-text-muted font-bold px-4 py-2 rounded-lg hover:bg-white disabled:opacity-30 transition-colors text-sm"
                    >
                        חזור
                    </button>
                    
                    <div className="text-xs font-semibold text-text-subtle">
                        שאלה {currentIndex + 1} מתוך {questions.length}
                    </div>

                    <button 
                        onClick={handleNext} 
                        className="bg-primary-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-500/30 transition-all flex items-center gap-2 transform active:scale-95"
                    >
                        {currentIndex === questions.length - 1 ? 'סיום ושליחה' : 'המשך'}
                        {currentIndex < questions.length - 1 && <ChevronLeftIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
            
            <style>{`
                @keyframes progress { from { transform: translateX(-100%); } to { transform: translateX(0); } }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scale-up { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
                .animate-scale-up { animation: scale-up 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default CandidateScreeningWizard;
