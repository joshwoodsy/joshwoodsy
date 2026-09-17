const TOKEN_KEY = "driver.session";
const SESSION_KEY = "driver.session.json";
const ASSIGN_KEY = "driver.assignments";
const ETAG_KEY = "driver.etag";

const STATUS_ORDER = ["en_route", "arrived", "loading", "loaded", "complete"];
const STATUS_LABEL = {
  en_route: "En route",
  arrived: "Arrived",
  loading: "Loading",
  loaded: "Loaded",
  complete: "Complete",
  exception: "Exception",
};
const EXCEPTION_REASONS = [
  { id: "late", label: "Late" },
  { id: "no_product", label: "No product" },
  { id: "wait_time", label: "Wait time" },
  { id: "wrong_temp", label: "Wrong temp" },
  { id: "other", label: "Other" },
];

const ui = {
  exceptionOpen: false,
  statusError: null,
};

const api = {
  async auth(payload) {
    return request("POST", "/api/driver/auth", payload);
  },
  async authLink(link_token, trip_number) {
    return request("POST", "/api/driver/auth/link", {
      link_token,
      trip_number: trip_number || null,
    });
  },
  async assignments(date) {
    const day = date || sessionDate();
    return request(
      "GET",
      `/api/driver/me/assignments?date=${encodeURIComponent(day)}`,
    );
  },
  async postStatus(trip, payload) {
    const headers = {};
    const etag = sessionStorage.getItem(ETAG_KEY);
    if (etag) headers["If-Match"] = etag;
    return request(
      "POST",
      `/api/driver/stops/${encodeURIComponent(trip)}/status`,
      payload,
      headers,
    );
  },
};

async function request(method, path, body, extraHeaders = {}) {
  const headers = { Accept: "application/json", ...extraHeaders };
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const etag = sessionStorage.getItem(ETAG_KEY);
  if (method === "GET" && path.startsWith("/api/driver/me/assignments") && etag) {
    headers["If-None-Match"] = etag;
  }
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 304) {
    const cached = sessionStorage.getItem(ASSIGN_KEY);
    if (cached) return JSON.parse(cached);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || "request_failed");
    err.status = res.status;
    err.body = data;
    throw err;
  }
  const nextTag = res.headers.get("ETag");
  if (nextTag && path.includes("/assignments")) {
    sessionStorage.setItem(ETAG_KEY, nextTag);
    sessionStorage.setItem(ASSIGN_KEY, JSON.stringify(data));
  }
  return data;
}

function setSession(session) {
  sessionStorage.setItem(TOKEN_KEY, session.token);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ASSIGN_KEY);
  sessionStorage.removeItem(ETAG_KEY);
  ui.exceptionOpen = false;
  ui.statusError = null;
}

function currentSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function sessionDate() {
  return currentSession()?.date || new Date().toISOString().slice(0, 10);
}

function queueKey() {
  return `driver.queue.${sessionStorage.getItem(TOKEN_KEY) || "anon"}`;
}

function overlayKey() {
  return `driver.status.${sessionStorage.getItem(TOKEN_KEY) || "anon"}`;
}

