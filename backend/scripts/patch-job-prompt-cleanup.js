/**
 * Clean up the broken STRICT ENGLISH KEY RULE sentence left by the previous patch.
 * The anti-hallucination block stays but the orphaned tail is re-attached cleanly.
 */
const { sequelize } = require('../src/config/db');
const Prompt = require('../src/models/Prompt');

(async () => {
  try {
    const p = await Prompt.findByPk('create_new_job');
    if (!p) { console.error('Prompt "create_new_job" not found'); process.exit(1); }

    // The patch left this broken tail after the injected block:
    const BROKEN_TAIL = ' Translate the concept accurately (e.g., if the tag name is "ניתוח נתונים", the key MUST be "data_analysis"). ABSOLUTELY NO HEBREW CHARACTERS ALLOWED IN THE KEY FIELD.';
    // Replace the broken tail + attach it cleanly back to the STRICT ENGLISH KEY RULE line
    const ANTI_BLOCK_END = 'The word "automotive" inside a skill/role key is FORBIDDEN unless the job description is literally about cars or vehicles.\n';

    if (!p.template.includes(BROKEN_TAIL)) {
      console.log('Broken tail not found — prompt may already be clean.');
      process.exit(0);
    }

    // Remove the orphaned tail and re-attach it properly after the STRICT ENGLISH KEY RULE header
    let t = p.template;

    // 1. Remove the orphaned broken tail (with leading space)
    t = t.replace(BROKEN_TAIL, '');

    // 2. Add the translation rule back as its own clean bullet after the anti-hallucination block
    const cleanAddition = '\nTranslate every skill concept accurately to English snake_case (e.g., "ניתוח נתונים" → "data_analysis"). ABSOLUTELY NO HEBREW CHARACTERS ALLOWED IN THE KEY FIELD.\n';
    t = t.replace(ANTI_BLOCK_END, ANTI_BLOCK_END + cleanAddition);

    if (t === p.template) {
      console.log('No changes detected — nothing updated.');
      process.exit(0);
    }

    await p.update({ template: t });
    console.log('Prompt cleaned up successfully.');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
