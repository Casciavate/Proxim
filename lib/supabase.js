import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn(
    "[proxim] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — " +
    "every endpoint that touches the database will return 503 until they are."
  );
}

// Service-role client: bypasses RLS. This file is never imported by
// anything that ships to the browser — only server.js and api/*.
export const supabase = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;
