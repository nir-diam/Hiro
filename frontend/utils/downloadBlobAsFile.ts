/** Save a file blob. Uses anchor download on desktop; mobile fallbacks where needed. */
export async function downloadBlobAsFile(
    blob: Blob,
    filename: string,
    mimeType?: string,
): Promise<void> {
    const type = mimeType ?? (blob.type || 'application/octet-stream');
    const file = new File([blob], filename, { type });

    const isIos =
        /iPad|iPhone|iPod/i.test(navigator.userAgent) &&
        !(window as Window & { MSStream?: unknown }).MSStream;
    const isMobile = isIos || /Android/i.test(navigator.userAgent);

    // Web Share on desktop opens the OS share sheet instead of downloading — mobile only.
    if (isMobile && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
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
