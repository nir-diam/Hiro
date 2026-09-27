export type ExportImagePayload = {
    data: Uint8Array;
    type: 'png' | 'jpg' | 'gif' | 'bmp';
    width: number;
    height: number;
};

export const EXPORT_LOGO_MAX_WIDTH_PX = 200;
export const EXPORT_LOGO_MAX_HEIGHT_PX = 72;
/** Parsed CV PDF title block — 40% larger than default export logo. */
export const PDF_PARSED_CV_LOGO_SCALE = 1.4;

export function scaleLogoPayload(logo: ExportImagePayload, factor: number): ExportImagePayload {
    const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
    return {
        ...logo,
        width: Math.max(1, Math.round(logo.width * f)),
        height: Math.max(1, Math.round(logo.height * f)),
    };
}
/** Larger logo target for Word exports (header). */
export const DOCX_LOGO_MAX_WIDTH_PX = 300;
export const DOCX_LOGO_MAX_HEIGHT_PX = 108;
/** Usable content width in proposal PDF shell (794px page − 2×24px padding). */
export const PROPOSAL_TEMPLATE_CONTENT_WIDTH_PX = 746;

export function scaleLogoForDocx(logo: ExportImagePayload): { width: number; height: number } {
    const scale = Math.min(
        DOCX_LOGO_MAX_WIDTH_PX / Math.max(logo.width, 1),
        DOCX_LOGO_MAX_HEIGHT_PX / Math.max(logo.height, 1),
    );
    return {
        width: Math.max(1, Math.round(logo.width * scale)),
        height: Math.max(1, Math.round(logo.height * scale)),
    };
}

/**
 * Match ProposalTemplateTinyMceEditor: img { max-width: 100%; height: auto; }
 * Never upscale — only shrink when wider than the template content area.
 */
export function scaleLogoForProposalTemplate(
    logo: ExportImagePayload,
    contentWidthPx: number = PROPOSAL_TEMPLATE_CONTENT_WIDTH_PX,
): { width: number; height: number } {
    const w = Math.max(1, logo.width);
    const h = Math.max(1, logo.height);
    const maxW = Math.max(1, contentWidthPx);
    const scale = Math.min(1, maxW / w);
    return {
        width: Math.max(1, Math.round(w * scale)),
        height: Math.max(1, Math.round(h * scale)),
    };
}

/** @deprecated Use scaleLogoForProposalTemplate */
export function scaleLogoForProposalPdf(logo: ExportImagePayload): { width: number; height: number } {
    return scaleLogoForProposalTemplate(logo);
}

export function docxLogoEmuDimensions(logo: ExportImagePayload): { widthEmu: number; heightEmu: number } {
    const scaled = scaleLogoForDocx(logo);
    return {
        widthEmu: Math.round((scaled.width / 96) * 914400),
        heightEmu: Math.round((scaled.height / 96) * 914400),
    };
}
export const EXPORT_LOGO_MAX_WIDTH_MM = 42;
export const EXPORT_LOGO_TOP_MM = 14;
export const EXPORT_LOGO_LEFT_MM = 14;
export const EXPORT_LOGO_RIGHT_MM = 14;

function detectImageTypeFromResponse(
    url: string,
    contentType: string,
    fallback?: string,
): ExportImagePayload['type'] {
    const fromServer = String(fallback ?? '').trim().toLowerCase();
    if (fromServer === 'jpg' || fromServer === 'jpeg') return 'jpg';
    if (fromServer === 'gif') return 'gif';
    if (fromServer === 'bmp') return 'bmp';
    if (fromServer === 'png') return 'png';
    const ct = contentType.toLowerCase();
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
    if (ct.includes('gif')) return 'gif';
    if (ct.includes('bmp')) return 'bmp';
    const lower = url.toLowerCase();
    if (/\.jpe?g(\?|$)/.test(lower)) return 'jpg';
    if (/\.gif(\?|$)/.test(lower)) return 'gif';
    if (/\.bmp(\?|$)/.test(lower)) return 'bmp';
    return 'png';
}

