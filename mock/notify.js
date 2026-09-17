/** Mock dispatch notify + SMS (Twilio when TWILIO_* is complete; otherwise dry-run). */

import { ASSIGNMENTS, DRIVERS } from "./data.js";
import { sendDriverSms } from "./sms.js";

let alertSeq = 1;
const inbox = new Map();

function chicagoNow() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
}

function stamp() {
  const p = chicagoNow();
  const offset = String(p.timeZoneName || "GMT-05:00").replace("GMT", "");
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

function listFor(driverId) {
  if (!inbox.has(driverId)) inbox.set(driverId, []);
  return inbox.get(driverId);
}

export function findDriverByName(name) {
  const n = String(name || "").trim().toLowerCase();
  return DRIVERS.find((d) => d.pickup_driver.toLowerCase() === n || d.driver_name.toLowerCase() === n) || null;
}

export function alertsSince(driverId, afterId = 0) {
  return listFor(driverId).filter((a) => a.id > afterId);
}

export async function applyDispatchChange(driver, { trip_number, change_type, summary, host }) {
  const rows = ASSIGNMENTS[driver.driver_id] || [];
  const trip =
    (trip_number && rows.find((r) => r.trip_number === String(trip_number))) || rows[0];
  if (!trip) return { http: 404, json: { error: "no_trip" } };

  driver.plan_version += 1;
  const type = change_type || "window_change";
  const line = summary || "Window 08:00–10:00";
  const at = stamp();
  const change = {
    trip_number: trip.trip_number,
    change_type: type,
    summary: line,
    stop_name: trip.stop_name,
    at,
  };
  trip.changes = [change, ...(trip.changes || [])];
  trip.highlight_stop = true;

  const origin = host || "http://localhost:3000";
  const link_path = `/d/${driver.link_token}/${trip.trip_number}`;
  const link_url = `${origin}${link_path}`;
  const message = `Change on trip ${trip.trip_number} — call dispatch for confirmation.`;
  const sms_body = `${message} Details: ${link_url}`;

  const alert = {
    id: alertSeq,
    trip_number: trip.trip_number,
    message,
    sms_body,
    link_path,
    link_url,
    plan_version: driver.plan_version,
    change,
    at,
  };
  alertSeq += 1;
  listFor(driver.driver_id).push(alert);

  const sms = await sendDriverSms({ phone: driver.phone, body: sms_body });
  alert.sms_status = sms.sms_status;
  alert.dry_run = sms.dry_run;
  alert.provider_id = sms.provider_id || null;
  return {
    http: 200,
    json: {
      sent: sms.sent,
      dry_run: sms.dry_run,
      sms_status: sms.sms_status,
      provider_id: sms.provider_id || (sms.dry_run ? "dry-run" : "mock-sms"),
      driver_kind: driver.driver_kind,
      tester: Boolean(driver.tester),
      to_last4: sms.to_last4,
      from: sms.from || null,
      trip_numbers: [trip.trip_number],
      link_url,
      sms_body,
      message,
      plan_version: driver.plan_version,
      change,
      alert_id: alert.id,
      sms_error_code: sms.sms_error_code || null,
      sms_error: sms.sms_error || null,
    },
  };
}

export async function mockDeskNotify(body, host) {
  const driver = findDriverByName(body.pickup_driver);
  if (!driver) return { http: 422, json: { sent: false, error: "no_contact" } };
  if (!driver.phone) return { http: 422, json: { sent: false, error: "no_contact" } };
  const trip = (body.trip_numbers && body.trip_numbers[0]) || null;
  return applyDispatchChange(driver, {
    trip_number: trip,
    change_type: body.change_type,
    summary: body.summary,
    host,
  });
}
