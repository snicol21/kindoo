# Proposal: "Mark as handled manually" admin override

Status: implemented on branch `feat/handled-manually`, not merged, migration `0020` not applied to production.

## Problem

The Kindoo worker runs on one laptop. When it is offline, or an admin grants access directly in Kindoo, the automation still tries to create a license for the event later, or shows the event as failed or pending. Admins need a way to say "this event is taken care of, leave it alone" for any upcoming event, whatever state automation left it in, and to undo that safely.

## Decisions (Spencer, Oct 24, 2026)

1. **Admin only.** Role `admin`, or an email in `ADMIN_EMAILS`. Enforced on the server by `canMarkEventHandledManually` in `src/lib/permissions.ts`. The controls are hidden for every other role.
2. **Four reasons:** Worker offline, Granted directly in Kindoo, Not needed, Other. A note is required only for Other (max 500 characters). Admins and stake managers see the note. Ward roles see the badge and the audit line without the note.
3. **Upcoming events only.** Marking and reopening are blocked once the event has ended. "Ended" is computed on the server in America/Denver (`eventEndsInFuture`).
4. **Overlay flag, not a new job status.** Four nullable columns on `event` (`manual_handled_at`, `manual_handled_by_user_id`, `manual_reason`, `manual_note`) plus an append-only `event_manual_override_log` table. A job row may not exist yet (jobs are created about 4 hours before the event) and the overlay leaves jobs and the license flag untouched, so reopening restores the exact prior state.
5. **Texts on mark and reopen** (replaces the earlier "no SMS" decision). See "Texts" below.
6. **Audit line** shows the viewer's local time with a zone label, for example "Handled manually by Spencer, Oct 24, 4:02 AM PDT, worker offline".
7. **Existing `setKindooLicenseCreated` toggle is unchanged.** It stays usable by ward users with no audit. That is a follow-up.
8. **UI:** violet "Handled manually" badge, a status filter (All, Handled manually, Automated, Not yet handled), a mark dialog, and a reopen dialog that explains what automation will do next.

## How automation respects the flag

| Where | Behavior when the event is flagged |
| --- | --- |
| `schedule-due` | Does not queue a job. |
| `claim` | Does not claim the job. The claim UPDATE has its own guard, so a mark made after the candidate select still blocks the claim. |
| `start` (new, called by `worker.js` just before it runs a claimed job) | Returns `proceed: false`; the job goes back to queued and the worker moves on. |
| Manual queue (`POST /api/license-jobs`) and retry | `409` with a message to reopen first. |
| `complete` / `fail` | The job result is recorded. The event license flag is not set and no text is sent. A `worker_result_after_override` row is added to the log. |

A grant that is already running in Kindoo cannot be undone. The audit shows the late result.

## Reopen

Reopen clears the four columns and adds a `reopened` log row. Jobs and the license flag were never touched, so the event is back in exactly the state it had. The dialog says what the worker does next: nothing yet, it queues about 4 hours before the event, it already finished, or the last attempt failed and Retry is needed.

## Texts

Texts use the existing sender (`sendNotificationEventSms`), the existing per-user opt-ins and the existing `notification_outbox`. Nothing new to opt in to.

**When an admin marks an event handled manually**, a text goes to:

- the event's creator, under the same opt-in as the "Kindoo access ready" text (`license_job_completed`)
- admins, stake managers and the event ward's managers who opted in to "new booking" texts (`event_created`), the same audience as the new booking text

The admin who made the change is never texted. Each person gets at most one text. If SMS is not configured, nothing is attempted. A text problem never blocks or rolls back the mark.

**On reopen**, a short correction goes to the same audiences, only if the handled-manually text actually reached someone (`sent > 0` in the mark's log row). The event is always still upcoming at that point, because ended events cannot be reopened.

**Rules for the text wording** (all in `src/lib/sms-message-templates.ts`, next to the other templates, so they can be reworded in one place):

- no links, no em or en dashes, GSM-safe characters, within 2 segments
- a plain headline that says what happened, event detail lines (event, contact, ward, building, Denver date and time), the reason in plain words, then an explicit action line: "Nothing needed from you."
- the admin note and the admin's name never appear
- reopen correction states that the earlier text should be disregarded and that access will be set up as usual, about 4 hours before the event

Example (granted directly):

```
DigitalFob: Kindoo access is taken care of
Youth Night (Ward event)
For: Jane Smith, 3rd Ward
Where: Stake Center
When: Sat Oct 17, 6:00-9:00 PM MT
Access was granted directly in Kindoo.
Nothing needed from you. Automation will skip this event.
```

Example (reopen):

```
DigitalFob: Correction, access is automatic
Youth Night (Ward event)
For: Jane Smith, 3rd Ward
Where: Stake Center
When: Sat Oct 17, 6:00-9:00 PM MT
Please disregard our earlier text.
Access will be set up as usual, about 4 hours before the event. Nothing needed from you.
```

**Override log.** The `marked` and `reopened` rows record a text summary in `details.sms`: `attempted`, `sent`, `skipped`, `failed`, and a `skippedReason` when nothing was attempted on purpose (`sms-not-configured`, `no-recipients`). The history in the audit dialog shows it, for example "Texted 2 people".

## Data model (migration 0020)

Additive and nullable only. No existing row changes.

- `event.manual_handled_at`, `manual_handled_by_user_id`, `manual_reason`, `manual_note`
- `event_manual_override_log` (id, event_id, action, actor_user_id, actor_name, reason, note, details JSON, created_at) and an index on (event_id, created_at). Actions: `marked`, `reopened`, `worker_result_after_override`. `details` holds the prior automation state and the text summary.

Rollback SQL: `docs/proposals/0020_add_event_manual_override.rollback.sql`.

## Rollout order

1. Merge the PR. Do not apply anything yet.
2. Apply migration `0020` to production (needs Spencer's explicit OK).
3. Deploy the app.
4. Pull the new `automation-service/src/worker.js` on the laptop and restart the worker. Until then, set `KINDOO_WORKER_CLAIM_LIMIT=1` so a batch of claimed jobs cannot run past a mark; the server guards still block flagged events.

## Follow-ups

- Audit the existing `setKindooLicenseCreated` toggle, or restrict it.
- Worker heartbeat improvements ("Phase 2").
- `KINDOO_WORKER_INTERVAL_MS` default mismatch: the worker defaults to 10 minutes while the server health thresholds assume 60 seconds in Vercel.
- Decide whether event-created subscribers should get the handled-manually text, or only the event creator.
