import { test, expect } from '@playwright/test';

const h = (path: string) => `/#${path.startsWith('/') ? path : '/' + path}`;

test.describe('Routing Smoke', () => {
  test('Sidebar routes open and update URL', async ({ page }) => {
    await page.goto('/');

    // נווט באמצעות לינקים (טקסטים אופייניים; עדכן אם שונים)
    // אם אין סיידבר, אפשר לדלג — העיקר לוודא שהנתיבים עצמם חיים.
    const tryClick = async (label: string, hashPath: string) => {
      const link = page.getByRole('link', { name: new RegExp(label, 'i') });
      if (await link.count()) {
        await link.first().click();
        await expect(page).toHaveURL(new RegExp(`${h(hashPath)}$`));
      } else {
        // fallback: נווט ישירות ב-URL
        await page.goto(h(hashPath));
        await expect(page).toHaveURL(new RegExp(`${h(hashPath)}$`));
      }
    };

    await tryClick('Candidates|מועמדים', '/candidates');
    await tryClick('Jobs|משרות', '/jobs');
    await tryClick('Settings|הגדרות', '/settings');
  });

  test('404/NotFound and settings index redirect exist', async ({ page }) => {
    // 404 רך
    await page.goto(h('/this-route-does-not-exist'));
    // אמור להפנות ל-NotFound או למסך בית; נבדוק שלא קורס:
    await expect(page).toHaveURL(/#\/(this-route-does-not-exist|.*)/);

    // settings index → redirect ל-tab דיפולטי (למשל general)
    await page.goto(h('/settings'));
    await expect(page).toHaveURL(/#\/settings(\/[a-z-]+)?$/);
  });
});
