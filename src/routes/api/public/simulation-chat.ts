import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableGateway } from "@/lib/ai-gateway.server";
import { buildSimulationSystemPrompt, type LeadDiagnostic } from "@/lib/simulation-prompt";

type Body = {
  messages?: UIMessage[];
  diagnostic?: LeadDiagnostic;
  leadId?: string;
};

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
