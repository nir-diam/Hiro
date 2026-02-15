const BASE_POINTS = Number(process.env.TAG_BASE_POINTS || '100');
const MIN_CONFIDENCE = Number(process.env.TAG_MIN_CONFIDENCE || '0.5');

const BASE_WEIGHT_TABLE = {
  'role:core': 1.0,
  'role:tool': 0.85,
  'skill:tool': 0.6,
  'skill:core': 0.75,
  'tool:tool': 0.5,
};

const DEFAULT_BASE_WEIGHT = 0.65;
const BOOSTERS = {
  is_current: Number(process.env.TAG_CURRENT_BOOSTER || '0.4'),
  is_in_summary: Number(process.env.TAG_SUMMARY_BOOSTER || '0.25'),
};

const normalizeKey = (rawType, context) => `${String(rawType || 'role').toLowerCase()}:${String(context || 'core').toLowerCase()}`;

const getBaseWeight = (rawType, context) => {
  const key = normalizeKey(rawType, context);
  const weight = BASE_WEIGHT_TABLE[key];
  if (typeof weight === 'number') return weight;
  const fallbackForType = BASE_WEIGHT_TABLE[`${String(rawType || 'role').toLowerCase()}:core`];
  if (typeof fallbackForType === 'number') return fallbackForType;
  return DEFAULT_BASE_WEIGHT;
};

const normalizeConfidenceFactor = (confidence) => {
  const raw = Number.isFinite(confidence) ? confidence : MIN_CONFIDENCE;
  if (raw <= 0 || MIN_CONFIDENCE <= 0) return 1;
  return raw / MIN_CONFIDENCE;
};

const scoreTag = (tagMeta = {}) => {
  const { raw_type, context, is_current, is_in_summary, confidence_score } = tagMeta;
  const baseWeight = getBaseWeight(raw_type, context);
  const booster = (is_current ? BOOSTERS.is_current : 0) + (is_in_summary ? BOOSTERS.is_in_summary : 0);
  const calculatedWeight = baseWeight + booster;
  const confidenceFactor = normalizeConfidenceFactor(confidence_score);
  const finalScore = BASE_POINTS * calculatedWeight * confidenceFactor;
  return {
    calculatedWeight,
    finalScore,
    confidenceFactor,
    minConfidence: MIN_CONFIDENCE,
  };
};

module.exports = {
  scoreTag,
};

