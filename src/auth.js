// Microsoft-account sign-in — OpenID Connect authorization-code flow with PKCE,
// zero dependencies: node:crypto for PKCE/HMAC/RS256 and global fetch for the
// token + JWKS endpoints. Sessions are stateless HMAC-signed cookies, so they
// survive restarts and need no table. Enabled when MS_CLIENT_ID and
// MS_CLIENT_SECRET are set; otherwise the app keeps its PIN-or-open behavior.
import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { db } from "./db.js";
import { HttpError } from "./http.js";
import {
  DEFAULT_USER_ID,
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_TENANT,
  ALLOWED_EMAILS,
  BASE_URL,
  SESSION_DAYS,
} from "./config.js";

export const enabled = Boolean(MS_CLIENT_ID && MS_CLIENT_SECRET);

// Every personal Microsoft account (including Gmail-backed ones) lives in this
// fixed tenant; tokens from the /consumers endpoint must carry it.
const MSA_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";
// MS_AUTHORITY override exists only so tests can point at a local stub.
const AUTHORITY = process.env.MS_AUTHORITY || `https://login.microsoftonline.com/${MS_TENANT}`;
const SESSION_COOKIE = "thor_sess";
const FLOW_COOKIE = "thor_flow";
const FLOW_TTL_S = 10 * 60;

// Cookie-signing key: explicit SESSION_SECRET wins; otherwise derive a stable
// key from the client secret so restarts don't log everyone out; a random
// per-boot key is the last resort (auth disabled anyway in that case).
const secret =
  process.env.SESSION_SECRET ||
  (MS_CLIENT_SECRET ? createHash("sha256").update(`thor-session|${MS_CLIENT_SECRET}`).digest("hex") : randomBytes(32).toString("hex"));

const now = () => Math.floor(Date.now() / 1000);
const randTok = (bytes = 24) => randomBytes(bytes).toString("base64url");

const sign = (b64) => createHmac("sha256", secret).update(b64).digest("base64url");
const seal = (obj) => {
  const b = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b}.${sign(b)}`;
};
const unseal = (value) => {
  const [b, sig] = String(value || "").split(".");
  if (!b || !sig) return null;
  const expect = sign(b);
  if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  try {
    return JSON.parse(Buffer.from(b, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
};

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const isSecure = (req) =>
  (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" || Boolean(req.socket?.encrypted);

function addCookie(res, name, value, { maxAge, secure }) {
  const cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, cookie) : cookie);
}

const clearCookie = (res, name, req) => addCookie(res, name, "", { maxAge: 0, secure: isSecure(req) });

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

// Where Microsoft sends the user back. THOR_BASE_URL is authoritative when set
// (always set it on Azure); the Host header is only trusted for local dev.
const baseUrl = (req) => BASE_URL || `${isSecure(req) ? "https" : "http"}://${req.headers.host || "localhost"}`;
const redirectUri = (req) => `${baseUrl(req)}/auth/callback`;

// Only allow same-site relative paths as post-login destinations.
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

/** Verified session payload ({uid, email, name, iat, exp}) or null. */
export function getSession(req) {
  if (!enabled) return null;
  const data = unseal(parseCookies(req)[SESSION_COOKIE]);
  return data && typeof data.exp === "number" && data.exp > now() ? data : null;
}

// --- JWKS (Microsoft's token-signing keys), cached in-process ---
let jwks = { keys: new Map(), fetchedAt: 0 };

async function jwksKey(kid) {
  if (!jwks.keys.has(kid) && Date.now() - jwks.fetchedAt > 60_000) {
    const resp = await fetch(`${AUTHORITY}/discovery/v2.0/keys`);
    if (resp.ok) {
      const data = await resp.json();
      const keys = new Map();
      for (const k of data.keys || []) {
        try {
          keys.set(k.kid, createPublicKey({ key: k, format: "jwk" }));
        } catch {
          /* skip non-RSA/malformed entries */
        }
      }
      jwks = { keys, fetchedAt: Date.now() };
    }
  }
  return jwks.keys.get(kid) || null;
}

const b64uJson = (part) => {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
};

/** Full OIDC id_token validation: signature (JWKS), aud, iss/tid, exp/nbf, nonce. */
export async function verifyIdToken(idToken, expectedNonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new HttpError(401, "Malformed id_token");
  const [h64, p64, s64] = parts;
  const header = b64uJson(h64);
  const payload = b64uJson(p64);
  if (!header || !payload) throw new HttpError(401, "Malformed id_token");
  if (header.alg !== "RS256") throw new HttpError(401, `Unexpected token algorithm ${header.alg}`);
  const key = await jwksKey(header.kid);
  if (!key) throw new HttpError(401, "Unknown token signing key");
  if (!verifySignature("RSA-SHA256", Buffer.from(`${h64}.${p64}`), key, Buffer.from(s64, "base64url"))) {
    throw new HttpError(401, "Invalid token signature");
  }
  const t = now();
  if (typeof payload.exp !== "number" || payload.exp < t - 60) throw new HttpError(401, "Token expired");
  if (typeof payload.nbf === "number" && payload.nbf > t + 300) throw new HttpError(401, "Token not yet valid");
  if (payload.aud !== MS_CLIENT_ID) throw new HttpError(401, "Token audience mismatch");
  if (expectedNonce && payload.nonce !== expectedNonce) throw new HttpError(401, "Nonce mismatch");
  if (payload.iss !== `https://login.microsoftonline.com/${payload.tid}/v2.0`) {
    throw new HttpError(401, "Token issuer mismatch");
  }
  if (MS_TENANT === "consumers" && payload.tid !== MSA_TENANT_ID) {
    throw new HttpError(401, "Not a personal Microsoft account");
  }
  return payload;
}

