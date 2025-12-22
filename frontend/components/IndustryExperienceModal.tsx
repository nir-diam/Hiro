import React from 'react';
import IndustryExperienceTable from './IndustryExperienceTable';
import { XMarkIcon } from './Icons';

interface IndustryExperienceModalProps {
  onClose: () => void;
}

const IndustryExperienceModal: React.FC<IndustryExperienceModalProps> = ({ onClose }) => {
  // Add effect to handle Escape key press
  React.useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-bg-card text-text-default rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden transform transition-all duration-300 opacity-0 scale-95 animate-modal-in"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
          <h2 className="text-xl font-bold text-text-default">ניסיון בתעשיות</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors"
            aria-label="סגור חלון"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto custom-scrollbar-modal p-6">
          <IndustryExperienceTable />
        </main>
      </div>
      <style>{`
        @keyframes modal-in {
            to {
                opacity: 1;
                transform: scale(1);
            }
        }
        .animate-modal-in {
            animation: modal-in 0.3s ease-out forwards;
        }
        .custom-scrollbar-modal::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar-modal::-webkit-scrollbar-track { background: rgb(var(--color-bg-subtle)); border-radius: 10px; }
        .custom-scrollbar-modal::-webkit-scrollbar-thumb { background: rgb(var(--color-border-default)); border-radius: 10px; }
        .custom-scrollbar-modal::-webkit-scrollbar-thumb:hover { background: rgb(var(--color-text-subtle)); }
      `}</style>
    </div>
  );
};

export default IndustryExperienceModal;