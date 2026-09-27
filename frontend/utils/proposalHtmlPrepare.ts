/** Styles + DOM fixes so proposal HTML renders correctly in email and PDF (html2canvas). */

import {
    cropImageElementToContent,
    exportImageToDataUrl,
    scaleLogoForProposalTemplate,
    type ExportImagePayload,
} from './exportImagePayload';

export type ProposalLogoInput = ExportImagePayload | string | null | undefined;

/** Matches ProposalTemplateTinyMceEditor CENTERED_LOGO_TABLE spacing (email / inline). */
const LOGO_TABLE_STYLE = 'width:100%;border-collapse:collapse;border:none;margin:0 auto 16px;';
const LOGO_CELL_STYLE = 'border:none;text-align:center;padding:12px 0;width:100%;line-height:0;font-size:0;';
/** PDF — flush logo against content (template table padding removed for html2canvas). */
const PDF_LOGO_TABLE_STYLE = 'width:100%;border-collapse:collapse;border:none;margin:0 auto 0;';
const PDF_LOGO_CELL_STYLE = 'border:none;text-align:center;padding:0;width:100%;line-height:0;font-size:0;';
/** Pull body text up under logo — html2canvas reserves phantom space below block imgs. */
export const PDF_LOGO_BODY_OVERLAP_PX = 40;
/** Match ProposalTemplateTinyMceEditor content_style so PDF looks like the editor preview. */
const PDF_BODY_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
const PDF_BODY_FONT_SIZE_PX = 14;
const PDF_BODY_LINE_HEIGHT = 1.6;
const PDF_BODY_COLOR = '#111827';
const PDF_BODY_PADDING = '12px 16px';
const PDF_LOGO_WRAPPER_STYLE =
    `text-align:center;margin:0 0 -${PDF_LOGO_BODY_OVERLAP_PX}px;padding:0;line-height:0;font-size:0;display:block;height:auto;overflow:hidden;`;
const PDF_LOGO_WRAPPER_CLASS = 'hiro-proposal-logo';

type ResolvedProposalLogo = {
    dataUrl: string;
    width: number;
    height: number;
};

type LogoScaleTarget = 'delivery' | 'pdf';

function resolveProposalLogo(logo: ProposalLogoInput, target: LogoScaleTarget = 'delivery'): ResolvedProposalLogo | null {
    if (!logo) return null;
    if (typeof logo === 'string') {
        const dataUrl = String(logo).trim();
        return dataUrl ? { dataUrl, width: 0, height: 0 } : null;
    }
    const dataUrl = exportImageToDataUrl(logo);
    const scaled = scaleLogoForProposalTemplate(logo);
    return {
        dataUrl,
        width: scaled.width,
        height: scaled.height,
    };
}

function buildProposalLogoImgStyle(width: number, height: number, target: LogoScaleTarget = 'delivery'): string {
    if (width > 0 && height > 0) {
        if (target === 'pdf') {
            return `display:block;width:${width}px;height:${height}px;max-width:100%;margin:0 auto;padding:0;vertical-align:top;object-fit:fill;`;
        }
        return `display:block;width:${width}px;height:${height}px;max-width:${width}px;max-height:${height}px;margin:0 auto;object-fit:contain;vertical-align:top;`;
    }
    return 'display:block;max-height:96px;width:auto;height:auto;margin:0 auto;object-fit:contain;';
}

