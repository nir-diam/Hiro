import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoCameraIcon, XMarkIcon } from './Icons';

type CandidateProfileVideoModalProps = {
    isOpen: boolean;
    onClose: () => void;
    existingVideoUrl?: string;
    onSave: (blob: Blob) => Promise<void>;
    onDelete: () => Promise<void>;
    isSaving?: boolean;
};

const pickRecorderMimeType = (): string => {
    const candidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

const CandidateProfileVideoModal: React.FC<CandidateProfileVideoModalProps> = ({
    isOpen,
    onClose,
    existingVideoUrl,
    onSave,
    onDelete,
    isSaving = false,
}) => {
    const liveVideoRef = useRef<HTMLVideoElement>(null);
    const playbackVideoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const recordedPreviewUrlRef = useRef<string | null>(null);

    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [mode, setMode] = useState<'existing' | 'camera'>('camera');
    const [liveStreamVersion, setLiveStreamVersion] = useState(0);

    const revokeRecordedPreviewUrl = useCallback(() => {
        if (recordedPreviewUrlRef.current) {
            URL.revokeObjectURL(recordedPreviewUrlRef.current);
            recordedPreviewUrlRef.current = null;
        }
    }, []);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const liveEl = liveVideoRef.current;
        if (liveEl) liveEl.srcObject = null;
    }, []);

    const resetRecording = useCallback(() => {
        chunksRef.current = [];
        recorderRef.current = null;
        setIsRecording(false);
        setRecordedBlob(null);
        revokeRecordedPreviewUrl();
        setRecordedPreviewUrl(null);
    }, [revokeRecordedPreviewUrl]);

    const attachStreamToLiveVideo = useCallback(async () => {
        const stream = streamRef.current;
        const liveEl = liveVideoRef.current;
        if (!stream || !liveEl) return false;
        if (liveEl.srcObject !== stream) {
            liveEl.srcObject = stream;
        }
        try {
            await liveEl.play();
        } catch {
            /* autoplay policies — preview may still render a frame */
        }
        return true;
    }, []);

    const startCamera = useCallback(async () => {
        setCameraError(null);
        setIsCameraReady(false);
        stopStream();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = stream;
            setLiveStreamVersion((v) => v + 1);
            setIsCameraReady(true);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'לא ניתן לגשת למצלמה';
            setCameraError(message);
        }
    }, [stopStream]);

    const showExisting = mode === 'existing' && Boolean(existingVideoUrl) && !recordedBlob;
    const showRecordedPreview = Boolean(recordedPreviewUrl);
    const showLiveCamera = mode === 'camera' && !showRecordedPreview;

    useEffect(() => {
        if (!isOpen) {
            stopStream();
            resetRecording();
            setMode('camera');
            setIsCameraReady(false);
            return;
        }

        if (recordedBlob || recordedPreviewUrl) return;

        if (existingVideoUrl) {
            setMode('existing');
            stopStream();
            return;
        }

        setMode('camera');
        void startCamera();
    }, [isOpen, existingVideoUrl, recordedBlob, recordedPreviewUrl, startCamera, stopStream, resetRecording]);

    useEffect(() => {
        if (!isOpen || !showLiveCamera || !isCameraReady) return;
        void attachStreamToLiveVideo();
    }, [isOpen, showLiveCamera, isCameraReady, liveStreamVersion, attachStreamToLiveVideo]);

    useEffect(() => {
        if (!showRecordedPreview || !recordedPreviewUrl) return;
        const playbackEl = playbackVideoRef.current;
        if (!playbackEl) return;
        playbackEl.src = recordedPreviewUrl;
        playbackEl.load();
        void playbackEl.play().catch(() => undefined);
    }, [showRecordedPreview, recordedPreviewUrl]);

    useEffect(() => () => {
        stopStream();
        revokeRecordedPreviewUrl();
    }, [stopStream, revokeRecordedPreviewUrl]);

    const handleStartRecording = () => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        const mimeType = pickRecorderMimeType();
        const recorder = mimeType
            ? new MediaRecorder(streamRef.current, { mimeType })
            : new MediaRecorder(streamRef.current);
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
            const type = recorder.mimeType || mimeType || 'video/webm';
            const blob = new Blob(chunksRef.current, { type });
            if (!blob.size) {
                setCameraError('ההקלטה ריקה — נסה/י שוב');
                void startCamera();
                return;
            }
            revokeRecordedPreviewUrl();
            const previewUrl = URL.createObjectURL(blob);
            recordedPreviewUrlRef.current = previewUrl;
            setRecordedBlob(blob);
            setRecordedPreviewUrl(previewUrl);
            stopStream();
        };
        recorder.start(250);
        setIsRecording(true);
    };

    const handleStopRecording = () => {
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
        }
        setIsRecording(false);
    };

    const handleFinish = async () => {
        if (recordedBlob) {
            await onSave(recordedBlob);
            onClose();
            return;
        }
        onClose();
    };

    const handleDelete = async () => {
        if (showRecordedPreview && !showExisting) {
            resetRecording();
            setMode('camera');
            void startCamera();
            return;
        }
        if (!window.confirm('למחוק את הווידאו התדמיתי?')) return;
        await onDelete();
        resetRecording();
        setMode('camera');
        void startCamera();
    };

    const handleRecordAgain = () => {
        resetRecording();
        setMode('camera');
        void startCamera();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-bg-card w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-black text-xl text-text-default flex items-center gap-2">
                        <VideoCameraIcon className="w-6 h-6 text-primary-600" />
                        הקלטת וידאו אישי
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-text-muted hover:text-text-default p-2 rounded-full hover:bg-bg-subtle transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative p-0 bg-black aspect-video overflow-hidden">
                    {showExisting && (
                        <video
                            key={existingVideoUrl}
                            src={existingVideoUrl}
                            controls
                            playsInline
                            className="absolute inset-0 z-[1] w-full h-full object-cover bg-black"
                        />
                    )}

                    {showRecordedPreview && (
                        <video
                            ref={playbackVideoRef}
                            controls
                            playsInline
                            className="absolute inset-0 z-[1] w-full h-full object-cover bg-black"
                        />
                    )}

                    {showLiveCamera && (
                        <>
                            <video
                                ref={liveVideoRef}
                                muted
                                autoPlay
                                playsInline
                                className="absolute inset-0 z-[1] w-full h-full object-cover bg-black scale-x-[-1]"
                            />
                            {!isCameraReady && !cameraError && (
                                <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center bg-slate-900 text-white">
                                    <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700">
                                        <VideoCameraIcon className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <p className="text-slate-400 text-sm">טוען מצלמה...</p>
                                </div>
                            )}
                            {cameraError && (
                                <div className="absolute inset-0 z-[2] flex items-center justify-center bg-slate-900 text-center px-6">
                                    <p className="text-red-300 text-sm">{cameraError}</p>
                                </div>
                            )}
                            {isCameraReady && !isRecording && (
                                <div className="absolute bottom-4 inset-x-0 z-[2] flex justify-center pointer-events-none">
                                    <p className="text-slate-200 text-sm bg-black/50 px-3 py-1 rounded-full">המצלמה מוכנה</p>
                                </div>
                            )}
                            {isRecording && (
                                <div className="absolute top-4 right-4 z-[2] flex items-center gap-2 bg-red-600/90 px-3 py-1 rounded-full text-xs font-bold text-white">
                                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    מקליט
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="p-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-bg-subtle border-t border-border-default">
                    <div className="text-sm text-text-muted text-right max-w-sm">
                        <strong>טיפ:</strong> הצג את עצמך בקצרה, מה אתה מחפש, ומה היתרון הבולט שלך.
                        <br />
                        הוידאו חשוף אך ורק למגייסים אליהם הגשת מועמדות.
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap justify-end">
                        {(showExisting || showRecordedPreview) && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="flex items-center justify-center px-4 py-3 rounded-xl text-red-600 font-bold hover:bg-red-50 transition disabled:opacity-60"
                            >
                                מחק הקלטה
                            </button>
                        )}
                        {showExisting && (
                            <button
                                type="button"
                                onClick={handleRecordAgain}
                                disabled={isSaving}
                                className="flex items-center justify-center px-4 py-3 rounded-xl text-primary-700 font-bold border border-primary-200 hover:bg-primary-50 transition disabled:opacity-60"
                            >
                                הקליט מחדש
                            </button>
                        )}
                        {showLiveCamera && isCameraReady && !isRecording && (
                            <button
                                type="button"
                                onClick={handleStartRecording}
                                disabled={isSaving}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-700 transition shadow-sm disabled:opacity-60"
                            >
                                <div className="w-3 h-3 bg-white rounded-full" />
                                <span>התחל להקליט</span>
                            </button>
                        )}
                        {showLiveCamera && isRecording && (
                            <button
                                type="button"
                                onClick={handleStopRecording}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-red-700 transition shadow-sm"
                            >
                                <span className="w-3 h-3 bg-white rounded-sm" />
                                <span>עצור הקלטה</span>
                            </button>
                        )}
                        {(showExisting || showRecordedPreview) && (
                            <button
                                type="button"
                                onClick={handleFinish}
                                disabled={isSaving}
                                className="flex-1 sm:flex-none bg-primary-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-700 transition shadow-sm disabled:opacity-60"
                            >
                                {isSaving ? 'שומר...' : showRecordedPreview ? 'שמור וסיים' : 'סיום'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CandidateProfileVideoModal;
