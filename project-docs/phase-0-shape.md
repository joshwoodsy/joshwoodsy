# Pickup Driver PWA — Phase 0 shape

Kottke Trucking / True Blue · inbound pickup drivers  
Sep 17, 2026 · beside Drag & Drop v2, not a rewrite of Inbound Route Builder Pro

Phase 1 is **inbound, trip-number-first, read-only**. This note locks pilot assumptions, codes, conflicts, auth, TLS, SMS 1.5, and how a thin driver API sits on the desk stack.

## Pilot assumptions

- **Who (locked):** **all drivers in v1** — company pickup, broker, and owner-op. Same trip-number UX. No broker cost / margin tools on the phone.
- **On-ramp:** **shareable HTTPS link** is load-bearing. Dispatch texts a broker/owner-op; they open their day (and a trip) **without an employee ID**. Company drivers may still use phone or employee ID + PIN when they have it.
- **Phones:** mixed Android + iPhone. Same app; install via Add to Home Screen; usable in the truck on both. **HTTPS is required** for those links (and for install/push).
- **Object:** trip # is the primary thing on the phone. No dispatcher board, routes, drag-drop, or margin math.
- **Day:** one date’s assignments for the **linked** `pickup_driver` / `driver_contacts` row (including brokers). Tap a trip → stop name/address, then PU # / delivery / pallets / temp; Notes tab for special instructions only.
- **Desk stays desk:** TMS, Steve, inbound, and outbound keep running. The PWA is notify + mobile actions on top of the **routing tools**, not a TMS client and not a mobile dispatcher.

## Desk stack (PWA sits on top; does not replace)

Flow: **TMS → Steve → inbound `:5001` and outbound `:5002` → manifests → Steve → TMS**.

| System | Host | Role | PWA |
| --- | --- | --- | --- |
| TMS | (name not given) | Source of record | **Never called from the phone** |
| Steve | `http://10.0.0.11:8765/` | **Locked:** finesses TMS data for LTL routing (inbound and outbound). Finished inbound and outbound manifests go back into the TMS **through Steve** | **Never called from the phone.** Desk save/export still returns manifests via Steve |
| Inbound Route Builder / Drag & Drop v2 | `http://10.0.0.11:5001` | Inbound pickup LTL routing and assignment, using Steve-shaped data | **Phase 1 source of truth** for driver snapshots + status landing |
| Outbound | `http://10.0.0.11:5002` (**locked**) | Outbound LTL routing, same Steve pattern | Out of Phase 1. Driver API may grow a `lane` later from this tool, not from Steve |

Driver snapshots and status sit **beside** `:5001` / later `:5002`. They do not go to Steve or the TMS. Manifest round-trip stays desk-side.

Possible later consolidation: **one desk tool that talks to Steve** (same TMS adapter), not a new TMS, and not a dispatcher on the phone. Parallel desk track; Phase 1 PWA stays inbound, trip-number-first.

Do not expose `:5001` / `:5002` / `:8765` HTML to phones. Driver API + PWA static only.

## Devices — PWA install / push limits

HTTPS is required for install and push. Bare `http://10.0.0.11` cannot ship a real PWA.

| | Android (Chrome) | iPhone (Safari) |
| --- | --- | --- |
| Install | Chrome → Add to Home Screen / install prompt | **Safari only** → Share → **Add to Home Screen**. Chrome-on-iOS is not a full PWA host |
| Service worker / offline shell | Yes, installed or tab | Yes **after** A2HS (standalone). Limited if they only bookmark a tab |
| Web Push | Reliable once granted | **iOS 16.4+**, and only after A2HS + user permission. Easy to miss; treat as best-effort |
| Background sync | Better | Weak. Do not rely on it for status flush |

**Default:** SMS **with the share link** is load-bearing in v1 for **every** assigned driver type (company, broker, owner-op), especially iPhone. In-app highlight + change log when they open the PWA. Push is Phase 3 supplement, not the v1 channel. HTTPS host is required so those links work on mixed phones.

## Status codes (Phase 2 posts; lock the enum now)

Forward-only on the trip except `exception`. Timestamp = when the driver tapped (queued if offline).

