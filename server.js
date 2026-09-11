/**
 * PROXIM backend — Express app, deployed as a Vercel serverless function
 * (see api/[...all].js) and runnable standalone for local dev (`npm run server`).
 *
 * Design notes:
 *  • Stateless auth: session is a signed JWT in an httpOnly cookie (lib/auth.js).
 *    No in-memory session store — required on serverless, where each request
 *    can land on a different, cold instance.
 *  • Stateless OAuth state: CSRF protection uses the double-submit cookie
 *    pattern (state value in both the redirect URL and a short-lived cookie),
 *    not a server-side nonce store.
 *  • All persistent data lives in Supabase Postgres, accessed with the
 *    service-role key — RLS denies the anon/authenticated roles entirely, so
 *    this file is the only thing that can read or write these tables.
 *  • Other attendees' raw GPS coordinates never leave this file. Every
 *    location-bearing endpoint returns distance_m/bearing_deg computed
 *    server-side, never lat/lng.
 */
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

import { supabase } from "./lib/supabase.js";
import { distanceMeters, bearingDegrees } from "./lib/geo.js";
import {
  signSession, attachSession, requireAuth,
  sessionCookieOptions, isProd, SESSION_COOKIE_NAME,
} from "./lib/auth.js";

const LINKEDIN_AUTH_URL     = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL    = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const SCOPES = "openid profile email";

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const linkedInConfigured = Boolean(CLIENT_ID && CLIENT_SECRET);

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

const LOCATION_STALE_MS = 3 * 60 * 1000;   // a GPS fix older than this isn't shown on the radar
const PRESENCE_STALE_MS = 3 * 60 * 60 * 1000; // "still checked in" window for a conference day

const app = express();
app.set("trust proxy", true); // Vercel terminates TLS upstream; needed for correct req.protocol
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// ─── Health ──────────────────────────────────────────────────────────────────
// Registered before the dbRequired gate below — health must report a missing
// database, not 503 because of one.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "proxim",
    dbConfigured: Boolean(supabase),
    linkedInConfigured,
    aiConfigured: Boolean(anthropic),
  });
});

const dbRequired = (_req, res, next) => {
  if (!supabase) return res.status(503).json({ error: "Database is not configured on the server." });
  next();
};
app.use(dbRequired);
app.use(attachSession);

// ─── OAuth: start ────────────────────────────────────────────────────────────
app.get("/api/auth/linkedin", (req, res) => {
  if (!linkedInConfigured) {
    return res.status(503).json({
      error: "LinkedIn is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.",
    });
  }
  const state = crypto.randomBytes(16).toString("hex");
  // Double-submit cookie: no server-side state store needed. The callback
  // must present the same value it was issued, which only this browser has.
  res.cookie("li_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: isProd(), maxAge: 10 * 60 * 1000, path: "/api/auth/linkedin",
  });
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/linkedin/callback`;
  const authUrl = `${LINKEDIN_AUTH_URL}?` + [
    ["response_type", "code"],
    ["client_id", CLIENT_ID],
    ["redirect_uri", redirectUri],
    ["state", state],
    ["scope", SCOPES],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  res.json({ authUrl });
});

// ─── OAuth: callback ─────────────────────────────────────────────────────────
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
      try { window.opener && window.opener.postMessage(payload, window.location.origin); } catch (e) {}
      setTimeout(function () { window.close(); }, 900);
    })();
  </script>
</body></html>`;

app.get("/api/auth/linkedin/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  res.type("html");
  res.clearCookie("li_oauth_state", { path: "/api/auth/linkedin" });

  if (error) return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: errorDescription || String(error) }));
  const cookieState = req.cookies?.li_oauth_state;
  if (!code || !state || !cookieState || state !== cookieState)
    return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: "Invalid or expired login attempt. Please try again." }));

  try {
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${req.protocol}://${req.get("host")}/api/auth/linkedin/callback`;
    const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) {
      console.error("LinkedIn token exchange failed:", token);
      return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: "Token exchange failed." }));
    }

    const infoRes = await fetch(LINKEDIN_USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const info = await infoRes.json();
    if (!infoRes.ok) {
      console.error("LinkedIn userinfo failed:", info);
      return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: "Could not read your LinkedIn profile." }));
    }

    // OpenID Connect userinfo only: sub, name, given_name, family_name,
    // picture, email, email_verified, locale. Role/company/skills are NOT
    // in this scope — those come from onboarding (see PATCH /api/me).
    const row = {
      linkedin_sub: info.sub,
      name: info.name || [info.given_name, info.family_name].filter(Boolean).join(" "),
      first_name: info.given_name || "",
      last_name: info.family_name || "",
      email: info.email || "",
      email_verified: Boolean(info.email_verified),
      photo_url: info.picture || null,
      locale: typeof info.locale === "string" ? info.locale : info.locale?.language || "",
      updated_at: new Date().toISOString(),
    };

    const { data: profile, error: upsertError } = await supabase
      .from("profiles")
      .upsert(row, { onConflict: "linkedin_sub" })
      .select()
      .single();
    if (upsertError) {
      console.error("Profile upsert failed:", upsertError);
      return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: "Could not save your profile." }));
    }

    res.cookie(SESSION_COOKIE_NAME, signSession(profile.id), sessionCookieOptions());
    return res.send(popupPage({ type: "PROXIM_LINKEDIN_SUCCESS" }));
  } catch (e) {
    console.error("LinkedIn callback error:", e);
    return res.send(popupPage({ type: "PROXIM_LINKEDIN_ERROR", message: "Unexpected error during sign-in." }));
  }
});

