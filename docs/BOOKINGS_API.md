# Facilities Lead Bookings HTTP API (v1)

Authenticated booking endpoints for Facilities Lead integrations. Uses a **dedicated** API token — not `KINDOO_WORKER_TOKEN` / `X-Worker-Token`.

## Auth

- Env var: `KINDOO_API_TOKEN`
- Header: `Authorization: Bearer <KINDOO_API_TOKEN>`
- A valid token is treated as **admin** for permission checks (reuses `src/lib/permissions.ts`).
- Events created via the token are attributed to a system actor user (`facilities-api@kindoo.internal`).
- Signed-in browser sessions also work (optional); Facilities Lead path is the Bearer token.

### Mint and store the token

1. Generate a long random secret, e.g. `openssl rand -hex 32`.
2. Set `KINDOO_API_TOKEN` in Vercel (or `.env.local` for local) — never commit the real value.
3. Share the token with Facilities Lead out of band; rotate by replacing the env value.

## Endpoints

### Create — `POST /api/bookings`

Required JSON fields: `building`, `ward`, `name`, `eventDate`, `startTime`, `endTime`, `eventType`, `email`, `phone`, `description`.

```bash
curl -sS -X POST "$BASE_URL/api/bookings" \
  -H "Authorization: Bearer $KINDOO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "building": "Stake Center",
    "ward": "3rd Ward",
    "name": "Jane Doe",
    "eventDate": "2026-10-15",
    "startTime": "18:00",
    "endTime": "20:00",
    "eventType": "Private",
    "email": "jane@example.com",
    "phone": "5551234567",
    "description": "Reception"
  }'
```

### List — `GET /api/bookings`

Query params:

- `building` (required)
- `ward` (optional)
- `dateFrom` / `dateTo` (optional, `YYYY-MM-DD`)
- `eventId` (optional)

Role-scoped like `getEventsByBuilding` (token → admin sees all in building).

```bash
curl -sS "$BASE_URL/api/bookings?building=Stake%20Center&ward=3rd%20Ward&dateFrom=2026-10-01&dateTo=2026-10-31" \
  -H "Authorization: Bearer $KINDOO_API_TOKEN"
```

### Delete — `DELETE /api/bookings/[id]`

Hard delete (same behavior as the Server Action delete).

```bash
curl -sS -X DELETE "$BASE_URL/api/bookings/<event-id>" \
  -H "Authorization: Bearer $KINDOO_API_TOKEN"
```

## Notes

- Reuses create/list/delete logic from `src/lib/events-service.ts` (shared with Server Actions).
- Create requires **both** contact email and phone (stricter than the UI form).
- No production deploy is implied by this doc; configure the env var only when ready.
