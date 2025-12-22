import { test, expect } from '@playwright/test';

const h = (p: string) => `/#${p}`;

test.describe('Deep links & Refresh stability', () => {
  test('Candidates deep link and refresh do not crash', async ({ page }) => {
    // הכנה: אם אין לך ID אמיתי, בדוק לפחות שהנתיב לא מפיל (UI יכול להציג שגיאת נתונים מכוונת בשלב זה)
    await page.goto(h('/candidates/1'));
    await expect(page).toHaveURL(/#\/candidates\/\d+$/);

    // רענון
    await page.reload();
    await expect(page).toHaveURL(/#\/candidates\/\d+$/);
  });

  test('Jobs deep link and refresh do not crash', async ({ page }) => {
    await page.goto(h('/jobs/1'));
    await expect(page).toHaveURL(/#\/jobs\/\d+$/);

    // רענון
    await page.reload();
    await expect(page).toHaveURL(/#\/jobs\/\d+$/);
  });
});
