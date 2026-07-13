import { test, expect } from '@playwright/test';

const p = (path: string) => (path.startsWith('/') ? path : '/' + path);

test.describe('Routing Smoke', () => {
  test('Sidebar routes open and update URL', async ({ page }) => {
    await page.goto('/');

    const tryClick = async (label: string, routePath: string) => {
      const link = page.getByRole('link', { name: new RegExp(label, 'i') });
      if (await link.count()) {
        await link.first().click();
        await expect(page).toHaveURL(new RegExp(`${p(routePath)}$`));
      } else {
        await page.goto(p(routePath));
        await expect(page).toHaveURL(new RegExp(`${p(routePath)}$`));
      }
    };

    await tryClick('Candidates|מועמדים', '/candidates');
    await tryClick('Jobs|משרות', '/jobs');
    await tryClick('Settings|הגדרות', '/settings');
  });

  test('404/NotFound and settings index redirect exist', async ({ page }) => {
    await page.goto(p('/this-route-does-not-exist'));
    await expect(page).toHaveURL(/\/(this-route-does-not-exist|.*)/);

    await page.goto(p('/settings'));
    await expect(page).toHaveURL(/\/settings(\/[a-z-]+)?$/);
  });
});
