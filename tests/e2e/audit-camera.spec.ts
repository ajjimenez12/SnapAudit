import { expect, type Page, test } from '@playwright/test';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

const watchConsoleErrors = (page: Page) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('[vite]') || text.includes('WebSocket connection')) return;
    consoleErrors.push(text);
  });
  return consoleErrors;
};

const startSession = async (page: Page, store = '1851') => {
  await page.goto('/?testAuth=1');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();

  const firstAudit = page.getByText('Start your first audit');
  if (await firstAudit.isVisible()) {
    await firstAudit.click();
  } else {
    await page.getByRole('button', { name: 'New audit session' }).click();
  }

  await page.locator('select').selectOption(store);
  await expect(page.getByPlaceholder('YYYY/MM/DD - XXXX')).toHaveValue(new RegExp(store));
  await page.getByRole('button', { name: 'Start Session' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
  });
};

test('creates an audit, pinch zooms camera, captures, tags, and stores photo metadata without image payload', async ({ page }) => {
  const consoleErrors = watchConsoleErrors(page);

  await startSession(page);

  await expect(page.getByText('1.0x')).toBeVisible();
  await page.getByTestId('camera-pinch-surface').evaluate((surface) => {
    const target = surface as HTMLElement;
    const startA = new Touch({ identifier: 1, target, clientX: 140, clientY: 260 });
    const startB = new Touch({ identifier: 2, target, clientX: 220, clientY: 260 });
    const moveA = new Touch({ identifier: 1, target, clientX: 100, clientY: 260 });
    const moveB = new Touch({ identifier: 2, target, clientX: 260, clientY: 260 });

    target.dispatchEvent(new TouchEvent('touchstart', { touches: [startA, startB], bubbles: true, cancelable: true }));
    target.dispatchEvent(new TouchEvent('touchmove', { touches: [moveA, moveB], bubbles: true, cancelable: true }));
    target.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true, cancelable: true }));
  });
  await expect(page.getByText('2.0x')).toBeVisible();

  await page.waitForFunction(() => {
    const video = document.querySelector('video');
    return !!video && video.readyState >= 2 && video.videoWidth > 0;
  });

  await page.getByRole('button', { name: 'Take snapshot' }).click();

  await expect(page.getByText('Tag Photo')).toBeVisible();
  await page.locator('textarea').fill('E2E zoom capture');
  await page.getByText('Save Entry').click();

  await expect(page.getByText('2.0x')).toBeVisible();

  const storageState = await page.evaluate(() => ({
    photos: localStorage.getItem('snapaudit_photos:local-test-user'),
    sessions: localStorage.getItem('snapaudit_sessions:local-test-user'),
  }));

  expect(storageState.sessions).toContain('1851');
  expect(storageState.photos).toContain('E2E zoom capture');
  expect(storageState.photos).not.toContain('imageData');
  expect(consoleErrors).toEqual([]);
});

test('uploads a photo, edits it from the report, and keeps the edited entry visible', async ({ page }) => {
  const consoleErrors = watchConsoleErrors(page);

  await startSession(page, '1852');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'upload-test.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });

  await expect(page.getByText('Tag Photo')).toBeVisible();
  await page.locator('select').selectOption('Product');
  await page.locator('textarea').fill('Uploaded fallback photo');
  await page.getByText('Save Entry').click();

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('Uploaded fallback photo')).toBeVisible();
  await expect(page.getByText('PRODUCT')).toBeVisible();

  await page.locator('img[alt="Product"]').click();
  await expect(page.getByText('Edit Entry')).toBeVisible();
  await page.locator('select').selectOption('Cleanliness');
  await page.locator('textarea').fill('Edited report comment');
  await page.getByText('Save Changes').click();

  await expect(page.getByText('Edited report comment')).toBeVisible();
  await expect(page.getByText('CLEANLINESS')).toBeVisible();
  await expect(consoleErrors).toEqual([]);
});

test('filters history by store and deletes a session', async ({ page }) => {
  const consoleErrors = watchConsoleErrors(page);
  const now = Date.now();

  await page.addInitScript(({ createdAt }) => {
    localStorage.setItem('snapaudit_sessions:local-test-user', JSON.stringify([
      { id: 'session-1851', title: '2026/04/27-1851', location: '1851', createdAt },
      { id: 'session-1852', title: '2026/04/27-1852', location: '1852', createdAt: createdAt - 1000 },
    ]));
  }, { createdAt: now });

  await page.goto('/?testAuth=1');
  await page.getByText('History').click();
  await expect(page.getByText('Audit History')).toBeVisible();

  await page.getByText('All Stores').click();
  await page.getByRole('button', { name: 'Store 1852' }).click();
  await expect(page.getByText('2026/04/27-1852')).toBeVisible();
  await expect(page.getByText('2026/04/27-1851')).toBeHidden();
  await page.evaluate(() => {
    const backdrop = Array.from(document.querySelectorAll('div')).find((element) =>
      String(element.className).includes('fixed inset-0 z-10')
    );
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: 'Store 1851' })).toBeHidden();

  await page.getByLabel('Delete session').click();
  await expect(page.getByText('Delete Session')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).last().click();

  await expect(page.getByText('No sessions found')).toBeVisible();

  const sessionsJson = await page.evaluate(() => localStorage.getItem('snapaudit_sessions:local-test-user'));
  expect(sessionsJson).not.toContain('session-1852');
  expect(consoleErrors).toEqual([]);
});
