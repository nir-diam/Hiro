import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    PhotoIcon,
    ArrowTopRightOnSquareIcon,
    TrashIcon,
    PaperClipIcon,
    ArrowUpTrayIcon,
    DocumentIcon,
    ArchiveBoxIcon,
    ArrowDownTrayIcon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import {
    fetchCompanyCreatedImages,
    removeHeroGalleryImage,
    type CompanyCreatedImage,
} from '../services/publishingApi';
import {
    deleteClientAttachment,
    fetchClientAttachments,
    formatAttachmentSize,
    isImageAttachment,
    uploadClientAttachment,
    type ClientAttachment,
} from '../services/clientAttachmentsApi';

type TabId = 'created' | 'attachments';

const formatDate = (value?: string | null) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '—';
    }
};

const attachmentIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'zip':
        case 'rar':
        case '7z':
            return <ArchiveBoxIcon className="w-8 h-8 text-primary-500" />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'webp':
            return <PhotoIcon className="w-8 h-8 text-accent-500" />;
        default:
            return <DocumentIcon className="w-8 h-8 text-gray-500" />;
    }
};

const CreatedImagesTab: React.FC<{
    images: CompanyCreatedImage[];
    loading: boolean;
    error: string | null;
    deletingId: string | null;
    onDelete: (image: CompanyCreatedImage) => void;
    onNavigateJob: (jobId: string) => void;
}> = ({ images, loading, error, deletingId, onDelete, onNavigateJob }) => (
    <div className="p-6">
        {loading && <p className="text-sm text-text-muted">טוען תמונות...</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {!loading && images.length === 0 && (
            <p className="text-center text-text-muted py-12">
                עדיין לא נוצרו תמונות. צרו מודעות בעמוד פרסום משרה → תמונת נושא / באנר.
            </p>
        )}

        {!loading && images.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {images.map((image) => (
                    <div
                        key={image.id}
                        className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                    >
                        <button
                            type="button"
                            onClick={() => window.open(image.url, '_blank', 'noopener,noreferrer')}
                            className="relative aspect-[3/4] bg-slate-200 group cursor-pointer"
                            title="פתח בלשונית חדשה"
                        >
                            <img
                                src={image.url}
                                alt={image.label || 'תמונה'}
                                className="absolute inset-0 w-full h-full object-cover group-hover:opacity-95 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <ArrowTopRightOnSquareIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                            </div>
                        </button>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                            <div className="font-bold text-sm text-text-default line-clamp-2 min-h-[2.5rem]">
                                {image.label || 'ללא כותרת'}
                            </div>
                            <div className="text-xs text-text-muted">{formatDate(image.createdAt)}</div>
                            <span
                                className={`self-start inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    image.source === 'gallery'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                        : 'bg-teal-50 text-teal-800 border border-teal-100'
                                }`}
                            >
                                {image.source === 'gallery' ? 'מאגר החברה' : 'משרה מפורסמת'}
                            </span>
                            <div className="mt-auto pt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.open(image.url, '_blank', 'noopener,noreferrer')}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    פתח
                                </button>
                                {image.jobId && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateJob(image.jobId!)}
                                        className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                                    >
                                        למשרה
                                    </button>
                                )}
                                {image.canDelete && (
                                    <button
                                        type="button"
                                        disabled={deletingId === image.id}
                                        onClick={() => onDelete(image)}
                                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                        title="מחק מהמאגר"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const AttachmentsTab: React.FC<{ clientId: string | null; userName?: string }> = ({ clientId, userName }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!clientId) {
            setAttachments([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            setAttachments(await fetchClientAttachments(clientId));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'שגיאה בטעינת צרופות');
            setAttachments([]);
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleUpload = async (file: File) => {
        if (!clientId) return;
        setUploading(true);
        setError(null);
        try {
            const created = await uploadClientAttachment(clientId, file, {
                uploadedBy: userName || 'מערכת',
                type: 'צרופה',
            });
            setAttachments((prev) => [created, ...prev]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'העלאת הצרופה נכשלה');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (attachment: ClientAttachment) => {
        if (!clientId) return;
        if (!window.confirm(`למחוק את "${attachment.name}"?`)) return;
        setDeletingId(attachment.id);
        setError(null);
        try {
            await deleteClientAttachment(clientId, attachment.id);
            setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'מחיקה נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    if (!clientId) {
        return (
            <div className="p-6">
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    יש להתחבר עם משתמש המשויך ללקוח כדי לנהל צרופות.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-text-muted">
                    כל סוגי הקבצים שהועלו כצרופה — PDF, Word, Excel, תמונות, ארכיונים ועוד.
                </p>
                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUpload(file);
                            e.target.value = '';
                        }}
                    />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-primary-700 transition disabled:opacity-50"
                    >
                        <ArrowUpTrayIcon className="w-5 h-5" />
                        {uploading ? 'מעלה...' : 'העלאת צרופה'}
                    </button>
                </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            {loading ? (
                <p className="text-sm text-text-muted py-8 text-center">טוען צרופות...</p>
            ) : attachments.length === 0 ? (
                <p className="text-center text-text-muted py-12 border border-dashed border-border-default rounded-2xl">
                    אין צרופות עדיין. לחץ &quot;העלאת צרופה&quot; כדי להוסיף קובץ.
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {attachments.map((attachment) => (
                        <div
                            key={attachment.id}
                            className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex gap-3 shadow-sm"
                        >
                            <div className="shrink-0 w-14 h-14 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
                                {isImageAttachment(attachment) && attachment.url ? (
                                    <img
                                        src={attachment.url}
                                        alt={attachment.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    attachmentIcon(attachment.name)
                                )}
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <div className="font-bold text-sm text-text-default truncate" title={attachment.name}>
                                    {attachment.name}
                                </div>
                                <div className="text-xs text-text-muted">
                                    {formatAttachmentSize(attachment.fileSize)} · {formatDate(attachment.uploadDate)}
                                </div>
                                <div className="text-[11px] text-text-muted truncate">
                                    {attachment.uploadedBy || '—'}
                                </div>
                                <div className="mt-auto pt-2 flex gap-2">
                                    {attachment.url ? (
                                        <a
                                            href={attachment.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100"
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            צפייה
                                        </a>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={deletingId === attachment.id}
                                        onClick={() => void handleDelete(attachment)}
                                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                        title="מחק"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const CompanyImagesSettingsView: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const clientId = user?.clientId?.trim() || null;
    const [activeTab, setActiveTab] = useState<TabId>('created');
    const [images, setImages] = useState<CompanyCreatedImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadImages = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setImages(await fetchCompanyCreatedImages(clientId));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'שגיאה בטעינת התמונות');
            setImages([]);
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        if (activeTab !== 'created') return;
        void loadImages();
    }, [activeTab, loadImages]);

    const handleDelete = async (image: CompanyCreatedImage) => {
        if (!image.canDelete) return;
        if (!window.confirm('למחוק את התמונה מהמאגר?')) return;
        setDeletingId(image.id);
        setError(null);
        try {
            await removeHeroGalleryImage(image.id, clientId);
            await loadImages();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'מחיקת התמונה נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-border-default bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-text-default flex items-center gap-2">
                        <PhotoIcon className="w-6 h-6 text-primary-500" />
                        צרופות ותמונות שנוצרו
                    </h2>
                    <p className="text-sm text-text-muted mt-1">
                        ניהול תמונות AI / באנר וצרופות קבצים של החברה.
                    </p>
                </div>
            </div>

            <div className="px-6 pt-4 border-b border-border-default bg-white">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('created')}
                        className={`px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 transition ${
                            activeTab === 'created'
                                ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                                : 'border-transparent text-text-muted hover:text-text-default'
                        }`}
                    >
                        תמונות שנוצרו
                        {!loading && activeTab === 'created' ? (
                            <span className="mr-2 text-xs font-normal text-text-muted">({images.length})</span>
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('attachments')}
                        className={`px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 transition flex items-center gap-1.5 ${
                            activeTab === 'attachments'
                                ? 'border-primary-600 text-primary-700 bg-primary-50/50'
                                : 'border-transparent text-text-muted hover:text-text-default'
                        }`}
                    >
                        <PaperClipIcon className="w-4 h-4" />
                        צרופות
                    </button>
                </div>
            </div>

            {activeTab === 'created' ? (
                <CreatedImagesTab
                    images={images}
                    loading={loading}
                    error={error}
                    deletingId={deletingId}
                    onDelete={(image) => void handleDelete(image)}
                    onNavigateJob={(jobId) => navigate(`/jobs/${jobId}/publish`)}
                />
            ) : (
                <AttachmentsTab clientId={clientId} userName={user?.name || undefined} />
            )}
        </div>
    );
};

export default CompanyImagesSettingsView;
