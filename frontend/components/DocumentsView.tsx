
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, EllipsisVerticalIcon, Squares2X2Icon, TableCellsIcon, TrashIcon, PencilIcon, ArrowDownTrayIcon, FolderIcon, DocumentIcon, PhotoIcon, ArchiveBoxIcon } from './Icons';
import DocumentFormModal, { Document, DocumentType } from './DocumentFormModal';
import { useLanguage } from '../context/LanguageContext';

type BackendDoc = Document & { id: string; key?: string; url?: string };

const normalizeDoc = (row: Record<string, unknown>): BackendDoc => ({
  id: String(row.id),
  name: String(row.name || ''),
  type: row.type as DocumentType,
  uploadDate: String(row.uploadDate || new Date().toISOString()),
  uploadedBy: String(row.uploadedBy || 'מערכת'),
  notes: String(row.notes || ''),
  fileSize: Number(row.fileSize ?? 0),
  key: row.key ? String(row.key) : undefined,
  url: row.url ? String(row.url) : undefined,
});

const documentTypeStyles: { [key in DocumentType]: { bg: string; text: string; } } = {
  'קורות חיים': { bg: 'bg-secondary-100', text: 'text-secondary-800' },
  'תעודה': { bg: 'bg-primary-100', text: 'text-primary-800' },
  'מסמך זיהוי': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'חוזה': { bg: 'bg-accent-100', text: 'text-accent-800' },
  'הסכם': { bg: 'bg-accent-100', text: 'text-accent-800' },
  'חשבונית': { bg: 'bg-purple-100', text: 'text-purple-800' },
  'אחר': { bg: 'bg-gray-200', text: 'text-gray-800' },
};

const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'pdf': return <DocumentIcon className="w-8 h-8 text-red-500"/>;
        case 'doc':
        case 'docx': return <DocumentIcon className="w-8 h-8 text-secondary-500"/>;
        case 'jpg':
        case 'jpeg':
        case 'png': return <PhotoIcon className="w-8 h-8 text-accent-500"/>;
        case 'zip':
        case 'rar': return <ArchiveBoxIcon className="w-8 h-8 text-primary-500"/>;
        default: return <DocumentIcon className="w-8 h-8 text-gray-500"/>;
    }
}

const formatFileSize = (kilobytes: number) => {
    if (kilobytes < 1024) {
        return `${kilobytes} KB`;
    } else {
        return `${(kilobytes / 1024).toFixed(1)} MB`;
    }
}

const FILTER_ALL = 'הכול';

export interface DocumentsViewProps {
    candidateId?: string;
    candidateName?: string;
}

