'use strict';

const { HIRO_EMPLOYEE_BUCKETS, normalizeEmployeeCount } = require('./normalizeEmployeeCount');
const { normalizeCompanyNameForLookup } = require('./companyNameMatch');

const AGENT_WRITABLE_FIELDS = Object.freeze([
  'name', 'nameEn', 'legalName', 'registrationNumber',
  'activityStatus', 'dataConfidence', 'lastVerified',
  'location', 'address', 'hqCountry', 'latitude', 'longitude',
  'website', 'linkedinUrl', 'email', 'phone', 'logo',
  'foundedYear', 'employeeCount',
  'mainField', 'mainField2', 'subField', 'secondaryField',
  'businessModel', 'productType', 'type', 'classification', 'relation', 'structure',
  'parentCompany', 'subsidiaries', 'growthIndicator', 'growthTrend',
  'tags', 'techTags', 'description', 'comments', 'additionalLocations',
]);

const READ_ONLY_FIELDS = Object.freeze([
  'id', 'createdAt', 'updatedAt', 'dataCompleteness', 'candidateCount',
  'snippet', 'aliases', 'embedding', 'history',
]);

const ACTIVITY_STATUS_VALUES = Object.freeze(['פעילה', 'לא פעילה', 'בפירוק', 'לא ידוע']);

const AGENT_DATA_CONFIDENCE_CANONICAL = Object.freeze({
  'verified by agent': 'Verified by Agent',
  high: 'Verified by Agent',
  'מאומת ע"י סוכן': 'Verified by Agent',
  'אומת על ידי סוכן': 'Verified by Agent',
  missing: 'Missing',
  'חסר נתונים': 'Missing',
  'pending review': 'Pending Review',
  'לביקורת': 'Pending Review',
});

const FORBIDDEN_DATA_CONFIDENCE = Object.freeze([
  'Verified by User',
  'מאומת ע"י משתמש',
]);

const BUSINESS_MODEL_VALUES = Object.freeze(['B2B', 'B2C', 'B2G', 'משולב', 'לא ידוע']);
const PRODUCT_TYPE_VALUES = Object.freeze([
  'מוצר (Product)', 'שירותים (Services)', 'פלטפורמה', 'פרויקטים', 'לא ידוע',
]);
const STRUCTURE_VALUES = Object.freeze([
  'חברה עצמאית (ללא שיוך)',
  'חברת אם (Parent/Holding)',
  'חברת בת (Subsidiary)',
]);
const CLASSIFICATION_VALUES = Object.freeze(['פרטית', 'ציבורית (בורסאית)', 'ממשלתית', 'מלכ"ר']);

const REGISTRATION_NUMBER_RE = /^\d{9}$/;
const URL_RE = /^https?:\/\/.+/i;

const validationError = (message, { status = 400, code, allowedValues } = {}) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (allowedValues) err.allowedValues = allowedValues;
  return err;
};

const normalizeStringArray = (val) => {
  if (!Array.isArray(val)) return null;
  return val.map((v) => String(v || '').trim()).filter(Boolean);
};

const normalizeOptionalString = (val) => {
  if (val == null) return null;
  const s = String(val).trim();
  return s || null;
};

const normalizeDataConfidenceForAgent = (val) => {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  if (FORBIDDEN_DATA_CONFIDENCE.some((f) => f.toLowerCase() === raw.toLowerCase())) {
    throw validationError('Agent cannot set dataConfidence to user-verified value', {
      status: 403,
      code: 'FORBIDDEN_DATA_CONFIDENCE',
    });
  }
  const canonical = AGENT_DATA_CONFIDENCE_CANONICAL[raw.toLowerCase()];
  if (!canonical) {
    throw validationError(`Invalid dataConfidence: ${raw}`, {
      allowedValues: ['Verified by Agent', 'Missing', 'Pending Review'],
    });
  }
  return canonical;
};

const validateUrlField = (field, val) => {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (!URL_RE.test(s)) {
    throw validationError(`Invalid URL for ${field}`);
  }
  return s;
};

const validateRegistrationNumber = (val) => {
  if (val == null) return null;
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return null;
  if (!REGISTRATION_NUMBER_RE.test(digits)) {
    throw validationError('registrationNumber must be exactly 9 digits');
  }
  return digits;
};

const validateEnumField = (field, val, allowed) => {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (!allowed.includes(s)) {
    throw validationError(`Invalid ${field}: ${s}`, { allowedValues: [...allowed] });
  }
  return s;
};

