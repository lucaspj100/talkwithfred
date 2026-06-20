import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { buildFredSystemPrompt, type Mode } from "@/lib/fred-prompt";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

          const supabase = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            },
          );
          const { data: userData, error: userErr } = await supabase.auth.getUser(token);
          if (userErr || !userData?.user?.id) {
            console.error("[/api/chat] auth", userErr);
            return new Response("Unauthorized", { status: 401 });
          }
          const userId = userData.user.id;

          const [{ data: userProfile }, { data: profile }] = await Promise.all([
            supabase.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
            supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
          ]);

          const mode: Mode = body.mode ?? "free_conversation";
          const system = buildFredSystemPrompt(userProfile, mode, profile?.name);

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
          const gateway = createLovableGateway(key);

          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system,
            messages: await convertToModelMessages(body.messages),
          });
          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          console.error("[/api/chat]", err);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
