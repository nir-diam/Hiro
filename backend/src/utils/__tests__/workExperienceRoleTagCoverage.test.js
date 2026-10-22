const {
  enrichWorkExperienceRoleTags,
  ensureRoleTagCoverage,
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
    expect(covered.workExperience[0].roleTag).toBe('מנהל IT איזור דרום');
    expect(covered.workExperience[1].roleTag).toBe('איש מחשוב');
    const roleNames = covered.tagEntries
      .filter((t) => String(t.raw_type).toLowerCase() === 'role')
      .map((t) => t.name);
    expect(roleNames).toEqual(expect.arrayContaining(['מנהל IT איזור דרום', 'איש מחשוב']));
  });
});
