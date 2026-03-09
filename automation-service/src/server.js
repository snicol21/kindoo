import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const app = express();
app.use(express.json({ limit: '32kb' }));

const DEFAULT_KINDOO_URL = 'https://web.kindoo.tech/';
const PORT = Number.parseInt(process.env.PORT ?? '4001', 10);
const HEADLESS = (process.env.PLAYWRIGHT_HEADLESS ?? 'true') !== 'false';
const TIMEOUT_MS = Number.parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS ?? '30000', 10);
const RETRY_COUNT = Number.parseInt(process.env.PLAYWRIGHT_RETRY_COUNT ?? '3', 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.PLAYWRIGHT_RETRY_DELAY_MS ?? '300', 10);
const RUN_TIMEOUT_MS = Number.parseInt(process.env.PLAYWRIGHT_RUN_TIMEOUT_MS ?? '120000', 10);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function parseDateParts(dateString) {
  const [year, month, day] = dateString.split('-');
  return { year, month, day };
}

function parseTimeParts(timeString) {
  const [hourRaw, minute] = timeString.split(':');
  const hour24 = Number.parseInt(hourRaw, 10);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12Number = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hour12 = String(hour12Number).padStart(2, '0');
  return { hour12, minute, period };
}

async function clickOptional(locator) {
  try {
    await locator.click();
  } catch {
    // Optional step; ignore if missing.
  }
}

function logAutomation(requestId, message, extra = undefined) {
  if (extra) {
    console.log(`[automation:${requestId}] ${message}`, extra);
    return;
  }
  console.log(`[automation:${requestId}] ${message}`);
}

