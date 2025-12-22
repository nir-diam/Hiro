
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, TableCellsIcon, Squares2X2Icon, ChevronDownIcon, 
    ArrowLeftIcon, Cog6ToothIcon, UserIcon, ChatBubbleBottomCenterTextIcon, 
    CheckCircleIcon, NoSymbolIcon, ClockIcon, PaperAirplaneIcon, ChevronLeftIcon, AvatarIcon
} from './Icons';
import { mockJobCandidates } from '../data/mockJobData';
import { Job, jobsData } from './JobsView';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import ManagerFeedbackModal from './ManagerFeedbackModal';
import { Candidate } from './CandidatesListView';

const statusStyles: { [key: string]: string } = {
  'חדש': 'bg-blue-100 text-blue-800',
  'סינון טלפוני': 'bg-purple-100 text-purple-800',
  'ראיון': 'bg-yellow-100 text-yellow-800',
  'הצעה': 'bg-green-100 text-green-800',
  'נדחה': 'bg-gray-200 text-gray-700',
  'ראיון HR': 'bg-indigo-100 text-indigo-800',
  'ראיון מקצועי': 'bg-orange-100 text-orange-800',
  'מבחן בית': 'bg-teal-100 text-teal-800',
  'בדיקת ממליצים': 'bg-cyan-100 text-cyan-800',
  'הצעת שכר': 'bg-emerald-100 text-emerald-800',
  'התקבל': 'bg-green-500 text-white',
};

// Columns relevant for a Hiring Manager
const managerColumns = [
    { id: 'name', header: 'שם המועמד' },
    { id: 'title', header: 'תפקיד אחרון' },
    { id: 'matchScore', header: 'התאמה' },
    { id: 'status', header: 'סטטוס' },
    { id: 'lastActivity', header: 'עודכן לאחרונה' },
    { id: 'feedback', header: 'חוות דעת שלי' },
];

