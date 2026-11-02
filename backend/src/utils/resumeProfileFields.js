/**
 * CV-parse profile fields → candidate columns.
 * Gemini age is ignored; age is computed from the birth date.
 * Recruiter-entered values are left in place.
 */

const PLACEHOLDERS = new Set(['', '-', '—', '–', 'בחר', 'לא צוין', 'null', 'undefined', 'n/a', 'na']);

const trim = (v) => (v == null ? '' : String(v).trim());

const isPlaceholder = (v) => PLACEHOLDERS.has(trim(v).toLowerCase());

const LICENSE_CODE = {
  a: 'A',
  a_motorcycle: 'A',
  motorcycle: 'A',
  a1: 'A1',
  a2: 'A2',
  b: 'B',
  b_private_car: 'B',
  private_car: 'B',
  private: 'B',
  car: 'B',
  c: 'C',
  c_truck: 'C',
  truck: 'C',
  c1: 'C1',
  d: 'D',
  d_bus: 'D',
  bus: 'D',
  d1: 'D1',
  e: 'E',
  e_trailer: 'E',
  trailer: 'E',
  '1': '1',
  '1_tractor': '1',
  tractor: '1',
};

function coerceGender(raw) {
  const s = trim(raw);
  if (!s || isPlaceholder(s)) return null;
  const lower = s.toLowerCase();
  // Picklist `gender` option values are male / female (labels are זכר / נקבה).
  if (lower === 'male' || lower === 'm' || s === 'זכר' || s === 'גבר') return 'male';
  if (lower === 'female' || lower === 'f' || s === 'נקבה' || s === 'אישה' || s === 'אשה') return 'female';
  return null;
}

/** Gemini sends "Yes" / null. The profile dropdown stores picklist codes, not true/false. */
function coerceMobility(raw) {
  if (raw === true) return 'car_owner';
  if (raw === false) return 'not_mobile';
  const s = trim(raw);
  if (!s || isPlaceholder(s) || s === '-') return null;
  const lower = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (['car_owner', 'mobile_public_transport', 'not_mobile'].includes(lower)) return lower;
  if (['yes', 'true', '1', 'כן', 'יש', 'mobile', 'נייד', 'בעל_רכב', 'בעל_רכב_פרטי'].includes(lower) || s === 'בעל/ת רכב' || s === 'בעל רכב פרטי') {
    return 'car_owner';
  }
  if (lower.includes('public_transport') || s.includes('תחבורה')) return 'mobile_public_transport';
  if (['no', 'false', '0', 'לא', 'אין', 'לא_נייד'].includes(lower) || s === 'לא נייד') return 'not_mobile';
  return null;
}

function coerceLicenseToken(raw) {
  const s = trim(raw);
  if (!s || isPlaceholder(s)) return null;
  const key = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (LICENSE_CODE[key]) return LICENSE_CODE[key];
  const head = key.split('_')[0];
  if (/^(a1|a2|c1|d1)$/.test(head)) return head.toUpperCase();
  if (/^[a-e]$/.test(head)) return head.toUpperCase();
  if (head === '1') return '1';
  const letter = s.match(/\b(A1|A2|C1|D1|[A-E]|1)\b/);
  if (!letter) return null;
  return letter[1] === '1' ? '1' : letter[1].toUpperCase();
}

