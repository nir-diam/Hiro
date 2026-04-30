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
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'fixed';
    host.style.left = '-12000px';
    host.style.top = '0';
    host.style.width = '794px';
    host.style.background = '#ffffff';
    host.innerHTML = html;
    document.body.appendChild(host);

    try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        const canvas = await html2canvas(host, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: host.scrollWidth,
            windowHeight: host.scrollHeight,
        });

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 8;
        const pdfImgW = pageW - 2 * margin;
        const pdfImgH = (canvas.height * pdfImgW) / canvas.width;

        const usableMm = pageH - 2 * margin;
        let yMm = 0;
        while (yMm < pdfImgH - 0.05) {
            const chunkMm = Math.min(usableMm, pdfImgH - yMm);
            const yPx = (yMm / pdfImgH) * canvas.height;
            const hPx = (chunkMm / pdfImgH) * canvas.height;

            const slice = document.createElement('canvas');
            slice.width = canvas.width;
            slice.height = Math.max(1, Math.ceil(hPx));
            const ctx = slice.getContext('2d');
            if (!ctx) throw new Error('canvas2d');
            ctx.drawImage(canvas, 0, yPx, canvas.width, hPx, 0, 0, canvas.width, hPx);

            const sliceData = slice.toDataURL('image/jpeg', 0.92);
            pdf.addImage(sliceData, 'JPEG', margin, margin, pdfImgW, chunkMm);
            yMm += chunkMm;
            if (yMm < pdfImgH - 0.05) pdf.addPage();
        }

        const out = pdf.output('datauristring') as string;
        const i = out.indexOf(',');
        return i >= 0 ? out.slice(i + 1) : out;
    } finally {
        document.body.removeChild(host);
    }
}
