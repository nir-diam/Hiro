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
    <div className="bg-bg-card rounded-2xl shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-lg font-bold text-text-default"
        aria-expanded={isOpen}
      >
        <div className="flex items-center">
          <span className="text-primary-500">{icon}</span>
          <span className="mr-3">{title}</span>
        </div>
        {isOpen ? <ChevronUpIcon className="w-6 h-6 text-text-muted" /> : <ChevronDownIcon className="w-6 h-6 text-text-muted" />}
      </button>
      {isOpen && (
        <div className="border-t border-border-default">
          <div className="p-4">{children}</div>
        </div>
      )}
    </div>
  );
};

export default AccordionSection;