function loadQueue() {
  try {
    return JSON.parse(localStorage.getItem(queueKey()) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(q) {
  localStorage.setItem(queueKey(), JSON.stringify(q));
}

function overlayMap() {
  try {
    return JSON.parse(localStorage.getItem(overlayKey()) || "{}");
  } catch {
    return {};
  }
}

function setOverlay(trip, rec) {
  const m = overlayMap();
  m[trip] = rec;
  localStorage.setItem(overlayKey(), JSON.stringify(m));
}

function clearOverlay(trip) {
  const m = overlayMap();
  delete m[trip];
  localStorage.setItem(overlayKey(), JSON.stringify(m));
}

function pendingCount() {
  return loadQueue().length;
}

function withLocal(row) {
  const local = overlayMap()[row.trip_number];
  if (!local) return row;
  return { ...row, ...local };
}

function chicagoStamp(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const offset = String(parts.timeZoneName || "GMT-05:00").replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function statusRank(status) {
  return STATUS_ORDER.indexOf(status);
}

function forwardOf(row) {
  if (row.forward) return row.forward;
  if (row.status && row.status !== "exception") return row.status;
  return null;
}

async function tapStatus(tripNumber, status, extra = {}) {
  const row = overlayMap()[tripNumber] || {};
  const event = {
    trip_number: tripNumber,
    status,
    at: chicagoStamp(),
    note: extra.note || null,
    reason: extra.reason || null,
    client_event_id: crypto.randomUUID(),
    prev: row,
  };
  const q = loadQueue();
  q.push(event);
  saveQueue(q);
  setOverlay(tripNumber, {
    status,
    status_at: event.at,
    status_reason: event.reason,
    status_note: event.note,
    forward: status === "exception" ? forwardOf(row) : status,
  });
  ui.exceptionOpen = false;
  ui.statusError = null;
  render();
  await flushQueue();
}

async function flushQueue() {
  if (!navigator.onLine) {
    render();
    return;
  }
  const q = loadQueue();
  while (q.length && navigator.onLine) {
    const event = q[0];
    try {
      await api.postStatus(event.trip_number, {
        status: event.status,
        at: event.at,
        note: event.note,
        reason: event.reason,
        client_event_id: event.client_event_id,
      });
      q.shift();
      saveQueue(q);
      ui.statusError = null;
    } catch (err) {
      if (err.status === 409 && err.body?.error === "not_assigned") {
        q.shift();
        saveQueue(q);
        clearOverlay(event.trip_number);
        ui.statusError = err.body.message || "Change — call dispatch for confirmation.";
        cache = null;
      } else if (err.status === 409 && err.body?.error === "stale_status") {
        q.shift();
        saveQueue(q);
        if (event.prev && Object.keys(event.prev).length) setOverlay(event.trip_number, event.prev);
        else clearOverlay(event.trip_number);
        ui.statusError = err.body.message || "Status already moved forward.";
      } else {
        break;
      }
    }
  }
  render();
}

function mapsUrl(address) {
  const q = encodeURIComponent(address);
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return `https://maps.apple.com/?daddr=${q}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

function navigate(path, replace = false) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  render();
}

function parseRoute() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const qs = new URLSearchParams(window.location.search);
  const sharePath = path.match(/^\/d\/([^/]+)(?:\/([^/]+))?$/);
  const tripPath = path.match(/^\/trip\/([^/]+)$/);
  return {
    path,
    linkToken: sharePath ? decodeURIComponent(sharePath[1]) : null,
    tripNumber: sharePath?.[2]
      ? decodeURIComponent(sharePath[2])
      : tripPath
        ? decodeURIComponent(tripPath[1])
        : null,
    tab: qs.get("tab") || "detail",
  };
}

function syncStrip() {
  const pending = pendingCount();
  const online = navigator.onLine;
  const line = online ? "Online" : "Offline";
  return `<div class="sync ${online ? "" : "offline"}" role="status">
    <span><span class="dot"></span> ${line}</span>
    <span>${pending} pending</span>
  </div>`;
}

function flattenChanges(data) {
  return (data.assignments || []).flatMap((row) => row.changes || []);
}

function changeBanner(changes) {
  if (!changes?.length) return "";
  const trip = changes[0].trip_number;
  return `<div class="banner">Change on trip ${escapeHtml(trip)} — call dispatch for confirmation</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function changeLabel(change) {
  const map = {
    pu_added: "PU# added",
    pu_removed: "PU# removed",
    stop_added: "Stop added",
    stop_removed: "Stop removed",
    reassign: "Reassigned",
    window_change: "Window changed",
  };
  return map[change.change_type] || change.change_type;
}

function formatWindow(start, end) {
  const clock = (iso) => {
    const m = String(iso || "").match(/T(\d{2}:\d{2})/);
    return m ? m[1] : "";
  };
  const a = clock(start);
  const b = clock(end);
  if (a && b) return `${a}–${b}`;
  return a || b || "—";
}

function renderLogin(error = "") {
  const app = document.getElementById("app");
  app.innerHTML = `
    ${syncStrip()}
    <section class="screen login">
      <p class="lead">Inbound pickups</p>
      <h1>Sign in</h1>
      <p class="lead">Phone or employee ID + PIN. Dispatch can also text you a link — no employee ID needed.</p>
      <form id="login-form">
        <div class="field">
          <label for="phone">Phone number</label>
          <input id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="9205550142" />
        </div>
        <div class="field">
          <label for="employee_id">Employee ID (optional)</label>
          <input id="employee_id" name="employee_id" inputmode="numeric" autocomplete="username" placeholder="If you have one" />
        </div>
        <div class="field">
          <label for="pin">PIN</label>
          <input id="pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" />
        </div>
        <button class="primary" type="submit">Open my day</button>
        <p class="error" id="login-error">${escapeHtml(error)}</p>
      </form>
      <div class="hint">
        <strong>Demo</strong><br />
        Company: phone 9205550142 or ID 1042 · PIN 1234<br />
        Broker: phone 4145550199 · PIN 2468 (no employee ID)<br />
        Share links:
        <div><a href="/d/lt_mike_17">/d/lt_mike_17</a></div>
        <div><a href="/d/lt_mike_17/643053">/d/lt_mike_17/643053</a></div>
        <div><a href="/d/lt_rivera_17">/d/lt_rivera_17</a></div>
        <div><a href="/d/lt_rivera_17/643210">/d/lt_rivera_17/643210</a></div>
      </div>
    </section>
  `;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const phone = String(fd.get("phone") || "").trim();
    const employee_id = String(fd.get("employee_id") || "").trim();
    const pin = String(fd.get("pin") || "").trim();
    try {
      const payload = employee_id ? { employee_id, pin } : { phone, pin };
      const result = await api.auth(payload);
      setSession(result);
      navigate("/day", true);
    } catch {
      renderLogin("Could not sign in. Check phone or ID and PIN.");
    }
  });
}

function renderDay(data) {
  const app = document.getElementById("app");
  const changes = flattenChanges(data);
  app.innerHTML = `
    ${syncStrip()}
    ${changeBanner(changes)}
    <header class="header">
      <div>
        <h1>My day</h1>
        <div class="sub">${escapeHtml(data.driver_name)} · ${escapeHtml(data.date)}</div>
      </div>
      <button class="ghost" id="sign-out" type="button">Sign out</button>
    </header>
    <div class="list">
      ${
        data.assignments.length
          ? data.assignments
              .map((raw) => {
                const row = withLocal(raw);
                const changed = row.highlight_stop || (row.changes || []).length;
                const st = row.status ? STATUS_LABEL[row.status] || row.status : "";
                return `<a class="trip-card" href="/trip/${encodeURIComponent(row.trip_number)}">
                  <div class="num">${escapeHtml(row.trip_number)}</div>
                  <div class="meta">${escapeHtml(row.stop_name)}${st ? ` · ${escapeHtml(st)}` : ""}</div>
                  ${changed ? `<div class="changed">Change — call dispatch</div>` : ""}
                </a>`;
              })
              .join("")
          : `<p class="empty">No trips for this date.</p>`
      }
    </div>
  `;
  document.getElementById("sign-out").addEventListener("click", () => {
    clearSession();
    navigate("/", true);
  });
  app.querySelectorAll(".trip-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(el.getAttribute("href"));
    });
  });
}

