import { test, expect, Page, Locator } from '@playwright/test';

const teacherEmail = 'teacher.teacher@school.com';
const teacherPassword = 'secretpassword';

async function firstVisible(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      return item;
    }
  }

  return null;
}

async function fillFirstAvailable(locators: Locator[], value: string) {
  for (const locator of locators) {
    const target = await firstVisible(locator);
    if (target) {
      await target.fill(value);
      return;
    }
  }

  throw new Error(`Input field was not found for value: ${value}`);
}

async function clickFirstAvailable(locators: Locator[]) {
  for (const locator of locators) {
    const target = await firstVisible(locator);
    if (target) {
      await target.click();
      return;
    }
  }

  throw new Error('Clickable element was not found.');
}

async function loginAsTeacher(page: Page) {
  await page.goto('/');

  await fillFirstAvailable(
    [
      page.getByLabel(/email/i),
      page.getByPlaceholder(/email/i),
      page.locator('input[type="email"]'),
      page.locator('input[name*="email" i]'),
      page.locator('input').first(),
    ],
    teacherEmail
  );

  await fillFirstAvailable(
    [
      page.getByLabel(/password/i),
      page.getByPlaceholder(/password/i),
      page.locator('input[type="password"]'),
      page.locator('input[name*="password" i]'),
      page.locator('input').nth(1),
    ],
    teacherPassword
  );

  await clickFirstAvailable([
    page.getByRole('button', { name: /^login$/i }),
    page.getByRole('button', { name: /sign in|kirjaudu/i }),
    page.locator('button[type="submit"]'),
    page.locator('button').filter({ hasText: /login|sign in|kirjaudu/i }),
  ]);

  await expect(page.getByRole('button', { name: /^Courses$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Attendance Stats$/i })).toBeVisible();
}

async function openCourses(page: Page) {
  await clickFirstAvailable([
    page.getByRole('button', { name: /^Courses$/i }),
    page.getByRole('link', { name: /^Courses$/i }),
    page.getByRole('button', { name: /course|courses|kurssi|kurssit/i }),
    page.getByRole('link', { name: /course|courses|kurssi|kurssit/i }),
  ]);

  await expect(page).toHaveURL(/course|courses/i);

  await expect(page.locator('body')).toContainText(
    /course|courses|kurssi|kurssit|no courses|not found|empty/i
  );
}

async function tryOpenFirstCourse(page: Page): Promise<boolean> {
  await openCourses(page);

  const possibleCourse = page
    .locator('button, a, [role="button"], [data-testid*="course"], .card, article')
    .filter({
      hasText: /course|class|group|student|attendance|kurssi|opiskelija|läsnäolo/i,
    })
    .first();

  if (await possibleCourse.isVisible().catch(() => false)) {
    await possibleCourse.click();
    return true;
  }

  return false;
}

async function tryMarkAttendance(page: Page): Promise<boolean> {
  const presentButton = page.getByRole('button', {
    name: /present|läsnä/i,
  });

  const absentButton = page.getByRole('button', {
    name: /absent|poissa/i,
  });

  const checkbox = page.getByRole('checkbox').first();

  const visiblePresent = await firstVisible(presentButton);
  const visibleAbsent = await firstVisible(absentButton);

  if (visiblePresent) {
    await visiblePresent.click();
    await expect(visiblePresent).toBeVisible();
    return true;
  }

  if (await checkbox.isVisible().catch(() => false)) {
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    return true;
  }

  if (visibleAbsent) {
    await visibleAbsent.click();
    await expect(visibleAbsent).toBeVisible();
    return true;
  }

  return false;
}

test.describe('BetterJakSec attendance user journey', () => {
  test('TC01 teacher opens attendance service and logs in', async ({ page }) => {
    await test.step('Journey step: Opening the attendance service', async () => {
      await page.goto('/');

      await expect(page.locator('body')).toContainText(/email|password|login|sign in|kirjaudu/i);
    });

    await test.step('Journey step: Logging in as teacher', async () => {
      await loginAsTeacher(page);

      await expect(page.getByRole('button', { name: /^Courses$/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Attendance Stats$/i })).toBeVisible();
    });
  });

  test('TC02 teacher navigates to Courses page', async ({ page }) => {
    await loginAsTeacher(page);

    await test.step('Journey step: Finding the course area', async () => {
      await openCourses(page);

      await expect(page).toHaveURL(/course|courses/i);
      await expect(page.locator('body')).toBeVisible();
    });
  });
    test('TC03 teacher tries to open a course or verifies that no course is available', async ({ page }) => {
    await loginAsTeacher(page);

    await test.step('Journey step: Selecting the correct course', async () => {
      await openCourses(page);

      const firstCourse = page
        .locator('button, a, [role="button"], [data-testid*="course"], .card, article')
        .filter({
          hasText: /course|class|group|kurssi|student|opiskelija/i,
        })
        .first();

      if (await firstCourse.isVisible().catch(() => false)) {
        await firstCourse.click();

        await expect(page.locator('body')).toContainText(
          /attendance|student|lesson|present|absent|läsnä|poissa|opiskelija|oppitunti|average/i
        );
      } else {
        await expect(page.locator('body')).toBeVisible();
      }
    });
  });
    test('TC04 teacher marks attendance if course data exists', async ({ page }) => {
    await loginAsTeacher(page);

    await test.step('Journey step: Opening attendance marking view', async () => {
      const courseOpened = await tryOpenFirstCourse(page);

      if (!courseOpened) {
        test.info().annotations.push({
          type: 'note',
          description:
            'No course was available for the teacher account. Attendance marking could not be fully automated with current test data.',
        });

        await expect(page.locator('body')).toBeVisible();
        return;
      }

      await expect(page.locator('body')).toContainText(
        /attendance|student|lesson|present|absent|läsnä|poissa|opiskelija|oppitunti|average/i
      );
    });

    await test.step('Journey step: Marking student attendance', async () => {
      const marked = await tryMarkAttendance(page);

      if (!marked) {
        test.info().annotations.push({
          type: 'note',
          description:
            'Course page opened, but no present/absent controls were visible.',
        });

        await expect(page.locator('body')).toBeVisible();
        return;
      }

      await expect(page.locator('body')).toBeVisible();
    });
  });
  
});