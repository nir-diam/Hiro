/**
 * Translates frontend complexRules (from adv.complexRules) into parameterized SQL fragments.
 * Rules are combined left-to-right using each row's operator (AND / OR / NOT).
 */

const pushBind = (binds, value) => {
  binds.push(value);
  return binds.length;
};

const linesFromValue = (value) => {
  const raw = typeof value === 'string' ? value : '';
  return [...new Set(raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
};

const parseEndYearForSort = (endDate) => {
  const s = String(endDate || '').trim();
  if (/present|כיום|current/i.test(s)) return 9999;
  const m = s.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

/** Mirrors candidateService.pickBestExperienceRow — current job or latest end year. */
const pickBestExperienceRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  const wx = row.workExperience;
  const ex = row.experience;
  const list =
    Array.isArray(wx) && wx.length ? wx : Array.isArray(ex) && ex.length ? ex : [];
  if (!list.length) return null;
  const current = list.find(
    (e) =>
      e &&
      (/present|כיום|current/i.test(String(e.endDate || e.end || '').trim()) ||
        e.isCurrent === true),
  );
  if (current) return current;
  let best = list[0];
  let bestY = parseEndYearForSort(best?.endDate || best?.end);
  for (let i = 1; i < list.length; i += 1) {
    const e = list[i];
    const y = parseEndYearForSort(e?.endDate || e?.end);
    if (y > bestY) {
      bestY = y;
      best = e;
    }
  }
  return best;
};

const lastRoleTitleFromRow = (row) => {
  const best = pickBestExperienceRow(row);
  const fromExp = String(best?.title || best?.role || '').trim();
  if (fromExp) return fromExp;
  return String(row?.title || '').trim();
};

/** SQL: title of current / most-recent workExperience (then legacy experience, then profile title). */
const SQL_LAST_ROLE_TITLE = `COALESCE(
  NULLIF(TRIM((
    SELECT COALESCE(NULLIF(TRIM(elem->>'title'), ''), NULLIF(TRIM(elem->>'role'), ''))
    FROM jsonb_array_elements(COALESCE(candidates."workExperience", '[]'::jsonb)) AS elem
    ORDER BY
      CASE
        WHEN COALESCE(elem->>'endDate', elem->>'end', '') ~* '(present|כיום|current)'
          OR LOWER(COALESCE(elem->>'isCurrent', '')) IN ('true', 't', '1', 'yes') THEN 9999
        WHEN substring(COALESCE(elem->>'endDate', elem->>'end', '') FROM '^([0-9]{4})') IS NOT NULL
          THEN (substring(COALESCE(elem->>'endDate', elem->>'end', '') FROM '^([0-9]{4})'))::int
        ELSE 0
      END DESC NULLS LAST
    LIMIT 1
  )), ''),
  NULLIF(TRIM(COALESCE(candidates.title, '')), ''),
  NULLIF(TRIM((
    SELECT COALESCE(NULLIF(TRIM(elem->>'title'), ''), NULLIF(TRIM(elem->>'role'), ''))
    FROM jsonb_array_elements(COALESCE(candidates."experience", '[]'::jsonb)) AS elem
    ORDER BY
      CASE
        WHEN COALESCE(elem->>'endDate', elem->>'end', '') ~* '(present|כיום|current)'
          OR LOWER(COALESCE(elem->>'isCurrent', '')) IN ('true', 't', '1', 'yes') THEN 9999
        WHEN substring(COALESCE(elem->>'endDate', elem->>'end', '') FROM '^([0-9]{4})') IS NOT NULL
          THEN (substring(COALESCE(elem->>'endDate', elem->>'end', '') FROM '^([0-9]{4})'))::int
        ELSE 0
      END DESC NULLS LAST
    LIMIT 1
  )), ''),
  ''
)`;

const dateRangeSql = (column, dateRange, binds) => {
  if (!dateRange || typeof dateRange !== 'object') return null;
  const parts = [];
  const from = String(dateRange.from || '').trim();
  const to = String(dateRange.to || '').trim();
  if (from) {
    const n = pushBind(binds, from);
    parts.push(`${column} >= $${n}::date`);
  }
  if (to) {
    const n = pushBind(binds, `${to}T23:59:59.999Z`);
    parts.push(`${column} <= $${n}::timestamptz`);
  }
  return parts.length ? `(${parts.join(' AND ')})` : null;
};

const ilikeAnyLine = (columns, lines, binds, combiner = 'OR') => {
  if (!lines.length) return null;
  const lineParts = [];
  for (const line of lines) {
    const n = pushBind(binds, `%${line}%`);
    const colParts = columns.map((col) => `${col} ILIKE $${n}`);
    lineParts.push(`(${colParts.join(' OR ')})`);
  }
  return lineParts.length === 1 ? lineParts[0] : `(${lineParts.join(` ${combiner} `)})`;
};

const jobIdsFromRuleValue = (value) => {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v && typeof v === 'object' && v.id != null) return String(v.id).trim();
        return String(v || '').trim();
      })
      .filter(Boolean);
  }
  const one = String(value).trim();
  return one ? [one] : [];
};