async function runStep(requestId, label, action) {
  const startedAt = Date.now();
  logAutomation(requestId, `step:start:${label}`);
  try {
    const result = await action();
    logAutomation(requestId, `step:done:${label}`, { durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logAutomation(requestId, `step:fail:${label}`, {
      durationMs: Date.now() - startedAt,
      message,
    });
    throw error;
  }
}

async function retry(action, attempts = RETRY_COUNT) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

async function withRunTimeout(requestId, action, timeoutMs = RUN_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([
      action(),
      new Promise((_, reject) => {
        timer = globalThis.setTimeout(() => {
          reject(new Error(`Automation exceeded ${timeoutMs}ms run timeout.`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logAutomation(requestId, 'run timeout/flow error', { timeoutMs, message });
    throw error;
  } finally {
    if (timer) {
      globalThis.clearTimeout(timer);
    }
  }
}

async function enableTemporaryUser(page, requestId) {
  const label = page.getByText('Temporary user', { exact: true });
  const labelContainer = label.locator('xpath=ancestor-or-self::*[self::label or self::div][1]');
  const checkbox = labelContainer.locator('input[type="checkbox"]').first();

  try {
    await checkbox.waitFor({ state: 'attached', timeout: 2000 });
    await checkbox.setChecked(true, { force: true });
    logAutomation(requestId, 'temporary user enabled via checkbox');
    return;
  } catch {
    // Fall back to switch click.
  }

  const temporarySwitch = page.getByRole('switch').nth(1);
  await temporarySwitch.waitFor({ state: 'attached', timeout: TIMEOUT_MS });
  await temporarySwitch.scrollIntoViewIfNeeded();
  await temporarySwitch.click({ force: true });
}

async function fillDateTimeRow(page, labelText, dateValue, timeValue) {
  const { month, day, year } = parseDateParts(dateValue);
  const { hour12, minute, period } = parseTimeParts(timeValue);

  const label = page.getByText(labelText, { exact: true });
  const row = label.locator(
    'xpath=ancestor::div[contains(@class,"css-g5y9jx")][1]/following-sibling::div[1]'
  );

  const monthField = row.locator('[role="spinbutton"][aria-label="Month"]').first();
  const dayField = row.locator('[role="spinbutton"][aria-label="Day"]').first();
  const yearField = row.locator('[role="spinbutton"][aria-label="Year"]').first();
  const hourField = row.locator('[role="spinbutton"][aria-label="Hours"]').first();
  const minuteField = row.locator('[role="spinbutton"][aria-label="Minutes"]').first();
  const meridiemField = row.locator('[role="spinbutton"][aria-label="Meridiem"]').first();

  await retry(() => monthField.waitFor({ state: 'visible', timeout: TIMEOUT_MS }));

  await retry(async () => {
    await monthField.click();
    await monthField.fill(month);
    await dayField.click();
    await dayField.fill(day);
    await yearField.click();
    await yearField.fill(year);
  });

  await retry(async () => {
    await hourField.click();
    await hourField.fill(hour12);
    await minuteField.click();
    await minuteField.fill(minute);
    await meridiemField.click();
    try {
      await meridiemField.fill(period);
    } catch {
      await meridiemField.fill(period.charAt(0));
    }
  });
}

async function selectAccessRule(page, kindooAccessRule) {
  const rule = (kindooAccessRule ?? '').trim();
  if (!rule) {
    return;
  }

  const allowed = new Set(['STAKE CENTER - LIMITED', 'MAPLES BUILDING - LIMITED']);
  if (!allowed.has(rule)) {
    throw new Error(`Invalid KINDOO_ACCESS_RULE: ${rule}`);
  }

  await clickOptional(page.getByText('Access rule', { exact: true }));
  await clickOptional(page.getByText('Next'));
  await clickOptional(page.getByText(rule));
  await clickOptional(page.getByText('SAVE').nth(1));
}

async function checkAlreadyInvited(page, requestId, email) {
  const modalTitle = page.getByText('User invitation', { exact: true });
  try {
    await modalTitle.waitFor({ state: 'visible', timeout: 2000 });
  } catch {
    return false;
  }

  const alreadyInvitedText = page.getByText('already invited to this site');
  try {
    await alreadyInvitedText.waitFor({ state: 'visible', timeout: 2000 });
  } catch {
    return false;
  }

  await page.getByText('Ok', { exact: true }).click();
  logAutomation(requestId, 'user already invited', { email });
  return true;
}

async function performLogin({
  page,
  requestId,
  kindooUrl,
  kindooEmail,
  kindooChurchUsername,
  kindooChurchPassword,
}) {
  logAutomation(requestId, 'submitting login flow');
  const emailField = page.getByRole('textbox', { name: 'Email' });
  await runStep(requestId, 'login-email', async () => {
    await emailField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    await emailField.click();
    await emailField.fill(kindooEmail);
    await page.getByText('Next').click();
  });

  const churchUsernameField = page.getByRole('textbox', { name: 'Sign in to your church' });
  await runStep(requestId, 'login-church-username', async () => {
    try {
      await churchUsernameField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    } catch {
      logAutomation(requestId, 'church username not visible after Next; waiting for redirect');
      await page
        .waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS })
        .catch(() => undefined);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await churchUsernameField.waitFor({ state: 'visible', timeout: 1500 });
          break;
        } catch {
          await page.waitForTimeout(200);
        }
      }
      if (!(await churchUsernameField.isVisible().catch(() => false))) {
        logAutomation(requestId, 'church username still not visible; retrying with Enter', {
          url: page.url(),
        });
        await emailField.press('Enter');
        await churchUsernameField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
      }
    }
    await churchUsernameField.fill(kindooChurchUsername);
    await page.getByRole('button', { name: 'Next' }).click();
  });

  const passwordField = page.getByRole('textbox', { name: 'Password' });
  await runStep(requestId, 'login-password', async () => {
    await passwordField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    await passwordField.fill(kindooChurchPassword);
    await page.getByRole('button', { name: 'Verify' }).click();
  });

  await page.waitForURL(/web\.kindoo\.tech/i, { timeout: TIMEOUT_MS });
  await page.waitForLoadState('domcontentloaded');
  logAutomation(requestId, 'login flow completed');

  if (!page.url().startsWith(kindooUrl)) {
    await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });
  }
}

async function isLoginScreenVisible(page) {
  const emailCandidates = [
    page.getByRole('textbox', { name: 'Email' }).first(),
    page.getByRole('textbox', { name: /email/i }).first(),
    page.getByPlaceholder(/email/i).first(),
  ];

  for (const candidate of emailCandidates) {
    try {
      await candidate.waitFor({ state: 'visible', timeout: 1500 });
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function isAddUserFormVisible(page) {
  const candidates = [
    page.getByRole('textbox', { name: 'Email of the new user' }).first(),
    page.getByRole('textbox', { name: /email of the new user/i }).first(),
  ];

  for (const candidate of candidates) {
    try {
      await candidate.waitFor({ state: 'visible', timeout: 1500 });
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function openAddUserFlow(page, requestId) {
  if (await isAddUserFormVisible(page)) {
    logAutomation(requestId, 'add user form already visible');
    return;
  }

  logAutomation(requestId, 'opening stake/account selector');
  const stakeSelector = page.getByText('West Jordan Utah Maples Stake', { exact: true });
  await stakeSelector.waitFor({ state: 'visible', timeout: 1500 });
  await stakeSelector.click();

  logAutomation(requestId, 'opening users menu');
  const usersMenu = page.getByText('Users', { exact: true });
  await usersMenu.waitFor({ state: 'visible', timeout: 1500 });
  await usersMenu.click();

  logAutomation(requestId, 'opening add users action');
  const addUsers = page.getByText('Add Users', { exact: true });
  await addUsers.waitFor({ state: 'visible', timeout: 1500 });
  await addUsers.click();

  logAutomation(requestId, 'selecting single user option');
  const singleUserOption = page.getByText('Add a single user', { exact: true });
  await singleUserOption.waitFor({ state: 'visible', timeout: 1500 });
  await singleUserOption.click();

  if (!(await isAddUserFormVisible(page))) {
    throw new Error('Unable to open the Add User form.');
  }
}

export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return 'Request body must be a JSON object.';
  }

  const required = [
    'email',
    'description',
    'timezone',
    'startDate',
    'startTime',
    'endDate',
    'endTime',
  ];

  for (const key of required) {
    if (!payload[key] || typeof payload[key] !== 'string') {
      return `Missing or invalid field: ${key}`;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)) {
    return 'startDate must be YYYY-MM-DD.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate)) {
    return 'endDate must be YYYY-MM-DD.';
  }

  if (!/^\d{2}:\d{2}$/.test(payload.startTime)) {
    return 'startTime must be HH:mm.';
  }

  if (!/^\d{2}:\d{2}$/.test(payload.endTime)) {
    return 'endTime must be HH:mm.';
  }

  if (payload.kindooAccessRule !== undefined) {
    if (typeof payload.kindooAccessRule !== 'string') {
      return 'kindooAccessRule must be a string when provided.';
    }

    const allowed = new Set(['STAKE CENTER - LIMITED', 'MAPLES BUILDING - LIMITED']);
    if (!allowed.has(payload.kindooAccessRule.trim())) {
      return 'kindooAccessRule must be either "STAKE CENTER - LIMITED" or "MAPLES BUILDING - LIMITED".';
    }
  }

  return null;
}

export async function createAutomationRuntime(requestId = randomUUID()) {
  let browser;
  let context;
  let page;
  try {
    logAutomation(requestId, 'launching chromium');
    browser = await chromium.launch({ headless: HEADLESS });
    logAutomation(requestId, 'creating browser context');
    const contextOptions = {
      viewport: { width: 1280, height: 800 },
    };
    context = await browser.newContext(contextOptions);
    logAutomation(requestId, 'creating page');
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    return { browser, context, page };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    logAutomation(requestId, 'failed to initialize browser', { message });
    if (context) await context.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    throw error;
  }
}

export async function disposeAutomationRuntime(runtime) {
  if (!runtime) return;
  await runtime.context?.close().catch(() => undefined);
  await runtime.browser?.close().catch(() => undefined);
}

export async function runAutomation(payload, requestId, runtime = null) {
  const kindooUrl = process.env.KINDOO_URL ?? DEFAULT_KINDOO_URL;
  const kindooEmail = requireEnv('KINDOO_EMAIL');
  const kindooChurchUsername = requireEnv('KINDOO_CHURCH_USERNAME');
  const kindooChurchPassword = requireEnv('KINDOO_CHURCH_PASSWORD');
  const automationStartedAt = Date.now();
  const ownsRuntime = !runtime;

  if (!runtime) {
    runtime = await createAutomationRuntime(requestId);
  }

  const { page } = runtime;

  try {
    return await withRunTimeout(requestId, async () => {
      logAutomation(requestId, 'starting automation run', {
        email: payload.email,
        startDate: payload.startDate,
        startTime: payload.startTime,
        endDate: payload.endDate,
        endTime: payload.endTime,
        kindooAccessRule: payload.kindooAccessRule ?? null,
      });
      logAutomation(requestId, 'navigating to kindoo');
      await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });
      logAutomation(requestId, 'kindoo page loaded');
      const loginVisible = await isLoginScreenVisible(page);
      const sessionReused = !loginVisible;
      logAutomation(requestId, `login screen visible: ${loginVisible}`);
      if (loginVisible) {
        logAutomation(requestId, 'no valid session found; performing login');
        await performLogin({
          page,
          requestId,
          kindooUrl,
          kindooEmail,
          kindooChurchUsername,
          kindooChurchPassword,
        });
      } else {
        logAutomation(requestId, 'reusing existing authenticated session');
      }

      await runStep(requestId, 'open-add-user-flow', async () => {
        await openAddUserFlow(page, requestId);
      });

      await runStep(requestId, 'fill-user-email', async () => {
        await page.getByRole('textbox', { name: 'Email of the new user' }).fill(payload.email);
      });

      await runStep(requestId, 'toggle-temporary-user', async () => {
        await enableTemporaryUser(page, requestId);
      });

      await runStep(requestId, 'fill-access-window', async () => {
        await fillDateTimeRow(
          page,
          'Rights activated starting:',
          payload.startDate,
          payload.startTime
        );
        await fillDateTimeRow(page, 'User expiry date and time', payload.endDate, payload.endTime);
      });

      await runStep(requestId, 'save-user', async () => {
        await page.getByRole('textbox', { name: 'Description' }).fill(payload.description);
        await page.getByText('SAVE').click();
      });
      if (await checkAlreadyInvited(page, requestId, payload.email)) {
        return {
          status: 'completed',
          completionType: 'existing-active-license',
          statusDetails: 'User already has an active Kindoo license.',
          sessionReused,
          durationMs: Date.now() - automationStartedAt,
        };
      }
      await runStep(requestId, 'confirm-save', async () => {
        await clickOptional(page.getByText('Yes'));
      });
      await runStep(requestId, 'select-access-rule', async () => {
        await selectAccessRule(page, payload.kindooAccessRule);
      });

      logAutomation(requestId, 'automation run completed');

      return {
        status: 'completed',
        completionType: 'temporary-license-created',
        statusDetails: 'Temporary Kindoo license was created successfully.',
        sessionReused,
        durationMs: Date.now() - automationStartedAt,
      };
    });
  } finally {
    if (ownsRuntime) {
      await disposeAutomationRuntime(runtime);
    }
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/run', async (req, res) => {
  const requestId = req.get('x-request-id')?.trim() || randomUUID();
  const startedAt = Date.now();
  const token = process.env.AUTOMATION_SERVICE_TOKEN;
  if (token && req.get('x-automation-token') !== token) {
    logAutomation(requestId, 'unauthorized request');
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const error = validatePayload(req.body);
  if (error) {
    logAutomation(requestId, 'payload validation failed', { error });
    return res.status(400).json({ error });
  }

  try {
    logAutomation(requestId, 'request accepted');
    const result = await runAutomation(req.body, requestId);
    const totalDurationMs = Date.now() - startedAt;
    logAutomation(requestId, 'request finished', { durationMs: totalDurationMs, result });
    return res.json({ ok: true, result, requestId, durationMs: totalDurationMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    logAutomation(requestId, 'request failed', {
      durationMs: Date.now() - startedAt,
      message,
    });
    return res.status(500).json({ error: 'Automation failed.', details: message, requestId });
  }
});

function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kindoo automation service listening on 0.0.0.0:${PORT}`);
  });
}

const isMainModule = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  startServer();
}