function renderTrip(data, tripNumber, tab) {
  const raw = data.assignments.find((t) => t.trip_number === tripNumber);
  const app = document.getElementById("app");
  if (!raw) {
    app.innerHTML = `
      ${syncStrip()}
      <header class="header">
        <button class="ghost" id="back" type="button">Back</button>
        <h1>Trip ${escapeHtml(tripNumber)}</h1>
      </header>
      <p class="empty">This trip is not on your day.</p>
    `;
    document.getElementById("back").addEventListener("click", () => navigate("/day"));
    return;
  }

  const row = withLocal(raw);
  const tripChanges = row.changes || [];
  const body =
    tab === "notes"
      ? renderNotes(row)
      : tab === "changes"
        ? renderChangeLog(tripChanges)
        : renderStop(row);
  const current = row.status;
  const fwd = forwardOf(row);
  const fwdRank = statusRank(fwd);

  app.innerHTML = `
    ${syncStrip()}
    ${ui.statusError ? `<div class="banner">${escapeHtml(ui.statusError)}</div>` : ""}
    ${changeBanner(tripChanges)}
    <header class="header">
      <button class="ghost" id="back" type="button">Back</button>
      <div>
        <h1>${escapeHtml(row.trip_number)}</h1>
        <div class="sub">${escapeHtml(data.driver_name)}${current ? ` · ${escapeHtml(STATUS_LABEL[current] || current)}` : ""}</div>
      </div>
    </header>
    <div class="tabs">
      <button type="button" data-tab="detail" class="${tab === "detail" ? "active" : ""}">Stop</button>
      <button type="button" data-tab="notes" class="${tab === "notes" ? "active" : ""}">Notes</button>
      <button type="button" data-tab="changes" class="${tab === "changes" ? "active" : ""}">Changes</button>
    </div>
    <div class="list">${body}</div>
    <section class="status-block">
      <h3>Status</h3>
      <div class="status-grid">
        ${STATUS_ORDER.map((code) => {
          const r = statusRank(code);
          const isCurrent = current === code;
          const disabled = fwdRank >= 0 && r < fwdRank;
          return `<button type="button" data-status="${code}" class="${isCurrent ? "current" : ""}" ${disabled ? "disabled" : ""}>${STATUS_LABEL[code]}${isCurrent ? "<small>Now</small>" : ""}</button>`;
        }).join("")}
        <button type="button" data-status="exception" class="${current === "exception" ? "current" : ""}">Exception${current === "exception" ? "<small>Now</small>" : ""}</button>
      </div>
      ${ui.exceptionOpen ? renderExceptionForm(row) : ""}
    </section>
  `;
  document.getElementById("back").addEventListener("click", () => {
    ui.exceptionOpen = false;
    navigate("/day");
  });
  app.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.exceptionOpen = false;
      navigate(`/trip/${encodeURIComponent(tripNumber)}?tab=${btn.dataset.tab}`);
    });
  });
  app.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.status;
      if (code === "exception") {
        ui.exceptionOpen = true;
        render();
        return;
      }
      tapStatus(tripNumber, code);
    });
  });
  const form = document.getElementById("exception-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const reason = String(fd.get("reason") || "");
      const note = String(fd.get("note") || "").trim();
      if (!reason) return;
      if (reason === "other" && !note) return;
      tapStatus(tripNumber, "exception", { reason, note: note || null });
    });
    document.getElementById("exception-cancel")?.addEventListener("click", () => {
      ui.exceptionOpen = false;
      render();
    });
  }
}

