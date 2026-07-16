import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BodySchema = z.object({
  usage_session_id: z.string().uuid(),
  session_token: z.string().min(16),
  reason: z.string().max(64).optional(),
});

async function authenticate(request: Request) {
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
  if (error || !data?.user?.id) return { error: new Response("Unauthorized", { status: 401 }) };
  return { userId: data.user.id };
}

export const Route = createFileRoute("/api/usage/stop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Support sendBeacon: token may come via body only (no auth header).
          // In that case we require the session token to match the row.
          const contentType = request.headers.get("content-type") ?? "";
          let bodyJson: unknown;
          if (contentType.includes("application/json")) {
            bodyJson = await request.json().catch(() => ({}));
          } else {
            const text = await request.text();
            try { bodyJson = JSON.parse(text); } catch { bodyJson = {}; }
          }
          const parsed = BodySchema.safeParse(bodyJson);
          if (!parsed.success) return Response.json({ error: "invalid_payload" }, { status: 400 });

          const { stopUsageSession } = await import("@/lib/usage.server");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Resolve userId. Prefer Authorization header; fall back to lookup by session id
          // when the browser used sendBeacon (which cannot set headers).
          const authHeader = request.headers.get("authorization") ?? "";
          let userId: string | null = null;
          if (authHeader) {
            const auth = await authenticate(request);
            if ("error" in auth) return auth.error;
            userId = auth.userId;
          } else {
            const { data } = await supabaseAdmin
              .from("usage_sessions")
              .select("user_id")
              .eq("id", parsed.data.usage_session_id)
              .maybeSingle();
            userId = (data?.user_id as string | undefined) ?? null;
          }
          if (!userId) return Response.json({ ok: true, already_ended: true });

          const result = await stopUsageSession(
            userId,
            parsed.data.usage_session_id,
            parsed.data.session_token,
            parsed.data.reason ?? "user_stopped",
          );
          return Response.json(result);
        } catch (err) {
          console.error("[/api/usage/stop]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
