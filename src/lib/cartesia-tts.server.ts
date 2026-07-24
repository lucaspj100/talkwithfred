// Cartesia Sonic streaming TTS. Opens an outbound WebSocket to Cartesia
// from the Worker, streams MP3 chunks back to the caller as a ReadableStream,
// and returns null on any failure so the caller can fall back to another
// provider (e.g. openai/gpt-4o-mini-tts) without interrupting the user.
//
// Cost model: Cartesia bills per CHARACTER, not per token. We surface the
// character count via `input_text_tokens` when recording usage (see the
// pricing row in ai_model_pricing for provider = 'cartesia').

export const CARTESIA_MODEL = "cartesia/sonic-3";
// Warm, friendly male English voice — override via env if you want a different one.
const DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";
const CARTESIA_VERSION = "2025-04-16";
const FIRST_CHUNK_TIMEOUT_MS = 3500;

type OpenResult = { stream: ReadableStream<Uint8Array>; model: string } | null;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Opens a Cartesia WebSocket, requests MP3 streaming synthesis for `text`,
 * and returns a ReadableStream of MP3 bytes. Returns null on any failure
 * before the first audio chunk arrives so the caller can transparently
 * fall back to another TTS provider.
 */
export async function openCartesiaMp3Stream(text: string): Promise<OpenResult> {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) return null;

  const url =
    `https://api.cartesia.ai/tts/websocket` +
    `?api_key=${encodeURIComponent(key)}` +
    `&cartesia_version=${encodeURIComponent(CARTESIA_VERSION)}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Upgrade: "websocket" } });
  } catch (e) {
    console.warn("[cartesia] connect failed", e);
    return null;
  }
  // workerd exposes the upgraded socket on Response.webSocket.
  const ws = (resp as unknown as { webSocket?: WebSocket }).webSocket;
  if (!ws) {
    console.warn("[cartesia] no webSocket on upgrade response", resp.status);
    return null;
  }
  try {
    (ws as unknown as { accept: () => void }).accept();
  } catch (e) {
    console.warn("[cartesia] ws.accept failed", e);
    return null;
  }

  const voiceId = process.env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID;
  const payload = {
    model_id: "sonic-3",
    transcript: text,
    voice: { mode: "id", id: voiceId },
    output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    language: "en",
    context_id: crypto.randomUUID(),
    continue: false,
    add_timestamps: false,
  };

  try {
    ws.send(JSON.stringify(payload));
  } catch (e) {
    console.warn("[cartesia] send failed", e);
    try { ws.close(); } catch { /* ignore */ }
    return null;
  }

  // Wait for the first audio chunk to confirm the request is healthy.
  // If it doesn't arrive quickly, treat this as a failure and fall back.
  const firstChunk = await new Promise<Uint8Array | null>((resolve) => {
    let settled = false;
    const finish = (v: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeEventListener("message", onMsg as EventListener);
      ws.removeEventListener("error", onErr as EventListener);
      ws.removeEventListener("close", onErr as EventListener);
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), FIRST_CHUNK_TIMEOUT_MS);
    const onMsg = (ev: MessageEvent) => {
      try {
        const raw =
          typeof ev.data === "string"
            ? ev.data
            : new TextDecoder().decode(ev.data as ArrayBuffer);
        const msg = JSON.parse(raw);
        if ((msg.type === "chunk" || msg.type === "audio") && msg.data) {
          finish(b64ToBytes(msg.data));
        } else if (msg.type === "error") {
          console.warn("[cartesia] upstream error", msg);
          finish(null);
        } else if (msg.type === "done") {
          // Ended before producing audio — treat as failure.
          finish(null);
        }
      } catch {
        /* keep waiting for the next frame */
      }
    };
    const onErr = () => finish(null);
    ws.addEventListener("message", onMsg as EventListener);
    ws.addEventListener("error", onErr as EventListener);
    ws.addEventListener("close", onErr as EventListener);
  });

  if (!firstChunk) {
    try { ws.close(); } catch { /* ignore */ }
    return null;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(firstChunk);
      const onMsg = (ev: MessageEvent) => {
        try {
          const raw =
            typeof ev.data === "string"
              ? ev.data
              : new TextDecoder().decode(ev.data as ArrayBuffer);
          const msg = JSON.parse(raw);
          if ((msg.type === "chunk" || msg.type === "audio") && msg.data) {
            controller.enqueue(b64ToBytes(msg.data));
          } else if (msg.type === "done") {
            try { controller.close(); } catch { /* ignore */ }
            try { ws.close(); } catch { /* ignore */ }
          } else if (msg.type === "error") {
            console.warn("[cartesia] mid-stream error", msg);
            try { controller.error(new Error(msg.message || "cartesia_error")); } catch { /* ignore */ }
            try { ws.close(); } catch { /* ignore */ }
          }
        } catch (e) {
          try { controller.error(e); } catch { /* ignore */ }
        }
      };
      ws.addEventListener("message", onMsg as EventListener);
      ws.addEventListener("close", () => {
        try { controller.close(); } catch { /* ignore */ }
      });
      ws.addEventListener("error", () => {
        try { controller.error(new Error("cartesia_ws_error")); } catch { /* ignore */ }
      });
    },
    cancel() {
      try { ws.close(); } catch { /* ignore */ }
    },
  });

  return { stream, model: CARTESIA_MODEL };
}
