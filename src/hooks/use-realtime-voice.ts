import { useCallback, useEffect, useRef, useState } from "react";
import { isLikelyNoiseTranscript } from "@/lib/voice-config";

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
  const [mouthLevel, setMouthLevel] = useState<number>(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const connectingRef = useRef(false);
  const stateRef = useRef<VoiceState>("idle");
  const currentAssistantIdRef = useRef<string | null>(null);
  const partialAssistantRef = useRef<string>("");
  const interruptedRef = useRef(false);
  const assistantAudioStartedAtRef = useRef<number | null>(null);
  const assistantTranscriptFlushedRef = useRef<boolean>(false);
  const flushedAssistantKeysRef = useRef<Set<string>>(new Set());
  const audioPlaybackCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAudioPlayingAtRef = useRef<number | null>(null);
  const firstAudioDeltaSeenRef = useRef<boolean>(false);
  const responseInProgressRef = useRef(false);
  const responseWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emittedItemIdsRef = useRef<Set<string>>(new Set());
  const partialUserItemIdRef = useRef<string | null>(null);
  const lastSentEventRef = useRef<string>("");
  const onUserFinalRef = useRef(onUserFinalTurn);
  const onAssistantFinalRef = useRef(onAssistantFinalTurn);

  // Web Audio analyser for Lucas's response audio (mouth-sync).
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mouthRafRef = useRef<number | null>(null);
  const smoothedMouthRef = useRef<number>(0);
  const fallbackMouthRef = useRef<number | null>(null);
  const lastRealMouthSignalAtRef = useRef<number>(0);

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

  const clearPlaybackCheck = useCallback(() => {
    if (audioPlaybackCheckRef.current) {
      clearTimeout(audioPlaybackCheckRef.current);
      audioPlaybackCheckRef.current = null;
    }
  }, []);

  const stopMouthFallback = useCallback(() => {
    if (fallbackMouthRef.current !== null) {
      window.clearTimeout(fallbackMouthRef.current);
      fallbackMouthRef.current = null;
    }
  }, []);

  const stopMouthMotion = useCallback(() => {
    if (mouthRafRef.current !== null) {
      cancelAnimationFrame(mouthRafRef.current);
      mouthRafRef.current = null;
    }
    stopMouthFallback();
    smoothedMouthRef.current = 0;
    lastRealMouthSignalAtRef.current = 0;
    setMouthLevel(0);
  }, [stopMouthFallback]);

  const startMouthFallback = useCallback(() => {
    if (fallbackMouthRef.current !== null) return;
    const seq = [10, 35, 65, 20];
    let i = 0;
    const tick = () => {
      if (stateRef.current !== "fred-speaking") {
        fallbackMouthRef.current = null;
        smoothedMouthRef.current = 0;
        setMouthLevel(0);
        return;
      }
      const next = seq[i % seq.length];
      smoothedMouthRef.current = next;
      setMouthLevel(next);
      i++;
      fallbackMouthRef.current = window.setTimeout(tick, 90 + Math.round(Math.random() * 90));
    };
    tick();
  }, []);

  const startMouthLoop = useCallback(() => {
    if (mouthRafRef.current !== null) return;

    const analyser = analyserRef.current;
    if (!analyser) {
      if (stateRef.current === "fred-speaking") startMouthFallback();
      return;
    }

    const frequencyBins = new Uint8Array(analyser.frequencyBinCount);
    const waveform = new Uint8Array(analyser.fftSize);

    const tick = () => {
      const activeAnalyser = analyserRef.current;
      if (!activeAnalyser) {
        mouthRafRef.current = null;
        if (stateRef.current === "fred-speaking") startMouthFallback();
        return;
      }

      if (stateRef.current !== "fred-speaking") {
        mouthRafRef.current = null;
        stopMouthFallback();
        smoothedMouthRef.current = 0;
        setMouthLevel(0);
        return;
      }

      if (activeAnalyser.context.state === "suspended") {
        void (activeAnalyser.context as AudioContext).resume().catch(() => { /* ignore */ });
      }

      activeAnalyser.getByteTimeDomainData(waveform);
      activeAnalyser.getByteFrequencyData(frequencyBins);

      let sumSquares = 0;
      let peak = 0;
      for (let i = 0; i < waveform.length; i++) {
        const centered = (waveform[i] - 128) / 128;
        const abs = Math.abs(centered);
        sumSquares += centered * centered;
        if (abs > peak) peak = abs;
      }
      const rms = Math.sqrt(sumSquares / waveform.length);

      let speechBandTotal = 0;
      const upperBin = Math.min(frequencyBins.length, 96);
      for (let i = 2; i < upperBin; i++) speechBandTotal += frequencyBins[i];
      const speechBandAvg = speechBandTotal / Math.max(1, upperBin - 2);

      const rmsLevel = Math.max(0, (rms - 0.006) * 900);
      const peakLevel = Math.max(0, (peak - 0.02) * 240);
      const frequencyLevel = speechBandAvg * 1.35;
      const rawLevel = Math.min(100, Math.max(rmsLevel, peakLevel, frequencyLevel));

      if (rawLevel >= 4) {
        lastRealMouthSignalAtRef.current = Date.now();
        stopMouthFallback();
        const next = smoothedMouthRef.current * 0.45 + rawLevel * 0.55;
        smoothedMouthRef.current = next;
        setMouthLevel(Math.round(Math.max(0, Math.min(100, next))));
      } else if (Date.now() - lastRealMouthSignalAtRef.current > 220) {
        startMouthFallback();
      }

      mouthRafRef.current = requestAnimationFrame(tick);
    };

    mouthRafRef.current = requestAnimationFrame(tick);
  }, [startMouthFallback, stopMouthFallback]);

  const beginMouthMotion = useCallback(() => {
    startMouthFallback();
    startMouthLoop();
  }, [startMouthFallback, startMouthLoop]);

  const startMouthAnalyser = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) { beginMouthMotion(); return; }
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") { void ctx.resume().catch(() => { /* ignore */ }); }

      // Recreate the analyser + source for this stream.
      if (mouthRafRef.current !== null) {
        cancelAnimationFrame(mouthRafRef.current);
        mouthRafRef.current = null;
      }
      try { analyserSourceRef.current?.disconnect(); } catch { /* ignore */ }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.18;
      source.connect(analyser);
      // Do NOT connect analyser to ctx.destination — the <audio> element already plays it.
      analyserSourceRef.current = source;
      analyserRef.current = analyser;
      lastRealMouthSignalAtRef.current = 0;
      startMouthLoop();
    } catch (err) {
      console.warn("[voice] mouth analyser failed, using fallback", err);
      beginMouthMotion();
    }
  }, [beginMouthMotion, startMouthLoop]);


  const cleanup = useCallback(() => {
    clearWatchdog();
    clearPlaybackCheck();
    stopMouthMotion();
    try { analyserSourceRef.current?.disconnect(); } catch { /* ignore */ }
    analyserSourceRef.current = null;
    analyserRef.current = null;
    try { void audioContextRef.current?.close(); } catch { /* ignore */ }
    audioContextRef.current = null;
    try { dcRef.current?.close(); } catch { /* ignore */ }
    dcRef.current = null;
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch { /* ignore */ }
    try { pcRef.current?.close(); } catch { /* ignore */ }
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) {
      try { audioElRef.current.srcObject = null; } catch { /* ignore */ }
      try { audioElRef.current.remove(); } catch { /* ignore */ }
      audioElRef.current = null;
    }
    connectingRef.current = false;
    responseInProgressRef.current = false;
    assistantAudioStartedAtRef.current = null;
    assistantTranscriptFlushedRef.current = false;
    flushedAssistantKeysRef.current = new Set();
    firstAudioDeltaSeenRef.current = false;
    lastAudioPlayingAtRef.current = null;
    emittedItemIdsRef.current = new Set();
    partialUserItemIdRef.current = null;
  }, [clearWatchdog, clearPlaybackCheck, stopMouthMotion]);

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

  // (Watchdog for auto response.create was removed: the client now explicitly
  //  calls requestResponse() only after transcription passes validation, so
  //  ambient noise never triggers a spurious response.)

  const retryResponse = useCallback(() => {
    setResponseError(null);
    requestResponse();
  }, [requestResponse]);

  const assistantFlushKey = useCallback((ev: RealtimeEvent) => {
    return ev.item_id || ev.response_id || ev.response?.id || currentAssistantIdRef.current || "current";
  }, []);

  const flushAssistantFinal = useCallback((text: string, key?: string) => {
    const clean = text.trim();
    if (!clean) return;
    const dedupeKey = key || currentAssistantIdRef.current;
    if (dedupeKey && flushedAssistantKeysRef.current.has(dedupeKey)) return;
    if (dedupeKey) flushedAssistantKeysRef.current.add(dedupeKey);
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

  const markAudioPlayable = useCallback((audio: HTMLAudioElement) => {
    audio.muted = false;
    audio.volume = 1;
  }, []);

  const schedulePlaybackCheck = useCallback(() => {
    clearPlaybackCheck();
    audioPlaybackCheckRef.current = setTimeout(() => {
      const audio = audioElRef.current;
      if (!audio || !responseInProgressRef.current) return;
      const lastPlaying = lastAudioPlayingAtRef.current;
      const noRecentPlaying = !lastPlaying || Date.now() - lastPlaying > 1200;
      if (audio.muted || audio.paused || noRecentPlaying) {
        if (DEV) {
          console.warn("[voice-audio] playback attention needed", {
            at: new Date().toISOString(),
            muted: audio.muted,
            paused: audio.paused,
            noRecentPlaying,
            readyState: audio.readyState,
          });
        }
        setAudioBlocked(true);
      }
    }, 1200);
  }, [clearPlaybackCheck]);

  const handleEvent = useCallback((raw: string) => {
    let ev: RealtimeEvent;
    try { ev = JSON.parse(raw) as RealtimeEvent; } catch { return; }
    dlog("←", ev.type, ev);

    switch (ev.type) {
      case "input_audio_buffer.speech_started": {
        const startedAt = assistantAudioStartedAtRef.current;
        const msSinceAssistantAudio = startedAt === null ? null : Date.now() - startedAt;
        const probablyEcho = msSinceAssistantAudio !== null && msSinceAssistantAudio < 500;
        console.log("[voice-event] input_audio_buffer.speech_started", {
          at: new Date().toISOString(),
          currentAssistantId: currentAssistantIdRef.current,
          msSinceAssistantAudio,
          probablyEcho,
        });
        setState("user-speaking");
        if (currentAssistantIdRef.current && !probablyEcho) {
          interruptedRef.current = true;
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
        // Validate: skip empty/noise-only transcriptions. Server VAD is set to
        // create_response=false, so nothing is sent to Lucas unless we ask.
        if (text.length === 0 || isLikelyNoiseTranscript(text)) {
          dlog("dropped noise/empty transcript", text);
          if (stateRef.current === "user-speaking" || stateRef.current === "fred-thinking") {
            setState("listening");
          }
          break;
        }
        if (!emittedItemIdsRef.current.has(id)) {
          emittedItemIdsRef.current.add(id);
          setTurns((prev) => [
            ...prev,
            { id, role: "user", text, final: true, timestamp: Date.now() },
          ]);
          onUserFinalRef.current?.(text);
        }
        // Now that we have validated speech, ask Lucas to respond.
        requestResponse();
        break;
      }
      case "response.created": {
        currentAssistantIdRef.current = ev.response?.id ?? `a_${Date.now()}`;
        interruptedRef.current = false;
        assistantAudioStartedAtRef.current = null;
        assistantTranscriptFlushedRef.current = false;
        firstAudioDeltaSeenRef.current = false;
        responseInProgressRef.current = true;
        clearWatchdog();
        setResponseError(null);
        setState("fred-thinking");
        setPartialAssistant("");
        console.log("[voice-event] response.created", {
          at: new Date().toISOString(),
          responseId: currentAssistantIdRef.current,
        });
        break;
      }
      case "response.output_audio.delta":
      case "response.audio.delta": {
        const audio = audioElRef.current;
        if (!firstAudioDeltaSeenRef.current) {
          firstAudioDeltaSeenRef.current = true;
          assistantAudioStartedAtRef.current = Date.now();
          console.log("[voice-event] first response.output_audio.delta", {
            at: new Date().toISOString(),
            responseId: currentAssistantIdRef.current,
          });
        }
        if (audio) {
          markAudioPlayable(audio);
          if (DEV) {
            console.log("[voice-audio]", {
              at: new Date().toISOString(),
              paused: audio.paused,
              muted: audio.muted,
              volume: audio.volume,
              readyState: audio.readyState,
              networkState: audio.networkState,
              hasSrcObject: Boolean(audio.srcObject),
            });
          }
          if (audio.paused) {
            void audio.play().then(() => {
              setAudioBlocked(false);
            }).catch((error) => {
              console.warn("[voice] failed to resume remote audio", error);
              setAudioBlocked(true);
            });
          } else {
            setAudioBlocked(false);
          }
          schedulePlaybackCheck();
        }
        if (stateRef.current !== "fred-speaking") {
          stateRef.current = "fred-speaking";
          setState("fred-speaking");
        }
        beginMouthMotion();
        break;
      }
      case "response.output_audio.done":
      case "response.audio.done": {
        // audio stream ended; keep state until response.done for transcript flush
        stopMouthMotion();
        break;
      }
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        if (ev.delta) {
          setPartialAssistant((p) => p + ev.delta);
          schedulePlaybackCheck();
        }
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const text = (ev.transcript ?? partialAssistantRef.current ?? "").trim();
        setPartialAssistant("");
        if (text && !assistantTranscriptFlushedRef.current) {
          flushAssistantFinal(text, assistantFlushKey(ev));
          assistantTranscriptFlushedRef.current = true;
        }
        break;
      }
      case "response.done":
      case "response.cancelled": {
        console.log(`[voice-event] ${ev.type}`, {
          at: new Date().toISOString(),
          responseId: currentAssistantIdRef.current,
          transcriptFlushed: assistantTranscriptFlushedRef.current,
        });
        const pending = partialAssistantRef.current.trim();
        if (!assistantTranscriptFlushedRef.current && pending.length > 0) {
          setPartialAssistant("");
          flushAssistantFinal(pending, assistantFlushKey(ev));
          assistantTranscriptFlushedRef.current = true;
        } else if (pending.length > 0) {
          setPartialAssistant("");
        }
        currentAssistantIdRef.current = null;
        interruptedRef.current = false;
        assistantAudioStartedAtRef.current = null;
        firstAudioDeltaSeenRef.current = false;
        responseInProgressRef.current = false;
        stopMouthMotion();
        clearWatchdog();
        clearPlaybackCheck();
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
          setResponseError("Lucas teve um problema para responder. Toque para tentar novamente.");
          setState("listening");
        }
        break;
      }
      default:
        break;
    }
  }, [assistantFlushKey, flushAssistantFinal, requestResponse, clearWatchdog, clearPlaybackCheck, markAudioPlayable, schedulePlaybackCheck, beginMouthMotion, stopMouthMotion]);

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
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (DEV) {
          const track = stream.getAudioTracks()[0];
          console.log("[voice-mic-settings]", track?.getSettings());
        }
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
        audioEl.muted = false;
        audioEl.volume = 1;
        audioEl.setAttribute("playsinline", "");
        audioEl.setAttribute("webkit-playsinline", "");
        audioEl.style.position = "fixed";
        audioEl.style.width = "1px";
        audioEl.style.height = "1px";
        audioEl.style.opacity = "0";
        audioEl.style.pointerEvents = "none";
        if (DEV) {
          audioEl.onplay = () => console.log("[voice-audio] play");
          audioEl.onpause = () => console.log("[voice-audio] pause", { at: new Date().toISOString() });
          audioEl.onplaying = () => console.log("[voice-audio] playing", { at: new Date().toISOString() });
          audioEl.onwaiting = () => console.log("[voice-audio] waiting");
          audioEl.onstalled = () => console.log("[voice-audio] stalled");
          audioEl.onerror = (event) => console.error("[voice-audio] error", event);
        }
        audioEl.addEventListener("playing", () => {
          lastAudioPlayingAtRef.current = Date.now();
          setAudioBlocked(false);
        });
        document.body.appendChild(audioEl);
        audioElRef.current = audioEl;
      }
      pc.ontrack = (e) => {
        if (!audioEl) return;
        const remote = e.streams[0];
        audioEl.srcObject = remote;
        markAudioPlayable(audioEl);
        void audioEl.play().then(() => {
          lastAudioPlayingAtRef.current = Date.now();
          setAudioBlocked(false);
        }).catch((err) => {
          console.warn("[voice] initial play blocked", err);
          setAudioBlocked(true);
        });
        // Start analysing Lucas's outbound stream for mouth-sync.
        startMouthAnalyser(remote);
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
  }, [getSession, supported, handleEvent, sendEvent, cleanup, markAudioPlayable]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      return next;
    });
  }, []);

  const resumeAudio = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    markAudioPlayable(audio);
    void audio.play().then(() => {
      lastAudioPlayingAtRef.current = Date.now();
      setAudioBlocked(false);
    }).catch((err) => {
      console.warn("[voice] resumeAudio failed", err);
      setAudioBlocked(true);
    });
  }, [markAudioPlayable]);

  return {
    state,
    errorMsg,
    responseError,
    audioBlocked,
    muted,
    turns,
    partialUser,
    partialAssistant,
    mouthLevel,
    supported,
    start,
    stop,
    toggleMute,
    retryResponse,
    resumeAudio,
  };
}
