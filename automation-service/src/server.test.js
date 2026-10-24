import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';
import {
  canReplayReadOnlyRequest,
  describeEndpoint,
  findTargetUserData,
  sanitizeUsersPage,
  summarizeJson,
} from './api-probe.js';
import {
  consumeAutomationRunLog,
  createAutomationRuntime,
  disposeAutomationRuntime,
  runStep,
  waitForKindooShell,
  waitForPostLoginReady,
  withRunTimeout,
} from './server.js';

let browser;

test('worker browser profile retains cookies and local storage across restarts', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'kindoo-worker-profile-test-'));
  let runtime;
  try {
    runtime = await createAutomationRuntime('test-profile-save', { userDataDir });
    await runtime.context.route('https://worker-profile.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Profile test</title>' })
    );
    await runtime.page.goto('https://worker-profile.test/');
    await runtime.page.evaluate(() => localStorage.setItem('device', 'same-device'));
    await runtime.context.addCookies([
      {
        name: 'profile-test',
        value: 'retained',
        url: 'https://worker-profile.test/',
        expires: Math.floor(Date.now() / 1000) + 3600,
      },
    ]);
    await disposeAutomationRuntime(runtime);
    runtime = await createAutomationRuntime('test-profile-reopen', { userDataDir });
    await runtime.context.route('https://worker-profile.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Profile test</title>' })
    );
    await runtime.page.goto('https://worker-profile.test/');
    assert.equal(await runtime.page.evaluate(() => localStorage.getItem('device')), 'same-device');
    const cookies = await runtime.context.cookies('https://worker-profile.test/');
    assert.equal(cookies.find((cookie) => cookie.name === 'profile-test')?.value, 'retained');
  } finally {
    await disposeAutomationRuntime(runtime);
    await rm(userDataDir, { recursive: true, force: true });
    consumeAutomationRunLog('test-profile-save');
    consumeAutomationRunLog('test-profile-reopen');
  }
});

test('single-page export keeps actual user and assigned-rule values without authentication secrets', () => {
  const page = sanitizeUsersPage({
    CurrentNumberOfRows: 0,
    EUList: [
      {
        Username: 'user@example.com',
        DisplayName: 'Example User',
        EUID: 'membership-id',
        HasAcceptedInvitation: true,
        IsTempUser: false,
        _Token: 'secret',
        Password: 'secret',
        InvitedBy: { Username: 'unrelated@example.com', VerificationCode: 'secret' },
        AccessSchedules: [
          {
            ID: 7,
            rules_sets: { ID: 9, Name: 'STAKE CENTER - LIMITED', user: { _Token: 'secret' } },
          },
        ],
        AccessPermissions: [],
      },
    ],
  });
  assert.equal(page.returnedUsers, 1);
  assert.equal(page.completeDirectory, false);
  assert.equal(page.users[0].Username, 'user@example.com');
  assert.equal(page.users[0].AccessSchedules[0].rule.Name, 'STAKE CENTER - LIMITED');
  assert.ok(!JSON.stringify(page).includes('secret'));
  assert.ok(!JSON.stringify(page).includes('unrelated@example.com'));
  assert.throws(() => sanitizeUsersPage({}), /Expected a Kindoo user-list page/);
});

test('target-user lookup returns only matching profiles and explicitly linked records without secrets', () => {
  const result = findTargetUserData(
    [
      {
        ID: 'target-id',
        Username: 'Spencer.Nicol@gmail.com',
        FirstName: 'Spencer',
        _Token: 'secret',
        VerificationCode: 'secret',
      },
      { ID: 'other-id', Username: 'other@example.com', Phone: 'private' },
      { UserID: 'target-id', EnvironmentID: 123, IsTempUser: false, Password: 'secret' },
      { UserID: 'other-id', AccessRuleName: 'Other user rule' },
      { AccessRuleName: 'Unassigned site rule' },
    ],
    'spencer.nicol@gmail.com'
  );
  assert.equal(result.found, true);
  assert.equal(result.profiles[0].fields.FirstName, 'Spencer');
  assert.equal(result.linkedRecords.length, 1);
  assert.equal(result.linkedRecords[0].fields.EnvironmentID, 123);
  const serialized = JSON.stringify(result);
  for (const excluded of [
    'secret',
    'private',
    'other@example.com',
    'Other user rule',
    'Unassigned site rule',
  ]) {
    assert.ok(!serialized.includes(excluded));
  }
  assert.equal(findTargetUserData([], 'spencer.nicol@gmail.com').found, false);
});

test('API probe reports shapes and query names without response values or query secrets', () => {
  const endpoint = describeEndpoint(
    'https://web.kindoo.tech/api/users/person@example.com?token=secret'
  );
  assert.equal(endpoint.path, '/api/users/[redacted]');
  assert.deepEqual(endpoint.queryKeys, ['token']);
  const shape = summarizeJson({
    token: 'secret',
    users: [{ email: 'person@example.com', id: 42 }],
  });
  const report = JSON.stringify({ endpoint, shape });
  assert.ok(!report.includes('secret'));
  assert.ok(!report.includes('person@example.com'));
  assert.equal(shape.token, 'string');
});

