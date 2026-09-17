# Driver API contracts (Phase 0)

Thin `/api/driver/*` beside inbound Drag & Drop v2 (`10.0.0.11:5001`). Does not replace the desk stack and is not a dispatcher board.

Desk flow (locked): **TMS → Steve (`10.0.0.11:8765/`) → inbound `:5001` and outbound `:5002` → manifests → Steve → TMS**. Steve finesses TMS data for LTL routing (inbound and outbound); finished manifests return to the TMS through Steve.

The driver PWA **does not call the TMS or Steve**. Snapshots and status sit beside the routing tools. Desk save/export still returns manifests via Steve. Possible later consolidation = one desk tool talking to Steve, not a new TMS, not a mobile dispatcher.

Phase 1: inbound, trip-number-first, read-only GET. **v1 audience: all drivers** (company, broker, owner-op). Status POST is Phase 2. **SMS + share link is load-bearing in v1** (desk-triggered notify), not company-only.

Auth (same trip UX): phone **or** employee ID + PIN when they have it; otherwise a **link/token** that opens that contact’s day (and deep-links a trip) without employee ID. Session filters by linked `pickup_driver` / `driver_contacts` **including brokers**. Do not send broker cost/margin to the phone.

`lane` / `source` let a later outbound router add trips to the same My Day list. `source` is the **routing tool** (`inbound_5001`, later `outbound_5002`) — **never** `steve_8765` and never the TMS.

## Field mapping (dispatcher → driver JSON)

| Dispatcher (charter) | Driver JSON | On phone |
| --- | --- | --- |
| pickup customer | `stop_name` | Top of trip detail |
| (stop street/city when present on route detail) | `stop_address` | Under name; Maps if non-null |
| PU # | `pickup_number` | Directly under address |
| PU notes / special instructions | `notes` | Notes tab only |
| pickup time window | `window_start`, `window_end` (ISO-8601 local offset) | Appt window |
| temp setpoint | `temp_setpoint` (string, e.g. `34F`) | Temp |
| pallets | `pallet_count` (number \| null) | # of pallets |
| weight | `weight_lbs` (number \| null) | With pallets if you show weight |
| trip # | `trip_number` (string) | Primary object / path key |
| inbound stop sequence | `stop_sequence` (int, 1-based) | Sort only; do not show a route board |
| delivery destination | `delivery_location` | Delivery location |
| `pickup_driver` | `pickup_driver` | Must match the **linked** `driver_contacts` row (company, broker, or owner-op) |

Do not send broker cost, margin, route-board geometry, trip groups UI, or Zoho payloads to the phone. Same trip-number fields for every `driver_kind`.

---

## GET `/api/driver/me/assignments?date=`

`date` = `YYYY-MM-DD` (America/Chicago). Only trips where `pickup_driver` matches the **session contact** (company, broker, or owner-op in `driver_contacts`). Bearer from phone, PIN, **or link-token exchange**.

```
GET /api/driver/me/assignments?date=2026-09-17
Authorization: Bearer …
If-None-Match: W/"drv:184:2026-09-17:12"
```

**200** (changed or no `If-None-Match`):

```http
HTTP/1.1 200 OK
ETag: W/"drv:184:2026-09-17:12"
Cache-Control: private, no-cache
Content-Type: application/json
```

```json
{
  "driver_id": 184,
  "driver_name": "Jane Driver",
  "driver_kind": "broker",
  "date": "2026-09-17",
  "lane_filter": "inbound",
  "plan_version": 12,
  "assignments": [
    {
      "trip_number": "643053",
      "lane": "inbound",
      "source": "inbound_5001",
      "stop_sequence": 1,
      "stop_name": "ACME Foods",
      "stop_address": "100 Plant Rd, Somewhere, WI",
      "pickup_number": "PU-8891",
      "delivery_location": "Kottke DC — True Blue",
      "pallet_count": 18,
      "weight_lbs": 24100,
      "temp_setpoint": "34F",
      "window_start": "2026-09-17T08:00:00-05:00",
      "window_end": "2026-09-17T10:00:00-05:00",
      "notes": "Call receiving 15 min out. Dock 3.",
      "pickup_driver": "Jane Driver",
      "status": null,
      "highlight_stop": true,
      "changes": [
        {
          "trip_number": "643053",
          "change_type": "pu_added",
          "summary": "PU# PU-8891 added",
          "stop_name": "ACME Foods",
          "at": "2026-09-17T13:04:11-05:00"
        }
      ]
    }
  ]
}
```

