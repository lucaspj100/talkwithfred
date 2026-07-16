import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Public Mercado Pago webhook.
 *
 * Configure this URL in the Mercado Pago dashboard:
 *   https://talkwithfred.live/api/public/mercado-pago/webhook
 *
 * Security:
 * - Validates x-signature (HMAC SHA-256) using MERCADO_PAGO_WEBHOOK_SECRET.
 * - Manifest format (per MP docs):
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * - Rejects unsigned / invalid webhooks with 401.
 * - We never trust the payload contents — we re-fetch the resource by ID.
 */

function parseSignatureHeader(header: string | null): { ts: string | null; v1: string | null } {
  if (!header) return { ts: null, v1: null };
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const [rawK, ...rest] = part.split("=");
    if (!rawK || rest.length === 0) continue;
    const k = rawK.trim().toLowerCase();
    const v = rest.join("=").trim();
    if (k === "ts") ts = v;
    else if (k === "v1") v1 = v;
  }
  return { ts, v1 };
}

function verifySignature(opts: {
  secret: string;
  resourceId: string;
  requestId: string;
  ts: string;
  v1: string;
}): boolean {
  // MP manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
  // Note: id is lowercased for alphanumeric IDs per MP guidance.
  const idNormalized = opts.resourceId.toLowerCase();
  const manifest = `id:${idNormalized};request-id:${opts.requestId};ts:${opts.ts};`;
  const expected = createHmac("sha256", opts.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(opts.v1, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/mercado-pago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let payload: Record<string, unknown> = {};
        try {
          payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const url = new URL(request.url);
        const topic =
          (payload.type as string | undefined) ??
          (payload.topic as string | undefined) ??
          url.searchParams.get("type") ??
          url.searchParams.get("topic") ??
          "unknown";

        const dataObj = payload.data as { id?: string | number } | undefined;
        const resourceId =
          (dataObj?.id != null ? String(dataObj.id) : undefined) ??
          (payload.id != null ? String(payload.id) : undefined) ??
          url.searchParams.get("data.id") ??
          url.searchParams.get("id") ??
          null;

        const signatureHeader = request.headers.get("x-signature");
        const requestId = request.headers.get("x-request-id") ?? "";
        const { ts, v1 } = parseSignatureHeader(signatureHeader);

        const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? "";
        const isProduction = process.env.NODE_ENV === "production";

        // Structured safe log
        const logCtx = {
          topic,
          resource_id: resourceId,
          request_id: requestId || null,
          has_signature: Boolean(signatureHeader),
          has_ts: Boolean(ts),
          has_v1: Boolean(v1),
        };

        if (!secret) {
          if (isProduction) {
            console.warn("[mp-webhook] rejected: MERCADO_PAGO_WEBHOOK_SECRET not configured", logCtx);
            return new Response("Webhook secret not configured", { status: 401 });
          }
          console.warn("[mp-webhook] dev fallback: no secret configured, skipping signature check", logCtx);
        } else {
          if (!signatureHeader || !ts || !v1 || !resourceId || !requestId) {
            console.warn("[mp-webhook] rejected: missing signature material", logCtx);
            return new Response("Missing signature", { status: 401 });
          }
          const valid = verifySignature({ secret, resourceId, requestId, ts, v1 });
          if (!valid) {
            console.warn("[mp-webhook] rejected: invalid signature", logCtx);
            return new Response("Invalid signature", { status: 401 });
          }
          console.log("[mp-webhook] signature ok", logCtx);
        }

        const providerEventId =
          requestId ||
          (resourceId ? `${topic}:${resourceId}` : null);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency
        if (providerEventId) {
          const { data: dup } = await supabaseAdmin
            .from("subscription_events")
            .select("id, processed")
            .eq("provider_event_id", providerEventId)
            .maybeSingle();
          if (dup?.processed) {
            console.log("[mp-webhook] duplicate event", { ...logCtx, provider_event_id: providerEventId });
            return new Response("ok (duplicate)", { status: 200 });
          }
        }

        const { data: eventRow } = await supabaseAdmin
          .from("subscription_events")
          .insert({
            event_type: topic,
            provider_subscription_id: topic.includes("preapproval") ? resourceId : null,
            provider_event_id: providerEventId,
            payload: payload as unknown as never,
            processed: false,
          })
          .select("id")
          .maybeSingle();

        try {
          const { mpGetPreapproval, mpGetPayment, MercadoPagoApiError } = await import(
            "@/lib/mercado-pago.server"
          );
          const { syncPreapprovalById, syncPaymentById } = await import(
            "@/lib/subscription.server"
          );

          const isTestFictitious = resourceId === "123456";

          if (!resourceId) {
            console.log("[mp-webhook] no resource id", logCtx);
          } else if (topic.includes("preapproval") || topic === "subscription_preapproval") {
            try {
              const remote = await mpGetPreapproval(resourceId);
              await syncPreapprovalById(remote);
              console.log("[mp-webhook] preapproval synced", { ...logCtx, status: remote.status });
            } catch (err) {
              if (err instanceof MercadoPagoApiError && err.status === 404 && isTestFictitious) {
                console.log("[mp-webhook] test event (fictitious id, 404)", logCtx);
              } else {
                throw err;
              }
            }
          } else if (topic === "payment" || topic.startsWith("payment")) {
            try {
              const payment = await mpGetPayment(resourceId);
              const { preapprovalId } = await syncPaymentById(payment);
              if (preapprovalId) {
                const remote = await mpGetPreapproval(preapprovalId);
                await syncPreapprovalById(remote);
              }
              console.log("[mp-webhook] payment synced", { ...logCtx, status: payment.status });
            } catch (err) {
              if (err instanceof MercadoPagoApiError && err.status === 404 && isTestFictitious) {
                console.log("[mp-webhook] test event (fictitious id, 404)", logCtx);
              } else {
                throw err;
              }
            }
          } else {
            console.log("[mp-webhook] unhandled topic", logCtx);
          }

          if (eventRow?.id) {
            await supabaseAdmin
              .from("subscription_events")
              .update({ processed: true })
              .eq("id", eventRow.id);
          }
        } catch (err) {
          console.error("[mp-webhook] processing failed", { ...logCtx, error: (err as Error).message });
          // 200 anyway — MP will retry; we've logged the event.
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
