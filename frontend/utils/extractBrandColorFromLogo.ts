function isNearGray(r: number, g: number, b: number): boolean {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 18) return true;
    return false;
}

function isIgnoredPixel(r: number, g: number, b: number): boolean {
    if (r > 245 && g > 245 && b > 245) return true;
    if (r < 18 && g < 18 && b < 18) return true;
    if (isNearGray(r, g, b)) return true;
    return false;
}

function rgbToHex(r: number, g: number, b: number): string {
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

/** Dominant non-white/black/gray color from a logo URL (browser canvas). */
export async function extractBrandColorFromLogoUrl(logoUrl: string): Promise<string | null> {
    const src = String(logoUrl || '').trim();
    if (!src) return null;

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const size = 64;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(null);
                    return;
                }
                ctx.drawImage(img, 0, 0, size, size);
                const { data } = ctx.getImageData(0, 0, size, size);
                const buckets = new Map<string, number>();
                for (let i = 0; i < data.length; i += 4) {
                    const a = data[i + 3];
                    if (a < 40) continue;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    if (isIgnoredPixel(r, g, b)) continue;
                    const qr = Math.round(r / 16) * 16;
                    const qg = Math.round(g / 16) * 16;
                    const qb = Math.round(b / 16) * 16;
                    const key = rgbToHex(
                        Math.min(255, qr),
                        Math.min(255, qg),
                        Math.min(255, qb),
                    );
                    buckets.set(key, (buckets.get(key) || 0) + 1);
                }
                let best: string | null = null;
                let bestCount = 0;
                for (const [hex, count] of buckets.entries()) {
                    if (count > bestCount) {
                        best = hex;
                        bestCount = count;
                    }
                }
                resolve(best);
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

export async function extractBrandColorFromLogoFile(file: File): Promise<string | null> {
    const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
    if (!dataUrl) return null;
    return extractBrandColorFromLogoUrl(dataUrl);
}
