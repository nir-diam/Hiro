
import React, { useState, useEffect } from 'react';
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
}

interface ResumeViewerProps {
    resumeData: ResumeData;
    onOpenMessageModal?: (config: MessageModalConfig) => void;
    className?: string;
}

// Mock Email Data based on the screenshot provided
const mockEmailData = {
    fromName: 'jobmaster.co.il',
    fromEmail: 'cv@jobmaster.co.il',
    to: 'Sarit',
    toEmail: 'humand@app.civi.co.il',
    date: '19/11/2025 08:39',
    subject: 'הודעת דוא"ל: אורלי חריף - 815297',
    content: `
        <div style="font-family: Arial, sans-serif; direction: rtl; text-align: right; color: #333; line-height: 1.5;">
            <p style="font-weight: bold; margin-bottom: 10px;">Sarit</p>
            <p>שלום רב,</p>
            <p>קיבלת קובץ קורות חיים חדש למשרה שפרסמת דרך JobMaster.</p>
            <p style="margin-top: 15px;">
                מספר משרה: <strong>9584339</strong> - מחפש.ת להתחיל קריירה בתחום האדמיניסטרציה אבל אין לך ניסיון? זו ההזדמנות שלך! אנחנו, בחברת ...
            </p>
            <p style="margin-top: 15px;"><strong>תפקיד:</strong></p>
            <p><strong>מכתב מקדים (אופציונלי):</strong></p>
            <p><strong>תשובות לשאלות סינון (אופציונלי):</strong></p>
            
            <div style="margin-top: 20px;">
                <a href="#" id="reply-btn" style="display: inline-block; background-color: #efefef; color: #333; text-decoration: none; padding: 5px 10px; border: 1px solid #ccc; border-radius: 3px; font-size: 12px; font-weight: bold;">השב למועמד/ת</a>
            </div>

            <p style="margin-top: 20px; font-size: 13px;">
                מחפשים עוד מועמדים רלוונטיים? מאגר הפרופילים והקורות חיים של JobMaster כולל מאות אלפים מכל התחומים זמינים לגיוס מיידי!
                <br/>
                <a href="#" style="color: #0000EE; text-decoration: underline;">לאיתור מועמדים נוספים</a>
            </p>

            <p style="margin-top: 20px;">
                בברכה,<br/>
                צוות JobMaster<br/>
                טלפון: 03-6343411<br/>
                <a href="http://www.jobmaster.co.il" style="color: #0000EE;">www.jobmaster.co.il</a>
            </p>
            
            <hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;" />
            
            <div style="font-size: 12px; color: #666;">
                דואר זה מיועד אל Sarit<br/>
                נשלח אל: humand@app.civi.co.il<br/>
                תאריך: 19-11-2025<br/>
                JobMaster 2025
            </div>
            <p style="font-size: 11px; color: #999; margin-top: 10px;">
                ג'ובמאסטר בע"מ. ג'ובמאסטר הוא שם מסחרי רשום של ג'ובמאסטר בע"מ. ג'ובמאסטר והלוגו של ג'ובמאסטר הם סימנים מסחריים רשומים של החברה.
            </p>
        </div>
    `,
    rawContent: `From: jobmaster.co.il <cv@jobmaster.co.il>
Date: 19/11/2025 08:39
To: Sarit <humand@app.civi.co.il>
Subject: הודעת דוא"ל: אורלי חריף - 815297

Sarit
שלום רב,
קיבלת קובץ קורות חיים חדש למשרה שפרסמת דרך JobMaster.
מספר משרה: 9584339 - מחפש.ת להתחיל קריירה בתחום האדמיניסטרציה אבל אין לך ניסיון? זו ההזדמנות שלך! אנחנו, בחברת ...

תפקיד:
מכתב מקדים (אופציונלי):
תשובות לשאלות סינון (אופציונלי):

[השב למועמד/ת]

מחפשים עוד מועמדים רלוונטיים? מאגר הפרופילים והקורות חיים של JobMaster כולל מאות אלפים מכל התחומים זמינים לגיוס מיידי!
לאיתור מועמדים נוספים

בברכה,
צוות JobMaster
טלפון: 03-6343411
www.jobmaster.co.il

----------------------------------------
דואר זה מיועד אל Sarit
נשלח אל: humand@app.civi.co.il
תאריך: 19-11-2025
JobMaster 2025
ג'ובמאסטר בע"מ. ג'ובמאסטר הוא שם מסחרי רשום של ג'ובמאסטר בע"מ.`
};


