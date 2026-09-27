import { describe, expect, it } from 'vitest';
import {
  eventMatchesSystemEventFilters,
  mergeSystemEventCatalogGroups,
  type SystemEventCatalogGroup,
} from '../processManagementCatalog';

const STAFF_EMAIL_GROUPS: SystemEventCatalogGroup[] = [
  {
    label: 'דיוור ודיווח',
    events: [
      {
        value: 'דיוור ודיווח::נשלח מייל',
        label: 'נשלח מייל',
        triggerName: 'דיוור ודיווח',
        eventName: 'נשלח מייל',
        rowIds: [],
      },
    ],
  },
];

const PROPOSAL_SENT_GROUPS: SystemEventCatalogGroup[] = [
  {
    label: 'דיוור ודיווח',
    events: [
      {
        value: 'דיוור ודיווח::הצעת מחיר',
        label: 'הצעת מחיר',
        triggerName: 'דיוור ודיווח',
        eventName: 'הצעת מחיר',
        rowIds: [],
      },
    ],
  },
];

describe('staff email system event matching', () => {
  it('matches outbound email journal rows by title and metadata', () => {
    const selected = new Set(['דיוור ודיווח::נשלח מייל']);
    const event = {
      title: 'נשלח מייל: בדיקה לדוגמה',
      process: 'email',
      type: ['email', 'מייל'],
      metadata: {
        outboundMessage: true,
        channel: 'email',
        systemEvent: { triggerName: 'דיוור ודיווח', eventName: 'נשלח מייל' },
      },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, STAFF_EMAIL_GROUPS, new Map(), []),
    ).toBe(true);
  });

  it('matches legacy persisted filter keys', () => {
    const selected = new Set(['staff_email_sent']);
    const event = {
      title: 'נשלח מייל: hello',
      metadata: { outboundMessage: true, channel: 'email' },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, STAFF_EMAIL_GROUPS, new Map(), []),
    ).toBe(true);
  });

  it('does not match proposal sends as regular staff email', () => {
    const selected = new Set(['דיוור ודיווח::נשלח מייל']);
    const event = {
      title: 'נשלחה הצעת מחיר: הצעה 2026',
      type: ['proposal', 'הצעת מחיר', 'email'],
      metadata: {
        outboundMessage: true,
        outboundProposal: true,
        channel: 'email',
        systemEvent: { triggerName: 'דיוור ודיווח', eventName: 'נשלחה הצעת מחיר' },
      },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, STAFF_EMAIL_GROUPS, new Map(), []),
    ).toBe(false);
  });
});

describe('proposal sent system event matching', () => {
  it('matches when catalog uses short eventName and journal stores long form', () => {
    const selected = new Set(['דיוור ודיווח::הצעת מחיר']);
    const event = {
      title: 'נשלחה הצעת מחיר: הצעה לדוגמה',
      type: ['proposal', 'הצעת מחיר', 'email'],
      metadata: {
        outboundMessage: true,
        outboundProposal: true,
        channel: 'email',
        systemEvent: { triggerName: 'דיוור ודיווח', eventName: 'נשלחה הצעת מחיר' },
      },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, PROPOSAL_SENT_GROUPS, new Map(), []),
    ).toBe(true);
  });

  it('matches outbound proposal journal rows by title and metadata', () => {
    const selected = new Set(['דיוור ודיווח::נשלחה הצעת מחיר']);
    const event = {
      title: 'נשלחה הצעת מחיר: הצעה לדוגמה',
      type: ['proposal', 'הצעת מחיר', 'email'],
      metadata: {
        outboundMessage: true,
        outboundProposal: true,
        channel: 'email',
        systemEvent: { triggerName: 'דיוור ודיווח', eventName: 'נשלחה הצעת מחיר' },
      },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, PROPOSAL_SENT_GROUPS, new Map(), []),
    ).toBe(true);
  });

  it('matches legacy persisted filter keys', () => {
    const selected = new Set(['proposal_sent']);
    const event = {
      title: 'נשלחה הצעת מחיר: הצעה',
      metadata: { outboundProposal: true, channel: 'email' },
    };
    expect(
      eventMatchesSystemEventFilters(event, selected, PROPOSAL_SENT_GROUPS, new Map(), []),
    ).toBe(true);
  });
});

describe('mergeSystemEventCatalogGroups', () => {
  it('keeps fallback entries when API catalog omits them', () => {
    const apiGroups: SystemEventCatalogGroup[] = [
      {
        label: 'מועמד',
        events: [
          {
            value: 'מועמד::אישור הפרופיל על ידי המועמד',
            label: 'אישור הפרופיל על ידי המועמד',
            triggerName: 'מועמד',
            eventName: 'אישור הפרופיל על ידי המועמד',
            rowIds: ['uuid-1'],
          },
        ],
      },
    ];
    const fallback: SystemEventCatalogGroup[] = [
      {
        label: 'דיוור ודיווח',
        events: [
          {
            value: 'staff_email_sent',
            label: 'נשלח מייל',
            triggerName: 'דיוור ודיווח',
            eventName: 'נשלח מייל',
            rowIds: [],
          },
        ],
      },
    ];
    const merged = mergeSystemEventCatalogGroups(apiGroups, fallback);
    const mailing = merged.find((g) => g.label === 'דיוור ודיווח');
    expect(mailing?.events.some((e) => e.eventName === 'נשלח מייל')).toBe(true);
  });
});