function buildProposalLogoImgTagFromResolved(
    resolved: ResolvedProposalLogo,
    target: LogoScaleTarget = 'delivery',
): string {
    const safe = resolved.dataUrl.replace(/"/g, '&quot;');
    const style = buildProposalLogoImgStyle(resolved.width, resolved.height, target);
    const dimAttrs =
        resolved.width > 0
            ? ` width="${resolved.width}" height="${resolved.height}"`
            : '';
    return `<img src="${safe}" alt="לוגו"${dimAttrs} style="${style}" />`;
}

export function buildProposalLogoImgTag(logo: ProposalLogoInput, target: LogoScaleTarget = 'delivery'): string {
    const resolved = resolveProposalLogo(logo, target);
    if (!resolved) return '';
    return buildProposalLogoImgTagFromResolved(resolved, target);
}

function applyLogoImgStyle(
    img: HTMLImageElement,
    resolved: ResolvedProposalLogo | null,
    target: LogoScaleTarget = 'delivery',
): void {
    if (!resolved) return;
    img.setAttribute('style', buildProposalLogoImgStyle(resolved.width, resolved.height, target));
    if (resolved.width > 0) {
        img.setAttribute('width', String(resolved.width));
        if (resolved.height > 0) {
            img.setAttribute('height', String(resolved.height));
        }
    }
}

function isLogoImg(node: Element): node is HTMLImageElement {
    const alt = (node.getAttribute('alt') || '').toLowerCase();
    return node.tagName === 'IMG' && (alt === 'לוגו' || alt === 'logo');
}

function findLogoBlock(host: HTMLElement): Element | null {
    for (const table of host.querySelectorAll('table')) {
        if (table.querySelector('img[alt="לוגו"], img[alt="logo"]')) return table;
    }
    const img = host.querySelector('img[alt="לוגו"], img[alt="logo"]');
    if (!img) return null;
    const parent = img.parentElement;
    if (parent && parent !== host && parent.tagName === 'DIV' && parent.children.length === 1) {
        return parent;
    }
    return img;
}

function isEmptyLayoutBlock(el: HTMLElement): boolean {
    const text = (el.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) return false;
    if (el.tagName === 'BR') return true;
    if (!el.children.length) return true;
    if (el.children.length === 1 && el.querySelector(':scope > br')) return true;
    return false;
}

function stripVerticalSpacingFromStyle(style: string): string {
    return style
        .replace(/margin-top\s*:\s[^;]+;?/gi, '')
        .replace(/margin-bottom\s*:\s[^;]+;?/gi, '')
        .replace(/padding-top\s*:\s[^;]+;?/gi, '')
        .replace(/padding-bottom\s*:\s[^;]+;?/gi, '')
        .replace(/margin\s*:\s[^;]+;?/gi, '')
        .trim();
}

/** TinyMCE toolbar wraps `{company_logo}` in `<p>` inside the logo table cell. */
function unwrapLogoParagraphsInTables(host: HTMLElement): void {
    host.querySelectorAll('table td p, table th p').forEach((p) => {
        const logoImgs = Array.from(p.querySelectorAll('img[alt="לוגו"], img[alt="logo"]'));
        if (!logoImgs.length) return;
        const meaningful = Array.from(p.childNodes).filter(
            (node) => !(node.nodeType === Node.TEXT_NODE && !(node.textContent || '').replace(/\u00a0/g, ' ').trim()),
        );
        if (meaningful.length === 1 && meaningful[0]?.nodeType === Node.ELEMENT_NODE && isLogoImg(meaningful[0] as Element)) {
            p.replaceWith(meaningful[0]!);
        } else if (logoImgs.length === 1 && meaningful.length === 1) {
            p.replaceWith(logoImgs[0]!);
        }
    });
}

/** Replace logo table with a flat div — html2canvas adds phantom height inside tables. */
function flattenLogoTableForPdf(host: HTMLElement, resolved: ResolvedProposalLogo | null): void {
    unwrapLogoParagraphsInTables(host);
    for (const table of Array.from(host.querySelectorAll('table'))) {
        const logoImg = table.querySelector('img[alt="לוגו"], img[alt="logo"]') as HTMLImageElement | null;
        if (!logoImg) continue;
        const rows = table.querySelectorAll('tr');
        const cells = table.querySelectorAll('td');
        if (rows.length > 1 || cells.length > 1) continue;

        const div = document.createElement('div');
        div.className = PDF_LOGO_WRAPPER_CLASS;
        div.setAttribute('style', PDF_LOGO_WRAPPER_STYLE);
        logoImg.remove();
        applyLogoImgStyle(logoImg, resolved, 'pdf');
        div.appendChild(logoImg);
        table.replaceWith(div);
    }
}

function stampPdfLogoWrapper(el: HTMLElement): void {
    el.className = PDF_LOGO_WRAPPER_CLASS;
    el.setAttribute('style', PDF_LOGO_WRAPPER_STYLE);
}

function flushElementTopSpacing(el: HTMLElement): void {
    const cleaned = stripVerticalSpacingFromStyle(el.getAttribute('style') || '');
    const tag = el.tagName;
    const flushTop = /^H[1-6]$/.test(tag)
        ? `${cleaned};margin:0 0 0.5em 0;padding-top:0;`.replace(/^;/, '')
        : `${cleaned};margin-top:0;padding-top:0;`.replace(/^;/, '');
    el.setAttribute('style', flushTop);
}

function applyExplicitPdfLogoBox(
    img: HTMLImageElement,
    logoBlock: HTMLElement,
    width: number,
    height: number,
): void {
    img.style.display = 'block';
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    img.style.margin = '0 auto';
    img.style.padding = '0';
    img.style.verticalAlign = 'top';
    img.style.objectFit = 'fill';
    img.setAttribute('width', String(width));
    img.setAttribute('height', String(height));
    img.setAttribute('style', buildProposalLogoImgStyle(width, height, 'pdf'));

    logoBlock.style.height = `${height}px`;
    logoBlock.style.maxHeight = `${height}px`;
    logoBlock.style.overflow = 'hidden';
    logoBlock.style.margin = `0 0 -${PDF_LOGO_BODY_OVERLAP_PX}px`;
    logoBlock.style.padding = '0';
    logoBlock.style.lineHeight = '0';
    logoBlock.style.fontSize = '0';
}

/** Remove spacer blocks and flush the first content element against the logo. */
function collapseGapAfterLogo(host: HTMLElement): void {
    const logoBlock = findLogoBlock(host);
    if (!logoBlock) return;

    if (logoBlock instanceof HTMLElement) {
        stampPdfLogoWrapper(logoBlock);
    }

    let node: ChildNode | null = logoBlock.nextSibling;
    while (node) {
        if (node.nodeType === Node.TEXT_NODE && !(node.textContent || '').replace(/\u00a0/g, ' ').trim()) {
            const next = node.nextSibling;
            node.parentNode?.removeChild(node);
            node = next;
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) break;
        const el = node as HTMLElement;
        if (
            (el.tagName === 'P' ||
                el.tagName === 'DIV' ||
                el.tagName === 'TABLE' ||
                el.tagName === 'HR') &&
            isEmptyLayoutBlock(el)
        ) {
            const next = node.nextSibling;
            el.remove();
            node = next;
            continue;
        }
        flushElementTopSpacing(el);
        if (el.tagName === 'DIV' || el.tagName === 'TD') {
            const inner = Array.from(el.children).find(
                (child) => child instanceof HTMLElement && !isEmptyLayoutBlock(child),
            ) as HTMLElement | undefined;
            if (inner) flushElementTopSpacing(inner);
        }
        break;
    }
}

/**
 * After images load in the live capture host — clip logo wrapper to painted height
 * and remove phantom gap html2canvas leaves under block images.
 */
export function tightenProposalLogoLayoutForCapture(root: HTMLElement): void {
    collapseGapAfterLogo(root);

    const logoBlock = findLogoBlock(root);
    if (!(logoBlock instanceof HTMLElement)) return;

    stampPdfLogoWrapper(logoBlock);

    const img = logoBlock.querySelector('img[alt="לוגו"], img[alt="logo"]') as HTMLImageElement | null;
    if (!img) return;

    const cropped = cropImageElementToContent(img);
    if (cropped) {
        img.src = cropped.dataUrl;
    }

    const naturalW = cropped?.width ?? Math.max(1, img.naturalWidth);
    const naturalH = cropped?.height ?? Math.max(1, img.naturalHeight);
    const scaled = scaleLogoForProposalTemplate({
        data: new Uint8Array(0),
        type: 'png',
        width: naturalW,
        height: naturalH,
    });
    applyExplicitPdfLogoBox(img, logoBlock, scaled.width, scaled.height);

    let afterLogo: ChildNode | null = logoBlock.nextSibling;
    while (afterLogo) {
        if (afterLogo.nodeType === Node.TEXT_NODE && !(afterLogo.textContent || '').replace(/\u00a0/g, ' ').trim()) {
            const next = afterLogo.nextSibling;
            afterLogo.parentNode?.removeChild(afterLogo);
            afterLogo = next;
            continue;
        }
        if (afterLogo.nodeType !== Node.ELEMENT_NODE) break;
        const el = afterLogo as HTMLElement;
        if (isEmptyLayoutBlock(el)) {
            const next = afterLogo.nextSibling;
            el.remove();
            afterLogo = next;
            continue;
        }
        flushElementTopSpacing(el);
        if (el.tagName === 'DIV' || el.tagName === 'TD') {
            const inner = Array.from(el.children).find(
                (child) => child instanceof HTMLElement && !isEmptyLayoutBlock(child),
            ) as HTMLElement | undefined;
            if (inner) flushElementTopSpacing(inner);
        }
        break;
    }
}

/** Remove <p> wrappers around lone logo imgs (string pass — works before DOM normalization). */
function flattenProposalLogoParagraphsInHtml(html: string): string {
    return html.replace(
        /<p\b[^>]*>\s*(<img\b[^>]*\balt=(["'])(?:לוגו|logo)\2[^>]*>)\s*<\/p>/gi,
        '$1',
    );
}

/** Remove <p> wrappers that create extra line-height gap under block logos (html2canvas + email). */
function flattenProposalLogoParagraphs(host: HTMLElement): void {
    host.querySelectorAll('p').forEach((p) => {
        const children = Array.from(p.childNodes).filter(
            (node) => !(node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()),
        );
        const logoImgs = children.filter(
            (node): node is HTMLImageElement => node.nodeType === Node.ELEMENT_NODE && isLogoImg(node as Element),
        );
        if (logoImgs.length === 1 && children.length === 1) {
            p.replaceWith(logoImgs[0]!);
            return;
        }
        if (logoImgs.length > 0) {
            p.setAttribute('style', 'margin:0;line-height:0;font-size:0;text-align:center;');
        }
    });
}

/** Align logo table/cell markup with the TinyMCE toolbar template (no extra gap). */
function normalizeProposalLogoBlocks(
    host: HTMLElement,
    resolved: ResolvedProposalLogo | null,
    target: LogoScaleTarget,
): void {
    flattenProposalLogoParagraphs(host);

    const tableStyle = target === 'pdf' ? PDF_LOGO_TABLE_STYLE : LOGO_TABLE_STYLE;
    const cellStyle = target === 'pdf' ? PDF_LOGO_CELL_STYLE : LOGO_CELL_STYLE;

    if (target === 'pdf') {
        flattenLogoTableForPdf(host, resolved);
    } else {
        host.querySelectorAll('table td').forEach((td) => {
            const cell = td as HTMLTableCellElement;
            const logoImg = cell.querySelector('img[alt="לוגו"], img[alt="logo"]') as HTMLImageElement | null;
            if (!logoImg) return;

            cell.setAttribute('style', cellStyle);
            applyLogoImgStyle(logoImg, resolved, target);

            const table = cell.closest('table');
            if (table) {
                table.setAttribute('style', tableStyle);
            }
        });
    }

    host.querySelectorAll('img[alt="לוגו"], img[alt="logo"]').forEach((img) => {
        applyLogoImgStyle(img as HTMLImageElement, resolved, target);
    });

    host.querySelectorAll('div').forEach((div) => {
        const logoImg = div.querySelector(':scope > img[alt="לוגו"], :scope > img[alt="logo"]');
        if (!logoImg || div.children.length !== 1) return;
        if (target === 'pdf') {
            div.className = PDF_LOGO_WRAPPER_CLASS;
            div.setAttribute('style', PDF_LOGO_WRAPPER_STYLE);
        } else {
            div.setAttribute(
                'style',
                'text-align:center;margin:0 0 16px;padding:0;line-height:0;font-size:0;display:block;height:auto;',
            );
        }
        applyLogoImgStyle(logoImg as HTMLImageElement, resolved, target);
    });

    if (target === 'pdf') {
        collapseGapAfterLogo(host);
    }
}

/** Inject tenant logo into `{company_logo}` placeholders and empty logo slots from the editor toolbar. */
export function injectProposalLogo(html: string, logo: ProposalLogoInput, target: LogoScaleTarget = 'delivery'): string {
    const resolved = resolveProposalLogo(logo, target);
    if (!resolved) return html;

    const imgTag = buildProposalLogoImgTag(logo, target);
    const url = resolved.dataUrl.replace(/"/g, '&quot;');
    let out = String(html ?? '');

    out = out.replace(/\{company_logo\}/gi, imgTag);

    // Toolbar "לוגו ממורכז" inserts img with empty src.
    out = out.replace(
        /<img([^>]*)\ssrc=(["'])\2([^>]*alt=(["'])לוגו\4[^>]*)>/gi,
        `<img$1 src="${url}"$3>`,
    );
    out = out.replace(
        /<img([^>]*)\ssrc=(["'])\2([^>]*alt=(["'])logo\4[^>]*)>/gi,
        `<img$1 src="${url}"$3>`,
    );
    out = out.replace(
        /<img((?![^>]*\ssrc=)[^>]*alt=(["'])לוגו\2[^>]*)>/gi,
        `<img src="${url}"$1>`,
    );
    out = out.replace(
        /<img((?![^>]*\ssrc=)[^>]*alt=(["'])logo\2[^>]*)>/gi,
        `<img src="${url}"$1>`,
    );

    out = flattenProposalLogoParagraphsInHtml(out);

    if (target === 'pdf') {
        // Template toolbar table: margin-bottom 16px + td padding — strip for PDF capture.
        out = out.replace(
            /(<table\b[^>]*\bstyle="[^"]*?)margin:\s*0\s+auto\s+16px/gi,
            '$1margin:0 auto 0',
        );
        out = out.replace(
            /(<table\b[^>]*\bstyle="[^"]*?)margin-bottom\s*:\s*16px/gi,
            '$1margin-bottom:0',
        );
        out = out.replace(
            /(<td\b[^>]*\bstyle="[^"]*?)padding:\s*12px\s+0/gi,
            '$1padding:0',
        );
        out = out.replace(
            /(<td\b[^>]*\bstyle="[^"]*?)padding-top\s*:\s*12px/gi,
            '$1padding-top:0',
        );
        out = out.replace(
            /(<td\b[^>]*\bstyle="[^"]*?)padding-bottom\s*:\s*12px/gi,
            '$1padding-bottom:0',
        );
    }

    return out;
}

const RTL_LIST_STYLE =
    'direction:rtl;text-align:right;margin:0.75em 0;margin-right:0;margin-left:0;padding-left:0;';
const RTL_OL_STYLE = `${RTL_LIST_STYLE}list-style-type:decimal;list-style-position:outside;padding-right:1.75em;`;
const RTL_UL_STYLE = `${RTL_LIST_STYLE}list-style-type:disc;list-style-position:outside;padding-right:1.5em;`;
const RTL_LI_STYLE = 'display:list-item;direction:rtl;text-align:right;margin-bottom:0.35em;';

/** html2canvas + email clients — force RTL markers on the right via outside positioning. */
export function enhanceProposalListsForExport(html: string, logo?: ProposalLogoInput): string {
    if (typeof document === 'undefined') return html;

    const resolved = resolveProposalLogo(logo ?? null, 'delivery');
    const host = document.createElement('div');
    host.innerHTML = html;

    host.querySelectorAll('ol').forEach((ol) => {
        const el = ol as HTMLOListElement;
        el.setAttribute('dir', 'rtl');
        el.setAttribute('style', RTL_OL_STYLE);
    });

    host.querySelectorAll('ul').forEach((ul) => {
        const el = ul as HTMLUListElement;
        el.setAttribute('dir', 'rtl');
        el.setAttribute('style', RTL_UL_STYLE);
    });

    host.querySelectorAll('li').forEach((li) => {
        const el = li as HTMLLIElement;
        el.setAttribute('dir', 'rtl');
        el.setAttribute('style', RTL_LI_STYLE);
    });

    normalizeProposalLogoBlocks(host, resolved, 'delivery');

    return host.innerHTML;
}

/** html2canvas ignores list-style markers — paint numbers/bullets on the right explicitly. */
export function convertProposalListsToManualRtlMarkup(html: string, logo?: ProposalLogoInput): string {
    if (typeof document === 'undefined') return html;

    const resolved = resolveProposalLogo(logo ?? null, 'pdf');
    const host = document.createElement('div');
    host.innerHTML = html;

    const stampMarker = (li: HTMLLIElement, label: string) => {
        li.querySelector(':scope > .hiro-list-marker')?.remove();
        li.setAttribute(
            'style',
            'position:relative;padding-right:2em;text-align:right;direction:rtl;list-style:none;margin:0 0 0.45em 0;',
        );
        li.setAttribute('dir', 'rtl');
        const marker = document.createElement('span');
        marker.className = 'hiro-list-marker';
        marker.setAttribute(
            'style',
            'position:absolute;right:0;top:0;font-weight:600;min-width:1.75em;text-align:right;line-height:1.55;',
        );
        marker.textContent = label;
        li.insertBefore(marker, li.firstChild);
    };

    host.querySelectorAll('ol').forEach((ol) => {
        const el = ol as HTMLOListElement;
        el.setAttribute('dir', 'rtl');
        el.setAttribute('style', 'list-style:none;padding:0;margin:0.75em 0;direction:rtl;text-align:right;');
        const start = Number.parseInt(el.getAttribute('start') || '1', 10);
        const items = Array.from(el.children).filter((node) => node.tagName === 'LI') as HTMLLIElement[];
        items.forEach((li, idx) => stampMarker(li, `${Number.isFinite(start) ? start + idx : idx + 1}.`));
    });

    host.querySelectorAll('ul').forEach((ul) => {
        const el = ul as HTMLUListElement;
        el.setAttribute('style', 'list-style:none;padding:0;margin:0.75em 0;direction:rtl;text-align:right;');
        el.setAttribute('dir', 'rtl');
        const items = Array.from(el.children).filter((node) => node.tagName === 'LI') as HTMLLIElement[];
        items.forEach((li) => stampMarker(li, '•'));
    });

    normalizeProposalLogoBlocks(host, resolved, 'pdf');

    return host.innerHTML;
}

/** Prepend centered logo when template has no logo slot but tenant logo is available. */
export function ensureProposalLogoVisible(html: string, logo: ProposalLogoInput, target: LogoScaleTarget = 'delivery'): string {
    const resolved = resolveProposalLogo(logo, target);
    if (!resolved) return html;
    if (/\{company_logo\}/i.test(html)) return html;

    const wrapStyle =
        target === 'pdf'
            ? PDF_LOGO_WRAPPER_STYLE
            : 'text-align:center;margin:0 0 16px;line-height:0;font-size:0;';
    const wrapClass = target === 'pdf' ? ` class="${PDF_LOGO_WRAPPER_CLASS}"` : '';
    const prepend =
        `<div dir="rtl"${wrapClass} style="${wrapStyle}">${buildProposalLogoImgTag(logo, target)}</div>`;

    if (typeof document === 'undefined') {
        if (/<img[^>]+alt=(["'])(?:לוגו|logo)\1/i.test(html)) return html;
        return prepend + html;
    }

    const host = document.createElement('div');
    host.innerHTML = html;
    if (host.querySelector('img[alt="לוגו"], img[alt="logo"]')) return html;

    return prepend + html;
}

export function prepareProposalHtmlForDelivery(html: string, logo?: ProposalLogoInput): string {
    const withLogo = injectProposalLogo(html, logo, 'delivery');
    return enhanceProposalListsForExport(withLogo, logo);
}

/** PDF attachment path — manual RTL list markers + guaranteed logo for html2canvas capture. */
export function prepareProposalHtmlForPdf(html: string, logo?: ProposalLogoInput): string {
    const withLogo = injectProposalLogo(html, logo, 'pdf');
    const withVisibleLogo = ensureProposalLogoVisible(withLogo, logo, 'pdf');
    return convertProposalListsToManualRtlMarkup(withVisibleLogo, logo);
}

export function wrapProposalEmailBlock(innerHtml: string, title: string): string {
    return (
        `<div style="margin-top:1.25em;padding-top:1em;border-top:1px solid #ddd;">` +
        `<div style="font-weight:700;color:#333;font-size:13px;margin-bottom:0.5em;">${title}</div>` +
        `<div dir="rtl" style="font-family:sans-serif;line-height:1.55;color:#222;">${innerHtml}</div>` +
        `</div>`
    );
}

/**
 * Minimal A4 shell for proposal PDF — mirrors ProposalTemplateTinyMceEditor `content_style`
 * so the PDF renders identically to the editor preview (font, size, color, line-height).
 */
export function wrapProposalPdfDocument(innerHtml: string): string {
    const shellStyle =
        `font-family:${PDF_BODY_FONT_FAMILY};` +
        `font-size:${PDF_BODY_FONT_SIZE_PX}px;` +
        `line-height:${PDF_BODY_LINE_HEIGHT};` +
        `color:${PDF_BODY_COLOR};` +
        `padding:${PDF_BODY_PADDING};` +
        `width:794px;background:#fff;box-sizing:border-box;direction:rtl;text-align:right;`;
    return (
        `<div dir="rtl" class="hiro-proposal-pdf" style="${shellStyle}">` +
        `<style>` +
        // Inherit body font/size/color everywhere so template content matches the editor.
        `.hiro-proposal-pdf, .hiro-proposal-pdf *{font-family:${PDF_BODY_FONT_FAMILY};}` +
        `.hiro-proposal-pdf, .hiro-proposal-pdf p, .hiro-proposal-pdf li, .hiro-proposal-pdf td, .hiro-proposal-pdf th, .hiro-proposal-pdf span, .hiro-proposal-pdf div{color:${PDF_BODY_COLOR};}` +
        // Logo tightening — remove template gap + pull body up under the logo.
        `.hiro-proposal-logo{margin:0 auto -${PDF_LOGO_BODY_OVERLAP_PX}px!important;padding:0!important;line-height:0!important;font-size:0!important;overflow:hidden;}` +
        `.hiro-proposal-logo img{display:block;margin:0 auto!important;padding:0!important;vertical-align:top;}` +
        `.hiro-proposal-logo + h1,.hiro-proposal-logo + h2,.hiro-proposal-logo + h3,.hiro-proposal-logo + h4,.hiro-proposal-logo + h5,.hiro-proposal-logo + h6,.hiro-proposal-logo + p,.hiro-proposal-logo + div,.hiro-proposal-logo + table,.hiro-proposal-logo + ol,.hiro-proposal-logo + ul{margin-top:0!important;padding-top:0!important;}` +
        `.hiro-proposal-logo + * > :first-child{margin-top:0!important;padding-top:0!important;}` +
        `img[alt="לוגו"],img[alt="logo"]{display:block;margin:0 auto;padding:0;vertical-align:top;}` +
        // Match editor body baseline exactly.
        `p{margin:0 0 0.5em 0;line-height:${PDF_BODY_LINE_HEIGHT};font-size:${PDF_BODY_FONT_SIZE_PX}px;}` +
        `li{line-height:${PDF_BODY_LINE_HEIGHT};font-size:${PDF_BODY_FONT_SIZE_PX}px;}` +
        `td,th{line-height:${PDF_BODY_LINE_HEIGHT};font-size:${PDF_BODY_FONT_SIZE_PX}px;}` +
        `h1{font-size:24px;line-height:1.3;margin:0 0 0.4em 0;}` +
        `h2{font-size:20px;line-height:1.3;margin:0 0 0.4em 0;}` +
        `h3{font-size:18px;line-height:1.35;margin:0 0 0.4em 0;}` +
        // RTL list rendering (matches editor + html2canvas fallbacks).
        `ol,ul{direction:rtl;text-align:right;padding-left:0;margin-right:0;}` +
        `ol{list-style-type:decimal;list-style-position:outside;padding-right:1.75em;}` +
        `ul{list-style-type:disc;list-style-position:outside;padding-right:1.5em;}` +
        `li{display:list-item;direction:rtl;text-align:right;}` +
        `img{max-width:100%;height:auto;}` +
        `table{border-collapse:collapse;}` +
        `table.hiro-table-borderless,table.hiro-table-borderless td,table.hiro-table-borderless th{border:none!important;}` +
        `table.hiro-table-bordered,table.hiro-table-bordered td,table.hiro-table-bordered th{border:1px solid #d1d5db;}` +
        `</style>` +
        `${innerHtml}` +
        `</div>`
    );
}
