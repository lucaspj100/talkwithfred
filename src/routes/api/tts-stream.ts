import { createFileRoute } from "@tanstack/react-router";
import { verifyTtsToken } from "@/lib/api-auth.server";
import { FRED_TTS_VOICE, FRED_TTS_INSTRUCTIONS } from "@/lib/tts-style";

const TTS_MODEL = "openai/gpt-4o-mini-tts";

/**
 * Progressive streaming TTS endpoint used as the `src` of an HTMLAudioElement.
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

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: TTS_MODEL,
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

        // Fire-and-forget usage record (char-based estimate).
        if (usageSessionId) {
          const chars = text.length;
          void (async () => {
            const { recordCascadeUsageSafe } = await import("@/lib/ai-cost.server");
            await recordCascadeUsageSafe({
              userId: claims.userId,
              usageSessionId,
              conversationId: conversationId ?? null,
              model: TTS_MODEL,
              eventType: "tts.done",
              usage: {
                input_tokens: chars,
                input_token_details: { text_tokens: chars },
              },
            });
          })();
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
