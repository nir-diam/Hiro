import React, { useRef, useEffect, useCallback, useMemo } from 'react';

type HorizontalScrollAreaProps = {
    children: React.ReactNode;
    className?: string;
    scrollClassName?: string;
    /** Split thead/tbody so headers can stay sticky during page scroll + horizontal sync. */
    pinHeader?: boolean;
};

type TableParts = {
    tableProps: React.TableHTMLAttributes<HTMLTableElement>;
    colgroup: React.ReactNode;
    thead: React.ReactNode;
    tbody: React.ReactNode;
};

function isTableElement(child: React.ReactElement): boolean {
    return typeof child.type === 'string' && child.type.toLowerCase() === 'table';
}

function extractTableParts(children: React.ReactNode): TableParts | null {
    const child = React.Children.only(children);
    if (!React.isValidElement<React.TableHTMLAttributes<HTMLTableElement>>(child)) return null;
    if (!isTableElement(child)) return null;

    let colgroup: React.ReactNode = null;
    let thead: React.ReactNode = null;
    let tbody: React.ReactNode = null;

    React.Children.forEach(child.props.children, (section) => {
        if (!React.isValidElement(section)) return;
        const tag = typeof section.type === 'string' ? section.type.toLowerCase() : '';
        if (tag === 'colgroup') colgroup = section;
        if (tag === 'thead') thead = section;
        if (tag === 'tbody') tbody = section;
    });

    if (!thead || !tbody) return null;

    const { children: _tableChildren, ...tableProps } = child.props;
    return { tableProps, colgroup, thead, tbody };
}

/**
 * Wide table with synced horizontal scrollbars.
 * With `pinHeader`, thead stays sticky while the page scrolls vertically.
 */
