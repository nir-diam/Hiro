import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, EllipsisVerticalIcon, Squares2X2Icon, TableCellsIcon, TrashIcon, PencilIcon, ArrowDownTrayIcon, FolderIcon, DocumentIcon, PhotoIcon, ArchiveBoxIcon } from './Icons';
import DocumentFormModal, { Document, DocumentType } from './DocumentFormModal';

interface ClientDocumentsTabProps {
  clientId: string;
  clientName: string;
}

type BackendDoc = Omit<Document, 'id'> & { id: string; key?: string; url?: string };

const normalizeDoc = (row: any): BackendDoc => ({
  id: String(row.id),
  name: row.name || '',
  type: row.type as DocumentType,
  uploadDate: row.uploadDate || new Date().toISOString(),
  uploadedBy: row.uploadedBy || 'מערכת',
  notes: row.notes || '',
  fileSize: Number(row.fileSize ?? 0),
  key: row.key,
  url: row.url,
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

const ClientDocumentsTab: React.FC<ClientDocumentsTabProps> = ({ clientId, clientName }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [documents, setDocuments] = useState<BackendDoc[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('הכול');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<BackendDoc | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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
        if (window.confirm('האם אתה בטוח שברצונך למחוק את המסמך?')) {
            setDocuments(documents.filter(d => d.id !== docId));
            if (apiBase && clientId) {
                await fetch(`${apiBase}/api/clients/${clientId}/documents/${docId}`, { method: 'DELETE' }).catch(() => null);
            }
        }
        setOpenMenuId(null);
    };

    const handleSaveDoc = async (docData: any) => {
        if (!apiBase || !clientId) return;

        // Edit metadata only
        if (docData?.id && !docData?.file) {
            const res = await fetch(`${apiBase}/api/clients/${clientId}/documents/${docData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: docData.name,
                    type: docData.type,
                    notes: docData.notes,
                    uploadedBy: docData.uploadedBy,
                }),
            }).catch(() => null);
            if (res && (res as any).ok) {
                const updated = normalizeDoc(await (res as any).json());
                setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
            }
            setIsModalOpen(false);
            return;
        }

        // New upload
        const file: File | null = docData?.file || null;
        if (!file) {
            setIsModalOpen(false);
            return;
        }

        // 1) get upload URL
        const uploadRes = await fetch(`${apiBase}/api/clients/${clientId}/documents/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream' }),
        });
        if (!uploadRes.ok) {
            setIsModalOpen(false);
            return;
        }
        const { uploadUrl, key, publicUrl } = await uploadRes.json();

        // 2) upload to S3
        const putRes = await fetch(uploadUrl, { method: 'PUT', body: file });
        if (!putRes.ok) {
            setIsModalOpen(false);
            return;
        }

        // 3) attach metadata to client
        const fileSizeKb = Math.max(1, Math.round(file.size / 1024));
        const attachRes = await fetch(`${apiBase}/api/clients/${clientId}/documents/attach`, {
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
            setDocuments(prev => [created, ...prev]);
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
        if (!apiBase || !clientId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/clients/${clientId}/documents`)
            .then((r) => {
                if (!r.ok) throw new Error('Failed to load documents');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                setDocuments(list.map(normalizeDoc));
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Failed to load documents');
                setDocuments([]);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, clientId]);

    const filteredDocuments = useMemo(() => {
        return documents
            .filter(doc => filterType === 'הכול' || doc.type === filterType)
            .filter(doc => doc.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [documents, searchTerm, filterType]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 border border-border-default">
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="חפש מסמך לפי שם..."
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
                            <option>הכול</option>
                            <option>חוזה</option>
                            <option>הסכם</option>
                            <option>חשבונית</option>
                            <option>אחר</option>
                        </select>
                        <ChevronDownIcon className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                     <button onClick={handleCreateDoc} className="flex-grow sm:flex-grow-0 flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                        <PlusIcon className="w-5 h-5"/>
                        <span>העלה מסמך</span>
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
                                <th className="px-4 py-3">שם מסמך</th>
                                <th className="px-4 py-3">סוג</th>
                                <th className="px-4 py-3">תאריך העלאה</th>
                                <th className="px-4 py-3">הועלה ע"י</th>
                                <th className="px-4 py-3">גודל</th>
                                <th className="px-4 py-3">הערות</th>
                                <th className="px-4 py-3 text-center">פעולות</th>
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
                                        <button onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)} className="p-2 rounded-full hover:bg-bg-hover text-text-subtle"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                        {openMenuId === doc.id && (
                                            <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10">
                                                <button onClick={() => handleEditDoc(doc)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> ערוך</button>
                                                {doc.url ? (
                                                    <a href={doc.url} target="_blank" rel="noreferrer" className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><ArrowDownTrayIcon className="w-4 h-4"/> הורד</a>
                                                ) : (
                                                    <span className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-subtle opacity-60 cursor-not-allowed"><ArrowDownTrayIcon className="w-4 h-4"/> הורד</span>
                                                )}
                                                <button onClick={() => handleDeleteDoc(doc.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> מחק</button>
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
                                <button onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)} className="p-1.5 rounded-full hover:bg-bg-hover text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                {openMenuId === doc.id && (
                                    <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10">
                                        <button onClick={() => handleEditDoc(doc)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> ערוך</button>
                                        {doc.url ? (
                                            <a href={doc.url} target="_blank" rel="noreferrer" className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-default hover:bg-bg-hover"><ArrowDownTrayIcon className="w-4 h-4"/> הורד</a>
                                        ) : (
                                            <span className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-text-subtle opacity-60 cursor-not-allowed"><ArrowDownTrayIcon className="w-4 h-4"/> הורד</span>
                                        )}
                                        <button onClick={() => handleDeleteDoc(doc.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> מחק</button>
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
                    <h3 className="text-xl font-bold text-text-default">אין מסמכים שמורים</h3>
                    <p className="mt-2 text-text-muted">אין מסמכים שמורים עבור לקוח זה.</p>
                    <button onClick={handleCreateDoc} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-5 rounded-lg hover:bg-primary-600 transition shadow-md mt-4">
                        <PlusIcon className="w-5 h-5"/>
                        <span>העלה מסמך</span>
                    </button>
                </div>
            )}
            </main>

            <DocumentFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveDoc}
                document={editingDoc}
                context="client"
                contextName={clientName}
            />
        </div>
    );
};

export default ClientDocumentsTab;
