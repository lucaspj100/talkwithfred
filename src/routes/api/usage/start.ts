import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BodySchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  mode: z.enum(["voice", "text"]).default("voice"),
  force: z.boolean().optional(),
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

export const Route = createFileRoute("/api/usage/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authenticate(request);
          if ("error" in auth) return auth.error;
          const raw = await request.json().catch(() => ({}));
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) return Response.json({ error: "invalid_payload" }, { status: 400 });

          const { startUsageSession } = await import("@/lib/usage.server");
          const result = await startUsageSession(auth.userId, {
            conversationId: parsed.data.conversationId ?? null,
            mode: parsed.data.mode,
            force: parsed.data.force ?? false,
          });
          if (!result.ok) {
            const status =
              result.code === "no_subscription"
                ? 403
                : result.code === "pending" || result.code === "blocked" || result.code === "no_minutes"
                  ? 403
                  : result.code === "another_active_session"
                    ? 409
                    : 400;
            return Response.json({ error: result.code, message: result.message, status_detail: result.status ?? null }, { status });
          }
          return Response.json(result);
        } catch (err) {
          console.error("[/api/usage/start]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
