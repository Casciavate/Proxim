// Vercel catch-all: every request under /api/* is routed here and handled
// by the Express app in server.js. Locally, server.js runs standalone instead
// (see its "Local dev entrypoint" section) — this file is Vercel-only.
export { default } from "../server.js";
