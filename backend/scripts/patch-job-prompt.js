/**
 * One-time patch: add an anti-hallucination rule to the create_new_job prompt
 * so the AI never re-uses industry picklist keys (automotive_transportation etc.)
 * as skill/role/tool tag keys.
 */
const { sequelize } = require('../src/config/db');
const Prompt = require('../src/models/Prompt');

const INJECTION = `

CRITICAL ANTI-HALLUCINATION RULE FOR SKILL/ROLE/TOOL KEYS:
The industry picklist keys (automotive_transportation, construction_infrastructure, finance_and_insurance, etc.)
are STRICTLY reserved for the tagType:"industry" slot ONLY.
NEVER use them — or any fragment of them — as keys for skill / role / tool / soft_skill / degree / certification tags.
Examples of FORBIDDEN skill keys: automotive_sales, automotive_repair, construction_management (as a skill), finance_analyst.
If the job involves sales, use a precise key like "sales_management", "b2b_sales", "pharma_sales", etc.
The word "automotive" inside a skill/role key is FORBIDDEN unless the job description is literally about cars or vehicles.
`;

const ANCHOR = 'STRICT ENGLISH KEY RULE: The key field MUST BE WRITTEN IN ENGLISH AND LOWERCASE SNAKE_CASE ONLY.';

(async () => {
  try {
    const p = await Prompt.findByPk('create_new_job');
    if (!p) { console.error('Prompt "create_new_job" not found'); process.exit(1); }

    if (p.template.includes('ANTI-HALLUCINATION RULE FOR SKILL')) {
      console.log('Prompt already patched — nothing to do.');
      process.exit(0);
    }

    const newTemplate = p.template.replace(ANCHOR, ANCHOR + INJECTION);
    if (newTemplate === p.template) {
      console.error('Anchor string not found in prompt — no change made.');
      process.exit(1);
    }

    await p.update({ template: newTemplate });
    console.log('Prompt updated successfully.');
    process.exit(0);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
