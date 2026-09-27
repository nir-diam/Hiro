import { describe, expect, it } from 'vitest';
import { injectProposalLogo, prepareProposalHtmlForPdf } from '../proposalHtmlPrepare';
import type { ExportImagePayload } from '../exportImagePayload';
import { scaleLogoForProposalTemplate } from '../exportImagePayload';

const sampleLogo: ExportImagePayload = {
    data: new Uint8Array([1, 2, 3]),
    type: 'png',
    width: 200,
    height: 72,
};

describe('scaleLogoForProposalTemplate', () => {
    it('never upscales — matches TinyMCE max-width:100%; height:auto', () => {
        expect(scaleLogoForProposalTemplate(sampleLogo)).toEqual({ width: 200, height: 72 });
    });

    it('shrinks only when wider than template content area', () => {
        const wide: ExportImagePayload = { ...sampleLogo, width: 900, height: 120 };
        const scaled = scaleLogoForProposalTemplate(wide);
        expect(scaled.width).toBeLessThanOrEqual(746);
        expect(scaled.height).toBeLessThan(120);
    });
});

describe('prepareProposalHtmlForPdf', () => {
    it('injects logo at template dimensions (no upscale)', () => {
        const out = prepareProposalHtmlForPdf('<p>טקסט</p>', sampleLogo);
        expect(out).toContain('src="data:image/png;base64,');
        expect(out).toContain('width="200"');
        expect(out).toContain('height="72"');
        expect(out).toContain('height:72px');
    });

    it('replaces company_logo placeholder', () => {
        const out = injectProposalLogo('<p>{company_logo}</p>', sampleLogo, 'pdf');
        expect(out).not.toContain('{company_logo}');
        expect(out).toContain('width="200"');
    });

    it('unwraps logo paragraph to avoid html2canvas gap', () => {
        const out = injectProposalLogo(
            '<p style="margin:0;text-align:center;">{company_logo}</p>',
            sampleLogo,
            'pdf',
        );
        expect(out).not.toMatch(/<p[^>]*>\s*<img[^>]+alt="לוגו"/);
    });
});
