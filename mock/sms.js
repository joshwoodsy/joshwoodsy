/** Twilio send helper. Never logs or returns secrets. From-number is not invented. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadDotEnv() {
  try {
    const text = readFileSync(join(root, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
    }
  } catch {
    /* no .env file */
  }
}

loadDotEnv();

function scrub(text) {
  return String(text || "")
    .replace(/[A-Za-z0-9]{32,}/g, "…")
    .slice(0, 200);
}

export function twilioStatus() {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(process.env.TWILIO_FROM || "").trim();
  const configured = Boolean(sid && token && from);
  const dryFlag = String(process.env.TWILIO_DRY_RUN || "").trim().toLowerCase();
  const dryRun = dryFlag === "1" || dryFlag === "true" || !configured;
  return { configured, dry_run: dryRun, from: from || null };
}

export function toE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (String(phone).trim().startsWith("+")) return `+${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return `+${d}`;
}

export async function sendDriverSms({ phone, body }) {
  const status = twilioStatus();
  const to = toE164(phone);
  const last4 = to.slice(-4);
  const from = status.from;
  if (!to) {
    return {
      sent: false,
      dry_run: true,
      sms_status: "skipped_no_phone",
      to_last4: null,
      from,
      provider_id: null,
    };
  }
  if (status.dry_run) {
    console.log(`[twilio dry-run] would send to …${last4} from ${from || "(unset)"} (${body.length} chars)`);
    return {
      sent: false,
      dry_run: true,
      sms_status: "would_send",
      to_last4: last4,
      from,
      provider_id: null,
    };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data.code != null ? String(data.code) : String(res.status);
      const message = scrub(data.message || `HTTP ${res.status}`);
      console.log(`[twilio] fail status=${res.status} code=${code} message=${message}`);
      return {
        sent: false,
        dry_run: false,
        sms_status: "failed",
        to_last4: last4,
        from,
        provider_id: null,
        sms_error_code: code,
        sms_error: message,
      };
    }
    const providerId = data.sid || null;
    console.log(`[twilio] sent to …${last4} sid=${providerId || "unknown"}`);
    return {
      sent: true,
      dry_run: false,
      sms_status: "sent",
      to_last4: last4,
      from,
      provider_id: providerId,
    };
  } catch (err) {
    const message = scrub(err && err.message ? err.message : "network");
    console.log(`[twilio] fail network ${message}`);
    return {
      sent: false,
      dry_run: false,
      sms_status: "failed",
      to_last4: last4,
      from,
      provider_id: null,
      sms_error_code: "network",
      sms_error: message,
    };
  }
}
