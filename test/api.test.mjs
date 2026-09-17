import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 34567;
const base = `http://127.0.0.1:${PORT}`;

async function start() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT), TWILIO_DRY_RUN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    const onData = (buf) => {
      if (String(buf).includes("Pickup Driver PWA")) {
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    setTimeout(() => reject(new Error("server start timeout")), 5000);
  });
  return child;
}

async function json(path, opts = {}) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, headers: res.headers };
}

test("Phase 0 mock driver API and /d/{link_token} routes", async (t) => {
  const child = await start();
  t.after(() => child.kill("SIGTERM"));

  const health = await json("/api/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.steve, false);
  assert.equal(health.body.tms, false);

  const badPin = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: "1042", pin: "0000" }),
  });
  assert.equal(badPin.status, 401);

  const company = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: "1042", pin: "1234" }),
  });
  assert.equal(company.status, 200);
  assert.equal(company.body.driver_kind, "company");
  assert.equal(company.body.driver_id, 1042);
  assert.equal(company.body.open_trip, null);
  assert.ok(company.body.expires_at);

  const byPhone = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "9205550142" }),
  });
  assert.equal(byPhone.status, 200);
  assert.equal(byPhone.body.driver_kind, "company");

  const assignments = await json("/api/driver/me/assignments?date=2026-09-17", {
    headers: { Authorization: `Bearer ${company.body.token}` },
  });
  assert.equal(assignments.status, 200);
  assert.equal(assignments.body.lane_filter, "inbound");
  assert.equal(assignments.body.plan_version, 12);
  assert.equal(assignments.headers.get("ETag"), 'W/"drv:1042:2026-09-17:12"');
  const trip = assignments.body.assignments.find((a) => a.trip_number === "643053");
  assert.ok(trip);
  assert.equal(trip.source, "inbound_5001");
  assert.equal(trip.lane, "inbound");
  assert.ok(assignments.body.assignments.every((a) => a.source === "inbound_5001"));
  assert.ok(assignments.body.assignments.every((a) => a.lane === "inbound"));
  assert.equal(assignments.body.lane_filter, "inbound");
  assert.equal(trip.status, null);
  assert.equal(trip.highlight_stop, true);
  assert.equal(trip.pickup_number, "PU-8821");
  assert.equal(trip.pallet_count, 18);
  assert.equal(trip.temp_setpoint, "-10F");
  assert.equal(trip.changes[0].change_type, "pu_added");
  assert.equal(trip.changes[0].stop_name, "Sysco Milwaukee");
  assert.ok(!("margin" in trip) && !("cost" in trip));

  const again = await json("/api/driver/me/assignments?date=2026-09-17", {
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "If-None-Match": assignments.headers.get("ETag"),
    },
  });
  assert.equal(again.status, 304);

  const brokerLink = await json("/api/driver/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link_token: "lt_rivera_17" }),
  });
  assert.equal(brokerLink.status, 200);
  assert.equal(brokerLink.body.driver_kind, "broker");
  assert.equal(brokerLink.body.open_trip, null);

  const brokerDay = await json("/api/driver/me/assignments?date=2026-09-17", {
    headers: { Authorization: `Bearer ${brokerLink.body.token}` },
  });
  const brokerTrip = brokerDay.body.assignments.find((a) => a.trip_number === "643210");
  assert.ok(brokerTrip);
  assert.equal(brokerTrip.changes[0].change_type, "stop_removed");

  const deep = await json("/api/driver/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      link_token: "lt_rivera_17",
      trip_number: "643210",
    }),
  });
  assert.equal(deep.body.open_trip, "643210");

  const arrived = await json("/api/driver/stops/643053/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "arrived",
      at: "2026-09-17T14:22:03-05:00",
      note: null,
      reason: null,
      client_event_id: "3f2a9c0e-4b1d-4e8a-9c11-7a0b2d55e101",
    }),
  });
  assert.equal(arrived.status, 200);
  assert.equal(arrived.body.accepted, true);
  assert.equal(arrived.body.landed, "planner");
  assert.equal(arrived.body.status, "arrived");

  const replay = await json("/api/driver/stops/643053/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "arrived",
      at: "2026-09-17T14:22:03-05:00",
      client_event_id: "3f2a9c0e-4b1d-4e8a-9c11-7a0b2d55e101",
    }),
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.status, "arrived");

  const back = await json("/api/driver/stops/643053/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "en_route",
      at: "2026-09-17T14:23:00-05:00",
      client_event_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    }),
  });
  assert.equal(back.status, 409);
  assert.equal(back.body.error, "stale_status");

  const ex = await json("/api/driver/stops/643053/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "exception",
      reason: "late",
      note: "Dock locked",
      at: "2026-09-17T14:24:00-05:00",
      client_event_id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    }),
  });
  assert.equal(ex.status, 200);
  assert.equal(ex.body.status, "exception");

  const after = await json("/api/driver/me/assignments?date=2026-09-17", {
    headers: { Authorization: `Bearer ${company.body.token}` },
  });
  const updated = after.body.assignments.find((a) => a.trip_number === "643053");
  assert.equal(updated.status, "exception");
  assert.equal(updated.status_reason, "late");
  assert.equal(updated.forward, "arrived");

  const stolen = await json("/api/driver/stops/643210/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "arrived",
      at: "2026-09-17T14:25:00-05:00",
      client_event_id: "cccccccc-dddd-4eee-8fff-000000000000",
    }),
  });
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body.error, "not_assigned");
  assert.match(stolen.body.message, /call dispatch for confirmation/);

  const ghost = await json("/api/driver/stops/641111/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "arrived",
      at: "2026-09-17T14:26:00-05:00",
      client_event_id: "dddddddd-eeee-4fff-8000-111111111111",
    }),
  });
  assert.equal(ghost.status, 409);
  assert.equal(ghost.body.error, "not_assigned");

  const deskForbidden = await json("/api/driver/notify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pickup_driver: "Mike Hansen", trip_numbers: ["643053"] }),
  });
  assert.equal(deskForbidden.status, 403);

  const demo = await json("/api/driver/demo/dispatch-change", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${company.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trip_number: "643053" }),
  });
  assert.equal(demo.status, 200);
  assert.match(demo.body.message, /Change on trip 643053/);
  assert.match(demo.body.sms_body, /call dispatch for confirmation/);
  assert.equal(demo.body.plan_version, 13);

  const alerts = await json("/api/driver/me/alerts?after=0", {
    headers: { Authorization: `Bearer ${company.body.token}` },
  });
  assert.ok(alerts.body.alerts.some((a) => a.trip_number === "643053"));

  const desk = await json("/api/driver/notify", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock-desk",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup_driver: "J. Rivera",
      date: "2026-09-17",
      trip_numbers: ["643210"],
      change_type: "reassign",
      summary: "Assigned to J. Rivera",
    }),
  });
  assert.equal(desk.status, 200);
  assert.equal(desk.body.driver_kind, "broker");

  const dayPage = await fetch(`${base}/d/lt_mike_17`);
  assert.equal(dayPage.status, 200);
  assert.match(await dayPage.text(), /apple-mobile-web-app-capable/);

  const tripPage = await fetch(`${base}/d/lt_mike_17/643053`);
  assert.equal(tripPage.status, 200);
});