test('membership access comes only from the matched user row, never a rule creator or inviter', () => {
  const result = findTargetUserData(
    {
      CurrentNumberOfRows: 2,
      EUList: [
        {
          Username: 'other@example.com',
          UserID: 'other-id',
          InvitedBy: { ID: 'spencer-id', Username: 'spencer.nicol@gmail.com' },
          AccessSchedules: [
            {
              rules_sets: {
                ID: 1,
                Name: 'Other access',
                user: { ID: 'spencer-id', Username: 'spencer.nicol@gmail.com' },
              },
            },
          ],
        },
        {
          Username: 'spencer.nicol@gmail.com',
          UserID: 'spencer-id',
          EUID: 'membership-id',
          HasAcceptedInvitation: true,
          IsTempUser: false,
          AccessSchedules: [
            { ID: 22, rules_sets: { ID: 3, Name: 'Assigned access', _Token: 'secret' } },
          ],
          AccessPermissions: [],
        },
      ],
    },
    'spencer.nicol@gmail.com'
  );
  assert.equal(result.memberships.length, 1);
  assert.equal(result.memberships[0].fields.EUID, 'membership-id');
  assert.equal(result.memberships[0].accessSchedules[0].rule.Name, 'Assigned access');
  assert.ok(!JSON.stringify(result.memberships).includes('Other access'));
  assert.ok(!JSON.stringify(result.memberships).includes('secret'));
  assert.equal(result.userListPage.targetMembershipFound, true);
  const creatorOnly = findTargetUserData(
    {
      EUList: [
        {
          Username: 'other@example.com',
          InvitedBy: { Username: 'spencer.nicol@gmail.com' },
        },
      ],
    },
    'spencer.nicol@gmail.com'
  );
  assert.equal(creatorOnly.memberships.length, 0);
});

test('API probe permits only observed reads and excludes SignalR, auth and writes', () => {
  const base = 'https://service89.kindoo.tech/WebService.asmx/';
  assert.equal(canReplayReadOnlyRequest('POST', `${base}KindooPullAppStartupData`), true);
  assert.equal(canReplayReadOnlyRequest('POST', `${base}KindooInitializeApp`), true);
  assert.equal(
    canReplayReadOnlyRequest(
      'POST',
      `${base}KindooGetEnvironmentUsersLightWithTotalNumberOfRecords`
    ),
    true
  );
  assert.equal(canReplayReadOnlyRequest('POST', `${base}SaveUser`), false);
  assert.equal(canReplayReadOnlyRequest('DELETE', `${base}Users`), false);
  assert.equal(
    canReplayReadOnlyRequest('GET', 'https://service89.kindoo.tech/signalr/start'),
    false
  );
  assert.equal(canReplayReadOnlyRequest('GET', 'https://example.com/api/sites'), false);
});

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

test('My sites is ready after login and routes immediately to site selection', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<h1>My sites</h1>');
    const startedAt = Date.now();
    await waitForPostLoginReady(page, 'test-my-sites', 1000);
    assert.equal(await waitForKindooShell(page, 1000), false);
    assert.ok(Date.now() - startedAt < 1000, 'My sites should not consume the readiness timeout');
  } finally {
    await page.close();
  }
});

test('run timeout closes the page and drains the flow before reporting failure', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  let flowSettled = false;
  let nextStepStarted = false;
  const requestId = 'test-timeout';
  try {
    await assert.rejects(
      withRunTimeout(
        requestId,
        async (signal) => {
          try {
            await runStep(
              requestId,
              'waiting',
              async () => {
                await page
                  .getByText('Never appears')
                  .waitFor({ timeout: 10000 })
                  .catch(() => undefined);
              },
              signal
            );
            await runStep(
              requestId,
              'must-not-start',
              async () => {
                nextStepStarted = true;
              },
              signal
            );
          } finally {
            flowSettled = true;
          }
        },
        () => context.close(),
        50
      ),
      /Automation exceeded 50ms run timeout/
    );
    assert.equal(page.isClosed(), true);
    assert.equal(flowSettled, true);
    assert.equal(nextStepStarted, false);
    const log = consumeAutomationRunLog(requestId);
    assert.ok(log.includes('step:fail:waiting'));
    assert.ok(!log.includes('step:done:waiting'));
    assert.ok(!log.includes('step:start:must-not-start'));
  } finally {
    await context.close();
  }
});

test('completed and failed runs do not invoke timeout cleanup', async () => {
  let cleanupCalls = 0;
  const cleanup = async () => {
    cleanupCalls += 1;
  };
  assert.equal(await withRunTimeout('test-success', async () => 'done', cleanup, 1000), 'done');
  await assert.rejects(
    withRunTimeout(
      'test-error',
      async () => {
        throw new Error('Flow failed');
      },
      cleanup,
      1000
    ),
    /Flow failed/
  );
  assert.equal(cleanupCalls, 0);
});

test('Users and Add User screens are recognized without waiting for missing alternatives', async () => {
  for (const html of [
    '<button>Users (12)</button>',
    '<label>Email of the new user<input type="text"></label>',
  ]) {
    const page = await browser.newPage();
    try {
      await page.setContent(html);
      await waitForPostLoginReady(page, 'test-authenticated', 1000);
      assert.equal(await waitForKindooShell(page, 1000), true);
    } finally {
      await page.close();
    }
  }
});

test('login screen does not pass authenticated readiness', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<label>Email<input type="text"></label>');
    await assert.rejects(waitForPostLoginReady(page, 'test-login', 100), /Login did not reach/);
    assert.equal(await waitForKindooShell(page, 100), false);
  } finally {
    await page.close();
  }
});
