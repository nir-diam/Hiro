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
});
