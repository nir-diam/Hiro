
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, AvatarIcon, TableCellsIcon, Squares2X2Icon,
    PlusIcon, ChevronUpIcon, FolderIcon, ArchiveBoxIcon, ArrowPathIcon,
    ChatBubbleBottomCenterTextIcon, EnvelopeIcon, WhatsappIcon, XMarkIcon, SparklesIcon,
    MapPinIcon, CheckCircleIcon, FlagIcon, ChevronLeftIcon
} from './Icons';
import { mockJobCandidates } from '../data/mockJobData';
import { jobsData } from './JobsView';
import { useLanguage } from '../context/LanguageContext';

type CandidateStatus = 'חדש' | 'סינון טלפוני' | 'ראיון' | 'הצעה' | 'נדחה';

const statusStyles: { [key in CandidateStatus]: string } = {
  'חדש': 'bg-blue-100 text-blue-800 border-blue-200',
  'סינון טלפוני': 'bg-purple-100 text-purple-800 border-purple-200',
  'ראיון': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'הצעה': 'bg-green-100 text-green-800 border-green-200',
  'נדחה': 'bg-gray-100 text-gray-700 border-gray-200',
};

// --- AI MATCH POPUP COMPONENT ---
const MatchAnalysisPopover: React.FC<{ 
    candidate: any; 
    onClose: () => void; 
    onRecalculate: () => Promise<void>; 
    lastAnalyzed: string; 
}> = ({ candidate, onClose, onRecalculate, lastAnalyzed }) => {
    const { t } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);

    const handleRecalculate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsLoading(true);
        await onRecalculate();
        setIsLoading(false);
    };

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-border-default z-[200] p-5 text-right animate-fade-in" style={{ direction: 'rtl' }}>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-4 h-4 transform rotate-45 -mb-2 bg-white border-b border-r border-border-default"></div>
            
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary-50 rounded-lg">
                        <SparklesIcon className="w-5 h-5 text-primary-600" />
                    </div>
                    <h4 className="font-extrabold text-text-default text-base">{t('job_candidates.ai_analysis')}</h4>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1.5 rounded-full hover:bg-bg-hover transition-colors">
                    <XMarkIcon className="w-4 h-4 text-text-muted" />
                </button>
            </div>
            
            <div className="space-y-4">
                <p className="text-sm text-text-default leading-relaxed font-medium">
                    התאמה גבוהה (92%). המועמד מציג ניסיון ניהולי משמעותי התואם את דרישות המשרה. הרקע בתחום הלוגיסטיקה נרחב ומדויק.
                </p>
                
                <div className="pt-3 border-t border-border-subtle flex justify-between items-center">
                    <div className="flex items-center gap-1.5 text-text-subtle">
                         <FlagIcon className="w-3.5 h-3.5" />
                         <span className="text-[10px] font-bold uppercase tracking-tight">{t('job_candidates.analyzed_at')} {lastAnalyzed}</span>
                    </div>
                </div>

                <button 
                    onClick={handleRecalculate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-white bg-primary-600 py-2.5 px-4 rounded-xl hover:bg-primary-700 transition-all font-bold text-sm disabled:opacity-50 shadow-md shadow-primary-500/20"
                >
                    {isLoading ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                    )}
                    <span>{t('job_candidates.recalculate')}</span>
                </button>
            </div>
        </div>
    );
};

interface JobCandidatesViewProps {
    openSummaryDrawer: (candidateId: number) => void;
    jobId: number;
}

