import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from './Icons';

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({ title, icon, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-visible transition-all hover:shadow-md">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 sm:p-6 text-lg font-bold text-text-default hover:bg-bg-hover transition-colors focus:outline-none focus:bg-bg-hover"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-4">
          <span className="text-primary-600 dark:text-primary-400 bg-primary-500/10 p-2.5 rounded-xl border border-primary-500/20 shadow-sm">{icon}</span>
          <span className="tracking-tight">{title}</span>
        </div>
        {isOpen ? <ChevronUpIcon className="w-6 h-6 text-text-muted" /> : <ChevronDownIcon className="w-6 h-6 text-text-muted" />}
      </button>
      {isOpen && (
        <div className="border-t border-border-subtle bg-bg-card">
          <div className="p-5 sm:p-6 pt-6 sm:pt-8">{children}</div>
        </div>
      )}
    </div>
  );
};

export default AccordionSection;