// ─── Session / profile ───────────────────────────────────────────────────────
app.get("/api/auth/me", async (req, res) => {
  if (!req.profileId) return res.json({ authenticated: false });
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", req.profileId).single();
  if (error || !profile) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: toClientProfile(profile) });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

const ONBOARD_FIELDS = ["role", "company", "sector", "seeking", "bio"];
app.patch("/api/me", requireAuth, async (req, res) => {
  const patch = {};
  for (const f of ONBOARD_FIELDS) {
    if (typeof req.body?.[f] === "string") patch[f] = req.body[f].slice(0, f === "bio" ? 280 : 120);
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: "Nothing to update." });
  patch.onboarded = true;
  patch.updated_at = new Date().toISOString();

  const { data: profile, error } = await supabase.from("profiles").update(patch).eq("id", req.profileId).select().single();
  if (error) { console.error("Profile update failed:", error); return res.status(500).json({ error: "Could not save profile." }); }
  res.json({ user: toClientProfile(profile) });
});

function toClientProfile(p) {
  return {
    id: p.id, name: p.name, firstName: p.first_name, lastName: p.last_name,
    email: p.email, photo: p.photo_url, locale: p.locale,
    role: p.role, company: p.company, sector: p.sector, seeking: p.seeking, bio: p.bio,
    onboarded: p.onboarded, linkedInConnected: true,
  };
}

// ─── Events ──────────────────────────────────────────────────────────────────
app.get("/api/events", async (_req, res) => {
  const { data, error } = await supabase.from("events").select("*").order("starts_on", { ascending: true, nullsFirst: false });
  if (error) { console.error("List events failed:", error); return res.status(500).json({ error: "Could not load events." }); }
  res.json({ events: data.map(toClientEvent) });
});

function toClientEvent(ev) {
  return {
    id: ev.id, name: ev.name, date: ev.date_label, city: ev.city, country: ev.country,
    venue: ev.venue, lat: ev.lat, lng: ev.lng, sector: ev.sector, tags: ev.tags,
    organizer: ev.organizer, attendees: ev.attendees_estimate, image: ev.image,
    description: ev.description, featured: ev.featured, aiSourced: ev.source === "ai",
  };
}

app.get("/api/me/rsvps", requireAuth, async (req, res) => {
  const { data, error } = await supabase.from("event_rsvps").select("event_id").eq("profile_id", req.profileId);
  if (error) return res.status(500).json({ error: "Could not load RSVPs." });
  res.json({ eventIds: data.map(r => r.event_id) });
});

