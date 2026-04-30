
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PencilIcon, ArrowDownTrayIcon, TrashIcon, ChevronDownIcon, ArrowUpTrayIcon, PinIcon, PaperClipIcon, EyeIcon, CodeBracketIcon, EnvelopeIcon } from './Icons';
import OriginalResume from './OriginalResume';
import IndustryExperienceSummary from './IndustryExperienceSummary';
import IndustryExperienceModal from './IndustryExperienceModal';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';

const TopTab: React.FC<{ title: string; isActive: boolean; onClick: () => void }> = ({ title, isActive, onClick }) => (
    <button 
        onClick={onClick} 
        className={`py-3 px-5 font-bold text-sm transition-all duration-200 ease-in-out transform rounded-t-lg border-t-2 border-x-2
        ${isActive 
            ? 'bg-white text-primary-600 border-border-default border-b-white -mb-0.5 z-10' 
            : 'text-text-muted hover:text-primary-600 bg-bg-subtle border-transparent hover:bg-bg-hover'
        }`}
    >
        {title}
    </button>
);

interface ResumeData {
    name: string;
    contact: string;
    summary: string;
    experience: string[];
    education?: string[];
    raw?: string;
    candidateId?: string;
}

interface ResumeViewerProps {
    resumeData: ResumeData;
    resumeFileUrl?: string;
    onOpenMessageModal?: (config: MessageModalConfig) => void;
    className?: string;
    onDownloadResume?: () => void;
    onUploadResume?: (file: File) => Promise<void>;
    onResumeUploaded?: (updated: any) => void;
    candidateId?: string | null;
}

interface EmailUploadRecord {
    id: number;
    from: string;
    to: string;
    subject: string;
    body: string;
    createdAt: string;
}