function scaleLogoDimensions(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
    if (!naturalWidth || !naturalHeight) {
        return { width: EXPORT_LOGO_MAX_WIDTH_PX, height: EXPORT_LOGO_MAX_HEIGHT_PX };
    }
    const scale = Math.min(
        EXPORT_LOGO_MAX_WIDTH_PX / naturalWidth,
        EXPORT_LOGO_MAX_HEIGHT_PX / naturalHeight,
        1,
    );
    return {
        width: Math.max(1, Math.round(naturalWidth * scale)),
        height: Math.max(1, Math.round(naturalHeight * scale)),
    };
}

function measureNaturalImageFromUrl(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            resolve({
                width: Math.max(1, img.naturalWidth),
                height: Math.max(1, img.naturalHeight),
            });
        };
        img.onerror = () => reject(new Error('logo_measure_failed'));
        img.src = url;
    });
}

function measureImageFromUrl(url: string): Promise<{ width: number; height: number }> {
    return measureNaturalImageFromUrl(url).then(({ width, height }) =>
        scaleLogoDimensions(width, height),
    );
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

async function payloadFromBytes(
    data: Uint8Array,
    type: ExportImagePayload['type'],
    contentType?: string,
    options?: { capDimensions?: boolean },
): Promise<ExportImagePayload> {
    const capDimensions = options?.capDimensions !== false;
    let width = EXPORT_LOGO_MAX_WIDTH_PX;
    let height = EXPORT_LOGO_MAX_HEIGHT_PX;
    try {
        const blobUrl = URL.createObjectURL(new Blob([data], { type: contentType || undefined }));
        try {
            if (capDimensions) {
                ({ width, height } = await measureImageFromUrl(blobUrl));
            } else {
                ({ width, height } = await measureNaturalImageFromUrl(blobUrl));
            }
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    } catch {
        ({ width, height } = scaleLogoDimensions(EXPORT_LOGO_MAX_WIDTH_PX, EXPORT_LOGO_MAX_HEIGHT_PX));
    }
    return { data, type, width, height };
}

/** Fetch a remote logo and prepare dimensions + bytes for PDF/DOCX export. */
export async function fetchRemoteImageForExport(url: string): Promise<ExportImagePayload | null> {
    const trimmed = String(url ?? '').trim();
    if (!trimmed) return null;

    try {
        const res = await fetch(trimmed, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) return null;
        const data = new Uint8Array(await res.arrayBuffer());
        if (!data.length) return null;
        const type = detectImageTypeFromResponse(trimmed, res.headers.get('content-type') || '');
        return payloadFromBytes(data, type, res.headers.get('content-type') || undefined);
    } catch {
        return null;
    }
}

async function fetchExportLogoFromApi(
    path: string,
    options?: { capDimensions?: boolean },
): Promise<ExportImagePayload | null> {
    try {
        const { authHeaders } = await import('./authHeaders');
        const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
        const res = await fetch(`${apiBase}${path}`, {
            headers: authHeaders(),
            credentials: 'include',
        });
        if (!res.ok) return null;
        const payload = (await res.json()) as {
            data?: string;
            type?: ExportImagePayload['type'];
            contentType?: string;
            logoUrl?: string;
        };
        const base64 = String(payload?.data ?? '').trim();
        if (!base64) return null;
        const data = base64ToUint8Array(base64);
        const type = detectImageTypeFromResponse(
            String(payload.logoUrl ?? ''),
            String(payload.contentType ?? ''),
            String(payload.type ?? ''),
        );
        return payloadFromBytes(data, type, payload.contentType, options);
    } catch {
        return null;
    }
}

/** Load a specific tenant client logo (SendMessageModal / proposals). Falls back to logged-in tenant. */
export async function fetchClientLogoForExport(clientId?: string | null): Promise<ExportImagePayload | null> {
    const cid = String(clientId || '').trim();
    if (cid) {
        const scoped = await fetchExportLogoFromApi(`/api/clients/${encodeURIComponent(cid)}/export-logo`);
        if (scoped) return scoped;
    }
    return fetchLoggedInClientLogoForExport();
}

/** Full-resolution logo dimensions for proposal PDF (html2canvas needs natural pixel size). */
export async function fetchClientLogoForProposalExport(
    clientId?: string | null,
): Promise<ExportImagePayload | null> {
    const opts = { capDimensions: false as const };
    const cid = String(clientId || '').trim();
    if (cid) {
        const scoped = await fetchExportLogoFromApi(
            `/api/clients/${encodeURIComponent(cid)}/export-logo`,
            opts,
        );
        if (scoped) return scoped;
    }
    return fetchExportLogoFromApi('/api/clients/me/export-logo', opts);
}

/** Load logged-in tenant client logo via authenticated API (works with private S3 URLs). */
export async function fetchLoggedInClientLogoForExport(): Promise<ExportImagePayload | null> {
    return fetchExportLogoFromApi('/api/clients/me/export-logo');
}

export function exportImageToDataUrl(image: ExportImagePayload): string {
    let binary = '';
    for (let i = 0; i < image.data.length; i += 1) {
        binary += String.fromCharCode(image.data[i]!);
    }
    const mime =
        image.type === 'jpg'
            ? 'image/jpeg'
            : image.type === 'gif'
              ? 'image/gif'
              : image.type === 'bmp'
                ? 'image/bmp'
                : 'image/png';
    return `data:${mime};base64,${btoa(binary)}`;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('logo_load_failed'));
        img.src = src;
    });
}

