import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol.startsWith('http') && url.origin !== 'http://127.0.0.1:4175') {
      external.push(url.origin); return route.abort();
    }
    return route.continue();
  });
  page.on('close', () => { expect(external, 'Demo must not contact an external backend, font or geocoder').toEqual([]); });
});

test('starts without backend configuration and preserves the connected installation settings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fyre_backend_logout_pending_v1', '1');
    localStorage.setItem('fyre_web_state', '{"sentinel":"connected-app"}');
  });
  await page.goto('/app/home');
  await expect(page.getByLabel('Offline demo')).toContainText('Demo offline');
  await expect(page.locator('.swipe-deck')).toContainText('Sam');
  expect(await page.evaluate(() => localStorage.getItem('fyre_web_state'))).toBe('{"sentinel":"connected-app"}');
});

test('likes create local matches, messages and attachments work, reset restores the demo', async ({ page }) => {
  await page.goto('/app/home');
  await page.getByRole('button', { name: 'Fyre', exact: true }).click();
  await page.getByRole('button', { name: 'Apri chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Messaggio', exact: true }).fill('Messaggio offline');
  await page.locator('.chat-composer button[type=submit]').click();
  await expect(page.getByText('Messaggio offline', { exact: true })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'demo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('local demo') });
  await page.locator('.chat-composer button[type=submit]').click();
  await expect(page.getByText('demo.pdf', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Ripristina demo', exact: true }).click();
  await expect(page.locator('.swipe-deck')).toContainText('Sam');
  await page.goto('/app/messages');
  await expect(page.locator('.thread-row')).toHaveCount(1);
});

test('history reaches the first message and profile autosave remains local', async ({ page }) => {
  await page.goto('/app/messages/demo-chat');
  await expect(page.locator('[data-message-id]')).toHaveCount(50);
  const messages = page.locator('.chat-messages');
  await messages.focus(); await page.keyboard.press('Home');
  await expect(page.locator('[data-message-id]')).toHaveCount(100);
  await messages.focus(); await page.keyboard.press('Home');
  await expect(page.locator('[data-message-id]')).toHaveCount(120);
  await page.goto('/app/account');
  const bio = page.getByRole('textbox', { name: 'Bio', exact: true });
  await bio.fill('Una bio modificata nella demo');
  await expect(page.getByText('Modifiche salvate', { exact: false })).toBeVisible();
  await expect(bio).toHaveValue('Una bio modificata nella demo');
});

test('event registration, cancellation and administration work locally', async ({ page }) => {
  await page.goto('/app/events/main');
  await page.getByRole('button', { name: "Partecipa all'evento", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Annulla iscrizione', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Annulla iscrizione', exact: true }).click();
  await expect(page.getByRole('button', { name: "Partecipa all'evento", exact: true })).toBeVisible();
  await page.goto('/app/events/admin');
  const title = page.getByRole('textbox', { name: 'Titolo evento', exact: true });
  await title.fill('Evento modificato offline');
  await page.getByRole('button', { name: 'Salva modifiche', exact: true }).click();
  await expect(title).toHaveValue('Evento modificato offline');
});
