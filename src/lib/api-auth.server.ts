import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";

/**
 * Verifies a `Bearer <token>` Authorization header against Supabase Auth.
 * Returns the authenticated userId or a Response to return to the client.
 */
export async function verifyBearer(
  request: Request,
): Promise<{ userId: string } | { error: Response }> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: new Response("Unauthorized", { status: 401 }) };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    return { error: new Response("Server misconfigured", { status: 500 }) };
  }
  const supa = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    },
  );
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { error: new Response("Unauthorized", { status: 401 }) };
  }
  return { userId: data.user.id };
}

/**
 * Short-lived, single-purpose HMAC token used for the streaming TTS endpoint,
 * which is loaded via <audio src> and cannot set an Authorization header.
 *
 * The token embeds only the user id and an expiry (60s). It is NOT a Supabase
 * session — leakage of this token only allows short-lived access to /api/tts-stream
 * (which itself is rate/quota limited by the app), never the user's account.
 */
const TTS_TTL_SECONDS = 60;

function ttsSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("TTS signing secret unavailable");
  return s;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signTtsToken(userId: string): string {
  const payload = { u: userId, exp: Math.floor(Date.now() / 1000) + TTS_TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", ttsSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyTtsToken(token: string | null | undefined): { userId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", ttsSecret()).update(body).digest();
  } catch {
    return null;
  }
  let got: Buffer;
  try {
    got = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (expected.length !== got.length) return null;
  if (!timingSafeEqual(expected, got)) return null;

  let payload: { u?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.u !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { userId: payload.u };
}