| Code | Button | Meaning |
| --- | --- | --- |
| `en_route` | En route | Rolling to this stop |
| `arrived` | Arrived | On site |
| `loading` | Loading | Product moving |
| `loaded` | Loaded | On the truck |
| `complete` | Complete | Done with this trip/stop |
| `exception` | Exception | Needs dispatch; always with a reason |

Exception reasons: `late` · `no_product` · `wait_time` · `wrong_temp` · `other` (+ free-text `note`).

**Where it lands:** planner first (inbound Drag & Drop v2 stop state). Zoho / PowerPRO / Teams are later optional fans — not Phase 2 blockers.

## Conflict rules (dispatch vs driver)

| Kind | Winner | Behavior |
| --- | --- | --- |
| Plan (who has the trip, sequence, PU #, window, notes, stop add/remove) | **Dispatch** | Phone refetches when `plan_version` / ETag changes. Offline driver does not keep a stale plan |
| Status taps (`en_route` … `complete` / `exception`) | **Driver tap time** | Apply if this driver still owns the trip for that date |
| Dispatch moves/reassigns while driver is **offline** | **Dispatch** | Drop queued status for trips the driver no longer owns. Notify: Raf copy below |
| Stale phone posts status after reassign | 409 | Body says trip is no longer theirs; show change + call dispatch |

No “driver confirms the new plan” in Phase 1–2. Copy stays **call dispatch for confirmation**. “Open app to confirm” is a later option after status buttons exist.

## Auth

Three ways onto the **same** driver-scoped session. Filter is always that contact ↔ `pickup_driver` (including brokers in `driver_contacts`). No dispatcher logins. No employee ID required for brokers/owner-ops.

1. **Share link / token (v1 on-ramp).** Dispatch SMS (or paste) `https://<pwa-host>/d/{link_token}` for the day’s assignments, or `https://<pwa-host>/d/{link_token}/{trip_number}` to open that trip. Token maps to one `driver_contacts` row + date. PWA exchanges it for a session and lands on My Day or the trip. This is how a broker/owner-op participates without employee ID.
2. **Phone number** — when they have one on file. Normalize E.164 / 10-digit → `driver_contacts.phone` (company, broker, or owner-op).
3. **Employee ID + PIN** — when they have it (typical company / PowerPRO). Join `driver_contacts` by name (same person as `pickup_driver`).

Session: Bearer, ~12h, bound to that contact. `/api/driver/me/*` is always “this driver.” Link tokens are unguessable, date-scoped, and **not** a capability to see other drivers or the board. Same trip-number UI for `driver_kind`: `company` | `broker` | `owner_op`.

## TLS hosting options

**HTTPS is required** for share links, Add to Home Screen, and push on mixed iOS/Android. Bare `http://10.0.0.11` cannot be the SMS target. Keep TMS, Steve `:8765`, inbound `:5001`, and outbound `:5002` on the LAN. **Which TLS front door (A vs B) is still open.**

| Option | What | Use when |
| --- | --- | --- |
| **A. Internal HTTPS reverse proxy** (recommended default) | Company cert or Let’s Encrypt on e.g. `driver.…` → PWA static + `/api/driver/*` only. Proxy to inbound `:5001` for the read model | Ops can terminate TLS at the yard/edge |
| **B. Cloud front door** | Cloud HTTPS → tunnel/VPN to `10.0.0.11` | They will not put TLS on-prem; still do not publish the desk UIs |

Do not put the PWA on raw `http://10.0.0.11:5001`.

## SMS 1.5 — trigger, debounce, copy

**Load-bearing in v1**, not a company-only extra. Every assign/reassign/change to a `driver_contacts` row (company, broker, owner-op) texts the **share link** so they can open the day without employee ID. **Provider: Twilio** (locked). From-number **`+18555016160`**. Credentials via env (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`); never in git. Log send success/fail. Skip only if there is **no phone** on the contact.

**Triggers** (after successful desk mutation on inbound `:5001`):

- `POST /api/dragdrop_routes/assign_driver`
- `POST /api/dragdrop_routes/assign_broker`
- `POST /api/dragdrop_routes/move_trip_groups`
- Later: window / PU # / notes edits that bump `plan_version`

**Debounce:** coalesce **90 seconds per contact**. One SMS per quiet window, listing distinct trip #s (cap 3, then “+N more”). Quiet hours default **21:00–05:00 America/Chicago** — queue and send at 05:00 unless the change is a same-night reassign (still send). Opt-in flag on `driver_contacts`; default **on** when they have a phone (brokers included).

Mint/reuse a date-scoped `link_token` for that contact. One trip → deep link; several trips → day link.

**Copy (Raf) — one trip:**

```
Change on trip 643053 — call dispatch for confirmation. Details: https://<pwa-host>/d/{link_token}/643053
```

Several trips after coalesce:

```
Change on trips 643053, 643060 — call dispatch for confirmation. Details: https://<pwa-host>/d/{link_token}
```

In-app (when they open): highlight the **stop name** that changed; change log line from the event `summary`. Same trip-number screens for every driver type.

## Thin driver API beside Drag & Drop v2

Dispatcher keeps using v2 (`assign_driver`, `assign_broker`, `move_trip_groups`, save/cache, Zoho, manifest). Desk save/export still ships manifests **Steve → TMS**. New routes live under `/api/driver/*` (same inbound process or a tiny sidecar that **reads the inbound assignment store**). The phone never calls Steve or the TMS.

```
TMS → Steve → inbound :5001 (and outbound :5002)
Desk: assign / move / save
  → bump plan_version, append change events
  → POST /api/driver/notify (SMS + share link; v1, all driver types)
  → manifests → Steve → TMS
Phone: open /d/{link_token}[/trip] or phone/PIN
Phone: GET /api/driver/me/assignments?date=   (If-None-Match)  ← from routing tool, not Steve
Phone: POST /api/driver/stops/{trip}/status   (Phase 2)         ← planner first, not TMS
```

- Filter by the **linked** contact ↔ `pickup_driver` ↔ `driver_contacts` (**including brokers**). Same JSON, same trip-number UX. No cost/margin fields.
- Do **not** rewrite Inbound Route Builder Pro. Do not point the phone at dispatcher HTML.
- Shape for later lanes without a board on the phone: each assignment has `lane` (`inbound` in Phase 1) and `source` (`inbound_5001` now; `outbound_5002` later when that tool publishes trips). **`source` is never Steve or the TMS.** Primary key on the phone remains **`trip_number`**, not route id. Adding outbound later is more trips on My Day from the outbound router, not a Drag & Drop clone and not a Steve client.

Contracts: [internal/api-contracts.md](../internal/api-contracts.md).

## Recommended defaults (still-open decisions)

**Locked:** v1 audience is **all drivers** (company, broker, owner-op). Share link is the on-ramp. SMS + HTTPS link is load-bearing. Steve is the TMS adapter at `http://10.0.0.11:8765/` (LTL-shaped data in; manifests back to TMS). Outbound is `http://10.0.0.11:5002`. Mixed Android + iPhone. Dispatch wins offline. Raf “call dispatch for confirmation.” Status to planner first. Phone does not call Steve or the TMS. No broker cost/margin on the phone.

**Still open:** TLS host (**internal proxy vs cloud front door** — HTTPS itself is required); TMS product name (only if it matters later for Zoho / PowerPRO / status fans).

| Item | Default until told otherwise |
| --- | --- |
| Audience | **All drivers** — company, broker, owner-op |
| Auth | Phone or employee ID + PIN **when they have it**; else **link/token** to that day’s assignments (deep-link trip) |
| Phones | **Mixed Android + iPhone** (Safari A2HS on iOS) |
| Offline plan conflict | **Dispatch wins**; notify driver |
| Change copy | Raf: **“call dispatch for confirmation”** |
| Status destination | **Planner first** (inbound v2). Not Steve, not TMS |
| Hosting (**open**: A vs B) | **HTTPS required** for share links. Recommend internal reverse proxy; cloud front door if TLS cannot live on-prem |
| Outbound host | **Locked** — `http://10.0.0.11:5002` |
| Steve | **Locked** — TMS adapter; desk manifests only; not a PWA dependency |
| SMS | **Twilio** (locked), from **`+18555016160`**. v1 load-bearing for every assigned contact with a phone; debounce 90s; quiet hours 21:00–05:00 CT; opt-in default on. |
| Confirm-in-app vs call dispatch | Stay on **call dispatch** through Phase 2 |