**304** if `If-None-Match` equals current ETag (empty body).

**401** unknown/expired session or link. **403** only if the token was revoked — **not** for broker/owner-op contacts. There is no company-roster gate.

Phase 1: `status` is always `null`. `highlight_stop` is true when the latest change for that trip is unread (client can clear locally). Sort `assignments` by `stop_sequence`, then `trip_number`. One row per trip # for that driver/date (if a trip has multiple inbound stops later, still one trip card; extra stops stay in `notes` / future `stops[]` — do not add a board).

Grow-past-inbound: later rows may set `"lane": "outbound", "source": "outbound_5002"` when the outbound router publishes trips. Same resource; same trip-first UI. Never add `routes`, `groups`, or drag payloads. Never set `source` to Steve or the TMS — those stay on the desk manifest path.

---

## ETag / `plan_version`

- `plan_version`: monotonic **int per contact + date** (linked `pickup_driver`, any `driver_kind`). Bump on inbound `assign_driver`, `assign_broker`, `move_trip_groups`, and any PU # / window / notes / stop add-remove that affects this contact.
- `ETag`: `W/"drv:{driver_id}:{date}:{plan_version}"` (weak — derived snapshot).
- Phone stores ETag + body in IndexedDB. Next GET sends `If-None-Match`.
- Change copy when version moves: in-app highlight + SMS 1.5. Driver does not confirm the plan.

---

## POST `/api/driver/stops/{trip}/status`

`{trip}` = trip # (e.g. `643053`). Phase 2. Lands on the **inbound planner first** (`landed: "planner"`). Does **not** write Steve or the TMS. Desk export/save is what sends manifests Steve → TMS.

```
POST /api/driver/stops/643053/status
Authorization: Bearer …
Content-Type: application/json
If-Match: W/"drv:184:2026-09-17:12"
```

```json
{
  "status": "arrived",
  "at": "2026-09-17T14:22:03-05:00",
  "note": null,
  "reason": null,
  "lat": 44.12,
  "lon": -88.51,
  "client_event_id": "3f2a9c0e-4b1d-4e8a-9c11-7a0b2d55e101"
}
```

`status`: `en_route` | `arrived` | `loading` | `loaded` | `complete` | `exception`.  
`at`: tap time (not sync time). `lat`/`lon` optional. `client_event_id`: UUID; **idempotent** for 24h.  
`exception` requires `reason`: `late` | `no_product` | `wait_time` | `wrong_temp` | `other`, and should include `note`.

**200** applied (or idempotent replay):

```json
{
  "trip_number": "643053",
  "status": "arrived",
  "at": "2026-09-17T14:22:03-05:00",
  "accepted": true,
  "plan_version": 12,
  "landed": "planner"
}
```

**409** dispatch won / no longer this driver’s trip (offline reassign, etc.):

```json
{
  "accepted": false,
  "error": "not_assigned",
  "message": "Change on trip 643053 — call dispatch for confirmation.",
  "trip_number": "643053",
  "plan_version": 13,
  "change": {
    "trip_number": "643053",
    "change_type": "reassign",
    "summary": "Reassigned off Jane Driver",
    "stop_name": "ACME Foods",
    "at": "2026-09-17T14:18:00-05:00"
  }
}
```

**412** if `If-Match` is present and the plan moved, **but the driver still owns the trip**: accept is allowed on retry without If-Match, or server may accept and return the new `plan_version` so the phone refreshes the plan. Do not block a valid status on a still-owned trip. Drop the event only on `not_assigned`.

**409** `stale_status` if new `status` goes backwards vs last accepted (except `exception`).

---

## Change events

Append-only, driver+date scoped. Same object in `assignments[].changes` and as `change` on 409.

```json
{
  "trip_number": "643053",
  "change_type": "pu_added",
  "summary": "PU# PU-8891 added",
  "stop_name": "ACME Foods",
  "at": "2026-09-17T13:04:11-05:00"
}
```

`change_type` (required): `pu_added` | `pu_removed` | `stop_added` | `stop_removed` | `reassign` | `window_change`.

| Desk action | `change_type` | `summary` example |
| --- | --- | --- |
| PU # added/edited on | `pu_added` | `PU# PU-8891 added` |
| PU # cleared | `pu_removed` | `PU# PU-8891 removed` |
| Stop added to this driver’s day | `stop_added` | `Stop ACME Foods added` |
| Stop removed | `stop_removed` | `Stop ACME Foods removed` |
| `assign_driver` / `assign_broker` / taken off | `reassign` | `Assigned to Jane Driver` / `Reassigned off Jane Driver` |
| Window edit | `window_change` | `Window 08:00–10:00` |

