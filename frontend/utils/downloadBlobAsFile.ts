/** Save or share a file blob; anchor download often fails on iOS/Android. */
export async function downloadBlobAsFile(
    blob: Blob,
    filename: string,
    mimeType?: string,
): Promise<void> {
    const type = mimeType ?? (blob.type || 'application/octet-stream');
    const file = new File([blob], filename, { type });

    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        try {
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
                return;
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
        }
    }

    const url = URL.createObjectURL(file);
    const isIos =
        /iPad|iPhone|iPod/i.test(navigator.userAgent) &&
        !(window as Window & { MSStream?: unknown }).MSStream;

    if (isIos) {
        const opened = window.open(url, '_blank');
        if (!opened) {
            window.location.assign(url);
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
