
import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface CandidateNavProps {
    activeView: string;
    setActiveView: (view: string) => void;
    candidateId?: string | null;
    onMatchJobsClick?: () => void;
    onScreenCandidateClick?: () => void;
    jobMatchesCount?: number;
    isMatchingJobs?: boolean;
    isScreening?: boolean;
}

const NavButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; }> = ({ title, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex-shrink-0 py-2 px-4 md:py-2.5 md:px-6 rounded-full font-bold text-sm md:text-base transition-all duration-300 whitespace-nowrap ${
            isActive 
            ? 'bg-primary-600 text-white shadow-md' 
            : 'text-text-muted hover:text-primary-600 hover:bg-primary-50'
        }`}
    >
        {title}
    </button>
);

const CandidateNav: React.FC<CandidateNavProps> = ({
    activeView,
    setActiveView,
    candidateId,
    onMatchJobsClick,
    onScreenCandidateClick,
    jobMatchesCount = 0,
    isMatchingJobs = false,
    isScreening = false,
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const previewCandidateId = String(candidateId || '').trim();

  const openCandidatePublicView = () => {
    if (!previewCandidateId) return;
    const params = new URLSearchParams({
      previewCandidateId,
      staff: '1',
    });
    window.open(`/candidate-portal/profile?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };
  
  return (
    <>
        <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        <nav className="flex items-center gap-1 p-1.5 bg-bg-card border border-border-default rounded-full shadow-xl overflow-x-auto max-w-[calc(100vw-2rem)] md:max-w-fit mx-auto no-scrollbar">
            <NavButton
                title={t('candidate_nav.details')}
                isActive={activeView === 'details' && !isMatchingJobs && !isScreening}
                onClick={() => setActiveView('details')}
            />
            {onMatchJobsClick ? (
                <NavButton
                    title={`${t('profile.matches')} (${jobMatchesCount})`}
                    isActive={isMatchingJobs}
                    onClick={onMatchJobsClick}
                />
            ) : null}
            {onScreenCandidateClick ? (
                <NavButton
                    title={t('profile.screen_candidate')}
                    isActive={isScreening}
                    onClick={onScreenCandidateClick}
                />
            ) : null}
            <NavButton
                title={t('candidate_nav.jobs')}
                isActive={activeView === 'jobs' && !isMatchingJobs && !isScreening}
                onClick={() => setActiveView('jobs')}
            />
            <NavButton
                title={t('candidate_nav.referrals')}
                isActive={activeView === 'referrals' && !isMatchingJobs && !isScreening}
                onClick={() => setActiveView('referrals')}
            />
            <NavButton
                title={t('candidate_nav.events')}
                isActive={activeView === 'events' && !isMatchingJobs && !isScreening}
                onClick={() => setActiveView('events')}
            />
            <NavButton
                title={t('candidate_nav.documents')}
                isActive={activeView === 'documents' && !isMatchingJobs && !isScreening}
                onClick={() => setActiveView('documents')}
            />
            {isPlatformAdmin && previewCandidateId ? (
                <NavButton title="תצוגת מועמד" isActive={false} onClick={openCandidatePublicView} />
            ) : null}
        </nav>
    </>
  );
};

export default CandidateNav;