export const HorizontalScrollArea: React.FC<HorizontalScrollAreaProps> = ({
    children,
    className = '',
    scrollClassName = 'overflow-x-auto min-w-0 w-full [scrollbar-width:thin]',
    pinHeader = false,
}) => {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const headerScrollRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const topSpacerRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const userHasScrolledRef = useRef(false);

    const tableParts = useMemo(
        () => (pinHeader ? extractTableParts(children) : null),
        [pinHeader, children],
    );
    const usePinnedHeader = pinHeader && tableParts != null;

    const syncTopSpacerWidth = useCallback(() => {
        const body = bodyScrollRef.current;
        const spacer = topSpacerRef.current;
        if (!body || !spacer) return;
        spacer.style.width = `${body.scrollWidth}px`;
    }, []);

    const applyScrollLeft = useCallback((scrollLeft: number) => {
        const top = topScrollRef.current;
        const header = headerScrollRef.current;
        const body = bodyScrollRef.current;
        isProgrammaticScrollRef.current = true;
        if (top && top.scrollLeft !== scrollLeft) top.scrollLeft = scrollLeft;
        if (header && header.scrollLeft !== scrollLeft) header.scrollLeft = scrollLeft;
        if (body && body.scrollLeft !== scrollLeft) body.scrollLeft = scrollLeft;
        requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
        });
    }, []);

    const scrollToRtlStart = useCallback(() => {
        const body = bodyScrollRef.current;
        if (!body) return;
        const max = Math.max(0, body.scrollWidth - body.clientWidth);
        applyScrollLeft(max);
    }, [applyScrollLeft]);

    const syncColumnWidths = useCallback(() => {
        if (!usePinnedHeader) return;
        const headerTable = headerScrollRef.current?.querySelector('table');
        const bodyTable = bodyScrollRef.current?.querySelector('table');
        if (!headerTable || !bodyTable) return;

        const headerCells = headerTable.querySelectorAll('thead th');
        if (headerCells.length === 0) return;

        const syncColgroup = (table: HTMLTableElement) => {
            let colgroup = table.querySelector('colgroup');
            if (!colgroup) {
                colgroup = document.createElement('colgroup');
                table.insertBefore(colgroup, table.firstChild);
            }
            colgroup.innerHTML = '';
            headerCells.forEach((th) => {
                const col = document.createElement('col');
                const width = (th as HTMLElement).getBoundingClientRect().width;
                if (width > 0) col.style.width = `${width}px`;
                colgroup!.appendChild(col);
            });
        };

        syncColgroup(headerTable);
        syncColgroup(bodyTable);
    }, [usePinnedHeader]);

    useEffect(() => {
        const body = bodyScrollRef.current;
        if (!body) return;

        const syncLayout = () => {
            syncTopSpacerWidth();
            syncColumnWidths();
            if (!userHasScrolledRef.current) {
                scrollToRtlStart();
                return;
            }
            const max = Math.max(0, body.scrollWidth - body.clientWidth);
            const next = Math.min(body.scrollLeft, max);
            if (body.scrollLeft !== next) {
                applyScrollLeft(next);
            } else {
                applyScrollLeft(body.scrollLeft);
            }
        };

        syncLayout();
        const rafId = requestAnimationFrame(() => {
            requestAnimationFrame(syncLayout);
        });

        const observer = new ResizeObserver(syncLayout);
        observer.observe(body);
        if (body.firstElementChild) observer.observe(body.firstElementChild);
        if (headerScrollRef.current) {
            observer.observe(headerScrollRef.current);
            const headerTable = headerScrollRef.current.querySelector('table');
            if (headerTable) observer.observe(headerTable);
        }
        window.addEventListener('resize', syncLayout);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
            window.removeEventListener('resize', syncLayout);
        };
    }, [syncTopSpacerWidth, scrollToRtlStart, syncColumnWidths, applyScrollLeft, usePinnedHeader, tableParts]);

    const handleHorizontalScroll = (source: 'top' | 'header' | 'body') => {
        if (isSyncingRef.current || isProgrammaticScrollRef.current) return;
        const top = topScrollRef.current;
        const header = headerScrollRef.current;
        const body = bodyScrollRef.current;
        const scrollLeft =
            source === 'top'
                ? top?.scrollLeft ?? 0
                : source === 'header'
                  ? header?.scrollLeft ?? 0
                  : body?.scrollLeft ?? 0;
        if (!isProgrammaticScrollRef.current) userHasScrolledRef.current = true;
        isSyncingRef.current = true;
        applyScrollLeft(scrollLeft);
        isSyncingRef.current = false;
    };

    const renderTable = (sections: React.ReactNode, key: string) => {
        if (!tableParts) return null;
        const { tableProps, colgroup } = tableParts;
        return (
            <table key={key} {...tableProps}>
                {colgroup}
                {sections}
            </table>
        );
    };

    return (
        <div className={className}>
            <div
                ref={topScrollRef}
                dir="ltr"
                className="overflow-x-auto overflow-y-hidden shrink-0 [scrollbar-width:thin] border-b border-border-subtle/50 bg-bg-subtle/20"
                onScroll={() => handleHorizontalScroll('top')}
                aria-hidden={usePinnedHeader ? undefined : true}
            >
                <div ref={topSpacerRef} className={usePinnedHeader ? 'h-0' : 'h-3'} />
            </div>

            {usePinnedHeader && tableParts ? (
                <>
                    <div
                        ref={headerScrollRef}
                        dir="ltr"
                        className="sticky top-0 z-30 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden border-b border-border-default bg-[#f8fafc]"
                        onScroll={() => handleHorizontalScroll('header')}
                    >
                        {renderTable(tableParts.thead, 'header')}
                    </div>
                    <div
                        ref={bodyScrollRef}
                        dir="ltr"
                        className={scrollClassName}
                        onScroll={() => handleHorizontalScroll('body')}
                    >
                        {renderTable(tableParts.tbody, 'body')}
                    </div>
                </>
            ) : (
                <div
                    ref={bodyScrollRef}
                    dir="ltr"
                    className={scrollClassName}
                    onScroll={() => handleHorizontalScroll('body')}
                >
                    {children}
                </div>
            )}
        </div>
    );
};
