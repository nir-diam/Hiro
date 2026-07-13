import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhotoIcon, ArrowTopRightOnSquareIcon, TrashIcon } from './Icons';
import {
  fetchCompanyCreatedImages,
  removeHeroGalleryImage,
  type CompanyCreatedImage,
} from '../services/publishingApi';

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

const CompanyImagesSettingsView: React.FC = () => {
  const navigate = useNavigate();
  const [images, setImages] = useState<CompanyCreatedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setImages(await fetchCompanyCreatedImages());
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת התמונות');
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const handleDelete = async (image: CompanyCreatedImage) => {
    if (!image.canDelete) return;
    if (!window.confirm('למחוק את התמונה מהמאגר?')) return;
    setDeletingId(image.id);
    setError(null);
    try {
      await removeHeroGalleryImage(image.id);
      await loadImages();
    } catch (err: any) {
      setError(err?.message || 'מחיקת התמונה נכשלה');
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
            תמונות שנוצרו לחברה
          </h2>
          <p className="text-sm text-text-muted mt-1">
            כל מודעות Nano Banana ותמונות באנר שנשמרו עבור החברה שלך.
          </p>
        </div>
        {!loading && (
          <span className="text-sm font-bold text-text-muted bg-white px-3 py-1.5 rounded-lg border border-slate-200">
            {images.length} תמונות
          </span>
        )}
      </div>

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
                        onClick={() => navigate(`/jobs/${image.jobId}/publish`)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                      >
                        למשרה
                      </button>
                    )}
                    {image.canDelete && (
                      <button
                        type="button"
                        disabled={deletingId === image.id}
                        onClick={() => handleDelete(image)}
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
    </div>
  );
};

export default CompanyImagesSettingsView;
