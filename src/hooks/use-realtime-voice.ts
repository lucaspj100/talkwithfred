import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "fred-thinking"
  | "fred-speaking"
  | "reconnecting"
  | "ended"
  | "error";

export type VoiceTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
  timestamp: number;
};

export type SessionCredential = { client_secret: string; model: string };

type RealtimeEvent = {
  type: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  response_id?: string;
  response?: { id?: string };
  error?: { message?: string; type?: string; code?: string; param?: string };
};

type UseVoiceOpts = {
  getSession: () => Promise<SessionCredential>;
  onUserFinalTurn?: (text: string) => void;
  onAssistantFinalTurn?: (text: string, opts: { interrupted: boolean }) => void;
};

const DEV = typeof import.meta !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
const dlog = (...args: unknown[]) => { if (DEV) console.log("[voice]", ...args); };

export function useRealtimeVoice({
  getSession,
  onUserFinalTurn,
  onAssistantFinalTurn,
}: UseVoiceOpts) {
  const [state, setState] = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [partialUser, setPartialUser] = useState<string>("");
  const [partialAssistant, setPartialAssistant] = useState<string>("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectingRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");
  const currentAssistantIdRef = useRef<string | null>(null);
  const partialAssistantRef = useRef<string>("");
  const interruptedRef = useRef(false);
  const responseInProgressRef = useRef(false);
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emittedItemIdsRef = useRef<Set<string>>(new Set());
  const partialUserItemIdRef = useRef<string | null>(null);
  const lastSentEventRef = useRef<string>("");
  const onUserFinalRef = useRef(onUserFinalTurn);
  const onAssistantFinalRef = useRef(onAssistantFinalTurn);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { partialAssistantRef.current = partialAssistant; }, [partialAssistant]);
  useEffect(() => { onUserFinalRef.current = onUserFinalTurn; }, [onUserFinalTurn]);
  useEffect(() => { onAssistantFinalRef.current = onAssistantFinalTurn; }, [onAssistantFinalTurn]);

  const supported =
    typeof window !== "undefined" &&
    typeof RTCPeerConnection !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const clearWatchdog = useCallback(() => {
    if (responseWatchdogRef.current) {
      clearTimeout(responseWatchdogRef.current);
      responseWatchdogRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearWatchdog();
    try { dcRef.current?.close(); } catch { /* ignore */ }
    dcRef.current = null;
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) {
      try { audioElRef.current.pause(); } catch { /* ignore */ }
      try { audioElRef.current.srcObject = null; } catch { /* ignore */ }
    }
    connectingRef.current = false;
    responseInProgressRef.current = false;
    emittedItemIdsRef.current = new Set();
    partialUserItemIdRef.current = null;
  }, [clearWatchdog]);

  const stop = useCallback(() => {
    cleanup();
    setState("ended");
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  const sendEvent = useCallback((payload: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    try {
      const json = JSON.stringify(payload);
      lastSentEventRef.current = json;
      dc.send(json);
    } catch (err) { console.warn("[voice] send failed", err); }
  }, []);

  const requestResponse = useCallback(() => {
    if (responseInProgressRef.current) return;
    sendEvent({ type: "response.create", response: { output_modalities: ["audio"] } });
  }, [sendEvent]);

  const scheduleWatchdog = useCallback(() => {
    clearWatchdog();
    responseWatchdogRef.current = setTimeout(() => {
      if (!responseInProgressRef.current) {
        dlog("watchdog fired, sending response.create");
        requestResponse();
      }
    }, 1300);
  }, [clearWatchdog, requestResponse]);

  const retryResponse = useCallback(() => {
    setResponseError(null);
    requestResponse();
  }, [requestResponse]);

  const flushAssistantFinal = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const wasInterrupted = interruptedRef.current;
    setTurns((prev) => [
      ...prev,
      {
        id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        text: clean,
        final: true,
        timestamp: Date.now(),
      },
    ]);
    onAssistantFinalRef.current?.(clean, { interrupted: wasInterrupted });
  }, []);

  const handleEvent = useCallback((raw: string) => {
    let ev: RealtimeEvent;
    try { ev = JSON.parse(raw) as RealtimeEvent; } catch { return; }
    dlog("←", ev.type, ev);

    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        setState("user-speaking");
        if (currentAssistantIdRef.current) {
          interruptedRef.current = true;
          try { audioElRef.current?.pause(); } catch { /* ignore */ }
          sendEvent({ type: "response.cancel" });
        }
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        if (stateRef.current === "user-speaking") setState("fred-thinking");
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        if (ev.delta) {
          if (ev.item_id) partialUserItemIdRef.current = ev.item_id;
          setPartialUser((p) => p + ev.delta);
        }
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = (ev.transcript ?? "").trim();
        setPartialUser("");
        partialUserItemIdRef.current = null;
        const id = ev.item_id || `u_${Date.now()}`;
        if (text.length > 0 && !emittedItemIdsRef.current.has(id)) {
          emittedItemIdsRef.current.add(id);
          setTurns((prev) => [
            ...prev,
            { id, role: "user", text, final: true, timestamp: Date.now() },
          ]);
          onUserFinalRef.current?.(text);
        }
        // Server VAD should auto-create a response; watchdog is a safety net.
        scheduleWatchdog();
        break;
      }
      case "response.created": {
        currentAssistantIdRef.current = ev.response?.id ?? `a_${Date.now()}`;
        interruptedRef.current = false;
        responseInProgressRef.current = true;
        clearWatchdog();
        setResponseError(null);
        setState("fred-thinking");
        setPartialAssistant("");
        break;
      }
      case "response.output_audio.delta":
      case "response.audio.delta": {
        // First audio chunk arriving → Fred is actually speaking.
        if (stateRef.current !== "fred-speaking") setState("fred-speaking");
        break;
      }
      case "response.output_audio.done":
      case "response.audio.done": {
        // audio stream ended; keep state until response.done for transcript flush
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        if (ev.delta) setPartialAssistant((p) => p + ev.delta);
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = (ev.transcript ?? partialAssistantRef.current ?? "").trim();
        setPartialAssistant("");
        if (text) flushAssistantFinal(text);
        break;
      }
      case "response.done":
      case "response.cancelled": {
        const pending = partialAssistantRef.current.trim();
        if (pending.length > 0) {
          setPartialAssistant("");
          flushAssistantFinal(pending);
        }
        currentAssistantIdRef.current = null;
        interruptedRef.current = false;
        responseInProgressRef.current = false;
        clearWatchdog();
        if (stateRef.current !== "ended") setState("listening");
        break;
      }
      case "error": {
        console.error("[voice] server error", {
          type: ev.error?.type,
          code: ev.error?.code,
          message: ev.error?.message,
          param: ev.error?.param,
          lastSent: lastSentEventRef.current.slice(0, 500),
          state: stateRef.current,
        });
        responseInProgressRef.current = false;
        clearWatchdog();
        if (stateRef.current === "fred-thinking" || stateRef.current === "fred-speaking") {
          setResponseError("Fred teve um problema para responder. Toque para tentar novamente.");
          setState("listening");
        }
        break;
      }
      default:
        break;
    }
  }, [flushAssistantFinal, sendEvent, scheduleWatchdog, clearWatchdog]);

  const start = useCallback(async () => {
    if (!supported) {
      setErrorMsg("Seu navegador não suporta conversas por voz em tempo real. Tente Chrome, Edge ou Safari atualizados.");
      setState("error");
      return;
    }
    if (connectingRef.current || pcRef.current) return;
    connectingRef.current = true;
    setErrorMsg(null);
    setResponseError(null);
    setState("connecting");

    try {
      const { client_secret, model } = await getSession();
      if (!client_secret || !model) throw new Error("Sessão de voz inválida.");

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setErrorMsg("Precisamos de acesso ao microfone para iniciar. Você também pode continuar digitando.");
        setState("error");
        connectingRef.current = false;
        return;
      }
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      let audioEl = audioElRef.current;
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
        audioElRef.current = audioEl;
      }
      pc.ontrack = (e) => {
        if (!audioEl) return;
        audioEl.srcObject = e.streams[0];
        void audioEl.play().catch(() => { /* autoplay policy */ });
      };

      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setState("listening");
        // Open the scene with an audio-only response.
        sendEvent({ type: "response.create", response: { output_modalities: ["audio"] } });
      };
      dc.onmessage = (ev) => handleEvent(typeof ev.data === "string" ? ev.data : "");
      dc.onclose = () => {
        if (stateRef.current !== "ended" && stateRef.current !== "error") setState("ended");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResp = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${client_secret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResp.ok) {
        const t = await sdpResp.text().catch(() => "");
        console.error("[voice] webrtc_sdp_exchange failed", { status: sdpResp.status, body: t.slice(0, 500) });
        throw new Error("Não conseguimos conectar ao serviço de voz. Tente novamente.");
      }
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "failed" || st === "disconnected" || st === "closed") {
          if (stateRef.current !== "ended" && stateRef.current !== "error") setState("ended");
        }
      };
      connectingRef.current = false;
    } catch (e) {
      console.error("[voice] start failed", e);
      setErrorMsg((e as Error).message || "Não foi possível iniciar a conversa por voz.");
      setState("error");
      cleanup();
    }
  }, [getSession, supported, handleEvent, sendEvent, cleanup]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  return {
    state,
    errorMsg,
    responseError,
    muted,
    turns,
    partialUser,
    partialAssistant,
    supported,
    start,
    stop,
    toggleMute,
    retryResponse,
  };
}
