const JOURNAL_SELF_LABEL = 'אני';

const parseCsvSet = (raw) => {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return new Set();
  return new Set(
    s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
};

const normalizePersonNameKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u05be\-–—]/g, ' ')
    .replace(/\s+/g, ' ');

const getDynamicStatusLabel = (status, dueDateStr) => {
  const st = String(status || '').trim();
  if (st === 'הושלם') return 'הושלם';
  if (st === 'בוטל') return 'בוטל';

  if (!dueDateStr) {
    return st === 'עתידי' || !st ? 'עתידי' : st;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(String(dueDateStr).slice(0, 10));
  if (Number.isNaN(dueDate.getTime())) return st || 'עתידי';
  dueDate.setHours(0, 0, 0, 0);
  if (dueDate < today) return 'באיחור';
  if (dueDate.getTime() === today.getTime()) return 'להיום';
  return 'עתידי';
};

const parseJournalDayTs = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const dateWithinRange = (raw, dateFrom, dateTo) => {
  const ts = parseJournalDayTs(raw);
  if (ts == null) return !dateFrom && !dateTo;
  if (dateFrom) {
    const fromTs = parseJournalDayTs(dateFrom);
    if (fromTs != null && ts < fromTs) return false;
  }
  if (dateTo) {
    const toDay = parseJournalDayTs(dateTo);
    if (toDay != null && ts > toDay + 24 * 60 * 60 * 1000 - 1) return false;
  }
  return true;
};

const parseAssigneeList = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return [];
  return s
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
};

const eventHandlingAssignees = (row) => parseAssigneeList(row.coordinator || row.creator || '');

const eventAssignedToCoordinator = (row, coordinatorName, { selfCoordinatorName, treatAniAsSelf } = {}) => {
  const needle = normalizePersonNameKey(coordinatorName);
  if (!needle) return true;
  const assignees = eventHandlingAssignees(row);
  if (!assignees.length) return false;
  const selfName = normalizePersonNameKey(selfCoordinatorName);
  const matchNames = new Set([needle]);
  if (needle === normalizePersonNameKey(JOURNAL_SELF_LABEL) && selfName) matchNames.add(selfName);
  return assignees.some((name) => {
    const key = normalizePersonNameKey(name);
    if (!key || key === normalizePersonNameKey(JOURNAL_SELF_LABEL)) {
      return Boolean(treatAniAsSelf && selfName && needle === selfName);
    }
    return matchNames.has(key);
  });
};

const resolveCandidateId = (row) => {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.candidateId) return String(meta.candidateId);
  if (String(row.linkedToType || '').trim() === 'מועמד' && row.contactId) return String(row.contactId);
  return '';
};

const resolveCompanyLabel = (row) => {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const fromMeta = String(meta.jobCompany || meta.organizationName || '').trim();
  if (fromMeta && fromMeta !== '—') return fromMeta;
  const clientName = String(row.clientName || '').trim();
  return clientName && clientName !== '—' ? clientName : '';
};

const buildSearchHaystack = (row) => {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const parts = [
    row.contactName,
    row.title,
    row.description,
    row.stage,
    row.process,
    meta.candidateName,
    meta.contactName,
    meta.jobTitle,
    meta.jobCompany,
    row.clientName,
  ];
  return normalizeSearchText(parts.filter(Boolean).join(' '));
};

const eventMatchesSearch = (row, q) => {
  if (!q) return true;
  const haystack = buildSearchHaystack(row);
  if (haystack.includes(q)) return true;
  const tokens = q.split(' ').filter(Boolean);
  if (tokens.length > 1) return tokens.every((token) => haystack.includes(token));
  return false;
};

const eventMatchesContactOrCandidate = (row, { contactId, candidateId }) => {
  const cid = String(contactId || '').trim();
  const cand = String(candidateId || '').trim();
  if (!cid && !cand) return true;
  const linkedIds = [];
  if (row.contactId) linkedIds.push(String(row.contactId));
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  if (meta.candidateId) linkedIds.push(String(meta.candidateId));
  const linkedContacts = meta.linkedContacts;
  if (Array.isArray(linkedContacts)) {
    for (const entry of linkedContacts) {
      if (entry && entry.id) linkedIds.push(String(entry.id));
    }
  }
  if (cand && (linkedIds.includes(cand) || resolveCandidateId(row) === cand)) return true;
  if (cid && linkedIds.includes(cid)) return true;
  return false;
};

const eventEditedByPersonInRange = (row, editorName, range) => {
  const needle = String(editorName || '').trim();
  if (!needle) return false;
  const creator = String(row.creator || '').trim();
  if (creator === needle && dateWithinRange(row.date, range.dateFrom, range.dateTo)) return true;
  const updates = Array.isArray(row.updates) ? row.updates : [];
  for (const update of updates) {
    if (String(update.creator || '').trim() !== needle) continue;
    if (dateWithinRange(update.date, range.dateFrom, range.dateTo)) return true;
  }
  return false;
};

/**
 * @param {import('express').Request['query']} query
 * @param {{ name?: string, email?: string }} [dbUser]
 */
