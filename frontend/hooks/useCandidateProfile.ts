
import { useState, useRef, useEffect } from 'react';

export const useCandidateProfile = () => {
    const [activeView, setActiveView] = useState('details');
    const [isMatchingJobs, setIsMatchingJobs] = useState(false);
    const [isScreening, setIsScreening] = useState(false);
    const contentAreaRef = useRef<HTMLDivElement>(null);

    // Effect to handle scrolling to the content area when a tab is clicked
    useEffect(() => {
        // Check if content area exists and we are not in special matching/screening modes
        if (contentAreaRef.current && !isMatchingJobs && !isScreening) {
            const scrollContainer = document.getElementById('main-scroll-container');
            if (scrollContainer) {
                // Add a small delay to ensure the DOM has fully rendered the new view before scrolling
                // This fixes the "halfway" scroll issue where content height hasn't adjusted yet
                setTimeout(() => {
                    const topPos = contentAreaRef.current?.offsetTop || 0;
                    let offset = 0;

                    switch (activeView) {
                        case 'jobs':
                        case 'referrals':
                        case 'events':
                        case 'documents':
                            // Applied the working offset from events/documents (220) to jobs/referrals as requested
                            offset = 220;
                            break;
                        case 'details':
                            // Keep existing offset for details (summary) as requested
                            offset = 0; 
                            break;
                        default:
                            offset = 0;
                    }

                    scrollContainer.scrollTo({
                        top: Math.max(0, topPos + offset),
                        behavior: 'smooth'
                    });
                }, 100);
            }
        }
    }, [activeView, isMatchingJobs, isScreening]);

    // Effect to handle scrolling to job matching or screening view when activated
    useEffect(() => {
        if ((isMatchingJobs || isScreening) && contentAreaRef.current) {
            const scrollContainer = document.getElementById('main-scroll-container');
            if (scrollContainer) {
                setTimeout(() => {
                    const topPos = contentAreaRef.current?.offsetTop || 0;
                    scrollContainer.scrollTo({
                        top: topPos + 50, 
                        behavior: 'smooth'
                    });
                }, 100);
            }
        }
    }, [isMatchingJobs, isScreening]);

    const handleSetActiveView = (view: string) => {
        setIsMatchingJobs(false);
        setIsScreening(false);
        setActiveView(view);
    };

    const handleScreeningClick = () => {
        setIsScreening(true);
        setIsMatchingJobs(false);
        setActiveView('details');
    };
    
    const handleMatchingClick = () => {
        setIsMatchingJobs(true);
        setIsScreening(false);
        setActiveView('details');
    };

    return {
        activeView,
        setActiveView,
        isMatchingJobs,
        setIsMatchingJobs,
        isScreening,
        setIsScreening,
        contentAreaRef,
        handleSetActiveView,
        handleScreeningClick,
        handleMatchingClick,
    };
};
