import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { buildSimulationSystemPrompt, type LeadDiagnostic } from "@/lib/simulation-prompt";

type Body = {
  messages?: UIMessage[];
  diagnostic?: LeadDiagnostic;
  leadId?: string;
};

// Best-effort in-memory throttling. Workers are per-isolate — this is not a
// hard cap, just enough to slow trivial abuse from a single browser session.
const recent: { key: string; at: number }[] = [];
const WINDOW_MS = 60_000;
const MAX_PER_MIN = 8;
const MAX_MESSAGES_PER_LEAD = 30;
const leadTotals = new Map<string, number>();
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

// Public endpoint: no auth. Used by the free "career simulation" lead funnel.
// The endpoint bypasses auth on published sites because it's under /api/public/*.
export const Route = createFileRoute("/api/public/simulation-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Body;
          if (!Array.isArray(body.messages) || !body.diagnostic) {
            return new Response("Bad request", { status: 400 });
          }
          // Hard cap: max 20 messages in the transcript (safety against abuse).
          if (body.messages.length > 20) {
            return new Response("Simulation limit reached", { status: 400 });
          }

          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
          const throttleKey = body.leadId ? `lead:${body.leadId}` : `ip:${ip}`;
          if (!throttle(throttleKey)) {
            return new Response("Too many requests", { status: 429 });
          }
          if (body.leadId) {
            const total = (leadTotals.get(body.leadId) ?? 0) + 1;
            if (total > MAX_MESSAGES_PER_LEAD) {
              return new Response("Simulation limit reached", { status: 429 });
            }
            leadTotals.set(body.leadId, total);
          }

          const key = process.env.LOVABLE_API_KEY;
          if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

          const system = buildSimulationSystemPrompt(body.diagnostic);
          const gateway = createLovableGateway(key);
          const result = streamText({
            model: gateway("google/gemini-3.1-flash-lite"),
            system,
            messages: await convertToModelMessages(body.messages.slice(-12)),
          });
          return result.toUIMessageStreamResponse({ originalMessages: body.messages });
        } catch (err) {
          console.error("[/api/public/simulation-chat]", err);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