// Attach the Microsoft identity to a DB user: previously-linked account first,
// then email match, then the seeded default user — so the very first sign-in
// claims the existing "Main User" row (and stamps its email) instead of
// creating a parallel user.
function mapUser(claims, email) {
  const oid = claims.oid || claims.sub;
  const user =
    db.prepare("SELECT * FROM users WHERE ms_oid = ?").get(oid) ||
    (email ? db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) : null) ||
    db.prepare("SELECT * FROM users WHERE id = ?").get(DEFAULT_USER_ID) ||
    db.prepare("SELECT * FROM users ORDER BY created_at LIMIT 1").get();
  if (!user) throw new HttpError(500, "No user row to attach this sign-in to");
  db.prepare("UPDATE users SET ms_oid = ?, email = COALESCE(email, ?), last_login_at = datetime('now') WHERE id = ?").run(
    oid,
    email || null,
    user.id
  );
  return user;
}

export function registerAuthRoutes(app) {
  app.get("/auth/login", ({ req, res, query }) => {
    if (!enabled) return redirect(res, "/");
    const state = randTok();
    const nonce = randTok();
    const verifier = randTok(32);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    addCookie(res, FLOW_COOKIE, seal({ state, nonce, verifier, next: safeNext(query.next), exp: now() + FLOW_TTL_S }), {
      maxAge: FLOW_TTL_S,
      secure: isSecure(req),
    });
    const u = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`);
    u.searchParams.set("client_id", MS_CLIENT_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", redirectUri(req));
    u.searchParams.set("response_mode", "query");
    u.searchParams.set("scope", "openid profile email");
    u.searchParams.set("state", state);
    u.searchParams.set("nonce", nonce);
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("prompt", "select_account");
    redirect(res, u.href);
  });

  app.get("/auth/callback", async ({ req, res, query }) => {
    if (!enabled) return redirect(res, "/");
    const flow = unseal(parseCookies(req)[FLOW_COOKIE]);
    clearCookie(res, FLOW_COOKIE, req);
    try {
      if (query.error) throw new HttpError(401, query.error_description || query.error);
      if (!flow || flow.exp < now()) throw new HttpError(401, "Sign-in attempt expired — try again");
      if (!query.state || query.state !== flow.state) throw new HttpError(401, "State mismatch");
      if (!query.code) throw new HttpError(401, "Missing authorization code");

      const resp = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          grant_type: "authorization_code",
          code: query.code,
          redirect_uri: redirectUri(req),
          code_verifier: flow.verifier,
        }),
      });
      const tokens = await resp.json().catch(() => ({}));
      if (!resp.ok || !tokens.id_token) {
        throw new HttpError(401, (tokens.error_description || "Token exchange failed").split(/\r?\n/)[0]);
      }

      const claims = await verifyIdToken(tokens.id_token, flow.nonce);
      const email = String(claims.email || claims.preferred_username || "").toLowerCase();
      if (!ALLOWED_EMAILS.length) throw new HttpError(403, "Server has no THOR_ALLOWED_EMAILS configured");
      if (!ALLOWED_EMAILS.includes(email)) throw new HttpError(403, `${email || "This account"} is not allowed`);

      const user = mapUser(claims, email);
      const exp = now() + SESSION_DAYS * 86400;
      addCookie(res, SESSION_COOKIE, seal({ uid: user.id, email, name: claims.name || user.name, iat: now(), exp }), {
        maxAge: SESSION_DAYS * 86400,
        secure: isSecure(req),
      });
      redirect(res, safeNext(flow?.next));
    } catch (err) {
      if (!(err instanceof HttpError)) console.error("[auth] callback failed:", err);
      const msg = err instanceof HttpError ? err.message : "Sign-in failed";
      redirect(res, `/login.html?error=${encodeURIComponent(msg.slice(0, 180))}`);
    }
  });

  const logout = ({ req, res }) => {
    clearCookie(res, SESSION_COOKIE, req);
    redirect(res, "/login.html?signedout");
  };
  app.get("/auth/logout", logout);
  app.post("/auth/logout", logout);

  // Public (see OPEN_API in http.js): the nav uses it to decide whether to show
  // "Sign out", so it must not itself trigger an auth challenge.
  app.get("/api/auth/me", ({ req }) => {
    const sess = getSession(req);
    const user = sess ? db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(sess.uid) : null;
    return {
      auth: enabled ? "microsoft" : process.env.THOR_PIN ? "pin" : "none",
      signed_in: Boolean(sess),
      user: user || null,
      expires: sess ? new Date(sess.exp * 1000).toISOString() : null,
    };
  });
}
