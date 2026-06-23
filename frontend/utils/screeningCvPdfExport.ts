/** Parsed CV → printable HTML (mirrors ResumeViewer parsed tab; inline styles for reliable capture). */

function escapeHtmlPlain(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type ScreeningCvPdfLabels = {
    summary: string;
    work: string;
    education: string;
};

export function buildParsedScreeningCvHtmlForPdf(
    name: string,
    contact: string,
    summaryHtml: string,
    experienceHtmlItems: string[],
    educationHtmlItems: string[] | undefined,
    labels: ScreeningCvPdfLabels,
): string {
    const exp = (experienceHtmlItems || [])
        .map(
            (item) =>
                `<li style="position:relative;padding-right:16px;border-right:2px solid #e5e7eb;margin-bottom:24px;list-style:none;">
      <div style="position:absolute;right:-5px;top:8px;width:10px;height:10px;border-radius:9999px;background:#93c5fd;border:2px solid #fff;"></div>
      <div>${item}</div>
    </li>`,
        )
        .join('');

    const edu =
        educationHtmlItems && educationHtmlItems.length > 0
            ? `<div style="margin-top:24px;">
        <h3 style="font-weight:700;font-size:18px;color:#1d4ed8;margin:0 0 16px 0;border-right:4px solid #3b82f6;padding-right:12px;">${escapeHtmlPlain(labels.education)}</h3>
        <ul style="margin:0;padding:0;">${educationHtmlItems
            .map(
                (item) =>
                    `<li style="position:relative;padding-right:16px;border-right:2px solid #e5e7eb;margin-bottom:12px;list-style:none;">
          <div style="position:absolute;right:-5px;top:8px;width:10px;height:10px;border-radius:9999px;background:#c4b5fd;border:2px solid #fff;"></div>
          <div>${item}</div>
        </li>`,
            )
            .join('')}</ul>
      </div>`
            : '';

    return `
<div dir="rtl" style="font-family:system-ui,-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;color:#171717;padding:24px;width:794px;background:#fff;line-height:1.6;font-size:16px;box-sizing:border-box;">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:16px;">
    <h2 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">${escapeHtmlPlain(name)}</h2>
    <p style="font-size:14px;color:#6b7280;margin:0;">
      <span style="background:#eff6ff;color:#1d4ed8;padding:4px 8px;border-radius:6px;">${escapeHtmlPlain(contact)}</span>
    </p>
  </div>
  <div>
    <h3 style="font-weight:700;font-size:18px;color:#1d4ed8;margin:0 0 8px 0;border-right:4px solid #3b82f6;padding-right:12px;">${escapeHtmlPlain(labels.summary)}</h3>
    <div style="background:rgba(249,250,251,0.9);padding:16px;border-radius:12px;">${summaryHtml || '—'}</div>
  </div>
  <div style="margin-top:24px;">
    <h3 style="font-weight:700;font-size:18px;color:#1d4ed8;margin:0 0 16px 0;border-right:4px solid #3b82f6;padding-right:12px;">${escapeHtmlPlain(labels.work)}</h3>
    <ul style="margin:0;padding:0;">${exp || '<li style="list-style:none;color:#6b7280;">—</li>'}</ul>
  </div>
  ${edu}
</div>`.trim();
}

/** Render off-DOM HTML to JPEG-based multi-page A4 PDF; returns base64 (no data: prefix). */
export async function renderScreeningCvHtmlToPdfBase64(html: string): Promise<string> {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    // --- PDF geometry ----------------------------------------------------------
    const RENDER_WIDTH = 794; // px — must match the host div width below
    const SCALE = 2;          // html2canvas pixel ratio
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();  // 210 mm
    const pageH = pdf.internal.pageSize.getHeight(); // 297 mm
    const margin = 8; // mm
    const pdfImgW = pageW - 2 * margin;  // 194 mm
    const usableMm = pageH - 2 * margin; // 281 mm

    // Page height in DOM pixels (scale-1).  Use floor so the slice boundary
    // always falls *before* any content that starts exactly on the boundary.
    const pageHpx = Math.floor((usableMm / pdfImgW) * RENDER_WIDTH); // ≈ 1149 px

    const rAF = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    // --- Mount host div --------------------------------------------------------
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-12000px;top:0;width:${RENDER_WIDTH}px;background:#ffffff;`;
    host.innerHTML = html;
    document.body.appendChild(host);

    try {
        // Let the browser finish the initial layout pass.
        await rAF();

        // --- Inject spacers before elements that would be cut by a page break ----
        //
        // We iterate in DOM order (top → bottom).  Reading el.offsetTop forces a
        // synchronous reflow each time, so already-inserted spacers are factored
        // into every subsequent position read — no manual offset tracking needed.
        //
        // IMPORTANT: a <div> inside a <ul> is invalid HTML and browsers may
        // refuse to give it height. When the parent is a list, we use a <li>
        // spacer instead.
        const blockEls = Array.from(host.querySelectorAll('li, h2, h3')) as HTMLElement[];

        for (const el of blockEls) {
            const top = el.offsetTop;   // live, reflow-forcing read
            const elH = el.offsetHeight;
            if (elH <= 0 || elH >= pageHpx) continue; // skip invisible / page-tall

            // Page boundary that this element's START page ends at.
            const startPage   = Math.floor(top / pageHpx);
            const pageEnd     = (startPage + 1) * pageHpx; // next boundary in px
            const bottom      = top + elH;

            // Push to next page if:
            //   • element straddles the boundary (bottom > pageEnd), OR
            //   • element ends exactly AT the boundary (bottom === pageEnd) —
            //     that lands its last canvas row at the very edge of the slice,
            //     which gets clipped visually (as seen in debug: H3 bottom=1150=pageEnd).
            if (bottom >= pageEnd) {
                const spacerH = Math.ceil(pageEnd - top); // height of whitespace to insert
                if (spacerH > 0) {
                    const parentTag = (el.parentNode as HTMLElement | null)?.tagName ?? '';
                    const spacerTag = (parentTag === 'UL' || parentTag === 'OL') ? 'li' : 'div';
                    const spacer = document.createElement(spacerTag);
                    spacer.style.cssText =
                        `height:${spacerH}px;padding:0;margin:0;list-style:none;border:none;background:#fff;`;
                    el.parentNode!.insertBefore(spacer, el);
                }
            }
        }

        // Give the browser one more layout pass so html2canvas sees the spacers.
        await rAF();

        // --- Render adjusted DOM to a single canvas ----------------------------
        const canvas = await html2canvas(host, {
            scale: SCALE,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: host.scrollWidth,
            windowHeight: host.scrollHeight,
        });

        // --- Slice canvas at exact page boundaries (integer arithmetic) ---------
        const sliceHpx = pageHpx * SCALE;                       // canvas px per page
        const mmPerCanvasPx = pdfImgW / (RENDER_WIDTH * SCALE); // mm per canvas pixel

        let srcY = 0;
        const eps = 0.5;

        while (srcY < canvas.height - eps) {
            const slicePx = Math.min(sliceHpx, canvas.height - srcY);
            const chunkMm = slicePx * mmPerCanvasPx;

            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = Math.max(1, Math.round(slicePx));
            const ctx = slice.getContext('2d');
            if (!ctx) throw new Error('canvas2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, slice.width, slice.height);
            ctx.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);

            pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pdfImgW, chunkMm);

            srcY += slicePx;
            if (srcY < canvas.height - eps) pdf.addPage();
        }

        const out = pdf.output('datauristring') as string;
        const i = out.indexOf(',');
        return i >= 0 ? out.slice(i + 1) : out;
    } finally {
        document.body.removeChild(host);
    }
}
