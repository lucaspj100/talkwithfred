import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { buildFredSystemPrompt, type Mode } from "@/lib/fred-prompt";
import type { Database } from "@/integrations/supabase/types";

// Keep only the last N messages sent to the model to reduce latency / tokens.
const HISTORY_WINDOW = 10;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now();
        const mark = (label: string, since: number) =>
          console.log(`[/api/chat] ${label}: ${Date.now() - since}ms`);
        try {
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
          const token = auth.slice(7);

          const body = (await request.json()) as {
            messages?: UIMessage[];
            mode?: Mode;
            conversationId?: string;
          };
          if (!Array.isArray(body.messages)) return new Response("Bad request", { status: 400 });

          if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
            return new Response("Server misconfigured", { status: 500 });
          }
          const supabase = createClient<Database>(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_PUBLISHABLE_KEY,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            },
          );

          const tAuth = Date.now();
          const { data: userData, error: userErr } = await supabase.auth.getUser(token);
          mark("auth.getUser", tAuth);
          if (userErr || !userData?.user?.id) {
            return new Response("Unauthorized", { status: 401 });
          }
          const userId = userData.user.id;

          const tProfile = Date.now();
          const [{ data: userProfile }, { data: profile }, { data: conv }] = await Promise.all([
            supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
            supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
            body.conversationId
              ? supabase.from("conversations").select("custom_topic, mode").eq("id", body.conversationId).eq("user_id", userId).maybeSingle()
              : Promise.resolve({ data: null as { custom_topic: string | null; mode: string } | null }),
          ]);
          mark("profile fetch", tProfile);

          const mode: Mode = (conv?.mode as Mode | undefined) ?? body.mode ?? "free_conversation";
          const system = buildFredSystemPrompt(userProfile, mode, profile?.name, {
            customTopic: conv?.custom_topic ?? null,
          });

          // Trim history: keep only the last HISTORY_WINDOW messages.
          const trimmed = body.messages.slice(-HISTORY_WINDOW);

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
          const gateway = createLovableGateway(key);

          const tAi = Date.now();
          const result = streamText({
            // Lighter/faster model for low-latency conversation.
            model: gateway("google/gemini-3.1-flash-lite"),
            system,
            messages: await convertToModelMessages(trimmed),
            onFinish: () => mark("stream finish (total)", t0),
          });
          mark("ai stream start", tAi);
          mark("ttfb total", t0);

          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          console.error("[/api/chat]", err);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