test("Josh Woods TEST contact: login, share link, company assignments, SMS dry-run", async (t) => {
  const child = await start();
  t.after(() => child.kill("SIGTERM"));

  const health = await json("/api/health");
  assert.equal(health.body.twilio.dry_run, true);

  const pinOnlyWrong = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "8636048073", pin: "0000" }),
  });
  assert.equal(pinOnlyWrong.status, 401);

  const byPhone = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "8636048073", pin: "3636" }),
  });
  assert.equal(byPhone.status, 200);
  assert.equal(byPhone.body.driver_id, 3636);
  assert.equal(byPhone.body.driver_name, "Josh Woods");
  assert.equal(byPhone.body.driver_kind, "company");
  assert.equal(byPhone.body.tester, true);

  const byE164 = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "+18636048073", pin: "3636" }),
  });
  assert.equal(byE164.status, 200);
  assert.equal(byE164.body.driver_id, 3636);

  const byEmp = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: "3636", pin: "3636" }),
  });
  assert.equal(byEmp.status, 200);
  assert.equal(byEmp.body.driver_id, 3636);

  const byJw = await json("/api/driver/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: "JW-1", pin: "3636" }),
  });
  assert.equal(byJw.status, 200);
  assert.equal(byJw.body.token, "sess_josh");

  const day = await json("/api/driver/me/assignments?date=2026-09-17", {
    headers: { Authorization: `Bearer ${byPhone.body.token}` },
  });
  assert.equal(day.status, 200);
  assert.equal(day.body.driver_kind, "company");
  assert.equal(day.body.tester, true);
  assert.equal(day.body.lane_filter, "inbound");
  const first = day.body.assignments.find((a) => a.trip_number === "647701");
  const second = day.body.assignments.find((a) => a.trip_number === "647718");
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.source, "inbound_5001");
  assert.equal(first.lane, "inbound");
  assert.equal(first.stop_name, "Badger State Produce");
  assert.equal(second.stop_name, "Kenosha Beef International");
  assert.ok(!("margin" in first) && !("cost" in first));

  const share = await json("/api/driver/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link_token: "lt_josh_17", trip_number: "647701" }),
  });
  assert.equal(share.status, 200);
  assert.equal(share.body.open_trip, "647701");
  assert.equal(share.body.driver_kind, "company");

  const dayPage = await fetch(`${base}/d/lt_josh_17`);
  assert.equal(dayPage.status, 200);
  const tripPage = await fetch(`${base}/d/lt_josh_17/647701`);
  assert.equal(tripPage.status, 200);

  const notify = await json("/api/driver/notify", {
    method: "POST",
    headers: {
      Authorization: "Bearer mock-desk",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pickup_driver: "Josh Woods",
      date: "2026-09-17",
      trip_numbers: ["647701"],
      change_type: "window_change",
      summary: "Window 07:00–09:00",
    }),
  });
  assert.equal(notify.status, 200);
  assert.equal(notify.body.driver_kind, "company");
  assert.equal(notify.body.tester, true);
  assert.equal(notify.body.dry_run, true);
  assert.equal(notify.body.sent, false);
  assert.equal(notify.body.sms_status, "would_send");
  assert.equal(notify.body.to_last4, "8073");
  assert.match(notify.body.message, /Change on trip 647701/);
  assert.match(notify.body.sms_body, /call dispatch for confirmation/);
  assert.match(notify.body.link_url, /\/d\/lt_josh_17\/647701/);

  const demo = await json("/api/driver/demo/dispatch-change", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${byPhone.body.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trip_number: "647701" }),
  });
  assert.equal(demo.status, 200);
  assert.equal(demo.body.dry_run, true);
  assert.equal(demo.body.sent, false);
});
