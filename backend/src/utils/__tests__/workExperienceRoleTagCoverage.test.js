const {
  enrichWorkExperienceRoleTags,
  ensureRoleTagCoverage,
  attachTagIdsToWorkExperience,
} = require('../workExperienceNormalize');

describe('ensureRoleTagCoverage', () => {
  it('adds per-job roleTag and role tags when model returned skills but no roleTag on rows', () => {
    const work = [
      { title: 'מנהל IT איזור דרום', company: 'רמי לוי', endDate: 'Present' },
      { title: 'איש מחשוב', company: 'ביכורי השדה', endDate: '2022-12' },
    ];
    const modelTags = [
      { name: 'Office 365', raw_type: 'tool' },
      { name: 'Help Desk', raw_type: 'skill' },
    ];
    const enriched = enrichWorkExperienceRoleTags(work, modelTags);
    const covered = ensureRoleTagCoverage(enriched.tagEntries, enriched.workExperience);

    expect(covered.workExperience).toHaveLength(2);
    expect(covered.workExperience[0].roleTag).toBeUndefined();
    expect(covered.workExperience[1].roleTag).toBeUndefined();
    const roleNames = covered.tagEntries
      .filter((t) => String(t.raw_type).toLowerCase() === 'role')
      .map((t) => t.name);
    expect(roleNames).toEqual(expect.arrayContaining(['מנהל IT איזור דרום', 'איש מחשוב']));
  });

  it('links job title to catalog role tag and drops orphan CV-only role labels', () => {
    const synced = [
      {
        raw_type: 'role',
        tag: {
          id: 'tag-1',
          displayNameHe: 'נציג/ת שירות ומכירה',
          tagKey: 'rep_sales',
        },
      },
    ];
    const work = [
      { title: 'נציג/ת שירות', company: 'ויזה כאל' },
      { title: 'נציג/ת שימור ומכירה', company: 'הוט', roleTag: 'נציג/ת שימור ומכירה' },
    ];
    const linked = attachTagIdsToWorkExperience(work, synced);
    expect(linked[0].roleTag).toBe('נציג/ת שירות ומכירה');
    expect(linked[0].tagId).toBe('tag-1');
    expect(linked[1].roleTag).toBeUndefined();
  });

  /**
   * Regression: a row linked to a real catalog role tag that is still `pending` has an inactive
   * candidate link, so it is absent from the fetched tag rows. Its `tagId`/`roleTag` were erased on
   * read, which is why the profile showed no tag even though the parser had assigned one.
   */
  it('keeps a row tagId linked to a catalog tag that is not in the active tag rows', () => {
    const activeLinks = [
      { raw_type: 'skill', tag: { id: 'skill-1', displayNameHe: 'HPLC', tagKey: 'hplc' } },
    ];
    const work = [
      {
        title: 'כימאית מחקר ופיתוח תרופות טופיקליות',
        company: "סול-ג'ל טכנולוגיות",
        tagId: 'd71c4202-fed3-49a2-bf34-a0903e391344',
        roleTag: 'כימאי/ת מחקר ופיתוח (R&D)',
      },
    ];

    const linked = attachTagIdsToWorkExperience(work, activeLinks);

    expect(linked[0].tagId).toBe('d71c4202-fed3-49a2-bf34-a0903e391344');
    expect(linked[0].roleTag).toBe('כימאי/ת מחקר ופיתוח (R&D)');
  });

  it('does not strip row tags when the payload carries no role tags at all', () => {
    const work = [{ title: 'כימאית QC', tagId: 'tag-9', roleTag: 'כימאי/ת אנליטי/ת' }];
    const linked = attachTagIdsToWorkExperience(work, []);
    expect(linked[0].tagId).toBe('tag-9');
    expect(linked[0].roleTag).toBe('כימאי/ת אנליטי/ת');
  });
});
