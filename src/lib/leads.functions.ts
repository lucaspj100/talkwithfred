import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DiagSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  area: z.string().max(40).optional().nullable(),
  goal: z.string().max(40).optional().nullable(),
  level: z.string().max(40).optional().nullable(),
  main_block: z.string().max(40).optional().nullable(),
  already_lost_opportunity: z.string().max(40).optional().nullable(),
});

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((data) => DiagSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("leads")
      .insert({
        name: data.name,
        email: data.email,
        whatsapp: data.whatsapp ?? null,
        area: data.area ?? null,
        goal: data.goal ?? null,
        level: data.level ?? null,
        main_block: data.main_block ?? null,
        already_lost_opportunity: data.already_lost_opportunity ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { leadId: row.id as string };
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
      .update({ converted_to_whatsapp: true })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
