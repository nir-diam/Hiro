import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowUpTrayIcon } from './Icons';

export type DocumentType = 'קורות חיים' | 'תעודה' | 'מסמך זיהוי' | 'חוזה' | 'הסכם' | 'חשבונית' | 'אחר';

export interface Document {
  id: number;
  name: string;
  type: DocumentType;
  uploadDate: string;
  uploadedBy: string;
  notes: string;
  fileSize: number; // in KB
}

interface DocumentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (doc: Omit<Document, 'id' | 'uploadDate' | 'fileSize'> & { id?: number }) => void;
  document: Document | null;
  context?: 'candidate' | 'client';
  contextName?: string;
}

const DocumentFormModal: React.FC<DocumentFormModalProps> = ({ isOpen, onClose, document, context, contextName }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'קורות חיים' as DocumentType,
    notes: '',
    uploadedBy: 'דנה כהן',
  });
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (document) {
      setFormData({
        name: document.name.split('.').slice(0, -1).join('.'), // Name without extension
        type: document.type,
        notes: document.notes,
        uploadedBy: document.uploadedBy,
      });
      setFileName(document.name);
    } else {
      // Reset form for new document
      setFormData({
        name: '',
        type: context === 'client' ? 'חוזה' : 'קורות חיים',
        notes: '',
        uploadedBy: 'דנה כהן',
      });
      setFileName(null);
    }
  }, [document, isOpen, context]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileName(file.name);
      // Pre-fill name field if it's empty
      if (!formData.name) {
        setFormData(prev => ({ ...prev, name: file.name.split('.').slice(0, -1).join('.') }));
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!document && !fileName) {
        alert('Please select a file to upload.');
        return;
    }
    const extension = fileName ? fileName.split('.').pop() : '';
    // onSave({
    //   id: document?.id,
    //   ...formData,
    //   name: `${formData.name}.${extension}`,
    // });
    onClose(); // Mocking save
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <header className="flex items-center justify-between p-4 border-b border-border-default">
            <h2 className="text-xl font-bold text-text-default">{document ? 'עריכת פרטי מסמך' : 'העלאת מסמך חדש'}</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </header>
          
          <main className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
            {!document && (
                 <div className="flex items-center justify-center w-full">
                    <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-40 border-2 border-border-default border-dashed rounded-lg cursor-pointer bg-bg-subtle hover:bg-bg-hover">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <ArrowUpTrayIcon className="w-8 h-8 mb-4 text-text-subtle" />
                            <p className="mb-2 text-sm text-text-muted"><span className="font-semibold">לחץ להעלאה</span> או גרור קובץ</p>
                            <p className="text-xs text-text-subtle">PDF, DOCX, PNG, JPG (MAX. 10MB)</p>
                        </div>
                        <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} />
                    </label>
                </div> 
            )}
            
            {fileName && (
                <div className="bg-primary-50 border border-primary-200 text-primary-800 text-sm font-semibold p-3 rounded-lg text-center">
                    {fileName}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">שם המסמך (ללא סיומת)</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">סוג מסמך</label>
                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                    <option>קורות חיים</option>
                    <option>תעודה</option>
                    <option>מסמך זיהוי</option>
                    <option>חוזה</option>
                    <option>הסכם</option>
                    <option>חשבונית</option>
                    <option>אחר</option>
                </select>
              </div>
            </div>
            
            <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">הערה (פנימי)</label>
                <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" placeholder="הוסף הערה פנימית לגבי המסמך..."></textarea>
            </div>
            
            <div>
                 <label className="block text-sm font-semibold text-text-muted mb-1">שיוך</label>
                 <select className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-text-muted">
                    {context === 'candidate' && <option>שייך למועמד ({contextName})</option>}
                    {context === 'client' && <option>שייך ללקוח ({contextName})</option>}
                    <option disabled>שייך למשרה (לא נבחר)</option>
                 </select>
            </div>
          </main>

          <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
            <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
            <button type="submit" className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2">{document ? 'שמור שינויים' : 'העלה מסמך'}</button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default DocumentFormModal;