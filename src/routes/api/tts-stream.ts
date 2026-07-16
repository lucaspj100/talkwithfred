import { createFileRoute } from "@tanstack/react-router";
import { verifyTtsToken } from "@/lib/api-auth.server";

/**
 * Progressive streaming TTS endpoint used as the `src` of an HTMLAudioElement.
 *
 * Auth: because <audio src> cannot set custom headers, callers pass a
 * short-lived, single-purpose signed token (minted server-side via
 * `mintTtsToken`) as a query param. We never accept the raw Supabase
 * session access_token in the URL — leakage of that token would allow
 * session takeover.
 */
export const Route = createFileRoute("/api/tts-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text");
        const ticket = url.searchParams.get("t");

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
            model: "openai/gpt-4o-mini-tts",
            voice: "ash",
            input: text,
            response_format: "mp3",
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS failed", { status: upstream.status || 502 });
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