function coerceDrivingLicenses(ai) {
  const raw = [];
  if (Array.isArray(ai?.drivingLicenses)) raw.push(...ai.drivingLicenses);
  else if (ai?.drivingLicenses != null && trim(ai.drivingLicenses)) raw.push(ai.drivingLicenses);
  if (ai?.drivingLicense != null) raw.push(ai.drivingLicense);
  const out = [];
  for (const item of raw) {
    const token = item && typeof item === 'object'
      ? (item.value ?? item.class ?? item.name ?? item.label ?? item.license ?? item.type ?? '')
      : item;
    const code = coerceLicenseToken(token);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

function coerceBirthPart(raw, kind) {
  const s = trim(raw);
  if (!s || isPlaceholder(s)) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  if (kind === 'year' && n >= 1900 && n <= 2100) return String(n);
  if (kind === 'month' && n >= 1 && n <= 12) return String(n);
  if (kind === 'day' && n >= 1 && n <= 31) return String(n);
  return null;
}

function computeAgeFromBirth(birthYear, birthMonth, birthDay, now = new Date()) {
  const y = parseInt(trim(birthYear), 10);
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null;
  const m = parseInt(trim(birthMonth), 10);
  const d = parseInt(trim(birthDay), 10);
  const hasMonth = Number.isFinite(m) && m >= 1 && m <= 12;
  const hasDay = Number.isFinite(d) && d >= 1 && d <= 31;
  let age = now.getFullYear() - y;
  if (hasMonth) {
    const monthDiff = now.getMonth() + 1 - m;
    if (monthDiff < 0 || (monthDiff === 0 && hasDay && now.getDate() < d)) age -= 1;
  }
  if (age < 0 || age > 130) return null;
  return String(age);
}

function mapResumeProfileFields(ai, now = new Date()) {
  if (!ai || typeof ai !== 'object') return {};
  const out = {};
  const gender = coerceGender(ai.gender);
  if (gender) out.gender = gender;
  const mobility = coerceMobility(ai.mobility);
  if (mobility) out.mobility = mobility;
  const licenses = coerceDrivingLicenses(ai);
  if (licenses.length) {
    out.drivingLicenses = licenses;
    out.drivingLicense = licenses[0];
  }
  const birthYear = coerceBirthPart(ai.birthYear, 'year');
  const birthMonth = coerceBirthPart(ai.birthMonth, 'month');
  const birthDay = coerceBirthPart(ai.birthDay, 'day');
  if (birthYear) out.birthYear = birthYear;
  if (birthMonth) out.birthMonth = birthMonth;
  if (birthDay) out.birthDay = birthDay;
  const age = computeAgeFromBirth(birthYear, birthMonth, birthDay, now);
  if (age) out.age = age;
  return out;
}

function fieldText(existing, key) {
  if (!existing) return '';
  const v = existing[key];
  if (v === true || v === false) return v ? 'true' : 'false';
  return trim(v);
}

function recruiterHoldsGender(existing) {
  const s = fieldText(existing, 'gender');
  if (!s || isPlaceholder(s)) return false;
  return true;
}

function recruiterHoldsMobility(existing) {
  const raw = existing?.mobility;
  if (raw === true || raw === false) return true;
  const s = fieldText(existing, 'mobility');
  if (!s || isPlaceholder(s)) return false;
  if (/^(yes|no|true|false)$/i.test(s)) return false;
  return true;
}

function recruiterHoldsLicenses(existing) {
  const values = [];
  if (Array.isArray(existing?.drivingLicenses)) values.push(...existing.drivingLicenses);
  if (existing?.drivingLicense != null) values.push(existing.drivingLicense);
  const real = values.map((x) => trim(x)).filter((x) => x && !isPlaceholder(x));
  if (!real.length) return false;
  return real.some((x) => !x.includes('_'));
}

function recruiterHoldsBirth(existing, key) {
  const s = fieldText(existing, key);
  return Boolean(s) && !isPlaceholder(s);
}

/**
 * Drop parsed profile fields the candidate already has.
 * Raw Gemini tokens (male, Yes, b_private_car) are not treated as a manual value.
 */
function keepRecruiterProfileFields(updates, existing) {
  if (!updates || typeof updates !== 'object') return updates;
  if (!existing || typeof existing !== 'object') return updates;
  const out = { ...updates };
  if (recruiterHoldsGender(existing)) delete out.gender;
  if (recruiterHoldsMobility(existing)) delete out.mobility;
  if (recruiterHoldsLicenses(existing)) {
    delete out.drivingLicenses;
    delete out.drivingLicense;
  }
  if (recruiterHoldsBirth(existing, 'birthYear')) delete out.birthYear;
  if (recruiterHoldsBirth(existing, 'birthMonth')) delete out.birthMonth;
  if (recruiterHoldsBirth(existing, 'birthDay')) delete out.birthDay;
  if (recruiterHoldsBirth(existing, 'age')) {
    delete out.age;
  } else {
    const year = recruiterHoldsBirth(existing, 'birthYear') ? existing.birthYear : out.birthYear;
    const month = recruiterHoldsBirth(existing, 'birthMonth') ? existing.birthMonth : out.birthMonth;
    const day = recruiterHoldsBirth(existing, 'birthDay') ? existing.birthDay : out.birthDay;
    const age = computeAgeFromBirth(year, month, day);
    if (age) out.age = age;
    else delete out.age;
  }
  return out;
}

module.exports = {
  mapResumeProfileFields,
  keepRecruiterProfileFields,
  computeAgeFromBirth,
  coerceGender,
  coerceMobility,
  coerceDrivingLicenses,
};
