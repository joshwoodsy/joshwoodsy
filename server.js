import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignmentsPayload,
  etagFor,
  findDriverByAuth,
  findDriverByLink,
  findDriverBySession,
  sessionPayload,
} from "./mock/data.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": payload.length,
    ...headers,
  });
  res.end(payload);
}

function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

async function servePublic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === "/") rel = "/index.html";
  const filePath = join(publicDir, rel);
  const normalized = normalize(filePath);
  if (!normalized.startsWith(publicDir)) {
    json(res, 403, { error: "forbidden" });
    return true;
  }
  try {
    const st = await stat(normalized);
    if (!st.isFile()) return false;
    const body = await readFile(normalized);
    send(res, 200, body, {
      "Content-Type": MIME[extname(normalized)] || "application/octet-stream",
      "Cache-Control": rel === "/sw.js" ? "no-cache" : "public, max-age=60",
    });
    return true;
  } catch {
    return false;
  }
}

async function handleApi(req, res, url) {
  const path = url.pathname;

  if (req.method === "GET" && path === "/api/health") {
    json(res, 200, { ok: true, mock: true, steve: false, tms: false });
    return true;
  }

  if (req.method === "POST" && path === "/api/driver/auth/link") {
    const body = await readJson(req);
    if (!body) {
      json(res, 400, { error: "invalid_json" });
      return true;
    }
    const driver = findDriverByLink(body.link_token);
    if (!driver) {
      json(res, 401, { error: "unauthorized" });
      return true;
    }
    const openTrip = body.trip_number ? String(body.trip_number) : null;
    json(res, 200, sessionPayload(driver, openTrip));
    return true;
  }

  if (req.method === "POST" && path === "/api/driver/auth") {
    const body = await readJson(req);
    if (!body) {
      json(res, 400, { error: "invalid_json" });
      return true;
    }
    const driver = findDriverByAuth(body);
    if (!driver) {
      json(res, 401, { error: "unauthorized" });
      return true;
    }
    json(res, 200, sessionPayload(driver, null));
    return true;
  }

  if (req.method === "GET" && path === "/api/driver/me/assignments") {
    const session = findDriverBySession(bearer(req));
    if (!session) {
      json(res, 401, { error: "unauthorized" });
      return true;
    }
    const date = url.searchParams.get("date") || session.date;
    const etag = etagFor(session, date);
    if ((req.headers["if-none-match"] || "") === etag) {
      res.writeHead(304, {
        ETag: etag,
        "Cache-Control": "private, no-cache",
      });
      res.end();
      return true;
    }
    json(res, 200, assignmentsPayload(session, date), {
      ETag: etag,
      "Cache-Control": "private, no-cache",
    });
    return true;
  }

  if (req.method === "POST" && /^\/api\/driver\/stops\/[^/]+\/status$/.test(path)) {
    json(res, 501, {
      accepted: false,
      error: "phase_1_readonly",
      message: "Status posts in Phase 2.",
    });
    return true;
  }

  if (path.startsWith("/api/")) {
    json(res, 404, { error: "not_found" });
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (await handleApi(req, res, url)) return;
    if (req.method === "GET" || req.method === "HEAD") {
      if (await servePublic(req, res, url.pathname)) return;
      const index = await readFile(join(publicDir, "index.html"));
      send(res, 200, index, { "Content-Type": "text/html; charset=utf-8" });
      return;
    }
    json(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    json(res, 500, { error: "server_error", detail: String(err.message || err) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pickup Driver PWA (mock) http://localhost:${PORT}`);
  console.log("Share demos (Phase 0 routes):");
  console.log(`  http://localhost:${PORT}/d/lt_mike_17`);
  console.log(`  http://localhost:${PORT}/d/lt_mike_17/643053`);
  console.log(`  http://localhost:${PORT}/d/lt_rivera_17`);
  console.log(`  http://localhost:${PORT}/d/lt_rivera_17/643210`);
});
