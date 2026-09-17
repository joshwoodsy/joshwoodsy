# Systems landscape (updated Sep 17, 2026)

User corrections after the original Pickup Driver PWA sketch.

## Devices

Mixed — Android and iPhone. PWA must install (Add to Home Screen) and be usable in the truck on both.

## Audience (v1)

**All drivers** — company pickup drivers, brokers, and owner-ops. Dispatch sends a link so a broker or owner-op can participate without a company employee login. Phone or PIN is fine when they have one; a link-only user must still land on their day / that trip.

## Desk systems today

| System | URL | Role |
| --- | --- | --- |
| TMS | (not given) | Source of record. Steve reads from it; finished inbound and outbound manifests go back into it. |
| Steve | `http://10.0.0.11:8765/` | Finesses TMS data so it is useful for LTL routing, inbound and outbound. Manifests from inbound and outbound are sent back into the TMS through Steve. |
| Inbound (Route Builder / Drag & Drop v2) | `http://10.0.0.11:5001` | Inbound pickup LTL routing and assignment, using Steve-shaped data. |
| Outbound | `http://10.0.0.11:5002` (**locked**) | Outbound LTL routing program, same Steve pattern. |

Flow: **TMS → Steve → inbound `:5001` and outbound `:5002` → manifests → Steve → TMS**.

Cloud VMs cannot reach these hosts. Design from this note + the charter; do not stall on live probes.

## Intended shape

- Possibly consolidate inbound + outbound into one desk tool that connects into Steve (the TMS adapter), not a new TMS.
- The Pickup Driver PWA sits **on top** of the routing tools: notifications, trip/stop views, and mobile-app-type actions while drivers are in trucks.
- Phones do **not** talk to the TMS or to Steve. Driver-scoped read model only. Manifests still return to the TMS via Steve on the desk side.
- Phase 1 PWA remains inbound, trip-number-first, read-only. Consolidation is a parallel design track, not a phone rewrite.

## Still open

- Hosting: internal HTTPS reverse proxy vs cloud front door (required for installable PWA + share links on mixed phones).
- TMS product name (if it matters for later Zoho / PowerPRO / status landing).
