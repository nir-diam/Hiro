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
 *
 * Until the user scrolls horizontally, position stays pinned to the RTL
 * start (right) — including across late layout / data load. After the
 * user scrolls, position is preserved across re-renders (e.g. row save).
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
    const isProgrammaticScrollRef = useRef(false);
    const userHasScrolledRef = useRef(false);

    const syncTopSpacerWidth = useCallback(() => {
        const body = bodyScrollRef.current;
        const spacer = topSpacerRef.current;
        if (!body || !spacer) return;
        spacer.style.width = `${body.scrollWidth}px`;
    }, []);

    const scrollToRtlStart = useCallback(() => {
        const body = bodyScrollRef.current;
        const top = topScrollRef.current;
        if (!body) return;
        const max = Math.max(0, body.scrollWidth - body.clientWidth);
        isProgrammaticScrollRef.current = true;
        body.scrollLeft = max;
        if (top) top.scrollLeft = max;
        requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
        });
    }, []);

    useEffect(() => {
        const body = bodyScrollRef.current;
        if (!body) return;

        const syncLayout = () => {
            syncTopSpacerWidth();
            if (!userHasScrolledRef.current) {
                scrollToRtlStart();
                return;
            }
            const max = Math.max(0, body.scrollWidth - body.clientWidth);
            const next = Math.min(body.scrollLeft, max);
            if (body.scrollLeft !== next) {
                isProgrammaticScrollRef.current = true;
                body.scrollLeft = next;
                if (topScrollRef.current) topScrollRef.current.scrollLeft = next;
                requestAnimationFrame(() => {
                    isProgrammaticScrollRef.current = false;
                });
            } else if (topScrollRef.current) {
                topScrollRef.current.scrollLeft = body.scrollLeft;
            }
        };

        syncLayout();
        // Second pass after paint — fonts/table columns often settle late
        const rafId = requestAnimationFrame(() => {
            requestAnimationFrame(syncLayout);
        });

        const observer = new ResizeObserver(syncLayout);
        observer.observe(body);
        if (body.firstElementChild) observer.observe(body.firstElementChild);
        window.addEventListener('resize', syncLayout);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
            window.removeEventListener('resize', syncLayout);
        };
    }, [syncTopSpacerWidth, scrollToRtlStart]);

    const markUserScrolled = () => {
        if (isProgrammaticScrollRef.current || isSyncingRef.current) return;
        userHasScrolledRef.current = true;
    };

    const handleTopScroll = () => {
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        if (!top || !body || isSyncingRef.current) return;
        markUserScrolled();
        isSyncingRef.current = true;
        body.scrollLeft = top.scrollLeft;
        isSyncingRef.current = false;
    };

    const handleBodyScroll = () => {
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        if (!top || !body || isSyncingRef.current) return;
        markUserScrolled();
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
