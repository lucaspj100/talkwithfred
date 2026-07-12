import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildSimulationSystemPrompt, type LeadDiagnostic } from "@/lib/simulation-prompt";

const DiagSchema = z.object({
  name: z.string().max(120).default(""),
  areas: z.array(z.string().max(40)).max(15).default([]),
  other_area: z.string().max(200).nullable().optional(),
  goal: z.string().max(60).nullable().optional(),
  level: z.string().max(60).nullable().optional(),
  main_block: z.string().max(60).nullable().optional(),
  area: z.string().max(60).nullable().optional(),
});

const BodySchema = z.object({
  diagnostic: DiagSchema,
  leadId: z.string().min(1).max(64).optional(),
});

// Best-effort in-memory throttling. Workers are per-isolate — this is not a
// hard cap, just enough to slow trivial abuse from a single browser session.
const recent: { key: string; at: number }[] = [];
const WINDOW_MS = 60_000;
const MAX_PER_MIN = 4;
function throttle(key: string): boolean {
  const now = Date.now();
  for (let i = recent.length - 1; i >= 0; i--) {
    if (now - recent[i].at > WINDOW_MS) recent.splice(i, 1);
  }
  const hits = recent.filter((r) => r.key === key).length;
  if (hits >= MAX_PER_MIN) return false;
  recent.push({ key, at: now });
  return true;
}

const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
// Male, warm, natural voice for Fred.
const VOICE = "ash";

export const Route = createFileRoute("/api/public/realtime-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = process.env.OPENAI_API_KEY;
          if (!key) {
            return Response.json(
              { error: "voice_unavailable", message: "Voz em tempo real não está configurada neste ambiente." },
              { status: 503 },
            );
          }

          const raw = await request.json().catch(() => null);
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) {
            return Response.json({ error: "invalid_payload" }, { status: 400 });
          }

          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
          const throttleKey = parsed.data.leadId ? `lead:${parsed.data.leadId}` : `ip:${ip}`;
          if (!throttle(throttleKey)) {
            return Response.json(
              { error: "rate_limited", message: "Muitas tentativas em pouco tempo. Aguarde alguns segundos." },
              { status: 429 },
            );
          }

          const diag = parsed.data.diagnostic as LeadDiagnostic;
          const basePrompt = buildSimulationSystemPrompt(diag);
          const slower = diag.level === "basic" || diag.level === "unsure";
          const voiceExtras = [
            "",
            "Voice-mode guidelines:",
            "- You are speaking in a natural live voice call, not writing.",
            "- Never read symbols, markdown, code blocks or formatting out loud.",
            "- Speak 1 to 3 short sentences per turn. Never monologue.",
            "- Ask at most one question per turn, then wait for the user.",
            "- Do not repeat the same question twice in a row.",
            "- If the user interrupts you, briefly acknowledge and continue naturally.",
            "- Say the user's first name only when it feels natural — not every reply.",
            slower
              ? "- Speak a bit more slowly and clearly so the user can follow."
              : "- Speak at a natural conversational pace.",
          ].join("\n");
          const instructions = (basePrompt + "\n" + voiceExtras).slice(0, 6000);

          const upstream = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "OpenAI-Beta": "realtime=v1",
            },
            body: JSON.stringify({
              model: REALTIME_MODEL,
              voice: VOICE,
              modalities: ["audio", "text"],
              instructions,
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              input_audio_transcription: { model: "whisper-1" },
              // Server-side voice activity detection with automatic interruption.
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
                interrupt_response: true,
              },
              // Hard cap so runaway/abandoned sessions don't burn credits.
              max_response_output_tokens: 400,
            }),
          });

          if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            console.error("[realtime-session] upstream", upstream.status, text.slice(0, 500));
            return Response.json(
              { error: "session_failed", message: "Não foi possível iniciar a sessão de voz agora." },
              { status: 502 },
            );
          }

          const data = (await upstream.json()) as {
            id?: string;
            client_secret?: { value: string; expires_at?: number };
          };
          if (!data.client_secret?.value) {
            return Response.json({ error: "session_failed" }, { status: 502 });
          }

          return Response.json({
            client_secret: data.client_secret.value,
            expires_at: data.client_secret.expires_at ?? null,
            session_id: data.id ?? null,
            model: REALTIME_MODEL,
          });
        } catch (err) {
          console.error("[realtime-session]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
