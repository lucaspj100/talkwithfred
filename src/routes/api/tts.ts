import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer } from "@/lib/api-auth.server";
import { FRED_TTS_VOICE, FRED_TTS_INSTRUCTIONS } from "@/lib/tts-style";

const TTS_MODEL = "openai/gpt-4o-mini-tts";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyBearer(request);
        if ("error" in auth) return auth.error;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const usageSessionId = request.headers.get("x-usage-session-id");
        const conversationId = request.headers.get("x-conversation-id");

        const { text } = (await request.json()) as { text?: string };
        if (!text || text.length > 4000) return new Response("Bad text", { status: 400 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: TTS_MODEL,
            voice: "ash",
            input: text,
            response_format: "mp3",
          }),
        });
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS failed", { status: upstream.status });
        }

        // Record usage (char-based estimation): chars sent as input_text_tokens
        // against pricing $/1M chars stored in ai_model_pricing.
        if (usageSessionId) {
          const chars = text.length;
          const { recordCascadeUsageSafe } = await import("@/lib/ai-cost.server");
          void recordCascadeUsageSafe({
            userId: auth.userId,
            usageSessionId,
            conversationId: conversationId ?? null,
            model: TTS_MODEL,
            eventType: "tts.done",
            usage: {
              input_tokens: chars,
              input_token_details: { text_tokens: chars },
            },
          });
        }

        return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg" } });
      },
    },
  },
});
