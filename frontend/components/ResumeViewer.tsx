
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PencilIcon, ArrowDownTrayIcon, TrashIcon, ChevronDownIcon, ArrowUpTrayIcon, PinIcon, PaperClipIcon, EyeIcon, CodeBracketIcon, EnvelopeIcon, SparklesIcon } from './Icons';
import { CvFilesVersionsPanel, type CvFilesPdfExporter } from './CvFilesVersionsPanel';
import IndustryExperienceSummary from './IndustryExperienceSummary';
import IndustryExperienceModal from './IndustryExperienceModal';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import { PrintableResume } from './CandidatePublicProfileView';
import {
    educationEntryToDisplayLine,
    normalizeLanguagesForPrintRows,
    stripResumeHtml,
} from '../utils/printableResumeFormatting';
import { downloadElementAsMultiPagePdf, sanitizePdfFilename } from '../utils/resumeViewerPdfExport';
import { normalizeSearchTextLineBreaks } from '../utils/normalizeSearchText';
import { normalizeOriginalTextHistory } from '../utils/parsedTextHistory';

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
    resumeUrl?: string;
    tags?: any[];
    languages?: any[];
    title?: string;
    workExperience?: any[];
    professionalSummary?: string;
}

function parseContactForFallback(contact: string) {
    const emailMatch = contact.match(/[^\s|<>]+@[^\s|<>]+\.[^\s|<>]+/);
    const phoneMatch = contact.match(/[\d\-+\s()]{9,}/);
    const email = emailMatch ? emailMatch[0].trim() : '';
    let phone = phoneMatch ? phoneMatch[0].trim() : '';
    if (!phone && contact && !email) phone = contact.trim();
    return { email, phone };
}

function normalizeTagsForPrint(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((tag: any) =>
            typeof tag === 'string' ? stripResumeHtml(tag) : stripResumeHtml(String(tag?.value ?? tag?.name ?? '')),
        )
        .filter(Boolean);
}

function mapExperienceStrings(experience: string[]) {
    return experience.map((exp) => {
        const parts = exp.split(/<br\s*\/?>/i);
        let titleLine = stripResumeHtml(parts[0] || '');
        const descPart = stripResumeHtml(parts.slice(1).join('\n'));

        let title = titleLine;
        let company = '';
        const atParts = titleLine.split(/\s+at\s+/i);
        if (atParts.length >= 2) {
            title = atParts[0]?.trim() || titleLine;
            company = atParts.slice(1).join(' at ').trim();
        } else {
            const commaIdx = titleLine.lastIndexOf(',');
            if (commaIdx > 0) {
                title = titleLine.slice(0, commaIdx).trim();
                company = titleLine.slice(commaIdx + 1).trim();
            }
        }

        return { title, company, description: descPart, startDate: '', endDate: '' };
    });
}

/** Strip leading "YYYY — …" / "MM/YYYY — …" ranges from description into a print chip label. */
function extractLeadingDateRange(text: string): { display: string; rest: string } | null {
    const t = text.trim();
    if (!t) return null;

    const mm = /^(\d{1,2}\/\d{4})\s*[-–—]\s*(\d{1,2}\/\d{4}|היום|כיום|נוכחי|כעת|הווה)\s+/u;
    const m1 = t.match(mm);
    if (m1) {
        return { display: `${m1[1]} - ${m1[2]}`, rest: t.slice(m1[0].length).trim() };
    }

    const yr = /^(\d{4})\s*[-–—]\s*(היום|כיום|נוכחי|כעת|הווה|\d{4})\s+/u;
    const m2 = t.match(yr);
    if (m2) {
        return { display: `${m2[1]} — ${m2[2]}`, rest: t.slice(m2[0].length).trim() };
    }

    return null;
}

