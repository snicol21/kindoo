import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, URL } from 'node:url';
import {
  createAutomationRuntime,
  disposeAutomationRuntime,
  enterSiteFromMySites,
  isLoginScreenVisible,
  performLogin,
  withRunTimeout,
} from './server.js';

export function describeEndpoint(url) {
  const parsed = new URL(url);
  return {
    origin: parsed.origin,
    path: parsed.pathname.replace(/[^/]*@[^/]*/g, '[redacted]'),
    queryKeys: [...new Set(parsed.searchParams.keys())],
  };
}

export function summarizeJson(value, depth = 0) {
  if (value === null) return 'null';
  if (depth >= 4) return Array.isArray(value) ? 'array' : typeof value;
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      items: value.slice(0, 20).map((entry) => summarizeJson(entry, depth + 1)),
    };
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, entry]) => [key, summarizeJson(entry, depth + 1)])
    );
  }
  return typeof value;
}

export function canReplayReadOnlyRequest(method, url) {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('.kindoo.tech')) return false;
  if (/signalr|login|oauth|authorize|token|password|credential/i.test(parsed.pathname))
    return false;
  return (
    method === 'GET' ||
    (method === 'POST' &&
      [
        '/WebService.asmx/KindooPullAppStartupData',
        '/WebService.asmx/KindooInitializeApp',
        '/WebService.asmx/KindooGetEnvironmentUsersLightWithTotalNumberOfRecords',
      ].includes(parsed.pathname))
  );
}

function isKindooDataRequest(request) {
  const url = new URL(request.url());
  return (
    (url.hostname === 'kindoo.tech' || url.hostname.endsWith('.kindoo.tech')) &&
    ['xhr', 'fetch'].includes(request.resourceType()) &&
    !/signalr|login|oauth|authorize|token|password|credential/i.test(url.pathname)
  );
}

export function findTargetUserData(payload, email) {
  const targetEmail = email.trim().toLowerCase();
  const objects = [];
  const visit = (value, path = '$') => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    objects.push({ value, path });
    Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(payload);

  const matches = objects.filter(({ value }) =>
    Object.entries(value).some(
      ([key, entry]) =>
        /^(username|email|emailaddress|useremail)$/i.test(key) &&
        typeof entry === 'string' &&
        entry.trim().toLowerCase() === targetEmail
    )
  );
  const safeFields = new Set([
    'id',
    'euid',
    'userid',
    'kindoouserid',
    'environmentid',
    'username',
    'email',
    'emailaddress',
    'useremail',
    'firstname',
    'lastname',
    'displayname',
    'phone',
    'mobile',
    'userrole',
    'role',
    'istempuser',
    'tempuserfromdate',
    'tempusertodate',
    'fromdate',
    'todate',
    'startdate',
    'enddate',
    'expirydate',
    'isactive',
    'issuspended',
    'hasaccepted',
    'hasacceptedinvitation',
    'departmenttype',
    'viewerdepartmenttype',
    'startaccessdoorsdate',
    'startaccessdoorsdateattimezone',
    'expirydateattimezone',
    'expirytimezonename',
    'description',
    'environmentname',
    'rulesetid',
    'rulessetid',
    'accessruleid',
    'accessrulename',
    'name',
    'iscontroller',
    'ispermanent',
  ]);
  const project = ({ value, path }) => ({
    path,
    fields: Object.fromEntries(
      Object.entries(value).filter(
        ([key, entry]) =>
          safeFields.has(key.toLowerCase()) &&
          (entry === null || ['string', 'number', 'boolean'].includes(typeof entry))
      )
    ),
  });
  const userIds = new Set(
    matches.flatMap(({ value }) =>
      Object.entries(value)
        .filter(([key, entry]) => /^(id|userid|kindoouserid)$/i.test(key) && entry !== null)
        .map(([, entry]) => String(entry))
    )
  );
  const linkedRecords = objects.filter(({ value }) =>
    Object.entries(value).some(
      ([key, entry]) =>
        /^(userid|kindoouserid)$/i.test(key) && entry !== null && userIds.has(String(entry))
    )
  );
  const memberships = Array.isArray(payload?.EUList)
    ? payload.EUList.flatMap((row, index) => {
        if (typeof row.Username !== 'string' || row.Username.trim().toLowerCase() !== targetEmail) {
          return [];
        }
        const path = `$.EUList[${index}]`;
        return [
          {
            ...project({ value: row, path }),
            accessSchedules: Array.isArray(row.AccessSchedules)
              ? row.AccessSchedules.map((schedule, scheduleIndex) => ({
                  ...project({
                    value: schedule,
                    path: `${path}.AccessSchedules[${scheduleIndex}]`,
                  }),
                  ...(schedule.rules_sets && typeof schedule.rules_sets === 'object'
                    ? {
                        rule: project({
                          value: schedule.rules_sets,
                          path: `${path}.AccessSchedules[${scheduleIndex}].rules_sets`,
                        }).fields,
                      }
                    : {}),
                }))
              : null,
            accessPermissions: Array.isArray(row.AccessPermissions)
              ? row.AccessPermissions.map((permission, permissionIndex) =>
                  project({
                    value: permission,
                    path: `${path}.AccessPermissions[${permissionIndex}]`,
                  })
                )
              : null,
          },
        ];
      })
    : [];
  return {
    email: targetEmail,
    found: matches.length > 0,
    profiles: matches.map(project),
    linkedRecords: linkedRecords.filter((entry) => !matches.includes(entry)).map(project),
    memberships,
    ...(Array.isArray(payload?.EUList)
      ? {
          userListPage: {
            rowsReturned: payload.EUList.length,
            currentNumberOfRows:
              typeof payload.CurrentNumberOfRows === 'number' ? payload.CurrentNumberOfRows : null,
            targetMembershipFound: memberships.length > 0,
          },
        }
      : {}),
  };
}

