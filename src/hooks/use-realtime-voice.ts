import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
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
  error?: { message?: string };
};

type UseVoiceOpts = {
  /** Called when the hook needs to mint a fresh ephemeral session credential. */
  getSession: () => Promise<SessionCredential>;
  /** Fires when a user turn's transcript is final (whisper-completed). */
  onUserFinalTurn?: (text: string) => void;
  /** Fires when a Fred turn is complete. `interrupted` = user cut Fred off. */
  onAssistantFinalTurn?: (text: string, opts: { interrupted: boolean }) => void;
};

/**
 * Real-time bidirectional voice conversation via OpenAI Realtime + WebRTC.
 * The main OpenAI key never leaves the server; the browser only holds
 * a short-lived ephemeral `client_secret` returned by the caller-supplied
 * `getSession()`.
 */
export function useRealtimeVoice({
  getSession,
  onUserFinalTurn,
  onAssistantFinalTurn,
}: UseVoiceOpts) {
  const [state, setState] = useState<VoiceState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  const cleanup = useCallback(() => {
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
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setState("ended");
  }, [cleanup]);

  // Full cleanup on unmount (leaving the page ends the call).
  useEffect(() => () => cleanup(), [cleanup]);

  const sendEvent = useCallback((payload: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== "open") return;
    try { dc.send(JSON.stringify(payload)); }
    catch (err) { console.warn("[voice] send failed", err); }
  }, []);

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

    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        setState("user-speaking");
        // Interruption: if Fred was mid-response, stop playback and cancel server-side.
        if (currentAssistantIdRef.current) {
          interruptedRef.current = true;
          try { audioElRef.current?.pause(); } catch { /* ignore */ }
          sendEvent({ type: "response.cancel" });
        }
        break;
      }
      case "input_audio_buffer.speech_stopped": {
        if (stateRef.current === "user-speaking") setState("listening");
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        if (ev.delta) setPartialUser((p) => p + ev.delta);
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        const text = (ev.transcript ?? "").trim();
        setPartialUser("");
        if (text.length > 0) {
          setTurns((prev) => [
            ...prev,
            {
              id: ev.item_id || `u_${Date.now()}`,
              role: "user",
              text,
              final: true,
              timestamp: Date.now(),
            },
          ]);
          onUserFinalRef.current?.(text);
        }
        break;
      }
      case "response.created": {
        currentAssistantIdRef.current = ev.response?.id ?? `a_${Date.now()}`;
        interruptedRef.current = false;
        setState("fred-speaking");
        setPartialAssistant("");
        break;
      }
      case "response.audio_transcript.delta": {
        if (ev.delta) setPartialAssistant((p) => p + ev.delta);
        break;
      }
      case "response.audio_transcript.done": {
        const text = (ev.transcript ?? partialAssistantRef.current ?? "").trim();
        setPartialAssistant("");
        flushAssistantFinal(text);
        break;
      }
      case "response.done":
      case "response.cancelled": {
        // Flush any partial assistant text that never received a done event
        // (e.g. cancelled mid-stream) so we don't lose the truncated turn.
        const pending = partialAssistantRef.current.trim();
        if (pending.length > 0) {
          setPartialAssistant("");
          flushAssistantFinal(pending);
        }
        currentAssistantIdRef.current = null;
        interruptedRef.current = false;
        if (stateRef.current !== "ended") setState("listening");
        break;
      }
      case "error": {
        console.error("[voice] server error", ev);
        break;
      }
      default:
        break;
    }
  }, [flushAssistantFinal, sendEvent]);

  const start = useCallback(async () => {
    if (!supported) {
      setErrorMsg("Seu navegador não suporta conversas por voz em tempo real. Tente Chrome, Edge ou Safari atualizados.");
      setState("error");
      return;
    }
    if (connectingRef.current || pcRef.current) return;
    connectingRef.current = true;
    setErrorMsg(null);
    setState("connecting");

    try {
      // 1. Ask our backend for an ephemeral session credential.
      const { client_secret, model } = await getSession();
      if (!client_secret || !model) throw new Error("Sessão de voz inválida.");

      // 2. Microphone (requires an explicit user gesture — that's what triggered start()).
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

      // 3. Peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 4. Remote audio → dedicated <audio> element (autoplay + playsInline for iOS Safari).
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
        void audioEl.play().catch(() => { /* autoplay policy; user gesture already happened */ });
      };

      // 5. Attach mic
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);

      // 6. Data channel for events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        setState("listening");
        // Ask Fred to open the scene. No synthetic user message goes into the transcript.
        sendEvent({
          type: "response.create",
          response: { modalities: ["audio", "text"] },
        });
      };
      dc.onmessage = (ev) => handleEvent(typeof ev.data === "string" ? ev.data : "");
      dc.onclose = () => {
        if (stateRef.current !== "ended" && stateRef.current !== "error") setState("ended");
      };

      // 7. SDP handshake with OpenAI Realtime (current endpoint: /v1/realtime/calls)
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
        console.error("[voice] webrtc_sdp_exchange failed", {
          status: sdpResp.status,
          body: t.slice(0, 500),
        });
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
    muted,
    turns,
    partialUser,
    partialAssistant,
    supported,
    start,
    stop,
    toggleMute,
  };
}
