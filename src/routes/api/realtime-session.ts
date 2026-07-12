import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { buildFredSystemPrompt, type Mode } from "@/lib/fred-prompt";

const BodySchema = z.object({
  conversationId: z.string().uuid(),
});

const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const VOICE = "ash";

export const Route = createFileRoute("/api/realtime-session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const key = process.env.OPENAI_API_KEY;
          if (!key) {
            return Response.json(
              { error: "voice_unavailable", message: "Voz em tempo real não está configurada." },
              { status: 503 },
            );
          }

          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!token) return new Response("Unauthorized", { status: 401 });

          const raw = await request.json().catch(() => null);
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) {
            return Response.json({ error: "invalid_payload" }, { status: 400 });
          }

          const supa = createClient<Database>(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
            },
          );

          const { data: userRes, error: userErr } = await supa.auth.getUser();
          if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });
          const userId = userRes.user.id;

          const { data: conv } = await supa
            .from("conversations")
            .select("id, mode, user_id")
            .eq("id", parsed.data.conversationId)
            .maybeSingle();
          if (!conv || conv.user_id !== userId) {
            return new Response("Conversation not found", { status: 404 });
          }

          const [{ data: userProfile }, { data: profile }] = await Promise.all([
            supa.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
            supa.from("profiles").select("name").eq("id", userId).maybeSingle(),
          ]);

          const basePrompt = buildFredSystemPrompt(
            (userProfile ?? null) as Tables<"user_profiles"> | null,
            conv.mode as Mode,
            profile?.name ?? null,
          );

          const slow = userProfile?.speaking_speed_preference === "slow"
            || userProfile?.english_level === "beginner"
            || userProfile?.english_level === "basic";

          const voiceExtras = [
            "",
            "Voice-mode guidelines:",
            "- You are speaking in a natural live voice call, not writing.",
            "- Never read symbols, markdown, code blocks or formatting out loud.",
            "- Speak 1 to 3 short sentences per turn. Never monologue.",
            "- Ask at most one question per turn, then wait for the user.",
            "- Do not repeat the same question twice in a row.",
            "- If the user interrupts you, briefly acknowledge and continue naturally.",
            slow
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
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
                interrupt_response: true,
              },
              max_response_output_tokens: 400,
            }),
          });

          if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            console.error("[realtime-session-auth] upstream", upstream.status, text.slice(0, 500));
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
          console.error("[realtime-session-auth]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