`summary` is the change-log line. `stop_name` is what the PWA highlights. SMS uses trip # + Raf sentence; it does not dump this JSON.

---

## POST `/api/driver/notify`

Desk-side only (inbound mutation hook after `assign_driver` / `assign_broker` / `move_trip_groups`). **Not** callable with a driver token. **v1 load-bearing for all driver types.** Resolve phone + contact from `driver_contacts` (match `pickup_driver` name), **including brokers and owner-ops**.

Mint or reuse a date-scoped `link_token` for that contact. HTTPS host required in `link_url` (mixed iOS/Android). Skip only if **no phone**; do **not** skip brokers.

```
POST /api/driver/notify
Authorization: Bearer <service>
Content-Type: application/json
```

```json
{
  "pickup_driver": "Jane Driver",
  "date": "2026-09-17",
  "trip_numbers": ["643053", "643060"],
  "change_type": "reassign",
  "summary": "Assigned to Jane Driver",
  "debounce_key": "184:2026-09-17"
}
```

Server: coalesce **90s** per `debounce_key`. Quiet hours 21:00–05:00 America/Chicago (queue; send at 05:00 unless same-night reassign). Opt-in default **on**.

One trip in the coalesce window → deep link. Two+ trips → day link.

SMS body (one trip):

```
Change on trip 643053 — call dispatch for confirmation. Details: https://<pwa-host>/d/{link_token}/643053
```

Two+ trips: `Change on trips 643053, 643060 — call dispatch for confirmation. Details: https://<pwa-host>/d/{link_token}`

**202** queued/coalesced:

```json
{
  "queued": true,
  "send_at": "2026-09-17T13:05:41-05:00",
  "to_last4": "1212",
  "driver_kind": "broker",
  "trip_numbers": ["643053", "643060"],
  "link_url": "https://<pwa-host>/d/lt_9f3c…w2"
}
```

**200** after send:

```json
{
  "sent": true,
  "provider_id": "…",
  "trip_numbers": ["643053"],
  "link_url": "https://<pwa-host>/d/lt_9f3c…w2/643053"
}
```

**422** no phone: `{ "sent": false, "error": "no_contact" }` — not used for “is a broker.”  
Log success/fail. Do not retry-storm; one follow-up after 15 min on provider 5xx.

Push (Phase 3): same event, Android + iOS only if installed (iOS: Safari A2HS + 16.4+). SMS + link stays the v1 path.

---

## Auth

Same session shape for company / broker / owner-op. `Authorization: Bearer <session>` on `/me/*` and status.

**Link (on-ramp — no employee ID):**

```
POST /api/driver/auth/link
{ "link_token": "lt_9f3c…w2", "trip_number": "643053" }
```

`trip_number` optional (from `/d/{token}/{trip}`). Token is bound to one `driver_contacts` id + `date`.

```json
{
  "token": "sess_…",
  "driver_id": 184,
  "driver_name": "Jane Driver",
  "driver_kind": "broker",
  "date": "2026-09-17",
  "open_trip": "643053",
  "expires_at": "2026-09-18T02:00:00-05:00"
}
```

Then `GET /api/driver/me/assignments?date=2026-09-17` (that date). If `open_trip` is set, PWA opens that trip card — still only this contact’s trips.

**Phone** (when they have it):

```
POST /api/driver/auth
{ "phone": "9205551212" }
```

**Employee ID + PIN** (when they have it):

```
POST /api/driver/auth
{ "employee_id": "E10422", "pin": "4471" }
```

Both return the same session JSON (`open_trip` null). `link_token` TTL: through **end of `date` + 36h** America/Chicago, reused across the 90s SMS debounce. Revoke on contact disable. 401 if expired; never a board-wide token.

---

## Defaults baked into these contracts

- **All drivers** (company, broker, owner-op). Share link is the on-ramp. SMS + HTTPS `link_url` is v1 load-bearing. No company-roster gate. No cost/margin on the phone.
- Mixed Android/iPhone; **HTTPS required** for `/d/{link_token}` (not `:5001` / `:8765`). **TLS A vs B still open.**
- Dispatch wins offline; Raf “call dispatch for confirmation”; status `landed: "planner"` (not Steve, not TMS).
- Phase 1 GET is inbound (`lane: "inbound"`, `source: "inbound_5001"`). `outbound_5002` reserved for when that router publishes trips. Steve is the desk TMS adapter only — not a driver `source`.
