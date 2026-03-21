import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
const MAX_LOG_LINES_PER_RUN = 1500;

const automationRunLogs = new Map();

function serializeLogExtra(extra) {
  try {
    return JSON.stringify(extra);
  } catch {
    return '[unserializable-extra]';
  }
}

function appendAutomationRunLog(requestId, line) {
  const existing = automationRunLogs.get(requestId) ?? [];
  existing.push(line);
  if (existing.length > MAX_LOG_LINES_PER_RUN) {
    existing.splice(0, existing.length - MAX_LOG_LINES_PER_RUN);
  }
  automationRunLogs.set(requestId, existing);
}

export function consumeAutomationRunLog(requestId) {
  const lines = automationRunLogs.get(requestId) ?? [];
  automationRunLogs.delete(requestId);
  return lines.join('\n');
}

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

async function clickOptional(locator, timeoutMs = 1500) {
  try {
    const target = locator.first();
    await target.waitFor({ state: 'visible', timeout: timeoutMs });
    await target.click({ timeout: timeoutMs });
    return true;
  } catch {
    // Optional step; ignore if missing.
    return false;
  }
}

function logAutomation(requestId, message, extra = undefined) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [automation:${requestId}] ${message}`;

  if (extra) {
    console.log(`[automation:${requestId}] ${message}`, extra);
    appendAutomationRunLog(requestId, `${prefix} ${serializeLogExtra(extra)}`);
    return;
  }
  console.log(`[automation:${requestId}] ${message}`);
  appendAutomationRunLog(requestId, prefix);
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

async function selectAccessRule(page, kindooAccessRule, requestId) {
  const rule = (kindooAccessRule ?? '').trim();
  if (!rule) {
    return;
  }

  // This prompt can appear after invitation confirmation and blocks all rule selectors.
  await acceptAccessRightsPrompt(page, requestId);

  const allowed = new Set(['STAKE CENTER - LIMITED', 'MAPLES BUILDING - LIMITED']);
  if (!allowed.has(rule)) {
    throw new Error(`Invalid KINDOO_ACCESS_RULE: ${rule}`);
  }

  const rulePattern =
    rule === 'STAKE CENTER - LIMITED'
      ? /stake\s*center\s*-\s*limited/i
      : /maples\s*building\s*-\s*limited/i;

  // The flow is a little dynamic in Kindoo, so we allow a couple of navigation
  // paths into the access-rule screen, but we require the actual rule + save.
  const ruleOption = page.getByText(rulePattern).first();

  const canSeeRuleNow = await ruleOption
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);

  if (!canSeeRuleNow) {
    const clickedAccessRuleTab = await clickOptional(
      page.getByText('Access rule', { exact: true }),
      3000
    );
    const clickedNext =
      (await clickOptional(page.getByRole('button', { name: /^Next$/i }), 3000)) ||
      (await clickOptional(page.getByText('Next', { exact: true }), 3000));

    logAutomation(requestId, 'access rule navigation attempted', {
      clickedAccessRuleTab,
      clickedNext,
    });
  }

  let clickedRule = false;
  for (let attempt = 1; attempt <= 3 && !clickedRule; attempt += 1) {
    const clickedRuleRow = await clickFirstVisible(
      [
        page.locator('div[tabindex="0"]', { hasText: rulePattern }),
        page.locator('div[role="button"]', { hasText: rulePattern }),
      ],
      3000
    );

    if (clickedRuleRow) {
      clickedRule = true;
      break;
    }

    const ruleMatches = page.getByText(rulePattern);
    const matchCount = await ruleMatches.count();
    for (let i = 0; i < Math.min(matchCount, 40); i += 1) {
      const match = ruleMatches.nth(i);
      const visible = await match.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      const selectableRow = match.locator('xpath=ancestor::div[@tabindex="0"][1]').first();
      const rowVisible = await selectableRow.isVisible().catch(() => false);

      if (rowVisible) {
        await selectableRow.click({ timeout: 5000, force: true });
      } else {
        await match.click({ timeout: 5000, force: true });
      }

      clickedRule = true;
      break;
    }

    if (!clickedRule) {
      await page.mouse.wheel(0, 800).catch(() => undefined);
      await page.waitForTimeout(350);
    }
  }

  if (!clickedRule) {
    const ruleTotalMatches = await page
      .getByText(rulePattern)
      .count()
      .catch(() => 0);
    await captureDebugArtifacts(page, requestId, 'access-rule-not-visible');
    throw new Error(
      `Access rule option not visible for selection: ${rule} (matches=${ruleTotalMatches}).`
    );
  }

  let clickedSave = false;
  const saveCandidates = [
    page.getByRole('button', { name: /^SAVE$/i }),
    page.getByText('SAVE', { exact: true }),
  ];

  for (const candidate of saveCandidates) {
    const count = await candidate.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const control = candidate.nth(i);
      const visible = await control.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      await control.click({ timeout: 5000, force: true });
      clickedSave = true;
      break;
    }

    if (clickedSave) {
      break;
    }
  }

  if (!clickedSave) {
    throw new Error('Access rule SAVE button not visible after selecting rule.');
  }

  logAutomation(requestId, 'access rule saved', { rule });
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

async function confirmSaveDialogs(page, requestId) {
  const confirmCandidates = [
    page.getByRole('button', { name: /^Yes$/i }).first(),
    page.getByText('Yes', { exact: true }).first(),
    page.getByRole('button', { name: /^Confirm$/i }).first(),
    page.getByText('Confirm', { exact: true }).first(),
    page.getByRole('button', { name: /^OK$/i }).first(),
    page.getByRole('button', { name: /^Ok$/i }).first(),
    page.getByText('OK', { exact: true }).first(),
    page.getByText('Ok', { exact: true }).first(),
  ];

  for (const candidate of confirmCandidates) {
    try {
      await candidate.waitFor({ state: 'visible', timeout: 1200 });
      await candidate.click({ timeout: 5000, force: true });
      logAutomation(requestId, 'post-save dialog confirmed');
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function acceptAccessRightsPrompt(page, requestId) {
  const accessRightsPrompt = page.getByText(/define the access rights/i).first();
  const promptVisible = await accessRightsPrompt
    .waitFor({ state: 'visible', timeout: 1200 })
    .then(() => true)
    .catch(() => false);

  if (!promptVisible) {
    return false;
  }

  const clickedYes = await clickFirstVisible(
    [
      page.getByRole('button', { name: /^Yes$/i }),
      page.getByText('Yes', { exact: true }),
      page.locator('div[tabindex="0"]', { hasText: /^Yes$/i }),
    ],
    4000
  );

  if (!clickedYes) {
    throw new Error('Access-rights prompt appeared but the Yes action was not clickable.');
  }

  logAutomation(requestId, 'accepted access-rights prompt');
  await page.waitForTimeout(250);
  return true;
}

async function waitForPostSaveTransition(page, requestId, timeoutMs = 15000) {
  const loadingText = page.getByText('Loading...', { exact: true }).first();

  const loadingVisible = await loadingText
    .waitFor({ state: 'visible', timeout: 1200 })
    .then(() => true)
    .catch(() => false);

  if (!loadingVisible) {
    return;
  }

  logAutomation(requestId, 'post-save loading state detected; waiting for transition');
  await loadingText.waitFor({ state: 'hidden', timeout: timeoutMs }).catch(() => undefined);
}

async function detectPostSaveBlockingError(page, requestId) {
  const expiredText = page.getByText(/expiry date already expired/i).first();
  const expiredVisible = await expiredText
    .waitFor({ state: 'visible', timeout: 1000 })
    .then(() => true)
    .catch(() => false);

  if (!expiredVisible) {
    return null;
  }

  await clickFirstVisible(
    [
      page.getByRole('button', { name: /^Ok$/i }),
      page.getByRole('button', { name: /^OK$/i }),
      page.getByText('Ok', { exact: true }),
      page.getByText('OK', { exact: true }),
    ],
    3000
  ).catch(() => undefined);

  logAutomation(requestId, 'post-save blocking modal detected', {
    reason: 'expiry-date-already-expired',
  });

  return 'Expiry date already expired in Kindoo. Please provide a future expiry date/time.';
}

async function waitForPostLoginReady(page, requestId, timeoutMs = TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastUrl = page.url();
  let nonLoginIterations = 0;

  while (Date.now() - startedAt < timeoutMs) {
    await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => undefined);

    const currentUrl = page.url();
    if (currentUrl && currentUrl !== lastUrl) {
      logAutomation(requestId, 'post-login redirect observed', { from: lastUrl, to: currentUrl });
      lastUrl = currentUrl;
    }

    const loginVisible = await isLoginScreenVisible(page);
    if (!loginVisible) {
      nonLoginIterations += 1;
      if (await isUsersMenuVisible(page)) {
        return;
      }
      if (await isAddUserFormVisible(page)) {
        return;
      }
      // If login is gone for a few checks, proceed and force a navigation to home.
      if (nonLoginIterations >= 3) {
        return;
      }
    } else {
      nonLoginIterations = 0;
    }

    await page.waitForTimeout(250);
  }

  throw new Error('Login did not reach an authenticated page before timeout.');
}

async function captureDebugArtifacts(page, requestId, label) {
  try {
    const safeLabel = String(label).replace(/[^a-zA-Z0-9-_]/g, '-');
    const debugDir = join(process.cwd(), '.playwright', 'debug');
    await mkdir(debugDir, { recursive: true });

    const screenshotPath = join(debugDir, `${requestId}-${safeLabel}.png`);
    const htmlPath = join(debugDir, `${requestId}-${safeLabel}.html`);
    const metaPath = join(debugDir, `${requestId}-${safeLabel}.json`);

    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    const html = await page.content().catch(() => '');
    await writeFile(htmlPath, html, 'utf8').catch(() => undefined);
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          requestId,
          label,
          capturedAt: new Date().toISOString(),
          url: page.url(),
          title: await page.title().catch(() => null),
        },
        null,
        2
      ),
      'utf8'
    ).catch(() => undefined);

    logAutomation(requestId, 'debug artifacts captured', {
      screenshotPath,
      htmlPath,
      metaPath,
    });
  } catch {
    // Best effort only.
  }
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
  const passwordField = page.getByRole('textbox', { name: 'Password' });

  const churchUsernameCandidates = [
    page.getByRole('textbox', { name: 'Sign in to your church' }).first(),
    page.getByRole('textbox', { name: /church|username|sign in/i }).first(),
    page.getByPlaceholder(/church|username|sign in/i).first(),
    page.locator('input[type="text"][name*="user" i]').first(),
    page.locator('input[type="text"][id*="user" i]').first(),
  ];

  async function getVisibleChurchUsernameField(timeoutMs = 1200) {
    for (const candidate of churchUsernameCandidates) {
      try {
        await candidate.waitFor({ state: 'visible', timeout: timeoutMs });
        return candidate;
      } catch {
        // Try next candidate.
      }
    }
    return null;
  }

  await runStep(requestId, 'login-email', async () => {
    await emailField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    await emailField.click();
    await emailField.fill(kindooEmail);
    await page.getByText('Next').click();
  });

  await runStep(requestId, 'login-church-username', async () => {
    let churchUsernameField = await getVisibleChurchUsernameField(2000);

    if (!churchUsernameField) {
      logAutomation(requestId, 'church username not visible after Next; waiting for redirect');
      await page
        .waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS })
        .catch(() => undefined);

      const deadline = Date.now() + TIMEOUT_MS;
      while (Date.now() < deadline) {
        churchUsernameField = await getVisibleChurchUsernameField(750);
        if (churchUsernameField) {
          break;
        }

        if (await passwordField.isVisible().catch(() => false)) {
          logAutomation(
            requestId,
            'church username step skipped; password field is already visible',
            {
              url: page.url(),
            }
          );
          return;
        }

        await page.waitForTimeout(200);
      }

      if (!churchUsernameField) {
        logAutomation(requestId, 'church username still not visible; retrying with Enter', {
          url: page.url(),
        });
        await emailField.press('Enter');
        churchUsernameField = await getVisibleChurchUsernameField(TIMEOUT_MS);
      }

      if (!churchUsernameField && (await passwordField.isVisible().catch(() => false))) {
        logAutomation(requestId, 'continuing login without church username after Enter retry', {
          url: page.url(),
        });
        return;
      }

      if (!churchUsernameField) {
        throw new Error(
          `Church username step did not appear and password field was not visible. Current URL: ${page.url()}`
        );
      }
    }

    await churchUsernameField.fill(kindooChurchUsername);
    await page.getByRole('button', { name: 'Next' }).click();
  });

  await runStep(requestId, 'login-password', async () => {
    await passwordField.waitFor({ state: 'visible', timeout: TIMEOUT_MS });
    await passwordField.fill(kindooChurchPassword);
    await page.getByRole('button', { name: 'Verify' }).click();
  });

  await runStep(requestId, 'login-complete', async () => {
    try {
      await page.waitForURL(/web\.kindoo\.tech/i, {
        timeout: Math.min(TIMEOUT_MS, 20000),
        waitUntil: 'domcontentloaded',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown waitForURL error.';
      const firstLine = message.split('\n')[0]?.trim() || message;
      const isExpectedRedirectChurn =
        /ERR_ABORTED|frame was detached|Execution context was destroyed/i.test(message);

      if (isExpectedRedirectChurn) {
        logAutomation(requestId, 'waitForURL interrupted by OAuth redirect churn; using fallback');
      } else {
        logAutomation(requestId, 'waitForURL after Verify did not settle; falling back', {
          message: firstLine,
        });
      }
    }

    await waitForPostLoginReady(page, requestId, TIMEOUT_MS);

    // Land on a deterministic entry page before continuing navigation.
    await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    logAutomation(requestId, 'post-login home navigation complete', { url: page.url() });
  });

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

async function isUsersMenuVisible(page) {
  const candidates = [
    page.getByText('Users', { exact: true }).first(),
    page.getByRole('button', { name: /^Users$/i }).first(),
    page.getByRole('link', { name: /^Users$/i }).first(),
  ];

  for (const candidate of candidates) {
    try {
      await candidate.waitFor({ state: 'visible', timeout: 1200 });
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function waitForKindooShell(page, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isAddUserFormVisible(page)) {
      return true;
    }

    if (await isUsersMenuVisible(page)) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function enterSiteFromMySites(page, requestId) {
  const mySitesHeader = page.getByText('My sites', { exact: true }).first();
  const onMySites = await mySitesHeader
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);

  if (!onMySites) {
    return false;
  }

  logAutomation(requestId, 'detected My sites page; entering site card');

  const clickableSiteCardCandidates = [
    // Preferred: target the known site name and click its clickable card container.
    page
      .getByText('West Jordan Utah Maples Stake', { exact: true })
      .first()
      .locator('xpath=ancestor::div[@tabindex="0"][1]'),
    page
      .getByText(/West Jordan Utah Maples Stake/i)
      .first()
      .locator('xpath=ancestor::div[@tabindex="0"][1]'),
    // Fallback: any visible site card with manager text.
    page.locator('div[tabindex="0"]', { hasText: 'You are a manager of this site' }).first(),
    // Last fallback: first visible site card.
    page.locator('div[tabindex="0"]').first(),
  ];

  for (const candidate of clickableSiteCardCandidates) {
    try {
      await candidate.waitFor({ state: 'visible', timeout: 2500 });
      await candidate.click({ timeout: 5000, force: true });
      await page.waitForTimeout(700);

      if (await isUsersMenuVisible(page)) {
        logAutomation(requestId, 'entered site card and found Users menu');
        return true;
      }
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function waitForAddUserForm(page, timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isAddUserFormVisible(page)) {
      return true;
    }
    await page.waitForTimeout(250);
  }

  return false;
}

async function clickFirstVisible(candidates, timeoutMs = 4000) {
  for (const candidate of candidates) {
    try {
      const target = candidate.first();
      await target.waitFor({ state: 'visible', timeout: timeoutMs });
      await target.click({ timeout: timeoutMs });
      return true;
    } catch {
      // Try next candidate.
    }
  }

  return false;
}

async function openAddUserFlow(page, requestId, kindooUrl) {
  let shellReady = await waitForKindooShell(page, 12000);
  if (!shellReady) {
    const enteredSite = await enterSiteFromMySites(page, requestId);
    if (enteredSite) {
      shellReady = await waitForKindooShell(page, 12000);
    }
  }

  if (!shellReady) {
    logAutomation(requestId, 'kindoo shell not ready after login; forcing home navigation');
    await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });

    if (!(await waitForKindooShell(page, 4000))) {
      const enteredSite = await enterSiteFromMySites(page, requestId);
      if (enteredSite) {
        shellReady = await waitForKindooShell(page, Math.min(TIMEOUT_MS, 15000));
      }
    }

    if (!shellReady) {
      shellReady = await waitForKindooShell(page, Math.min(TIMEOUT_MS, 15000));
    }
  }

  if (!shellReady) {
    await captureDebugArtifacts(page, requestId, 'kindoo-shell-not-ready');
    throw new Error('Kindoo shell did not become ready (Users/Add User not visible).');
  }

  if (await waitForAddUserForm(page, 2000)) {
    logAutomation(requestId, 'add user form already visible');
    return;
  }

  const usersAlreadyVisible = await isUsersMenuVisible(page);
  if (!usersAlreadyVisible) {
    logAutomation(requestId, 'opening stake/account selector');
    const clickedAccountSelector = await clickFirstVisible(
      [
        page.getByText('West Jordan Utah Maples Stake', { exact: true }),
        page.getByText(/West Jordan Utah Maples Stake/i),
        page.getByRole('button', { name: /maples stake|west jordan|stake/i }),
        page.getByText(/stake/i),
      ],
      10000
    );
    logAutomation(requestId, 'account selector click attempted', { clickedAccountSelector });
    await page.waitForTimeout(400);
  }

  logAutomation(requestId, 'opening users menu');
  let clickedUsersMenu = await clickFirstVisible(
    [
      page.getByText('Users', { exact: true }),
      page.getByRole('button', { name: /^Users$/i }),
      page.getByRole('link', { name: /^Users$/i }),
      page.getByText(/users/i),
    ],
    10000
  );

  if (!clickedUsersMenu) {
    logAutomation(requestId, 'users menu not found; reloading kindoo home and retrying');
    await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });
    await waitForKindooShell(page, 12000);
    clickedUsersMenu = await clickFirstVisible(
      [
        page.getByText('Users', { exact: true }),
        page.getByRole('button', { name: /^Users$/i }),
        page.getByRole('link', { name: /^Users$/i }),
        page.getByText(/users/i),
      ],
      10000
    );
  }

  if (!clickedUsersMenu) {
    throw new Error('Unable to open Users menu.');
  }

  logAutomation(requestId, 'opening add users action');
  const clickedAddUsers = await clickFirstVisible(
    [
      page.getByText('Add Users', { exact: true }),
      page.getByRole('button', { name: /^Add Users$/i }),
      page.getByRole('link', { name: /^Add Users$/i }),
      page.getByText(/add users/i),
    ],
    6000
  );
  if (!clickedAddUsers) {
    throw new Error('Unable to open Add Users action.');
  }

  logAutomation(requestId, 'selecting single user option');
  const clickedSingleUser = await clickFirstVisible(
    [
      page.getByText('Add a single user', { exact: true }),
      page.getByRole('button', { name: /add a single user/i }),
      page.getByText(/single user/i),
    ],
    6000
  );
  if (!clickedSingleUser) {
    throw new Error('Unable to choose Add a single user option.');
  }

  if (!(await waitForAddUserForm(page, Math.min(TIMEOUT_MS, 15000)))) {
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
        await openAddUserFlow(page, requestId, kindooUrl);
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

      const postSaveError = await detectPostSaveBlockingError(page, requestId);
      if (postSaveError) {
        throw new Error(postSaveError);
      }

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
        await confirmSaveDialogs(page, requestId);
        await acceptAccessRightsPrompt(page, requestId);
        await waitForPostSaveTransition(page, requestId);
      });
      await runStep(requestId, 'select-access-rule', async () => {
        await selectAccessRule(page, payload.kindooAccessRule, requestId);
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