const interestFieldMatchSql = (interestValues, binds, negate = false) => {
  const vals = Array.isArray(interestValues)
    ? interestValues
        .map((v) => {
          if (v && typeof v === 'object') {
            return String(v.role || v.field || v.category || v.label || '').trim();
          }
          return String(v || '').trim();
        })
        .filter(Boolean)
    : [];
  if (!vals.length) return null;

  const conds = [];
  for (const phrase of vals) {
    const n = pushBind(binds, `%${phrase}%`);
    conds.push(`(
      EXISTS (
        SELECT 1 FROM job_candidates jc_fi
        WHERE jc_fi."candidateId" = candidates.id
          AND jc_fi.source = 'field_interest'
          AND (
            COALESCE(jc_fi."workflowMeta"->>'category', '') ILIKE $${n}
            OR COALESCE(jc_fi."workflowMeta"->>'role', '') ILIKE $${n}
            OR COALESCE(jc_fi."workflowMeta"->>'interestLabel', '') ILIKE $${n}
          )
      )
      OR EXISTS (
        SELECT 1 FROM job_candidates jc_job
        INNER JOIN jobs j ON j.id = jc_job."jobId"
        WHERE jc_job."candidateId" = candidates.id
          AND jc_job."jobId" IS NOT NULL
          AND (
            COALESCE(j.field, '') ILIKE $${n}
            OR COALESCE(j.role, '') ILIKE $${n}
            OR COALESCE(j.title, '') ILIKE $${n}
          )
      )
      OR COALESCE(candidates.field, '') ILIKE $${n}
      OR COALESCE(candidates.title, '') ILIKE $${n}
    )`);
  }
  const inner = conds.length === 1 ? conds[0] : `(${conds.join(' OR ')})`;
  return negate ? `NOT (${inner})` : inner;
};

/**
 * @param {object} rule
 * @param {(v: unknown) => number} push
 * @returns {string|null}
 */
