import { test, expect } from '@playwright/test';

const p = (route: string) => (route.startsWith('/') ? route : '/' + route);

test.describe('Deep links & Refresh stability', () => {
  test('Candidates deep link and refresh do not crash', async ({ page }) => {
    await page.goto(p('/candidates/1'));
    await expect(page).toHaveURL(/\/candidates\/\d+$/);

    await page.reload();
    await expect(page).toHaveURL(/\/candidates\/\d+$/);
  });

  test('Jobs deep link and refresh do not crash', async ({ page }) => {
    await page.goto(p('/jobs/1'));
    await expect(page).toHaveURL(/\/jobs\/\d+$/);

    await page.reload();
    await expect(page).toHaveURL(/\/jobs\/\d+$/);
  });
});