const JobCandidatesView: React.FC<JobCandidatesViewProps> = ({ openSummaryDrawer, jobId }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('הכל');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [activePopoverId, setActivePopoverId] = useState<number | null>(null);
    
    // Find the current job to get its location
    const job = jobsData.find(j => j.id === jobId) || jobsData[0];

    const filteredCandidates = useMemo(() => {
        return mockJobCandidates
            .filter(c => statusFilter === 'הכל' || c.status === statusFilter)
            .filter(c => 
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                c.title.toLowerCase().includes(searchTerm.toLowerCase())
            );
    }, [searchTerm, statusFilter]);

    const handleScoreClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setActivePopoverId(activePopoverId === id ? null : id);
    };

    const handleNavigate = (e: React.MouseEvent, candidateAddress: string) => {
        e.stopPropagation();
        if (!candidateAddress) return;
        const jobAddress = job.location || "תל אביב";
        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(candidateAddress)}&destination=${encodeURIComponent(jobAddress)}&travelmode=driving`;
        window.open(url, '_blank');
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            <header className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 bg-bg-subtle/20">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg text-text-default">{t('job_candidates.title')}</h3>
                    <span className="text-xs font-bold bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                        {t('job_candidates.active_count', { count: filteredCandidates.length })}
                    </span>
                    <span className="text-xs text-text-subtle flex items-center gap-1 border-r border-border-default pr-3 mr-1">
                        <MapPinIcon className="w-3 h-3" />
                        {t('job_candidates.location')} {job.city}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder={t('job_candidates.search_placeholder')} 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-bg-input border border-border-default rounded-xl py-2 pr-9 pl-3 text-sm focus:ring-2 focus:ring-primary-500/20 w-48" 
                        />
                    </div>
                    <div className="flex items-center bg-bg-subtle p-1 rounded-xl border border-border-default">
                        <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>
            </header>

            <main className="p-6">
                {viewMode === 'table' ? (
                    <div className="overflow-x-visible rounded-2xl border border-border-default">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-bg-subtle/50 text-text-muted font-bold uppercase text-[11px] tracking-wider sticky top-0 z-20 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4">{t('job_candidates.col_name')}</th>
                                    <th className="p-4">{t('job_candidates.col_status')}</th>
                                    <th className="p-4">{t('job_candidates.col_distance')}</th>
                                    <th className="p-4">{t('job_candidates.col_match')}</th>
                                    <th className="p-4">{t('job_candidates.col_source')}</th>
                                    <th className="p-4">{t('job_candidates.col_activity')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle overflow-visible">
                                {filteredCandidates.map(c => (
                                    <tr key={c.id} onClick={() => openSummaryDrawer(c.id)} className="hover:bg-primary-50/30 cursor-pointer transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border border-primary-200">
                                                    {c.avatar}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-text-default group-hover:text-primary-700 block">{c.name}</span>
                                                    <span className="text-xs text-text-muted">{c.title}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${statusStyles[c.status as CandidateStatus] || 'bg-gray-100'}`}>
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <button 
                                                onClick={(e) => handleNavigate(e, c.address || '')}
                                                className="flex items-center gap-1.5 text-xs font-semibold bg-bg-subtle hover:bg-blue-50 text-text-default hover:text-blue-600 px-2 py-1 rounded-md border border-transparent hover:border-blue-200 transition-all group/map"
                                                title={`${t('job_candidates.nav_waze')} ${c.address || t('job_candidates.unknown_location')}`}
                                            >
                                                <MapPinIcon className="w-3.5 h-3.5 text-text-subtle group-hover/map:text-blue-500" />
                                                <span>{c.address ? `${Math.floor(Math.random() * 40) + 2} ק"מ` : t('job_candidates.unknown_location')}</span>
                                            </button>
                                        </td>
                                        <td className="p-4 overflow-visible">
                                            <div className="relative flex items-center gap-2">
                                                <button 
                                                    className="flex items-center gap-2 group/score outline-none"
                                                    onClick={(e) => handleScoreClick(e, c.id)}
                                                >
                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary-500 rounded-full" style={{ width: `${c.matchScore}%` }}></div>
                                                    </div>
                                                    <span className="font-bold text-xs">{c.matchScore}%</span>
                                                </button>
                                                {activePopoverId === c.id && (
                                                    <MatchAnalysisPopover 
                                                        candidate={c} 
                                                        lastAnalyzed="28/07/2025"
                                                        onClose={() => setActivePopoverId(null)}
                                                        onRecalculate={async () => { await new Promise(r => setTimeout(r, 1000)); }}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-text-muted">{c.source}</td>
                                        <td className="p-4 text-text-subtle text-xs">{c.lastActivity}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredCandidates.map(c => (
                            <div key={c.id} onClick={() => openSummaryDrawer(c.id)} className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg border border-primary-200 group-hover:rotate-3 transition-transform">
                                            {c.avatar}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-text-default group-hover:text-primary-700 transition-colors">{c.name}</h4>
                                            <p className="text-xs text-text-muted">{c.title}</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <button 
                                            className="bg-primary-50 text-primary-700 font-black text-xs px-2 py-1 rounded-lg border border-primary-100 flex items-center gap-1 hover:bg-primary-100 transition-colors"
                                            onClick={(e) => handleScoreClick(e, c.id)}
                                        >
                                            <SparklesIcon className="w-3 h-3"/>
                                            {c.matchScore}%
                                        </button>
                                        {activePopoverId === c.id && (
                                            <MatchAnalysisPopover 
                                                candidate={c} 
                                                lastAnalyzed="28/07/2025"
                                                onClose={() => setActivePopoverId(null)}
                                                onRecalculate={async () => { await new Promise(r => setTimeout(r, 1000)); }}
                                            />
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between mb-4">
                                     <button 
                                        onClick={(e) => handleNavigate(e, c.address || '')}
                                        className="text-xs flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md text-text-muted hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    >
                                        <MapPinIcon className="w-3 h-3"/>
                                        {c.address ? `${c.address} (~${Math.floor(Math.random() * 40) + 2} ק"מ)` : t('job_candidates.unknown_location')}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle">
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusStyles[c.status as CandidateStatus]}`}>
                                        {c.status}
                                    </span>
                                    <div className="flex gap-2">
                                        <button className="p-1.5 text-text-subtle hover:text-primary-600 transition-colors" onClick={e => e.stopPropagation()}><WhatsappIcon className="w-4 h-4"/></button>
                                        <button className="p-1.5 text-text-subtle hover:text-primary-600 transition-colors" onClick={e => e.stopPropagation()}><EnvelopeIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default JobCandidatesView;
