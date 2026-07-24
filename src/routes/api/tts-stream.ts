import { createFileRoute } from "@tanstack/react-router";
import { verifyTtsToken } from "@/lib/api-auth.server";
import { FRED_TTS_VOICE, FRED_TTS_INSTRUCTIONS } from "@/lib/tts-style";
import { openCartesiaMp3Stream, CARTESIA_MODEL } from "@/lib/cartesia-tts.server";

const OPENAI_FALLBACK_MODEL = "openai/gpt-4o-mini-tts";

/**
 * Progressive streaming TTS endpoint used as the `src` of an HTMLAudioElement.
 *
 * Primary provider: Cartesia Sonic (WebSocket streaming, ~90ms to first byte).
 * Fallback: openai/gpt-4o-mini-tts via Lovable AI Gateway (HTTP streaming).
 *
 * Auth: because <audio src> cannot set custom headers, callers pass a
 * short-lived, single-purpose signed token (minted server-side via
 * `mintTtsToken`) as a query param.
 *
 * Usage attribution: `s` = usage_session_id (optional), `c` = conversation_id
 * (optional). Ownership is verified server-side inside recordCascadeUsageSafe.
 */
export const Route = createFileRoute("/api/tts-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text");
        const ticket = url.searchParams.get("t");
        const usageSessionId = url.searchParams.get("s");
        const conversationId = url.searchParams.get("c");

        if (!text || text.length > 4000) {
          return new Response("Bad text", { status: 400 });
        }
        const claims = verifyTtsToken(ticket);
        if (!claims) {
          return new Response("Unauthorized", { status: 401 });
        }

        // --- Try Cartesia first ---
        const cartesia = await openCartesiaMp3Stream(text).catch((e) => {
          console.warn("[tts-stream] cartesia threw", e);
          return null;
        });
        if (cartesia) {
          if (usageSessionId) recordTtsUsage(
            claims.userId, usageSessionId, conversationId, CARTESIA_MODEL, "cartesia", text.length,
          );
          return new Response(cartesia.stream, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
              "X-TTS-Provider": "cartesia",
            },
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
        if (!upstream.ok || !upstream.body) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS failed", { status: upstream.status || 502 });
        }

        if (usageSessionId) recordTtsUsage(
          claims.userId, usageSessionId, conversationId, OPENAI_FALLBACK_MODEL, "openai", text.length,
        );

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "X-TTS-Provider": "openai-fallback",
          },
        });
      },
    },
  },
});

/**
 * Fire-and-forget usage record. `chars` is written into `input_text_tokens`;
 * for cartesia rows that field actually holds characters (see the note in the
 * ai_model_pricing migration), and the per-million rate in that same row is
 * therefore per-million CHARACTERS.
 */
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
      // For cartesia this is chars; for openai gpt-4o-mini-tts it's also billed
      // per char in our pricing table, so the same field is reused for both.
      usage: {
        input_tokens: chars,
        input_token_details: { text_tokens: chars },
      },
    });
  })();
}
