import type { SendNotificationEmailAttachment } from '../services/emailSendApi';
import { fetchLoggedInClientLogoForExport } from './exportImagePayload';
import { stampBinaryAttachmentWithClientLogo } from './originalDocumentExport';

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
}

/** Add tenant logo (top-left) to PDF, DOCX, and image email attachments before send. */
export async function applyClientLogoToEmailAttachments(
    attachments: SendNotificationEmailAttachment[],
): Promise<SendNotificationEmailAttachment[]> {
    if (!attachments.length) return attachments;

    const logo = await fetchLoggedInClientLogoForExport();
    if (!logo) return attachments;

    const out: SendNotificationEmailAttachment[] = [];
    for (const att of attachments) {
        const content = String(att.content || '').trim();
        if (!content) {
            out.push(att);
            continue;
        }
        try {
            const stamped = await stampBinaryAttachmentWithClientLogo(
                {
                    bytes: base64ToBytes(content),
                    filename: att.filename,
                    contentType: att.contentType,
                },
                logo,
                { align: 'left' },
            );
            out.push({
                filename: stamped.filename,
                content: bytesToBase64(stamped.bytes),
                contentType: stamped.contentType,
            });
        } catch (err) {
            console.warn('[emailAttachmentLogo] stamp failed, sending original', att.filename, err);
            out.push(att);
        }
    }
    return out;
}
