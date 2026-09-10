/**
 * PROXIM backend
 * ──────────────────────────────────────────────────────────────────────────
 *  • Sign In with LinkedIn using OpenID Connect (authorization code flow)
 *  • Session cookie + /auth/me so the SPA can restore a session on reload
 *  • Anthropic proxy endpoints so the API key never reaches the browser
 *
 *  Run:  npm run server     (or `npm start` to run server + Vite together)
 *
 *  NOTE ON THE LINKEDIN ENDPOINTS: the authorize/token/userinfo URLs and the
 *  `openid profile email` scopes below follow LinkedIn's "Sign In with LinkedIn
 *  using OpenID Connect" product. LinkedIn changes these periodically — verify
 *  against https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 *  before going to production.
 */
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const PORT        = Number(process.env.PORT || 3001);
const APP_ORIGIN  = process.env.APP_ORIGIN  || "http://localhost:5173";
const SERVER_URL  = process.env.SERVER_URL  || `http://localhost:${PORT}`;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || `${SERVER_URL}/auth/linkedin/callback`;
const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
// Set COOKIE_CROSS_SITE=1 when the frontend is on a different site than this
// server (a real deployment). On localhost the default Lax cookie is correct,
// because cookies ignore port numbers and localhost:5173 / :3001 are same-site.
const CROSS_SITE  = process.env.COOKIE_CROSS_SITE === "1";

const LINKEDIN_AUTH_URL     = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL    = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const SCOPES = "openid profile email";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(cors({ origin: APP_ORIGIN, credentials: true }));

// ─── In-memory stores ────────────────────────────────────────────────────────
// Fine for a prototype; swap for Redis or a database before deploying.
const sessions   = new Map(); // sid   -> { user, createdAt }
const oauthState = new Map(); // state -> createdAt
const TEN_MINUTES = 10 * 60 * 1000;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [s, t] of oauthState) if (now - t > TEN_MINUTES) oauthState.delete(s);
  for (const [s, v] of sessions)   if (now - v.createdAt > SESSION_TTL) sessions.delete(s);
}, 60_000).unref();

const cookieOptions = {
  httpOnly: true,
  sameSite: CROSS_SITE ? "none" : "lax",
  secure: CROSS_SITE,
  maxAge: SESSION_TTL,
  path: "/",
};

const linkedInConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

// ─── Health ──────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "proxim",
    linkedInConfigured,
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
});

// ─── OAuth: start ────────────────────────────────────────────────────────────
app.get("/auth/linkedin", (_req, res) => {
  if (!linkedInConfigured) {
    return res.status(503).json({
      error: "LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env",
    });
  }
  const state = crypto.randomBytes(16).toString("hex");
  oauthState.set(state, Date.now());
  // Built with encodeURIComponent rather than URLSearchParams so the scope
  // separator is %20 — LinkedIn documents %20, and URLSearchParams emits "+".
  const authUrl = `${LINKEDIN_AUTH_URL}?` + [
    ["response_type", "code"],
    ["client_id", CLIENT_ID],
    ["redirect_uri", REDIRECT_URI],
    ["state", state],
    ["scope", SCOPES],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  res.json({ authUrl });
});

// ─── OAuth: callback ─────────────────────────────────────────────────────────
// Rendered inside the popup. Posts the result to the opener, then closes.
const popupPage = (payload) => `<!doctype html>
<html><head><meta charset="utf-8"><title>PROXIM · LinkedIn</title>
<style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
       background:#07080f;color:#eef0ff;font-family:system-ui,sans-serif;text-align:center}
  .msg{font-size:15px;line-height:1.6}
  .sub{color:#8890b8;font-size:13px;margin-top:6px}
</style></head>
<body>
  <div class="msg">${payload.type === "PROXIM_LINKEDIN_SUCCESS" ? "✅ Connected" : "⚠️ Sign-in failed"}
    <div class="sub">${payload.type === "PROXIM_LINKEDIN_SUCCESS" ? "Returning to PROXIM…" : String(payload.message || "You can close this window.")}</div>
  </div>
  <script>
    (function () {
      var payload = ${JSON.stringify(payload)};
      try { window.opener && window.opener.postMessage(payload, ${JSON.stringify(APP_ORIGIN)}); } catch (e) {}
      setTimeout(function () { window.close(); }, 900);
    })();
  </script>
</body></html>`;

app.get("/auth/linkedin/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  res.type("html");

  if (error) return res.send(popupPage({ type:"PROXIM_LINKEDIN_ERROR", message: errorDescription || error }));
  if (!code || !state || !oauthState.has(state))
    return res.send(popupPage({ type:"PROXIM_LINKEDIN_ERROR", message:"Invalid or expired login attempt." }));
  oauthState.delete(state);

  try {
    const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      console.error("LinkedIn token exchange failed:", token);
      return res.send(popupPage({ type:"PROXIM_LINKEDIN_ERROR", message:"Token exchange failed." }));
    }

    const infoRes = await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const info = await infoRes.json();
    if (!infoRes.ok) {
      console.error("LinkedIn userinfo failed:", info);
      return res.send(popupPage({ type:"PROXIM_LINKEDIN_ERROR", message:"Could not read your LinkedIn profile." }));
    }

    // OpenID Connect userinfo: sub, name, given_name, family_name, picture,
    // email, email_verified, locale. Work history, skills and endorsements are
    // NOT part of this scope — they need additional LinkedIn API products.
    const user = {
      id: info.sub,
      name: info.name || [info.given_name, info.family_name].filter(Boolean).join(" "),
      firstName: info.given_name || "",
      lastName: info.family_name || "",
      email: info.email || "",
      emailVerified: Boolean(info.email_verified),
      photo: info.picture || null,
      locale: typeof info.locale === "string" ? info.locale : info.locale?.language || "",
      headline: "",           // not available via OpenID Connect
      skills: [],             // not available via OpenID Connect
      linkedInConnected: true,
      importedAt: new Date().toISOString(),
    };

    const sid = crypto.randomBytes(24).toString("hex");
    sessions.set(sid, { user, createdAt: Date.now() });
    res.cookie("proxim_sid", sid, cookieOptions);
    return res.send(popupPage({ type: "PROXIM_LINKEDIN_SUCCESS" }));
  } catch (e) {
    console.error("LinkedIn callback error:", e);
    return res.send(popupPage({ type:"PROXIM_LINKEDIN_ERROR", message:"Unexpected error during sign-in." }));
  }
});

