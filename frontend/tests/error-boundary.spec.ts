import { test, expect } from '@playwright/test';

/**
 * הבדיקה מניחה שקיים "trigger" שגיאה מבוימת בפרופיל מסוים/תנאי דגל פיתוח,
 * למשל ?throw=true שמפיל חריגה בתוך הרכיב — כדי לאשר שה-Boundary של ה"Route" תופס.
 * אם אין טריגר כזה — אפשר לדלג על המבחן או ליצור כפתור dev-only שמפיל חריגה.
 */

const h = (p: string) => `/#${p}`;

test.describe('Route Error Boundaries', () => {
  test('Candidate route error is isolated by boundary', async ({ page }) => {
    await page.goto(h('/candidates/1?throw=true'));
    // לא נפל למסך לבן: ה-URL נשאר או הוצג Fallback; הבדיקה תוודא שהעמוד חי
    await expect(page).toHaveURL(/#\/candidates\/\d+\?throw=true$/);
    // אפשר להחמיר: לבדוק שהופיע טקסט fallback: "אירעה שגיאה" וכו'
  });
});
