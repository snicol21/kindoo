# Proposal: Sycamores 8th Ward and an "Other" ward option

Status: implemented on branch `feat/sycamores-other-ward`, not merged, migration not applied to production.

## Decisions (Spencer, Oct 23, 2026)

1. **Sycamores 8th works exactly like every other ward.** Its home building is the Stake Center, and that is only a default; this change adds no special restriction. Building rules are the same as for existing wards. Admins and Stake Managers can book any ward, including Sycamores 8th, at either the Stake Center or Maples. Ward Managers and Ward Users can book only their own ward, and only at its home building. That is the current rule for every ward (see `canCreateEventInBuildingForWard`). Letting ward-level roles book either building would be a change for all wards, not just Sycamores 8th, so it is left as a follow-up for Spencer to confirm.
2. **Rooms:** Maples rooms 117 (clerk) and 118 (bishop) stay as context only. No room modeling.
3. **Roles:** use the existing roles (Ward Manager, Ward User). No Ward Scheduler role.
4. **Other is stake-level only** (`admin` and `stake_manager`; there is no separate "stake admin" role in the code). Ward Managers and Ward Users never see Other in create, edit, or clone, and the server rejects it for them in `canCreateEventForWard` (events create, update, import, and the bookings API) and in `updateContact`. The bookings API token acts as admin, so it can use Other. Verified against a local copy of the database: a Stake Manager created an Other event (stored as `ward = 'Other'`, `other_ward_name = 'Riverton 3rd Ward'`), and a Ward Manager attempting Other was rejected.
5. **No approval gate for Other.** Kindoo grants for Other events run like any other event. A manual approval step is a possible future item.

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
- Other is stake-level only. User accounts and access requests cannot pick Other. Ward Managers and Ward Users do not see it in any ward picker, and the server explicitly rejects it for them (`canUseOtherWard` in `src/lib/permissions.ts`).
- No Ward Scheduler role, per Spencer. Existing roles are used.

## License grant impact (Kindoo access)

- Kindoo access rules are chosen by building, not ward (`STAKE CENTER - LIMITED` or `MAPLES BUILDING - LIMITED`). Sycamores 8th events at the Stake Center get the Stake Center rule with no new mapping. Other events get the rule of whichever building was booked.
- The worker (`automation-service/`) is untouched.
- The only change on the license-job path is text: `schedule-due` (app side) now writes `Other: <name>` instead of just `Other` into the Kindoo grant description, and the license-job SMS shows the same label. Listed wards, including Sycamores 8th, produce exactly the same text as before.

## Future items

- An optional approval gate before Kindoo access is granted for Other events.
- Letting ward-level roles book outside their home building (would apply to all wards).
- Room-level booking, if ever needed.

## Deploy steps

1. Review and merge the PR (Spencer).
2. Apply `drizzle/0019_add_other_ward_name.sql` to the production Turso database. Do this before the new code serves traffic.
3. Let Vercel deploy main.
4. Smoke test: create a Sycamores 8th event at the Stake Center, create an Other event as an admin, and confirm both show correctly and the Kindoo grant is queued as usual.
5. Create or update the Sycamores 8th Ward Manager in Users admin.
