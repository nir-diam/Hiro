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
 * The top scrollbar and header stick to `top:0` so they're always reachable.
 */
export const HorizontalScrollArea: React.FC<HorizontalScrollAreaProps> = ({
    children,
    className = '',
    scrollClassName = 'overflow-x-auto min-w-0 w-full [scrollbar-width:thin]',
    pinHeader = false,
}) => {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const headerScrollRef = useRef<HTMLDivElement>(null);
    /** Inner wrapper we translate to mirror body's scrollLeft exactly (no clamping drift). */
    const headerTransformRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const topSpacerRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false);
    const isProgrammaticScrollRef = useRef(false);
    const userHasScrolledRef = useRef(false);
    const lastSyncedWidthsRef = useRef<number[] | null>(null);

    const tableParts = useMemo(
        () => (pinHeader ? extractTableParts(children) : null),
        [pinHeader, children],
    );
    const usePinnedHeader = pinHeader && tableParts != null;

    const syncTopSpacerWidth = useCallback(() => {
        const body = bodyScrollRef.current;
        const spacer = topSpacerRef.current;
        if (!body || !spacer) return;
        const syncedTotal = lastSyncedWidthsRef.current?.reduce((acc, w) => acc + w, 0);
        if (syncedTotal && syncedTotal > 0) {
            spacer.style.width = `${syncedTotal}px`;
            return;
        }
        const bodyTable = body.querySelector('table') as HTMLTableElement | null;
        const fallback = bodyTable?.offsetWidth ?? body.scrollWidth;
        spacer.style.width = `${fallback}px`;
    }, []);

    const applyHeaderTransform = useCallback((scrollLeft: number) => {
        const headerInner = headerTransformRef.current;
        if (!headerInner) return;
        // Positive scrollLeft → translate content in the opposite direction.
        headerInner.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
    }, []);

    const applyScrollLeft = useCallback(
        (scrollLeft: number) => {
            const top = topScrollRef.current;
            const body = bodyScrollRef.current;
            isProgrammaticScrollRef.current = true;
            if (top && top.scrollLeft !== scrollLeft) top.scrollLeft = scrollLeft;
            if (body && body.scrollLeft !== scrollLeft) body.scrollLeft = scrollLeft;
            applyHeaderTransform(scrollLeft);
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        },
        [applyHeaderTransform],
    );

    const scrollToRtlStart = useCallback(() => {
        const body = bodyScrollRef.current;
        if (!body) return;
        const syncedTotal = lastSyncedWidthsRef.current?.reduce((acc, w) => acc + w, 0) ?? 0;
        const scrollWidth = syncedTotal > 0 ? syncedTotal : body.scrollWidth;
        const max = Math.max(0, scrollWidth - body.clientWidth);
        applyScrollLeft(max);
    }, [applyScrollLeft]);

    const clearSyncedTableLayout = useCallback((table: HTMLTableElement) => {
        table.style.tableLayout = '';
        table.style.width = '';
        table.style.minWidth = '';
        table.style.maxWidth = '';
        table.querySelector('colgroup[data-hscroll-sync]')?.remove();
    }, []);

    const syncColumnWidths = useCallback(() => {
        if (!usePinnedHeader) return;
        // Measure once per table mount — re-measuring after fixed layout causes a
        // scrollWidth feedback loop that grows the scrollbar forever.
        if (lastSyncedWidthsRef.current) return;

        const headerTable = headerScrollRef.current?.querySelector('table') as HTMLTableElement | null;
        const bodyTable = bodyScrollRef.current?.querySelector('table') as HTMLTableElement | null;
        if (!headerTable || !bodyTable) return;

        const bodyRows = Array.from(bodyTable.querySelectorAll('tbody tr'));
        if (bodyRows.length === 0) return;

        const headerCells = Array.from(headerTable.querySelectorAll('thead > tr > th')) as HTMLElement[];
        if (headerCells.length === 0) return;

        clearSyncedTableLayout(headerTable);
        clearSyncedTableLayout(bodyTable);
        void bodyTable.offsetWidth;

        const bodyWidths: number[] = [];
        bodyRows.forEach((row) => {
            Array.from(row.children)
                .filter((el) => el.tagName === 'TD')
                .forEach((cell, i) => {
                    const w = Math.ceil((cell as HTMLElement).getBoundingClientRect().width);
                    bodyWidths[i] = Math.max(bodyWidths[i] ?? 0, w);
                });
        });

        // Header sits in a clipped container, so rendered widths compress long labels.
        // Measure each th at max-content + nowrap to get the true text width.
        headerTable.style.tableLayout = 'auto';
        headerTable.style.width = 'max-content';
        headerTable.style.minWidth = '';
        headerTable.style.maxWidth = '';
        headerCells.forEach((th) => {
            th.style.whiteSpace = 'nowrap';
            th.style.width = 'max-content';
            th.style.minWidth = '';
            th.style.maxWidth = '';
        });
        void headerTable.offsetWidth;

        const headerContentWidths = headerCells.map((th) =>
            Math.ceil(th.getBoundingClientRect().width),
        );

        headerCells.forEach((th) => {
            th.style.whiteSpace = '';
            th.style.width = '';
            th.style.minWidth = '';
            th.style.maxWidth = '';
        });

        const count = Math.max(bodyWidths.length, headerContentWidths.length);
        const widths: number[] = [];
        for (let i = 0; i < count; i += 1) {
            widths.push(Math.max(bodyWidths[i] ?? 0, headerContentWidths[i] ?? 0));
        }
        lastSyncedWidthsRef.current = widths;

        const applyTableColumnLayout = (table: HTMLTableElement) => {
            const totalWidth = widths.reduce((acc, w) => acc + w, 0);
            table.style.tableLayout = 'fixed';
            table.style.width = `${totalWidth}px`;
            table.style.minWidth = `${totalWidth}px`;
            table.style.maxWidth = `${totalWidth}px`;

            const colgroup = document.createElement('colgroup');
            colgroup.setAttribute('data-hscroll-sync', '');
            widths.forEach((w) => {
                const col = document.createElement('col');
                if (w > 0) col.style.width = `${w}px`;
                colgroup.appendChild(col);
            });
            table.insertBefore(colgroup, table.firstChild);

            table.querySelectorAll('th, td').forEach((cell) => {
                (cell as HTMLElement).style.boxSizing = 'border-box';
            });
        };

        applyTableColumnLayout(headerTable);
        applyTableColumnLayout(bodyTable);
    }, [usePinnedHeader, clearSyncedTableLayout]);

    useEffect(() => {
        lastSyncedWidthsRef.current = null;
        const body = bodyScrollRef.current;
        if (!body) return;

        const syncLayout = () => {
            syncColumnWidths();
            syncTopSpacerWidth();
            if (!userHasScrolledRef.current) {
                scrollToRtlStart();
                return;
            }
            const syncedTotal = lastSyncedWidthsRef.current?.reduce((acc, w) => acc + w, 0) ?? 0;
            const scrollWidth = syncedTotal > 0 ? syncedTotal : body.scrollWidth;
            const max = Math.max(0, scrollWidth - body.clientWidth);
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
        window.addEventListener('resize', syncLayout);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
            window.removeEventListener('resize', syncLayout);
        };
    }, [syncTopSpacerWidth, scrollToRtlStart, syncColumnWidths, applyScrollLeft, usePinnedHeader, tableParts]);

    const handleHorizontalScroll = (source: 'top' | 'body') => {
        if (isSyncingRef.current || isProgrammaticScrollRef.current) return;
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        const scrollLeft =
            source === 'top' ? top?.scrollLeft ?? 0 : body?.scrollLeft ?? 0;
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

    if (usePinnedHeader && tableParts) {
        return (
            <div className={className}>
                <div className="sticky top-0 z-30 bg-[#f8fafc] shadow-sm">
                    <div
                        ref={topScrollRef}
                        dir="ltr"
                        className="overflow-x-auto overflow-y-hidden shrink-0 h-3 [scrollbar-width:thin] border-b border-border-subtle/50 bg-bg-subtle/30"
                        onScroll={() => handleHorizontalScroll('top')}
                    >
                        <div ref={topSpacerRef} className="h-px" aria-hidden="true" />
                    </div>
                    <div
                        ref={headerScrollRef}
                        dir="ltr"
                        className="overflow-hidden border-b border-border-default"
                    >
                        <div ref={headerTransformRef} className="will-change-transform">
                            {renderTable(tableParts.thead, 'header')}
                        </div>
                    </div>
                </div>
                <div
                    ref={bodyScrollRef}
                    dir="ltr"
                    className={scrollClassName}
                    onScroll={() => handleHorizontalScroll('body')}
                >
                    {renderTable(tableParts.tbody, 'body')}
                </div>
            </div>
        );
    }

    return (
        <div className={className}>
            <div
                ref={topScrollRef}
                dir="ltr"
                className="overflow-x-auto overflow-y-hidden shrink-0 h-3 [scrollbar-width:thin] border-b border-border-subtle/50 bg-bg-subtle/30 sticky top-0 z-20"
                onScroll={() => handleHorizontalScroll('top')}
                aria-hidden
            >
                <div ref={topSpacerRef} className="h-px" aria-hidden="true" />
            </div>
            <div
                ref={bodyScrollRef}
                dir="ltr"
                className={scrollClassName}
                onScroll={() => handleHorizontalScroll('body')}
            >
                {children}
            </div>
        </div>
    );
};