const parseJournalListQuery = (query, dbUser) => {
  const selfCoordinatorName =
    (dbUser?.name && String(dbUser.name).trim())
    || (dbUser?.email && String(dbUser.email).trim())
    || '';

  let editorFilters = [];
  const editorsRaw = query?.editors;
  if (editorsRaw && typeof editorsRaw === 'object' && !Array.isArray(editorsRaw)) {
    editorFilters = Object.entries(editorsRaw).map(([name, range]) => ({
      name: String(name).trim(),
      dateFrom: range?.dateFrom ? String(range.dateFrom) : '',
      dateTo: range?.dateTo ? String(range.dateTo) : '',
    }));
  } else {
    const editorNames = parseCsvSet(query?.editors);
    const dateFrom = query?.editorDateFrom ? String(query.editorDateFrom) : '';
    const dateTo = query?.editorDateTo ? String(query.editorDateTo) : '';
    for (const name of editorNames) {
      editorFilters.push({ name, dateFrom, dateTo });
    }
  }

  return {
    q: normalizeSearchText(query?.q),
    contactId: String(query?.contactId || '').trim(),
    candidateId: String(query?.candidateId || '').trim(),
    activeStates: parseCsvSet(query?.activeStates),
    statuses: parseCsvSet(query?.statuses),
    companies: parseCsvSet(query?.companies),
    coordinators: parseCsvSet(query?.coordinators),
    pipelineIds: parseCsvSet(query?.pipelineIds),
    stageIds: parseCsvSet(query?.stageIds),
    assignToSelf: query?.assignToSelf === '1' || query?.assignToSelf === 'true',
    selfCoordinatorName,
    dateFrom: query?.dateFrom ? String(query.dateFrom) : '',
    dateTo: query?.dateTo ? String(query.dateTo) : '',
    dueFrom: query?.dueFrom ? String(query.dueFrom) : '',
    dueTo: query?.dueTo ? String(query.dueTo) : '',
    editorFilters,
    journalFilter:
      query?.journalFilter === '1'
      || query?.journalFilter === 'true'
      || Boolean(String(query?.q || '').trim()),
  };
};

const hasServerJournalFilters = (opts) =>
  Boolean(
    opts.q
    || opts.contactId
    || opts.candidateId
    || opts.activeStates.size
    || opts.statuses.size
    || opts.companies.size
    || opts.coordinators.size
    || opts.pipelineIds.size
    || opts.stageIds.size
    || opts.assignToSelf
    || opts.dateFrom
    || opts.dateTo
    || opts.dueFrom
    || opts.dueTo
    || opts.editorFilters.length,
  );

const filterJournalMappedRows = (rows, opts) => {
  if (!hasServerJournalFilters(opts)) return rows;
  return (rows || []).filter((row) => {
    if (!eventMatchesContactOrCandidate(row, opts)) return false;
    if (!eventMatchesSearch(row, opts.q)) return false;

    if (opts.assignToSelf && opts.selfCoordinatorName) {
      if (
        !eventAssignedToCoordinator(row, opts.selfCoordinatorName, {
          selfCoordinatorName: opts.selfCoordinatorName,
          treatAniAsSelf: true,
        })
      ) {
        return false;
      }
    }

    if (opts.coordinators.size > 0) {
      let matched = false;
      for (const name of opts.coordinators) {
        if (eventAssignedToCoordinator(row, name, { selfCoordinatorName: opts.selfCoordinatorName })) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }

    if (opts.activeStates.size > 0) {
      const activeLabel = row.isActive !== false ? 'פעיל' : 'לא פעיל';
      if (!opts.activeStates.has(activeLabel)) return false;
    }

    if (opts.statuses.size > 0 && row.isActive !== false) {
      const dynamicStatus = getDynamicStatusLabel(row.status, row.dueDate);
      if (!opts.statuses.has(dynamicStatus)) return false;
    }

    if (opts.companies.size > 0) {
      const company = resolveCompanyLabel(row);
      if (!company || !opts.companies.has(company)) return false;
    }

    if (opts.pipelineIds.size > 0) {
      const pid = row.processId ? String(row.processId) : '';
      if (!pid || !opts.pipelineIds.has(pid)) return false;
    }

    if (opts.stageIds.size > 0) {
      const stageId = row.stageId ? String(row.stageId) : '';
      if (!stageId || !opts.stageIds.has(stageId)) return false;
    }

    if (opts.dateFrom || opts.dateTo) {
      if (!dateWithinRange(row.date, opts.dateFrom, opts.dateTo)) return false;
    }

    if (opts.dueFrom || opts.dueTo) {
      if (!dateWithinRange(row.dueDate, opts.dueFrom, opts.dueTo)) return false;
    }

    if (opts.editorFilters.length > 0) {
      let matchedEditor = false;
      for (const editor of opts.editorFilters) {
        if (eventEditedByPersonInRange(row, editor.name, editor)) {
          matchedEditor = true;
          break;
        }
      }
      if (!matchedEditor) return false;
    }

    return true;
  });
};

module.exports = {
  parseJournalListQuery,
  filterJournalMappedRows,
  hasServerJournalFilters,
  getDynamicStatusLabel,
};
