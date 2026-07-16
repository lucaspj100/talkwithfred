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

function accessToken(): string {
  const t = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!t) throw new Error("MERCADO_PAGO_ACCESS_TOKEN not configured");
  return t;
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
    console.error("[mercado-pago]", path, resp.status, text.slice(0, 500));
    throw new Error(`Mercado Pago ${resp.status}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function mpCreatePreapproval(input: {
  payerEmail: string;
  externalReference: string;
}): Promise<MpPreapproval> {
  return mpFetch<MpPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      preapproval_plan_id: MP_PREAPPROVAL_PLAN_ID,
      payer_email: input.payerEmail,
      external_reference: input.externalReference,
      back_url: MP_BACK_URL,
    }),
  });
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