app.post("/api/events/:id/rsvp", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: "Invalid event id." });

  const { data: existing } = await supabase.from("event_rsvps").select("*").eq("profile_id", req.profileId).eq("event_id", eventId).maybeSingle();
  if (existing) {
    await supabase.from("event_rsvps").delete().eq("profile_id", req.profileId).eq("event_id", eventId);
    return res.json({ rsvped: false });
  }
  const { error } = await supabase.from("event_rsvps").insert({ profile_id: req.profileId, event_id: eventId });
  if (error) { console.error("RSVP insert failed:", error); return res.status(500).json({ error: "Could not RSVP." }); }
  res.json({ rsvped: true });
});

// ─── Check-in / presence ──────────────────────────────────────────────────────
// Restores "you're checked in to X" on reload or a new device — the client
// never trusts local state alone for this.
app.get("/api/me/checkin", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("event_checkins")
    .select("event_id, checked_in_at, share_location, events(*)")
    .eq("profile_id", req.profileId)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Could not load check-in status." });
  if (!data || !data.events) return res.json({ checkedIn: null });
  res.json({
    checkedIn: { event: toClientEvent(data.events), checkedInAt: data.checked_in_at, shareLocation: data.share_location },
  });
});

app.post("/api/events/:id/checkin", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: "Invalid event id." });
  const shareLocation = Boolean(req.body?.shareLocation);
  const now = new Date().toISOString();

  const { error } = await supabase.from("event_checkins").upsert(
    { profile_id: req.profileId, event_id: eventId, last_seen_at: now, share_location: shareLocation },
    { onConflict: "profile_id,event_id" },
  );
  if (error) { console.error("Check-in failed:", error); return res.status(500).json({ error: "Could not check in." }); }
  res.json({ ok: true });
});

app.post("/api/events/:id/checkout", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  await supabase.from("live_locations").delete().eq("profile_id", req.profileId);
  await supabase.from("event_checkins").delete().eq("profile_id", req.profileId).eq("event_id", eventId);
  res.json({ ok: true });
});

app.post("/api/events/:id/heartbeat", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  const { data, error } = await supabase.from("event_checkins")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("profile_id", req.profileId).eq("event_id", eventId).select().maybeSingle();
  if (error) return res.status(500).json({ error: "Heartbeat failed." });
  if (!data) return res.status(409).json({ error: "Not checked in to this event." });
  res.json({ ok: true });
});

// Who's in the room right now — no coordinates, just who's checked in.
app.get("/api/events/:id/presence", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();

  const { data: mine } = await supabase.from("event_checkins").select("*").eq("profile_id", req.profileId).eq("event_id", eventId).maybeSingle();
  if (!mine) return res.status(403).json({ error: "Check in to this event to see who else is here." });

  const { data: checkins, error } = await supabase
    .from("event_checkins")
    .select("profile_id, checked_in_at, share_location, profiles(id, name, photo_url, role, company, sector, seeking)")
    .eq("event_id", eventId)
    .gte("last_seen_at", cutoff)
    .neq("profile_id", req.profileId);
  if (error) { console.error("Presence query failed:", error); return res.status(500).json({ error: "Could not load attendees." }); }

  res.json({
    people: checkins.filter(c => c.profiles).map(c => ({
      id: c.profiles.id, name: c.profiles.name, photo: c.profiles.photo_url,
      role: c.profiles.role, company: c.profiles.company, sector: c.profiles.sector, seeking: c.profiles.seeking,
      checkedInAt: c.checked_in_at, sharingLocation: c.share_location,
    })),
  });
});

