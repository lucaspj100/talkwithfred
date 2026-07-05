import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DiagSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  areas: z.array(z.string().max(40)).max(15).default([]),
  other_area: z.string().trim().max(120).optional().nullable(),
  goal: z.string().max(40).optional().nullable(),
  level: z.string().max(40).optional().nullable(),
  main_block: z.string().max(40).optional().nullable(),
  already_lost_opportunity: z.string().max(40).optional().nullable(),
});

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((data) => DiagSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const primaryArea = data.areas[0] ?? null;
    const { data: row, error } = await supabaseAdmin
      .from("leads")
      .insert({
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp ?? null,
        // Keep legacy `area` populated with the first selection for backwards compat.
        area: primaryArea,
        areas: data.areas,
        other_area: data.other_area ?? null,
        goal: data.goal ?? null,
        level: data.level ?? null,
        main_block: data.main_block ?? null,
        already_lost_opportunity: data.already_lost_opportunity ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { leadId: (row as { id: string }).id };
  });

export const updateLeadSimulation = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ leadId: z.string().uuid(), summary: z.string().max(4000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ simulation_summary: data.summary })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markLeadConverted = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ leadId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ converted_to_whatsapp: true, status: "contacted" } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin ----------

type AuthCtx = { supabase: { from: (t: string) => { select: (c: string) => { eq: (a: string, b: string) => { eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } } }; userId: string };

async function ensureAdmin(context: unknown): Promise<void> {
  const ctx = context as AuthCtx;
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export type AdminLead = {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  areas: string[];
  other_area: string | null;
  area: string | null;
  goal: string | null;
  level: string | null;
  main_block: string | null;
  already_lost_opportunity: string | null;
  simulation_summary: string | null;
  converted_to_whatsapp: boolean;
  status: string;
  source: string;
  created_at: string;
};

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminLead[]> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        name: String(row.name ?? ""),
        email: String(row.email ?? ""),
        whatsapp: (row.whatsapp as string | null) ?? null,
        areas: (row.areas as string[] | null) ?? [],
        other_area: (row.other_area as string | null) ?? null,
        area: (row.area as string | null) ?? null,
        goal: (row.goal as string | null) ?? null,
        level: (row.level as string | null) ?? null,
        main_block: (row.main_block as string | null) ?? null,
        already_lost_opportunity: (row.already_lost_opportunity as string | null) ?? null,
        simulation_summary: (row.simulation_summary as string | null) ?? null,
        converted_to_whatsapp: Boolean(row.converted_to_whatsapp),
        status: String(row.status ?? "new"),
        source: String(row.source ?? "simulacao"),
        created_at: String(row.created_at),
      };
    });
  });

export const LEAD_STATUSES = [
  { value: "new", label: "Novo" },
  { value: "contacted", label: "Chamado no WhatsApp" },
  { value: "answered", label: "Respondeu" },
  { value: "interview_scheduled", label: "Entrevista agendada" },
  { value: "interview_done", label: "Entrevista realizada" },
  { value: "enrolled", label: "Matriculado" },
  { value: "lost", label: "Perdido" },
] as const;

export type LeadStatus = typeof LEAD_STATUSES[number]["value"];

export const updateLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      leadId: z.string().uuid(),
      status: z.enum(LEAD_STATUSES.map((s) => s.value) as [string, ...string[]]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ status: data.status } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