function isLogoBackgroundPixel(r: number, g: number, b: number, a: number): boolean {
    if (a < 48) return true;
    return r >= 228 && g >= 228 && b >= 228;
}

function cropCanvasToContent(
    source: HTMLCanvasElement,
): { dataUrl: string; width: number; height: number } | null {
    const ctx = source.getContext('2d');
    if (!ctx) return null;
    const { data, width, height } = ctx.getImageData(0, 0, source.width, source.height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4;
            if (!isLogoBackgroundPixel(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!)) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
    }
    if (maxX < minX || maxY < minY) return null;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW >= width && cropH >= height) return null;

    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    outCtx.drawImage(source, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return { dataUrl: out.toDataURL('image/png'), width: cropW, height: cropH };
}

/** Crop a loaded <img> to its visible content (for html2canvas — avoids letterbox gaps). */
export function cropImageElementToContent(
    img: HTMLImageElement,
): { dataUrl: string; width: number; height: number } | null {
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return cropCanvasToContent(canvas);
}

function dataUrlToExportImagePayload(dataUrl: string, width: number, height: number): ExportImagePayload {
    const comma = dataUrl.indexOf(',');
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        data[i] = binary.charCodeAt(i);
    }
    return { data, type: 'png', width, height };
}

/** Crop transparent / white padding so html2canvas doesn't reserve empty space below the logo. */
export async function trimLogoForProposalPdf(logo: ExportImagePayload): Promise<ExportImagePayload> {
    if (typeof document === 'undefined') return logo;
    try {
        const img = await loadImageElement(exportImageToDataUrl(logo));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, img.naturalWidth);
        canvas.height = Math.max(1, img.naturalHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) return logo;
        ctx.drawImage(img, 0, 0);
        const cropped = cropCanvasToContent(canvas);
        if (!cropped) return logo;
        return dataUrlToExportImagePayload(cropped.dataUrl, cropped.width, cropped.height);
    } catch {
        return logo;
    }
}

export function exportLogoHeightMm(logo: ExportImagePayload): number {
    const drawWmm = EXPORT_LOGO_MAX_WIDTH_MM;
    return Math.max(8, (logo.height / Math.max(logo.width, 1)) * drawWmm);
}

export function jsPdfImageFormat(logo: ExportImagePayload): 'PNG' | 'JPEG' {
    return logo.type === 'jpg' ? 'JPEG' : 'PNG';
}
