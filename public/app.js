const TOKEN_KEY = "driver.session";
const SESSION_KEY = "driver.session.json";
const ASSIGN_KEY = "driver.assignments";
const ETAG_KEY = "driver.etag";

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
};

async function request(method, path, body) {
  const headers = { Accept: "application/json" };
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
    const err = new Error(data.error || "request_failed");
    err.status = res.status;
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

function syncStrip(pendingCount = 0) {
  const online = navigator.onLine;
  return `<div class="sync ${online ? "" : "offline"}" role="status">
    <span><span class="dot"></span> ${online ? "Online" : "Offline"}</span>
    <span>${pendingCount} pending</span>
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
    ${syncStrip(0)}
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
    ${syncStrip(0)}
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
              .map((row) => {
                const changed = row.highlight_stop || (row.changes || []).length;
                return `<a class="trip-card" href="/trip/${encodeURIComponent(row.trip_number)}">
                  <div class="num">${escapeHtml(row.trip_number)}</div>
                  <div class="meta">${escapeHtml(row.stop_name)}</div>
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
  const row = data.assignments.find((t) => t.trip_number === tripNumber);
  const app = document.getElementById("app");
  if (!row) {
    app.innerHTML = `
      ${syncStrip(0)}
      <header class="header">
        <button class="ghost" id="back" type="button">Back</button>
        <h1>Trip ${escapeHtml(tripNumber)}</h1>
      </header>
      <p class="empty">This trip is not on your day.</p>
    `;
    document.getElementById("back").addEventListener("click", () => navigate("/day"));
    return;
  }

  const tripChanges = row.changes || [];
  const body =
    tab === "notes"
      ? renderNotes(row)
      : tab === "changes"
        ? renderChangeLog(tripChanges)
        : renderStop(row);

  app.innerHTML = `
    ${syncStrip(0)}
    ${changeBanner(tripChanges)}
    <header class="header">
      <button class="ghost" id="back" type="button">Back</button>
      <div>
        <h1>${escapeHtml(row.trip_number)}</h1>
        <div class="sub">${escapeHtml(data.driver_name)}</div>
      </div>
    </header>
    <div class="tabs">
      <button type="button" data-tab="detail" class="${tab === "detail" ? "active" : ""}">Stop</button>
      <button type="button" data-tab="notes" class="${tab === "notes" ? "active" : ""}">Notes</button>
      <button type="button" data-tab="changes" class="${tab === "changes" ? "active" : ""}">Changes</button>
    </div>
    <div class="list">${body}</div>
    <section class="status-block">
      <h3>Status — coming in Phase 2</h3>
      <div class="status-grid">
        <button type="button" disabled>En route <small>Phase 2</small></button>
        <button type="button" disabled>Arrived <small>Phase 2</small></button>
        <button type="button" disabled>Loading <small>Phase 2</small></button>
        <button type="button" disabled>Loaded <small>Phase 2</small></button>
        <button type="button" disabled>Complete <small>Phase 2</small></button>
        <button type="button" disabled>Exception <small>Phase 2</small></button>
      </div>
    </section>
  `;
  document.getElementById("back").addEventListener("click", () => navigate("/day"));
  app.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigate(`/trip/${encodeURIComponent(tripNumber)}?tab=${btn.dataset.tab}`);
    });
  });
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
        app.innerHTML = `${syncStrip(0)}<p class="empty">This link is not valid.</p>`;
        return;
      }
      renderLogin("Session expired. Sign in again.");
      return;
    }
    app.innerHTML = `${syncStrip(0)}<p class="empty">Could not load assignments.</p>`;
  }
}

window.addEventListener("popstate", () => {
  cache = null;
  render();
});
window.addEventListener("online", () => render());
window.addEventListener("offline", () => render());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

render();
