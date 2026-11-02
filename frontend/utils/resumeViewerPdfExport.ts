function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** html2canvas drops unresolved CSS variables, which paints the resume as an empty page. */
function concreteResumeCss(css: string, brand: string): string {
    return css
        .replace(/var\(--pr-ink\)/g, '#1f1f1f')
        .replace(/var\(--pr-muted\)/g, '#4a4a4a')
        .replace(/var\(--pr-line\)/g, '#e3e3e3')
        .replace(/var\(--pr-brand\)/g, brand || '#93222b');
}

/**
 * Capture a DOM subtree as canvas at full scroll height (avoids clipping inside scroll parents).
 * The node is parked off-screen, not under the page: a negative z-index or foreignObject
 * snapshot comes back transparent and saves as a blank PDF.
 */
async function captureElementToCanvas(
    el: HTMLElement,
    scale: number,
    options?: { widthPx?: number },
): Promise<HTMLCanvasElement> {
    const html2canvas = (await import('html2canvas')).default;

    const w = options?.widthPx && options.widthPx > 0
        ? options.widthPx
        : Math.max(el.scrollWidth, el.offsetWidth, 1);
    const brand = el.style.getPropertyValue('--pr-brand').trim() || '#93222b';

    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-12000px;top:0;width:${w}px;background:#ffffff;`;

    const clone = el.cloneNode(true) as HTMLElement;
    clone.style.boxSizing = 'border-box';
    clone.style.position = 'static';
    clone.style.left = 'auto';
    clone.style.top = 'auto';
    clone.style.zIndex = 'auto';
    clone.style.visibility = 'visible';
    clone.style.opacity = '1';
    clone.style.width = `${w}px`;
    clone.style.maxWidth = `${w}px`;
    clone.style.height = 'auto';
    clone.style.minHeight = '0';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.margin = '0';
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#1f1f1f';

    const styleEl = clone.querySelector('style');
    let headStyle: HTMLStyleElement | null = null;
    if (styleEl?.textContent) {
        const css = concreteResumeCss(styleEl.textContent, brand);
        styleEl.textContent = css;
        headStyle = document.createElement('style');
        headStyle.setAttribute('data-pr-capture', '1');
        headStyle.textContent = css;
        document.head.appendChild(headStyle);
    }

    host.appendChild(clone);
    document.body.appendChild(host);

    try {
        await nextFrame();
        await Promise.all(
            Array.from(clone.querySelectorAll('img')).map((img) =>
                img.decode().catch(() => undefined),
            ),
        );
        if (document.fonts?.ready) await document.fonts.ready;
        await nextFrame();

        const h = Math.max(clone.scrollHeight, clone.offsetHeight, 1);
        return await html2canvas(clone, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: w,
            windowHeight: h,
        });
    } finally {
        host.remove();
        headStyle?.remove();
    }
}

/** A transparent foreignObject canvas has rgb 0 and must not count as drawn text. */
function canvasHasInk(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width < 2 || canvas.height < 2) return false;
    let data: Uint8ClampedArray;
    let width: number;
    try {
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        data = image.data;
        width = image.width;
    } catch {
        return false;
    }
    const step = Math.max(8, Math.floor(Math.min(canvas.width, canvas.height) / 40));
    let dark = 0;
    let total = 0;
    for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
            const i = (y * width + x) * 4;
            if (data[i + 3] < 16) continue;
            total += 1;
            if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 250) dark += 1;
        }
    }
    return total > 0 && dark / total > 0.004;
}

/**
 * Scan backwards from `naturalBreakPx` to find the best canvas row to break a
 * PDF page at, so we don't cut through lines of text.
 *
 * Pixels with brightness < 200 are counted as "content" – catches body text
 * (#171717 ≈ 23), blue headers (#1d4ed8 ≈ 108), gray dates (#6b7280 ≈ 116) and
 * section borders (#3b82f6 ≈ 145) while ignoring #e5e7eb decorative borders (≈ 232).
 * Returns the row with zero (or fewest) content pixels within the tolerance window.
 */
function findSmartPageBreak(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    naturalBreakPx: number,
    tolerancePx: number,
): number {
    const scanFrom = Math.max(0, naturalBreakPx - tolerancePx);
    const scanHeight = naturalBreakPx - scanFrom;
    if (scanHeight <= 0) return naturalBreakPx;

    const step = Math.max(1, Math.floor(canvasWidth / 30));
    const { data, width } = ctx.getImageData(0, scanFrom, canvasWidth, scanHeight);

    let bestRow = -1;
    let bestDarkRatio = Infinity;

    for (let row = scanHeight - 1; row >= 0; row--) {
        let darkCount = 0;
        let total = 0;
        for (let col = 0; col < width; col += step) {
            const idx = (row * width + col) * 4;
            if ((data[idx] + data[idx + 1] + data[idx + 2]) / 3 < 200) darkCount++;
            total++;
        }
        const ratio = darkCount / total;

        if (ratio === 0) return scanFrom + row;

        if (ratio < bestDarkRatio) {
            bestDarkRatio = ratio;
            bestRow = row;
        }
    }

    if (bestRow >= 0 && bestDarkRatio < 0.02) return scanFrom + bestRow;

    return naturalBreakPx;
}

/**
 * Multi-page A4 PDF from a DOM element (e.g. PrintableResume root).
 * Uses off-screen clone capture + pixel-based slicing so the last page is not cut off.
 * Page breaks are snapped to the nearest white row to avoid cutting through text.
 */
export async function downloadElementAsMultiPagePdf(
    el: HTMLElement,
    filename: string,
    options?: { marginMm?: number; scale?: number; widthPx?: number },
): Promise<void> {
    const { jsPDF } = await import('jspdf');

    const margin = options?.marginMm ?? 5;
    const scale = options?.scale ?? 2;

    const canvas = await captureElementToCanvas(el, scale, { widthPx: options?.widthPx });
    if (!canvasHasInk(canvas)) {
        throw new Error('blank_capture');
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const pdfImgW = pageW - 2 * margin;

    const pdfImgH = (canvas.height * pdfImgW) / canvas.width;
    const usableMm = pageH - 2 * margin;

    const mmPerPx = pdfImgH / canvas.height;
    const pxPerPage = usableMm / mmPerPx;
    const tolerancePx = Math.round(pxPerPage * 0.20);

    const mainCtx = canvas.getContext('2d');
    if (!mainCtx) throw new Error('canvas2d');

    let srcY = 0;
    const eps = 0.25;
    while (srcY < canvas.height - eps) {
        let slicePx = Math.min(pxPerPage, canvas.height - srcY);

        const isLastSlice = srcY + slicePx >= canvas.height - eps;
        if (!isLastSlice) {
            const naturalBreak = Math.round(srcY + slicePx);
            const smartBreak = findSmartPageBreak(mainCtx, canvas.width, naturalBreak, tolerancePx);
            const adjusted = smartBreak - srcY;
            if (adjusted > 0) slicePx = adjusted;
        }

        const chunkMm = slicePx * mmPerPx;

        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = Math.max(1, Math.ceil(slicePx));
        const ctx = slice.getContext('2d');
        if (!ctx) throw new Error('canvas2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

        const sliceData = slice.toDataURL('image/jpeg', 0.92);
        pdf.addImage(sliceData, 'JPEG', margin, margin, pdfImgW, chunkMm);

        srcY += slicePx;
        if (srcY < canvas.height - eps) pdf.addPage();
    }

    pdf.save(filename);
}

export function sanitizePdfFilename(base: string): string {
    const cleaned = String(base || 'resume')
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
        .slice(0, 120);
    return cleaned || 'resume';
}