const validateEnumArrayField = (field, val, allowed) => {
  if (val == null) return null;
  const arr = normalizeStringArray(val);
  if (!arr) {
    throw validationError(`${field} must be an array`);
  }
  for (const item of arr) {
    if (!allowed.includes(item)) {
      throw validationError(`Invalid ${field} value: ${item}`, { allowedValues: [...allowed] });
    }
  }
  return arr;
};

const validateAdditionalLocationsInput = (val) => {
  if (val == null) return undefined;
  if (!Array.isArray(val)) {
    throw validationError('additionalLocations must be an array');
  }
  return val.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw validationError(`additionalLocations[${index}] must be an object`);
    }
    return {
      id: item.id ? String(item.id).trim() : undefined,
      description: normalizeOptionalString(item.description) || '',
      location: normalizeOptionalString(item.location) || '',
      address: normalizeOptionalString(item.address),
      sortIndex: Number.isFinite(Number(item.sortIndex)) ? Number(item.sortIndex) : index,
    };
  });
};

/**
 * Parse and validate agent organization field patch.
 * @param {Record<string, unknown>} rawFields
 * @returns {{ patch: Record<string, unknown>, additionalLocations?: unknown[] }}
 */
const parseAgentOrganizationFields = (rawFields) => {
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
    throw validationError('fields must be a JSON object');
  }

  const keys = Object.keys(rawFields);
  const forbidden = keys.filter((k) => READ_ONLY_FIELDS.includes(k));
  if (forbidden.length) {
    throw validationError(`Read-only fields: ${forbidden.join(', ')}`);
  }
  const unknown = keys.filter((k) => !AGENT_WRITABLE_FIELDS.includes(k));
  if (unknown.length) {
    throw validationError(`Unknown fields: ${unknown.join(', ')}`);
  }
  if (!keys.length) {
    throw validationError('At least one field is required');
  }

  const patch = {};
  let additionalLocations;

  for (const key of keys) {
    const val = rawFields[key];
    switch (key) {
      case 'registrationNumber':
        patch.registrationNumber = validateRegistrationNumber(val);
        break;
      case 'activityStatus':
        patch.activityStatus = validateEnumField(key, val, ACTIVITY_STATUS_VALUES);
        break;
      case 'dataConfidence':
        patch.dataConfidence = normalizeDataConfidenceForAgent(val);
        break;
      case 'employeeCount':
        if (val == null) {
          patch.employeeCount = null;
        } else {
          const bucket = normalizeEmployeeCount(val);
          if (!bucket) {
            throw validationError(`Invalid employeeCount: ${val}`, { allowedValues: [...HIRO_EMPLOYEE_BUCKETS] });
          }
          patch.employeeCount = bucket;
        }
        break;
      case 'businessModel':
        patch.businessModel = val == null ? [] : validateEnumArrayField(key, val, BUSINESS_MODEL_VALUES);
        break;
      case 'productType':
        patch.productType = val == null ? [] : validateEnumArrayField(key, val, PRODUCT_TYPE_VALUES);
        break;
      case 'structure':
        patch.structure = validateEnumField(key, val, STRUCTURE_VALUES);
        break;
      case 'classification':
        patch.classification = validateEnumField(key, val, CLASSIFICATION_VALUES);
        break;
      case 'website':
      case 'linkedinUrl':
      case 'logo':
        patch[key] = validateUrlField(key, val);
        break;
      case 'mainField2':
      case 'subField':
      case 'subsidiaries':
      case 'tags':
      case 'techTags':
        patch[key] = val == null ? [] : normalizeStringArray(val);
        break;
      case 'latitude':
      case 'longitude':
        if (val == null || val === '') {
          patch[key] = null;
        } else {
          const n = Number(val);
          if (Number.isNaN(n)) throw validationError(`Invalid ${key}`);
          patch[key] = n;
        }
        break;
      case 'additionalLocations':
        additionalLocations = validateAdditionalLocationsInput(val);
        break;
      default:
        patch[key] = val == null ? null : String(val).trim() || null;
        break;
    }
  }

  return { patch, additionalLocations };
};

const normalizedNameKey = (name) => normalizeCompanyNameForLookup(name).toLowerCase();

module.exports = {
  AGENT_WRITABLE_FIELDS,
  READ_ONLY_FIELDS,
  ACTIVITY_STATUS_VALUES,
  BUSINESS_MODEL_VALUES,
  PRODUCT_TYPE_VALUES,
  STRUCTURE_VALUES,
  CLASSIFICATION_VALUES,
  HIRO_EMPLOYEE_BUCKETS,
  parseAgentOrganizationFields,
  normalizedNameKey,
  validationError,
};
