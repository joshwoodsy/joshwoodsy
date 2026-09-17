import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const PORT = 34567;
const base = `http://127.0.0.1:${PORT}`;

async function start() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(PORT) },
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

  const dayPage = await fetch(`${base}/d/lt_mike_17`);
  assert.equal(dayPage.status, 200);
  assert.match(await dayPage.text(), /apple-mobile-web-app-capable/);

  const tripPage = await fetch(`${base}/d/lt_mike_17/643053`);
  assert.equal(tripPage.status, 200);
});