const DocumentsView: React.FC<DocumentsViewProps> = ({ candidateId, candidateName = '' }) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [documents, setDocuments] = useState<BackendDoc[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState(FILTER_ALL);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<BackendDoc | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const resolvedId = candidateId && String(candidateId).trim() && String(candidateId) !== 'undefined' ? String(candidateId) : '';

    const handleCreateDoc = () => {
        setEditingDoc(null);
        setIsModalOpen(true);
    };

    const handleEditDoc = (doc: BackendDoc) => {
        setEditingDoc(doc);
        setIsModalOpen(true);
        setOpenMenuId(null);
    };

    const handleDeleteDoc = async (docId: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק את המסמך?')) return;
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        if (apiBase && resolvedId) {
            await fetch(`${apiBase}/api/candidates/${resolvedId}/documents/${docId}`, { method: 'DELETE' }).catch(() => null);
        }
        setOpenMenuId(null);
    };

    const handleSaveDoc = async (docData: Omit<Document, 'id' | 'uploadDate' | 'fileSize'> & { id?: string | number; file?: File | null }) => {
        if (!apiBase || !resolvedId) {
            setIsModalOpen(false);
            return;
        }

        if (docData?.id != null && !docData?.file) {
            const res = await fetch(`${apiBase}/api/candidates/${resolvedId}/documents/${docData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: docData.name,
                    type: docData.type,
                    notes: docData.notes,
                    uploadedBy: docData.uploadedBy,
                }),
            }).catch(() => null);
            if (res && res.ok) {
                const updated = normalizeDoc(await res.json());
                setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
            }
            setIsModalOpen(false);
            return;
        }

        const file: File | null = docData?.file ?? null;
        if (!file) {
            setIsModalOpen(false);
            return;
        }

        const uploadRes = await fetch(`${apiBase}/api/candidates/${resolvedId}/documents/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream' }),
        });
        if (!uploadRes.ok) {
            setIsModalOpen(false);
            return;
        }
        const { uploadUrl, key, publicUrl } = await uploadRes.json();

        const putRes = await fetch(uploadUrl, { method: 'PUT', body: file });
        if (!putRes.ok) {
            setIsModalOpen(false);
            return;
        }

        const fileSizeKb = Math.max(1, Math.round(file.size / 1024));
        const attachRes = await fetch(`${apiBase}/api/candidates/${resolvedId}/documents/attach`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: docData.name,
                type: docData.type,
                notes: docData.notes,
                uploadedBy: docData.uploadedBy,
                fileSize: fileSizeKb,
                key,
                url: publicUrl,
                uploadDate: new Date().toISOString(),
            }),
        });
        if (attachRes.ok) {
            const created = normalizeDoc(await attachRes.json());
            setDocuments((prev) => [created, ...prev]);
        }

        setIsModalOpen(false);
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!apiBase || !resolvedId) {
            setDocuments([]);
            setLoadError(null);
            setIsLoading(false);
            return;
        }
        let active = true;
        setIsLoading(true);
        setLoadError(null);
        fetch(`${apiBase}/api/candidates/${resolvedId}/documents`)
            .then((r) => {
                if (!r.ok) throw new Error(t('documents_view.load_error'));
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : [];
                setDocuments(list.map(normalizeDoc));
            })
            .catch(() => {
                if (!active) return;
                setLoadError(t('documents_view.load_error'));
                setDocuments([]);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, resolvedId, t]);

    const filteredDocuments = useMemo(() => {
        return documents
            .filter(doc => filterType === FILTER_ALL || doc.type === filterType)
            .filter(doc => doc.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [documents, searchTerm, filterType]);

    if (!resolvedId) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 border border-border-default">
                <div className="text-center py-16 text-text-muted">{t('documents_view.need_save_candidate')}</div>
            </div>
        );
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 border border-border-default">
            {loadError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-3 py-2">{loadError}</div>
            )}
            {isLoading && (
                <div className="text-xs text-text-subtle mb-2">{t('documents_view.loading')}</div>
            )}
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder={t('documents_view.search')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                        />
                    </div>
                    <div className="relative">
                         <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="appearance-none bg-bg-input border border-border-default rounded-lg py-2 pl-8 pr-3 text-sm font-semibold text-text-default"
                         >
                            <option value={FILTER_ALL}>{t('filter.status_all')}</option>
                            <option value="קורות חיים">{t('documents_view.type_cv')}</option>
                            <option value="תעודה">{t('documents_view.type_certificate')}</option>
                            <option value="מסמך זיהוי">{t('documents_view.type_id')}</option>
                            <option value="חוזה">{t('documents_view.type_contract')}</option>
                            <option value="הסכם">{t('documents_view.type_agreement')}</option>
                            <option value="חשבונית">{t('documents_view.type_invoice')}</option>
                            <option value="אחר">{t('documents_view.type_other')}</option>
                        </select>
                        <ChevronDownIcon className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button type="button" onClick={() => setViewMode('table')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button type="button" onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                     <button type="button" onClick={handleCreateDoc} className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                        <PlusIcon className="w-5 h-5"/>
                        <span>{t('documents_view.upload')}</span>
                    </button>
                </div>
            </header>
            
            <main className="flex-1 overflow-y-auto">
            {filteredDocuments.length > 0 ? (
                viewMode === 'table' ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80">
                            <tr>
                                <th className="px-4 py-3">{t('documents_view.col_name')}</th>
                                <th className="px-4 py-3">{t('documents_view.col_type')}</th>
                                <th className="px-4 py-3">{t('documents_view.col_date')}</th>
                                <th className="px-4 py-3">{t('documents_view.col_uploadedBy')}</th>
                                <th className="px-4 py-3">{t('documents_view.col_size')}</th>
                                <th className="px-4 py-3">{t('documents_view.col_notes')}</th>
                                <th className="px-4 py-3 text-center">{t('documents_view.col_actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {filteredDocuments.map(doc => (
                            <tr key={doc.id} className="hover:bg-bg-hover">
                                <td className="px-4 py-3">
                                    {doc.url ? (
                                        <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-primary-700 hover:underline">{doc.name}</a>
                                    ) : (
                                        <span className="font-semibold text-text-default">{doc.name}</span>
                                    )}
                                </td>
                                <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${documentTypeStyles[doc.type as DocumentType]?.bg || 'bg-gray-100'} ${documentTypeStyles[doc.type as DocumentType]?.text || 'text-gray-800'}`}>{doc.type}</span></td>
                                <td className="px-4 py-3 text-text-muted">{new Date(doc.uploadDate).toLocaleDateString('he-IL')}</td>
                                <td className="px-4 py-3 text-text-muted">{doc.uploadedBy}</td>
                                <td className="px-4 py-3 text-text-muted">{formatFileSize(doc.fileSize)}</td>
                                <td className="px-4 py-3 text-text-subtle truncate" title={doc.notes}>{doc.notes || '-'}</td>
                                <td className="px-4 py-3 text-center">
                                    <div className="relative inline-block" ref={openMenuId === doc.id ? menuRef : null}>
                                        <button type="button" onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)} className="p-2 rounded-full hover:bg-bg-hover text-text-subtle"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                        {openMenuId === doc.id && (
                                            <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10">
                                                <button type="button" onClick={() => handleEditDoc(doc)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> {t('resume.edit')}</button>
                                                {doc.url ? (
                                                    <a href={doc.url} target="_blank" rel="noreferrer" className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><ArrowDownTrayIcon className="w-4 h-4"/> {t('resume.download')}</a>
                                                ) : (
                                                    <span className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-subtle opacity-60 cursor-not-allowed"><ArrowDownTrayIcon className="w-4 h-4"/> {t('resume.download')}</span>
                                                )}
                                                <button type="button" onClick={() => handleDeleteDoc(doc.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> {t('resume.delete')}</button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredDocuments.map(doc => (
                        <div key={doc.id} className="bg-bg-card rounded-lg border border-border-default shadow-sm p-3 flex flex-col text-center group relative">
                             <div className="absolute top-2 left-2" ref={openMenuId === doc.id ? menuRef : null}>
                                <button type="button" onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)} className="p-1.5 rounded-full hover:bg-bg-hover text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                {openMenuId === doc.id && (
                                    <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10">
                                        <button type="button" onClick={() => handleEditDoc(doc)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> {t('resume.edit')}</button>
                                        {doc.url ? (
                                            <a href={doc.url} target="_blank" rel="noreferrer" className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><ArrowDownTrayIcon className="w-4 h-4"/> {t('resume.download')}</a>
                                        ) : (
                                            <span className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-subtle opacity-60 cursor-not-allowed"><ArrowDownTrayIcon className="w-4 h-4"/> {t('resume.download')}</span>
                                        )}
                                        <button type="button" onClick={() => handleDeleteDoc(doc.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> {t('resume.delete')}</button>
                                    </div>
                                )}
                            </div>
                            <div className="flex-grow flex flex-col items-center justify-center py-4">
                               {getFileIcon(doc.name)}
                                {doc.url ? (
                                    <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-text-default mt-3 text-sm hover:text-primary-700 break-words w-full">{doc.name}</a>
                                ) : (
                                    <span className="font-semibold text-text-default mt-3 text-sm break-words w-full">{doc.name}</span>
                                )}
                            </div>
                            <div className="text-xs text-text-muted border-t border-border-default pt-2">
                                <p>{doc.type}</p>
                                <p>{new Date(doc.uploadDate).toLocaleDateString('he-IL')} &bull; {formatFileSize(doc.fileSize)}</p>
                            </div>
                        </div>
                    ))}
                </div>
                )
            ) : (
                <div className="text-center py-16 flex flex-col items-center">
                    <FolderIcon className="w-16 h-16 text-text-subtle mb-4"/>
                    <h3 className="text-xl font-bold text-text-default">{t('documents_view.empty_title')}</h3>
                    <p className="mt-2 text-text-muted">{t('documents_view.empty_hint_candidate')}</p>
                    <button type="button" onClick={handleCreateDoc} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-5 rounded-lg hover:bg-primary-600 transition shadow-md mt-4">
                        <PlusIcon className="w-5 h-5"/>
                        <span>{t('documents_view.upload')}</span>
                    </button>
                </div>
            )}
            </main>

            <DocumentFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveDoc}
                document={editingDoc}
                context="candidate"
                contextName={candidateName}
            />
        </div>
    );
};

export default DocumentsView;
