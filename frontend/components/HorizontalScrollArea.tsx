import React, { useRef, useEffect, useCallback } from 'react';

type HorizontalScrollAreaProps = {
    children: React.ReactNode;
    className?: string;
    scrollClassName?: string;
};

/**
 * Wraps a wide table with a synced scrollbar at both top and bottom.
 *
 * Both scroll containers use dir="ltr" so scrollLeft is always a simple
 * 0→max value and stays in sync. The actual RTL layout lives on the
 * <table dir="rtl"> inside children — not on the scroll wrapper.
 */
export const HorizontalScrollArea: React.FC<HorizontalScrollAreaProps> = ({
    children,
    className = '',
    scrollClassName = 'overflow-x-auto min-w-0 w-full [scrollbar-width:thin]',
}) => {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const topSpacerRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false);

    const syncTopSpacerWidth = useCallback(() => {
        const body = bodyScrollRef.current;
        const spacer = topSpacerRef.current;
        if (!body || !spacer) return;
        spacer.style.width = `${body.scrollWidth}px`;
    }, []);

    /** Scroll both containers all the way to the right (RTL start position). */
    const scrollToRight = useCallback(() => {
        const body = bodyScrollRef.current;
        const top = topScrollRef.current;
        if (!body) return;
        const max = body.scrollWidth - body.clientWidth;
        body.scrollLeft = max;
        if (top) top.scrollLeft = max;
    }, []);

    useEffect(() => {
        syncTopSpacerWidth();
        scrollToRight();
        const body = bodyScrollRef.current;
        if (!body) return;
        const observer = new ResizeObserver(() => {
            syncTopSpacerWidth();
        });
        observer.observe(body);
        window.addEventListener('resize', syncTopSpacerWidth);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', syncTopSpacerWidth);
        };
    }, [syncTopSpacerWidth, scrollToRight, children]);

    const handleTopScroll = () => {
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        if (!top || !body || isSyncingRef.current) return;
        isSyncingRef.current = true;
        body.scrollLeft = top.scrollLeft;
        isSyncingRef.current = false;
    };

    const handleBodyScroll = () => {
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        if (!top || !body || isSyncingRef.current) return;
        isSyncingRef.current = true;
        top.scrollLeft = body.scrollLeft;
        isSyncingRef.current = false;
    };

    return (
        <div className={className}>
            <div
                ref={topScrollRef}
                dir="ltr"
                className="overflow-x-auto overflow-y-hidden shrink-0 [scrollbar-width:thin] border-b border-border-subtle/50 bg-bg-subtle/20"
                onScroll={handleTopScroll}
                aria-hidden="true"
            >
                <div ref={topSpacerRef} className="h-3" />
            </div>
            <div
                ref={bodyScrollRef}
                dir="ltr"
                className={scrollClassName}
                onScroll={handleBodyScroll}
            >
                {children}
            </div>
        </div>
    );
};
