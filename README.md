# Pickup Driver PWA

Inbound, trip-number-first app for **all drivers** (company, broker, owner-op). Phase 2 adds local-first status taps.

Phones do not call Steve or the TMS. Mock API only. Desk manifests still return to the TMS via Steve — not from this app.

## Run locally

```bash
npm start
```

Open http://localhost:3000

Demo login:

- Company: phone `9205550142` or employee ID `1042`, PIN `1234`
- Broker: phone `4145550199` · PIN `2468` (no employee ID)
- Day link: http://localhost:3000/d/lt_mike_17
- Trip link: http://localhost:3000/d/lt_mike_17/643053

Status: open a trip → En route / Arrived / Loading / Loaded / Complete (forward-only). Exception needs a reason. Sync strip shows pending, then Online when the mock POST lands on the planner.

409 not assigned: POST `/api/driver/stops/641111/status` (or another driver’s trip).

`npm test` hits the mock API (no live `10.0.0.11`).
