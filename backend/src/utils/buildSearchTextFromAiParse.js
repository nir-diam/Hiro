const { normalizeResumeSearchText } = require('./normalizeResumeSearchText');
const { resumeTextLooksOcrGarbled } = require('./pdfTextQuality');

function str(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s || '';
}

function isGenericCvTitle(title) {
  const s = str(title);
  if (!s) return true;
  return /^(מסמך\s*)?קורות\s*חיים$/iu.test(s) || /^(cv|resume|curriculum vitae)$/iu.test(s);
}

function normalizeStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => str(x)).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function formatWorkLine(exp) {
  if (!exp || typeof exp !== 'object') return null;
  const title = str(exp.title);
  const company = str(exp.company);
  const description = str(exp.description);
  const dates = [exp.startDate, exp.endDate].map((d) => str(d)).filter(Boolean).join(' – ');
  const header = [title, company].filter(Boolean).join(' @ ');
  if (!header && !description) return null;
  const lines = [];
  if (header) lines.push(`- ${header}${dates ? ` (${dates})` : ''}`);
  if (description && description !== title) lines.push(description);
  return lines.join('\n');
}

function formatEducationLine(edu) {
  if (typeof edu === 'string') return str(edu) ? `- ${str(edu)}` : null;
  if (!edu || typeof edu !== 'object') return null;
  const line =
    str(edu.value)
    || [str(edu.degree), str(edu.institution || edu.school)].filter(Boolean).join(' — ')
    || str(edu.description);
  return line ? `- ${line}` : null;
}

function formatLanguageLine(lang) {
  if (typeof lang === 'string') return str(lang) ? `- ${str(lang)}` : null;
  if (!lang || typeof lang !== 'object') return null;
  const name = str(lang.name || lang.language || lang.value);
  if (!name) return null;
  const level = str(lang.levelText || lang.level || lang.proficiency);
  return `- ${name}${level ? ` (${level})` : ''}`;
}

/**
 * Build human-readable parsed CV text for searchText / UI (not raw OCR dump).
 */
function buildSearchTextFromAiParse(ai, options = {}) {
  if (!ai || typeof ai !== 'object') return '';
  const lines = [];

  const fullName = str(ai.fullName) || [str(ai.firstName), str(ai.lastName)].filter(Boolean).join(' ');
  const title = isGenericCvTitle(ai.title) ? '' : str(ai.title);
  const email = str(ai.email);
  const phone = str(ai.phone);
  const address = str(ai.address || ai.location);

  if (fullName) lines.push(fullName);
  if (title) lines.push(title);

  const contact = [phone, email, address].filter(Boolean);
  if (contact.length) {
    lines.push('');
    lines.push(contact.join(' | '));
  }

  const summary = str(ai.professionalSummary);
  if (summary) {
    lines.push('');
    lines.push('תקציר מקצועי:');
    lines.push(summary);
  }

  const work = Array.isArray(ai.workExperience) ? ai.workExperience : [];
  const workLines = work.map(formatWorkLine).filter(Boolean);
  if (workLines.length) {
    lines.push('');
    lines.push('ניסיון תעסוקתי:');
    lines.push(...workLines);
  }

  const education = Array.isArray(ai.education) ? ai.education : [];
  const eduLines = education.map(formatEducationLine).filter(Boolean);
  if (eduLines.length) {
    lines.push('');
    lines.push('השכלה:');
    lines.push(...eduLines);
  }

  const languages = Array.isArray(ai.languages) ? ai.languages : [];
  const langLines = languages.map(formatLanguageLine).filter(Boolean);
  if (langLines.length) {
    lines.push('');
    lines.push('שפות:');
    lines.push(...langLines);
  }

  const soft = normalizeStringArray(ai.skills?.soft);
  const tech = normalizeStringArray(ai.skills?.technical);
  const skills = [...soft, ...tech];
  if (skills.length) {
    lines.push('');
    lines.push(`מיומנויות: ${skills.slice(0, 40).join(', ')}`);
  }

  return normalizeResumeSearchText(lines.join('\n'));
}

function aiParseHasDisplayableContent(ai) {
  if (!ai || typeof ai !== 'object') return false;
  const built = buildSearchTextFromAiParse(ai);
  return built.length >= 80;
}

/**
 * Prefer formatted AI CV text; fall back to clean raw extract only when not garbled.
 */
function resolveCandidateSearchText(ai, rawExtract) {
  const formatted = buildSearchTextFromAiParse(ai);
  if (aiParseHasDisplayableContent(ai)) return formatted.slice(0, 50000);

  const raw = normalizeResumeSearchText(String(rawExtract || ''));
  if (raw && !resumeTextLooksOcrGarbled(raw)) return raw.slice(0, 50000);
  if (formatted.trim()) return formatted.slice(0, 50000);
  return raw.slice(0, 50000);
}

module.exports = {
  buildSearchTextFromAiParse,
  aiParseHasDisplayableContent,
  resolveCandidateSearchText,
  isGenericCvTitle,
};
