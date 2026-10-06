import { describe, expect, it } from 'vitest';
import {
  formatJobTagRelevanceScoreOnTenHe,
  jobTagRelevanceScoreOnTenScale,
  jobTagRelevanceScoreUnit,
} from '../tagWeightDisplay';

describe('jobTagRelevanceScore scale', () => {
  it('maps LLM 0–1 to 0–10 display', () => {
    expect(jobTagRelevanceScoreOnTenScale(1)).toBe(10);
    expect(jobTagRelevanceScoreOnTenScale(0.5)).toBe(5);
    expect(formatJobTagRelevanceScoreOnTenHe(1)).toBe('10/10');
  });

  it('keeps legacy 0–10 values', () => {
    expect(jobTagRelevanceScoreOnTenScale(8)).toBe(8);
    expect(jobTagRelevanceScoreUnit(8)).toBe(0.8);
  });

  it('uses full structural weight range at relevance 1', () => {
    expect(jobTagRelevanceScoreUnit(1)).toBe(1);
  });
});