const ResumeViewer: React.FC<ResumeViewerProps> = ({
  resumeData,
  resumeFileUrl,
  onOpenMessageModal,
  className = "h-full",
  onDownloadResume,
  onUploadResume,
  onResumeUploaded,
  candidateId: candidateIdProp,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'resume' | 'email'>('resume');
  const [tagsHighlighted, setTagsHighlighted] = useState(true);
  const [resumeViewMode, setResumeViewMode] = useState<'parsed' | 'original'>('parsed');
    const [resumeContentMode, setResumeContentMode] = useState<'resume' | 'summary'>('resume');
    const uploadInputRef = useRef<HTMLInputElement>(null);
  const [emailViewMode, setEmailViewMode] = useState<'formatted' | 'original'>('formatted');
  const [isIndustryModalOpen, setIsIndustryModalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState(t('resume.copy_cv'));
  const [uploading, setUploading] = useState(false);
  const [latestEmail, setLatestEmail] = useState<EmailUploadRecord | null>(null);
  const uploadingLabel = t('resume.uploading') || 'טוען קובץ...';

  // Update copyButtonText when language changes
  useEffect(() => {
    setCopyButtonText(t('resume.copy_cv'));
  }, [t]);

  const ActionButton: React.FC<{ title: string; children: React.ReactNode; onClick?: () => void; isActive?: boolean; disabled?: boolean }> = ({ title, children, onClick, isActive = false, disabled = false }) => (
    <button
        title={title}
        onClick={onClick}
        disabled={disabled}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-200 shadow-sm ${
            isActive 
            ? 'bg-primary-600 text-white' 
            : 'bg-bg-card border border-border-default text-text-muted hover:bg-primary-50 hover:text-primary-600'
        }`}
    >
        {children}
    </button>
  );

  const apiBase = import.meta.env.VITE_API_BASE || '';
  const effectiveResumeUrl = resumeFileUrl || resumeData?.resumeUrl || '';
  const finalResumeData = resumeData
      ? { ...resumeData, resumeUrl: effectiveResumeUrl }
      : { name: '', contact: '', summary: '', experience: [], education: [], resumeUrl: effectiveResumeUrl };
  
  const candidateIdentifier = candidateIdProp || resumeData.candidateId || null;

  const getAuthHeaders = () => {
    if (typeof window === 'undefined') return {};
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const parseEmailAddress = (value?: string) => {
    if (!value) return { name: '', email: '' };
    const trimmed = value.trim();
    const match = trimmed.match(/(.*?)<([^>]+)>/);
    if (match) {
      const name = match[1].trim();
      return { name: name || match[2], email: match[2].trim() };
    }
    return { name: trimmed.replace(/[^a-zA-Zא-ת\s]/g, '').trim(), email: trimmed };
  };

  const formatEmailDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('he-IL');
  };

  const stripHtml = (input: string = '') => {
    return input.replace(/<\/?[^>]+(>|$)/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const crc32base64 = async (file: File) => {
    const table = new Uint32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    const buf = new Uint8Array(await file.arrayBuffer());
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    crc = (crc ^ -1) >>> 0;
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, crc);
    return btoa(String.fromCharCode(...bytes));
  };

  const fetchCandidateData = async (id: string) => {
    const candidateRes = await fetch(`${apiBase}/api/candidates/${id}`, {
      method: 'GET',
      headers: { ...getAuthHeaders() },
    });

    if (!candidateRes.ok) {
      throw new Error('Failed to refresh candidate data');
    }

    return candidateRes.json();
  };

  const dispatchCandidateRefreshedEvent = (candidatePayload: any) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('candidate-data-refreshed', { detail: candidatePayload }));
  };

  const fetchLatestEmail = useCallback(async () => {
    if (!candidateIdentifier) {
      setLatestEmail(null);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/email-uploads/candidate/${candidateIdentifier}`, {
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to load email');
      const payload = await res.json();
      const records = Array.isArray(payload) ? payload : [];
      setLatestEmail(records[0] || null);
    } catch (err) {
      console.error('Failed to load email upload', err);
      setLatestEmail(null);
    }
  }, [apiBase, candidateIdentifier]);

  useEffect(() => {
    if (activeTab !== 'email') return;
    fetchLatestEmail();
  }, [activeTab, fetchLatestEmail]);

  const handleToggleView = () => {
    setResumeViewMode(prev => prev === 'parsed' ? 'original' : 'parsed');
  };
  
  const handleToggleEmailView = () => {
      setEmailViewMode(prev => prev === 'formatted' ? 'original' : 'formatted');
  };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (onUploadResume) {
      try {
        await onUploadResume(file);
        e.target.value = '';
        return;
      } catch (err) {
        console.error('Upload failed', err);
        alert('העלאת הקובץ נכשלה.');
        return;
      }
    }

    const targetId = candidateIdProp || resumeData.candidateId;
    if (!targetId) {
      alert('העלאת קובץ אינה זמינה כרגע.');
      return;
    }

    const folder = 'resumes';
    try {
      setUploading(true);
      const presignRes = await fetch(`${apiBase}/api/candidates/${targetId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
      });
      if (!presignRes.ok) throw new Error('Failed to get upload URL');

      const { uploadUrl, key } = await presignRes.json();
      const urlObj = new URL(uploadUrl);
      const checksum = urlObj.searchParams.get('x-amz-checksum-crc32');
      const checksumAlgo = urlObj.searchParams.get('x-amz-sdk-checksum-algorithm');
      const headers: Record<string, string> = {};
      if (file.type) headers['Content-Type'] = file.type;
      if (checksum && checksumAlgo === 'CRC32') {
        headers['x-amz-checksum-crc32'] = await crc32base64(file);
        headers['x-amz-sdk-checksum-algorithm'] = 'CRC32';
      }

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: Object.keys(headers).length ? headers : undefined,
        body: file,
      });
      if (!putRes.ok) throw new Error('Upload to S3 failed');

      const attachRes = await fetch(`${apiBase}/api/candidates/${targetId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ key, type: 'resume' }),
      });
      if (!attachRes.ok) throw new Error('Failed to attach media');

      const updated = await attachRes.json();
      let refreshedCandidate = null;
      try {
        refreshedCandidate = await fetchCandidateData(targetId);
      } catch (refreshError) {
        console.warn('Could not refresh candidate data', refreshError);
      }
      const candidateSource = refreshedCandidate || updated;
      const candidatePayload = {
        ...candidateSource,
        id: targetId,
        backendId:
          candidateSource?.backendId || candidateSource?.id || targetId,
      };
      onResumeUploaded?.(candidatePayload);
      dispatchCandidateRefreshedEvent(candidatePayload);
      e.target.value = '';
    } catch (err: any) {
      console.error('Upload failed', err);
      alert(err?.message || 'העלאת הקובץ נכשלה.');
    } finally {
      setUploading(false);
    }
  };

  const isDocxPreview = Boolean(finalResumeData.resumeUrl?.match(/\.(doc|docx)$/i));
  const docxViewerUrl = isDocxPreview ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(finalResumeData.resumeUrl)}` : '';

  const handleCopyResume = () => {
    const textToCopy = [
        finalResumeData.name,
        finalResumeData.contact,
        finalResumeData.summary.replace(/<[^>]*>/g, ''),
        ...finalResumeData.experience.map(item => item.replace(/<[^>]*>/g, ''))
    ].join('\n\n');
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        setCopyButtonText('הועתק!'); // Could be translated too if needed temporarily
        setTimeout(() => setCopyButtonText(t('resume.copy_cv')), 2000);
    }).catch(err => {
        console.error('Failed to copy resume: ', err);
        setCopyButtonText('שגיאה');
        setTimeout(() => setCopyButtonText(t('resume.copy_cv')), 2000);
    });
  };

  const handleEmailContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('a#reply-btn')) {
        e.preventDefault();
        if (onOpenMessageModal) {
            // Attempt to extract a phone number from contact string, or pass empty
            const phoneMatch = finalResumeData.contact.match(/[\d-]{9,}/);
            const phone = phoneMatch ? phoneMatch[0] : '';
            const emailMatch = finalResumeData.contact.match(/[^\s<>]+@[^\s<>]+\.[^\s<>]+/);
            const emailAddr = emailMatch ? emailMatch[0].replace(/[<>]/g, '') : '';

            onOpenMessageModal({
                mode: 'email',
                candidateName: finalResumeData.name || 'מועמד',
                candidatePhone: phone,
                candidateEmail: emailAddr || undefined,
                candidateId: candidateIdentifier || undefined,
            });
        }
    }
  };

    const safeSummary = finalResumeData.summary || '';
    const highlightedSummary = safeSummary.replace(/עבודה עצמאית/g, `<span class="${tagsHighlighted ? 'bg-accent-100/70 px-1 rounded' : ''}">עבודה עצמאית</span>`);

    const emailFrom = latestEmail ? parseEmailAddress(latestEmail.from) : null;
    const emailTo = latestEmail ? parseEmailAddress(latestEmail.to) : null;
    const emailSubject = latestEmail?.subject || 'ללא נושא';
    const emailDateLabel = latestEmail ? formatEmailDate(latestEmail.createdAt) : '';
    const emailBody = latestEmail?.body || '';
    const hasEmailContent = Boolean(emailBody.trim());
    const plainEmailBody = stripHtml(emailBody);
    const isHtmlContent = hasEmailContent && /<[^>]+>/i.test(emailBody);


  return (
    <>
      <div className={`bg-bg-card rounded-2xl shadow-sm flex flex-col border border-border-default ${className}`}>
          <div className="flex items-center justify-between pt-4 px-4 bg-bg-subtle/30 rounded-t-2xl">
               <div className="flex items-end space-x-1 w-full border-b border-border-default">
                  <TopTab title={t('resume.tab_emails')} isActive={activeTab === 'email'} onClick={() => { setActiveTab('email'); setResumeContentMode('resume'); }} />
                  <TopTab title={t('resume.tab_cv')} isActive={activeTab === 'resume'} onClick={() => { setActiveTab('resume'); setResumeContentMode('resume'); }} />
                  <button 
                    onClick={() => setResumeContentMode('summary')} 
                    className={`py-3 px-5 font-bold text-sm transition-all duration-200 ease-in-out transform rounded-t-lg border-t-2 border-x-2
                    ${resumeContentMode === 'summary'
                        ? 'bg-white text-primary-600 border-border-default border-b-white -mb-0.5 z-10'
                        : 'text-text-muted hover:text-primary-600 bg-bg-subtle border-transparent hover:bg-bg-hover'
                    }`}
                >
                    {t('resume.tab_industries')}
                </button>
              </div>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden bg-white rounded-b-2xl">
              {/* Email View Toolbar */}
              {activeTab === 'email' && (
                  <div className="flex justify-between items-center p-3 border-b border-border-default bg-bg-subtle/10">
                         <div className="text-sm text-text-muted font-medium flex items-center gap-2">
                            <EnvelopeIcon className="w-4 h-4"/>
                            {t('resume.email_incoming')} ({latestEmail ? 1 : 0})
                         </div>
                      <button 
                        onClick={handleToggleEmailView}
                        disabled={!hasEmailContent}
                        className={`flex items-center gap-2 text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-md transition-colors shadow-sm ${!hasEmailContent ? 'opacity-40 cursor-not-allowed hover:bg-primary-50' : 'hover:bg-primary-100'}`}
                      >
                          {emailViewMode === 'formatted' ? <CodeBracketIcon className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
                          <span>{emailViewMode === 'formatted' ? t('resume.view_text') : t('resume.view_formatted')}</span>
                      </button>
                  </div>
              )}

              {/* Resume View Toolbar */}
              {activeTab === 'resume' && resumeContentMode === 'resume' && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3 border-b border-border-default bg-bg-subtle/10">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleToggleView}
                            className={`text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm border ${
                                resumeViewMode === 'original'
                                ? 'bg-primary-100 text-primary-700 border-primary-200'
                                : 'bg-white text-text-muted border-border-default hover:bg-bg-hover'
                            }`}
                        >
                            {resumeViewMode === 'parsed' ? t('resume.view_original') : t('resume.view_parsed')}
                        </button>
                        <button
                            onClick={handleCopyResume}
                            className="flex items-center text-sm font-semibold px-4 py-2 rounded-lg transition bg-white text-text-muted border border-border-default hover:bg-bg-hover hover:text-primary-600 shadow-sm"
                        >
                            <span>{copyButtonText}</span>
                            <PaperClipIcon className="w-4 h-4 mr-1.5" />
                        </button>
                        <button
                          onClick={() => setTagsHighlighted(!tagsHighlighted)}
                          className={`flex items-center text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm border ${
                            tagsHighlighted 
                              ? 'bg-primary-100 text-primary-700 border-primary-200' 
                              : 'bg-white text-text-muted border-border-default hover:bg-bg-hover'
                          }`}
                        >
                          <span>{t('resume.highlight_tags')}</span>
                        </button>
                    </div>

        <div className="flex items-center gap-1">
                        <ActionButton title={t('resume.download')} onClick={() => {
                            if (onDownloadResume) {
                                onDownloadResume();
                            } else if (effectiveResumeUrl) {
                                window.open(effectiveResumeUrl, '_blank');
                            } else {
                                alert('אין קובץ להורדה.');
                            }
                        }}><ArrowDownTrayIcon className="w-5 h-5"/></ActionButton>
                        <ActionButton title={t('resume.upload')} onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
                            <ArrowUpTrayIcon className="w-5 h-5"/>
                        </ActionButton>
                        {uploading && (
                          <div className="flex items-center gap-1 text-xs font-semibold text-primary-700">
                            <span className="w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" aria-hidden="true" />
                            <span>{uploadingLabel}</span>
                          </div>
                        )}
                        <ActionButton 
                            title={isPinned ? t('resume.unpin') : t('resume.pin')}
                            onClick={() => setIsPinned(!isPinned)}
                            isActive={isPinned}
                        >
                            <PinIcon className="w-5 h-5"/>
                        </ActionButton>
                        <ActionButton title={t('resume.edit')}><PencilIcon className="w-5 h-5"/></ActionButton>
                        <ActionButton title={t('resume.delete')}><TrashIcon className="w-5 h-5"/></ActionButton>
                    </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                  {activeTab === 'resume' ? (
                       <div className="p-6">
                          {resumeContentMode === 'resume' && (
                            resumeViewMode === 'parsed' ? (
                                <div className="space-y-6 text-text-default text-base leading-relaxed max-w-4xl mx-auto">
                                    <div className="border-b border-border-default pb-4 mb-4">
                                        <h2 className="font-bold text-2xl text-text-default mb-1">{finalResumeData.name}</h2>
                                        <p className="text-sm text-text-muted flex items-center gap-2">
                                            <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded">{finalResumeData.contact}</span>
                                        </p>
                                    </div>
                                    
                                    <div>
                                        <h3 className="font-bold text-lg text-primary-700 mb-2 border-r-4 border-primary-500 pr-3">{t('section.summary')}</h3>
                                        <div className="bg-bg-subtle/30 p-4 rounded-lg" dangerouslySetInnerHTML={{ __html: highlightedSummary }} />
                                    </div>

                                    <div>
                                      <h3 className="font-bold text-lg text-primary-700 mb-4 border-r-4 border-primary-500 pr-3">{t('section.work_experience')}</h3>
                                      <ul className="space-y-6">
                                          {finalResumeData.experience.map((item, index) => (
                                              <li key={index} className="relative pr-4 border-r border-border-default/50">
                                                  <div className="absolute -right-1.5 top-2 w-3 h-3 rounded-full bg-primary-300 border-2 border-white"></div>
                                                  <div dangerouslySetInnerHTML={{ __html: item }} />
                                              </li>
                                          ))}
                                      </ul>
                                    </div>

                                    {finalResumeData.education && finalResumeData.education.length > 0 && (
                                        <div>
                                            <h3 className="font-bold text-lg text-primary-700 mb-4 border-r-4 border-primary-500 pr-3">{t('section.education')}</h3>
                                            <ul className="space-y-3">
                                                {finalResumeData.education.map((edu, idx) => (
                                                    <li key={idx} className="relative pr-4 border-r border-border-default/50">
                                                        <div className="absolute -right-1.5 top-2 w-3 h-3 rounded-full bg-secondary-300 border-2 border-white"></div>
                                                        <div dangerouslySetInnerHTML={{ __html: edu }} />
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                              </div>
                            ) : (
                                finalResumeData.resumeUrl ? (
                                    <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
                                        <div className="flex-1 min-h-[60vh] border border-border-default rounded-2xl overflow-auto bg-black/5">
                                            <iframe
                                                style={{ width: '100%', minWidth: '200px', height: '1000px' }}
                                                src={isDocxPreview ? docxViewerUrl : finalResumeData.resumeUrl}
                                                title="Resume preview"
                                                className="w-full h-full"
                                            />
                                        </div>
                                        <div className="text-center text-xs text-text-muted">
                                            לא תומך בתצוגה? <a className="text-primary-600 font-bold underline" href={finalResumeData.resumeUrl} target="_blank" rel="noreferrer">הורד את הקובץ המקורי</a>
                                        </div>
                                    </div>
                                ) : (
                                    <OriginalResume highlighted={tagsHighlighted} resumeData={finalResumeData} />
                                )
                            )
                          )}
                          {resumeContentMode === 'summary' && (
                              <IndustryExperienceSummary 
                                  onBack={() => setResumeContentMode('resume')}
                                  onShowFullDetails={() => setIsIndustryModalOpen(true)} 
                                  experiences={finalResumeData.experience.map((text) => ({ title: text }))}
                              />
                          )}
                      </div>
                  ) : (
                      <div className="h-full flex flex-col">
                          <div className="px-6 py-4 bg-bg-subtle/10 border-b border-border-default">
                              {latestEmail ? (
                                <>
                                  <div className="flex justify-between items-start mb-4">
                                      <h3 className="text-xl font-bold text-text-default">{emailSubject || t('resume.no_subject')}</h3>
                                      <div className="flex items-center gap-2 text-text-muted text-xs bg-bg-card border border-border-default rounded px-2 py-1">
                                        <span>{emailDateLabel}</span>
                                      </div>
                                  </div>
                                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm items-center">
                                      <span className="font-bold text-text-muted justify-self-end">מאת:</span>
                                      <div className="flex items-center gap-2">
                                          <span className="text-text-default font-semibold">{emailFrom?.name || emailFrom?.email || '-'}</span>
                                          {emailFrom?.email && (
                                              <span className="text-text-subtle text-xs">&lt;{emailFrom.email}&gt;</span>
                                          )}
                                      </div>
                                      <span className="font-bold text-text-muted justify-self-end">אל:</span>
                                      <div className="flex items-center gap-2">
                                          <span className="text-text-default font-semibold">{emailTo?.name || emailTo?.email || '-'}</span>
                                          {emailTo?.email && (
                                              <span className="text-text-subtle text-xs">&lt;{emailTo.email}&gt;</span>
                                          )}
                                      </div>
                                  </div>
                                </>
                              ) : (
                                <div className="text-sm text-text-muted italic text-center">אין הודעות דוא&quot;ל זמינות</div>
                              )}
                          </div>

                          <div className="p-8 bg-white flex-1 overflow-y-auto">
                              {latestEmail && hasEmailContent ? (
                                  emailViewMode === 'formatted' ? (
                                      isHtmlContent ? (
                                          <div
                                            className="prose prose-sm max-w-3xl mx-auto"
                                            dangerouslySetInnerHTML={{ __html: emailBody }}
                                            onClick={handleEmailContentClick}
                                          />
                                      ) : (
                                          <div className="prose prose-sm max-w-3xl mx-auto">
                                            {emailBody.split('\n').map((line, idx) => (
                                                <p key={idx}>{line}</p>
                                            ))}
                                          </div>
                                      )
                                  ) : (
                                      <div className="max-w-3xl mx-auto">
                                        <pre className="whitespace-pre-wrap font-mono text-xs text-text-default bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner leading-relaxed">
                                            {plainEmailBody}
                                        </pre>
                                      </div>
                                  )
                              ) : (
                                  <div className="h-full w-full flex flex-col justify-center items-center text-sm text-text-muted">
                                      <p>אין תוכן מייל להצגה</p>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
              </div>
          </div>
          <style>{`
              .custom-scrollbar::-webkit-scrollbar { width: 6px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: rgb(var(--color-bg-subtle)); border-radius: 10px; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgb(var(--color-border-default)); border-radius: 10px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(var(--color-text-subtle)); }
              .custom-scrollbar-modal::-webkit-scrollbar { width: 8px; }
              .custom-scrollbar-modal::-webkit-scrollbar-track { background: rgb(var(--color-bg-subtle)); border-radius: 10px; }
              .custom-scrollbar-modal::-webkit-scrollbar-thumb { background: rgb(var(--color-border-default)); border-radius: 10px; }
              .custom-scrollbar-modal::-webkit-scrollbar-thumb:hover { background: rgb(var(--color-text-subtle)); }
          `}</style>
      </div>
      {isIndustryModalOpen && (
        <IndustryExperienceModal
          onClose={() => setIsIndustryModalOpen(false)}
          experiences={finalResumeData.workExperience || finalResumeData.experience}
          candidateName={finalResumeData.name}
          candidateTitle={finalResumeData.title}
          candidateSummary={finalResumeData.summary}
        />
      )}
        <input
            ref={uploadInputRef}
            type="file"
        accept=".pdf,.doc,.docx,.dox,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileSelected}
        />
    </>
  );
};

export default ResumeViewer;
