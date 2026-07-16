// Server-only helpers for Mercado Pago Preapproval (subscriptions).
// This file's `.server.ts` extension prevents it from being bundled to the client.

export const MP_PREAPPROVAL_PLAN_ID = "045a59c7e71441efb447e2ebee2bb2bf";
export const MP_BACK_URL = "https://talkwithfred.live/assinatura/retorno";
export const MP_BASE_URL = "https://api.mercadopago.com";

export type MpPreapproval = {
  id: string;
  status: string;
  preapproval_plan_id?: string | null;
  payer_email?: string | null;
  external_reference?: string | null;
  init_point?: string | null;
  next_payment_date?: string | null;
  date_created?: string | null;
  last_modified?: string | null;
  summarized?: {
    last_charged_date?: string | null;
    last_charged_amount?: number | null;
    charged_quantity?: number | null;
  } | null;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  } | null;
};

export type MpPreapprovalPlan = {
  id: string;
  status?: string;
  reason?: string;
  application_id?: number | string;
  collector_id?: number | string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
  } | null;
};

export type MpPayment = {
  id: number | string;
  status: string;
  status_detail?: string | null;
  date_approved?: string | null;
  date_created?: string | null;
  transaction_amount?: number | null;
  external_reference?: string | null;
  metadata?: { preapproval_id?: string | null } | null;
};

/**
 * Rich error thrown by mpFetch. Carries HTTP status + parsed body so callers
 * can produce a friendly, specific message instead of "Mercado Pago 400".
 */
export class MercadoPagoApiError extends Error {
  status: number;
  code: string | null;
  mpMessage: string | null;
  cause_: unknown;
  bodyText: string;
  constructor(opts: {
    status: number;
    code: string | null;
    mpMessage: string | null;
    cause: unknown;
    bodyText: string;
    friendly: string;
  }) {
    super(opts.friendly);
    this.name = "MercadoPagoApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.mpMessage = opts.mpMessage;
    this.cause_ = opts.cause;
    this.bodyText = opts.bodyText;
  }
}

export function readAccessToken(): { token: string | null; prefix: string | null; length: number; trimmed_diff: number } {
  const raw = process.env.MERCADO_PAGO_ACCESS_TOKEN ?? null;
  if (!raw) return { token: null, prefix: null, length: 0, trimmed_diff: 0 };
  const trimmed = raw.trim();
  return {
    token: trimmed,
    prefix: trimmed.slice(0, 8),
    length: trimmed.length,
    trimmed_diff: raw.length - trimmed.length,
  };
}

function accessToken(): string {
  const { token } = readAccessToken();
  if (!token) throw new Error("MERCADO_PAGO_ACCESS_TOKEN não configurado no servidor.");
  return token;
}

function friendlyFromMp(status: number, code: string | null, mpMessage: string | null): string {
  if (status === 401 || status === 403) {
    return "A credencial do Mercado Pago é inválida ou não pertence à conta que criou o plano.";
  }
  if (status === 404) {
    return "Plano de assinatura não encontrado no Mercado Pago.";
  }
  const msg = (mpMessage ?? "").toLowerCase();
  if (msg.includes("payer") && msg.includes("email")) {
    return "O e-mail do assinante é inválido para o Mercado Pago.";
  }
  if (msg.includes("collector") || msg.includes("application")) {
    return "A credencial não pertence à mesma conta que criou o plano.";
  }
  if (status === 400) {
    return mpMessage
      ? `Mercado Pago recusou a solicitação: ${mpMessage}`
      : "O Mercado Pago recusou um campo da solicitação.";
  }
  return mpMessage ? `Mercado Pago: ${mpMessage}` : `Mercado Pago retornou HTTP ${status}.`;
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${MP_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      /* not JSON */
    }
    const causeArr = Array.isArray(parsed?.cause) ? (parsed?.cause as Array<{ description?: string; code?: string | number }>) : null;
    const mpMessage =
      (parsed?.message as string | undefined) ??
      (causeArr?.[0]?.description ?? null);
    const codeRaw = (parsed?.code as string | number | undefined) ?? causeArr?.[0]?.code ?? null;
    const code = codeRaw != null ? String(codeRaw) : null;
    console.error(
      "[mercado-pago]",
      path,
      "status=" + resp.status,
      "code=" + (code ?? "-"),
      "message=" + (mpMessage ?? "-"),
      "body=" + text.slice(0, 800),
    );
    throw new MercadoPagoApiError({
      status: resp.status,
      code: code ? String(code) : null,
      mpMessage: mpMessage ?? null,
      cause: parsed?.cause ?? null,
      bodyText: text.slice(0, 800),
      friendly: friendlyFromMp(resp.status, code ? String(code) : null, mpMessage),
    });
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function mpGetPreapprovalPlan(id: string): Promise<MpPreapprovalPlan> {
  return mpFetch<MpPreapprovalPlan>(`/preapproval_plan/${encodeURIComponent(id)}`);
}

/**
 * Build the hosted-checkout URL for our plan. The redirect-based flow does NOT
 * hit POST /preapproval directly — MP requires a `card_token_id` there. Instead
 * we send the user to MP's checkout, they enter card + email, and MP creates
 * the preapproval and calls our webhook.
 */
export function buildCheckoutUrl(input: {
  externalReference: string;
  payerEmail?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("preapproval_plan_id", MP_PREAPPROVAL_PLAN_ID);
  params.set("external_reference", input.externalReference);
  params.set("back_url", MP_BACK_URL);
  if (input.payerEmail) params.set("payer_email", input.payerEmail);
  return `https://www.mercadopago.com.br/subscriptions/checkout?${params.toString()}`;
}

export async function mpGetPreapproval(id: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`);
}

export async function mpCancelPreapproval(id: string): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>(`/preapproval/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

export async function mpGetPayment(id: string | number): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${id}`);
}

/** Map raw Mercado Pago preapproval status to our internal status. */
export function normalizeStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").toLowerCase();
  if (s === "authorized" || s === "active") return "authorized";
  if (s === "pending") return "pending";
  if (s === "paused") return "paused";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "past_due" || s === "payment_required") return "past_due";
  return s || "pending";
}

/** Whether a status grants product access. */
export function isActiveStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "authorized" || s === "active";
}
