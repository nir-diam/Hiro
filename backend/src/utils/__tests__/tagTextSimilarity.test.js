const { scoreTagTextAgainstQuery, stringSimilarity } = require('../tagTextSimilarity');

describe('tagTextSimilarity', () => {
  test('stringSimilarity is high for close strings', () => {
    expect(stringSimilarity('react', 'reactjs')).toBeGreaterThan(0.5);
  });

  test('scoreTagTextAgainstQuery boosts token overlap', () => {
    const score = scoreTagTextAgainstQuery('רכז יבוא', '', 'מנהל/ת יבוא ולוגיסטיקה');
    expect(score).toBeGreaterThan(0.25);
  });
});
