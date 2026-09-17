/** Driver-scoped inbound read model. Phone never calls Steve or the TMS. */

import { getLiveStatus } from "./status.js";

export const SAMPLE_DATE = "2026-09-17";
export const EXPIRES_AT = "2026-09-19T12:00:00-05:00";

/** Routing-tool `source`. Phase 1 mock emits inbound only. Never steve_8765 / TMS. */
export const SOURCE = {
  inbound: "inbound_5001",
  /** Reserved for later My Day rows from http://10.0.0.11:5002 — no outbound screens in Phase 1. */
  outbound: "outbound_5002",
};

export const LANE = {
  inbound: "inbound",
  outbound: "outbound",
};

export const DRIVERS = [
  {
    driver_id: 1042,
    driver_name: "Mike Hansen",
    driver_kind: "company",
    pickup_driver: "Mike Hansen",
    phone: "9205550142",
    employee_id: "1042",
    pin: "1234",
    session_token: "sess_mike",
    link_token: "lt_mike_17",
    date: SAMPLE_DATE,
    plan_version: 12,
  },
  {
    driver_id: 2208,
    driver_name: "J. Rivera",
    driver_kind: "broker",
    pickup_driver: "J. Rivera",
    phone: "4145550199",
    employee_id: null,
    pin: "2468",
    session_token: "sess_rivera",
    link_token: "lt_rivera_17",
    date: SAMPLE_DATE,
    plan_version: 4,
  },
  {
    driver_id: 3636,
    driver_name: "Josh Woods",
    driver_kind: "company",
    tester: true,
    pickup_driver: "Josh Woods",
    phone: "8636048073",
    employee_id: "3636",
    employee_ids: ["3636", "JW-1"],
    pin: "3636",
    session_token: "sess_josh",
    link_token: "lt_josh_17",
    date: SAMPLE_DATE,
    plan_version: 1,
  },
];

export const ASSIGNMENTS = {
  1042: [
    {
      trip_number: "643053",
      lane: LANE.inbound,
      source: SOURCE.inbound,
      stop_sequence: 1,
      stop_name: "Sysco Milwaukee",
      stop_address: "1051 Rawson Cir, Oak Creek, WI 53154",
      pickup_number: "PU-8821",
      delivery_location: "Kottke Cold Storage — Cottage Grove",
      pallet_count: 18,
      weight_lbs: 22100,
      temp_setpoint: "-10F",
      window_start: "2026-09-17T06:00:00-05:00",
      window_end: "2026-09-17T08:00:00-05:00",
      notes:
        "Call receiving 15 min out. Dock 4 only.\nAlso GFS Waukesha if still on the plan: PU# 8822, 8 pallets, 34F, 08:30–10:00. Keep dairy last.",
      pickup_driver: "Mike Hansen",
      status: null,
      highlight_stop: true,
      changes: [
        {
          trip_number: "643053",
          change_type: "pu_added",
          summary: "PU# PU-8821 added",
          stop_name: "Sysco Milwaukee",
          at: "2026-09-17T13:04:11-05:00",
        },
      ],
    },
    {
      trip_number: "643088",
      lane: LANE.inbound,
      source: SOURCE.inbound,
      stop_sequence: 2,
      stop_name: "US Foods Milwaukee",
      stop_address: "7800 S 6th St, Oak Creek, WI 53154",
      pickup_number: "PU-77402",
      delivery_location: "Kottke Cold Storage — Cottage Grove",
      pallet_count: 12,
      weight_lbs: 14800,
      temp_setpoint: "34F",
      window_start: "2026-09-17T09:30:00-05:00",
      window_end: "2026-09-17T11:00:00-05:00",
      notes: "",
      pickup_driver: "Mike Hansen",
      status: null,
      highlight_stop: false,
      changes: [],
    },
  ],
  2208: [
    {
      trip_number: "643210",
      lane: LANE.inbound,
      source: SOURCE.inbound,
      stop_sequence: 1,
      stop_name: "Performance Foodservice — La Crosse",
      stop_address: "4000 Commerce Dr, La Crosse, WI 54603",
      pickup_number: "PU-55119",
      delivery_location: "Kottke Cold Storage — Cottage Grove",
      pallet_count: 22,
      weight_lbs: 26400,
      temp_setpoint: "0F",
      window_start: "2026-09-17T07:00:00-05:00",
      window_end: "2026-09-17T09:00:00-05:00",
      notes: "Liftgate not required. Ask for inbound receiving.",
      pickup_driver: "J. Rivera",
      status: null,
      highlight_stop: true,
      changes: [
        {
          trip_number: "643210",
          change_type: "stop_removed",
          summary: "Stop Performance Food — Madison removed",
          stop_name: "Performance Food — Madison",
          at: "2026-09-17T06:12:00-05:00",
        },
      ],
    },
  ],
  3636: [
    {
      trip_number: "647701",
      lane: LANE.inbound,
      source: SOURCE.inbound,
      stop_sequence: 1,
      stop_name: "Badger State Produce",
      stop_address: "4100 N Port Washington Rd, Milwaukee, WI 53212",
      pickup_number: "PU-36001",
      delivery_location: "Kottke Cold Storage — Cottage Grove",
      pallet_count: 14,
      weight_lbs: 16800,
      temp_setpoint: "34F",
      window_start: "2026-09-17T07:00:00-05:00",
      window_end: "2026-09-17T09:00:00-05:00",
      notes: "TEST contact only. Call the office if this PU is not on the paper run.",
      pickup_driver: "Josh Woods",
      status: null,
      highlight_stop: true,
      changes: [
        {
          trip_number: "647701",
          change_type: "window_change",
          summary: "Window 07:00–09:00",
          stop_name: "Badger State Produce",
          at: "2026-09-17T12:15:00-05:00",
        },
      ],
    },
    {
      trip_number: "647718",
      lane: LANE.inbound,
      source: SOURCE.inbound,
      stop_sequence: 2,
      stop_name: "Kenosha Beef International",
      stop_address: "3111 122nd St, Pleasant Prairie, WI 53158",
      pickup_number: "PU-36018",
      delivery_location: "Kottke Cold Storage — Cottage Grove",
      pallet_count: 20,
      weight_lbs: 24000,
      temp_setpoint: "-10F",
      window_start: "2026-09-17T10:00:00-05:00",
      window_end: "2026-09-17T12:00:00-05:00",
      notes: "Keep frozen on the nose. Dock 2.",
      pickup_driver: "Josh Woods",
      status: null,
      highlight_stop: false,
      changes: [],
    },
  ],
};

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function phoneKey(value) {
  const d = digits(value);
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d.slice(-10);
}

