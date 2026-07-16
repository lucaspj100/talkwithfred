import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook that manages the server-side usage session for a chat/voice interaction.
 *
 * Flow:
 *   1. Call `start()` before opening the microphone or sending the first message.
 *   2. Call `setActive(true)` while the user is truly engaged (voice connected,
 *      or waiting for the assistant to answer). Call `setActive(false)` when
 *      the user is idle (typing but not sending, viewing history, etc.).
 *   3. Call `stop()` when the interaction ends (unmount, mode switch, end button).
 *
 * The hook fires a heartbeat every HEARTBEAT_MS while active. All accounting
 * is done server-side; the numbers returned here are only for display.
 */

const HEARTBEAT_MS = 15_000;

export type UsageStartFailure = {
  code:
    | "no_subscription"
    | "pending"
    | "blocked"
    | "no_minutes"
    | "another_active_session"
    | "server_error"
    | "network"
    | "unauthorized";
  message: string;
};

export type UsageStartOk = {
  ok: true;
  usage_session_id: string;
  session_token: string;
  seconds_available: number;
  minutes_available: number;
};

type StartArgs = {
  conversationId?: string | null;
  mode: "voice" | "text";
  force?: boolean;
};

export function useUsageSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [minutesAvailable, setMinutesAvailable] = useState<number | null>(null);
  const [secondsAvailable, setSecondsAvailable] = useState<number | null>(null);
  const [ended, setEnded] = useState<false | { reason: string }>(false);

  const tokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const sendHeartbeat = useCallback(async () => {
    const sid = sessionIdRef.current;
    const tok = tokenRef.current;
    if (!sid || !tok || !activeRef.current) return;
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeader()) };
      const resp = await fetch("/api/usage/heartbeat", {
        method: "POST",
        headers,
        body: JSON.stringify({ usage_session_id: sid, session_token: tok }),
      });
      if (!resp.ok) return;
      const json = (await resp.json()) as {
        seconds_available?: number;
        minutes_available?: number;
        ended?: boolean;
        close_reason?: string;
      };
      if (typeof json.seconds_available === "number") setSecondsAvailable(json.seconds_available);
      if (typeof json.minutes_available === "number") setMinutesAvailable(json.minutes_available);
      if (json.ended) {
        setEnded({ reason: json.close_reason ?? "out_of_minutes" });
        activeRef.current = false;
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
      }
    } catch (e) {
      console.warn("[usage.heartbeat]", e);
    }
  }, [authHeader]);

  const ensureTimer = useCallback(() => {
    if (heartbeatTimerRef.current || !activeRef.current || !sessionIdRef.current) return;
    heartbeatTimerRef.current = setInterval(() => { void sendHeartbeat(); }, HEARTBEAT_MS);
  }, [sendHeartbeat]);

  const setActive = useCallback((v: boolean) => {
    activeRef.current = v;
    if (!v) {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      // Send one immediate heartbeat to consolidate the tail time.
      void sendHeartbeat();
    } else {
      // Send one immediately to establish a baseline, then start the interval.
      void sendHeartbeat();
      ensureTimer();
    }
  }, [ensureTimer, sendHeartbeat]);

  const start = useCallback(
    async (args: StartArgs): Promise<UsageStartOk | UsageStartFailure> => {
      try {
        const headers = { "Content-Type": "application/json", ...(await authHeader()) };
        const resp = await fetch("/api/usage/start", {
          method: "POST",
          headers,
          body: JSON.stringify(args),
        });
        if (resp.status === 401) return { code: "unauthorized", message: "Faça login novamente." };
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          return {
            code: (json?.error as UsageStartFailure["code"]) ?? "server_error",
            message: (json?.message as string) ?? "Não foi possível iniciar a sessão.",
          };
        }
        const ok = json as UsageStartOk;
        sessionIdRef.current = ok.usage_session_id;
        tokenRef.current = ok.session_token;
        setSessionId(ok.usage_session_id);
        setSecondsAvailable(ok.seconds_available);
        setMinutesAvailable(ok.minutes_available);
        setEnded(false);
        stoppingRef.current = false;
        return ok;
      } catch (e) {
        console.error("[usage.start]", e);
        return { code: "network", message: "Sem conexão com o servidor." };
      }
    },
    [authHeader],
  );

  const stop = useCallback(
    async (reason: string = "user_stopped", opts: { beacon?: boolean } = {}) => {
      const sid = sessionIdRef.current;
      const tok = tokenRef.current;
      if (!sid || !tok || stoppingRef.current) return;
      stoppingRef.current = true;
      activeRef.current = false;
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      const body = JSON.stringify({ usage_session_id: sid, session_token: tok, reason });
      try {
        if (opts.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon("/api/usage/stop", blob);
        } else {
          const headers = { "Content-Type": "application/json", ...(await authHeader()) };
          await fetch("/api/usage/stop", { method: "POST", headers, body, keepalive: true });
        }
      } catch (e) {
        console.warn("[usage.stop]", e);
      } finally {
        sessionIdRef.current = null;
        tokenRef.current = null;
        setSessionId(null);
      }
    },
    [authHeader],
  );

  // beforeunload: fire-and-forget stop.
  useEffect(() => {
    const onUnload = () => {
      if (sessionIdRef.current && tokenRef.current) {
        try {
          const body = JSON.stringify({
            usage_session_id: sessionIdRef.current,
            session_token: tokenRef.current,
            reason: "beforeunload",
          });
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon?.("/api/usage/stop", blob);
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (sessionIdRef.current && tokenRef.current && !stoppingRef.current) {
        void stop("unmount", { beacon: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sessionId,
    minutesAvailable,
    secondsAvailable,
    ended,
    start,
    stop,
    setActive,
    heartbeat: sendHeartbeat,
  };
}