function collectSkillTagStrings(skills: unknown): string[] {
    if (!skills || typeof skills !== 'object') return [];
    const out: string[] = [];
    const o = skills as Record<string, unknown>;
    for (const key of ['soft', 'technical', 'hard', 'other']) {
        const arr = o[key];
        if (!Array.isArray(arr)) continue;
        arr.forEach((s) => {
            const label =
                typeof s === 'string' ? s : String((s as any)?.name || (s as any)?.label || '').trim();
            if (label) out.push(label);
        });
    }
    return out;
}

/** Normalize one experience row for PrintableResume (dates chip, company split, role aliases). */
function normalizePrintExperience(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;

    let title = String(raw.title || raw.position || raw.role || '').trim();
    let company = String(raw.company || raw.organization || raw.employer || '').trim();
    let description = String(raw.description || raw.summary || '').trim();
    let startDate = raw.startDate || raw.from || '';
    let endDate = raw.endDate || raw.to || '';
    let dateRangeLabel = typeof raw.dateRangeLabel === 'string' ? raw.dateRangeLabel.trim() : '';

    const hasIsoDates =
        String(startDate || '')
            .trim()
            .match(/^\d{4}-\d{2}/) ||
        String(endDate || '')
            .trim()
            .match(/^\d{4}-\d{2}/);

    if (!hasIsoDates && description && !dateRangeLabel) {
        const extracted = extractLeadingDateRange(description);
        if (extracted) {
            dateRangeLabel = extracted.display;
            description = extracted.rest;
        }
    }

    if (!company && title) {
        const be = title.match(/^(.+)\s+ב[-–]\s+(.+)$/u);
        if (be) {
            title = be[1].trim();
            company = be[2].trim();
        } else {
            const commaIdx = title.lastIndexOf(',');
            if (commaIdx > 0) {
                const maybeCo = title.slice(commaIdx + 1).trim();
                if (maybeCo.length > 0 && maybeCo.length <= 120) {
                    company = maybeCo;
                    title = title.slice(0, commaIdx).trim();
                }
            }
        }
    }

    title = title.replace(/\s+at\s*$/i, '').trim();

    return {
        ...raw,
        title,
        company,
        description,
        startDate,
        endDate,
        dateRangeLabel,
    };
}

function normalizePrintExperienceList(items: any[]): any[] {
    if (!Array.isArray(items)) return [];
    return items.map(normalizePrintExperience);
}

function mergeTagsForPrint(fd: any, rd: ResumeData): any[] {
    const fromForm = fd?.tags?.length ? fd.tags : rd.tags;
    if (Array.isArray(fromForm) && fromForm.length) return fromForm;

    const fromSkills = collectSkillTagStrings(fd?.skills);
    if (fromSkills.length) return fromSkills;

    const domains = fd?.industryAnalysis?.smartTags?.domains;
    if (Array.isArray(domains) && domains.length) return domains;

    return [];
}

function buildPrintableResumePayload(fullData: any, rd: ResumeData): any {
    const summaryPlain = stripResumeHtml(rd.summary || '');
    const eduList = (rd.education || []).map((e, i) => ({
        id: i,
        value: educationEntryToDisplayLine(e),
    }));

    if (fullData && typeof fullData === 'object') {
        const fd = fullData;
        let workExp =
            Array.isArray(fd.workExperience) && fd.workExperience.length
                ? fd.workExperience
                : mapExperienceStrings(rd.experience || []);
        workExp = normalizePrintExperienceList(workExp);

        const education =
            Array.isArray(fd.education) && fd.education.length
                ? fd.education
                      .map((edu: any, i: number) => ({
                          ...edu,
                          value: educationEntryToDisplayLine(edu),
                          id: edu?.id ?? i,
                      }))
                      .filter((edu: any) => edu.value)
                : eduList;

        const { email: cEmail, phone: cPhone } = parseContactForFallback(rd.contact || '');
        const tagsSrc = mergeTagsForPrint(fd, rd);
        const langSrc = fd.languages?.length ? fd.languages : rd.languages;
        const prof =
            fd.professionalSummary != null && String(fd.professionalSummary).trim()
                ? stripResumeHtml(String(fd.professionalSummary))
                : summaryPlain;

        return {
            ...fd,
            fullName: fd.fullName || fd.name || rd.name,
            phone: fd.phone || cPhone,
            email: fd.email || cEmail,
            title: fd.title ?? rd.title ?? '',
            professionalSummary: prof,
            workExperience: workExp,
            education,
            tags: normalizeTagsForPrint(tagsSrc),
            languages: normalizeLanguagesForPrintRows(langSrc),
            location: fd.location || fd.address || '',
            firstName: fd.firstName,
            lastName: fd.lastName,
        };
    }

    const { email, phone } = parseContactForFallback(rd.contact || '');
    return {
        fullName: rd.name,
        title: rd.title ?? '',
        phone,
        email,
        professionalSummary: summaryPlain,
        workExperience: normalizePrintExperienceList(mapExperienceStrings(rd.experience || [])),
        education: eduList,
        tags: normalizeTagsForPrint(mergeTagsForPrint(null, rd)),
        languages: normalizeLanguagesForPrintRows(rd.languages),
        location: '',
    };
}

