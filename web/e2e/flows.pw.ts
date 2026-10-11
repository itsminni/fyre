import { expect, test } from '@playwright/test';
import { Backend } from './backend';

test('network failure at startup requires verification and supports retry', async ({ page }) => {
  const backend = new Backend(); backend.sessionFails = true; await backend.install(page);
  await page.goto('/app/messages');
  await expect(page.getByText('Impossibile verificare la sessione.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi', exact: true })).toHaveCount(0);
  backend.sessionFails = false;
  await page.getByRole('button', { name: 'Riprova', exact: true }).click();
  await expect(page.locator('.thread-row')).toHaveCount(1);
});

test('failed sends retain their content and retry the same operation', async ({ page }) => {
  const backend = new Backend(); backend.sendFailures = 1; await backend.install(page);
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  const composer = page.getByRole('textbox', { name: 'Messaggio', exact: true });
  await composer.fill('Keep my message');
  await page.locator('.chat-composer button[type=submit]').click();
  await expect(page.getByRole('button', { name: 'Riprova invio' })).toBeVisible();
  await expect(page.getByText('Keep my message', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Riprova invio' }).click();
  await expect(page.getByRole('button', { name: 'Riprova invio' })).toHaveCount(0);
  await expect.poll(() => backend.sendBodies.length).toBe(2);
  expect(backend.sendBodies[0].operationId).toBe(backend.sendBodies[1].operationId);
  await expect.poll(() => backend.messages.filter((message) => message.text === 'Keep my message').length).toBe(1);
});

test('older history keeps the visible message and supports keyboard scrolling', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  const messages = page.locator('.chat-messages');
  await messages.focus(); await page.keyboard.press('Home');
  await expect(page.locator('[data-message-id]')).toHaveCount(100);
  await expect(page.getByText('Message 70', { exact: true })).toBeVisible();
  await messages.focus(); await page.keyboard.press('End');
  await expect(page.getByText('Message 119', { exact: true })).toBeVisible();
  await page.locator('.chat-composer').scrollIntoViewIfNeeded();
  await expect(page.getByText('Message 119', { exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Vocale', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('chat-last-row.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('discovery retains cards on network failure and refills without skipping', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  await page.goto('/app/home');
  await expect(page.locator('.swipe-deck')).toContainText('Person 0');
  await page.getByRole('button', { name: 'Salta', exact: true }).click();
  await expect(page.locator('.swipe-deck')).toContainText('Person 1');
  backend.discoveryFails = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Impossibile aggiornare i profili.')).toBeVisible();
  await expect(page.locator('.swipe-deck')).toContainText('Person 1');
  backend.discoveryFails = false;
  await page.getByRole('button', { name: 'Riprova', exact: true }).click();
  await expect(page.getByText('Impossibile aggiornare i profili.')).toHaveCount(0);
  for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Salta', exact: true }).click();
  await expect(page.locator('.swipe-deck')).toContainText('Person 6');
  expect(backend.discoveryRequests).toBeGreaterThan(1);
});

test('autosave preserves a newer draft while a previous save is pending', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  let release: () => void = () => undefined;
  backend.profileGate = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/app/account');
  const bio = page.getByRole('textbox', { name: 'Bio', exact: true });
  await bio.fill('First draft');
  await expect.poll(() => backend.profileBodies.length).toBe(1);
  await bio.fill('Newer draft');
  release(); backend.profileGate = null;
  await expect(bio).toHaveValue('Newer draft');
  await expect.poll(() => backend.profileBodies.length).toBe(2);
  expect(backend.profileBodies[1].bio).toBe('Newer draft');
  await expect(bio).toHaveValue('Newer draft');
});

test('attachment upload can be cancelled, reconciled and retried in chunks', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  let release: () => void = () => undefined;
  backend.uploadGate = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  await page.locator('input[type=file]').setInputFiles({ name: 'test.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(6 * 1024 * 1024, 65) });
  await page.locator('.chat-composer button[type=submit]').click();
  await expect.poll(() => backend.uploads.length).toBe(1);
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Riprova invio' })).toBeVisible();
  expect(backend.sendBodies).toHaveLength(0);
  expect(backend.reconciled).toHaveLength(1);
  release(); backend.uploadGate = null;
  await page.getByRole('button', { name: 'Riprova invio' }).click();
  await expect.poll(() => backend.sendBodies.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Riprova invio' })).toHaveCount(0);
  expect(backend.uploads).toHaveLength(3);
  expect(backend.uploads[1].fileId).toBe(backend.uploads[2].fileId);
  expect(backend.uploads[1].fileId).not.toBe(backend.uploads[0].fileId);
  expect(backend.uploads[2].range).toBe(`bytes ${5 * 1024 * 1024}-${6 * 1024 * 1024 - 1}/${6 * 1024 * 1024}`);
});

test('a late history response preserves the position reached while waiting', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  let release: () => void = () => undefined;
  backend.historyGate = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  const messages = page.locator('.chat-messages');
  await messages.focus(); await page.keyboard.press('Home');
  await expect.poll(() => backend.historyRequests).toBeGreaterThan(0);
  const anchor = await messages.evaluate((container) => {
    container.scrollTop = 170;
    container.dispatchEvent(new Event('scroll'));
    const top = container.getBoundingClientRect().top;
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find((element) => element.getBoundingClientRect().bottom > top)!;
    return { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - top };
  });
  release(); backend.historyGate = null;
  await expect(page.locator('[data-message-id]')).toHaveCount(100);
  const offset = await messages.evaluate((container, id) => {
    const row = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]')).find((element) => element.dataset.messageId === id)!;
    return row.getBoundingClientRect().top - container.getBoundingClientRect().top;
  }, anchor.id);
  expect(Math.abs(offset - anchor.offset)).toBeLessThan(2);
});

test('oversized files are rejected before upload', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  await page.locator('input[type=file]').setInputFiles({ name: 'too-large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
  await expect(page.getByText('Scegliere fino a 6 allegati supportati', { exact: false })).toBeVisible();
  expect(backend.uploads).toHaveLength(0);
  await expect(page.locator('.chat-attachment-preview-list')).toHaveCount(0);
});


test('system theme changes keep message text readable and respect reduced motion', async ({ page }) => {
  const backend = new Backend(); await backend.install(page);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/app/messages/chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.chat-bubble').first()).toHaveCSS('color', 'rgb(35, 28, 21)');
  await expect(page.locator('#root')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.fade-in-up')).toHaveCSS('animation-duration', '1e-05s');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.chat-bubble').first()).toHaveCSS('color', 'rgb(246, 237, 227)');
  await page.locator('.chat-composer').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('chat-dark.png') });
});
