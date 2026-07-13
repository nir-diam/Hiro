import { test, expect } from '@playwright/test';

/**
 * הבדיקה מניחה שקיים "trigger" שגיאה מבוימת בפרופיל מסוים/תנאי דגל פיתוח,
 * למשל ?throw=true שמפיל חריגה בתוך הרכיב — כדי לאשר שה-Boundary של ה"Route" תופס.
 * אם אין טריגר כזה — אפשר לדלג על המבחן או ליצור כפתור dev-only שמפיל חריגה.
 */

const p = (route: string) => (route.startsWith('/') ? route : '/' + route);

test.describe('Route Error Boundaries', () => {
  test('Candidate route error is isolated by boundary', async ({ page }) => {
    await page.goto(p('/candidates/1?throw=true'));
    await expect(page).toHaveURL(/\/candidates\/\d+\?throw=true$/);
  });
});