const compileOneComplexRule = (rule, binds) => {
  if (!rule || typeof rule !== 'object') return null;
  const field = String(rule.field || '').trim();

  // Legacy rows from older UI
  if (field === 'source' && rule.textValue) {
    const tv = String(rule.textValue).trim();
    if (!tv) return null;
    const n = pushBind(binds, `%${tv}%`);
    return `(source ILIKE $${n} OR COALESCE("inboundFromEmail", '') ILIKE $${n})`;
  }
  if (field === 'referrals' && rule.value) {
    const tv = String(rule.value).trim();
    if (!tv) return null;
    const n = pushBind(binds, `%${tv}%`);
    const dateSql = dateRangeSql('COALESCE(jc."updatedAt", jc."createdAt")', rule.dateRange, binds);
    const dateClause = dateSql ? ` AND ${dateSql}` : '';
    return `EXISTS (
      SELECT 1 FROM job_candidates jc
      INNER JOIN jobs j ON j.id = jc."jobId"
      WHERE jc."candidateId" = candidates.id
        AND jc."jobId" IS NOT NULL
        AND (j.title ILIKE $${n} OR j."publicJobTitle" ILIKE $${n} OR j.id::text = $${n})
        ${dateClause}
    )`;
  }

  switch (field) {
    case 'text': {
      const lines = linesFromValue(rule.value);
      if (!lines.length) return null;
      const searchAll = rule.searchAllProfiles !== false;
      const cols = searchAll
        ? [
            'COALESCE("searchText", \'\')',
            'COALESCE("professionalSummary", \'\')',
            'COALESCE("internalNotes", \'\')',
            'COALESCE("candidateNotes", \'\')',
          ]
        : ['COALESCE("searchText", \'\')', 'COALESCE("professionalSummary", \'\')'];
      return ilikeAnyLine(cols, lines, binds, 'OR');
    }
    case 'last_role': {
      const lines = linesFromValue(rule.value);
      if (!lines.length) return null;
      // Last position: latest workExperience title (not profile headline / full CV).
      return ilikeAnyLine([`(${SQL_LAST_ROLE_TITLE})`], lines, binds, 'OR');
    }
    case 'sender_address': {
      const lines = linesFromValue(rule.value);
      if (!lines.length) return null;
      return ilikeAnyLine(['COALESCE("inboundFromEmail", \'\')', 'COALESCE(email, \'\')'], lines, binds, 'OR');
    }
    case 'registration_date': {
      return dateRangeSql('"createdAt"', rule.value || rule.dateRange, binds);
    }
    case 'update_date':
    case 'candidate_update_date': {
      return dateRangeSql('"updatedAt"', rule.dateRange, binds);
    }
    case 'candidate_status': {
      const vals = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!vals.length) return null;
      const parts = [];
      for (const st of vals) {
        const n = pushBind(binds, `%${st}%`);
        parts.push(`(status ILIKE $${n} OR COALESCE("statusExplanation", '') ILIKE $${n})`);
      }
      return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
    }
    case 'job_type':
      return interestFieldMatchSql(rule.value, binds, false);
    case 'job_type_missing':
      return interestFieldMatchSql(rule.value, binds, true);
    case 'mobility': {
      const vals = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!vals.length) return null;
      const n = pushBind(binds, vals);
      return `(mobility = ANY($${n}::text[]) OR mobility IS NULL AND 'לא צוין' = ANY($${n}::text[]))`;
    }
    case 'driving_license': {
      const vals = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!vals.length) return null;
      const parts = [];
      for (const lic of vals) {
        const n = pushBind(binds, lic);
        parts.push(`($${n} = ANY("drivingLicenses") OR driving_license ILIKE $${n})`);
      }
      return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
    }
    case 'recruitment_source': {
      const vals = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!vals.length) return null;
      const parts = [];
      for (const src of vals) {
        const n = pushBind(binds, `%${src}%`);
        parts.push(`source ILIKE $${n}`);
      }
      const srcMatch = parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
      if (String(rule.sourceMode || '') === 'ראשוני') {
        return `(${srcMatch} OR COALESCE("recruitmentSourceCreatedAt"::text, '') <> '')`;
      }
      return srcMatch;
    }
    case 'distribution_channels': {
      const vals = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!vals.length) return null;
      const parts = [];
      for (const ch of vals) {
        const n = pushBind(binds, `%${ch}%`);
        parts.push(`(source ILIKE $${n} OR COALESCE("lastActivity", '') ILIKE $${n})`);
      }
      return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
    }
    case 'missing_tag': {
      const tags = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!tags.length) return null;
      const tagParts = [];
      for (const tag of tags) {
        const n = pushBind(binds, `%${tag}%`);
        tagParts.push(`NOT EXISTS (
          SELECT 1 FROM system_tags ct
          INNER JOIN tags tg ON tg.id = ct.tag_id
          WHERE ct.entity_id = candidates.id AND ct.is_active = true AND ct.type = 'candidate'
          AND (tg.tag_key ILIKE $${n} OR tg.display_name_he ILIKE $${n} OR tg.display_name_en ILIKE $${n})
        )`);
      }
      return tagParts.length === 1 ? tagParts[0] : `(${tagParts.join(' AND ')})`;
    }
    case 'specific_job': {
      const jobId = jobIdsFromRuleValue(rule.value)[0];
      if (!jobId) return null;
      const jcParts = ['jc."candidateId" = candidates.id'];
      const nJob = pushBind(binds, jobId);
      jcParts.push(`jc."jobId" = $${nJob}::uuid`);
      const st = String(rule.candidateStatus || '').trim();
      if (st) {
        const ns = pushBind(binds, `%${st}%`);
        jcParts.push(`jc.status ILIKE $${ns}`);
      }
      const dr = dateRangeSql('COALESCE(jc."updatedAt", jc."createdAt")', rule.dateRange, binds);
      if (dr) jcParts.push(dr);
      return `EXISTS (SELECT 1 FROM job_candidates jc WHERE ${jcParts.join(' AND ')})`;
    }
    case 'job_referrals': {
      const ids = jobIdsFromRuleValue(rule.value);
      if (!ids.length) return null;
      const n = pushBind(binds, ids);
      const dateSql = dateRangeSql('COALESCE(jc."updatedAt", jc."createdAt")', rule.dateRange, binds);
      return `EXISTS (
        SELECT 1 FROM job_candidates jc
        WHERE jc."candidateId" = candidates.id
          AND jc."jobId" = ANY($${n}::uuid[])
          ${dateSql ? `AND ${dateSql}` : ''}
      )`;
    }
    case 'disqualification_reasons': {
      const reasons = Array.isArray(rule.value) ? rule.value.map(String).filter(Boolean) : [];
      if (!reasons.length) return null;
      const reasonParts = [];
      for (const r of reasons) {
        const n = pushBind(binds, `%${r}%`);
        reasonParts.push(`(jc."lastExitReason" ILIKE $${n} OR jc.status ILIKE $${n})`);
      }
      const jobIds = jobIdsFromRuleValue(rule.secondaryValue);
      const jobClause = jobIds.length
        ? `AND jc."jobId" = ANY($${pushBind(binds, jobIds)}::uuid[])`
        : '';
      const dateSql = dateRangeSql('COALESCE(jc."lastExitAt", jc."updatedAt")', rule.dateRange, binds);
      return `EXISTS (
        SELECT 1 FROM job_candidates jc
        WHERE jc."candidateId" = candidates.id
          ${jobClause}
          AND (${reasonParts.join(' OR ')})
          ${dateSql ? `AND ${dateSql}` : ''}
      )`;
    }
    case 'events':
    case 'events_missing': {
      const events = Array.isArray(rule.value)
        ? rule.value.map((e) => (typeof e === 'string' ? e : String(e?.type || e?.name || '')).trim()).filter(Boolean)
        : [];
      if (!events.length) return null;
      const evParts = [];
      for (const ev of events) {
        const n = pushBind(binds, `%${ev}%`);
        evParts.push(`EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(candidates.events, '[]'::jsonb)) ev
          WHERE (
            COALESCE(ev->>'type', '') ILIKE $${n}
            OR COALESCE(ev->>'title', '') ILIKE $${n}
            OR ev->'type'::text ILIKE $${n}
          )
        )`);
      }
      const inner = evParts.length === 1 ? evParts[0] : `(${evParts.join(' OR ')})`;
      return field === 'events_missing' ? `NOT (${inner})` : inner;
    }
    default:
      return null;
  }
};

