
import React, { useState, useRef, useEffect } from 'react';
import { VideoCameraIcon, StopIcon, PlayIcon, ArrowPathIcon, CheckIcon, MicrophoneIcon } from './Icons';

interface VideoRecorderProps {
    onRecordingComplete: (blob: Blob | null) => void;
    timeLimit?: number; // in seconds
    retriesAllowed?: boolean;
}

const VideoRecorder: React.FC<VideoRecorderProps> = ({ onRecordingComplete, timeLimit = 60, retriesAllowed = true }) => {
    const [status, setStatus] = useState<'idle' | 'recording' | 'review'>('idle');
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        // Cleanup stream on unmount
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (status === 'recording' && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        stopRecording();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.muted = true; // Mute preview to avoid feedback
                videoRef.current.play();
            }
            setError(null);
        } catch (err) {
            console.error("Error accessing camera:", err);
            setError("לא ניתן לגשת למצלמה. אנא וודא שנתת הרשאות מתאימות.");
        }
    };

    const startRecording = async () => {
        if (!streamRef.current) await startCamera();
        
        if (streamRef.current) {
            const mediaRecorder = new MediaRecorder(streamRef.current);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoSrc(url);
                setStatus('review');
                
                // Automatically pass the recorded blob to parent
                onRecordingComplete(blob);
                
                // Stop camera stream after recording to save battery/resources
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            };

            mediaRecorder.start();
            setStatus('recording');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && status === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    const handleRetake = () => {
        setVideoSrc(null);
        setTimeLeft(timeLimit);
        setStatus('idle');
        onRecordingComplete(null); // Clear the answer in parent
        startCamera();
    };

    // Format time MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (error) {
        return (
            <div className="bg-red-50 p-6 rounded-xl border border-red-200 text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 text-red-600">
                    <VideoCameraIcon className="w-6 h-6"/>
                </div>
                <p className="text-red-800 font-medium mb-4">{error}</p>
                <button onClick={() => { setError(null); startCamera(); }} className="text-sm font-bold text-red-700 underline">נסה שוב</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <div className="relative w-full max-w-sm aspect-[3/4] bg-black rounded-2xl overflow-hidden shadow-lg border border-border-default">
                {status === 'review' && videoSrc ? (
                    <video src={videoSrc} controls className="w-full h-full object-cover" />
                ) : (
                    <>
                        <video ref={videoRef} className={`w-full h-full object-cover ${status === 'idle' && !streamRef.current ? 'hidden' : ''}`} playsInline muted />
                        {status === 'idle' && !streamRef.current && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-gray-900">
                                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
                                    <VideoCameraIcon className="w-8 h-8 text-gray-400" />
                                </div>
                                <p className="text-sm font-medium">המצלמה כבויה</p>
                                <button onClick={startCamera} className="mt-4 px-6 py-2 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition">
                                    הפעל מצלמה
                                </button>
                            </div>
                        )}
                        
                        {/* Recording Indicators Overlay */}
                        {status === 'recording' && (
                            <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600/80 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm animate-pulse">
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                                REC {formatTime(timeLimit - timeLeft)}
                            </div>
                        )}
                        {status === 'recording' && (
                             <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
                                {formatTime(timeLeft)} נותרו
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Controls */}
            <div className="mt-6 flex items-center justify-center gap-6 w-full">
                {status === 'idle' && (
                    <button 
                        onClick={startRecording}
                        className="w-16 h-16 bg-red-500 rounded-full border-4 border-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
                        title="התחל הקלטה"
                    >
                        <div className="w-6 h-6 bg-white rounded-full"></div>
                    </button>
                )}

                {status === 'recording' && (
                    <button 
                        onClick={stopRecording}
                        className="w-16 h-16 bg-white border-4 border-red-500 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
                        title="עצור הקלטה"
                    >
                        <div className="w-6 h-6 bg-red-500 rounded-sm"></div>
                    </button>
                )}

                {status === 'review' && retriesAllowed && (
                    <button 
                        onClick={handleRetake}
                        className="flex items-center gap-2 text-text-muted hover:text-text-default transition-colors p-2 bg-bg-subtle/50 hover:bg-bg-subtle rounded-xl"
                    >
                        <div className="w-8 h-8 bg-bg-card rounded-full flex items-center justify-center shadow-sm">
                            <ArrowPathIcon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-bold">לא מרוצה? הקלט שוב</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default VideoRecorder;
