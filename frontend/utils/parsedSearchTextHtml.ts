/** Detect stored parsed CV text that includes rich HTML (colors, fonts, etc.). */
export function isRichHtmlContent(raw: string): boolean {
    if (!raw || typeof raw !== 'string') return false;
    return /<\s*[a-z][^>]*>/i.test(raw.trim());
}

/** Rich editor HTML → plain text for search, export, and tag highlighting. */
export function htmlToPlainText(raw: string): string {
    if (!raw) return '';
    if (!raw.includes('<')) return raw;
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const ALLOWED_TAGS = new Set([
    'P',
    'BR',
    'B',
    'STRONG',
    'I',
    'EM',
    'U',
    'UL',
    'OL',
    'LI',
    'SPAN',
    'FONT',
    'DIV',
    'H2',
    'H3',
]);

const ALLOWED_STYLE_PROPS = new Set(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration']);

function sanitizeStyle(style: string): string {
    const parts = style
        .split(';')
        .map((p) => p.trim())
        .filter(Boolean);
    const safe: string[] = [];
    for (const part of parts) {
        const idx = part.indexOf(':');
        if (idx <= 0) continue;
        const prop = part.slice(0, idx).trim().toLowerCase();
        const value = part.slice(idx + 1).trim();
        if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
        if (/url\s*\(|javascript:|expression\s*\(/i.test(value)) continue;
        safe.push(`${prop}: ${value}`);
    }
    return safe.join('; ');
}

/** Strip unsafe markup while keeping basic rich-text formatting for view mode. */
export function sanitizeRichHtml(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    if (typeof document === 'undefined') return raw;

    const template = document.createElement('template');
    template.innerHTML = raw;

    const cleanNode = (node: Node): Node | null => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.cloneNode(false);
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const el = node as HTMLElement;
        const tag = el.tagName.toUpperCase();
        if (!ALLOWED_TAGS.has(tag)) {
            const frag = document.createDocumentFragment();
            for (const child of Array.from(el.childNodes)) {
                const cleaned = cleanNode(child);
                if (cleaned) frag.appendChild(cleaned);
            }
            return frag;
        }

        const out = document.createElement(tag.toLowerCase());
        if (el.getAttribute('color')) {
            out.setAttribute('color', el.getAttribute('color')!);
        }
        const style = el.getAttribute('style');
        if (style) {
            const safeStyle = sanitizeStyle(style);
            if (safeStyle) out.setAttribute('style', safeStyle);
        }
        for (const child of Array.from(el.childNodes)) {
            const cleaned = cleanNode(child);
            if (!cleaned) continue;
            if (cleaned.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                out.appendChild(cleaned);
            } else {
                out.appendChild(cleaned);
            }
        }
        return out;
    };

    const root = document.createElement('div');
    for (const child of Array.from(template.content.childNodes)) {
        const cleaned = cleanNode(child);
        if (!cleaned) continue;
        root.appendChild(cleaned);
    }
    return root.innerHTML;
}
