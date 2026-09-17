# Pickup Driver PWA

Inbound, trip-number-first app for **all drivers** (company, broker, owner-op). Phase 2 adds local-first status taps.

Phones do not call Steve or the TMS. Mock API only. Desk manifests still return to the TMS via Steve — not from this app.

## Run locally

```bash
npm start
```

Open http://localhost:3000

Demo login:

- TEST (not a live driver): phone `8636048073` or employee ID `3636` / `JW-1`, PIN `3636`
- Company: phone `9205550142` or employee ID `1042`, PIN `1234`
- Broker: phone `4145550199` · PIN `2468` (no employee ID)
- TEST day: http://localhost:3000/d/lt_josh_17
- TEST trip: http://localhost:3000/d/lt_josh_17/647701
- Mike day: http://localhost:3000/d/lt_mike_17
- Mike trip: http://localhost:3000/d/lt_mike_17/643053

Status: open a trip → En route / Arrived / Loading / Loaded / Complete (forward-only). Exception needs a reason. Sync strip shows pending, then Online when the mock POST lands on the planner.

409 not assigned: POST `/api/driver/stops/641111/status` (or another driver’s trip).

SMS: dispatch texts from `+18555016160`. Copy `.env.example` to a gitignored `.env` and fill `TWILIO_*` to send for real. Missing keys (or `TWILIO_DRY_RUN=1`) stay dry-run. `npm test` always dry-runs.

`npm test` hits the mock API (no live `10.0.0.11`).
