import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET;
if (!SECRET && process.env.NODE_ENV !== "test") {
  console.warn(
    "[proxim] SESSION_SECRET is not set — sign-in will fail. " +
    "Set it to a long random string (e.g. `openssl rand -hex 32`)."
  );
}

const COOKIE_NAME = "proxim_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Sign a session JWT for a profile id. The cookie carries only the id —
 *  every request re-reads the profile row from Supabase, so edits (or a
 *  ban) take effect immediately rather than waiting for the cookie to expire. */
export function signSession(profileId) {
  return jwt.sign({ sub: profileId }, SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return payload.sub || null;
  } catch {
    return null;
  }
}

export function isProd() {
  // Vercel sets VERCEL_ENV to "production" | "preview" | "development".
  return process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
    : process.env.NODE_ENV === "production";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax", // single-origin deployment — Lax is correct and simplest
    secure: isProd(),
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/** Express middleware: attaches req.profileId (string | null). Does not
 *  fetch the profile row — routes that need it query Supabase themselves,
 *  so a 401 vs "profile deleted" can be told apart where it matters. */
export function attachSession(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  req.profileId = token ? verifySession(token) : null;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.profileId) return res.status(401).json({ error: "Not signed in." });
  next();
}
