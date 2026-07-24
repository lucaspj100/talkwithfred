import { createFileRoute } from "@tanstack/react-router";
import { verifyBearer } from "@/lib/api-auth.server";

const STT_MODEL = "openai/gpt-4o-mini-transcribe";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await verifyBearer(request);
        if ("error" in auth) return auth.error;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const usageSessionId = request.headers.get("x-usage-session-id");
        const conversationId = request.headers.get("x-conversation-id");

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
        form.append("model", STT_MODEL);
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
        const json = (await upstream.json()) as { text?: string; usage?: unknown };

        // Record usage (best-effort; never blocks the response).
        if (usageSessionId && json.usage) {
          const { recordCascadeUsageSafe } = await import("@/lib/ai-cost.server");
          void recordCascadeUsageSafe({
            userId: auth.userId,
            usageSessionId,
            conversationId: conversationId ?? null,
            model: STT_MODEL,
            eventType: "stt.done",
            usage: json.usage as never,
          });
        }

        return Response.json({ text: json.text ?? "" });
      },
    },
  },
});