const ManagerJobView: React.FC = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [searchTerm, setSearchTerm] = useState('');
    const [visibleColumns, setVisibleColumns] = useState(managerColumns.map(c => c.id));
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    
    // Initialize local state with mock data
    const [candidates, setCandidates] = useState(mockJobCandidates);
    
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [feedbackCandidate, setFeedbackCandidate] = useState<Candidate | null>(null);

    // Simulate "allowed statuses" configuration from recruiter. 
    // Ideally this would come from a prop or context based on job configuration.
    const allowedStatuses = [
        'חדש', 'סינון טלפוני', 'ראיון', 'הצעה', 'ראיון HR', 
        'ראיון מקצועי', 'מבחן בית', 'בדיקת ממליצים', 'הצעת שכר', 'התקבל', 'נדחה'
    ]; 

    const job = jobsData.find(j => j.id.toString() === jobId) || jobsData[0];
    
    // Filter candidates based on allowed statuses and search
    const filteredCandidates = useMemo(() => {
        return candidates.filter(c => {
            // Check if status is allowed or if it's one of the standard statuses always visible
            const isAllowedStatus = allowedStatuses.includes(c.status);
            const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  c.title.toLowerCase().includes(searchTerm.toLowerCase());
            return isAllowedStatus && matchesSearch;
        });
    }, [candidates, searchTerm]);

    const sortedCandidates = useMemo(() => {
        let sortable = [...filteredCandidates];
        if (sortConfig) {
            sortable.sort((a, b) => {
                // @ts-ignore
                const aVal = a[sortConfig.key];
                // @ts-ignore
                const bVal = b[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortable;
    }, [filteredCandidates, sortConfig]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]);
    };

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleOpenFeedback = (e: React.MouseEvent, candidate: any) => {
        e.stopPropagation();
        setFeedbackCandidate(candidate);
    };

    const handleSaveFeedback = (feedback: { rating: any; notes: string; recommendation: string; newStatus?: string }) => {
        console.log('Saving feedback:', feedback, 'for candidate:', feedbackCandidate?.name);
        
        if (feedbackCandidate && feedback.newStatus) {
            setCandidates(prevCandidates => 
                prevCandidates.map(c => 
                    c.id === feedbackCandidate.id 
                        ? { ...c, status: feedback.newStatus! } 
                        : c
                )
            );
        }
        
        // Here you would typically update the backend as well
    };

    const handleViewCandidate = (candidate: any) => {
        const candidateWithDetails: Candidate = {
            ...candidate,
            address: 'לא צוין', 
            tags: [],
            internalTags: [],
        };
        setSelectedCandidate(candidateWithDetails);
    };


    const renderCell = (candidate: any, colId: string) => {
        switch(colId) {
            case 'name': 
                return (
                    <div className="flex items-center gap-3">
                        <AvatarIcon initials={candidate.avatar} size={32} fontSize={14} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                        <span className="font-bold text-text-default">{candidate.name}</span>
                    </div>
                );
            case 'status':
                return <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusStyles[candidate.status] || 'bg-gray-100'}`}>{candidate.status}</span>;
            case 'matchScore':
                return <span className="font-bold text-primary-600">{candidate.matchScore}%</span>;
            case 'feedback':
                return (
                    <button 
                        onClick={(e) => handleOpenFeedback(e, candidate)}
                        className="text-sm text-text-muted hover:text-primary-600 underline"
                    >
                        הוסף משוב
                    </button>
                );
            default:
                return candidate[colId];
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={() => navigate('/portal/manager')} className="p-2 rounded-full hover:bg-bg-card border border-transparent hover:border-border-default transition-colors">
                        <ArrowLeftIcon className="w-5 h-5 transform rotate-180 text-text-muted" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">{job.title}</h1>
                        <p className="text-sm text-text-muted">{filteredCandidates.length} מועמדים פעילים</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-grow md:flex-grow-0">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="חיפוש מועמד..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full md:w-64 bg-bg-card border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300" 
                        />
                    </div>
                    <div className="flex items-center bg-bg-card border border-border-default p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} className={`p-2 rounded-md ${viewMode === 'table' ? 'bg-primary-50 text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-primary-50 text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            {viewMode === 'table' ? (
                <div className="bg-bg-card rounded-xl border border-border-default shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
                                <tr>
                                    {managerColumns.filter(col => visibleColumns.includes(col.id)).map(col => (
                                        <th key={col.id} className="p-4 cursor-pointer hover:text-primary-600 transition-colors" onClick={() => requestSort(col.id)}>
                                            <div className="flex items-center gap-1">
                                                {col.header}
                                                {sortConfig?.key === col.id && <span className="text-xs">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-4 w-16">
                                         <div className="relative" ref={settingsRef}>
                                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-1 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                            {isSettingsOpen && (
                                                <div className="absolute top-full left-0 mt-2 w-48 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-3">
                                                    <p className="font-bold text-xs mb-2">עמודות</p>
                                                    {managerColumns.map(col => (
                                                        <label key={col.id} className="flex items-center gap-2 text-sm p-1 hover:bg-bg-hover rounded cursor-pointer">
                                                            <input type="checkbox" checked={visibleColumns.includes(col.id)} onChange={() => handleColumnToggle(col.id)} className="rounded text-primary-600 focus:ring-primary-500" />
                                                            {col.header}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {sortedCandidates.map(candidate => (
                                    <tr key={candidate.id} onClick={() => handleViewCandidate(candidate)} className="group hover:bg-primary-50/30 transition-colors cursor-pointer">
                                        {managerColumns.filter(col => visibleColumns.includes(col.id)).map(col => (
                                            <td key={col.id} className="p-4">{renderCell(candidate, col.id)}</td>
                                        ))}
                                        <td className="p-4 text-center">
                                            <button className="text-text-muted hover:text-primary-600 p-2 rounded-full hover:bg-primary-50 transition-colors">
                                                <ChevronLeftIcon className="w-5 h-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedCandidates.map(candidate => (
                        <div key={candidate.id} onClick={() => handleViewCandidate(candidate)} className="bg-bg-card rounded-xl border border-border-default shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <AvatarIcon initials={candidate.avatar} size={48} fontSize={20} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                                    <div>
                                        <h3 className="font-bold text-text-default">{candidate.name}</h3>
                                        <p className="text-sm text-text-muted">{candidate.title}</p>
                                    </div>
                                </div>
                                <div className="bg-primary-50 text-primary-700 font-bold text-sm px-2 py-1 rounded-lg">
                                    {candidate.matchScore}%
                                </div>
                            </div>
                            
                            <div className="space-y-2 text-sm mb-4">
                                <div className="flex justify-between">
                                    <span className="text-text-muted">סטטוס</span>
                                    <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${statusStyles[candidate.status] || 'bg-gray-100'}`}>{candidate.status}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-text-muted">פעילות אחרונה</span>
                                    <span>{candidate.lastActivity}</span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border-subtle flex gap-2">
                                <button 
                                    onClick={(e) => handleOpenFeedback(e, candidate)}
                                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition"
                                >
                                    <ChatBubbleBottomCenterTextIcon className="w-4 h-4" />
                                    משוב
                                </button>
                                <button className="flex-1 flex items-center justify-center gap-2 bg-bg-subtle text-text-default py-2 rounded-lg text-sm font-semibold hover:bg-bg-hover transition">
                                    פרטים
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

             <CandidateSummaryDrawer
                candidate={selectedCandidate}
                isOpen={!!selectedCandidate}
                onClose={() => setSelectedCandidate(null)}
                // @ts-ignore - Pass null for onViewFullProfile as managers shouldn't access the full recruiter view
                onViewFullProfile={null} 
                viewMode="manager"
                isFavorite={false} // Manager view doesn't support favorites yet
                onToggleFavorite={() => {}} // No-op
            />
            
            <ManagerFeedbackModal 
                isOpen={!!feedbackCandidate}
                onClose={() => setFeedbackCandidate(null)}
                onSave={handleSaveFeedback}
                candidateName={feedbackCandidate?.name || ''}
            />
        </div>
    );
};

export default ManagerJobView;
