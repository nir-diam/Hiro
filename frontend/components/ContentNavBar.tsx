
import React, { useState, useEffect, useRef } from 'react';
import { ClipboardDocumentCheckIcon, PencilIcon, SparklesIcon, WalletIcon, CalendarDaysIcon, LanguageIcon, AcademicCapIcon, TagIcon, ChatBubbleOvalLeftEllipsisIcon, BriefcaseIcon } from './Icons';

const sections = [
    { id: 'summary', title: 'תקציר', icon: <ClipboardDocumentCheckIcon className="w-5 h-5"/> },
    { id: 'personal-details', title: 'פרטים אישיים', icon: <PencilIcon className="w-5 h-5"/> },
    { id: 'work-experience', title: 'ניסיון תעסוקתי', icon: <BriefcaseIcon className="w-5 h-5"/> },
    { id: 'preferences', title: 'העדפות ואילוצים', icon: <SparklesIcon className="w-5 h-5"/> },
    { id: 'salary', title: 'ציפיות שכר', icon: <WalletIcon className="w-5 h-5"/> },
    { id: 'birth-date', title: 'תאריך לידה', icon: <CalendarDaysIcon className="w-5 h-5"/> },
    { id: 'languages', title: 'שליטה בשפות', icon: <LanguageIcon className="w-5 h-5"/> },
    { id: 'education', title: 'השכלה', icon: <AcademicCapIcon className="w-5 h-5"/> },
    { id: 'skills', title: 'מיומנויות', icon: <TagIcon className="w-5 h-5"/> },
    { id: 'notes', title: 'הערות', icon: <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/> },
];

const ContentNavBar: React.FC = () => {
    const [activeSection, setActiveSection] = useState('summary');
    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scrollContainer = document.getElementById('main-scroll-container');
        if (!scrollContainer) return;

        const handleScroll = () => {
            const scrollPosition = scrollContainer.scrollTop;
            const offset = 150; // Adjusted offset for better highlighting accuracy

            for (let i = sections.length - 1; i >= 0; i--) {
                const section = sections[i];
                const element = document.getElementById(section.id);
                if (element && element.offsetTop - offset <= scrollPosition) {
                    setActiveSection(section.id);
                    break;
                }
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (navRef.current) {
            const activeButton = navRef.current.querySelector(`[data-section-id="${activeSection}"]`) as HTMLElement;
            if (activeButton) {
                const navRect = navRef.current.getBoundingClientRect();
                const buttonRect = activeButton.getBoundingClientRect();
                
                const scrollLeft = navRef.current.scrollLeft + buttonRect.left - navRect.left - (navRect.width / 2) + (buttonRect.width / 2);

                navRef.current.scrollTo({
                    left: scrollLeft,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeSection]);

    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        const scrollContainer = document.getElementById('main-scroll-container');
        if (element && scrollContainer) {
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            const scrollTop = scrollContainer.scrollTop;
            
            // Updated offset: Only height of the sticky content bar itself (~70px) + buffer
            const offset = 80;
            
            scrollContainer.scrollTo({
                top: scrollTop + elementTop - containerTop - offset,
                behavior: 'smooth',
            });
            setActiveSection(id);
        }
    };
    
    return (
        // Adjusted sticky top position to 0 or 2 since main nav isn't sticky anymore
        <div className="sticky top-0 z-20 bg-bg-subtle/95 backdrop-blur-md py-2 mb-4 flex justify-center transition-all duration-200">
            <div 
                ref={navRef}
                className="bg-bg-card/90 shadow-sm border border-border-default/50 p-1.5 flex items-center md:w-full max-w-full overflow-x-auto rounded-full md:rounded-xl no-scrollbar"
            >
                {sections.map((section, index) => (
                    <React.Fragment key={section.id}>
                        <button 
                            data-section-id={section.id}
                            onClick={() => scrollToSection(section.id)}
                            className={`flex flex-col items-center justify-center text-center px-3 py-1.5 rounded-full md:rounded-lg transition-all duration-300 w-20 md:flex-1 group shrink-0 ${
                                activeSection === section.id ? 'text-primary-600' : 'text-text-muted hover:bg-primary-100/50'
                            }`}
                        >
                            <div className={`p-2 rounded-full transition-colors duration-200 ${activeSection === section.id ? 'bg-primary-100' : 'bg-bg-subtle group-hover:bg-primary-100'}`}>
                                {React.cloneElement(section.icon, {
                                    className: `w-5 h-5 transition-colors duration-200 ${activeSection === section.id ? 'text-primary-600' : 'text-text-muted group-hover:bg-primary-600'}`,
                                })}
                            </div>
                            <span className="hidden md:block text-xs font-semibold mt-1.5 whitespace-normal">{section.title}</span>
                            <span className={`block md:hidden text-[10px] font-bold mt-1 transition-opacity duration-300 h-4 ${activeSection === section.id ? 'opacity-100' : 'opacity-0'}`}>
                                {section.title}
                            </span>
                             <div className={`hidden md:block mt-2 h-1 w-full rounded-full ${activeSection === section.id ? 'bg-primary-500' : 'bg-transparent'}`}></div>
                        </button>
                        {index < sections.length - 1 && <div className="h-8 w-px bg-border-default hidden md:block mx-1" />}
                    </React.Fragment>
                ))}
            </div>
             <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        </div>
    );
};

export default ContentNavBar;