export function sanitizeUsersPage(payload) {
  if (!Array.isArray(payload?.EUList)) throw new Error('Expected a Kindoo user-list page.');
  const fields = new Set([
    'Username',
    'DisplayName',
    'FirstName',
    'LastName',
    'UserID',
    'EUID',
    'EnvironmentID',
    'Description',
    'DepartmentType',
    'HasAcceptedInvitation',
    'IsTempUser',
    'StartAccessDoorsDate',
    'StartAccessDoorsDateAtTimeZone',
    'ExpiryDate',
    'ExpiryDateAtTimeZone',
    'ExpiryTimeZoneName',
  ]);
  const project = (value, allowed) =>
    Object.fromEntries(
      Object.entries(value ?? {}).filter(
        ([key, entry]) =>
          allowed.has(key) &&
          (entry === null || ['string', 'number', 'boolean'].includes(typeof entry))
      )
    );
  const accessFields = new Set([
    'ID',
    'Name',
    'Description',
    'RulesSetID',
    'RuleSetID',
    'AccessRuleID',
    'FromDate',
    'ToDate',
  ]);
  return {
    singlePageOnly: true,
    completeDirectory: false,
    returnedUsers: payload.EUList.length,
    currentNumberOfRows:
      typeof payload.CurrentNumberOfRows === 'number' ? payload.CurrentNumberOfRows : null,
    users: payload.EUList.map((row) => ({
      ...project(row, fields),
      AccessSchedules: Array.isArray(row.AccessSchedules)
        ? row.AccessSchedules.map((schedule) => ({
            ...project(schedule, accessFields),
            ...(schedule.rules_sets ? { rule: project(schedule.rules_sets, accessFields) } : {}),
          }))
        : null,
      AccessPermissions: Array.isArray(row.AccessPermissions)
        ? row.AccessPermissions.map((permission) => project(permission, accessFields))
        : null,
    })),
  };
}

