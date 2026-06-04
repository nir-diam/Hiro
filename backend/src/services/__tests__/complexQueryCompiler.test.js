const {
  compileComplexRulesWhere,
  combinePanelAndComplexSql,
  linesFromValue,
} = require('../complexQueryCompiler');

describe('complexQueryCompiler', () => {
  test('linesFromValue splits multiline keywords', () => {
    expect(linesFromValue('react\nnode\n')).toEqual(['react', 'node']);
  });

  test('compileComplexRulesWhere builds AND text search', () => {
    const binds = [];
    const sql = compileComplexRulesWhere(
      [
        { operator: 'AND', field: 'text', value: 'kubernetes\ndocker' },
      ],
      binds,
    );
    expect(sql).toMatch(/searchText/i);
    expect(binds.length).toBeGreaterThan(0);
  });

  test('compileComplexRulesWhere combines NOT', () => {
    const binds = [];
    const sql = compileComplexRulesWhere(
      [
        { operator: 'AND', field: 'text', value: 'java' },
        { operator: 'NOT', field: 'last_role', value: 'junior' },
      ],
      binds,
    );
    expect(sql).toMatch(/NOT/i);
  });

  test('single rule with NOT operator excludes matches', () => {
    const binds = [];
    const sql = compileComplexRulesWhere(
      [{ operator: 'NOT', field: 'last_role', value: 'מנהלת חשבונות' }],
      binds,
    );
    expect(sql).toMatch(/^NOT\s*\(/i);
    expect(sql).toMatch(/workExperience/i);
  });

  test('combinePanelAndComplexSql uses OR when first complex rule is OR', () => {
    const sql = combinePanelAndComplexSql(
      '(age BETWEEN 45 AND 52)',
      '"createdAt" >= $1::date',
      [{ operator: 'OR', field: 'registration_date', value: { from: '2026-06-01', to: '2026-06-01' } }],
    );
    expect(sql).toBe('((age BETWEEN 45 AND 52)) OR ("createdAt" >= $1::date)');
  });

  test('combinePanelAndComplexSql uses AND when first complex rule is AND', () => {
    const sql = combinePanelAndComplexSql(
      '(age BETWEEN 45 AND 52)',
      '"createdAt" >= $1::date',
      [{ operator: 'AND', field: 'registration_date', value: { from: '2026-06-01' } }],
    );
    expect(sql).toBe('((age BETWEEN 45 AND 52)) AND ("createdAt" >= $1::date)');
  });

  test('last_role matches latest workExperience title not profile headline', () => {
    const binds = [];
    const sql = compileComplexRulesWhere(
      [{ operator: 'AND', field: 'last_role', value: 'מוכר ואחראי קופה' }],
      binds,
    );
    expect(sql).toMatch(/workExperience/i);
    expect(sql).toMatch(/jsonb_array_elements/i);
    expect(sql).not.toMatch(/professionalSummary/i);
  });
});
