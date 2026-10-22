/** Detect stored parsed CV text that includes rich HTML (colors, fonts, etc.). */
export function isRichHtmlContent(raw: string): boolean {
    if (!raw || typeof raw !== 'string') return false;
    return /<\s*[a-z][^>]*>/i.test(raw.trim());
}

function escapeHtmlText(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * When an HTML placeholder is empty, `\n\n\n\n` + `\n\n\n\n` around it becomes one gap
 * (same as the template textarea shows — not double the blank lines).
 */
/** Empty HTML placeholders often leave `\n\n\n\n` on both sides — merge to a single gap. */
export function collapseAdjacentBlankBlocks(text: string): string {
    let s = String(text || '');
    let prev = '';
    while (prev !== s) {
        prev = s;
        s = s.replace(/(?:\n{4}){2,}/g, '\n\n\n\n');
    }
    return s;
}

function htmlBlockIsEmpty(block: string): boolean {
    const plain = block
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;|\u00a0/g, ' ')
        .trim();
    return !plain;
}

const HTML_BLOCK_RE =
    /(<table[\s\S]*?<\/table>|<p[\s\S]*?<\/p>|<div[\s\S]*?<\/div>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)/gi;

/** Template blank lines around `{job_description}` should not become empty lines on both sides of the HTML block. */
function normalizeGapsAroundNonemptyHtmlBlocks(raw: string): string {
    return String(raw || '').replace(
        /(\n{2,})\s*(<table[\s\S]*?<\/table>|<p[\s\S]*?<\/p>|<div[\s\S]*?<\/div>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>)\s*(\n{2,})/gi,
        (_, a, block, b) => {
            if (htmlBlockIsEmpty(block)) return `${a}${block}${b}`;
            return `\n\n${block}\n\n`;
        },
    );
}

/** Placeholders like `{job_description}` sometimes expand to empty `<p><br></p>` — drop them. */
export function stripInsignificantHtmlBlocks(raw: string): string {
    let s = String(raw || '');
    HTML_BLOCK_RE.lastIndex = 0;
    s = s.replace(HTML_BLOCK_RE, (block) => (htmlBlockIsEmpty(block) ? '' : block));
    s = collapseAdjacentBlankBlocks(s);
    s = normalizeGapsAroundNonemptyHtmlBlocks(s);
    return collapseAdjacentBlankBlocks(s);
}

function normalizeTemplateNewlines(raw: string): string {
    return String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Plain template body → email HTML.
 * `\n\n` = new paragraph; each extra `\n` beyond that = one visible blank line (`<p><br></p>`).
 */
export function plainTextToEmailHtml(raw: string): string {
    const normalized = collapseAdjacentBlankBlocks(normalizeTemplateNewlines(raw));
    if (!normalized.trim()) return '';

    const pieces = normalized.split(/(\n{2,})/);
    const out: string[] = [];
    for (const piece of pieces) {
        if (!piece) continue;
        if (/^\n{2,}$/.test(piece)) {
            const extraBlankLines = piece.length - 2;
            for (let i = 0; i < extraBlankLines; i += 1) out.push('<p><br></p>');
            continue;
        }
        const inner = escapeHtmlText(piece).replace(/\n/g, '<br />');
        out.push(`<p>${inner || '<br>'}</p>`);
    }
    return out.join('');
}

/**
 * Mostly plain templates with HTML placeholders (e.g. `{job_description}`) — convert only
 * text runs between block elements so newlines are not counted twice around tags.
 */
export function mixedTextAndHtmlToEmailEditorHtml(raw: string): string {
    const normalized = stripInsignificantHtmlBlocks(normalizeTemplateNewlines(raw));
    if (!normalized.trim()) return '';
    if (!isRichHtmlContent(normalized)) return plainTextToEmailHtml(normalized);

    const out: string[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    HTML_BLOCK_RE.lastIndex = 0;
    while ((match = HTML_BLOCK_RE.exec(normalized)) !== null) {
        if (match.index > last) {
            out.push(plainTextToEmailHtml(normalized.slice(last, match.index)));
        }
        out.push(match[0]);
        last = match.index + match[0].length;
    }
    if (last < normalized.length) {
        out.push(plainTextToEmailHtml(normalized.slice(last)));
    }
    return out.length ? out.join('') : plainTextToEmailHtml(normalized);
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
