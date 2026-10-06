import { htmlToPlainText, isRichHtmlContent } from './parsedSearchTextHtml';

export type EmailSignaturePrefs = {
    html?: string;
    logoUrl?: string;
};

export function parseEmailSignature(uiPreferences?: Record<string, unknown> | null): EmailSignaturePrefs {
    const raw = uiPreferences?.emailSignature;
    if (!raw || typeof raw !== 'object') return {};
    const row = raw as Record<string, unknown>;
    const html = String(row.html ?? '').trim();
    const logoUrl = String(row.logoUrl ?? '').trim();
    return {
        ...(html ? { html } : {}),
        ...(logoUrl ? { logoUrl } : {}),
    };
}

function escapeHtmlAttr(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Prefer RTL when Hebrew dominates; otherwise LTR (English-heavy body). */
export function detectEmailTextDirection(text: string): 'rtl' | 'ltr' {
    const sample = String(text || '').replace(/<[^>]+>/g, '');
    const hebrew = (sample.match(/[\u0590-\u05FF]/g) || []).length;
    const latin = (sample.match(/[A-Za-z]/g) || []).length;
    if (hebrew === 0 && latin === 0) return 'rtl';
    return hebrew >= latin ? 'rtl' : 'ltr';
}

function signatureLogoMargin(dir: 'rtl' | 'ltr'): string {
    return dir === 'rtl' ? '0 0 10px auto' : '0 auto 10px 0';
}

/** Gmail-style block: optional logo + rich HTML (for `{recruiter_signature}` in emails). */
export function buildEmailSignatureHtml(
    sig: EmailSignaturePrefs | null | undefined,
    dir: 'rtl' | 'ltr' = 'rtl',
): string {
    const html = String(sig?.html ?? '').trim();
    const logo = String(sig?.logoUrl ?? '').trim();
    if (!html && !logo) return '';

    const align = dir === 'rtl' ? 'right' : 'left';
    const logoBlock = logo
        ? `<img src="${escapeHtmlAttr(logo)}" alt="" style="max-height:52px;max-width:180px;display:block;margin:${signatureLogoMargin(dir)};" />`
        : '';

    return (
        `<table cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#374151;width:100%;text-align:${align};">` +
        `<tr><td align="${align}" style="text-align:${align};">${logoBlock}${html}</td></tr></table>`
    );
}

/** Re-apply direction / alignment on an existing signature HTML block. */
export function alignEmailSignatureHtml(signatureHtml: string, dir: 'rtl' | 'ltr'): string {
    const raw = String(signatureHtml ?? '').trim();
    if (!raw) return '';
    const align = dir === 'rtl' ? 'right' : 'left';
    let out = raw.replace(/\sdir=["']?(rtl|ltr)["']?/gi, ` dir="${dir}"`);
    if (!/\sdir=/i.test(out)) {
        out = out.replace(/<table/i, `<table dir="${dir}"`);
    }
    out = out.replace(
        /<table\b([^>]*)>/i,
        (_m, attrs: string) => {
            const withoutAlign = String(attrs)
                .replace(/\sdir=["']?(rtl|ltr)["']?/gi, '')
                .replace(/\sstyle=["'][^"']*["']/gi, '');
            return `<table dir="${dir}"${withoutAlign} style="margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#374151;width:100%;text-align:${align};">`;
        },
    );
    out = out.replace(/<td\b[^>]*>/i, `<td align="${align}" style="text-align:${align};">`);
    out = out.replace(
        /(<img\b[^>]*\bstyle=["'])([^"']*)(["'])/i,
        (_m, pre: string, style: string, post: string) => {
            const withoutMargin = style.replace(/margin\s*:\s*[^;]+;?/gi, '').trim();
            const next = `${withoutMargin}${withoutMargin ? ';' : ''}margin:${signatureLogoMargin(dir)};`;
            return `${pre}${next}${post}`;
        },
    );
    return out;
}

export function emailSignaturePlainText(sig: EmailSignaturePrefs | null | undefined): string {
    const html = String(sig?.html ?? '').trim();
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const SIGNATURE_TOKEN = 'recruiter_signature';

function emailBodyWrapperStyle(dir: 'rtl' | 'ltr'): string {
    const align = dir === 'rtl' ? 'right' : 'left';
    return `white-space:pre-wrap;font-family:sans-serif;text-align:${align};`;
}

/** Build HTML email body from plain template text; `{recruiter_signature}` is injected as HTML. */
export function buildEmailBodyHtmlFromPlain(
    plainContent: string,
    placeholderValues: Record<string, string | undefined>,
    dir: 'rtl' | 'ltr' = 'rtl',
): string {
    const sigHtml = String(placeholderValues[SIGNATURE_TOKEN] ?? '').trim();
    const tokenRe = /\{\s*recruiter_signature\s*\}/g;
    const src = String(plainContent ?? '');
    const direction = dir ?? detectEmailTextDirection(src);

    const escapeHtml = (s: string) =>
        String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

    if (!tokenRe.test(src)) {
        return `<div dir="${direction}" style="${emailBodyWrapperStyle(direction)}">${escapeHtml(src).replace(/\n/g, '<br/>')}</div>`;
    }

    tokenRe.lastIndex = 0;
    const parts = src.split(tokenRe);
    const segments: string[] = [];
    for (let i = 0; i < parts.length; i += 1) {
        if (parts[i]) {
            segments.push(
                `<div dir="${direction}" style="${emailBodyWrapperStyle(direction)}">${escapeHtml(parts[i]).replace(/\n/g, '<br/>')}</div>`,
            );
        }
        if (i < parts.length - 1) {
            segments.push(sigHtml ? alignEmailSignatureHtml(sigHtml, direction) : '');
        }
    }
    return segments.join('');
}

export type InlineEmailImageAttachment = {
    filename: string;
    content: string;
    contentType: string;
    cid: string;
};

/** Remove plain-text signature suffix (after `{recruiter_signature}` was merged for the textarea). */
export function stripTrailingPlainSignature(body: string, signatureHtml: string): string {
    const plain = emailSignaturePlainText({ html: signatureHtml });
    if (!plain) return body;
    const trimmed = body.trimEnd();
    if (trimmed.endsWith(plain)) {
        return trimmed.slice(0, trimmed.length - plain.length).trimEnd();
    }
    return body;
}

export function stripTrailingHtmlSignature(bodyHtml: string, signatureHtml: string): string {
    const sig = String(signatureHtml ?? '').trim();
    if (!sig) return bodyHtml;
    const trimmed = bodyHtml.trimEnd();
    if (trimmed.endsWith(sig)) {
        return trimmed.slice(0, trimmed.length - sig.length).trimEnd();
    }
    return bodyHtml;
}

/** Hiro email signature wrapper table (see {@link buildEmailSignatureHtml}). */
const SIGNATURE_TABLE_MARKER = /border-top:\s*1px\s+solid\s+#e5e7eb/i;

function trailingSignatureTableChunk(html: string): string {
    const trimmed = String(html ?? '').trimEnd();
    const m = trimmed.match(/(<table\b[^>]*>[\s\S]*?<\/table>)\s*(<\/div>\s*)?$/i);
    const tablePart = m?.[1] || '';
    const chunk = m?.[0] || '';
    return tablePart && SIGNATURE_TABLE_MARKER.test(tablePart) ? chunk : '';
}

export function htmlBodyHasTrailingSignatureBlock(html: string): boolean {
    return trailingSignatureTableChunk(html).length > 0;
}

export function stripTrailingSignatureTable(html: string): string {
    let trimmed = String(html ?? '').trimEnd();
    for (let i = 0; i < 2; i += 1) {
        const chunk = trailingSignatureTableChunk(trimmed);
        if (!chunk) break;
        trimmed = trimmed.slice(0, trimmed.length - chunk.length).trimEnd();
    }
    return trimmed;
}

function wrapEmailHtmlFragment(html: string, dir: 'rtl' | 'ltr'): string {
    const trimmed = String(html ?? '').trim();
    if (!trimmed) return '';
    if (/dir=["'](rtl|ltr)["']/i.test(trimmed)) return trimmed;
    const align = dir === 'rtl' ? 'right' : 'left';
    return `<div dir="${dir}" style="font-family:sans-serif;line-height:1.55;color:#222;text-align:${align};">${trimmed}</div>`;
}

/** Compose body (plain or rich HTML) + aligned HTML signature block. */
export function buildMainEmailHtmlFromCompose(
    body: string,
    signatureHtml: string | undefined,
    dir?: 'rtl' | 'ltr',
): string {
    const sigRaw = String(signatureHtml ?? '').trim();
    const plainSample = isRichHtmlContent(body) ? htmlToPlainText(body) : body;
    const direction =
        dir ?? detectEmailTextDirection(`${plainSample} ${emailSignaturePlainText({ html: sigRaw })}`);
    const sig = sigRaw ? alignEmailSignatureHtml(sigRaw, direction) : '';

    let bodyPart = body;
    if (sig) {
        if (isRichHtmlContent(bodyPart)) {
            bodyPart = stripTrailingHtmlSignature(bodyPart, sig);
            bodyPart = stripTrailingHtmlSignature(bodyPart, sigRaw);
            bodyPart = stripTrailingSignatureTable(bodyPart);
        } else {
            bodyPart = stripTrailingPlainSignature(bodyPart, sig);
        }
    }

    const main = isRichHtmlContent(bodyPart)
        ? wrapEmailHtmlFragment(bodyPart, direction)
        : buildEmailBodyHtmlFromPlain(bodyPart, {}, direction);

    const alreadyHasSignature =
        isRichHtmlContent(bodyPart) && htmlBodyHasTrailingSignatureBlock(bodyPart);

    return sig && !alreadyHasSignature ? `${main}${sig}` : main;
}

/** Plain message body + HTML signature block (images inlined via {@link inlineDataUriImagesInHtml} before send). */
export function buildMainEmailHtmlWithSignature(plainBody: string, signatureHtml: string | undefined): string {
    return buildMainEmailHtmlFromCompose(plainBody, signatureHtml);
}

/** Email clients strip `data:` URIs — rewrite to `cid:` + MIME inline parts (Resend: `inlineContentId`). */
export function inlineDataUriImagesInHtml(html: string): {
    html: string;
    inlineAttachments: InlineEmailImageAttachment[];
} {
    const inlineAttachments: InlineEmailImageAttachment[] = [];
    let index = 0;
    const out = String(html ?? '').replace(/<img\b([^>]*)>/gi, (full, attrs: string) => {
        const srcMatch = attrs.match(/\bsrc=(["'])(data:image\/([\w+.-]+);base64,([^"']+))\1/i);
        if (!srcMatch) return full;
        index += 1;
        const cid = `sig-inline-${index}`;
        const subtype = srcMatch[3];
        const b64 = srcMatch[4];
        const ext = subtype.toLowerCase() === 'jpeg' ? 'jpg' : subtype.toLowerCase();
        inlineAttachments.push({
            filename: `${cid}.${ext}`,
            content: b64,
            contentType: `image/${subtype}`,
            cid,
        });
        const newAttrs = attrs.replace(
            /\bsrc=(["'])data:image\/[\w+.-]+;base64,[^"']+\1/i,
            `src="cid:${cid}"`,
        );
        return `<img${newAttrs}>`;
    });
    return { html: out, inlineAttachments };
}

/** Final HTML for SMTP/Resend: inline autograph images, keep regular attachments separate. */
export function prepareEmailHtmlWithInlineImages(html: string): {
    html: string;
    inlineAttachments: InlineEmailImageAttachment[];
} {
    return inlineDataUriImagesInHtml(html);
}