export async function runReadOnlyProbe({ targetEmail, exportUsersPage = false } = {}) {
  for (const name of ['KINDOO_EMAIL', 'KINDOO_CHURCH_USERNAME', 'KINDOO_CHURCH_PASSWORD']) {
    if (!process.env[name]) throw new Error(`Missing required env: ${name}`);
  }

  const requestId = `probe-${randomUUID()}`;
  const runtime = await createAutomationRuntime(requestId);
  const { page, context } = runtime;
  const observations = new Map();
  const pending = new Set();
  const candidates = new Map();
  const replays = [];
  const targetUserSources = [];
  let usersPage;
  let siteOpened = false;
  let usersOpened = false;

  const onResponse = (response) => {
    const request = response.request();
    if (!isKindooDataRequest(request) || observations.size >= 100) return;
    const task = (async () => {
      const headers = await request.allHeaders();
      const endpoint = describeEndpoint(request.url());
      const key = `${request.method()} ${endpoint.origin}${endpoint.path}`;
      const contentType = response.headers()['content-type'] ?? '';
      let body;
      if (request.postData()) {
        try {
          body = request.postDataJSON();
        } catch {
          body = request.postData();
        }
      }
      const observation = {
        ...endpoint,
        method: request.method(),
        status: response.status(),
        authorizationHeaderPresent: Boolean(headers.authorization),
        cookieHeaderPresent: Boolean(headers.cookie),
        contentType,
        ...(body !== undefined ? { requestBodyShape: summarizeJson(body) } : {}),
      };
      if (response.ok() && /json/i.test(contentType)) {
        const payload = await response.json().catch(() => null);
        observation.jsonShape = summarizeJson(payload);
        if (targetEmail) {
          const targetUser = findTargetUserData(payload, targetEmail);
          if (targetUser.found) {
            targetUserSources.push({
              ...endpoint,
              source: 'observed-browser-response',
              ...targetUser,
            });
          }
        }
        if (canReplayReadOnlyRequest(request.method(), request.url())) {
          candidates.set(key, {
            url: request.url(),
            method: request.method(),
            body: request.postData() ?? undefined,
            headers: Object.fromEntries(
              Object.entries(headers).filter(([name]) =>
                /^(authorization|x-csrf-token|x-xsrf-token|accept|content-type)$/.test(name)
              )
            ),
          });
        }
      }
      observations.set(key, observation);
    })().catch(() => undefined);
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  page.on('response', onResponse);
  try {
    await withRunTimeout(
      requestId,
      async (signal) => {
        const kindooUrl = process.env.KINDOO_URL ?? 'https://web.kindoo.tech/';
        await page.goto(kindooUrl, { waitUntil: 'domcontentloaded' });
        if (await isLoginScreenVisible(page, 5000)) {
          await performLogin({
            page,
            requestId,
            kindooUrl,
            kindooEmail: process.env.KINDOO_EMAIL,
            kindooChurchUsername: process.env.KINDOO_CHURCH_USERNAME,
            kindooChurchPassword: process.env.KINDOO_CHURCH_PASSWORD,
          });
        }
        signal.throwIfAborted();
        await Promise.any([
          page.getByText('My sites', { exact: true }).first().waitFor({ timeout: 20000 }),
          page
            .getByText(/^Users(?:\s*\(\d+\))?$/i)
            .first()
            .waitFor({ timeout: 20000 }),
        ]).catch(() => undefined);
        signal.throwIfAborted();
        siteOpened = await enterSiteFromMySites(page, requestId);
        const usersMenu = page.getByText(/^Users(?:\s*\(\d+\))?$/i).first();
        if (await usersMenu.isVisible()) {
          siteOpened = true;
          const userListResponse = exportUsersPage ? page.waitForResponse((response) =>
            new URL(response.url()).pathname === '/WebService.asmx/KindooGetEnvironmentUsersLightWithTotalNumberOfRecords' && response.ok(),
            { timeout: 20000 }
          ).catch(() => null) : null;
          await usersMenu.click({ timeout: 5000 });
          usersOpened = true;
          if (userListResponse) await userListResponse;
        }
        if (targetEmail && usersOpened) {
          const searches = [
            page.getByRole('searchbox').first(),
            page.getByPlaceholder(/search/i).first(),
            page.getByRole('textbox', { name: /search/i }).first(),
          ];
          for (const search of searches) {
            if (!(await search.isVisible())) continue;
            const filteredResponse = page
              .waitForResponse(
                (response) =>
                  new URL(response.url()).pathname ===
                    '/WebService.asmx/KindooGetEnvironmentUsersLightWithTotalNumberOfRecords' &&
                  response.ok(),
                { timeout: 10000 }
              )
              .catch(() => null);
            await search.fill(targetEmail);
            await filteredResponse;
            break;
          }
        }
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        console.log(`Collecting ${pending.size} pending API response bodies.`);
        await Promise.race([Promise.all([...pending]), page.waitForTimeout(10000)]);
        page.off('response', onResponse);
        console.log(
          `Collected ${observations.size} endpoints; matched ${targetUserSources.length} target-user sources.`
        );

        for (const candidate of [...candidates.values()].slice(0, 10)) {
          signal.throwIfAborted();
          const endpoint = describeEndpoint(candidate.url);
          console.log(`Testing observed read-only operation: ${endpoint.path}`);
          const response = await context.request.fetch(candidate.url, {
            method: candidate.method,
            headers: candidate.headers,
            ...(candidate.body !== undefined ? { data: candidate.body } : {}),
            timeout: 10000,
            maxRedirects: 0,
          });
          const result = {
            ...endpoint,
            method: candidate.method,
            sessionRequestStatus: response.status(),
          };
          if (response.ok()) {
            const payload = await response.json().catch(() => null);
            result.jsonShape = summarizeJson(payload);
            if (
              exportUsersPage &&
              endpoint.path ===
                '/WebService.asmx/KindooGetEnvironmentUsersLightWithTotalNumberOfRecords'
            ) {
              usersPage = {
                ...endpoint,
                httpStatus: response.status(),
                ...sanitizeUsersPage(payload),
              };
            }
            if (targetEmail) {
              const targetUser = findTargetUserData(payload, targetEmail);
              if (targetUser.found) {
                targetUserSources.push({ ...endpoint, source: 'direct-api-replay', ...targetUser });
              }
            }
          }
          await response.dispose();
          replays.push(result);
        }
        signal.throwIfAborted();
      },
      () => disposeAutomationRuntime(runtime)
    );

    const report = {
      capturedAt: new Date().toISOString(),
      readOnly: true,
      siteOpened,
      usersOpened,
      ...(targetEmail
        ? {
            targetUserLookup: {
              email: targetEmail,
              found: targetUserSources.length > 0,
              sources: targetUserSources,
            },
          }
        : {}),
      observations: [...observations.values()],
      replays,
    };
    const directory = join(process.cwd(), '.playwright', 'api-probe');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const reportPath = join(directory, `${requestId}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
    if (exportUsersPage) {
      if (!usersPage) throw new Error('No user-list page was retrieved for export.');
      const usersPagePath = join(directory, `users-page-${requestId}.json`);
      await writeFile(
        usersPagePath,
        JSON.stringify({ capturedAt: report.capturedAt, readOnly: true, ...usersPage }, null, 2),
        { mode: 0o600 }
      );
      console.log(`Users page export: ${usersPagePath} (${usersPage.returnedUsers} users)`);
    }
    console.log(`Read-only API probe report: ${reportPath}`);
    console.log(
      `Observed ${observations.size} endpoints; tested ${replays.length} read-only endpoints.`
    );
    return report;
  } finally {
    page.off('response', onResponse);
    await disposeAutomationRuntime(runtime);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const emailOption = process.argv.indexOf('--email');
  const targetEmail = emailOption >= 0 ? process.argv[emailOption + 1] : undefined;
  runReadOnlyProbe({
    targetEmail,
    exportUsersPage: process.argv.includes('--export-users-page'),
  }).catch((error) => {
    console.error(`Read-only API probe failed (${error.name}). No API credentials were logged.`);
    process.exitCode = 1;
  });
}
