const User = require('../models/User');

const HIRO_THEME_COLORS = new Set([
  'purple', 'blue', 'red', 'green', 'slate', 'orange', 'teal', 'rose', 'indigo', 'amber',
]);
const HIRO_MODES = new Set(['light', 'dark', 'dark-gray', 'dark-black']);
const HIRO_FONT_SIZES = new Set(['sm', 'base', 'lg']);
const HIRO_DENSITIES = new Set(['comfortable', 'compact']);
const LAYOUT_MODES = new Set(['list', 'cards', 'board']);

const DEFAULT_GLOBAL = {
  theme: 'purple',
  mode: 'light',
  fontSize: 'base',
  density: 'comfortable',
};

const DEFAULT_PREFERENCES = {
  version: 2,
  global: { ...DEFAULT_GLOBAL },
  screens: {},
};

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

const sanitizeGlobal = (raw) => {
  const g = isPlainObject(raw) ? raw : {};
  return {
    theme: HIRO_THEME_COLORS.has(g.theme) ? g.theme : DEFAULT_GLOBAL.theme,
    mode: HIRO_MODES.has(g.mode) ? g.mode : DEFAULT_GLOBAL.mode,
    fontSize: HIRO_FONT_SIZES.has(g.fontSize) ? g.fontSize : DEFAULT_GLOBAL.fontSize,
    density: HIRO_DENSITIES.has(g.density) ? g.density : DEFAULT_GLOBAL.density,
  };
};

const sanitizeScreen = (raw) => {
  if (!isPlainObject(raw)) return null;
  const out = {};
  if (typeof raw.layoutMode === 'string' && LAYOUT_MODES.has(raw.layoutMode)) {
    out.layoutMode = raw.layoutMode;
  }
  if (Array.isArray(raw.visibleColumns)) {
    const cols = raw.visibleColumns
      .filter((c) => typeof c === 'string' && c.trim())
      .map((c) => c.trim());
    if (cols.length) out.visibleColumns = cols;
  }
  return Object.keys(out).length ? out : null;
};

const sanitizePreferences = (stored) => {
  const base = { ...DEFAULT_PREFERENCES, global: { ...DEFAULT_GLOBAL }, screens: {} };
  if (!isPlainObject(stored)) return base;

  base.global = sanitizeGlobal(stored.global);
  if (isPlainObject(stored.screens)) {
    Object.entries(stored.screens).forEach(([key, value]) => {
      const screen = sanitizeScreen(value);
      if (screen && typeof key === 'string' && key.trim()) {
        base.screens[key.trim()] = screen;
      }
    });
  }
  return base;
};

const deepMergePreferences = (current, patch) => {
  const next = sanitizePreferences(current);
  if (!isPlainObject(patch)) return next;

  if (isPlainObject(patch.global)) {
    next.global = sanitizeGlobal({ ...next.global, ...patch.global });
  }

  if (isPlainObject(patch.screens)) {
    const screens = { ...next.screens };
    Object.entries(patch.screens).forEach(([key, value]) => {
      const k = String(key || '').trim();
      if (!k) return;
      if (value == null) {
        delete screens[k];
        return;
      }
      const prev = screens[k] || {};
      const merged = { ...prev, ...(isPlainObject(value) ? value : {}) };
      const screen = sanitizeScreen(merged);
      if (screen) screens[k] = screen;
      else delete screens[k];
    });
    next.screens = screens;
  }

  return next;
};

const getForUser = async (userId) => {
  const user = await User.findByPk(userId, { attributes: ['uiPreferences'] });
  return sanitizePreferences(user?.uiPreferences);
};

const updateForUser = async (userId, patch) => {
  const current = await getForUser(userId);
  const next = deepMergePreferences(current, patch);
  await User.update({ uiPreferences: next }, { where: { id: userId } });
  return next;
};

module.exports = {
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  getForUser,
  updateForUser,
};
