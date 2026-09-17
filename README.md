# Pickup Driver PWA

Phase 1 inbound, trip-number-first, read-only app for **all drivers** (company, broker, owner-op).

Phones do not call Steve or the TMS. This repo serves a **mock** driver API only. Desk manifests still return to the TMS via Steve — not from this app.

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
- Broker day: http://localhost:3000/d/lt_rivera_17
- Broker trip: http://localhost:3000/d/lt_rivera_17/643210

`npm test` hits the mock API (no live `10.0.0.11`).