function renderExceptionForm(row) {
  return `
    <form id="exception-form" class="exception-panel">
      <p>What happened at ${escapeHtml(row.stop_name)}?</p>
      <div class="reason-grid">
        ${EXCEPTION_REASONS.map(
          (r) =>
            `<label><input type="radio" name="reason" value="${r.id}" required /> ${escapeHtml(r.label)}</label>`,
        ).join("")}
      </div>
      <label class="field" for="exception-note">Note</label>
      <input id="exception-note" name="note" placeholder="Optional — required for Other" />
      <button class="primary" type="submit">Send exception</button>
      <button class="ghost" type="button" id="exception-cancel">Cancel</button>
    </form>
  `;
}

function renderStop(row) {
  const highlight = row.highlight_stop;
  return `
      <article class="stop ${highlight ? "changed" : ""}">
        <h2>${escapeHtml(row.stop_name)}</h2>
        <div class="addr">${escapeHtml(row.stop_address || "")}</div>
        <dl class="facts">
          <div><dt>Pickup #</dt><dd>${escapeHtml(row.pickup_number || "—")}</dd></div>
          <div><dt>Delivery location</dt><dd>${escapeHtml(row.delivery_location || "—")}</dd></div>
          <div><dt># of pallets</dt><dd>${escapeHtml(row.pallet_count ?? "—")}</dd></div>
          <div><dt>Temp</dt><dd>${escapeHtml(row.temp_setpoint || "—")}</dd></div>
        </dl>
        <div class="row-actions">
          <div class="window"><span>Appt window</span>${escapeHtml(formatWindow(row.window_start, row.window_end))}</div>
          ${
            row.stop_address
              ? `<a class="btn maps" href="${mapsUrl(row.stop_address)}" target="_blank" rel="noopener">Navigate</a>`
              : ""
          }
        </div>
      </article>
    `;
}

function renderNotes(row) {
  const text = (row.notes || "").trim();
  if (!text) return `<p class="empty">No special instructions.</p>`;
  return `<article class="stop"><h2>${escapeHtml(row.stop_name)}</h2><div class="notes">${escapeHtml(text)}</div></article>`;
}

function renderChangeLog(changes) {
  if (!changes.length) return `<p class="empty">No changes on this trip.</p>`;
  return `<ul class="changelog">${changes
    .map(
      (c) =>
        `<li><strong>${escapeHtml(changeLabel(c))}</strong><div class="meta">${escapeHtml(c.summary)}</div></li>`,
    )
    .join("")}</ul>`;
}

let cache = null;

async function loadAssignments() {
  if (cache) return cache;
  cache = await api.assignments();
  return cache;
}

async function consumeLink(linkToken, tripNumber) {
  const result = await api.authLink(linkToken, tripNumber);
  setSession(result);
  cache = null;
  const open = result.open_trip || tripNumber;
  if (open) navigate(`/trip/${encodeURIComponent(open)}`, true);
  else navigate("/day", true);
}

async function render() {
  const route = parseRoute();
  const app = document.getElementById("app");
  try {
    if (route.linkToken) {
      await consumeLink(route.linkToken, route.tripNumber);
      return;
    }

    const authed = Boolean(sessionStorage.getItem(TOKEN_KEY));
    if (!authed) {
      renderLogin();
      return;
    }

    if (route.path === "/" || route.path === "/login") {
      navigate("/day", true);
      return;
    }

    const data = await loadAssignments();
    if (route.tripNumber) renderTrip(data, route.tripNumber, route.tab);
    else renderDay(data);
  } catch (err) {
    if (err.status === 401 || err.status === 404) {
      clearSession();
      cache = null;
      if (route.linkToken) {
        app.innerHTML = `${syncStrip()}<p class="empty">This link is not valid.</p>`;
        return;
      }
      renderLogin("Session expired. Sign in again.");
      return;
    }
    app.innerHTML = `${syncStrip()}<p class="empty">Could not load assignments.</p>`;
  }
}

window.addEventListener("popstate", () => {
  cache = null;
  render();
});
window.addEventListener("online", () => flushQueue());
window.addEventListener("offline", () => render());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

render();
