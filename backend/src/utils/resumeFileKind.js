const { zipHasEntryName } = require('./zipStoredEntries');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * File kind from bytes. Used when the upload has no extension or a generic content-type.
 * @returns {'pdf'|'doc'|'docx'|'jpeg'|'png'|'rtf'|null}
 */
function sniffResumeKind(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (buf.length < 4) return null;
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return 'doc';
  if (buf[0] === 0x50 && buf[1] === 0x4b && zipHasEntryName(buf, 'word/document.xml')) return 'docx';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  const head = buf.slice(0, Math.min(buf.length, 8)).toString('ascii');
  if (head.startsWith('{\\rtf')) return 'rtf';
  return null;
}

function bufferLooksLikeResume(buffer) {
  return sniffResumeKind(buffer) != null;
}

module.exports = {
  sniffResumeKind,
  bufferLooksLikeResume,
};
