import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const incoming = await request.formData();
        const file = incoming.get("file");
        if (!(file instanceof Blob)) return new Response("Missing file", { status: 400 });

        const mime = (file as File).type || "audio/webm";
        const extMap: Record<string, string> = {
          "audio/webm": "webm",
          "audio/mp4": "mp4",
          "audio/mpeg": "mp3",
          "audio/wav": "wav",
          "audio/ogg": "ogg",
        };
        const ext = extMap[mime.split(";")[0]] ?? "webm";

        const form = new FormData();
        form.append("model", "openai/gpt-4o-mini-transcribe");
        form.append("file", file, `recording.${ext}`);

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
        });
        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Transcription failed", { status: upstream.status });
        }
        const json = await upstream.json();
        return Response.json({ text: json.text ?? "" });
      },
    },
  },
});
