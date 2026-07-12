import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import { buildFredSystemPrompt, type Mode } from "@/lib/fred-prompt";

const BodySchema = z.object({
  conversationId: z.string().uuid(),
});

const REALTIME_MODEL = "gpt-realtime-2.1";
const VOICE = "cedar";
const TRANSCRIPTION_MODEL = "whisper-1";

type UpstreamOk = {
  value?: string;
  expires_at?: number;
  session?: { id?: string };
  client_secret?: { value?: string; expires_at?: number };
  id?: string;
};

type UpstreamErr = {
  error?: { message?: string; type?: string; code?: string };
};

function mapUpstreamError(status: number, body: UpstreamErr): { code: string; message: string; http: number } {
  const t = body.error?.type ?? "";
  const c = body.error?.code ?? "";
  if (status === 401 || t === "invalid_api_key" || c === "invalid_api_key") {
    return { code: "invalid_api_key", message: "Chave de voz inválida. Avise o suporte.", http: 502 };
  }
  if (status === 403 || t === "permission_denied") {
    return { code: "permission_denied", message: "Sem permissão para usar voz nesta conta.", http: 502 };
  }
  if (status === 404 || c === "model_not_found") {
    return { code: "model_not_found", message: "Modelo de voz indisponível no momento.", http: 502 };
  }
  if (status === 429 || t === "rate_limit_exceeded") {
    return { code: "rate_limit_exceeded", message: "Muitas tentativas. Aguarde alguns segundos.", http: 429 };
  }
  if (t === "insufficient_quota" || c === "insufficient_quota") {
    return { code: "insufficient_quota", message: "Créditos de voz esgotados. Avise o suporte.", http: 502 };
  }
  return { code: "session_failed", message: "Não foi possível iniciar a sessão de voz agora.", http: 502 };
}

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

          const voiceExtras = [
            "",
            "# Voice-mode guidelines",
            "- You are speaking in a natural live voice call, not writing.",
            "- Never read symbols, markdown, code blocks or formatting out loud.",
            "- Follow the Learner Level Adaptation and Pacing sections above for speed, sentence length and vocabulary.",
            "- Ask at most one question per turn, then wait for the user.",
            "- Do not repeat the same question twice in a row.",
            "- If the user interrupts you, briefly acknowledge and continue naturally.",
          ].join("\n");
          const instructions = (basePrompt + "\n" + voiceExtras).slice(0, 8000);

          const safetyId = createHash("sha256").update(userId).digest("hex").slice(0, 32);

          const upstream = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "OpenAI-Safety-Identifier": safetyId,
            },
            body: JSON.stringify({
              session: {
                type: "realtime",
                model: REALTIME_MODEL,
                instructions,
                audio: {
                  input: {
                    transcription: { model: TRANSCRIPTION_MODEL },
                    turn_detection: {
                      type: "server_vad",
                      threshold: 0.5,
                      prefix_padding_ms: 300,
                      silence_duration_ms: 500,
                      create_response: true,
                      interrupt_response: true,
                    },
                  },
                  output: { voice: VOICE },
                },
              },
            }),
          });

          if (!upstream.ok) {
            const bodyText = await upstream.text().catch(() => "");
            console.error("[realtime-session-auth]", { status: upstream.status, body: bodyText.slice(0, 1000) });
            let parsedErr: UpstreamErr = {};
            try { parsedErr = JSON.parse(bodyText) as UpstreamErr; } catch { /* ignore */ }
            const m = mapUpstreamError(upstream.status, parsedErr);
            return Response.json({ error: m.code, message: m.message }, { status: m.http });
          }

          const data = (await upstream.json()) as UpstreamOk;
          const ephemeralKey = data.value ?? data.client_secret?.value;
          if (!ephemeralKey) {
            console.error("[realtime-session-auth] missing client secret", JSON.stringify(data).slice(0, 500));
            return Response.json({ error: "session_failed", message: "Resposta inválida do serviço de voz." }, { status: 502 });
          }

          return Response.json({
            client_secret: ephemeralKey,
            expires_at: data.expires_at ?? data.client_secret?.expires_at ?? null,
            session_id: data.session?.id ?? data.id ?? null,
            model: REALTIME_MODEL,
          });
        } catch (err) {
          console.error("[realtime-session-auth]", err);
          return Response.json({ error: "server_error", message: "Erro interno ao iniciar a voz." }, { status: 500 });
        }
      },
    },
  },
});