// ─── Session ─────────────────────────────────────────────────────────────────
const currentUser = req => sessions.get(req.cookies?.proxim_sid)?.user || null;

app.get("/auth/me", (req, res) => {
  const user = currentUser(req);
  res.json(user ? { authenticated: true, user } : { authenticated: false });
});

app.post("/auth/logout", (req, res) => {
  const sid = req.cookies?.proxim_sid;
  if (sid) sessions.delete(sid);
  res.clearCookie("proxim_sid", { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

// ─── Anthropic proxy ─────────────────────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

const textOf = message => message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();

function requireAI(res) {
  if (!anthropic) {
    res.status(503).json({ error: "AI is not configured. Set ANTHROPIC_API_KEY in .env and restart the server." });
    return false;
  }
  return true;
}

// Suggest events matching the user's filters.
app.post("/api/ai/events", async (req, res) => {
  if (!requireAI(res)) return;
  const sector = String(req.body?.sector ?? "All Sectors").slice(0, 80);
  const region = String(req.body?.region ?? "All Regions").slice(0, 80);
  const query  = String(req.body?.query  ?? "").slice(0, 200);

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system:
        "You suggest real, well-known business and technology conferences for a networking app. " +
        "Reply with a JSON array only — no prose, no markdown fences. Each element must have exactly these keys: " +
        'name, date ("Month DD–DD, YYYY"), city, country, venue, sector, tags (3 strings), organizer, ' +
        "attendees (number), rsvps (number), image (a single emoji), description (two sentences), featured (boolean). " +
        "Prefer conferences that genuinely exist and recur annually. If you are unsure a listing is real, say so inside its description.",
      messages: [{
        role: "user",
        content: `Suggest 2 upcoming events for 2026.\nSector filter: ${sector}\nRegion filter: ${region}\nSearch text: ${query || "(none)"}`,
      }],
    });

    if (message.stop_reason === "refusal") {
      return res.status(422).json({ error: "The model declined this request." });
    }

    const raw = textOf(message).replace(/^```(?:json)?|```$/g, "").trim();
    let events;
    try { events = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "The model did not return valid JSON." }); }
    if (!Array.isArray(events)) return res.status(502).json({ error: "The model did not return a list of events." });

    // Normalise so a malformed field can never crash the UI.
    const clean = events.slice(0, 5).map(ev => ({
      name: String(ev.name ?? "Untitled event"),
      date: String(ev.date ?? "Date TBC"),
      city: String(ev.city ?? ""),
      country: String(ev.country ?? ""),
      venue: String(ev.venue ?? "Venue TBC"),
      sector: String(ev.sector ?? sector),
      tags: Array.isArray(ev.tags) ? ev.tags.slice(0, 4).map(String) : [],
      organizer: String(ev.organizer ?? "Unknown"),
      attendees: Number(ev.attendees) || 0,
      rsvps: Number(ev.rsvps) || 0,
      image: String(ev.image ?? "📌"),
      description: String(ev.description ?? ""),
      featured: Boolean(ev.featured),
    }));
    res.json({ events: clean });
  } catch (e) {
    console.error("AI events error:", e);
    res.status(502).json({ error: e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}` : "AI request failed." });
  }
});

// Suggest who to meet, given the people currently on the radar.
app.post("/api/ai/suggest", async (req, res) => {
  if (!requireAI(res)) return;
  const people = Array.isArray(req.body?.people) ? req.body.people.slice(0, 40) : [];
  const event  = req.body?.event || null;
  if (people.length === 0) return res.json({ suggestion: "Nobody is on your radar right now — widen your filters." });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system:
        "You are PROXIM, a business networking assistant. Given the people nearby at an event, name the two most " +
        "strategic people to meet and why. Be punchy and specific. Use only the people given to you — never invent " +
        'anyone. Answer in this exact shape: "🎯 Meet [Name] ([distance]) — [one sentence]. Also consider [Name] — [one sentence]."',
      messages: [{
        role: "user",
        content: `Event: ${event ? `${event.name} (${event.venue ?? "venue unknown"})` : "an unnamed event"}\n` +
                 `People nearby:\n${JSON.stringify(people, null, 1)}`,
      }],
    });

    if (message.stop_reason === "refusal") {
      return res.status(422).json({ error: "The model declined this request." });
    }
    res.json({ suggestion: textOf(message) });
  } catch (e) {
    console.error("AI suggest error:", e);
    res.status(502).json({ error: e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}` : "AI request failed." });
  }
});

app.listen(PORT, () => {
  console.log(`\n  PROXIM server  →  ${SERVER_URL}`);
  console.log(`  frontend origin →  ${APP_ORIGIN}`);
  console.log(`  LinkedIn OAuth  →  ${linkedInConfigured ? "configured" : "NOT configured (set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)"}`);
  console.log(`  Anthropic AI    →  ${anthropic ? `configured (${MODEL})` : "NOT configured (set ANTHROPIC_API_KEY)"}\n`);
});
