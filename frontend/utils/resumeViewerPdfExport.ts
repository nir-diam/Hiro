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
 * Multi-page A4 PDF from a DOM element (e.g. PrintableResume root).
 * Uses off-screen clone capture + pixel-based slicing so the last page is not cut off.
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

    /** Total height of the raster if placed at width pdfImgW (mm). */
    const pdfImgH = (canvas.height * pdfImgW) / canvas.width;

    const usableMm = pageH - 2 * margin;

    /** Vertical mm per source pixel — slice in px first to avoid floating-point gaps at the bottom. */
    const mmPerPx = pdfImgH / canvas.height;
    const pxPerPage = usableMm / mmPerPx;

    let srcY = 0;
    const eps = 0.25;
    while (srcY < canvas.height - eps) {
        const slicePx = Math.min(pxPerPage, canvas.height - srcY);
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
