import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';

type HorizontalScrollAreaProps = {
    children: React.ReactNode;
    className?: string;
    scrollClassName?: string;
    /** Split thead/tbody so headers can stay sticky during page scroll + horizontal sync. */
    pinHeader?: boolean;
    /**
     * When this value changes, horizontal scroll re-aligns to the RTL table start (right side).
     * Manual scroll is kept until the key changes again.
     */
    horizontalScrollResetKey?: string | number;
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

function countTableCells(node: React.ReactNode, tagName: 'th' | 'td'): number {
    let count = 0;
    React.Children.forEach(node, (child) => {
        if (!React.isValidElement(child)) return;
        const tag = typeof child.type === 'string' ? child.type.toLowerCase() : '';
        if (tag === tagName) {
            count += 1;
            return;
        }
        const nested = (child.props as { children?: React.ReactNode }).children;
        if (nested == null) return;
        if (tag === 'thead' || tag === 'tbody' || tag === 'tr' || child.type === React.Fragment) {
            count += countTableCells(nested, tagName);
        }
    });
    return count;
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
    horizontalScrollResetKey,
}) => {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const headerScrollRef = useRef<HTMLDivElement>(null);
    /** Inner wrapper we translate to mirror body's scrollLeft exactly (no clamping drift). */
    const headerTransformRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const topSpacerRef = useRef<HTMLDivElement>(null);
    const isSyncingRef = useRef(false);
    const userHasScrolledRef = useRef(false);
    /** Horizontal position to restore after tbody/search updates (survives DOM scroll resets). */
    const pinnedScrollLeftRef = useRef<number | null>(null);
    const lastScrollLeftRef = useRef<number | null>(null);
    const scrollRafRef = useRef<number | null>(null);
    const lastSyncedWidthsRef = useRef<number[] | null>(null);
    const lastMeasuredRowCountRef = useRef(0);
    const lastMeasuredColCountRef = useRef(0);
    const rtlScrollRetryRafRef = useRef<number | null>(null);
    const lastHorizontalScrollResetKeyRef = useRef<string | number | undefined>(undefined);

    const tableParts = useMemo(
        () => (pinHeader ? extractTableParts(children) : null),
        [pinHeader, children],
    );
    const usePinnedHeader = pinHeader && tableParts != null;
    const headerColCount = useMemo(
        () => (tableParts ? countTableCells(tableParts.thead, 'th') : 0),
        [tableParts],
    );

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
        (scrollLeft: number, source: 'top' | 'body' | 'both' = 'both') => {
            const top = topScrollRef.current;
            const body = bodyScrollRef.current;
            isSyncingRef.current = true;
            if (source !== 'top' && top && top.scrollLeft !== scrollLeft) {
                top.scrollLeft = scrollLeft;
            }
            if (source !== 'body' && body && body.scrollLeft !== scrollLeft) {
                body.scrollLeft = scrollLeft;
            }
            applyHeaderTransform(scrollLeft);
            pinnedScrollLeftRef.current = scrollLeft;
            lastScrollLeftRef.current = scrollLeft;
            isSyncingRef.current = false;
        },
        [applyHeaderTransform],
    );

    const maxHorizontalScrollLeft = useCallback(() => {
        const body = bodyScrollRef.current;
        if (!body) return 0;
        const syncedTotal = lastSyncedWidthsRef.current?.reduce((acc, w) => acc + w, 0) ?? 0;
        const scrollWidth = syncedTotal > 0 ? syncedTotal : body.scrollWidth;
        return Math.max(0, scrollWidth - body.clientWidth);
    }, []);

    const scrollToRtlStart = useCallback(() => {
        const max = maxHorizontalScrollLeft();
        applyScrollLeft(max);
        return max;
    }, [applyScrollLeft, maxHorizontalScrollLeft]);

    const scrollToRtlStartWithRetry = useCallback(
        (attempt = 0) => {
            if (rtlScrollRetryRafRef.current != null) {
                cancelAnimationFrame(rtlScrollRetryRafRef.current);
                rtlScrollRetryRafRef.current = null;
            }
            syncTopSpacerWidth();
            const max = scrollToRtlStart();
            if (max > 0.5 || attempt >= 16) return;
            rtlScrollRetryRafRef.current = requestAnimationFrame(() => {
                rtlScrollRetryRafRef.current = null;
                scrollToRtlStartWithRetry(attempt + 1);
            });
        },
        [scrollToRtlStart, syncTopSpacerWidth],
    );

    const restorePinnedScrollLeft = useCallback(() => {
        if (!userHasScrolledRef.current) {
            scrollToRtlStartWithRetry();
            return;
        }
        const pinned = pinnedScrollLeftRef.current;
        if (pinned == null || pinned < 1) {
            scrollToRtlStartWithRetry();
            return;
        }
        const max = maxHorizontalScrollLeft();
        if (max < 1 && pinned > 1) return;
        const next = Math.min(Math.max(0, pinned), max);
        applyScrollLeft(next);
    }, [applyScrollLeft, maxHorizontalScrollLeft, scrollToRtlStartWithRetry]);

    const alignHorizontalScroll = useCallback(() => {
        if (!userHasScrolledRef.current) {
            scrollToRtlStartWithRetry();
            return;
        }
        restorePinnedScrollLeft();
    }, [restorePinnedScrollLeft, scrollToRtlStartWithRetry]);

    useEffect(() => {
        if (horizontalScrollResetKey === undefined) return;
        if (lastHorizontalScrollResetKeyRef.current === horizontalScrollResetKey) return;
        lastHorizontalScrollResetKeyRef.current = horizontalScrollResetKey;
        userHasScrolledRef.current = false;
        pinnedScrollLeftRef.current = null;
        lastScrollLeftRef.current = null;
        scrollToRtlStartWithRetry();
    }, [horizontalScrollResetKey, scrollToRtlStartWithRetry]);

    const clearSyncedTableLayout = useCallback((table: HTMLTableElement) => {
        table.style.tableLayout = '';
        table.style.width = '';
        table.style.minWidth = '';
        table.style.maxWidth = '';
        table.querySelector('colgroup[data-hscroll-sync]')?.remove();
    }, []);

    const syncColumnWidths = useCallback(() => {
        if (!usePinnedHeader) return;

        const headerTable = headerScrollRef.current?.querySelector('table') as HTMLTableElement | null;
        const bodyTable = bodyScrollRef.current?.querySelector('table') as HTMLTableElement | null;
        if (!headerTable || !bodyTable) return;

        const bodyRows = Array.from(bodyTable.querySelectorAll('tbody tr'));
        if (bodyRows.length === 0) return;

        const headerCells = Array.from(headerTable.querySelectorAll('thead > tr > th')) as HTMLElement[];
        if (headerCells.length === 0) return;

        const firstRowTdCount = Array.from(bodyRows[0].children).filter(
            (el) => el.tagName === 'TD',
        ).length;
        const expectedColCount = Math.max(headerCells.length, firstRowTdCount);

        // Re-measure only when column count changes. Re-measuring after fixed
        // layout with the same columns causes a scrollWidth feedback loop.
        if (lastSyncedWidthsRef.current?.length === expectedColCount) return;

        clearSyncedTableLayout(headerTable);
        clearSyncedTableLayout(bodyTable);
        void bodyTable.offsetWidth;

        const bodyWidths: number[] = [];
        // Sample a few rows — measuring every cell on a 200-row page causes layout thrash.
        const sampleCount = Math.min(bodyRows.length, 8);
        for (let r = 0; r < sampleCount; r += 1) {
            Array.from(bodyRows[r].children)
                .filter((el) => el.tagName === 'TD')
                .forEach((cell, i) => {
                    const w = Math.ceil((cell as HTMLElement).getBoundingClientRect().width);
                    bodyWidths[i] = Math.max(bodyWidths[i] ?? 0, w);
                });
        }

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
        lastMeasuredColCountRef.current = expectedColCount;

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
        const body = bodyScrollRef.current;
        if (!body) return;

        const syncLayout = () => {
            const rowCount = body.querySelectorAll('tbody tr').length;
            const headerTable = headerScrollRef.current?.querySelector('table');
            const headerThCount =
                headerTable?.querySelectorAll('thead > tr > th').length ?? headerColCount;
            const firstBodyRow = body.querySelector('tbody tr');
            const bodyTdCount = firstBodyRow
                ? Array.from(firstBodyRow.children).filter((el) => el.tagName === 'TD').length
                : 0;
            const colCount = Math.max(headerThCount, bodyTdCount, headerColCount);
            if (
                rowCount !== lastMeasuredRowCountRef.current ||
                colCount !== lastMeasuredColCountRef.current
            ) {
                lastMeasuredRowCountRef.current = rowCount;
                lastMeasuredColCountRef.current = colCount;
                lastSyncedWidthsRef.current = null;
            }
            syncColumnWidths();
            syncTopSpacerWidth();
            alignHorizontalScroll();
            requestAnimationFrame(() => {
                alignHorizontalScroll();
            });
        };

        syncLayout();
        const rafId = requestAnimationFrame(() => {
            requestAnimationFrame(syncLayout);
        });

        const observer = new ResizeObserver(() => {
            const rowCount = body.querySelectorAll('tbody tr').length;
            const headerTable = headerScrollRef.current?.querySelector('table');
            const headerThCount =
                headerTable?.querySelectorAll('thead > tr > th').length ?? headerColCount;
            const firstBodyRow = body.querySelector('tbody tr');
            const bodyTdCount = firstBodyRow
                ? Array.from(firstBodyRow.children).filter((el) => el.tagName === 'TD').length
                : 0;
            const colCount = Math.max(headerThCount, bodyTdCount, headerColCount);
            if (
                rowCount !== lastMeasuredRowCountRef.current ||
                colCount !== lastMeasuredColCountRef.current ||
                !lastSyncedWidthsRef.current
            ) {
                syncLayout();
                return;
            }
            syncTopSpacerWidth();
        });
        observer.observe(body);
        const table = body.querySelector('table');
        if (table) observer.observe(table);
        window.addEventListener('resize', syncLayout);
        return () => {
            cancelAnimationFrame(rafId);
            if (scrollRafRef.current != null) {
                cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
            observer.disconnect();
            window.removeEventListener('resize', syncLayout);
            if (rtlScrollRetryRafRef.current != null) {
                cancelAnimationFrame(rtlScrollRetryRafRef.current);
                rtlScrollRetryRafRef.current = null;
            }
        };
    }, [
        syncTopSpacerWidth,
        alignHorizontalScroll,
        syncColumnWidths,
        applyHeaderTransform,
        usePinnedHeader,
        headerColCount,
    ]);

    useLayoutEffect(() => {
        if (!usePinnedHeader) return;
        alignHorizontalScroll();
    }, [usePinnedHeader, children, alignHorizontalScroll]);

    const handleHorizontalScroll = (source: 'top' | 'body', nativeEvent?: Event) => {
        if (isSyncingRef.current) return;
        const top = topScrollRef.current;
        const body = bodyScrollRef.current;
        const scrollLeft =
            source === 'top' ? top?.scrollLeft ?? 0 : body?.scrollLeft ?? 0;
        // Vertical-only scroll on overflow:auto still fires onScroll — skip the sync.
        if (lastScrollLeftRef.current === scrollLeft) return;

        const pinned = pinnedScrollLeftRef.current;
        const looksLikeDomReset =
            pinned != null && pinned > 4 && scrollLeft < 1;
        if (nativeEvent && (!nativeEvent.isTrusted || looksLikeDomReset)) {
            if (!userHasScrolledRef.current) {
                requestAnimationFrame(() => scrollToRtlStartWithRetry());
            } else if (pinned != null && Math.abs(scrollLeft - pinned) > 0.5) {
                requestAnimationFrame(() => restorePinnedScrollLeft());
            }
            return;
        }

        lastScrollLeftRef.current = scrollLeft;
        pinnedScrollLeftRef.current = scrollLeft;
        userHasScrolledRef.current = true;
        if (scrollRafRef.current != null) return;
        scrollRafRef.current = requestAnimationFrame(() => {
            scrollRafRef.current = null;
            const left = lastScrollLeftRef.current;
            if (left == null) return;
            applyScrollLeft(left, source);
        });
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
                        onScroll={(e) => handleHorizontalScroll('top', e.nativeEvent)}
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
                    onScroll={(e) => handleHorizontalScroll('body', e.nativeEvent)}
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
                onScroll={(e) => handleHorizontalScroll('top', e.nativeEvent)}
                aria-hidden
            >
                <div ref={topSpacerRef} className="h-px" aria-hidden="true" />
            </div>
            <div
                ref={bodyScrollRef}
                dir="ltr"
                className={scrollClassName}
                onScroll={(e) => handleHorizontalScroll('body', e.nativeEvent)}
            >
                {children}
            </div>
        </div>
    );
};