export function etagFor(driver, date = driver.date) {
  return `W/"drv:${driver.driver_id}:${date}:${driver.plan_version}"`;
}

export function sessionPayload(driver, openTrip = null) {
  return {
    token: driver.session_token,
    driver_id: driver.driver_id,
    driver_name: driver.driver_name,
    driver_kind: driver.driver_kind,
    tester: Boolean(driver.tester),
    date: driver.date,
    open_trip: openTrip,
    expires_at: EXPIRES_AT,
  };
}

export function findDriverBySession(token) {
  return DRIVERS.find((d) => d.session_token === token) || null;
}

export function findDriverByLink(linkToken) {
  return DRIVERS.find((d) => d.link_token === linkToken) || null;
}

export function findDriverByAuth({ phone, employee_id, pin }) {
  const phoneDigits = phoneKey(phone);
  const emp = String(employee_id || "").trim();
  const pinOk = pin == null || pin === "" ? null : String(pin);

  if (emp) {
    return (
      DRIVERS.find((d) => {
        const ids = d.employee_ids || (d.employee_id ? [d.employee_id] : []);
        return ids.includes(emp) && d.pin === pinOk;
      }) || null
    );
  }
  if (phoneDigits) {
    return (
      DRIVERS.find((d) => {
        if (phoneKey(d.phone) !== phoneDigits) return false;
        if (pinOk == null) return true;
        return d.pin === pinOk;
      }) || null
    );
  }
  return null;
}

export function assignmentsPayload(driver, date) {
  const day = date || driver.date;
  const rows = (ASSIGNMENTS[driver.driver_id] || [])
    .filter((row) => row.lane === LANE.inbound)
    .sort((a, b) => {
      if (a.stop_sequence !== b.stop_sequence) return a.stop_sequence - b.stop_sequence;
      return a.trip_number.localeCompare(b.trip_number);
    })
    .map((row) => {
      const live = getLiveStatus(driver.driver_id, row.trip_number);
      if (!live) return { ...row, status: row.status };
      return {
        ...row,
        status: live.status,
        status_at: live.at,
        status_reason: live.reason,
        status_note: live.note,
        forward: live.forward,
      };
    });
  return {
    driver_id: driver.driver_id,
    driver_name: driver.driver_name,
    driver_kind: driver.driver_kind,
    tester: Boolean(driver.tester),
    date: day,
    lane_filter: LANE.inbound,
    plan_version: driver.plan_version,
    assignments: rows,
  };
}

export function allChanges(payload) {
  return payload.assignments.flatMap((row) => row.changes || []);
}
