import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyBearer } from "@/lib/api-auth.server";

const UsageSchema = z.object({
  input_tokens: z.number().nonnegative().max(10_000_000).optional(),
  output_tokens: z.number().nonnegative().max(10_000_000).optional(),
  total_tokens: z.number().nonnegative().max(20_000_000).optional(),
  input_token_details: z
    .object({
      text_tokens: z.number().nonnegative().max(10_000_000).optional(),
      audio_tokens: z.number().nonnegative().max(10_000_000).optional(),
      cached_tokens: z.number().nonnegative().max(10_000_000).optional(),
      cached_tokens_details: z
        .object({
          text_tokens: z.number().nonnegative().max(10_000_000).optional(),
          audio_tokens: z.number().nonnegative().max(10_000_000).optional(),
        })
        .optional(),
    })
    .optional(),
  output_token_details: z
    .object({
      text_tokens: z.number().nonnegative().max(10_000_000).optional(),
      audio_tokens: z.number().nonnegative().max(10_000_000).optional(),
    })
    .optional(),
});

const BodySchema = z.object({
  usage_session_id: z.string().uuid().nullable().optional(),
  conversation_id: z.string().max(128).nullable().optional(),
  response_id: z.string().max(128).nullable().optional(),
  event_id: z.string().max(128).nullable().optional(),
  model: z.string().max(80).nullable().optional(),
  event_type: z.string().max(60).default("response.done"),
  usage: UsageSchema,
});

// Server-owned model — MUST match the one configured in api/realtime-session.ts.
const SERVER_MODEL = "gpt-realtime-2.1";

export const Route = createFileRoute("/api/ai-usage/record")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await verifyBearer(request);
          if ("error" in auth) return auth.error;

          const raw = await request.json().catch(() => null);
          const parsed = BodySchema.safeParse(raw);
          if (!parsed.success) {
            return Response.json({ error: "invalid_payload" }, { status: 400 });
          }

          const { recordAiUsageEvent } = await import("@/lib/ai-cost.server");
          const result = await recordAiUsageEvent({
            userId: auth.userId,
            usageSessionId: parsed.data.usage_session_id ?? null,
            conversationId: parsed.data.conversation_id ?? null,
            providerResponseId: parsed.data.response_id ?? null,
            providerEventId: parsed.data.event_id ?? null,
            reportedModel: parsed.data.model ?? null,
            serverModel: SERVER_MODEL,
            eventType: parsed.data.event_type,
            usage: parsed.data.usage,
          });

          if (!result.ok) {
            return Response.json(
              { error: result.code, message: result.message },
              { status: result.code === "session_not_found" ? 404 : 400 },
            );
          }
          return Response.json({
            ok: true,
            duplicate: result.duplicate ?? false,
            model: result.model,
          });
        } catch (err) {
          console.error("[ai-usage/record]", err);
          return Response.json({ error: "server_error" }, { status: 500 });
        }
      },
    },
  },
});
