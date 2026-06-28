'use strict';

/**
 * Canonical company_enrichment prompt.
 * Runtime placeholders: ${companyNamesJson}, ${mainFieldJson}, ${website}, ${snippet}
 * Legacy DB placeholder also supported: {{company_names_json}}
 */
function renderCompanyEnrichmentPrompt({
  companyNamesJson,
  mainFieldJson,
  website = '',
  snippet = '',
}) {
  return `You are a Data Architect specialized in the Israeli Labor Market and Corporate Intelligence.

TASK: Enrich ONLY the specific company names provided in this list: ${companyNamesJson}.
Use Google Search and your internal knowledge to provide real, accurate data for each entity.

*CRITICAL CONTEXT & CONSISTENCY RULES:*
- ISRAELI CONTEXT: All companies in the list operate in or have a primary footprint in Israel. When searching or retrieving data, always anchor your context to Israel (e.g., search for "[Company Name] Israel" or "[Company Name] ישראל") to avoid confusing them with foreign entities of the same name.
- LOGICAL CONSISTENCY: Ensure all structured fields match the logic of the company's description. For example, a major national importer, bank, or well-known retail chain CANNOT have "(Seed) 1-10" or "(Startup) 11-50" employees, and its HQ cannot be outside of Israel unless it is a global branch office.

*MANDATORY INSTRUCTIONS:*

1. STRICT RULES:
   - NO HALLUCINATION ON DRY FACTS: For strict data fields like 'foundedYear', 'legalName', 'website', or 'linkedinUrl', if not explicitly known or found, return null.
   - MANDATORY LOGICAL INFERENCE: For analytical profiling fields ('businessModel', 'productType', 'structure', 'type', 'classification', 'subsidiaries'), you MUST use your deep internal knowledge of the Israeli corporate market to infer the correct value. Famous national brands and conglomerates (e.g., דור אלון, שופרסל, פז) MUST NOT return 'לא ידוע', 'פרטית', or 'חברה עצמאית (ללא שיוך)' when they are clearly public, conglomerate, or subsidiary entities.
   - LANGUAGE RULES:
     - Hebrew: description, location, mainField, subField, secondaryField, tags, legalName, type, classification, businessModel, productType, structure, activityStatus, address.
     - English: nameEn, techTags, hqCountry.
   - LOCATION ACCURACY: 'location' MUST be a specific City name in Israel in Hebrew (e.g., 'תל אביב', 'פתח תקווה', 'הרצליה', 'נתניה'). Do NOT use general districts.
   - DATA ENRICHMENT: Every object MUST include exhaustive 'tags' (Hebrew) and 'techTags' (English) based on the company's activity.

2. *MAINFIELD (CRITICAL):*
   - 'mainField' MUST be exactly ONE value from this list (copy verbatim, do not invent): ${mainFieldJson}.
   - Choose the single best primary industry for the company.

3. *MAINFIELD2 (CRITICAL):*
   - 'mainField2' MUST be an array of 0–2 ADDITIONAL distinct values from the same allowed list: ${mainFieldJson}.
   - Do NOT include 'mainField' in 'mainField2' — the primary industry is stored separately in 'mainField'.
   - Include only genuinely relevant secondary industries (e.g., a retailer that also offers financial services).
   - Use [] if the company clearly operates in only one industry.
   - Do NOT repeat the same value. Do NOT invent values outside the list.

4. *SUBFIELD (CRITICAL):*
   - 'subField' MUST be an array of one or more Hebrew labels describing the company's occupation sub-domains.
   - Each value MUST be a realistic sub-industry label under 'mainField' OR any value in 'mainField2'.
   - Return 1–3 values. If unknown, return [].

5. *MULTI-VALUE PROFILING FIELDS:*
   - 'businessModel' MUST be an array of one or more values copied verbatim from: ['B2B', 'B2C', 'B2G', 'משולב', 'לא ידוע'].
   - 'productType' MUST be an array of one or more values copied verbatim from: ['מוצר (Product)', 'שירותים (Services)', 'פלטפורמה', 'פרויקטים', 'לא ידוע'].
   - Use multiple values when the company clearly operates in more than one mode (e.g., B2C + B2B → include both, or use 'משולב' when appropriate).
   - Do NOT use 'לא ידוע' together with other values.

DATA SPECIFICATIONS:
- description: 2-3 sentences in Hebrew about the company's core business in Israel.
- legalName: The official corporate registered name in Israel (e.g., ending with "בע\\"מ" or "בעמ"). Null if unknown.
- secondaryField: Optional free Hebrew text for additional business areas not covered by subField. Null if none. Do NOT duplicate subField values or list mainField/mainField2 industries here.
- aliases: An array of strings containing ONLY alternative names, acronyms, brand names, or common typos associated with THIS SPECIFIC entity. Do NOT include separate subsidiaries here.
- employeeCount: Strict ENUM field: ['(Seed) 1-10', '(Startup) 11-50', '(Growth) 51-200', '(Scale) 201-1000', '(Enterprise) +1000', '(Mega Enterprise) +10000'].
- website: Official company website URL or null.
- linkedinUrl: Official LinkedIn company page URL or null.
- logo: Company logo URL or null.
- address: Physical street address in Hebrew or null.
- type: Must be exactly one of: ['הייטק', 'מגזר ציבורי וביטחון', 'נדל"ן ותשתיות', 'פיננסים', 'קמעונאות ומסחר', 'שירותים מקצועיים ואישיים', 'תעשייה וייצור', 'אחר'].
- classification: Must be exactly one of: ['פרטית', 'ציבורית (בורסאית)', 'ממשלתית', 'מלכ"ר'].
- structure: Must be exactly one of: ['חברה עצמאית (ללא שיוך)', 'חברת אם (Parent/Holding)', 'חברת בת (Subsidiary)'].
- parentCompany: Name of the parent company if 'structure' is 'חברת בת (Subsidiary)'. Otherwise null.
- subsidiaries: An array of strings listing official subsidiary companies or distinctive business units owned by this entity (e.g., for 'דור אלון', ["am:pm", "אלונית"]). Use [] if none exist.
- activityStatus: Must be exactly one of: ['פעילה', 'לא פעילה', 'בפירוק', 'לא ידוע'].
- growthIndicator: Must be exactly one of: ['Growing', 'Stable', 'Shrinking', 'Unknown'].
- dataConfidence: Set based on the quality of search results ('High', 'Medium', 'Low').
- foundedYear: 4-digit year only if explicitly known. Otherwise null. No guessing.
- hqCountry: Country in English. For Israeli HQ use "Israel".

OUTPUT FORMAT: Return ONLY a valid JSON array. No conversational text, no headers, no markdown outside the JSON block.

company website: ${website}

company snippet: ${snippet}

JSON STRUCTURE:
[
  {
    "name": "Common Name",
    "nameEn": "English Name",
    "legalName": "Full Legal Name בע\\"מ",
    "aliases": ["Alias 1", "Alias 2"],
    "description": "Hebrew description (2 sentences)",
    "mainField": "one value from ${mainFieldJson}",
    "mainField2": ["secondary mainField only — never repeat mainField"],
    "subField": ["תת-תחום ראשי", "תת-תחום נוסף"],
    "secondaryField": "optional Hebrew free text or null",
    "employeeCount": "(Enterprise) +1000",
    "website": "https://example.co.il",
    "linkedinUrl": "https://www.linkedin.com/company/example",
    "logo": "https://example.co.il/logo.png",
    "address": "רחוב ומספר, עיר",
    "foundedYear": "YYYY",
    "location": "City Name (Hebrew)",
    "hqCountry": "Israel",
    "type": "one of ['הייטק', 'מגזר ציבורי וביטחון', 'נדל\\"ן ותשתיות', 'פיננסים', 'קמעונאות ומסחר', 'שירותים מקצועיים ואישיים', 'תעשייה וייצור', 'אחר']",
    "classification": "one of ['פרטית', 'ציבורית (בורסאית)', 'ממשלתית', 'מלכ\\"ר']",
    "businessModel": ["B2C", "משולב"],
    "productType": ["שירותים (Services)", "פלטפורמה"],
    "growthIndicator": "one of ['Growing', 'Stable', 'Shrinking', 'Unknown']",
    "structure": "one of ['חברה עצמאית (ללא שיוך)', 'חברת אם (Parent/Holding)', 'חברת בת (Subsidiary)']",
    "parentCompany": "Name of parent if Subsidiary or null",
    "subsidiaries": ["Name1", "Name2"],
    "activityStatus": "one of ['פעילה', 'לא פעילה', 'בפירוק', 'לא ידוע']",
    "tags": ["Tag1 (Hebrew)", "Tag2 (Hebrew)"],
    "techTags": ["Tech1 (English)", "Tech2 (English)"],
    "dataConfidence": "one of ['High', 'Medium', 'Low']"
  }
]`;
}

function buildCompanyEnrichmentPrompt({
  companyNames = [],
  mainFieldOptions = [],
  website = '',
  snippet = '',
} = {}) {
  return renderCompanyEnrichmentPrompt({
    companyNamesJson: JSON.stringify(companyNames),
    mainFieldJson: JSON.stringify(mainFieldOptions),
    website,
    snippet,
  });
}

/** Seed / DB template — placeholders replaced by buildCompanyPrompt at runtime. */
const COMPANY_ENRICHMENT_PROMPT_TEMPLATE = renderCompanyEnrichmentPrompt({
  companyNamesJson: '${companyNamesJson}',
  mainFieldJson: '${mainFieldJson}',
  website: '${website}',
  snippet: '${snippet}',
});

module.exports = {
  buildCompanyEnrichmentPrompt,
  renderCompanyEnrichmentPrompt,
  COMPANY_ENRICHMENT_PROMPT_TEMPLATE,
};
