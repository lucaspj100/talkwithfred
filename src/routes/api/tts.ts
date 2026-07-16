import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyBearer(request);
        if ("error" in auth) return auth.error;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { text } = (await request.json()) as { text?: string };
        if (!text || text.length > 4000) return new Response("Bad text", { status: 400 });

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
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS failed", { status: upstream.status });
        }
        return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg" } });
      },
    },
  },
});
