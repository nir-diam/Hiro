const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_BIN = process.env.PDFTOTEXT_BIN || 'pdftotext';

let pdftotextAvailability = null;

const runProcess = (command, args, { collectStderr = false } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    if (collectStderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `pdftotext exited with code ${code}`));
    });
  });

const isPdftotextAvailable = async () => {
  if (pdftotextAvailability != null) return pdftotextAvailability;
  try {
    await runProcess(DEFAULT_BIN, ['-v'], { collectStderr: true });
    pdftotextAvailability = true;
  } catch (err) {
    pdftotextAvailability = false;
    console.warn('[pdftotext] not available — install poppler-utils or set PDFTOTEXT_BIN', err?.message || err);
  }
  return pdftotextAvailability;
};

/**
 * Extract UTF-8 text from a PDF buffer using Poppler's pdftotext.
 * @param {Buffer} buffer
 * @param {{ layout?: boolean }} options
 * @returns {Promise<string>}
 */
const extractWithPdftotext = async (buffer, { layout = true } = {}) => {
  if (!buffer?.length) return '';
  if (!(await isPdftotextAvailable())) return '';

  const tmpDir = os.tmpdir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pdfPath = path.join(tmpDir, `hiro-${id}.pdf`);

  try {
    await fs.promises.writeFile(pdfPath, buffer);
    const args = [
      '-enc',
      'UTF-8',
      '-nopgbrk',
      ...(layout ? ['-layout'] : []),
      pdfPath,
      '-',
    ];
    const stdout = await runProcess(DEFAULT_BIN, args);
    return String(stdout || '').trim();
  } catch (err) {
    console.warn('[pdftotext] extract failed', { layout, message: err?.message || err });
    return '';
  } finally {
    await fs.promises.unlink(pdfPath).catch(() => {});
  }
};

/** Try layout and plain modes; return both non-empty variants. */
const extractWithPdftotextVariants = async (buffer) => {
  const [layout, plain] = await Promise.all([
    extractWithPdftotext(buffer, { layout: true }),
    extractWithPdftotext(buffer, { layout: false }),
  ]);
  return { layout, plain };
};

module.exports = {
  extractWithPdftotext,
  extractWithPdftotextVariants,
  isPdftotextAvailable,
};
