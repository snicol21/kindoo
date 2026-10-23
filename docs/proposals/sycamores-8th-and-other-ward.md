# Proposal: Sycamores 8th Ward and an "Other" ward option

Status: implemented on branch `feat/sycamores-other-ward`, not merged, migration not applied to production.

## Background

The Sycamores 8th Ward (West Jordan Sycamores stake) was recently assigned to, and primarily attends, the Stake Center. Spencer asked for:

1. "Sycamores 8th Ward" as a selectable ward everywhere wards are listed.
2. An "Other" ward option with a free-text name for unlisted wards or units.
3. Sycamores 8th members able to hold ward-level roles (Ward Manager, Ward User) with the same capabilities as other wards, scoped to their ward and building.

## How wards work today

- Wards are a TypeScript constant, `WARDS` in `src/schema/schema.ts`, not a database table. There is no seed data for wards.
- The `ward` columns on `user`, `contact`, and `access_request` are plain SQLite `TEXT`. Drizzle's `enum` option is a type-level hint only and creates no CHECK constraint, so new ward values need no DDL.
- `WARD_BUILDING` in the same file maps each ward to its home building. Ward-scoped users (`ward_manager`, `ward_user`) can only book their own ward, and only in that building (`src/lib/permissions.ts`).
- An event's ward is the ward of its contact (`event.contactId -> contact.ward`).
- The schema has no rooms. Events are booked per building only.

## Data and schema changes

| Change | Where | DDL needed |
| --- | --- | --- |
| Add `Sycamores 8th Ward` to `WARDS`, mapped to `Stake Center` | `src/schema/schema.ts` | No |
| Add `Other` to `WARDS`, mapped to no building (`null`) | `src/schema/schema.ts` | No |
| New `ASSIGNABLE_WARDS` (all wards except Other) for user accounts | `src/schema/schema.ts` | No |
| New nullable `contact.other_ward_name` column | `drizzle/0019_add_other_ward_name.sql` | Yes |
| Contact uniqueness becomes `(ward, coalesce(other_ward_name, ''), email)` and the same for `phone`, so two different "Other" units can each have a contact with the same email or phone | same migration | Yes |

Why a column on `contact` and not a ward table: wards are a constant, and the event's ward already lives on the contact. One nullable column is the smallest change that fits. `other_ward_name` is set only when `ward = 'Other'` and is null otherwise (enforced in app code; SQLite cannot add a CHECK constraint with `ALTER TABLE`).

Rooms: the schema has no rooms, so the Maples rooms are context only. Room 117 at the Maples Building is the Sycamores 8th clerk's office and room 118 is their bishop's office. If Spencer wants room-level booking later, that is a separate feature.

## Validation for "Other"

Shared helpers live in `src/lib/ward-utils.ts` and are used by the form, the edit and clone dialogs, the server service, the contacts action, and the bookings API:

- Required when Other is picked.
- Trimmed, with whitespace runs collapsed, and Unicode normalized (NFC).
- 2 to 60 characters.
- Allowed characters: letters (including accented), digits, spaces, and `. , ' & ( ) # / -`.
- Ignored and stored as null for any listed ward.
- Displayed as `Other: <name>`, for example `Other: Riverton 3rd Ward`.

## Migration

File: `drizzle/0019_add_other_ward_name.sql`. Tested locally against a copy of `local.db`: apply, uniqueness checks, and rollback all succeed.

Apply (after merge, before or together with the deploy). The code reads `contact.other_ward_name`, so the column must exist before the new code serves traffic:

```bash
# Option A: Turso shell
turso db shell <db-name> < drizzle/0019_add_other_ward_name.sql
# Option B: whatever process was used for 0001 to 0018 (this repo has no drizzle meta journal)
```

Rollback (only after reassigning or deleting any `ward = 'Other'` contacts): `docs/proposals/0019_add_other_ward_name.rollback.sql`. Code rollback is a normal revert of the PR. Any Sycamores 8th users or contacts would need their ward changed first, since older code would not list that ward.

## UI changes

- New event form: Sycamores 8th Ward is in the Stake Center priority group. Other is always last. Picking Other shows a required "Ward or unit name" field.
- Edit and Clone event dialogs: Sycamores 8th and Other are listed, with the same free-text field and validation.
- Event table, dashboard search, "By ward" stats, message templates (`{ward}`), and the Kindoo license dialog show `Other: <name>`. Different Other units group separately in stats.
- Users admin (create and edit) and the public request-access page list Sycamores 8th but not Other.
- CSV import accepts Sycamores 8th. It rejects Other with a clear row error, since the CSV has no free-text column. The sample template now includes a Sycamores 8th row.
- Bookings API (`POST /api/bookings`) accepts `ward: "Other"` plus `otherWardName`. Documented in `docs/BOOKINGS_API.md`.

## Permission model

- No new roles. A Sycamores 8th member can be a Ward Manager or Ward User exactly like any other ward. The existing checks apply unchanged: they can see and book only Sycamores 8th events, and only at the Stake Center (via `WARD_BUILDING`). A Sycamores 8th Ward Manager can manage only Sycamores 8th users.
- The UI already pins ward-scoped users to their ward's building, so their dashboard and new-event form lock to the Stake Center.
- Other is not ward-scoped. User accounts and access requests cannot pick Other (UI hides it, and the server rejects it). Other events can be created and managed only by Admins and Stake Managers. Because Other has no home building, the ward-building check never passes for ward-scoped roles.
- There is no separate "ward scheduler" role today. Ward User is the closest (can create and manage their own events). If Spencer wants a distinct scheduler role, that is a follow-up.

## License grant impact (Kindoo access)

- Kindoo access rules are chosen by building, not ward (`STAKE CENTER - LIMITED` or `MAPLES BUILDING - LIMITED`). Sycamores 8th events at the Stake Center get the Stake Center rule with no new mapping. Other events get the rule of whichever building was booked.
- The worker (`automation-service/`) is untouched.
- The only change on the license-job path is text: `schedule-due` (app side) now writes `Other: <name>` instead of just `Other` into the Kindoo grant description, and the license-job SMS shows the same label. Listed wards, including Sycamores 8th, produce exactly the same text as before.

## Open questions for Spencer

1. Should Sycamores 8th ever book the Maples Building? Today ward-scoped users are limited to one home building. Stake Center only is assumed.
2. Do you want room-level booking (for example Maples rooms 117 and 118), or is that context only?
3. Is "Ward User" enough for the Sycamores scheduler, or do you want a distinct "Ward Scheduler" role?
4. Should Stake Managers be able to book Other units, or Admins only? (Both can today.)
5. Should Kindoo grants for Other events need a manual approval step before the worker grants access?

## Deploy steps

1. Review and merge the PR (Spencer).
2. Apply `drizzle/0019_add_other_ward_name.sql` to the production Turso database. Do this before the new code serves traffic.
3. Let Vercel deploy main.
4. Smoke test: create a Sycamores 8th event at the Stake Center, create an Other event as an admin, and confirm both show correctly and the Kindoo grant is queued as usual.
5. Create or update the Sycamores 8th Ward Manager in Users admin.
