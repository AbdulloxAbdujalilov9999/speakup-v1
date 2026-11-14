/* SpeakUp-1 web server (Render web service): serves the site and keeps the
 * course itself (lesson data, slides, homework and answer-key files) behind a
 * sign-in and a paid licence.
 *
 *   POST /api/session {idToken}  checks the Firebase ID token (Google's public
 *     keys, no service account needed), reads the user's profile and center
 *     from the Realtime Database with that same token (so the database rules
 *     apply), and sets a short-lived signed cookie.
 *   Course paths (data/, slides*, content*) need that cookie. Lesson source
 *     decks (PPTX) and answer keys need a staff cookie (owner, manager,
 *     center admin or teacher).
 *
 * No npm dependencies. Env: SESSION_SECRET (set it on Render so sessions survive
 * restarts), PORT, and optionally FIREBASE_PROJECT_ID / FIREBASE_DB_URL (default:
 * read from shared/firebase-config.js). FIREBASE_AUTH_EMULATOR_HOST and
 * FIREBASE_DATABASE_EMULATOR_HOST switch to the local emulators for tests. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8761;
const cfgText = fs.readFileSync(path.join(ROOT, "shared", "firebase-config.js"), "utf8");
const cfgVal = k => (cfgText.match(new RegExp(k + ':\\s*"([^"]+)"')) || [])[1];
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || cfgVal("projectId");
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const DB_EMU = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "";
const DB_URL = DB_EMU ? `http://${DB_EMU}` : (process.env.FIREBASE_DB_URL || cfgVal("databaseURL"));
const DB_NS = DB_EMU ? `?ns=${PROJECT_ID}-default-rtdb&` : "?";
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET not set: sessions reset when the server restarts");
const SESSION_HOURS = 12;
const STAFF = new Set(["owner", "manager", "admin", "teacher"]);

/* ---------- paths ---------- */
const GATED = /^\/(data|slides|slides-v2|content|content-v2)\//;
const STAFF_ONLY = /^\/content(-v2)?\/(1 - Lessons|3 - Answers)\//;
const HIDDEN = /(^|\/)\.|^\/(tools|node_modules)\/|^\/(server\.js|package(-lock)?\.json|database\.rules\.json|firebase\.json|render\.yaml|SETUP-CENTERS\.md|README\.md|Start SpeakUp-1\.command)$/;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp", ".pdf": "application/pdf",
  ".mp3": "audio/mpeg", ".woff2": "font/woff2",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const COMPRESS = new Set([".html", ".js", ".css", ".json", ".svg"]);