interface ResumeViewerProps {
    resumeData: ResumeData;
    fullData?: any;
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
  fullData,
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
  const [resumePanelMode, setResumePanelMode] = useState<'ai' | 'files'>('ai');
    const [resumeContentMode, setResumeContentMode] = useState<'resume' | 'summary'>('resume');
    const uploadInputRef = useRef<HTMLInputElement>(null);
  const [emailViewMode, setEmailViewMode] = useState<'formatted' | 'original'>('formatted');
  const [isIndustryModalOpen, setIsIndustryModalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState(t('resume.copy_cv'));
  const [uploading, setUploading] = useState(false);
  const [parsedPdfDownloading, setParsedPdfDownloading] = useState(false);
  const parsedResumeCaptureRef = useRef<HTMLDivElement>(null);
  const filesPdfExporterRef = useRef<CvFilesPdfExporter | null>(null);
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

  const printablePayload = useMemo(() => {
      const rd = resumeData
          ? { ...resumeData, resumeUrl: effectiveResumeUrl }
          : { name: '', contact: '', summary: '', experience: [], education: [], resumeUrl: effectiveResumeUrl };
      return buildPrintableResumePayload(fullData, rd);
  }, [fullData, resumeData, effectiveResumeUrl]);

  const candidateSearchText = useMemo(() => {
      const fd = fullData && typeof fullData === 'object' ? fullData : {};
      return normalizeSearchTextLineBreaks(
          String(fd.searchText ?? fd.resumeText ?? fd.cvText ?? ''),
      );
  }, [fullData]);

  const candidateOriginalText = useMemo(() => {
      const fd = fullData && typeof fullData === 'object' ? fullData : {};
      return normalizeOriginalTextHistory(fd.originalText);
  }, [fullData]);

  const candidateSearchTextSavedAt = useMemo(() => {
      const fd = fullData && typeof fullData === 'object' ? fullData : {};
      const v = fd.searchTextSavedAt ?? fd.search_text_saved_at;
      return v ? String(v) : null;
  }, [fullData]);

  const candidateResumeUploadedAt = useMemo(() => {
      const fd = fullData && typeof fullData === 'object' ? fullData : {};
      const v = fd.resumeUploadedAt ?? fd.resume_uploaded_at;
      return v ? String(v) : null;
  }, [fullData]);

  const candidateTagDetails = useMemo(() => {
      const fd = fullData && typeof fullData === 'object' ? fullData : {};
      return Array.isArray(fd.tagDetails) ? fd.tagDetails : [];
  }, [fullData]);

  const candidateCreatedAt =
      fullData && typeof fullData === 'object'
          ? (fullData.createdAt ?? fullData.created_at ?? null)
          : null;
  const candidateUpdatedAt =
      fullData && typeof fullData === 'object'
          ? (fullData.updatedAt ?? fullData.updated_at ?? null)
          : null;

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

  const handleToggleEmailView = () => {
      setEmailViewMode(prev => prev === 'formatted' ? 'original' : 'formatted');
  };

  const handleDownloadResume = async () => {
      if (resumePanelMode === 'files') {
          const filesExporter = filesPdfExporterRef.current;
          if (filesExporter) {
              setParsedPdfDownloading(true);
              try {
                  await filesExporter();
              } catch (e) {
                  const code = e instanceof Error ? e.message : '';
                  if (code === 'no_file') {
                      alert(t('resume.no_file_download'));
                  } else if (code === 'empty_text') {
                      alert(t('resume.no_parsed_text_download'));
                  } else {
                      console.error('[ResumeViewer] parsed text PDF export failed', e);
                      alert(t('resume.download_pdf_error'));
                  }
              } finally {
                  setParsedPdfDownloading(false);
              }
              return;
          }
          if (onDownloadResume) {
              onDownloadResume();
          } else if (effectiveResumeUrl) {
              window.open(effectiveResumeUrl, '_blank');
          } else {
              alert(t('resume.no_file_download'));
          }
          return;
      }

      const host = parsedResumeCaptureRef.current;
      if (!host) {
          alert(t('resume.download_pdf_error'));
          return;
      }

      setParsedPdfDownloading(true);
      try {
          const baseName = sanitizePdfFilename(finalResumeData.name || 'resume');
          await downloadElementAsMultiPagePdf(host, `${baseName}_hir_resume.pdf`);
      } catch (e) {
          console.error('[ResumeViewer] parsed PDF export failed', e);
          alert(t('resume.download_pdf_error'));
      } finally {
          setParsedPdfDownloading(false);
      }
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

  const handleCopyResume = () => {
    let textToCopy: string;
    if (resumePanelMode === 'files' && candidateSearchText) {
      textToCopy = candidateSearchText;
    } else if (resumePanelMode === 'ai') {
      const d = printablePayload;
      const parts: string[] = [];
      parts.push(d.fullName || finalResumeData.name);
      const contactLine = [d.email, d.phone].filter(Boolean).join(' | ');
      if (contactLine) parts.push(contactLine);
      if (d.title) parts.push(String(d.title));
      if (d.professionalSummary) parts.push(String(d.professionalSummary));
      (d.workExperience || []).forEach((exp: any) => {
        const head = [exp.title, exp.company].filter(Boolean).join(', ');
        if (head) parts.push(head);
        if (exp.description) parts.push(String(exp.description));
      });
      (d.education || []).forEach((edu: any) => {
        const line = typeof edu === 'string' ? edu : edu?.value;
        if (line) parts.push(String(line));
      });
      textToCopy = parts.join('\n\n');
    } else {
      textToCopy = [
        finalResumeData.name,
        finalResumeData.contact,
        finalResumeData.summary.replace(/<[^>]*>/g, ''),
        ...finalResumeData.experience.map((item) => item.replace(/<[^>]*>/g, '')),
      ].join('\n\n');
    }

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
                            type="button"
                            onClick={() => setResumePanelMode('ai')}
                            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm border ${
                                resumePanelMode === 'ai'
                                    ? 'bg-primary-100 text-primary-700 border-primary-200'
                                    : 'bg-white text-text-muted border-border-default hover:bg-bg-hover'
                            }`}
                        >
                            <SparklesIcon className="w-4 h-4" />
                            {t('resume.view_ai_smart')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setResumePanelMode('files')}
                            className={`text-sm font-semibold px-4 py-2 rounded-lg transition shadow-sm border ${
                                resumePanelMode === 'files'
                                    ? 'bg-primary-100 text-primary-700 border-primary-200'
                                    : 'bg-white text-text-muted border-border-default hover:bg-bg-hover'
                            }`}
                        >
                            {t('resume.manage_files_versions')}
                        </button>
                        <button
                            type="button"
                            onClick={handleCopyResume}
                            className="flex items-center text-sm font-semibold px-4 py-2 rounded-lg transition bg-white text-text-muted border border-border-default hover:bg-bg-hover hover:text-primary-600 shadow-sm"
                        >
                            <span>{copyButtonText}</span>
                            <PaperClipIcon className="w-4 h-4 mr-1.5" />
                        </button>
                    </div>

        <div className="flex items-center gap-1">
                        <ActionButton
                            title={
                                resumePanelMode === 'files'
                                    ? t('resume.download_parsed_pdf')
                                    : t('resume.download')
                            }
                            disabled={parsedPdfDownloading}
                            onClick={() => void handleDownloadResume()}
                        >
                            <ArrowDownTrayIcon className={`w-5 h-5 ${parsedPdfDownloading ? 'animate-pulse' : ''}`} />
                        </ActionButton>
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

              <div
                  className={`flex-1 custom-scrollbar bg-white ${
                      resumePanelMode === 'files' && resumeContentMode === 'resume'
                          ? 'overflow-hidden flex flex-col min-h-0'
                          : 'overflow-y-auto'
                  }`}
              >
                  {activeTab === 'resume' ? (
                       <div
                           className={
                               resumeContentMode === 'resume' && resumePanelMode === 'files'
                                   ? 'flex-1 min-h-0 flex flex-col'
                                   : 'p-6'
                           }
                       >
                          {resumeContentMode === 'resume' && (
                            resumePanelMode === 'ai' ? (
                                <div className="inline-block w-full min-w-0">
                                    <PrintableResume data={printablePayload} className="" density="default" />
                                </div>
                            ) : (
                                <CvFilesVersionsPanel
                                    resumeUrl={effectiveResumeUrl}
                                    searchText={candidateSearchText}
                                    originalText={candidateOriginalText}
                                    searchTextSavedAt={candidateSearchTextSavedAt}
                                    resumeUploadedAt={candidateResumeUploadedAt}
                                    tagDetails={candidateTagDetails}
                                    createdAt={candidateCreatedAt}
                                    updatedAt={candidateUpdatedAt}
                                    candidateId={candidateIdentifier}
                                    apiBase={apiBase}
                                    getAuthHeaders={getAuthHeaders}
                                    pdfFilenameBase={finalResumeData.name || 'resume'}
                                    onRegisterPdfExporter={(exporter) => {
                                        filesPdfExporterRef.current = exporter;
                                    }}
                                    onCandidateUpdated={(payload) => {
                                        onResumeUploaded?.(payload);
                                        dispatchCandidateRefreshedEvent(payload);
                                    }}
                                />
                            )
                          )}
                          {resumeContentMode === 'summary' && (
                              <IndustryExperienceSummary 
                                  onBack={() => setResumeContentMode('resume')}
                                  onShowFullDetails={() => setIsIndustryModalOpen(true)} 
                                  experiences={
                                      printablePayload.workExperience?.length
                                          ? printablePayload.workExperience
                                          : finalResumeData.experience.map((text) => ({ title: text }))
                                  }
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
      {activeTab === 'resume' && resumePanelMode === 'ai' && (
          <div
              className="fixed pointer-events-none top-0 left-0 z-[-20] w-[210mm] max-w-[210mm] -translate-x-full"
              aria-hidden
          >
              <div ref={parsedResumeCaptureRef} className="inline-block w-full">
                  <PrintableResume data={printablePayload} density="compact" />
              </div>
          </div>
      )}
      {isIndustryModalOpen && (
        <IndustryExperienceModal
          onClose={() => setIsIndustryModalOpen(false)}
          experiences={
            printablePayload.workExperience?.length
              ? printablePayload.workExperience
              : finalResumeData.workExperience || finalResumeData.experience
          }
          candidateName={printablePayload.fullName || finalResumeData.name}
          candidateTitle={printablePayload.title || finalResumeData.title}
          candidateSummary={
            printablePayload.professionalSummary || stripHtml(finalResumeData.summary || '')
          }
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