// Location ping + radar in one call: upsert the caller's fix, then return
// everyone else's fix at this event as distance/bearing only.
app.post("/api/events/:id/location", requireAuth, async (req, res) => {
  const eventId = Number(req.params.id);
  const { lat, lng, accuracyM, headingDeg } = req.body || {};
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng are required numbers." });
  }

  const { data: mine } = await supabase.from("event_checkins").select("*").eq("profile_id", req.profileId).eq("event_id", eventId).maybeSingle();
  if (!mine) return res.status(403).json({ error: "Check in to this event before sharing your location." });
  if (!mine.share_location) return res.status(403).json({ error: "Location sharing is off. Enable it from the Radar screen." });

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("live_locations").upsert(
      { profile_id: req.profileId, event_id: eventId, lat, lng, accuracy_m: accuracyM ?? null, heading_deg: headingDeg ?? null, updated_at: now },
      { onConflict: "profile_id" },
    ),
    supabase.from("event_checkins").update({ last_seen_at: now }).eq("profile_id", req.profileId).eq("event_id", eventId),
  ]);

  const staleCutoff = new Date(Date.now() - LOCATION_STALE_MS).toISOString();
  const { data: others, error } = await supabase
    .from("live_locations")
    .select("profile_id, lat, lng, accuracy_m, updated_at, profiles(id, name, photo_url, role, company, sector, seeking)")
    .eq("event_id", eventId)
    .neq("profile_id", req.profileId)
    .gte("updated_at", staleCutoff);
  if (error) { console.error("Radar query failed:", error); return res.status(500).json({ error: "Could not load the radar." }); }

  const radar = others.filter(o => o.profiles).map(o => ({
    id: o.profiles.id, name: o.profiles.name, photo: o.profiles.photo_url,
    role: o.profiles.role, company: o.profiles.company, sector: o.profiles.sector, seeking: o.profiles.seeking,
    distanceM: Math.round(distanceMeters(lat, lng, o.lat, o.lng)),
    bearingDeg: bearingDegrees(lat, lng, o.lat, o.lng),
    accuracyM: o.accuracy_m, updatedAt: o.updated_at,
  })).sort((a, b) => a.distanceM - b.distanceM);

  res.json({ radar });
});

// ─── AI: event suggestions (persisted) ───────────────────────────────────────
const textOf = message => message.content.filter(b => b.type === "text").map(b => b.text).join("").trim();

function requireAI(res) {
  if (!anthropic) { res.status(503).json({ error: "AI is not configured. Set ANTHROPIC_API_KEY." }); return false; }
  return true;
}