/**
 * @param {object[]} rules
 * @param {unknown[]} binds - mutated
 * @returns {string|null}
 */
const compileComplexRulesWhere = (rules, binds) => {
  if (!Array.isArray(rules) || !rules.length) return null;

  const parts = [];
  for (let i = 0; i < rules.length; i += 1) {
    const frag = compileOneComplexRule(rules[i], binds);
    if (!frag) continue;
    const op = String(rules[i].operator || 'AND').toUpperCase();
    parts.push({ frag, op, isFirst: parts.length === 0 });
  }
  if (!parts.length) return null;

  let expr = parts[0].frag;
  if (parts[0].op === 'NOT') expr = `NOT (${expr})`;

  for (let i = 1; i < parts.length; i += 1) {
    const { frag, op } = parts[i];
    if (op === 'OR') expr = `(${expr} OR ${frag})`;
    else if (op === 'NOT') expr = `(${expr} AND NOT (${frag}))`;
    else expr = `(${expr} AND ${frag})`;
  }
  return expr;
};

/**
 * After list fetch: build matchReasons for free-text rules (client display + resume highlight).
 * @param {object[]} rows plain candidate rows
 * @param {object[]} rules
 */
const attachComplexMatchMetadata = (rows, rules) => {
  if (!Array.isArray(rows) || !rules?.length) return rows;

  const textKeywords = [];
  const lastRoleKeywords = [];
  for (const rule of rules) {
    const op = String(rule?.operator || 'AND').toUpperCase();
    if (op === 'NOT') continue;
    if (rule?.field === 'text') {
      textKeywords.push(...linesFromValue(rule.value));
    } else if (rule?.field === 'last_role') {
      lastRoleKeywords.push(...linesFromValue(rule.value));
    }
  }
  const textTerms = [...new Set(textKeywords.map((t) => t.trim()).filter((t) => t.length >= 2))];
  const lastRoleTerms = [...new Set(lastRoleKeywords.map((t) => t.trim()).filter((t) => t.length >= 2))];
  if (!textTerms.length && !lastRoleTerms.length) return rows;

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const hayText = [
      row.searchText,
      row.professionalSummary,
      row.internalNotes,
      row.candidateNotes,
      row.title,
    ]
      .map((s) => String(s || ''))
      .join('\n')
      .toLowerCase();
    const lastRoleTitle = lastRoleTitleFromRow(row).toLowerCase();
    const hayLastRole = [lastRoleTitle, hayText].join('\n');

    const matchedTerms = [];
    const matchReasons = [];
    for (const term of textTerms) {
      const low = term.toLowerCase();
      if (hayText.includes(low)) {
        matchedTerms.push(term);
        const idx = hayText.indexOf(low);
        const snippet = hayText.slice(Math.max(0, idx - 20), idx + term.length + 40);
        matchReasons.push({
          field: 'text',
          term,
          source: row.searchText && String(row.searchText).toLowerCase().includes(low) ? 'cv' : 'profile',
          snippet: snippet.slice(0, 120),
        });
      }
    }
    for (const term of lastRoleTerms) {
      const low = term.toLowerCase();
      if (hayLastRole.includes(low)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        const inLastRole = lastRoleTitle.includes(low);
        matchReasons.push({
          field: 'last_role',
          term,
          source: inLastRole ? 'last_role' : 'cv',
          snippet: (inLastRole ? lastRoleTitle : hayText).slice(0, 120),
        });
      }
    }
    if (matchedTerms.length) {
      row.matchedTerms = matchedTerms;
      row.matchReasons = matchReasons;
    }
  }
  return rows;
};

/**
 * How to merge panel filters (age, salary, …) with compiled complex SQL.
 * First complex row operator OR → panel OR complex; otherwise panel AND complex.
 */
const combinePanelAndComplexSql = (panelSql, complexSql, rules) => {
  const panel = String(panelSql || '').trim();
  const complex = String(complexSql || '').trim();
  if (!complex) return panel;
  if (!panel) return complex;
  const orWithPanel =
    Array.isArray(rules) &&
    rules.length > 0 &&
    String(rules[0].operator || 'AND').toUpperCase() === 'OR';
  return orWithPanel ? `(${panel}) OR (${complex})` : `(${panel}) AND (${complex})`;
};

module.exports = {
  compileComplexRulesWhere,
  attachComplexMatchMetadata,
  combinePanelAndComplexSql,
  linesFromValue,
};
