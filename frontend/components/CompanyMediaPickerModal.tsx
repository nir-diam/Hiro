import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowUpTrayIcon,
    XMarkIcon,
    PhotoIcon,
    PaperClipIcon,
    DocumentIcon,
    ArrowDownTrayIcon,
} from './Icons';
import { fetchCompanyCreatedImages, type CompanyCreatedImage } from '../services/publishingApi';
import {
    fetchClientAttachments,
    uploadClientAttachment,
    formatAttachmentSize,
    isImageAttachment,
    type ClientAttachment,
} from '../services/clientAttachmentsApi';

export type CompanyMediaPickResult =
    | { kind: 'image'; url: string; label?: string }
    | { kind: 'attachment'; attachment: ClientAttachment };

type TabId = 'images' | 'attachments';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    clientId: string | null;
    uploadedBy?: string;
    /** Which tab to open first */
    initialTab?: TabId;
    onPick: (result: CompanyMediaPickResult) => void;
};

const CompanyMediaPickerModal: React.FC<Props> = ({
    isOpen,
    onClose,
    clientId,
    uploadedBy = 'מערכת',
    initialTab = 'images',
    onPick,
}) => {
    const [activeTab, setActiveTab] = useState<TabId>(initialTab);
    const [companyImages, setCompanyImages] = useState<CompanyCreatedImage[]>([]);
    const [attachments, setAttachments] = useState<ClientAttachment[]>([]);
    const [imagesLoading, setImagesLoading] = useState(false);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [imageUrlInput, setImageUrlInput] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const attachmentInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        setActiveTab(initialTab);
        setError(null);
        setImageUrlInput('');
    }, [isOpen, initialTab]);

    const loadImages = useCallback(async () => {
        if (!clientId) {
            setCompanyImages([]);
            return;
        }
        setImagesLoading(true);
        setError(null);
        try {
            setCompanyImages(await fetchCompanyCreatedImages(clientId));
        } catch (e) {
            setError((e as Error)?.message || 'שגיאה בטעינת תמונות');
            setCompanyImages([]);
        } finally {
            setImagesLoading(false);
        }
    }, [clientId]);

    const loadAttachments = useCallback(async () => {
        if (!clientId) {
            setAttachments([]);
            return;
        }
        setAttachmentsLoading(true);
        setError(null);
        try {
            setAttachments(await fetchClientAttachments(clientId));
        } catch (e) {
            setError((e as Error)?.message || 'שגיאה בטעינת צרופות');
            setAttachments([]);
        } finally {
            setAttachmentsLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        if (!isOpen || !clientId) return;
        void loadImages();
        void loadAttachments();
    }, [isOpen, clientId, loadImages, loadAttachments]);

    const handleUploadAttachment = async (file: File) => {
        if (!clientId) return;
        setUploading(true);
        setError(null);
        try {
            const created = await uploadClientAttachment(clientId, file, {
                uploadedBy,
                type: 'צרופה',
            });
            setAttachments((prev) => [created, ...prev]);
            if (isImageAttachment(created) && created.url) {
                onPick({ kind: 'image', url: created.url, label: created.name });
            } else {
                onPick({ kind: 'attachment', attachment: created });
            }
            onClose();
        } catch (e) {
            setError((e as Error)?.message || 'העלאת הקובץ נכשלה');
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-bg-card rounded-2xl shadow-2xl border border-border-default w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <div className="px-5 py-4 border-b border-border-default bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-lg font-bold text-text-default">צרופות ותמונות שנוצרו</h3>
                            <p className="text-xs text-text-muted mt-1">
                                אותו מאגר כמו ב־הגדרות → צרופות ותמונות שנוצרו. בחר פריט להוספה לתבנית.
                            </p>
                        </div>
                        <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={() => setActiveTab('images')}
                            className={`px-4 py-2 text-sm font-bold rounded-xl border transition flex items-center gap-1.5 ${
                                activeTab === 'images'
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white text-text-muted border-border-default hover:border-primary-300'
                            }`}
                        >
                            <PhotoIcon className="w-4 h-4" />
                            תמונות שנוצרו
                            {!imagesLoading ? (
                                <span className="text-xs opacity-80">({companyImages.length})</span>
                            ) : null}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('attachments')}
                            className={`px-4 py-2 text-sm font-bold rounded-xl border transition flex items-center gap-1.5 ${
                                activeTab === 'attachments'
                                    ? 'bg-primary-600 text-white border-primary-600'
                                    : 'bg-white text-text-muted border-border-default hover:border-primary-300'
                            }`}
                        >
                            <PaperClipIcon className="w-4 h-4" />
                            צרופות
                            {!attachmentsLoading ? (
                                <span className="text-xs opacity-80">({attachments.length})</span>
                            ) : null}
                        </button>
                    </div>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {!clientId ? (
                        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            יש לבחור לקוח לפני הוספת תמונות או צרופות.
                        </p>
                    ) : null}

                    {error ? (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
                    ) : null}

                    {activeTab === 'images' ? (
                        <>
                            <section className="space-y-2">
                                <h4 className="text-sm font-bold text-text-default">הדבק כתובת URL</h4>
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        value={imageUrlInput}
                                        onChange={(e) => setImageUrlInput(e.target.value)}
                                        placeholder="https://..."
                                        className="flex-1 bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                                        dir="ltr"
                                    />
                                    <button
                                        type="button"
                                        disabled={!imageUrlInput.trim()}
                                        onClick={() => {
                                            onPick({ kind: 'image', url: imageUrlInput.trim() });
                                            onClose();
                                        }}
                                        className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 disabled:opacity-50"
                                    >
                                        הוסף
                                    </button>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <h4 className="text-sm font-bold text-text-default">תמונות מהמאגר</h4>
                                {imagesLoading ? (
                                    <p className="text-sm text-text-muted py-6 text-center">טוען תמונות...</p>
                                ) : companyImages.length === 0 ? (
                                    <p className="text-sm text-text-muted bg-bg-subtle border border-dashed border-border-default rounded-xl p-4 text-center">
                                        אין תמונות במאגר. צרו תמונות בפרסום משרה או הוסיפו ב־הגדרות → צרופות ותמונות שנוצרו.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                                        {companyImages.map((img) => (
                                            <button
                                                key={img.id}
                                                type="button"
                                                onClick={() => {
                                                    onPick({ kind: 'image', url: img.url, label: img.label });
                                                    onClose();
                                                }}
                                                className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-border-default hover:border-primary-500 hover:ring-2 hover:ring-primary-200 transition text-right"
                                                title={img.label || 'בחר תמונה'}
                                            >
                                                <img
                                                    src={img.url}
                                                    alt={img.label || 'תמונה'}
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                />
                                                {img.label ? (
                                                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold px-2 py-1 truncate">
                                                        {img.label}
                                                    </span>
                                                ) : null}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="space-y-2 border-t border-border-subtle pt-4">
                                <h4 className="text-sm font-bold text-text-default">תמונות מצרופות (קבצי תמונה שהועלו)</h4>
                                {attachmentsLoading ? null : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {attachments.filter(isImageAttachment).map((att) => (
                                            <button
                                                key={att.id}
                                                type="button"
                                                onClick={() => {
                                                    if (att.url) onPick({ kind: 'image', url: att.url, label: att.name });
                                                    onClose();
                                                }}
                                                className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-border-default hover:border-primary-500 transition"
                                                title={att.name}
                                            >
                                                {att.url ? (
                                                    <img src={att.url} alt={att.name} className="absolute inset-0 w-full h-full object-cover" />
                                                ) : null}
                                                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold px-2 py-1 truncate">
                                                    {att.name}
                                                </span>
                                            </button>
                                        ))}
                                        {attachments.filter(isImageAttachment).length === 0 ? (
                                            <p className="col-span-full text-xs text-text-muted">אין תמונות בטאב הצרופות.</p>
                                        ) : null}
                                    </div>
                                )}
                            </section>
                        </>
                    ) : (
                        <>
                            <section className="space-y-3">
                                <h4 className="text-sm font-bold text-text-default">העלאת צרופה חדשה</h4>
                                <input
                                    ref={attachmentInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) void handleUploadAttachment(file);
                                        e.target.value = '';
                                    }}
                                />
                                <button
                                    type="button"
                                    disabled={uploading || !clientId}
                                    onClick={() => attachmentInputRef.current?.click()}
                                    className="inline-flex items-center gap-2 bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
                                >
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                    {uploading ? 'מעלה...' : 'העלאת צרופה'}
                                </button>
                                <p className="text-xs text-text-muted">PDF, Word, Excel, תמונות, ארכיונים וכל סוג קובץ.</p>
                            </section>

                            <section className="space-y-3">
                                <h4 className="text-sm font-bold text-text-default">צרופות קיימות</h4>
                                {attachmentsLoading ? (
                                    <p className="text-sm text-text-muted py-6 text-center">טוען צרופות...</p>
                                ) : attachments.length === 0 ? (
                                    <p className="text-sm text-text-muted bg-bg-subtle border border-dashed border-border-default rounded-xl p-4 text-center">
                                        אין צרופות. העלה קובץ למעלה או הוסף ב־הגדרות → צרופות ותמונות שנוצרו.
                                    </p>
                                ) : (
                                    <div className="space-y-2 max-h-80 overflow-y-auto">
                                        {attachments.map((attachment) => (
                                            <button
                                                key={attachment.id}
                                                type="button"
                                                onClick={() => {
                                                    if (isImageAttachment(attachment) && attachment.url) {
                                                        onPick({ kind: 'image', url: attachment.url, label: attachment.name });
                                                    } else {
                                                        onPick({ kind: 'attachment', attachment });
                                                    }
                                                    onClose();
                                                }}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-default bg-white hover:border-primary-400 hover:bg-primary-50/40 transition text-right"
                                            >
                                                <div className="shrink-0 w-10 h-10 rounded-lg bg-bg-subtle flex items-center justify-center overflow-hidden">
                                                    {isImageAttachment(attachment) && attachment.url ? (
                                                        <img src={attachment.url} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <DocumentIcon className="w-5 h-5 text-gray-500" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-text-default truncate">{attachment.name}</div>
                                                    <div className="text-xs text-text-muted">
                                                        {formatAttachmentSize(attachment.fileSize)}
                                                        {attachment.uploadDate
                                                            ? ` · ${new Date(attachment.uploadDate).toLocaleDateString('he-IL')}`
                                                            : ''}
                                                    </div>
                                                </div>
                                                {attachment.url ? <ArrowDownTrayIcon className="w-4 h-4 text-text-muted shrink-0" /> : null}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CompanyMediaPickerModal;
