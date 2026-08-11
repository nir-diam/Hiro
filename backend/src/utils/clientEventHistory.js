/** Append a row to a client event's updates + history arrays. */
const appendClientEventActivity = (event, { summary, actor } = {}) => {
  const title = String(summary || '').trim();
  if (!title || !event || typeof event !== 'object') return event;
  const creator = String(actor || 'מערכת').trim() || 'מערכת';
  const ts = new Date().toISOString();
  const row = { id: `u-${Date.now()}`, title, date: ts, creator };
  return {
    ...event,
    updates: [row, ...(Array.isArray(event.updates) ? event.updates : [])],
    history: [
      { user: creator, timestamp: ts, summary: title },
      ...(Array.isArray(event.history) ? event.history : []),
    ],
  };
};

const EVENT_CLOSED_SUMMARY = 'אירוע נסגר';
const EVENT_REOPENED_SUMMARY = 'אירוע הופעל מחדש';

module.exports = {
  appendClientEventActivity,
  EVENT_CLOSED_SUMMARY,
  EVENT_REOPENED_SUMMARY,
};
