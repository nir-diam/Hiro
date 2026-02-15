const Prompt = require('../models/Prompt');
const promptHistoryService = require('./promptHistoryService');

const DEFAULT_PROMPTS = [
  {
    id: 'cv_analysis',
    name: 'ניתוח ופרסור קורות חיים',
    description: 'הפרומפט הראשי לחילוץ מידע מקובץ קו"ח והמרתו ל-JSON מובנה.',
    template: `You are an expert HR recruiter. Analyze the provided CV file and extract structured data in Hebrew. 
            
CRITICAL INSTRUCTIONS:
1. **Main Profile (Title)**: If there is no explicit title at the top, INFER the professional title based on the candidate's most recent or most significant role.
2. **Professional Summary**: If a "Summary" or "Profile" section is missing, YOU MUST GENERATE a summary based on their experience, years in the field, and education.
3. **Skills/Tags**: If there is no list of skills, EXTRACT key technologies, tools, and soft skills mentioned in the work experience text.
4. **Work Experience**: Do your best to identify job blocks even if formatting is complex.
5. **Education**: Ensure education is extracted.

Respond ONLY in JSON format matching the schema provided in the configuration.
Resume Content:
{{resume_text}}`,
    model: 'gemini-3-flash-preview',
    temperature: 0.1,
    variables: ['resume_text'],
    category: 'candidates',
  },
  {
    id: 'candidate_match_analysis',
    name: 'חישוב ציון התאמה (Match Score)',
    description: 'משווה בין פרופיל מועמד לדרישות משרה ומפיק ציון ונימוק.',
    template: `You are a Senior Recruiter. Analyze the match between the candidate and the job.

Job Description:
{{job_description}}

Candidate Profile (JSON):
{{candidate_json}}

Task:
1. Compare the candidate's skills, experience years, and titles against the job requirements.
2. Assign a match score between 0-100.
3. List 3 key strengths (why they fit).
4. List 3 potential gaps (missing skills, experience gap).
5. Provide a short "Recruiter Bottom Line" summary in Hebrew.

Output format: JSON.`,
    model: 'gemini-3-pro-preview',
    temperature: 0.2,
    variables: ['candidate_json', 'job_description'],
    category: 'candidates',
  },
  {
    id: 'experience_ai',
    name: 'ניסוח ניסיון תעסוקתי (Experience AI)',
    description: 'חולץ תיאור ניסיון תעסוקתי מקצועי בעברית על בסיס תפקיד, חברה ותיאור.',
    template: `פעל כיועץ קריירה ומומחה לכתיבת קורות חיים בעברית. המטרה: לכתוב או לשדרג תיאור ניסיון תעסוקתי מקוצר וקולע.
הנתונים עליהם יש להתבסס:
{{contextParts}}
הנחיות:
1. כתוב 3-5 נקודות מקצועיות גזורות בגוף ראשון עבר (למשל: "ניהלתי", "יזמתי").
2. אם קיים תיאור, שפר אותו והדגש הישגים לפי הנתונים; אם לא, צור תיאור חדש מותאם לתפקיד/תחום.
3. החזר רק את רשימת הנקודות בעברית, ללא מבואות או סיכומים נוספים.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.2,
    variables: ['contextParts'],
    category: 'candidates',
  },
  {
    id: 'job_description_analysis',
    name: 'ייבוא וניתוח משרה (Parse)',
    description: 'הפרומפט המשמש לייבוא משרה מטקסט חופשי (מייל/וורד) לטופס המערכת.',
    template: `אתה עוזר גיוס חכם. נתח את תיאור המשרה הבא וחלץ ממנו את הפרטים לתוך JSON.
המפתחות הנדרשים: jobTitle (שם המשרה), jobDescription (תיאור, נקה תווים מיותרים), requirements (דרישות), salaryMin (שכר מינימום, אופציונלי), salaryMax (שכר מקסימום, אופציונלי), city (עיר, אופציונלי).

בנוסף, צור רשימה של 3-4 שאלות סינון (screeningQuestions) קריטיות למשרה זו.

תיאור המשרה:
{{job_text}}`,
    model: 'gemini-3-flash-preview',
    temperature: 0.1,
    variables: ['job_text'],
    category: 'jobs',
  },
  {
    id: 'optimize_job_description',
    name: 'שיווק ושיפור תיאור משרה',
    description: 'משדרג תיאור משרה יבש לטקסט שיווקי ואטרקטיבי לפרסום.',
    template: `Act as a Recruitment Marketing Specialist.
Rewrite the following job description to be engaging, inclusive, and professional for a landing page.
Highlight the benefits and the challenge.
Language: Hebrew.
Structure:
- "Why join us?" (Intro)
- Responsibilities (Bullet points)
- Requirements (Bullet points)

Raw Description:
{{raw_job_description}}`,
    model: 'gemini-3-pro-preview',
    temperature: 0.7,
    variables: ['raw_job_description'],
    category: 'jobs',
  },
  {
    id: 'generate_screening_questions',
    name: 'מחולל שאלונים (Wizard)',
    description: 'מייצר שאלות סינון על בסיס הגדרת המשרה.',
    template: `Generate a screening questionnaire for the position: "{{job_title}}".
Requirements: {{requirements_text}}

Generate 3-5 questions:
1. One "Killer Question" (Multiple choice/Yes-No) for the most critical hard skill (e.g. experience years, license).
2. One Open-ended professional question.
3. One Personality/Soft-skill question suitable for Video Response.

Output JSON.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.5,
    variables: ['job_title', 'requirements_text'],
    category: 'jobs',
  },
  {
    id: 'company_enrichment',
    name: 'העשרת נתוני חברה (Intelligence)',
    description: 'משמש להשלמת פרטי חברות, תעשייה, מתחרים ולוגו.',
    template: `You are a Corporate Intelligence Extraction Agent for an Israeli database.
I have a list of Israeli companies: {{company_names_json}}.

**MANDATORY INSTRUCTIONS:**
1. **LANGUAGE RULES:** 
    - 'description', 'location', 'mainField', 'subField' MUST be in **HEBREW**.
    - 'techTags' MUST be in **ENGLISH**.
2. **LOCATION ACCURACY:**
    - Provide the specific City name in Hebrew.
3. **DATA ENRICHMENT:**
    - Use the **Google Search tool** to find real data.
    - Infer 'Business Model', 'Growth Indicator'.

Return a valid JSON array.`,
    model: 'gemini-3-pro-preview',
    temperature: 0.1,
    variables: ['company_names_json'],
    category: 'companies',
  },
  {
    id: 'compose_candidate_message',
    name: 'כתיבת הודעה למועמד',
    description: 'מייצר הודעת פנייה אישית בהתאם לטון ולמטרה.',
    template: `Write a message to candidate "{{candidate_name}}" regarding the position "{{job_title}}".
Message Type: {{message_type}} (e.g., Invitation to interview, Rejection, Initial sourcing).
Tone: {{tone}} (e.g., Formal, Friendly, Excited).

The message should be in Hebrew, concise, and professional.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.6,
    variables: ['candidate_name', 'job_title', 'message_type', 'tone'],
    category: 'communications',
  },
  {
    id: 'analyze_job_performance',
    name: 'ניתוח ביצועי משרה (AI Insights)',
    description: 'מנתח מדוע משרה תקועה ומציע פתרונות.',
    template: `Analyze the recruitment performance for this job based on the provided stats:
{{job_stats_json}}

Identify bottlenecks (e.g., low applicant count, high drop-off at screening) and suggest 3 specific actions for the recruiter to improve time-to-hire.
Answer in Hebrew.`,
    model: 'gemini-3-pro-preview',
    temperature: 0.3,
    variables: ['job_stats_json'],
    category: 'analysis',
  },
  {
    id: 'chatbot_onboarding',
    name: 'בוט הרשמה למועמד (Onboarding)',
    description: 'הנחיית המערכת לבוט שבונה פרופיל למועמד.',
    template: `You are Hiro, a friendly and helpful career assistant. 
Your goal is to help a candidate build their professional profile via chat.
Ask one question at a time.
Collect: Name, Current Title, Skills, Experience Summary.
Be encouraging and concise. Speak Hebrew.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.6,
    variables: ['none'],
    category: 'chatbots',
  },
  {
    id: 'chatbot_recruiter',
    name: 'עוזר אישי למגייס (Hiro Admin)',
    description: 'הנחיית המערכת לבוט שמשמש את הרכזים.',
    template: `You are an expert Recruitment Assistant for a user with role: {{user_role}}.
You have access to tools to query the database, add tags, and update job descriptions.
Help the user perform tasks, analyze data, and draft content.
Always answer in Hebrew.`,
    model: 'gemini-3-pro-preview',
    temperature: 0.4,
    variables: ['user_role'],
    category: 'chatbots',
  },
  {
    id: 'job_categories_synonyms_ai_completed',
    name: 'יצירת טייטלים ספציפיים לחיפוש',
    description: 'מייצר מילים נרדפות וטייטלים חלופיים איכותיים לתפקיד ספציפי.',
    template: `אתה מומחה לטקסונומיה והעשרת חיפושי גיוס. ציין טייטלים חלופיים (חיפושיים) העשויים לכלול מונחים בעברית ובאנגלית עבור תפקיד מסוים.
Role: {{role_value}}
Cluster: {{cluster_name}}
Category: {{category_name}}
Existing synonyms: {{existing_synonyms}}

הנחיות:
1. רשום 10-15 מונחים רלוונטיים, קצרים ומוכרים בשפה המקומית.
2. כל מונח חייב להיות מלא (אל תשתמש רק במילים כלליות כמו "Manager").
3. הסר כפילויות והימנע מהפריטים שכבר קיימים ב-Existing synonyms.
4. החזר JSON array של מחרוזות בלבד, ללא הסברים או כותרות.`,
    model: 'gemini-3-flash-preview',
    temperature: 0.35,
    variables: ['role_value', 'cluster_name', 'category_name', 'existing_synonyms'],
    category: 'jobs',
  },
];

const list = async () => {
  const count = await Prompt.count();
  if (count === 0) {
    await Prompt.bulkCreate(DEFAULT_PROMPTS);
  }
  return Prompt.findAll({ order: [['name', 'ASC']] });
};

const getById = async (id) => {
  const prompt = await Prompt.findByPk(id);
  if (!prompt) {
    const err = new Error('Prompt not found');
    err.status = 404;
    throw err;
  }
  return prompt;
};

const create = async (payload) => {
  const prompt = await Prompt.create(payload);
  await promptHistoryService.log(prompt, 'create');
  return prompt;
};

const update = async (id, payload) => {
  const prompt = await getById(id);
  await prompt.update(payload);
  await promptHistoryService.log(prompt, 'update');
  return prompt;
};

const remove = async (id) => {
  const deleted = await Prompt.destroy({ where: { id } });
  if (!deleted) {
    const err = new Error('Prompt not found');
    err.status = 404;
    throw err;
  }
};

const reset = async () => {
  await Prompt.destroy({ where: {} });
  await Prompt.bulkCreate(DEFAULT_PROMPTS);
  return list();
};

module.exports = { list, getById, create, update, remove, reset };

