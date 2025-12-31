
import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface CandidateNavProps {
    activeView: string;
    setActiveView: (view: string) => void;
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

const CandidateNav: React.FC<CandidateNavProps> = ({ activeView, setActiveView }) => {
  const { t } = useLanguage();
  
  return (
    <>
        <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        <nav className="flex items-center gap-1 p-1.5 bg-bg-card border border-border-default rounded-full shadow-xl overflow-x-auto max-w-[calc(100vw-2rem)] md:max-w-fit mx-auto no-scrollbar">
            <NavButton title={t('candidate_nav.details')} isActive={activeView === 'details'} onClick={() => setActiveView('details')} />
            <NavButton title={t('candidate_nav.jobs')} isActive={activeView === 'jobs'} onClick={() => setActiveView('jobs')} />
            <NavButton title={t('candidate_nav.referrals')} isActive={activeView === 'referrals'} onClick={() => setActiveView('referrals')} />
            <NavButton title={t('candidate_nav.events')} isActive={activeView === 'events'} onClick={() => setActiveView('events')} />
            <NavButton title={t('candidate_nav.documents')} isActive={activeView === 'documents'} onClick={() => setActiveView('documents')} />
        </nav>
    </>
  );
};

export default CandidateNav;
