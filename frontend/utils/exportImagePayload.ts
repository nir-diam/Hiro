export type ExportImagePayload = {
    data: Uint8Array;
    type: 'png' | 'jpg' | 'gif' | 'bmp';
    width: number;
    height: number;
};

export const EXPORT_LOGO_MAX_WIDTH_PX = 200;
export const EXPORT_LOGO_MAX_HEIGHT_PX = 72;
export const EXPORT_LOGO_MAX_WIDTH_MM = 42;
export const EXPORT_LOGO_TOP_MM = 14;
export const EXPORT_LOGO_LEFT_MM = 14;

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

function measureImageFromUrl(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            resolve(scaleLogoDimensions(img.naturalWidth, img.naturalHeight));
        };
        img.onerror = () => reject(new Error('logo_measure_failed'));
        img.src = url;
    });
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
): Promise<ExportImagePayload> {
    let width = EXPORT_LOGO_MAX_WIDTH_PX;
    let height = EXPORT_LOGO_MAX_HEIGHT_PX;
    try {
        const blobUrl = URL.createObjectURL(new Blob([data], { type: contentType || undefined }));
        try {
            ({ width, height } = await measureImageFromUrl(blobUrl));
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

/** Load logged-in tenant client logo via authenticated API (works with private S3 URLs). */
export async function fetchLoggedInClientLogoForExport(): Promise<ExportImagePayload | null> {
    try {
        const { authHeaders } = await import('./authHeaders');
        const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
        const res = await fetch(`${apiBase}/api/clients/me/export-logo`, {
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
        return payloadFromBytes(data, type, payload.contentType);
    } catch {
        return null;
    }
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

export function exportLogoHeightMm(logo: ExportImagePayload): number {
    const drawWmm = EXPORT_LOGO_MAX_WIDTH_MM;
    return Math.max(8, (logo.height / Math.max(logo.width, 1)) * drawWmm);
}

export function jsPdfImageFormat(logo: ExportImagePayload): 'PNG' | 'JPEG' {
    return logo.type === 'jpg' ? 'JPEG' : 'PNG';
}
