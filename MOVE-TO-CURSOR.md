# Move to regular Cursor, run locally, then HTTPS

This folder is the Pickup Driver PWA (draft PR branch `cursor/pickup-driver-pwa-phase1-6d2e`).

Intended home on your PC: `H:\KTDRIVES\pickup-driver-pwa`

This cloud environment cannot write to `H:` (no worker on that machine). Copy this zip there yourself, or clone from GitHub.

## GitHub (best for regular Cursor)

```bat
cd /d H:\KTDRIVES
git clone https://github.com/joshwoodsy/joshwoodsy.git pickup-driver-pwa
cd pickup-driver-pwa
git fetch origin cursor/pickup-driver-pwa-phase1-6d2e
git checkout cursor/pickup-driver-pwa-phase1-6d2e
```

Open that folder in Cursor. Needs **Node 18+**.

## Run locally

```bat
npm start
```

Open http://localhost:3000

| Who | Phone | PIN |
| --- | --- | --- |
| TEST Josh Woods (you, not a live driver) | `8636048073` | `3636` |
| Company Mike Hansen | `9205550142` | `1234` |
| Broker J. Rivera | `4145550199` | `2468` |

Share links: `/d/lt_josh_17` and `/d/lt_josh_17/647701`

## Twilio SMS (optional on your PC)

Copy `.env.example` to `.env` (gitignored). Fill SID and token from your Twilio kit. From-number is `+18555016160`.

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+18555016160
TWILIO_DRY_RUN=0
```

Do not commit `.env`. Then **Test dispatch change** on My day sends a real SMS.

## External HTTPS (after local is good)

PWA install + Web Push need HTTPS (localhost is fine for your own test). Do not put the PWA on raw `http://10.0.0.11:5001`.

Example Caddy on a public (or LAN) name, proxy to the Node app:

```
driver.your-domain {
  reverse_proxy 127.0.0.1:3000
}
```

Or IIS / nginx: terminate TLS, proxy `/` and `/api/driver/*` to `http://127.0.0.1:3000`.

Then SMS “Details:” links use `https://driver.your-domain/d/{token}` instead of localhost.

## What’s in project-docs/

Charter, Phase 0 shape, systems landscape (TMS → Steve → inbound `:5001` / outbound `:5002` → manifests back), and driver API contracts. Desk tools stay on `10.0.0.11`; this app is the phone layer only.
