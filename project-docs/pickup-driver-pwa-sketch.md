# Pickup Driver PWA — Working Sketch

Kottke Trucking / True Blue · Inbound pickup drivers

**Anchor system:** Inbound Route Builder Pro (`http://10.0.0.11:5001`) — Drag & Drop Route Assignment v2

As of September 17, 2026 (includes SMS notify + Rafael Gomez UX input)

## 1. What we have today (dispatcher)

Desktop board (Bootstrap, dark UI, built for ~1920×1080) — not phone-friendly.

Flow: Import → Orders → Routes → Drag & Drop assign trips to stops → assign driver or broker → save/cache → Zoho / export manifest / route analysis.

Also: Manifested Routes, Summary, AI Grouping.

### APIs already live

- `GET /api/routes`, `GET /api/route_details/{id}`
- `GET /api/dragdrop_routes/trips_list`, `GET /api/trip_groups_data`
- `POST /api/dragdrop_routes/assign_driver`, `assign_broker`, `move_trip_groups`
- `POST save_to_zoho`, `export_manifest`, `save_route_to_cache`
- `GET /api/drivers`, `GET /api/driver_contacts` (name, phone, email, truck #, DM, bucket)

### Order fields that matter for a driver

Pickup customer, PU # / notes, pickup time window, temp setpoint, pallets/weight, trip #, inbound stop sequence, delivery destination, assigned `pickup_driver`.

**Gap:** No driver-facing channel. Confirmed Sep 17, 2026 — no SMS/Twilio/notify UI or endpoints. `driver_contacts` has phones but nothing texts them. Drivers get changes by call/text/paper today.

## 2. What the PWA should feel like

Home-screen icon, fullscreen, works in coolers and rural dead zones — not a tiny copy of Drag & Drop.

### Design bar (Rafael Gomez)

Very simple and easy to navigate. Primary object for the driver is the **trip #**, not the dispatcher route board.

### Screens (MVP)

- **Login** — phone # or employee ID + PIN; map to `driver_contacts` / PowerPRO driver.
- **My day (landing)** — list of trip #s assigned for that date. Tap a trip to open. Scannable; no planner chrome.
- **Trip / stop detail** — Stop name + address on top; directly under: Pickup # / Delivery location / # of pallets / temp; appt window + Navigate (Maps) when we have address.
- **Notes tab** — special instructions only.
- **Status buttons** — En route → Arrived → Loading → Loaded / Complete; plus Exception (late, no product, wait time, wrong temp, etc.).
- **Sync strip** — online / offline / “3 updates pending.”
- **Change UX** — when dispatch changes a trip: notify “change on trip xxx — call dispatch for confirmation”; highlight the stop name where the change hit; short change log (e.g. PU# added or removed / stop added or removed).

### Not in v1 (unless insisted)

- Full drag-drop reordering on the phone
- Broker cost tools / margin math
- Full Zoho CRM editing
- Photo BOL / signature (phase 2–3)

### PWA tech shape

- App shell cached (service worker) so it opens instantly.
- IndexedDB holds today’s manifest (offline-first).
- Actions write locally first; queue sync when cell returns (timestamps = when driver tapped).
- Push (when online) on reassignment or window change.
- Install via Add to Home Screen. HTTPS required for install + push (bare `http://10.0.0.11` needs a TLS front door).

## 3. How it plugs into Drag & Drop v2

Dispatcher keeps using v2. New thin driver API filters by `pickup_driver`. Phones pull a day snapshot; status posts back; SMS on assign/reassign; optional push later.

Flow:

1. Dispatcher: `assign_driver` / `move_trip_groups` / save
2. Inbound Route Builder APIs publish snapshot → Driver PWA API
3. SMS notify to driver phone (“update — open link / call dispatch”)
4. Status events (arrived / loaded / exception) from phone
5. Zoho / manifest export on the desk side

Do **not** point the phone at the full dispatcher HTML. Driver-scoped read model only.

### Recommended new APIs (small)

- `GET /api/driver/me/assignments?date=` — stops for logged-in driver only
- `POST /api/driver/stops/{trip}/status` — `{status, at, note, lat?, lon?}`
- ETag / version on assignments so the phone knows the plan changed
- `POST /api/driver/notify` — SMS on assign/reassign via `driver_contacts` + link to day/trip view
- Change events — `{ trip_number, change_type: pu_added|pu_removed|stop_added|stop_removed|reassign|window_change, summary }` for highlight + change log

## 4. SMS alert (planned — not built yet)

Idea (Kyle, Sep 17): When dispatch assigns or changes a driver’s work, text them that there’s an update.

- Trigger on `assign_driver`, `move_trip_groups` (and later window/note edits).
- Phone from `driver_contacts` (match `pickup_driver` name).
- Copy aligned with Raf: “Change on trip 643053 — call dispatch for confirmation. Details: https://…/driver”
- Debounce / opt-in / quiet hours so every drag doesn’t spam.
- Provider TBD (e.g. Twilio); log send success/fail.

SMS is the v1 nudge; PWA push can supplement later. Phase 1.5 after read-only PWA (or even before full PWA with a mobile web link).

## 5. Build phases

| Phase | What | Outcome |
| --- | --- | --- |
| 0 – Shape | Pilot group, status codes, conflict rules (dispatch vs driver), auth, TLS host | 1–2 wk design/ops |
| 1 – Read-only PWA | Landing = trip #s for the date; detail = stop/address + PU# / delivery / pallets / temp; Notes tab; maps; Add to Home Screen | Drivers stop asking “what’s my next PU?” |
| 1.5 – SMS nudge | On assign/reassign/change: text “change on trip xxx — call dispatch…” + link; in-app highlight + change log | “Go look / call dispatch” without a phone tree |
| 2 – Two-way status | Status buttons sync back to planner (optional Zoho); live stop state on board | Fewer “where are you?” calls |
| 3 – Offline + exceptions | Full-day download at yard Wi-Fi; queued updates; exception codes; PWA push (SMS fallback) | Works in dead zones / coolers |
| 4 – Proof lite | Optional BOL photo, wait-time clock | Dispute / detention ammo |

Ballpark (rough, one solid builder): Phase 1 ≈ small; Phases 1–2 ≈ a focused month; 1–3 ≈ a quarter with pilot/hardening. Sequencing, not a bid.

## 6. Ops input — Rafael Gomez (Sep 17, 2026)

- Keep it very simple.
- Open → trip #s for that date.
- Open trip → stop name/address; under it PU# / delivery location / pallets / temp.
- Notes tab for special instructions.
- On change → notify “change on trip xxx — call dispatch for confirmation”; highlight changed stop; show what changed (PU#/stop added or removed).

## 7. Decisions still open

- Company pickup drivers only, or also brokers / owner-ops?
- When dispatch moves a stop while driver is offline — dispatch wins (notify driver) is usual.
- Where does status land — planner only, Zoho, PowerPRO, Teams?
- Hosting: internal HTTPS reverse proxy vs cloud front door to `10.0.0.11`.
- Phones: mostly Android, iPhone, or mixed?
- SMS: provider, from-number, opt-in language; do brokers get texts?
- Keep Raf’s “call dispatch for confirmation,” or later allow “open app to confirm” once status buttons exist?

## 8. Bottom line

You already have the hard part on the desk: route/stop/driver assignment APIs and rich pickup fields. A pickup PWA is a mobile, offline-friendly viewer + status channel beside Drag & Drop — not a rewrite of Inbound Route Builder Pro. SMS on assign/reassign is the cheap bridge until (and after) the app is installed.
