/** In-memory planner status. Does not write Steve or the TMS. */

export const STATUS_ORDER = ["en_route", "arrived", "loading", "loaded", "complete"];
export const EXCEPTION_REASONS = ["late", "no_product", "wait_time", "wrong_temp", "other"];
export const NOT_ASSIGNED_TRIP = "641111";

const live = new Map();
const byEvent = new Map();

function key(driverId, trip) {
  return `${driverId}:${trip}`;
}

export function rank(status) {
  return STATUS_ORDER.indexOf(status);
}

export function getLiveStatus(driverId, tripNumber) {
  return live.get(key(driverId, tripNumber)) || null;
}

export function applyStatusPost(driver, tripNumber, body, assignments) {
  const status = String(body?.status || "");
  const allowed = new Set([...STATUS_ORDER, "exception"]);
  if (!allowed.has(status)) {
    return { http: 400, json: { accepted: false, error: "invalid_status" } };
  }

  const eventId = String(body.client_event_id || "");
  if (eventId && byEvent.has(eventId)) {
    return { http: 200, json: byEvent.get(eventId) };
  }

  const owns = (assignments || []).some((row) => row.trip_number === tripNumber);
  if (tripNumber === NOT_ASSIGNED_TRIP || !owns) {
    return {
      http: 409,
      json: {
        accepted: false,
        error: "not_assigned",
        message: `Change on trip ${tripNumber} — call dispatch for confirmation.`,
        trip_number: tripNumber,
        plan_version: driver.plan_version + 1,
        change: {
          trip_number: tripNumber,
          change_type: "reassign",
          summary: `Reassigned off ${driver.driver_name}`,
          stop_name: null,
          at: body.at || null,
        },
      },
    };
  }

  if (status === "exception") {
    const reason = String(body.reason || "");
    if (!EXCEPTION_REASONS.includes(reason)) {
      return { http: 400, json: { accepted: false, error: "reason_required" } };
    }
  }

  const prev = live.get(key(driver.driver_id, tripNumber));
  if (status !== "exception" && prev?.forward) {
    const next = rank(status);
    const last = rank(prev.forward);
    if (next < last) {
      return {
        http: 409,
        json: {
          accepted: false,
          error: "stale_status",
          message: "Status already moved forward.",
          trip_number: tripNumber,
          plan_version: driver.plan_version,
        },
      };
    }
  }

  const at = body.at || null;
  const record = {
    status,
    at,
    reason: status === "exception" ? body.reason : null,
    note: body.note || null,
    forward: status === "exception" ? prev?.forward || null : status,
  };
  live.set(key(driver.driver_id, tripNumber), record);

  const json = {
    trip_number: tripNumber,
    status,
    at,
    accepted: true,
    plan_version: driver.plan_version,
    landed: "planner",
  };
  if (eventId) byEvent.set(eventId, json);
  return { http: 200, json };
}
