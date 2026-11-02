const {
  loadTagAliasIndex,
  resolveCanonicalTagKey,
  tagKeysEquivalent,
} = require('../src/services/tagAliasIndexService');

(async () => {
  const idx = await loadTagAliasIndex();
  const keys = [
    'רכז/ת תפעול ובקרה',
    'מנהל/ת תפעול',
    'לוגיסטיקה ושרשרת אספקה',
    'ניהול קבלנים',
    'מנוסה',
  ];
  for (const k of keys) {
    console.log(JSON.stringify({ k, canonical: resolveCanonicalTagKey(k, idx) }));
  }
  console.log(
    'equiv',
    tagKeysEquivalent('רכז/ת תפעול ובקרה', 'מנהל/ת תפעול', idx),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
