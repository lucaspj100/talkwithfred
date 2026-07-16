import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BodySchema = z.object({
  usage_session_id: z.string().uuid(),
  session_token: z.string().min(16),
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

export const Route = createFileRoute("/api/usage/heartbeat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if ("error" in auth) return auth.error;
          const raw = await request.json().catch(() => ({}));
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) return Response.json({ error: "invalid_payload" }, { status: 400 });
          const { heartbeatUsageSession } = await import("@/lib/usage.server");
          const result = await heartbeatUsageSession(
            auth.userId,
            parsed.data.usage_session_id,
            parsed.data.session_token,
          );
          if (!result.ok) {
            return Response.json({ error: result.code, message: result.message }, { status: 400 });
          }
          return Response.json(result);
        } catch (err) {
          console.error("[/api/usage/heartbeat]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
