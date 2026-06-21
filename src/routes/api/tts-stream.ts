import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Progressive streaming TTS endpoint. Designed to be used as the `src` of
// an HTMLAudioElement so playback starts as soon as the browser has enough
// data, instead of waiting for the whole MP3 to be downloaded.
//
// Auth: because <audio src> cannot set custom headers, the caller passes
// the Supabase access_token as a query param. The endpoint validates it
// against Supabase Auth before proxying the upstream stream.
export const Route = createFileRoute("/api/tts-stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const text = url.searchParams.get("text");
        const accessToken = url.searchParams.get("access_token");

        if (!text || text.length > 4000) {
          return new Response("Bad text", { status: 400 });
        }
        if (!accessToken) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data, error } = await supabase.auth.getUser(accessToken);
        if (error || !data?.user?.id) {
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

        // Pass upstream body through unchanged so the browser receives
        // bytes progressively and can begin playback before the file ends.
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