/* ---------- Firebase ID tokens ---------- */
let certs = null, certsExp = 0;
async function googleCerts(){
  if (certs && Date.now() < certsExp) return certs;
  const r = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!r.ok) throw new Error("certs " + r.status);
  const age = Number(((r.headers.get("cache-control") || "").match(/max-age=(\d+)/) || [])[1]) || 3600;
  certs = await r.json(); certsExp = Date.now() + age * 1000;
  return certs;
}
const b64json = s => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
async function verifyIdToken(tok){
  const parts = String(tok || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const head = b64json(parts[0]), body = b64json(parts[1]), now = Date.now() / 1000;
  if (!AUTH_EMU){
    if (head.alg !== "RS256") throw new Error("bad alg");
    const pem = (await googleCerts())[head.kid];
    if (!pem) throw new Error("unknown key");
    const ok = crypto.createVerify("RSA-SHA256").update(parts[0] + "." + parts[1]).verify(new crypto.X509Certificate(pem).publicKey, Buffer.from(parts[2], "base64url"));
    if (!ok) throw new Error("bad signature");
  }
  if (body.aud !== PROJECT_ID || body.iss !== "https://securetoken.google.com/" + PROJECT_ID) throw new Error("wrong project");
  if (!(body.exp > now) || !(body.iat <= now + 300) || !body.sub) throw new Error("expired token");
  return body;
}
async function dbGet(p, idToken){
  const r = await fetch(`${DB_URL}/${p}.json${DB_NS}auth=${encodeURIComponent(idToken)}`);
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error("db " + r.status);
  return r.json();
}

/* ---------- signed session cookie ---------- */
const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeCookie(data){ const p = Buffer.from(JSON.stringify(data)).toString("base64url"); return p + "." + sign(p); }
function readCookie(req){
  const m = (req.headers.cookie || "").match(/(?:^|;\s*)sp1s=([^;]+)/);
  if (!m) return null;
  const [p, sig] = m[1].split(".");
  if (!p || !sig) return null;
  const want = sign(p);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try{ const d = JSON.parse(Buffer.from(p, "base64url").toString("utf8")); return d.e > Date.now() ? d : null; }catch(e){ return null; }
}

/* ---------- handlers ---------- */
function send(res, code, body, headers){
  res.writeHead(code, Object.assign({ "content-type": "application/json", "cache-control": "no-store" }, headers || {}));
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req){
  return new Promise((res, rej) => { let n = 0; const chunks = []; req.on("data", c => { n += c.length; if (n > 64e3){ rej(new Error("too big")); req.destroy(); } else chunks.push(c); }); req.on("end", () => res(Buffer.concat(chunks).toString("utf8"))); req.on("error", rej); });
}
async function session(req, res){
  let idToken;
  try{ idToken = JSON.parse(await readBody(req)).idToken; }catch(e){ return send(res, 400, { error: "bad request" }); }
  let claims;
  try{ claims = await verifyIdToken(idToken); }catch(e){ return send(res, 401, { error: "sign-in expired, please sign in again" }); }
  const uid = claims.sub;
  const profile = await dbGet("users/" + uid, idToken);
  if (!profile) return send(res, 403, { error: "no profile" });
  if (profile.status === "restricted") return send(res, 403, { error: "restricted" });
  const role = profile.status === "approved" ? profile.role : "pending";
  let exp = Date.now() + SESSION_HOURS * 3600e3, center = null;
  if (profile.centerId && role !== "owner" && role !== "manager"){
    center = await dbGet("centers/" + profile.centerId, idToken);
    const until = Number(center && center.paidUntil) || 0;
    if (until <= Date.now()) return send(res, 402, { error: "subscription ended", paidUntil: until });
    exp = Math.min(exp, until);
  }
  const secure = (req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
  const cookie = makeCookie({ u: uid, s: STAFF.has(role) ? 1 : 0, e: exp });
  send(res, 200, { ok: true, role, staff: STAFF.has(role), until: exp, center: center ? { name: center.name, paidUntil: center.paidUntil } : null }, {
    "set-cookie": `sp1s=${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((exp - Date.now()) / 1000)}${secure ? "; Secure" : ""}`,
  });
}

const gzCache = new Map();
function serveFile(req, res, rel){
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return send(res, 403, { error: "forbidden" });
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()){ file = path.join(file, "index.html"); try{ st = fs.statSync(file); err = null; }catch(e){ err = e; } }
    if (err) return send(res, 404, { error: "not found" });
    const ext = path.extname(file).toLowerCase();
    const gated = GATED.test(rel);
    const headers = { "content-type": TYPES[ext] || "application/octet-stream", "x-content-type-options": "nosniff",
      "cache-control": ext === ".html" ? "no-cache" : gated ? "private, max-age=3600" : "public, max-age=300",
      "last-modified": st.mtime.toUTCString() };
    if (req.headers["if-modified-since"] && new Date(req.headers["if-modified-since"]) >= new Date(st.mtime.toUTCString())){ res.writeHead(304, headers); return res.end(); }
    if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")){
      const key = file + ":" + st.mtimeMs;
      let gz = gzCache.get(key);
      if (!gz){ gz = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); gzCache.set(key, gz); }
      res.writeHead(200, Object.assign(headers, { "content-encoding": "gzip", "content-length": gz.length, vary: "accept-encoding" }));
      return res.end(req.method === "HEAD" ? undefined : gz);
    }
    res.writeHead(200, Object.assign(headers, { "content-length": st.size }));
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try{
    const url = new URL(req.url, "http://x");
    let rel;
    try{ rel = decodeURIComponent(url.pathname); }catch(e){ return send(res, 400, { error: "bad path" }); }
    if (rel.includes("\0") || rel.includes("..")) return send(res, 400, { error: "bad path" });
    if (rel === "/healthz") return send(res, 200, { ok: true });
    if (rel === "/api/session") return req.method === "POST" ? await session(req, res) : send(res, 405, { error: "POST only" });
    if (rel === "/api/logout"){ return send(res, 200, { ok: true }, { "set-cookie": "sp1s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" }); }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" });
    if (HIDDEN.test(rel)) return send(res, 404, { error: "not found" });
    if (GATED.test(rel)){
      const s = readCookie(req);
      if (!s) return send(res, 401, { error: "sign in first" });
      if (STAFF_ONLY.test(rel) && !s.s) return send(res, 403, { error: "teachers only" });
    }
    serveFile(req, res, rel === "/" ? "/index.html" : rel);
  }catch(e){
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: "server error" });
  }
});
server.listen(PORT, () => console.log(`SpeakUp-1 on :${PORT} (project ${PROJECT_ID}${AUTH_EMU ? ", emulators" : ""})`));