const ResumeViewer: React.FC<ResumeViewerProps> = ({ resumeData, onOpenMessageModal, className = "h-full" }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'resume' | 'email'>('resume');
  const [tagsHighlighted, setTagsHighlighted] = useState(true);
  const [resumeViewMode, setResumeViewMode] = useState<'parsed' | 'original'>('parsed');
  const [resumeContentMode, setResumeContentMode] = useState<'resume' | 'summary'>('resume');
  const [emailViewMode, setEmailViewMode] = useState<'formatted' | 'original'>('formatted');
  const [isIndustryModalOpen, setIsIndustryModalOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState(t('resume.copy_cv'));

  // Update copyButtonText when language changes
  useEffect(() => {
    setCopyButtonText(t('resume.copy_cv'));
  }, [t]);

  const ActionButton: React.FC<{ title: string; children: React.ReactNode; onClick?: () => void; isActive?: boolean }> = ({ title, children, onClick, isActive = false }) => (
    <button
        title={title}
        onClick={onClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-200 shadow-sm ${
            isActive 
            ? 'bg-primary-600 text-white' 
            : 'bg-bg-card border border-border-default text-text-muted hover:bg-primary-50 hover:text-primary-600'
        }`}
    >
        {children}
    </button>
  );

  const finalResumeData = resumeData || { name: '', contact: '', summary: '', experience: [] };
  
  const handleToggleView = () => {
    setResumeViewMode(prev => prev === 'parsed' ? 'original' : 'parsed');
  };
  
  const handleToggleEmailView = () => {
      setEmailViewMode(prev => prev === 'formatted' ? 'original' : 'formatted');
  };

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
            
            onOpenMessageModal({
                mode: 'email',
                candidateName: finalResumeData.name || 'מועמד',
                candidatePhone: phone, 
            });
        }
    }
  };

  const highlightedSummary = finalResumeData.summary.replace(/עבודה עצמאית/g, `<span class="${tagsHighlighted ? 'bg-accent-100/70 px-1 rounded' : ''}">עבודה עצמאית</span>`);


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
                         {t('resume.email_incoming')} (1)
                      </div>
                      <button 
                        onClick={handleToggleEmailView}
                        className="flex items-center gap-2 text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-md hover:bg-primary-100 transition-colors shadow-sm"
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
                        <ActionButton title={t('resume.download')}><ArrowDownTrayIcon className="w-5 h-5"/></ActionButton>
                        <ActionButton title={t('resume.upload')}><ArrowUpTrayIcon className="w-5 h-5"/></ActionButton>
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
                              </div>
                            ) : (
                                <OriginalResume highlighted={tagsHighlighted} />
                            )
                          )}
                          {resumeContentMode === 'summary' && (
                              <IndustryExperienceSummary 
                                  onBack={() => setResumeContentMode('resume')}
                                  onShowFullDetails={() => setIsIndustryModalOpen(true)} 
                              />
                          )}
                      </div>
                  ) : (
                      <div className="h-full flex flex-col">
                          {/* Email Header Info */}
                          <div className="px-6 py-4 bg-bg-subtle/10 border-b border-border-default">
                              <div className="flex justify-between items-start mb-4">
                                  <h3 className="text-xl font-bold text-text-default">{mockEmailData.subject}</h3>
                                  <div className="flex items-center gap-2 text-text-muted text-xs bg-bg-card border border-border-default rounded px-2 py-1">
                                    <span>{mockEmailData.date}</span>
                                  </div>
                              </div>
                              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm items-center">
                                  <span className="font-bold text-text-muted justify-self-end">מאת:</span>
                                  <div className="flex items-center gap-2">
                                      <span className="text-text-default font-semibold">{mockEmailData.fromName}</span>
                                      <span className="text-text-subtle text-xs">&lt;{mockEmailData.fromEmail}&gt;</span>
                                  </div>
                                  
                                  <span className="font-bold text-text-muted justify-self-end">אל:</span>
                                  <div className="flex items-center gap-2">
                                      <span className="text-text-default font-semibold">{mockEmailData.to}</span>
                                      <span className="text-text-subtle text-xs">&lt;{mockEmailData.toEmail}&gt;</span>
                                  </div>
                              </div>
                          </div>

                          {/* Email Content */}
                          <div className="p-8 bg-white flex-1 overflow-y-auto">
                              {emailViewMode === 'formatted' ? (
                                  <div 
                                    className="prose prose-sm max-w-3xl mx-auto" 
                                    dangerouslySetInnerHTML={{ __html: mockEmailData.content }} 
                                    onClick={handleEmailContentClick}
                                  />
                              ) : (
                                  <div className="max-w-3xl mx-auto">
                                    <pre className="whitespace-pre-wrap font-mono text-xs text-text-default bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner leading-relaxed">
                                        {mockEmailData.rawContent}
                                    </pre>
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
      {isIndustryModalOpen && <IndustryExperienceModal onClose={() => setIsIndustryModalOpen(false)} />}
    </>
  );
};

export default ResumeViewer;
