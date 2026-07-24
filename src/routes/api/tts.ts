import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer } from "@/lib/api-auth.server";
import { FRED_TTS_VOICE, FRED_TTS_INSTRUCTIONS } from "@/lib/tts-style";
import { openCartesiaMp3Stream, CARTESIA_MODEL } from "@/lib/cartesia-tts.server";

const OPENAI_FALLBACK_MODEL = "openai/gpt-4o-mini-tts";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyBearer(request);
        if ("error" in auth) return auth.error;

        const usageSessionId = request.headers.get("x-usage-session-id");
        const conversationId = request.headers.get("x-conversation-id");

        const { text } = (await request.json()) as { text?: string };
        if (!text || text.length > 4000) return new Response("Bad text", { status: 400 });

        // --- Try Cartesia first ---
        const cartesia = await openCartesiaMp3Stream(text).catch((e) => {
          console.warn("[tts] cartesia threw", e);
          return null;
        });
        if (cartesia) {
          if (usageSessionId) recordTtsUsage(
            auth.userId, usageSessionId, conversationId, CARTESIA_MODEL, "cartesia", text.length,
          );
          return new Response(cartesia.stream, {
            headers: { "Content-Type": "audio/mpeg", "X-TTS-Provider": "cartesia" },
          });
        }

        // --- Fallback: OpenAI via Lovable AI Gateway ---
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: OPENAI_FALLBACK_MODEL,
            voice: FRED_TTS_VOICE,
            input: text,
            instructions: FRED_TTS_INSTRUCTIONS,
            response_format: "mp3",
          }),
        });
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS failed", { status: upstream.status });
        }

        if (usageSessionId) recordTtsUsage(
          auth.userId, usageSessionId, conversationId, OPENAI_FALLBACK_MODEL, "openai", text.length,
        );

        return new Response(upstream.body, {
          headers: { "Content-Type": "audio/mpeg", "X-TTS-Provider": "openai-fallback" },
        });
      },
    },
  },
});

/** See tts-stream.ts for the "chars stored in input_text_tokens" convention. */
function recordTtsUsage(
  userId: string,
  usageSessionId: string,
  conversationId: string | null,
  model: string,
  provider: "cartesia" | "openai",
  chars: number,
) {
  void (async () => {
    const { recordCascadeUsageSafe } = await import("@/lib/ai-cost.server");
    await recordCascadeUsageSafe({
      userId,
      usageSessionId,
      conversationId,
      model,
      provider,
      eventType: "tts.done",
      usage: {
        input_tokens: chars,
        input_token_details: { text_tokens: chars },
      },
    });
  })();
}
