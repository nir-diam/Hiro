/**
 * Capture a DOM subtree as canvas at full scroll height (avoids clipping inside scroll parents).
 */
async function captureElementToCanvas(el: HTMLElement, scale: number): Promise<HTMLCanvasElement> {
    const html2canvas = (await import('html2canvas')).default;

    const clone = el.cloneNode(true) as HTMLElement;
    const w = Math.max(el.scrollWidth, el.offsetWidth, 1);
    clone.style.boxSizing = 'border-box';
    clone.style.position = 'fixed';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.zIndex = '-1';
    clone.style.pointerEvents = 'none';
    /** Must stay visible for painting — visibility:hidden yields a blank html2canvas raster in common browsers. */
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

    document.body.appendChild(clone);

    try {
        void clone.offsetHeight;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const h = Math.max(clone.scrollHeight, clone.offsetHeight, 1);

        return await html2canvas(clone, {
            scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: w,
            height: h,
            windowWidth: w,
            windowHeight: h,
        });
    } finally {
        clone.remove();
    }
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
    options?: { marginMm?: number; scale?: number },
): Promise<void> {
    const { jsPDF } = await import('jspdf');

    const margin = options?.marginMm ?? 5;
    const scale = options?.scale ?? 2;

    const canvas = await captureElementToCanvas(el, scale);

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
