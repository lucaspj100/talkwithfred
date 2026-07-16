import { createFileRoute } from "@tanstack/react-router";

/**
 * Public Mercado Pago webhook.
 *
 * Configure this URL in the Mercado Pago dashboard:
 *   https://talkwithfred.live/api/public/mercado-pago/webhook
 *
 * We DO NOT trust the payload — for every event we re-fetch the authoritative
 * resource from the Mercado Pago API using the ID in the notification.
 */
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

        // Idempotency key: prefer x-request-id header, fall back to topic+resource
        const providerEventId =
          request.headers.get("x-request-id") ||
          (resourceId ? `${topic}:${resourceId}` : null);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try to log the event (idempotent via unique index on provider_event_id)
        if (providerEventId) {
          const { data: dup } = await supabaseAdmin
            .from("subscription_events")
            .select("id, processed")
            .eq("provider_event_id", providerEventId)
            .maybeSingle();
          if (dup?.processed) {
            return new Response("ok (duplicate)", { status: 200 });
          }
        }

        const { data: eventRow } = await supabaseAdmin
          .from("subscription_events")
          .insert({
            event_type: topic,
            provider_subscription_id: topic.includes("preapproval") ? resourceId : null,
            provider_event_id: providerEventId,
            payload: payload as unknown as Record<string, unknown>,
            processed: false,
          })
          .select("id")
          .maybeSingle();

        try {
          const { mpGetPreapproval, mpGetPayment } = await import("@/lib/mercado-pago.server");
          const { syncPreapprovalById, syncPaymentById } = await import(
            "@/lib/subscription.server"
          );

          if (resourceId && (topic.includes("preapproval") || topic === "subscription_preapproval")) {
            const remote = await mpGetPreapproval(resourceId);
            await syncPreapprovalById(remote);
          } else if (resourceId && (topic === "payment" || topic.startsWith("payment"))) {
            const payment = await mpGetPayment(resourceId);
            const { preapprovalId } = await syncPaymentById(payment);
            if (preapprovalId) {
              const remote = await mpGetPreapproval(preapprovalId);
              await syncPreapprovalById(remote);
            }
          } else {
            console.log("[mp-webhook] unhandled topic", topic);
          }

          if (eventRow?.id) {
            await supabaseAdmin
              .from("subscription_events")
              .update({ processed: true })
              .eq("id", eventRow.id);
          }
        } catch (err) {
          console.error("[mp-webhook] processing failed", err);
          // 200 anyway — MP will retry; we've logged the event.
        }

        return new Response("ok", { status: 200 });
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
