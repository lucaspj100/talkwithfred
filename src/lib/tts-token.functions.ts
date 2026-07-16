import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mint a short-lived, single-purpose token for /api/tts-stream.
 * Never exposes the Supabase session access_token in a URL.
 */
export const mintTtsToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { signTtsToken } = await import("@/lib/api-auth.server");
    return { token: signTtsToken(context.userId) };
  });
