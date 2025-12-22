
import React from 'react';

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
  return (
    <>
        <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        <nav className="flex items-center gap-1 p-1.5 bg-bg-card border border-border-default rounded-full shadow-xl overflow-x-auto max-w-[calc(100vw-2rem)] md:max-w-fit mx-auto no-scrollbar">
            <NavButton title="פרטי המועמד" isActive={activeView === 'details'} onClick={() => setActiveView('details')} />
            <NavButton title="התעניינות במשרות" isActive={activeView === 'jobs'} onClick={() => setActiveView('jobs')} />
            <NavButton title="הפניות" isActive={activeView === 'referrals'} onClick={() => setActiveView('referrals')} />
            <NavButton title="אירועים" isActive={activeView === 'events'} onClick={() => setActiveView('events')} />
            <NavButton title="מסמכים" isActive={activeView === 'documents'} onClick={() => setActiveView('documents')} />
        </nav>
    </>
  );
};

export default CandidateNav;