app.post("/api/events/ai", requireAuth, async (req, res) => {
  if (!requireAI(res)) return;
  const sector = String(req.body?.sector ?? "All Sectors").slice(0, 80);
  const region = String(req.body?.region ?? "All Regions").slice(0, 80);
  const query  = String(req.body?.query  ?? "").slice(0, 200);

  try {
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system:
        "You suggest real, well-known business and technology conferences for a networking app. " +
        "Reply with a JSON array only — no prose, no markdown fences. Each element must have exactly these keys: " +
        'name, date ("Month DD–DD, YYYY"), city, country, venue, lat (number), lng (number), sector, tags (3 strings), ' +
        "organizer, attendees (number), image (a single emoji), description (two sentences), featured (boolean). " +
        "lat/lng must be the venue's real approximate coordinates. Prefer conferences that genuinely exist and recur " +
        "annually. If you are unsure a listing is real, say so inside its description.",
      messages: [{ role: "user", content: `Suggest 2 upcoming events for 2026.\nSector filter: ${sector}\nRegion filter: ${region}\nSearch text: ${query || "(none)"}` }],
    });
    if (message.stop_reason === "refusal") return res.status(422).json({ error: "The model declined this request." });

    const raw = textOf(message).replace(/^```(?:json)?|```$/g, "").trim();
    let events;
    try { events = JSON.parse(raw); } catch { return res.status(502).json({ error: "The model did not return valid JSON." }); }
    if (!Array.isArray(events)) return res.status(502).json({ error: "The model did not return a list of events." });

    const rows = events.slice(0, 5).map(ev => ({
      name: String(ev.name ?? "Untitled event"),
      date_label: String(ev.date ?? "Date TBC"),
      city: String(ev.city ?? ""), country: String(ev.country ?? ""), venue: String(ev.venue ?? "Venue TBC"),
      lat: Number.isFinite(Number(ev.lat)) ? Number(ev.lat) : null,
      lng: Number.isFinite(Number(ev.lng)) ? Number(ev.lng) : null,
      sector: String(ev.sector ?? sector),
      tags: Array.isArray(ev.tags) ? ev.tags.slice(0, 4).map(String) : [],
      organizer: String(ev.organizer ?? "Unknown"),
      attendees_estimate: Number(ev.attendees) || 0,
      image: String(ev.image ?? "📌"),
      description: String(ev.description ?? ""),
      featured: Boolean(ev.featured),
      source: "ai",
    }));

    const { data: inserted, error } = await supabase.from("events").insert(rows).select();
    if (error) { console.error("AI event insert failed:", error); return res.status(500).json({ error: "Could not save the suggested events." }); }
    res.json({ events: inserted.map(toClientEvent) });
  } catch (e) {
    console.error("AI events error:", e);
    res.status(502).json({ error: e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}` : "AI request failed." });
  }
});

// ─── AI: who should I meet ────────────────────────────────────────────────────
app.post("/api/ai/suggest", requireAuth, async (req, res) => {
  if (!requireAI(res)) return;
  const eventId = Number(req.body?.eventId);
  if (!Number.isInteger(eventId)) return res.status(400).json({ error: "eventId is required." });

  const [{ data: event }, { data: mine }] = await Promise.all([
    supabase.from("events").select("name, venue, sector").eq("id", eventId).single(),
    supabase.from("event_checkins").select("*").eq("profile_id", req.profileId).eq("event_id", eventId).maybeSingle(),
  ]);
  if (!mine) return res.status(403).json({ error: "Check in to this event first." });

  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS).toISOString();
  const { data: checkins } = await supabase
    .from("event_checkins")
    .select("profiles(name, role, company, sector, seeking)")
    .eq("event_id", eventId).gte("last_seen_at", cutoff).neq("profile_id", req.profileId);
  const people = (checkins || []).filter(c => c.profiles).map(c => c.profiles).slice(0, 40);

  if (people.length === 0) return res.json({ suggestion: "Nobody else is checked in yet — check back once the room fills up." });

  try {
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low" },
      system:
        "You are PROXIM, a business networking assistant. Given the people checked in nearby at an event, name the " +
        "two most strategic people to meet and why. Be punchy and specific. Use only the people given to you — never " +
        'invent anyone. Answer in this exact shape: "🎯 Meet [Name] — [one sentence]. Also consider [Name] — [one sentence]."',
      messages: [{ role: "user", content: `Event: ${event ? `${event.name} (${event.venue || "venue unknown"})` : "an unnamed event"}\nPeople checked in:\n${JSON.stringify(people, null, 1)}` }],
    });
    if (message.stop_reason === "refusal") return res.status(422).json({ error: "The model declined this request." });
    res.json({ suggestion: textOf(message) });
  } catch (e) {
    console.error("AI suggest error:", e);
    res.status(502).json({ error: e instanceof Anthropic.APIError ? `Anthropic API error ${e.status}` : "AI request failed." });
  }
});

// ─── Local dev entrypoint ─────────────────────────────────────────────────────
// On Vercel this file is only ever imported (see api/[...all].js) — app.listen
// never runs there. Locally, `node server.js` / `npm run server` starts it.
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT || 3001);
  app.listen(PORT, () => {
    console.log(`\n  PROXIM server  →  http://localhost:${PORT}`);
    console.log(`  Database        →  ${supabase ? "configured" : "NOT configured (set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"}`);
    console.log(`  LinkedIn OAuth  →  ${linkedInConfigured ? "configured" : "NOT configured (set LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET)"}`);
    console.log(`  Anthropic AI    →  ${anthropic ? `configured (${AI_MODEL})` : "NOT configured (set ANTHROPIC_API_KEY)"}\n`);
  });
}

export default app;
